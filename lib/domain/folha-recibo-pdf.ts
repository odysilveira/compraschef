import type { DB, PagamentoPessoa, PessoaRH } from "../types";

export type TipoReciboFolha = "salario" | "pro_labore";

export interface ReciboFolha {
  codigo_funcionario: string;
  nome: string;
  funcao?: string;
  tipo_recibo: TipoReciboFolha;
  /** YYYY-MM */
  competencia: string;
  /** Ex.: Julho/2026 */
  competencia_rotulo: string;
  salario_base?: number;
  adiantamento?: number;
  consumo?: number;
  total_ganhos?: number;
  total_descontos?: number;
  liquido: number;
}

export interface ReciboFolhaVinculado extends ReciboFolha {
  pessoa_id?: string;
  pessoa_nome?: string;
  alerta?: string;
  ja_existe?: boolean;
  selecionado: boolean;
}

const MESES_PT: Record<string, string> = {
  janeiro: "01",
  fevereiro: "02",
  marco: "03",
  março: "03",
  abril: "04",
  maio: "05",
  junho: "06",
  julho: "07",
  agosto: "08",
  setembro: "09",
  outubro: "10",
  novembro: "11",
  dezembro: "12",
};

export function parseMoedaBr(texto: string): number | null {
  const limpo = texto.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
}

export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Julho/2026 → 2026-07 */
export function competenciaPtParaIso(texto: string): { iso: string; rotulo: string } | null {
  const m = texto.match(
    /\b(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*\/\s*(\d{4})\b/i
  );
  if (!m) return null;
  const mesNome = m[1].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const mesKey = mesNome === "marco" ? "marco" : mesNome;
  const mes = MESES_PT[mesKey] ?? MESES_PT[m[1].toLowerCase()];
  if (!mes) return null;
  const rotulo = `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()}/${m[2]}`;
  return { iso: `${m[2]}-${mes}`, rotulo };
}

function extrairValorCodigo(bloco: string, codigo: string, rotuloRegex: string): number | undefined {
  const re = new RegExp(`${codigo}-${rotuloRegex}\\s+(?:\\S+\\s+)?([\\d.]+,\\d{2})`, "i");
  const m = bloco.match(re);
  if (!m) {
    // Alguns códigos vêm sem REF (ex.: 254-CONSUMO 149,92 ou 056-PRO LABORE 1.621,00)
    const re2 = new RegExp(`${codigo}-${rotuloRegex}\\s+([\\d.]+,\\d{2})`, "i");
    const m2 = bloco.match(re2);
    if (!m2) return undefined;
    return parseMoedaBr(m2[1]) ?? undefined;
  }
  return parseMoedaBr(m[1]) ?? undefined;
}

function chaveRecibo(r: Pick<ReciboFolha, "codigo_funcionario" | "competencia" | "liquido">): string {
  return `${r.codigo_funcionario}|${r.competencia}|${r.liquido.toFixed(2)}`;
}

/**
 * Parseia texto extraído do PDF de recibos Vera Bela (formato fixo do contador).
 * Deduplica vias duplicadas na mesma página.
 */
export function parseRecibosFolhaTexto(texto: string): ReciboFolha[] {
  // pdfjs às vezes cola valor no código seguinte: 2.192,40216-ADIANTAMENTO → 2.192,40 216-
  const limpo = texto.replace(/\u00a0/g, " ").replace(/(\d)(\d{3}-)/g, "$1 $2");
  const marcadores = Array.from(
    limpo.matchAll(/RECIBO DE PAGAMENTO DE\s+(SALARIO|PRO-LABORE|PRO LABORE)/gi)
  );
  if (marcadores.length === 0) return [];

  const blocos: Array<{ tipo: TipoReciboFolha; corpo: string }> = [];
  for (let i = 0; i < marcadores.length; i++) {
    const inicio = marcadores[i].index ?? 0;
    const fim = i + 1 < marcadores.length ? (marcadores[i + 1].index ?? limpo.length) : limpo.length;
    const tipoRaw = marcadores[i][1].toUpperCase().replace(/-/g, " ");
    const tipo: TipoReciboFolha = tipoRaw.includes("PRO") ? "pro_labore" : "salario";
    blocos.push({ tipo, corpo: limpo.slice(inicio, fim) });
  }

  const vistos = new Set<string>();
  const recibos: ReciboFolha[] = [];

  for (const bloco of blocos) {
    const competenciaInfo =
      competenciaPtParaIso(bloco.corpo) ??
      (() => {
        // fallback: procura perto do CNPJ
        const m = bloco.corpo.match(/C\.?N\.?P\.?J\.?[^\n]*?([A-Za-zçÇ]+\/\d{4})/i);
        return m ? competenciaPtParaIso(m[1]) : null;
      })();
    if (!competenciaInfo) continue;

    const pessoaMatch = bloco.corpo.match(
      /(\d+)\s*-\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇÄËÏÖÜÀÈÌÒÙÑ ]+?)\s+FUNCAO\s+([^\n|]+)/i
    );
    if (!pessoaMatch) continue;

    const liquidoMatch =
      bloco.corpo.match(/\bLIQUIDO\s+([\d.]+,\d{2})/i) ??
      bloco.corpo.match(/\bRECEBI\s+([\d.]+,\d{2})/i);
    if (!liquidoMatch) continue;
    const liquido = parseMoedaBr(liquidoMatch[1]);
    if (liquido == null) continue;

    const codigo_funcionario = pessoaMatch[1];
    const nome = pessoaMatch[2].replace(/\s+/g, " ").trim();
    const funcao = pessoaMatch[3].replace(/\|/g, "").replace(/\s+/g, " ").trim() || undefined;

    const salario_base =
      bloco.tipo === "pro_labore"
        ? extrairValorCodigo(bloco.corpo, "056", "PRO\\s*LABORE")
        : extrairValorCodigo(bloco.corpo, "001", "SALARIO");
    const adiantamento = extrairValorCodigo(bloco.corpo, "216", "ADIANTAMENTO\\s+DE\\s+SAL");
    const consumo = extrairValorCodigo(bloco.corpo, "254", "CONSUMO");

    const ganhosMatch = bloco.corpo.match(/TOTAL\s+GANHOS\s+([\d.]+,\d{2})/i);
    const descontosMatch = bloco.corpo.match(/TOTAL\s+DESCONTOS\s+([\d.]+,\d{2})/i);

    const recibo: ReciboFolha = {
      codigo_funcionario,
      nome,
      funcao,
      tipo_recibo: bloco.tipo,
      competencia: competenciaInfo.iso,
      competencia_rotulo: competenciaInfo.rotulo,
      salario_base,
      adiantamento,
      consumo,
      total_ganhos: ganhosMatch ? parseMoedaBr(ganhosMatch[1]) ?? undefined : undefined,
      total_descontos: descontosMatch ? parseMoedaBr(descontosMatch[1]) ?? undefined : undefined,
      liquido,
    };

    const chave = chaveRecibo(recibo);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    recibos.push(recibo);
  }

  return recibos;
}

