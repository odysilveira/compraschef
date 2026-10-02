/**
 * Tour Londrina — promoção ~9 meses: paga 1 prato, leva outro igual ou de menor valor.
 * CMV do combo é separado do CMV por canal (não misturar com preço cheio).
 */

import type { AdicionalTourLondrina, ConfigTourLondrina } from "../types";

export type { AdicionalTourLondrina, ConfigTourLondrina };

export interface PratoTourLondrina {
  receita_id: string;
  nome: string;
  /** Preço de loja/Saipos do prato. */
  preco_loja: number;
  /** Custo da porção (ficha). */
  custo_porcao: number;
}

export interface ResultadoCmvTourLondrina {
  valido: boolean;
  erros: string[];
  receita: number;
  custo: number;
  cmv_percentual: number | null;
  margem_reais: number | null;
  margem_percentual: number | null;
  preco_pago: number;
  preco_ganho: number;
  custo_pratos: number;
  custo_adicionais: number;
  receita_adicionais: number;
}

function numeroSeguro(valor?: number): number {
  if (valor === undefined || Number.isNaN(valor) || !Number.isFinite(valor)) return 0;
  return valor;
}

export function configTourLondrinaVazia(): ConfigTourLondrina {
  return {
    pratos_elegiveis_ids: [],
    adicionais_padrao: [
      { id: "tour-add-proteina", nome: "Dobrar proteína", preco_venda: 0, custo: 0 },
      { id: "tour-add-sobremesa", nome: "Sobremesa", preco_venda: 0, custo: 0 },
      { id: "tour-add-bebida", nome: "Bebida", preco_venda: 0, custo: 0 },
    ],
  };
}

export function validarSegundoPratoTour(
  pago: Pick<PratoTourLondrina, "preco_loja" | "nome">,
  ganho: Pick<PratoTourLondrina, "preco_loja" | "nome">
): string[] {
  const erros: string[] = [];
  if (numeroSeguro(pago.preco_loja) <= 0) {
    erros.push(`Informe o preço de loja do prato pago (${pago.nome || "—"}).`);
  }
  if (numeroSeguro(ganho.preco_loja) <= 0) {
    erros.push(`Informe o preço de loja do prato ganho (${ganho.nome || "—"}).`);
  }
  if (
    numeroSeguro(pago.preco_loja) > 0 &&
    numeroSeguro(ganho.preco_loja) > numeroSeguro(pago.preco_loja) + 0.001
  ) {
    erros.push(
      `O 2º prato (${ganho.nome}) deve custar igual ou menos que o pago (${pago.nome}): ${ganho.preco_loja.toFixed(2)} > ${pago.preco_loja.toFixed(2)}.`
    );
  }
  return erros;
}

/**
 * CMV do ticket Tour: receita = preço do pago + adicionais cobrados;
 * custo = custo dos dois pratos + custo dos adicionais.
 */
export function calcularCmvTourLondrina(
  pago: PratoTourLondrina,
  ganho: PratoTourLondrina,
  adicionais: AdicionalTourLondrina[] = []
): ResultadoCmvTourLondrina {
  const erros = validarSegundoPratoTour(pago, ganho);
  const receitaAdicionais = adicionais.reduce((s, a) => s + numeroSeguro(a.preco_venda), 0);
  const custoAdicionais = adicionais.reduce((s, a) => s + numeroSeguro(a.custo), 0);
  const precoPago = numeroSeguro(pago.preco_loja);
  const precoGanho = numeroSeguro(ganho.preco_loja);
  const custoPratos = numeroSeguro(pago.custo_porcao) + numeroSeguro(ganho.custo_porcao);
  const receita = precoPago + receitaAdicionais;
  const custo = custoPratos + custoAdicionais;

  if (erros.length > 0) {
    return {
      valido: false,
      erros,
      receita,
      custo,
      cmv_percentual: null,
      margem_reais: null,
      margem_percentual: null,
      preco_pago: precoPago,
      preco_ganho: precoGanho,
      custo_pratos: custoPratos,
      custo_adicionais: custoAdicionais,
      receita_adicionais: receitaAdicionais,
    };
  }

  const margem = receita - custo;
  const cmv = receita > 0 ? (custo / receita) * 100 : null;
  const margemPct = receita > 0 ? (margem / receita) * 100 : null;

  return {
    valido: true,
    erros: [],
    receita,
    custo,
    cmv_percentual: cmv !== null && Number.isFinite(cmv) ? Number(cmv.toFixed(2)) : null,
    margem_reais: Number.isFinite(margem) ? Number(margem.toFixed(2)) : null,
    margem_percentual:
      margemPct !== null && Number.isFinite(margemPct) ? Number(margemPct.toFixed(2)) : null,
    preco_pago: precoPago,
    preco_ganho: precoGanho,
    custo_pratos: custoPratos,
    custo_adicionais: custoAdicionais,
    receita_adicionais: receitaAdicionais,
  };
}

export function normalizarConfigTourLondrina(
  config: ConfigTourLondrina | undefined | null
): ConfigTourLondrina {
  const base = configTourLondrinaVazia();
  if (!config) return base;
  const ids = Array.isArray(config.pratos_elegiveis_ids)
    ? [...new Set(config.pratos_elegiveis_ids.filter(Boolean))].slice(0, 3)
    : [];
  const adicionais =
    Array.isArray(config.adicionais_padrao) && config.adicionais_padrao.length > 0
      ? config.adicionais_padrao.map((a, i) => ({
          id: a.id || `tour-add-${i}`,
          nome: a.nome?.trim() || `Adicional ${i + 1}`,
          preco_venda: numeroSeguro(a.preco_venda),
          custo: numeroSeguro(a.custo),
        }))
      : base.adicionais_padrao;
  return {
    pratos_elegiveis_ids: ids,
    adicionais_padrao: adicionais,
    atualizado_em: config.atualizado_em,
  };
}
