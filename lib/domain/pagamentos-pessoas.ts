import type { DB, PagamentoPessoa, StatusPagamentoPessoa, TipoPagamentoPessoa } from "../types";
import { aplicarDescontosNoPagamento, previewFechamentoSalario } from "./consumos-pessoas";

export const TIPOS_PAGAMENTO_PESSOA: Array<{ id: TipoPagamentoPessoa; rotulo: string }> = [
  { id: "salario", rotulo: "Salário" },
  { id: "adiantamento", rotulo: "Adiantamento" },
  { id: "vale", rotulo: "Vale" },
  { id: "intermitente_periodo", rotulo: "Intermitente (período)" },
  { id: "freela_hora", rotulo: "Por hora" },
  { id: "freela_servico", rotulo: "Por serviço" },
  { id: "outro", rotulo: "Outro" },
];

export function rotuloTipoPagamentoPessoa(tipo: TipoPagamentoPessoa): string {
  return TIPOS_PAGAMENTO_PESSOA.find((t) => t.id === tipo)?.rotulo ?? tipo;
}

export function rotuloStatusPagamentoPessoa(status: StatusPagamentoPessoa): string {
  switch (status) {
    case "previsto":
      return "Previsto";
    case "liberado":
      return "Liberado";
    case "aguardando_conciliacao":
      return "Aguardando conciliação";
    case "pago":
      return "Pago";
  }
}

function limparTexto(valor?: string): string {
  return (valor ?? "").trim();
}