export function vincularRecibosAPessoas(
  recibos: ReciboFolha[],
  pessoas: PessoaRH[],
  pagamentosExistentes: PagamentoPessoa[] = []
): ReciboFolhaVinculado[] {
  const ativas = pessoas.filter((p) => p.ativo);

  return recibos.map((recibo) => {
    const alvo = normalizarNome(recibo.nome);
    let pessoa =
      ativas.find((p) => normalizarNome(p.nome) === alvo) ??
      ativas.find((p) => {
        const n = normalizarNome(p.nome);
        return n.includes(alvo) || alvo.includes(n);
      });

    // Match por primeiras palavras quando sobrenome completo diverge
    if (!pessoa) {
      const partes = alvo.split(" ").filter((p) => p.length > 2);
      if (partes.length >= 2) {
        pessoa = ativas.find((p) => {
          const n = normalizarNome(p.nome);
          return partes.every((parte) => n.includes(parte));
        });
      }
    }

    const ja_existe = Boolean(
      pessoa &&
        pagamentosExistentes.some(
          (pag) =>
            pag.pessoa_id === pessoa!.id &&
            pag.competencia === recibo.competencia &&
            pag.tipo === "salario" &&
            Math.abs(pag.valor - recibo.liquido) < 0.02
        )
    );

    let alerta: string | undefined;
    if (!pessoa) alerta = "Pessoa não encontrada — selecione manualmente.";
    else if (ja_existe) alerta = "Já existe pagamento igual nesta competência.";
    else if (recibo.liquido <= 0) alerta = "Líquido zerado.";

    return {
      ...recibo,
      pessoa_id: pessoa?.id,
      pessoa_nome: pessoa?.nome,
      alerta,
      ja_existe,
      selecionado: Boolean(pessoa) && !ja_existe && recibo.liquido > 0,
    };
  });
}

export interface ResultadoCriarPagamentosFolha {
  criados: number;
  ignorados: number;
  erros: string[];
}

export function criarPagamentosDaFolha(
  db: DB,
  linhas: ReciboFolhaVinculado[],
  opcoes: { agora?: string; vencimento?: string; idFactory?: () => string } = {}
): ResultadoCriarPagamentosFolha {
  const agora = opcoes.agora ?? new Date().toISOString();
  const vencimento = opcoes.vencimento ?? agora.slice(0, 10);
  let criados = 0;
  let ignorados = 0;
  const erros: string[] = [];

  if (!Array.isArray(db.pagamentos_pessoas)) db.pagamentos_pessoas = [];

  for (const linha of linhas) {
    if (!linha.selecionado) {
      ignorados += 1;
      continue;
    }
    if (!linha.pessoa_id) {
      erros.push(`${linha.nome}: sem pessoa vinculada.`);
      ignorados += 1;
      continue;
    }
    if (linha.liquido <= 0) {
      erros.push(`${linha.nome}: líquido inválido.`);
      ignorados += 1;
      continue;
    }

    const descricaoBase =
      linha.tipo_recibo === "pro_labore"
        ? `Pró-labore ${linha.competencia_rotulo} (importada)`
        : `Folha ${linha.competencia_rotulo} (importada)`;

    const pagamento: PagamentoPessoa = {
      id: opcoes.idFactory?.() ?? `pagp-folha-${Date.now()}-${criados}`,
      pessoa_id: linha.pessoa_id,
      tipo: "salario",
      descricao: descricaoBase,
      competencia: linha.competencia,
      vencimento,
      valor: linha.liquido,
      valor_bruto: linha.salario_base ?? linha.total_ganhos ?? linha.liquido,
      desconto_adiantamento: linha.adiantamento,
      desconto_consumo: linha.consumo,
      status: "previsto",
      criado_em: agora,
      atualizado_em: agora,
    };
    db.pagamentos_pessoas.push(pagamento);
    criados += 1;
  }

  return { criados, ignorados, erros };
}
