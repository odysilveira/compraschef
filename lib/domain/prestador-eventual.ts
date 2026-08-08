import type { PessoaRH, TipoPagamentoPessoa, TipoPessoaRH } from "../types";

/** Máximo de serviços na escala por semana (regra operacional; override com confirmação). */
export const LIMITE_SERVICOS_SEMANA_PRESTADOR_EVENTUAL = 2;

export const AVISO_REPASSE_INTEGRAL_PRESTADOR =
  "Prestador eventual: sem retenção neste módulo — o valor integral vai ao prestador (impostos e taxas ficam a cargo dele / contador).";

export function ehPrestadorEventual(
  tipo: TipoPessoaRH | Pick<PessoaRH, "tipo"> | null | undefined
): boolean {
  if (!tipo) return false;
  if (typeof tipo === "string") return tipo === "prestador_eventual";
  return tipo.tipo === "prestador_eventual";
}

/** Pagamentos de prestador eventual não abatem consumo nem retenções no ComprasChef. */
export function pagamentoEhRepasseIntegral(pessoa: Pick<PessoaRH, "tipo"> | null | undefined): boolean {
  return ehPrestadorEventual(pessoa);
}

export function tipoPagamentoPadraoPrestadorEventual(): TipoPagamentoPessoa {
  return "freela_hora";
}

/** Valor líquido = bruto (repasse integral). */
export function calcularValorHoraRepasseIntegral(
  valorHora: number,
  horas: number
): { valor_bruto: number; valor: number } | null {
  if (!Number.isFinite(valorHora) || valorHora <= 0) return null;
  if (!Number.isFinite(horas) || horas <= 0) return null;
  const valor = Number((valorHora * horas).toFixed(2));
  return { valor_bruto: valor, valor };
}

export function precisaDadosPagamentoHoraPrestador(tipo: TipoPessoaRH): boolean {
  return tipo === "prestador_eventual";
}