function dataIsoValida(valor: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

export interface DadosInformarPagamentoPessoa {
  dataPagamento: string;
  valorPago: number;
  bancoConta: string;
  responsavel?: string;
  observacao?: string;
}

export interface DadosConciliarPagamentoPessoa {
  dataLiquidacao: string;
  responsavel?: string;
  observacao?: string;
}

export interface DadosDivergenciaPagamentoPessoa {
  motivo: string;
  responsavel?: string;
}

export interface ResultadoPagamentoPessoa {
  sucesso: boolean;
  pagamento?: PagamentoPessoa;
  erros: string[];
}

export interface OpcoesPagamentoPessoa {
  agora?: string;
  responsavelPadrao?: string;
}

export function liberarPagamentoPessoa(db: DB, pagamentoId: string): ResultadoPagamentoPessoa {
  const pagamento = db.pagamentos_pessoas.find((p) => p.id === pagamentoId);
  if (!pagamento) return { sucesso: false, erros: ["Pagamento não encontrado."] };
  if (pagamento.status !== "previsto") {
    return { sucesso: false, erros: ["Só é possível liberar pagamentos previstos."] };
  }
  pagamento.status = "liberado";
  pagamento.atualizado_em = new Date().toISOString();
  return { sucesso: true, pagamento, erros: [] };
}

/**
 * Libera vários títulos previstos de uma vez (ex.: após gerar folha).
 * Se `ids` for informado, só esses; senão, todos os previstos do banco.
 */
export function liberarPagamentosPrevistos(
  db: DB,
  ids?: string[]
): { sucesso: boolean; liberados: number; erros: string[] } {
  const alvoIds =
    ids && ids.length > 0
      ? ids
      : (db.pagamentos_pessoas ?? []).filter((p) => p.status === "previsto").map((p) => p.id);

  let liberados = 0;
  const erros: string[] = [];
  for (const id of alvoIds) {
    const r = liberarPagamentoPessoa(db, id);
    if (r.sucesso) liberados += 1;
    else erros.push(...r.erros.map((e) => `${id}: ${e}`));
  }
  return { sucesso: erros.length === 0, liberados, erros };
}

/**
 * Informa vários títulos liberados de uma vez (mesma data/conta).
 * Valor pago = valor do título. Se `ids` for informado, só esses; senão, todos os liberados.
 */
export function informarPagamentosLiberados(
  db: DB,
  ids: string[] | undefined,
  dados: Omit<DadosInformarPagamentoPessoa, "valorPago">,
  opcoes: OpcoesPagamentoPessoa = {}
): { sucesso: boolean; informados: number; erros: string[] } {
  const alvoIds =
    ids && ids.length > 0
      ? ids
      : (db.pagamentos_pessoas ?? []).filter((p) => p.status === "liberado").map((p) => p.id);

  let informados = 0;
  const erros: string[] = [];
  for (const id of alvoIds) {
    const pagamento = db.pagamentos_pessoas.find((p) => p.id === id);
    if (!pagamento) {
      erros.push(`${id}: Pagamento não encontrado.`);
      continue;
    }
    if (pagamento.status !== "liberado") {
      erros.push(`${id}: só títulos liberados entram no lote.`);
      continue;
    }
    const r = informarPagamentoPessoa(
      db,
      id,
      {
        dataPagamento: dados.dataPagamento,
        valorPago: pagamento.pagamento_valor ?? pagamento.valor,
        bancoConta: dados.bancoConta,
        responsavel: dados.responsavel,
        observacao: dados.observacao,
      },
      opcoes
    );
    if (r.sucesso) informados += 1;
    else erros.push(...r.erros.map((e) => `${id}: ${e}`));
  }
  return { sucesso: erros.length === 0, informados, erros };
}

export function informarPagamentoPessoa(
  db: DB,
  pagamentoId: string,
  dados: DadosInformarPagamentoPessoa,
  opcoes: OpcoesPagamentoPessoa = {}
): ResultadoPagamentoPessoa {
  const pagamento = db.pagamentos_pessoas.find((p) => p.id === pagamentoId);
  if (!pagamento) return { sucesso: false, erros: ["Pagamento não encontrado."] };
  if (pagamento.status !== "liberado" && pagamento.status !== "previsto") {
    return {
      sucesso: false,
      erros: [`Não é possível informar pagamento no status atual (${rotuloStatusPagamentoPessoa(pagamento.status)}).`],
    };
  }
  if (!dataIsoValida(dados.dataPagamento)) {
    return { sucesso: false, erros: ["Informe uma data de pagamento válida."] };
  }
  if (!Number.isFinite(dados.valorPago) || dados.valorPago <= 0) {
    return { sucesso: false, erros: ["Informe um valor pago válido."] };
  }
  const bancoConta = limparTexto(dados.bancoConta);
  if (!bancoConta) {
    return { sucesso: false, erros: ["Informe de qual banco/conta saiu o pagamento (ajuda na conciliação)."] };
  }

  const agora = opcoes.agora ?? new Date().toISOString();
  const responsavel = limparTexto(dados.responsavel) || opcoes.responsavelPadrao || "usuário local";

  pagamento.status = "aguardando_conciliacao";
  pagamento.pagamento_data = dados.dataPagamento;
  pagamento.pagamento_valor = Number(dados.valorPago.toFixed(2));
  pagamento.pagamento_banco_conta = bancoConta;
  pagamento.pagamento_responsavel = responsavel;
  pagamento.pagamento_observacao = limparTexto(dados.observacao) || undefined;
  pagamento.pagamento_informado_em = agora;
  pagamento.atualizado_em = agora;

  return { sucesso: true, pagamento, erros: [] };
}

export function conciliarPagamentoPessoa(
  db: DB,
  pagamentoId: string,
  dados: DadosConciliarPagamentoPessoa,
  opcoes: OpcoesPagamentoPessoa = {}
): ResultadoPagamentoPessoa {
  const pagamento = db.pagamentos_pessoas.find((p) => p.id === pagamentoId);
  if (!pagamento) return { sucesso: false, erros: ["Pagamento não encontrado."] };
  if (pagamento.status !== "aguardando_conciliacao") {
    return { sucesso: false, erros: ["Só é possível conciliar pagamentos aguardando conciliação."] };
  }
  if (!dataIsoValida(dados.dataLiquidacao)) {
    return { sucesso: false, erros: ["Informe uma data de liquidação válida."] };
  }

  const agora = opcoes.agora ?? new Date().toISOString();
  const responsavel = limparTexto(dados.responsavel) || opcoes.responsavelPadrao || "usuário local";

  pagamento.status = "pago";
  pagamento.conciliado_em = agora;
  pagamento.conciliado_por = responsavel;
  pagamento.conciliacao_divergente = false;
  pagamento.conciliacao_divergencia_motivo = undefined;
  pagamento.conciliacao_divergencia_em = undefined;
  if (limparTexto(dados.observacao)) {
    pagamento.pagamento_observacao = limparTexto(dados.observacao);
  }
  pagamento.atualizado_em = agora;

  return { sucesso: true, pagamento, erros: [] };
}

/**
 * Concilia vários títulos em `aguardando_conciliacao` de uma vez.
 * Se `ids` for informado, só esses; senão, todos os aguardando do banco.
 */
export function conciliarPagamentosAguardando(
  db: DB,
  ids: string[] | undefined,
  dados: DadosConciliarPagamentoPessoa,
  opcoes: OpcoesPagamentoPessoa = {}
): { sucesso: boolean; conciliados: number; erros: string[] } {
  const alvoIds =
    ids && ids.length > 0
      ? ids
      : (db.pagamentos_pessoas ?? [])
          .filter((p) => p.status === "aguardando_conciliacao")
          .map((p) => p.id);

  let conciliados = 0;
  const erros: string[] = [];
  for (const id of alvoIds) {
    const r = conciliarPagamentoPessoa(db, id, dados, opcoes);
    if (r.sucesso) conciliados += 1;
    else erros.push(...r.erros.map((e) => `${id}: ${e}`));
  }
  return { sucesso: erros.length === 0, conciliados, erros };
}

export function registrarDivergenciaPagamentoPessoa(
  db: DB,
  pagamentoId: string,
  dados: DadosDivergenciaPagamentoPessoa,
  opcoes: OpcoesPagamentoPessoa = {}
): ResultadoPagamentoPessoa {
  const pagamento = db.pagamentos_pessoas.find((p) => p.id === pagamentoId);
  if (!pagamento) return { sucesso: false, erros: ["Pagamento não encontrado."] };
  if (pagamento.status !== "aguardando_conciliacao") {
    return { sucesso: false, erros: ["Só é possível registrar divergência em aguardando conciliação."] };
  }
  const motivo = limparTexto(dados.motivo);
  if (!motivo) {
    return { sucesso: false, erros: ["Informe o motivo da divergência."] };
  }

  const agora = opcoes.agora ?? new Date().toISOString();
  pagamento.conciliacao_divergente = true;
  pagamento.conciliacao_divergencia_motivo = motivo;
  pagamento.conciliacao_divergencia_em = agora;
  pagamento.atualizado_em = agora;

  return { sucesso: true, pagamento, erros: [] };
}

/** Último dia do mês da competência YYYY-MM. */
export function vencimentoCompetencia(competencia: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(competencia);
  if (!m) return `${competencia}-28`;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const ultimo = new Date(ano, mes, 0).getDate();
  return `${m[1]}-${m[2]}-${String(ultimo).padStart(2, "0")}`;
}

export interface ResultadoGerarFolhaClt {
  sucesso: boolean;
  criados: number;
  pulados: number;
  pagamentos: PagamentoPessoa[];
  erros: string[];
  avisos: string[];
}

/**
 * Gera pagamentos de salário (status previsto) para colaboradores ativos com salário,
 * na competência informada. Não duplica se já existir salário da mesma competência.
 * Aplica descontos de adiantamento/consumo via preview.
 */
export function gerarFolhaCltMes(
  db: DB,
  competencia: string,
  opcoes: { agora?: string; idFactory?: () => string; liberar?: boolean } = {}
): ResultadoGerarFolhaClt {
  const avisos: string[] = [];
  if (!/^\d{4}-\d{2}$/.test(competencia)) {
    return { sucesso: false, criados: 0, pulados: 0, pagamentos: [], erros: ["Competência inválida (use YYYY-MM)."], avisos };
  }
  if (!Array.isArray(db.pagamentos_pessoas)) db.pagamentos_pessoas = [];

  const agora = opcoes.agora ?? new Date().toISOString();
  const vencimento = vencimentoCompetencia(competencia);
  const colaboradores = (db.pessoas ?? []).filter(
    (p) => p.ativo && p.tipo === "colaborador" && typeof p.salario === "number" && p.salario > 0
  );

  let criados = 0;
  let pulados = 0;
  const pagamentos: PagamentoPessoa[] = [];

  for (const pessoa of colaboradores) {
    const jaTem = db.pagamentos_pessoas.some(
      (p) => p.pessoa_id === pessoa.id && p.tipo === "salario" && p.competencia === competencia
    );
    if (jaTem) {
      pulados += 1;
      continue;
    }

    const preview = previewFechamentoSalario(db, pessoa.id, competencia, pessoa.salario);
    const id = opcoes.idFactory?.() ?? `pagp-folha-${Date.now()}-${criados}`;
    const pagamento: PagamentoPessoa = {
      id,
      pessoa_id: pessoa.id,
      tipo: "salario",
      descricao: `Salário ${competencia}`,
      competencia,
      vencimento,
      valor: preview.valor_liquido,
      valor_bruto: preview.valor_bruto,
      desconto_adiantamento: preview.desconto_adiantamento || undefined,
      desconto_consumo: preview.desconto_consumo || undefined,
      consumo_ids: preview.consumo_ids.length ? preview.consumo_ids : undefined,
      status: opcoes.liberar ? "liberado" : "previsto",
      criado_em: agora,
      atualizado_em: agora,
    };
    db.pagamentos_pessoas.push(pagamento);

    // Marca consumos como descontados (mesma lógica de aplicarDescontosNoPagamento)
    const aplicado = aplicarDescontosNoPagamento(db, pagamento.id);
    if (!aplicado.sucesso) {
      avisos.push(`${pessoa.nome}: ${aplicado.erros.join(" ")}`);
    }

    pagamentos.push(pagamento);
    criados += 1;
  }

  if (colaboradores.length === 0) {
    avisos.push("Nenhum colaborador ativo com salário cadastrado.");
  }

  return { sucesso: true, criados, pulados, pagamentos, erros: [], avisos };
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
 * CSV dos pagamentos filtrados (separador `;`, UTF-8 com BOM) para Excel/pt-BR.
 */
export function exportarPagamentosPessoasCsv(
  pagamentos: PagamentoPessoa[],
  nomePorId: (pessoaId: string) => string
): string {
  const cabecalho = [
    "Pessoa",
    "Tipo",
    "Descrição",
    "Competência",
    "Vencimento",
    "Valor",
    "Valor bruto",
    "Desconto consumo",
    "Desconto adiantamento",
    "Status",
    "Data pagamento",
    "Valor pago",
    "Banco/conta",
    "Responsável",
    "Observação",
    "Divergente",
    "Motivo divergência",
  ];
  const ordenados = pagamentos
    .slice()
    .sort(
      (a, b) =>
        a.vencimento.localeCompare(b.vencimento) ||
        nomePorId(a.pessoa_id).localeCompare(nomePorId(b.pessoa_id), "pt-BR")
    );
  const linhas = ordenados.map((p) =>
    [
      nomePorId(p.pessoa_id),
      rotuloTipoPagamentoPessoa(p.tipo),
      p.descricao ?? "",
      p.competencia ?? "",
      p.vencimento,
      formatarValorCsv(p.valor),
      formatarValorCsv(p.valor_bruto),
      formatarValorCsv(p.desconto_consumo),
      formatarValorCsv(p.desconto_adiantamento),
      rotuloStatusPagamentoPessoa(p.status),
      p.pagamento_data ?? "",
      formatarValorCsv(p.pagamento_valor),
      p.pagamento_banco_conta ?? "",
      p.pagamento_responsavel ?? "",
      p.pagamento_observacao ?? "",
      p.conciliacao_divergente ? "sim" : "não",
      p.conciliacao_divergencia_motivo ?? "",
    ]
      .map((c) => csvEscape(c))
      .join(";")
  );
  return `\uFEFF${[cabecalho.join(";"), ...linhas].join("\r\n")}`;
}
