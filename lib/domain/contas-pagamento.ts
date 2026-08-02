/** Contas de origem (de onde saiu o dinheiro) — atalhos na hora de informar pagamento. */
export const CONTAS_ORIGEM_PAGAMENTO = [
  "Itaú — conta corrente",
  "Bradesco — conta corrente",
  "Banco do Brasil — conta corrente",
  "Caixa — conta corrente",
  "Nubank — conta PJ",
  "Sicoob — conta corrente",
  "Sicredi — conta corrente",
  "Santander — conta corrente",
] as const;

export type ContaOrigemPagamento = (typeof CONTAS_ORIGEM_PAGAMENTO)[number];
