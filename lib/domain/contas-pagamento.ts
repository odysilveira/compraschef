import type { ContaBancariaRestaurante, DB, TipoContaBancaria } from "../types";

/** Atalhos genéricos quando o restaurante ainda não cadastrou contas. */
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

export const BANCOS_COMUNS = [
  "Itaú",
  "Bradesco",
  "Banco do Brasil",
  "Caixa",
  "Nubank",
  "Sicoob",
  "Sicredi",
  "Santander",
  "Inter",
  "C6 Bank",
] as const;

export const ROTULO_TIPO_CONTA: Record<TipoContaBancaria, string> = {
  corrente: "conta corrente",
  poupanca: "poupança",
  pagamento: "conta pagamento",
};

export function rotuloContaBancaria(conta: ContaBancariaRestaurante): string {
  const detalhe = conta.apelido?.trim() || ROTULO_TIPO_CONTA[conta.tipo] || "conta";
  return `${conta.banco.trim()} — ${detalhe}`;
}

/** Contas ativas cadastradas; se vazio, usa atalhos genéricos. */
export function opcoesOrigemPagamento(db: Pick<DB, "contas_bancarias">): string[] {
  const cadastradas = (db.contas_bancarias ?? [])
    .filter((c) => c.ativa)
    .sort((a, b) => {
      if (Boolean(a.padrao) !== Boolean(b.padrao)) return a.padrao ? -1 : 1;
      return a.banco.localeCompare(b.banco, "pt-BR");
    })
    .map(rotuloContaBancaria);
  if (cadastradas.length > 0) return cadastradas;
  return [...CONTAS_ORIGEM_PAGAMENTO];
}

export function temContasCadastradas(db: Pick<DB, "contas_bancarias">): boolean {
  return (db.contas_bancarias ?? []).some((c) => c.ativa);
}

export function contaPadraoOrigem(db: Pick<DB, "contas_bancarias">): string {
  return opcoesOrigemPagamento(db)[0] ?? "";
}
