/**
 * Constantes padrão da tabela de preços da franquia.
 * A aplicação dos preços na UI é feita por importação de Excel
 * (Fichas técnicas → Importar Excel da franquia).
 *
 * Loja = Saipos = balcão = salão. iFood e 99 podem divergir.
 */

import type { PrecoFranquiaLinha } from "@/lib/domain/tabela-precos-venda";

/** Taxas padrão sugeridas até a franquia informar o contrato vigente. */
export const TAXA_IFOOD_PADRAO_PERCENTUAL = 12;
export const TAXA_99_PADRAO_PERCENTUAL = 12;
export const CMV_DESEJADO_PADRAO_PERCENTUAL = 30;

/**
 * Lista embutida opcional (legado / testes). Prefira importar o .xlsx na tela.
 */
export const TABELA_PRECOS_FRANQUIA: PrecoFranquiaLinha[] = [];

export function tabelaFranquiaProntaParaAplicar(): boolean {
  return TABELA_PRECOS_FRANQUIA.some(
    (linha) => (linha.preco_loja ?? 0) > 0 || (linha.preco_ifood ?? 0) > 0 || (linha.preco_99 ?? 0) > 0
  );
}
