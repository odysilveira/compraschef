import type {
  DB,
  ExtratoImportacao,
  ExtratoLinha,
  OrigemExtrato,
  StatusExtratoLinha,
} from "../types";
import {
  aplicarMatchesExtrato,
  sugerirMatchesExtrato,
  type AlvoMatchExtrato,
  type SugestaoMatchExtrato,
} from "./conciliar-extrato";
import { debitosDoExtrato, parseOfx, type LinhaExtrato } from "./extrato-ofx";
import { parseCsvExtrato } from "./extrato-csv";

export type FiltroStatusExtratoLinha = "abertas" | "conciliadas" | "ignoradas" | "todas";

export function parseFiltroStatusExtratoLinha(
  valor: string | null | undefined
): FiltroStatusExtratoLinha {
  if (valor === "conciliadas" || valor === "ignoradas" || valor === "todas") return valor;
  return "abertas";
}

export function statusExtratoLinhaDeFiltro(
  filtro: FiltroStatusExtratoLinha
): StatusExtratoLinha | null {
  if (filtro === "abertas") return "aberta";
  if (filtro === "conciliadas") return "conciliada";
  if (filtro === "ignoradas") return "ignorada";
  return null;
}

export function filtrarLinhasExtrato(
  linhas: ExtratoLinha[],
  filtro: FiltroStatusExtratoLinha
): ExtratoLinha[] {
  const status = statusExtratoLinhaDeFiltro(filtro);
  if (!status) return [...linhas];
  return linhas.filter((l) => l.status === status);
}

/** Conta débitos abertos (ainda sem match confirmado / não ignorados). */
export function contarDebitosExtratoAbertos(db: Pick<DB, "extrato_linhas">): number {
  return (db.extrato_linhas ?? []).filter(
    (l) => l.status === "aberta" && (l.tipo === "debito" || l.valor < 0)
  ).length;
}

export function rotuloOrigemExtrato(origem: OrigemExtrato): string {
  return origem === "csv" ? "CSV" : "OFX";
}

/** Importações mais recentes primeiro. */
export function listarImportacoesExtrato(
  db: Pick<DB, "extrato_importacoes">
): ExtratoImportacao[] {
  return [...(db.extrato_importacoes ?? [])].sort((a, b) =>
    b.importado_em.localeCompare(a.importado_em)
  );
}

export function ultimaImportacaoExtrato(
  db: Pick<DB, "extrato_importacoes">
): ExtratoImportacao | null {
  return listarImportacoesExtrato(db)[0] ?? null;
}

/** Boletos + RH em aguardando conciliação (candidatos de match). */
export function contarTitulosAguardandoConciliacao(
  db: Pick<DB, "boletos" | "pagamentos_pessoas">
): number {
  const boletos = (db.boletos ?? []).filter((b) => b.status === "aguardando_conciliacao").length;
  const rh = (db.pagamentos_pessoas ?? []).filter((p) => p.status === "aguardando_conciliacao")
    .length;
  return boletos + rh;
}

export function linhaPersistidaParaMatch(linha: ExtratoLinha): LinhaExtrato {
  return {
    data: linha.data,
    valor: linha.valor,
    tipo: linha.tipo,
    descricao: linha.descricao,
    fitid: linha.fitid,
  };
}

export interface SugestaoMatchExtratoPersistido extends Omit<SugestaoMatchExtrato, "linha"> {
  linha: ExtratoLinha;
}

/**
 * Sugere matches só para débitos com status `aberta`.
 */
export function sugerirMatchesLinhasPersistidas(
  db: Pick<DB, "boletos" | "pagamentos_pessoas" | "pessoas" | "fornecedores" | "notas_fiscais" | "extrato_linhas">,
  opcoes: { toleranciaValor?: number; janelaDias?: number; linhaIds?: string[] } = {}
): SugestaoMatchExtratoPersistido[] {
  const candidatas = (db.extrato_linhas ?? []).filter((l) => {
    if (l.status !== "aberta") return false;
    if (!(l.tipo === "debito" || l.valor < 0)) return false;
    if (opcoes.linhaIds && !opcoes.linhaIds.includes(l.id)) return false;
    return true;
  });
  const porChave = new Map<string, ExtratoLinha>(
    candidatas.map((l) => [`${l.fitid ?? ""}|${l.data}|${l.valor}|${l.descricao}`, l])
  );
  const sugestoes = sugerirMatchesExtrato(
    db,
    candidatas.map(linhaPersistidaParaMatch),
    opcoes
  );
  const usados = new Set<string>();
  const saida: SugestaoMatchExtratoPersistido[] = [];
  for (const s of sugestoes) {
    const chave = `${s.linha.fitid ?? ""}|${s.linha.data}|${s.linha.valor}|${s.linha.descricao}`;
    let persistida = porChave.get(chave);
    if (persistida && usados.has(persistida.id)) persistida = undefined;
    if (!persistida) {
      persistida = candidatas.find(
        (l) =>
          !usados.has(l.id) &&
          l.data === s.linha.data &&
          l.valor === s.linha.valor &&
          l.descricao === s.linha.descricao
      );
    }
    if (!persistida) continue;
    usados.add(persistida.id);
    saida.push({
      ...s,
      linha: persistida,
    });
  }
  return saida.sort((a, b) => a.linha.data.localeCompare(b.linha.data));
}

