import type { FichaTecnicaCanalPreco } from "../types";

export const MENSAGEM_DADOS_COMERCIAIS_PENDENTES = "Preencha os dados comerciais";

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

export function canaisPadraoSemPremissa(): FichaTecnicaCanalPreco[] {
  return [
    { canal: "salao", preco_praticado: 0, taxa_percentual: 0, taxa_fixa: 0, impostos_percentual: 0, cmv_desejado_percentual: 0 },
    { canal: "balcao", preco_praticado: 0, taxa_percentual: 0, taxa_fixa: 0, impostos_percentual: 0, cmv_desejado_percentual: 0 },
    { canal: "delivery_proprio", preco_praticado: 0, taxa_percentual: 0, taxa_fixa: 0, impostos_percentual: 0, cmv_desejado_percentual: 0 },
    { canal: "ifood", preco_praticado: 0, taxa_percentual: 0, taxa_fixa: 0, impostos_percentual: 0, cmv_desejado_percentual: 0 },
  ];
}

export function campoComercialNaoInformado(
  canal: FichaTecnicaCanalPreco,
  campo: CampoComercialFichaTecnica
): boolean {
  return !canalTemDadosComerciais(canal) && numeroSeguro(canal[campo] as number | undefined) === 0;
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

function canalTemDadosSuficientes(canal: FichaTecnicaCanalPreco): boolean {
  return numeroSeguro(canal.preco_praticado) > 0 && numeroSeguro(canal.cmv_desejado_percentual) > 0;
}

export function calcularPrecificacaoPorCanal(
  canais: FichaTecnicaCanalPreco[],
  custoPorPorcaoCent: number
): PrecificacaoCanalCalculada[] {
  const custo = numeroSeguro(custoPorPorcaoCent) / 100;

  return canais.map((canal) => {
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