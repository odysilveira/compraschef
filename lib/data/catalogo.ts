// Catálogo real das caixas/porcionamentos do restaurante.
// Fonte única: alimenta os produtos do sistema (seed + atualização) e a página de etiquetas.
// Porcionamento: a cozinha empacota em sacos plásticos (15, 20, 30... conforme a matéria-prima)
// e cada caixa guarda N sacos de um produto, com vencimento controlado.

import type { Local, Produto, Unidade } from "@/lib/types";

export const UNIDADE_SACO: Unidade = { id: "un-saco", codigo_externo: "SC", nome: "saco (porção)", sigla: "sc" };

export const LOCAL_ESTOQUE_SECO: Local = { id: "loc-estoque-seco", nome: "Estoque seco", tipo: "despensa" };
export const LOCAL_GELADEIRA_2: Local = { id: "loc-geladeira2", nome: "Geladeira 2", tipo: "geladeira" };

/** Regra da casa: vencimento sugerido pelo destino do saco. */
export const VALIDADE_FREEZER_DIAS = 90; // 3 meses
export const VALIDADE_GELADEIRA_DIAS = 5;
export const VALIDADE_ESTOQUE_SECO_DIAS = 180;

export const SABORES_FREEZER = [
  "Camarão",
  "Bolonhesa",
  "4 Queijos",
  "Parisiense",
  "Presunto",
  "Cheddar e bacon",
  "Carne com cheddar e bacon",
  "Funghi",
  "Brócolis",
  "Ragu de costela",
  "Frango",
  "Frango com requeijão",
];

export const MASSAS_GELADEIRA = [
  "Caracolino",
  "Talharim",
  "Talharim integral",
  "Talharim proteico",
  "Penne",
  "Risotos",
];

export const ITENS_ESTOQUE_SECO = ["Creme culinário", "Molho de tomate"];

function slug(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

/** Produtos reais do restaurante (porcionados G/P + estoque seco), com ids fixos. */
export function produtosReais(): Produto[] {
  const lista: Produto[] = [];

  for (const nome of SABORES_FREEZER) {
    for (const tamanho of ["G", "P"] as const) {
      lista.push({
        id: `prod-cz-${slug(nome)}-${tamanho.toLowerCase()}`,
        nome: `${nome} ${tamanho}`,
        categoria: "porcionados (freezer)",
        tipo: "produzido",
        unidade_uso_id: UNIDADE_SACO.id,
        fator_conversao: 1,
        estoque_minimo: 0,
        controla_lote: false,
        controla_validade: false,
        validade_padrao_dias: VALIDADE_FREEZER_DIAS,
        ativo: true,
      });
    }
  }

  for (const nome of MASSAS_GELADEIRA) {
    for (const tamanho of ["G", "P"] as const) {
      lista.push({
        id: `prod-cz-${slug(nome)}-${tamanho.toLowerCase()}`,
        nome: `${nome} ${tamanho}`,
        categoria: "massas (geladeira)",
        tipo: "produzido",
        unidade_uso_id: UNIDADE_SACO.id,
        fator_conversao: 1,
        estoque_minimo: 0,
        controla_lote: false,
        controla_validade: false,
        validade_padrao_dias: VALIDADE_GELADEIRA_DIAS,
        ativo: true,
      });
    }
  }

  for (const nome of ITENS_ESTOQUE_SECO) {
    lista.push({
      id: `prod-cz-${slug(nome)}`,
      nome,
      categoria: "estoque seco",
      tipo: "comprado",
      unidade_uso_id: "un-un",
      fator_conversao: 1,
      estoque_minimo: 0,
      controla_lote: false,
      controla_validade: false,
      validade_padrao_dias: VALIDADE_ESTOQUE_SECO_DIAS,
      ativo: true,
    });
  }

  return lista;
}