export interface ResultadoImportacaoExtrato {
  sucesso: boolean;
  erros: string[];
  importacao?: ExtratoImportacao;
  criadas: number;
  ignoradas_duplicadas: number;
}

function fitidJaExiste(
  linhas: ExtratoLinha[],
  fitid: string | undefined,
  contaId: string | undefined
): boolean {
  if (!fitid) return false;
  const conta = contaId ?? "";
  return linhas.some((l) => l.fitid === fitid && (l.conta_bancaria_id ?? "") === conta);
}

/**
 * Grava linhas parseadas no DB (dedupe por fitid + conta).
 * Não altera títulos — só persiste o extrato.
 */
export function importarLinhasExtrato(
  db: DB,
  linhas: LinhaExtrato[],
  dados: {
    origem: OrigemExtrato;
    arquivo_nome: string;
    conta_bancaria_id?: string;
    importado_por?: string;
    agora?: string;
    idFactory?: () => string;
  }
): ResultadoImportacaoExtrato {
  if (!Array.isArray(db.extrato_importacoes)) db.extrato_importacoes = [];
  if (!Array.isArray(db.extrato_linhas)) db.extrato_linhas = [];

  if (linhas.length === 0) {
    return { sucesso: false, erros: ["Nenhuma movimentação para importar."], criadas: 0, ignoradas_duplicadas: 0 };
  }

  const agora = dados.agora ?? new Date().toISOString();
  const gen = dados.idFactory ?? (() => `ext-${Math.random().toString(36).slice(2, 10)}`);
  const importacaoId = gen();
  let criadas = 0;
  let ignoradas = 0;
  const novas: ExtratoLinha[] = [];

  for (const raw of linhas) {
    if (fitidJaExiste(db.extrato_linhas, raw.fitid, dados.conta_bancaria_id)) {
      ignoradas += 1;
      continue;
    }
    if (fitidJaExiste(novas, raw.fitid, dados.conta_bancaria_id)) {
      ignoradas += 1;
      continue;
    }
    novas.push({
      id: gen(),
      importacao_id: importacaoId,
      conta_bancaria_id: dados.conta_bancaria_id,
      data: raw.data,
      valor: raw.valor,
      tipo: raw.tipo,
      descricao: raw.descricao,
      fitid: raw.fitid,
      status: "aberta",
    });
    criadas += 1;
  }

  // Recontar duplicadas contra fitids já no DB com mesma conta
  // (já feito acima)

  if (criadas === 0) {
    return {
      sucesso: false,
      erros: [
        ignoradas > 0
          ? "Todas as movimentações já estavam no extrato (mesmo FITID)."
          : "Nenhuma linha nova para importar.",
      ],
      criadas: 0,
      ignoradas_duplicadas: ignoradas,
    };
  }

  const debitos = debitosDoExtrato(novas.map(linhaPersistidaParaMatch)).length;
  const importacao: ExtratoImportacao = {
    id: importacaoId,
    conta_bancaria_id: dados.conta_bancaria_id,
    origem: dados.origem,
    arquivo_nome: dados.arquivo_nome.trim() || "extrato",
    importado_em: agora,
    importado_por: dados.importado_por ?? "usuário local",
    linhas_total: criadas,
    debitos,
  };

  db.extrato_importacoes.push(importacao);
  db.extrato_linhas.push(...novas);

  return {
    sucesso: true,
    erros: [],
    importacao,
    criadas,
    ignoradas_duplicadas: ignoradas,
  };
}

export function importarExtratoOfx(
  db: DB,
  textoOfx: string,
  dados: {
    arquivo_nome: string;
    conta_bancaria_id?: string;
    importado_por?: string;
    agora?: string;
    idFactory?: () => string;
  }
): ResultadoImportacaoExtrato {
  const parseado = parseOfx(textoOfx);
  if (!parseado.ok) {
    return { sucesso: false, erros: [parseado.erro], criadas: 0, ignoradas_duplicadas: 0 };
  }
  return importarLinhasExtrato(db, parseado.linhas, {
    ...dados,
    origem: "ofx",
  });
}

