import type { ContaPagar, StatusContaPagar, StatusPagamentoPessoa } from "../types";
import type { FiltroCompletudeNota } from "./nfe-financeiro";
import { parseFiltroCompletudeNota } from "./nfe-financeiro";

export type { FiltroCompletudeNota };
export { parseFiltroCompletudeNota };

export type FiltroVencimentoConta = "todas" | "hoje" | "proximos_7_dias" | "atrasadas";

export interface FiltrosContaPagar {
  texto?: string;
  status?: StatusContaPagar | "todos";
  vencimento?: FiltroVencimentoConta;
  fornecedorPorId?: Record<string, string>;
}

export interface ResumoContaFaixa {
  quantidade: number;
  total: number;
}

export interface ResumoContasPagar {
  vencendoHoje: ResumoContaFaixa;
  proximos7Dias: ResumoContaFaixa;
  atrasadas: ResumoContaFaixa;
  aguardandoConciliacao: ResumoContaFaixa;
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function somenteData(valor?: string): string {
  return (valor ?? "").slice(0, 10);
}

function normalizarTexto(valor?: string): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function contaEncerrada(status: StatusContaPagar): boolean {
  return status === "conciliado" || status === "cancelado";
}

export function diferencaDias(data: string, hoje = hojeISO()): number {
  const base = new Date(`${somenteData(hoje)}T00:00:00`);
  const alvo = new Date(`${somenteData(data)}T00:00:00`);
  return Math.round((alvo.getTime() - base.getTime()) / 86400000);
}

export function contaEstaAtrasada(conta: ContaPagar, hoje = hojeISO()): boolean {
  return diferencaDias(conta.data_vencimento, hoje) < 0;
}

export function contaVenceHoje(conta: ContaPagar, hoje = hojeISO()): boolean {
  return diferencaDias(conta.data_vencimento, hoje) === 0;
}

export function contaVenceNosProximos7Dias(conta: ContaPagar, hoje = hojeISO()): boolean {
  const dias = diferencaDias(conta.data_vencimento, hoje);
  return dias > 0 && dias <= 7;
}

export function resumirContasPagar(contas: ContaPagar[], hoje = hojeISO()): ResumoContasPagar {
  return contas.reduce<ResumoContasPagar>(
    (resumo, conta) => {
      if (!contaEncerrada(conta.status)) {
        if (contaEstaAtrasada(conta, hoje)) {
          resumo.atrasadas.quantidade += 1;
          resumo.atrasadas.total += conta.valor_final;
        }
        if (contaVenceHoje(conta, hoje)) {
          resumo.vencendoHoje.quantidade += 1;
          resumo.vencendoHoje.total += conta.valor_final;
        }
        if (contaVenceNosProximos7Dias(conta, hoje)) {
          resumo.proximos7Dias.quantidade += 1;
          resumo.proximos7Dias.total += conta.valor_final;
        }
      }

      if (conta.status === "aguardando_conciliacao") {
        resumo.aguardandoConciliacao.quantidade += 1;
        resumo.aguardandoConciliacao.total += conta.valor_final;
      }

      return resumo;
    },
    {
      vencendoHoje: { quantidade: 0, total: 0 },
      proximos7Dias: { quantidade: 0, total: 0 },
      atrasadas: { quantidade: 0, total: 0 },
      aguardandoConciliacao: { quantidade: 0, total: 0 },
    }
  );
}

export function ordenarContasPagar(contas: ContaPagar[], hoje = hojeISO()): ContaPagar[] {
  return [...contas].sort((a, b) => {
    const aAtrasada = contaEstaAtrasada(a, hoje);
    const bAtrasada = contaEstaAtrasada(b, hoje);
    if (aAtrasada !== bAtrasada) return aAtrasada ? -1 : 1;

    const porVencimento = somenteData(a.data_vencimento).localeCompare(somenteData(b.data_vencimento));
    if (porVencimento !== 0) return porVencimento;

    return somenteData(a.criado_em).localeCompare(somenteData(b.criado_em));
  });
}

export function filtrarContasPagar(contas: ContaPagar[], filtros: FiltrosContaPagar, hoje = hojeISO()): ContaPagar[] {
  const texto = normalizarTexto(filtros.texto);
  const status = filtros.status ?? "todos";
  const vencimento = filtros.vencimento ?? "todas";
  const fornecedorPorId = filtros.fornecedorPorId ?? {};

  const filtradas = contas.filter((conta) => {
    if (status !== "todos" && conta.status !== status) return false;

    if (vencimento === "hoje" && !contaVenceHoje(conta, hoje)) return false;
    if (vencimento === "proximos_7_dias" && !contaVenceNosProximos7Dias(conta, hoje)) return false;
    if (vencimento === "atrasadas" && !contaEstaAtrasada(conta, hoje)) return false;

    if (!texto) return true;

    const fornecedor = normalizarTexto(fornecedorPorId[conta.fornecedor_id ?? ""]);
    const descricao = normalizarTexto(conta.descricao);
    const documento = normalizarTexto(conta.documento_id);

    return fornecedor.includes(texto) || descricao.includes(texto) || documento.includes(texto);
  });

  return ordenarContasPagar(filtradas, hoje);
}

function csvEscape(valor: string): string {
  if (/[;"\n\r]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

function formatarValorCsv(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toFixed(2).replace(".", ",");
}

export function rotuloStatusContaPagar(status: StatusContaPagar): string {
  switch (status) {
    case "aguardando_boleto":
      return "Aguardando boleto";
    case "boleto_recebido":
      return "Boleto recebido";
    case "em_conferencia":
      return "Em conferência";
    case "compativel":
      return "Compatível";
    case "divergente":
      return "Divergente";
    case "bloqueado":
      return "Bloqueado";
    case "aguardando_conciliacao":
      return "Aguardando conciliação";
    case "conciliado":
      return "Conciliado";
    case "cancelado":
      return "Cancelado";
  }
}

function rotuloOrigemContaPagar(origem: ContaPagar["origem"]): string {
  switch (origem) {
    case "nfe":
      return "NF-e";
    case "nfse":
      return "NFS-e";
    case "manual":
      return "Manual";
    case "recorrente":
      return "Recorrente";
  }
}

/**
 * CSV das contas a pagar filtradas (separador `;`, UTF-8 com BOM) para Excel/pt-BR.
 */
export function exportarContasPagarCsv(
  contas: ContaPagar[],
  contexto: {
    fornecedorDaConta: (conta: ContaPagar) => string;
  }
): string {
  const cabecalho = [
    "Fornecedor",
    "Descrição",
    "Origem",
    "Documento",
    "Categoria",
    "Centro de custo",
    "Emissão",
    "Vencimento",
    "Valor original",
    "Juros",
    "Desconto",
    "Valor final",
    "Status",
    "Observações",
  ];
  const ordenadas = ordenarContasPagar(contas);
  const linhas = ordenadas.map((conta) =>
    [
      contexto.fornecedorDaConta(conta),
      conta.descricao,
      rotuloOrigemContaPagar(conta.origem),
      conta.documento_id ?? "",
      conta.categoria,
      conta.centro_custo ?? "",
      somenteData(conta.data_emissao),
      somenteData(conta.data_vencimento),
      formatarValorCsv(conta.valor_original),
      formatarValorCsv(conta.juros),
      formatarValorCsv(conta.desconto),
      formatarValorCsv(conta.valor_final),
      rotuloStatusContaPagar(conta.status),
      conta.observacoes ?? "",
    ]
      .map((c) => csvEscape(String(c)))
      .join(";")
  );
  return `\uFEFF${[cabecalho.join(";"), ...linhas].join("\r\n")}`;
}

export type AbaFinanceiro = "boletos" | "contas" | "notas" | "extrato";

/** Seção da agenda de boletos (deep link a partir do RH / Painel). */
export type FilaAgendaFinanceiro = "aguardando" | "pagos" | "liberados" | "suspeitos";

/** Prefixo de observação quando o dono confirma golpe (mesmo critério da agenda). */
export const MARCA_GOLPE_BOLETO = "GOLPE CONFIRMADO";

export function boletoSuspeitoAtivo(boleto: {
  status: string;
  observacao?: string;
}): boolean {
  return boleto.status === "suspeito" && !boleto.observacao?.startsWith(MARCA_GOLPE_BOLETO);
}

const STATUS_CONTA_PAGAR: StatusContaPagar[] = [
  "aguardando_boleto",
  "boleto_recebido",
  "em_conferencia",
  "compativel",
  "divergente",
  "bloqueado",
  "aguardando_conciliacao",
  "conciliado",
  "cancelado",
];

export function parseAbaFinanceiro(valor: string | null | undefined): AbaFinanceiro {
  if (valor === "contas" || valor === "notas" || valor === "boletos" || valor === "extrato") {
    return valor;
  }
  return "boletos";
}

export function parseFilaAgendaFinanceiro(
  valor: string | null | undefined
): FilaAgendaFinanceiro | undefined {
  if (
    valor === "aguardando" ||
    valor === "pagos" ||
    valor === "liberados" ||
    valor === "suspeitos"
  ) {
    return valor;
  }
  return undefined;
}

/**
 * Mapeia status de pagamento de RH para a fila da agenda Financeiro.
 * Previsto (e demais) não têm fila dedicada.
 */
export function filaAgendaFinanceiroDeStatusPagamento(
  status: StatusPagamentoPessoa
): FilaAgendaFinanceiro | undefined {
  if (status === "liberado") return "liberados";
  if (status === "aguardando_conciliacao") return "aguardando";
  if (status === "pago") return "pagos";
  return undefined;
}

export function parseFiltroVencimentoConta(valor: string | null | undefined): FiltroVencimentoConta {
  if (valor === "hoje" || valor === "proximos_7_dias" || valor === "atrasadas") return valor;
  return "todas";
}

export function parseFiltroStatusConta(
  valor: string | null | undefined
): StatusContaPagar | "todos" {
  if (valor && (STATUS_CONTA_PAGAR as string[]).includes(valor)) {
    return valor as StatusContaPagar;
  }
  return "todos";
}

/**
 * Deep link do Financeiro (`?aba=` + filtros Contas/Notas + `fila` da agenda + Extrato).
 * Defaults omitidos da query (aba boletos, vencimento todas, status todos, completude todas).
 * Extrato: `?aba=extrato` e opcional `status=abertas|conciliadas|ignoradas|todas` (default abertas omitido).
 */
export function hrefFinanceiro(opts?: {
  aba?: AbaFinanceiro;
  vencimento?: FiltroVencimentoConta;
  status?: StatusContaPagar | "todos";
  fila?: FilaAgendaFinanceiro;
  completude?: FiltroCompletudeNota;
  /** Filtro da aba Extrato (`status=` na query). */
  extratoStatus?: "abertas" | "conciliadas" | "ignoradas" | "todas";
}): string {
  const params = new URLSearchParams();
  const aba = opts?.aba ?? "boletos";
  if (aba !== "boletos") params.set("aba", aba);
  if (aba === "contas") {
    if (opts?.vencimento && opts.vencimento !== "todas") {
      params.set("vencimento", opts.vencimento);
    }
    if (opts?.status && opts.status !== "todos") {
      params.set("status", opts.status);
    }
  }
  if (aba === "boletos") {
    if (opts?.vencimento && opts.vencimento !== "todas") {
      params.set("vencimento", opts.vencimento);
    }
    if (opts?.fila) {
      params.set("fila", opts.fila);
    }
  }
  if (aba === "notas") {
    if (opts?.completude && opts.completude !== "todas") {
      params.set("completude", opts.completude);
    }
  }
  if (aba === "extrato") {
    if (opts?.extratoStatus && opts.extratoStatus !== "abertas") {
      params.set("status", opts.extratoStatus);
    }
  }
  const q = params.toString();
  return q ? `/financeiro?${q}` : "/financeiro";
}
