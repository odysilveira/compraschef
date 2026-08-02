import type { DB, PagamentoPessoa, StatusPagamentoPessoa, TipoPagamentoPessoa } from "../types";

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
    return { sucesso: false, erros: ["Informe banco/conta ou PIX usada no pagamento."] };
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
