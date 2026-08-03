import type { DB, TipoBatidaPonto } from "../types";
import { somenteDigitosCpf } from "./rh";
import { importarBatidasPonto } from "./ponto-rh";

/** Marcação bruta extraída do AFD (ainda sem pessoa_id / tipo entrada-saída). */
export interface MarcacaoAfd {
  nsr: string;
  cpf: string;
  data: string; // YYYY-MM-DD
  hora: string; // HH:MM
  layout: "671" | "1510";
}

export interface ResultadoParseAfd {
  sucesso: boolean;
  marcacoes: MarcacaoAfd[];
  layoutDetectado: "671" | "1510" | "misto" | "desconhecido";
  erros: string[];
  avisos: string[];
}

/**
 * Parseia AFD texto (Control iD / Portaria 671 tipo 3, e legado 1510 tipo 3).
 * Tipo 7 (REP-P) é lido quando o layout de data/hora+CPF for reconhecível.
 */
export function parseAfdTexto(texto: string): ResultadoParseAfd {
  const linhas = texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const marcacoes: MarcacaoAfd[] = [];
  const avisos: string[] = [];
  const erros: string[] = [];
  let qtd671 = 0;
  let qtd1510 = 0;

  for (const linha of linhas) {
    if (linha.length < 10) continue;
    const tipo = linha[9];
    if (tipo !== "3" && tipo !== "7") continue;

    const nsr = linha.slice(0, 9).trim();
    const restante = linha.slice(10);

    // Portaria 671: DH 24 + CPF 12
    const m671 = restante.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4})(.{12})/);
    if (m671) {
      const dh = m671[1]!;
      const cpfCampo = m671[2]!;
      const data = dh.slice(0, 10);
      const hora = dh.slice(11, 16);
      const cpf = normalizarCpfCampo(cpfCampo);
      if (cpf.length === 11) {
        marcacoes.push({ nsr, cpf, data, hora, layout: "671" });
        qtd671 += 1;
      } else {
        avisos.push(`NSR ${nsr}: CPF inválido no AFD 671.`);
      }
      continue;
    }

    // Legado 1510: PIS 12 + DDMMAAAA + HHMM
    if (restante.length >= 12 + 8 + 4) {
      const pisOuCpf = restante.slice(0, 12);
      const ddmmyyyy = restante.slice(12, 20);
      const hhmm = restante.slice(20, 24);
      if (/^\d{8}$/.test(ddmmyyyy) && /^\d{4}$/.test(hhmm)) {
        const data = `${ddmmyyyy.slice(4, 8)}-${ddmmyyyy.slice(2, 4)}-${ddmmyyyy.slice(0, 2)}`;
        const hora = `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;
        const cpf = normalizarCpfCampo(pisOuCpf);
        // No legado o campo é PIS; se tiver 11 dígitos úteis, tentamos casar como CPF.
        if (cpf.length === 11) {
          marcacoes.push({ nsr, cpf, data, hora, layout: "1510" });
          qtd1510 += 1;
        } else {
          avisos.push(
            `NSR ${nsr}: marcação legada sem CPF de 11 dígitos (PIS ${pisOuCpf.trim()}). Cadastre CPF na pessoa ou use AFD mode=671.`
          );
        }
        continue;
      }
    }

    avisos.push(`NSR ${nsr}: linha tipo ${tipo} não reconhecida.`);
  }

  if (marcacoes.length === 0 && linhas.length > 0) {
    erros.push("Nenhuma marcação de ponto reconhecida no arquivo.");
  }

  const layoutDetectado =
    qtd671 > 0 && qtd1510 > 0 ? "misto" : qtd671 > 0 ? "671" : qtd1510 > 0 ? "1510" : "desconhecido";

  return {
    sucesso: erros.length === 0,
    marcacoes,
    layoutDetectado,
    erros,
    avisos,
  };
}

function normalizarCpfCampo(campo: string): string {
  const digitos = somenteDigitosCpf(campo);
  // Campo AFD tem 12 posições; CPF com zero à esquerda ou espaço.
  if (digitos.length === 11) return digitos;
  if (digitos.length === 12 && digitos.startsWith("0")) return digitos.slice(1);
  if (digitos.length > 11) return digitos.slice(-11);
  return digitos;
}

/** Alterna entrada/saída pela ordem cronológica do dia (AFD não traz o tipo). */
export function inferirTiposBatidas(
  marcacoes: Array<{ data: string; hora: string; cpf: string }>
): Array<{ data: string; hora: string; cpf: string; tipo: TipoBatidaPonto }> {
  const porChave = new Map<string, Array<{ data: string; hora: string; cpf: string }>>();
  for (const m of marcacoes) {
    const key = `${m.cpf}|${m.data}`;
    const lista = porChave.get(key) ?? [];
    lista.push(m);
    porChave.set(key, lista);
  }
  const saida: Array<{ data: string; hora: string; cpf: string; tipo: TipoBatidaPonto }> = [];
  for (const lista of Array.from(porChave.values())) {
    lista.sort((a, b) => a.hora.localeCompare(b.hora) || a.data.localeCompare(b.data));
    lista.forEach((m, i) => {
      saida.push({ ...m, tipo: i % 2 === 0 ? "entrada" : "saida" });
    });
  }
  return saida;
}

export interface ResultadoImportarAfd {
  sucesso: boolean;
  marcacoesLidas: number;
  importadas: number;
  semPessoa: number;
  cpfsSemCadastro: string[];
  layoutDetectado: ResultadoParseAfd["layoutDetectado"];
  erros: string[];
  avisos: string[];
}

/**
 * Lê AFD, casa CPF com pessoas do RH e grava batidas (origem relógio).
 */
export function importarAfdNoDb(
  db: DB,
  textoAfd: string,
  opcoes: { agora?: string; idFactory?: () => string } = {}
): ResultadoImportarAfd {
  const parse = parseAfdTexto(textoAfd);
  if (!parse.sucesso && parse.marcacoes.length === 0) {
    return {
      sucesso: false,
      marcacoesLidas: 0,
      importadas: 0,
      semPessoa: 0,
      cpfsSemCadastro: [],
      layoutDetectado: parse.layoutDetectado,
      erros: parse.erros,
      avisos: parse.avisos,
    };
  }

  const porCpf = new Map<string, string>();
  for (const p of db.pessoas ?? []) {
    const cpf = somenteDigitosCpf(p.cpf ?? "");
    if (cpf.length === 11) porCpf.set(cpf, p.id);
  }

  const comTipo = inferirTiposBatidas(parse.marcacoes);
  const batidas: Array<{ pessoa_id: string; data: string; hora: string; tipo: TipoBatidaPonto }> = [];
  const semCadastro = new Set<string>();

  for (const m of comTipo) {
    const pessoaId = porCpf.get(m.cpf);
    if (!pessoaId) {
      semCadastro.add(m.cpf);
      continue;
    }
    batidas.push({
      pessoa_id: pessoaId,
      data: m.data,
      hora: m.hora,
      tipo: m.tipo,
    });
  }

  const imp = importarBatidasPonto(db, batidas, opcoes);
  const avisos = [...parse.avisos];
  const cpfsSemCadastro = Array.from(semCadastro);
  if (cpfsSemCadastro.length) {
    avisos.push(
      `${cpfsSemCadastro.length} CPF(s) no AFD sem pessoa cadastrada no RH: ${cpfsSemCadastro.slice(0, 5).join(", ")}${
        cpfsSemCadastro.length > 5 ? "…" : ""
      }.`
    );
  }

  return {
    sucesso: true,
    marcacoesLidas: parse.marcacoes.length,
    importadas: imp.importadas,
    semPessoa: cpfsSemCadastro.length,
    cpfsSemCadastro,
    layoutDetectado: parse.layoutDetectado,
    erros: [],
    avisos,
  };
}
