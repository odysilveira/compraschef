/**
 * Precificação oficial Box G — Londrina Gleba Fazenda Palhano
 * Fonte: "Precificação - Londrina - Gleba Fazenda Palhano.xlsx" (Nova precificação).
 * Loja = Vendas diretas / Saipos. iFood = canal iFood. 99 não veio na planilha.
 */

import type { PrecoFranquiaLinha } from "@/lib/domain/tabela-precos-venda";
import {
  CMV_DESEJADO_PADRAO_PERCENTUAL,
  TAXA_99_PADRAO_PERCENTUAL,
  TAXA_IFOOD_PADRAO_PERCENTUAL,
} from "./tabela-precos-franquia";

const MASSAS = [
  { codigoPrefixo: "IT-PENNE", nome: "Penne" },
  { codigoPrefixo: "IT-PENNE-INTEGRAL", nome: "Penne integral" },
  { codigoPrefixo: "IT-CARACOLINO", nome: "Caracolino" },
  { codigoPrefixo: "IT-TALHARIM", nome: "Talharim" },
] as const;

/** Sabores Box G com preços da planilha (Nova precificação). */
const SABORES_G: Array<{
  slugCodigo: string;
  nome: string;
  loja: number;
  ifood: number;
}> = [
  { slugCodigo: "POMODORO", nome: "Pomodoro", loja: 38.9, ifood: 42.9 },
  { slugCodigo: "BOLONHESA", nome: "Bolonhesa", loja: 46.9, ifood: 54.9 },
  { slugCodigo: "BROCOLI", nome: "Brócoli", loja: 48.9, ifood: 56.9 },
  { slugCodigo: "CHEDDAR", nome: "Cheddar", loja: 49.9, ifood: 57.9 },
  { slugCodigo: "PARISIENSE", nome: "Parisiense", loja: 46.9, ifood: 55.9 },
  { slugCodigo: "4-QUEIJOS", nome: "4 queijos", loja: 50.9, ifood: 58.9 },
  { slugCodigo: "CAMARAO", nome: "Camarão", loja: 64.9, ifood: 76.9 },
  { slugCodigo: "FUNGHI", nome: "Funghi", loja: 54.9, ifood: 64.9 },
  { slugCodigo: "RAGU-COSTELA", nome: "Ragu de costela", loja: 58.9, ifood: 68.9 },
];

function montarTabela(): PrecoFranquiaLinha[] {
  const linhas: PrecoFranquiaLinha[] = [];
  for (const massa of MASSAS) {
    for (const sabor of SABORES_G) {
      linhas.push({
        codigo: `${massa.codigoPrefixo}-${sabor.slugCodigo}`,
        nome: `${massa.nome} ${sabor.nome}`,
        preco_loja: sabor.loja,
        preco_ifood: sabor.ifood,
        taxa_ifood_percentual: TAXA_IFOOD_PADRAO_PERCENTUAL,
        taxa_99_percentual: TAXA_99_PADRAO_PERCENTUAL,
        cmv_desejado_percentual: CMV_DESEJADO_PADRAO_PERCENTUAL,
      });
    }
  }
  return linhas;
}

export const PRECOS_FRANQUIA_LONDINA_BOX_G: PrecoFranquiaLinha[] = montarTabela();
