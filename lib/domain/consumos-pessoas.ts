import type {
  ConsumoPessoa,
  DB,
  PagamentoPessoa,
  StatusConsumoPessoa,
  TipoPagamentoPessoa,
} from "../types";

export const DESCONTO_CONSUMO_PADRAO = 20;
export const TETO_ADIANTAMENTO_PCT = 50;

const TIPOS_COM_CONSUMO_DIARIO: TipoPagamentoPessoa[] = [
  "intermitente_periodo",
  "freela_hora",
  "freela_servico",
];

export function rotuloStatusConsumo(status: StatusConsumoPessoa): string {
  return status === "pendente" ? "Pendente" : "Descontado";
}

export function validarAdiantamento(
  salario: number | undefined,
  valor: number
): { ok: boolean; erros: string[]; teto?: number } {
  if (!Number.isFinite(valor) || valor < 0) {
    return { ok: false, erros: ["Informe um valor de adiantamento válido."] };
  }
  if (valor === 0) return { ok: true, erros: [] };
  if (!salario || !Number.isFinite(salario) || salario <= 0) {
    return { ok: false, erros: ["Informe o salário antes de definir o adiantamento."] };
  }
  const teto = Number(((salario * TETO_ADIANTAMENTO_PCT) / 100).toFixed(2));
  if (valor > teto + 0.001) {
    return {
      ok: false,
      erros: [`Adiantamento não pode passar de ${TETO_ADIANTAMENTO_PCT}% do salário (teto ${teto.toFixed(2)}).`],
      teto,
    };
  }
  return { ok: true, erros: [], teto };
}

export function calcularLinhaConsumo(
  quantidade: number,
  precoUnitario: number,
  descontoPercentual: number = DESCONTO_CONSUMO_PADRAO
): { valor_bruto: number; valor_liquido: number; desconto_percentual: number } {
  const qtd = Number.isFinite(quantidade) ? quantidade : 0;
  const preco = Number.isFinite(precoUnitario) ? precoUnitario : 0;
  const desc = Number.isFinite(descontoPercentual) ? descontoPercentual : DESCONTO_CONSUMO_PADRAO;
  const valor_bruto = Number((qtd * preco).toFixed(2));
  const valor_liquido = Number((valor_bruto * (1 - desc / 100)).toFixed(2));
  return { valor_bruto, valor_liquido, desconto_percentual: desc };
}

export function competenciaDeData(data: string): string {
  return data.slice(0, 7);
}

export interface FiltroConsumoPendente {
  competencia?: string;
  ateData?: string;
}

export function listarConsumosPendentes(
  db: DB,
  pessoaId: string,
  filtro: FiltroConsumoPendente = {}
): ConsumoPessoa[] {
  const itens = db.consumos_pessoas ?? [];
  return itens.filter((c) => {
    if (c.pessoa_id !== pessoaId || c.status !== "pendente") return false;
    if (filtro.competencia && c.competencia !== filtro.competencia) return false;
    if (filtro.ateData && c.data > filtro.ateData) return false;
    return true;
  });
}

export function totalConsumoPendente(
  db: DB,
  pessoaId: string,
  filtro: FiltroConsumoPendente = {}
): { bruto: number; liquido: number; itens: ConsumoPessoa[] } {
  const itens = listarConsumosPendentes(db, pessoaId, filtro);
  return {
    itens,
    bruto: Number(itens.reduce((s, c) => s + c.valor_bruto, 0).toFixed(2)),
    liquido: Number(itens.reduce((s, c) => s + c.valor_liquido, 0).toFixed(2)),
  };
}

/** Adiantamentos já lançados na competência (liberado em diante). */
export function totalAdiantamentoNaCompetencia(db: DB, pessoaId: string, competencia: string): number {
  const itens = (db.pagamentos_pessoas ?? []).filter(
    (p) =>
      p.pessoa_id === pessoaId &&
      p.tipo === "adiantamento" &&
      p.competencia === competencia &&
      (p.status === "liberado" || p.status === "aguardando_conciliacao" || p.status === "pago")
  );
  return Number(itens.reduce((s, p) => s + (p.pagamento_valor ?? p.valor), 0).toFixed(2));
}

