import type { SegmentoCodigoBarrasItf } from "./pagar-boleto";

export const CLASSE_GRID_CODIGO_PAGAMENTO = "grid gap-4 lg:grid-cols-[minmax(0,35%)_minmax(0,65%)]";
export const CLASSE_CAIXA_CODIGO_SEM_ROLAGEM = "flex w-full justify-center overflow-hidden rounded-card border border-slate-200 bg-white px-6 py-4";

export interface RetanguloCodigoSvg {
  x: number;
  largura: number;
}

export interface ConfiguracaoSvgCodigoPagamento {
  viewBox: string;
  altura: number;
  larguraModulos: number;
  quietZone: number;
  retangulos: RetanguloCodigoSvg[];
}

export interface EstadoCodigoAmpliado {
  boletoId: string;
  codigoCanonico: string;
  fornecedor: string;
  valor: number;
  vencimento: string;
}

function larguraModulo(segmento: SegmentoCodigoBarrasItf): number {
  return segmento.largo ? 3 : 1;
}

export function modulosTotaisCodigo(segmentos: SegmentoCodigoBarrasItf[]): number {
  return segmentos.reduce((total, segmento) => total + larguraModulo(segmento), 0);
}

export function montarConfiguracaoSvgCodigo(
  segmentos: SegmentoCodigoBarrasItf[],
  modo: "linha" | "ampliado"
): ConfiguracaoSvgCodigoPagamento {
  const quietZone = modo === "ampliado" ? 38 : 28;
  const altura = modo === "ampliado" ? 160 : 120;
  const larguraModulos = modulosTotaisCodigo(segmentos);

  const retangulos: RetanguloCodigoSvg[] = [];
  let cursor = quietZone;
  for (const segmento of segmentos) {
    const largura = larguraModulo(segmento);
    if (segmento.tipo === "bar") {
      retangulos.push({ x: cursor, largura });
    }
    cursor += largura;
  }

  const larguraTotal = larguraModulos + quietZone * 2;
  return {
    viewBox: `0 0 ${larguraTotal} ${altura}`,
    altura,
    larguraModulos,
    quietZone,
    retangulos,
  };
}

export function acoesUnicasQuandoCodigoAberto(): string[] {
  return [
    "mostrar_ou_ocultar_linha",
    "copiar_linha",
    "ampliar_codigo",
    "informar_pagamento",
    "ocultar_codigo",
  ];
}

export function abrirCodigoAmpliado(estado: EstadoCodigoAmpliado): EstadoCodigoAmpliado {
  return { ...estado };
}

export function fecharCodigoAmpliado(): null {
  return null;
}
