import type { Produto } from "@/lib/types";

function numeroPositivo(valor?: number): number | undefined {
  return valor !== undefined && Number.isFinite(valor) && valor > 0 ? valor : undefined;
}

function fatorValido(fator?: number): number {
  const f = Number(fator);
  return Number.isFinite(f) && f > 0 ? f : 1;
}

/** Custo por unidade de uso a partir do preço da embalagem de compra. */
export function custoUsoDeEmbalagem(precoEmbalagem: number, fatorConversao?: number): number {
  const fator = fatorValido(fatorConversao);
  return Math.round((precoEmbalagem / fator) * 1e6) / 1e6;
}

/** Preço da embalagem a partir do custo por unidade de uso. */
export function precoEmbalagemDeCustoUso(custoUso: number, fatorConversao?: number): number {
  const fator = fatorValido(fatorConversao);
  return Math.round(custoUso * fator * 1e6) / 1e6;
}

/**
 * Preço de referência para cotação / pesquisa de mercado:
 * embalagem de compra, senão custo_uso × fator, senão custo_uso.
 */
export function precoReferenciaCotacao(produto: Pick<Produto, "preco_embalagem_compra" | "custo_unitario" | "fator_conversao">): number | undefined {
  const embalagem = numeroPositivo(produto.preco_embalagem_compra);
  if (embalagem !== undefined) return embalagem;

  const custo = numeroPositivo(produto.custo_unitario);
  if (custo === undefined) return undefined;

  const fator = fatorValido(produto.fator_conversao);
  if (fator === 1) return custo;
  return precoEmbalagemDeCustoUso(custo, fator);
}

/** Completa preço de embalagem ausente a partir do custo de uso × fator (legado). */
export function completarPrecoEmbalagemLegado(produto: Produto): boolean {
  if (numeroPositivo(produto.preco_embalagem_compra) !== undefined) return false;
  const custo = numeroPositivo(produto.custo_unitario);
  if (custo === undefined) return false;
  produto.preco_embalagem_compra = precoEmbalagemDeCustoUso(custo, produto.fator_conversao);
  return true;
}