export interface PreviewFechamento {
  valor_bruto: number;
  desconto_adiantamento: number;
  desconto_consumo: number;
  valor_liquido: number;
  consumo_ids: string[];
  itens_consumo: ConsumoPessoa[];
}

export function previewFechamentoSalario(
  db: DB,
  pessoaId: string,
  competencia: string,
  salarioBruto?: number
): PreviewFechamento {
  const pessoa = db.pessoas.find((p) => p.id === pessoaId);
  const bruto = Number(
    (salarioBruto ?? pessoa?.salario ?? 0).toFixed(2)
  );
  const desconto_adiantamento = totalAdiantamentoNaCompetencia(db, pessoaId, competencia);
  const consumo = totalConsumoPendente(db, pessoaId, { competencia });
  const valor_liquido = Math.max(0, Number((bruto - desconto_adiantamento - consumo.liquido).toFixed(2)));
  return {
    valor_bruto: bruto,
    desconto_adiantamento,
    desconto_consumo: consumo.liquido,
    valor_liquido,
    consumo_ids: consumo.itens.map((c) => c.id),
    itens_consumo: consumo.itens,
  };
}

export function previewFechamentoIntermitente(db: DB, pessoaId: string, valorBruto: number): PreviewFechamento {
  const bruto = Number((Number.isFinite(valorBruto) ? valorBruto : 0).toFixed(2));
  const consumo = totalConsumoPendente(db, pessoaId);
  const valor_liquido = Math.max(0, Number((bruto - consumo.liquido).toFixed(2)));
  return {
    valor_bruto: bruto,
    desconto_adiantamento: 0,
    desconto_consumo: consumo.liquido,
    valor_liquido,
    consumo_ids: consumo.itens.map((c) => c.id),
    itens_consumo: consumo.itens,
  };
}

export function pagamentoUsaConsumoDiario(tipo: TipoPagamentoPessoa): boolean {
  return TIPOS_COM_CONSUMO_DIARIO.includes(tipo);
}

export interface DadosNovoConsumo {
  pessoa_id: string;
  data: string;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  desconto_percentual?: number;
}

export interface ResultadoConsumo {
  sucesso: boolean;
  consumo?: ConsumoPessoa;
  erros: string[];
}

