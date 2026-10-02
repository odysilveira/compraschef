import type { CanalVendaFichaTecnica, FichaTecnicaCanalPreco } from "../types";

export const MENSAGEM_DADOS_COMERCIAIS_PENDENTES = "Preencha os dados comerciais";

/** Canais usados na precificação atual (Loja/Saipos, iFood, 99). */
export const CANAIS_VENDA_ATIVOS: readonly CanalVendaFichaTecnica[] = [
  "balcao",
  "ifood",
  "delivery_99",
] as const;

export const ROTULO_CANAL_VENDA: Record<CanalVendaFichaTecnica, string> = {
  balcao: "Loja / Saipos",
  ifood: "iFood",
  delivery_99: "99",
  salao: "Salão (legado)",
  delivery_proprio: "Delivery próprio (legado)",
};

export type CampoComercialFichaTecnica = Exclude<keyof FichaTecnicaCanalPreco, "canal">;

export type PrecificacaoCanalCalculada = FichaTecnicaCanalPreco & {
  custo: number;
  custoTotal: number | null;
  margemReais: number | null;
  margemPercentual: number | null;
  cmv: number | null;
  precoSugerido: number | null;
  dadosComerciaisPreenchidos: boolean;
};

function numeroSeguro(valor?: number): number {
  if (valor === undefined || Number.isNaN(valor) || !Number.isFinite(valor)) return 0;
  return valor;
}

function canalVazio(canal: CanalVendaFichaTecnica): FichaTecnicaCanalPreco {
  return {
    canal,
    preco_praticado: 0,
    taxa_percentual: 0,
    taxa_fixa: 0,
    impostos_percentual: 0,
    cmv_desejado_percentual: 0,
  };
}

export function canaisPadraoSemPremissa(): FichaTecnicaCanalPreco[] {
  return CANAIS_VENDA_ATIVOS.map((canal) => canalVazio(canal));
}

function canalTemDadosComerciais(canal: FichaTecnicaCanalPreco): boolean {
  return (
    numeroSeguro(canal.preco_praticado) > 0 ||
    numeroSeguro(canal.taxa_percentual) > 0 ||
    numeroSeguro(canal.taxa_fixa) > 0 ||
    numeroSeguro(canal.impostos_percentual) > 0 ||
    numeroSeguro(canal.cmv_desejado_percentual) > 0
  );
}

function mesclarCanal(
  preferido: FichaTecnicaCanalPreco | undefined,
  fallback: FichaTecnicaCanalPreco | undefined,
  canal: CanalVendaFichaTecnica
): FichaTecnicaCanalPreco {
  const base = canalVazio(canal);
  const fonte =
    preferido && canalTemDadosComerciais(preferido)
      ? preferido
      : fallback && canalTemDadosComerciais(fallback)
        ? fallback
        : preferido ?? fallback;
  if (!fonte) return base;
  return {
    canal,
    preco_praticado: numeroSeguro(fonte.preco_praticado),
    taxa_percentual: numeroSeguro(fonte.taxa_percentual),
    taxa_fixa: numeroSeguro(fonte.taxa_fixa),
    impostos_percentual: numeroSeguro(fonte.impostos_percentual),
    cmv_desejado_percentual: numeroSeguro(fonte.cmv_desejado_percentual),
  };
}

/**
 * Normaliza canais de fichas antigas para Loja/Saipos + iFood + 99.
 * Se balcão estiver vazio e salão tiver preço, copia salão → balcão.
 */
export function normalizarCanaisPrecoFicha(
  canais: FichaTecnicaCanalPreco[] | undefined | null
): FichaTecnicaCanalPreco[] {
  const lista = Array.isArray(canais) ? canais : [];
  const porCanal = new Map<CanalVendaFichaTecnica, FichaTecnicaCanalPreco>();
  for (const item of lista) {
    if (!item?.canal) continue;
    porCanal.set(item.canal, item);
  }

  return [
    mesclarCanal(porCanal.get("balcao"), porCanal.get("salao"), "balcao"),
    mesclarCanal(porCanal.get("ifood"), undefined, "ifood"),
    mesclarCanal(porCanal.get("delivery_99"), porCanal.get("delivery_proprio"), "delivery_99"),
  ];
}

export function campoComercialNaoInformado(
  canal: FichaTecnicaCanalPreco,
  campo: CampoComercialFichaTecnica
): boolean {
  return !canalTemDadosComerciais(canal) && numeroSeguro(canal[campo] as number | undefined) === 0;
}

function canalTemDadosSuficientes(canal: FichaTecnicaCanalPreco): boolean {
  return numeroSeguro(canal.preco_praticado) > 0 && numeroSeguro(canal.cmv_desejado_percentual) > 0;
}

export function calcularPrecificacaoPorCanal(
  canais: FichaTecnicaCanalPreco[],
  custoPorPorcaoCent: number
): PrecificacaoCanalCalculada[] {
  const custo = numeroSeguro(custoPorPorcaoCent) / 100;
  const canaisNormais = normalizarCanaisPrecoFicha(canais);

  return canaisNormais.map((canal) => {
    const preco = numeroSeguro(canal.preco_praticado);
    const taxaPercentual = numeroSeguro(canal.taxa_percentual);
    const taxaFixa = numeroSeguro(canal.taxa_fixa);
    const impostos = numeroSeguro(canal.impostos_percentual);
    const cmvDesejado = numeroSeguro(canal.cmv_desejado_percentual);
    const dadosComerciaisPreenchidos = canalTemDadosSuficientes(canal);

    if (!dadosComerciaisPreenchidos) {
      return {
        ...canal,
        custo,
        custoTotal: null,
        margemReais: null,
        margemPercentual: null,
        cmv: null,
        precoSugerido: null,
        dadosComerciaisPreenchidos,
      };
    }

    const taxaPercentualReais = preco * (taxaPercentual / 100);
    const impostosReais = preco * (impostos / 100);
    const custoTotal = custo + taxaPercentualReais + impostosReais + taxaFixa;
    const margemReais = preco - custoTotal;
    const margemPercentual = preco > 0 ? (margemReais / preco) * 100 : null;
    const cmv = preco > 0 ? (custo / preco) * 100 : null;
    const precoSugerido = cmvDesejado > 0 ? custo / (cmvDesejado / 100) : null;

    return {
      ...canal,
      custo,
      custoTotal: Number.isFinite(custoTotal) ? custoTotal : null,
      margemReais: Number.isFinite(margemReais) ? margemReais : null,
      margemPercentual:
        margemPercentual !== null && Number.isFinite(margemPercentual) ? margemPercentual : null,
      cmv: cmv !== null && Number.isFinite(cmv) ? cmv : null,
      precoSugerido: precoSugerido !== null && Number.isFinite(precoSugerido) ? precoSugerido : null,
      dadosComerciaisPreenchidos,
    };
  });
}

export function rotuloCanalVenda(canal: CanalVendaFichaTecnica): string {
  return ROTULO_CANAL_VENDA[canal] ?? canal;
}