export function importarExtratoCsv(
  db: DB,
  textoCsv: string,
  dados: {
    arquivo_nome: string;
    conta_bancaria_id?: string;
    importado_por?: string;
    agora?: string;
    idFactory?: () => string;
  }
): ResultadoImportacaoExtrato {
  const parseado = parseCsvExtrato(textoCsv);
  if (!parseado.ok) {
    return { sucesso: false, erros: [parseado.erro], criadas: 0, ignoradas_duplicadas: 0 };
  }
  return importarLinhasExtrato(db, parseado.linhas, {
    ...dados,
    origem: "csv",
  });
}

export function ignorarLinhasExtrato(
  db: DB,
  linhaIds: string[],
  opcoes: { observacao?: string } = {}
): { sucesso: boolean; ignoradas: number; erros: string[] } {
  if (!Array.isArray(db.extrato_linhas)) db.extrato_linhas = [];
  let ignoradas = 0;
  const erros: string[] = [];
  for (const id of linhaIds) {
    const linha = db.extrato_linhas.find((l) => l.id === id);
    if (!linha) {
      erros.push(`Linha ${id} não encontrada.`);
      continue;
    }
    if (linha.status === "conciliada") {
      erros.push(`Linha ${id} já está conciliada — não pode ignorar.`);
      continue;
    }
    if (linha.status === "ignorada") continue;
    linha.status = "ignorada";
    if (opcoes.observacao) linha.observacao = opcoes.observacao;
    ignoradas += 1;
  }
  return { sucesso: erros.length === 0, ignoradas, erros };
}

/**
 * Concilia títulos e marca as linhas do extrato como `conciliada`.
 * Desfazer a linha depois não reabre o título (MVP).
 */
export function aplicarMatchesLinhasPersistidas(
  db: DB,
  matches: Array<{
    extrato_linha_id: string;
    alvo: AlvoMatchExtrato;
    alvo_id: string;
    dataLiquidacao?: string;
    observacao?: string;
  }>,
  opcoes: { responsavel?: string; agora?: string; idFactory?: () => string } = {}
): { sucesso: boolean; conciliados: number; erros: string[] } {
  if (!Array.isArray(db.extrato_linhas)) db.extrato_linhas = [];
  const responsavel = opcoes.responsavel ?? "usuário local";
  const agora = opcoes.agora ?? new Date().toISOString();
  const erros: string[] = [];
  const prontos: Array<{
    alvo: AlvoMatchExtrato;
    alvo_id: string;
    dataLiquidacao: string;
    observacao?: string;
    linha: ExtratoLinha;
  }> = [];

  for (const m of matches) {
    const linha = db.extrato_linhas.find((l) => l.id === m.extrato_linha_id);
    if (!linha) {
      erros.push(`Linha ${m.extrato_linha_id} não encontrada.`);
      continue;
    }
    if (linha.status !== "aberta") {
      erros.push(`Linha ${m.extrato_linha_id} não está aberta.`);
      continue;
    }
    prontos.push({
      alvo: m.alvo,
      alvo_id: m.alvo_id,
      dataLiquidacao: m.dataLiquidacao ?? linha.data,
      observacao: m.observacao ?? `Extrato: ${linha.descricao}`.slice(0, 200),
      linha,
    });
  }

  if (prontos.length === 0) {
    return { sucesso: false, conciliados: 0, erros: erros.length ? erros : ["Nenhum match válido."] };
  }

  const resultado = aplicarMatchesExtrato(
    db,
    prontos.map((p) => ({
      alvo: p.alvo,
      alvo_id: p.alvo_id,
      dataLiquidacao: p.dataLiquidacao,
      observacao: p.observacao,
    })),
    opcoes
  );

  // Marca linhas cujo título foi conciliado com sucesso (revalida status do alvo)
  let marcadas = 0;
  for (const p of prontos) {
    const ok =
      p.alvo === "boleto"
        ? db.boletos.find((b) => b.id === p.alvo_id)?.status === "pago"
        : db.pagamentos_pessoas.find((x) => x.id === p.alvo_id)?.status === "pago";
    if (!ok) continue;
    p.linha.status = "conciliada";
    p.linha.alvo = p.alvo;
    p.linha.alvo_id = p.alvo_id;
    p.linha.conciliado_em = agora;
    p.linha.conciliado_por = responsavel;
    p.linha.observacao = p.observacao;
    marcadas += 1;
  }

  return {
    sucesso: erros.length === 0 && resultado.erros.length === 0,
    conciliados: marcadas,
    erros: [...erros, ...resultado.erros],
  };
}