export function criarConsumoPessoa(
  db: DB,
  dados: DadosNovoConsumo,
  opcoes: { id?: string; agora?: string } = {}
): ResultadoConsumo {
  const erros: string[] = [];
  if (!dados.pessoa_id) erros.push("Selecione a pessoa.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data)) erros.push("Informe a data do consumo.");
  const descricao = (dados.descricao ?? "").trim();
  if (!descricao) erros.push("Informe a descrição do item.");
  if (!Number.isFinite(dados.quantidade) || dados.quantidade <= 0) erros.push("Quantidade inválida.");
  if (!Number.isFinite(dados.preco_unitario) || dados.preco_unitario < 0) erros.push("Preço unitário inválido.");
  if (!db.pessoas.find((p) => p.id === dados.pessoa_id)) erros.push("Pessoa não encontrada.");
  if (erros.length) return { sucesso: false, erros };

  const agora = opcoes.agora ?? new Date().toISOString();
  const calc = calcularLinhaConsumo(
    dados.quantidade,
    dados.preco_unitario,
    dados.desconto_percentual ?? DESCONTO_CONSUMO_PADRAO
  );
  const consumo: ConsumoPessoa = {
    id: opcoes.id ?? `cons-${Date.now()}`,
    pessoa_id: dados.pessoa_id,
    data: dados.data,
    competencia: competenciaDeData(dados.data),
    descricao,
    quantidade: Number(dados.quantidade.toFixed(3)),
    preco_unitario: Number(dados.preco_unitario.toFixed(2)),
    desconto_percentual: calc.desconto_percentual,
    valor_bruto: calc.valor_bruto,
    valor_liquido: calc.valor_liquido,
    status: "pendente",
    criado_em: agora,
    atualizado_em: agora,
  };
  if (!Array.isArray(db.consumos_pessoas)) db.consumos_pessoas = [];
  db.consumos_pessoas.push(consumo);
  return { sucesso: true, consumo, erros: [] };
}

export interface ResultadoAplicarDescontos {
  sucesso: boolean;
  pagamento?: PagamentoPessoa;
  erros: string[];
}

/** Marca consumos pendentes como descontados e grava breakdown no pagamento. */
export function aplicarDescontosNoPagamento(db: DB, pagamentoId: string): ResultadoAplicarDescontos {
  const pagamento = db.pagamentos_pessoas.find((p) => p.id === pagamentoId);
  if (!pagamento) return { sucesso: false, erros: ["Pagamento não encontrado."] };

  const agora = new Date().toISOString();
  let preview: PreviewFechamento;

  if (pagamento.tipo === "salario") {
    const competencia = pagamento.competencia || competenciaDeData(pagamento.vencimento);
    preview = previewFechamentoSalario(db, pagamento.pessoa_id, competencia, pagamento.valor_bruto ?? pagamento.valor);
  } else if (pagamentoUsaConsumoDiario(pagamento.tipo)) {
    preview = previewFechamentoIntermitente(db, pagamento.pessoa_id, pagamento.valor_bruto ?? pagamento.valor);
  } else {
    return { sucesso: true, pagamento, erros: [] };
  }

  pagamento.valor_bruto = preview.valor_bruto;
  pagamento.desconto_adiantamento = preview.desconto_adiantamento || undefined;
  pagamento.desconto_consumo = preview.desconto_consumo || undefined;
  pagamento.consumo_ids = preview.consumo_ids.length ? preview.consumo_ids : undefined;
  pagamento.valor = preview.valor_liquido;
  pagamento.atualizado_em = agora;

  for (const item of preview.itens_consumo) {
    item.status = "descontado";
    item.pagamento_id = pagamento.id;
    item.atualizado_em = agora;
  }

  return { sucesso: true, pagamento, erros: [] };
}

function csvEscape(valor: string): string {
  if (/[;"\n\r]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

function formatarValorCsv(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toFixed(2).replace(".", ",");
}

/**
 * CSV dos consumos filtrados (separador `;`, UTF-8 com BOM) para Excel/pt-BR.
 */
export function exportarConsumosPessoasCsv(
  consumos: ConsumoPessoa[],
  nomePorId: (pessoaId: string) => string
): string {
  const cabecalho = [
    "Pessoa",
    "Data",
    "Competência",
    "Descrição",
    "Quantidade",
    "Preço unitário",
    "Desconto %",
    "Valor bruto",
    "Valor líquido",
    "Status",
    "Pagamento ID",
  ];
  const ordenados = consumos
    .slice()
    .sort(
      (a, b) =>
        b.data.localeCompare(a.data) ||
        nomePorId(a.pessoa_id).localeCompare(nomePorId(b.pessoa_id), "pt-BR")
    );
  const linhas = ordenados.map((c) =>
    [
      nomePorId(c.pessoa_id),
      c.data,
      c.competencia,
      c.descricao,
      formatarValorCsv(c.quantidade),
      formatarValorCsv(c.preco_unitario),
      formatarValorCsv(c.desconto_percentual),
      formatarValorCsv(c.valor_bruto),
      formatarValorCsv(c.valor_liquido),
      rotuloStatusConsumo(c.status),
      c.pagamento_id ?? "",
    ]
      .map((cell) => csvEscape(cell))
      .join(";")
  );
  return `\uFEFF${[cabecalho.join(";"), ...linhas].join("\r\n")}`;
}
