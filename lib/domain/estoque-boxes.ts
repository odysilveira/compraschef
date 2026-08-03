import type { Caixa } from "../types";

export const TIPOS_BOX = ["NAO_CLASSIFICADO", "RESERVA", "OPERACIONAL", "QUARENTENA"] as const;
export type TipoBox = (typeof TIPOS_BOX)[number];

export const POSICOES_BOX = ["FRENTE", "TRAS", "ISOLADA", "OUTRA", "NAO_INFORMADA"] as const;
export type PosicaoFisicaBox = (typeof POSICOES_BOX)[number];

export const ROTULO_TIPO_BOX: Record<TipoBox, string> = {
  NAO_CLASSIFICADO: "Não classificado",
  RESERVA: "Reserva",
  OPERACIONAL: "Operacional",
  QUARENTENA: "Quarentena",
};

export const ROTULO_POSICAO_BOX: Record<PosicaoFisicaBox, string> = {
  FRENTE: "Frente",
  TRAS: "Trás",
  ISOLADA: "Isolada",
  OUTRA: "Outra",
  NAO_INFORMADA: "Não informada",
};

export const SUPORTA_TRANSFERENCIAS_ENTRE_BOXES = false;

export function validarTipoBox(valor: string): valor is TipoBox {
  return TIPOS_BOX.includes(valor as TipoBox);
}

export function validarPosicaoFisicaBox(valor: string): valor is PosicaoFisicaBox {
  return POSICOES_BOX.includes(valor as PosicaoFisicaBox);
}

export function avisoIncompatibilidadeBox(params: Pick<Caixa, "tipo_box" | "posicao_fisica">): string | null {
  if (params.tipo_box === "OPERACIONAL" && params.posicao_fisica === "TRAS") {
    return "Box Operacional deveria ficar preferencialmente na frente.";
  }

  if (params.tipo_box === "RESERVA" && params.posicao_fisica === "FRENTE") {
    return "Box Reserva deveria ficar preferencialmente atrás.";
  }

  if (params.tipo_box === "QUARENTENA" && params.posicao_fisica !== "ISOLADA") {
    return "Box Quarentena deveria ficar preferencialmente isolado.";
  }

  return null;
}

export function boxEstaClassificado(caixa: Pick<Caixa, "tipo_box">): boolean {
  return caixa.tipo_box !== "NAO_CLASSIFICADO";
}

export function boxEstaAptoParaFluxoOperacionalFuturo(caixa: Pick<Caixa, "tipo_box">): boolean {
  return caixa.tipo_box === "RESERVA" || caixa.tipo_box === "OPERACIONAL";
}

export function aplicarMetadadosBox(
  caixa: Caixa,
  patch: Partial<Pick<Caixa, "numero" | "qr_code" | "tipo_box" | "posicao_fisica">>
): Caixa {
  return {
    ...caixa,
    numero: patch.numero ?? caixa.numero,
    qr_code: patch.qr_code ?? caixa.qr_code,
    tipo_box: patch.tipo_box ?? caixa.tipo_box,
    posicao_fisica: patch.posicao_fisica ?? caixa.posicao_fisica,
  };
}
