import type { Caixa, DB, EventoOperacaoBox, PosicaoFisicaBox, TipoBox } from "../types";
import { uid } from "../data";
import { alocacaoAtivaDaCaixa } from "./estoque";

export type { TipoBox, PosicaoFisicaBox } from "../types";

export const TIPOS_BOX: readonly TipoBox[] = ["NAO_CLASSIFICADO", "RESERVA", "OPERACIONAL", "QUARENTENA"];

export const POSICOES_BOX: readonly PosicaoFisicaBox[] = ["FRENTE", "TRAS", "ISOLADA", "OUTRA", "NAO_INFORMADA"];

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

export function produtoOperacionalEfetivo(caixa: Pick<Caixa, "produto_operacional_alvo_id" | "produto_id">): string | undefined {
  return caixa.produto_operacional_alvo_id ?? caixa.produto_id;
}

export function boxOperacionalTemDestinacaoAtiva(caixa: Pick<Caixa, "produto_operacional_alvo_id">): boolean {
  return Boolean(caixa.produto_operacional_alvo_id);
}

export function ativarDestinacaoOperacional(
  db: DB,
  params: {
    boxId: string;
    produtoId: string;
    usuarioId: string;
    motivo?: string;
    agora?: string;
  }
): EventoOperacaoBox {
  const caixa = db.caixas.find((item) => item.id === params.boxId);
  const produto = db.produtos.find((item) => item.id === params.produtoId);
  if (!caixa) throw new Error("Box não encontrado.");
  if (!produto) throw new Error("Produto/porcionamento alvo não encontrado.");
  if (caixa.tipo_box !== "OPERACIONAL") {
    throw new Error("Apenas Box Operacional pode receber destinação ativa.");
  }
  if (caixa.produto_operacional_alvo_id) {
    throw new Error("Este Box Operacional já possui destinação ativa.");
  }
  if (caixa.produto_id && caixa.produto_id !== params.produtoId) {
    throw new Error("Não é permitido trocar diretamente o produto do Box Operacional.");
  }
  const saldoAtual = caixa.quantidade ?? 0;
  if (!caixa.local_id) {
    throw new Error("Local físico não definido — configure o box antes da operação.");
  }
  if (saldoAtual > 0 || caixa.status !== "vazia" || alocacaoAtivaDaCaixa(db, caixa.id)) {
    throw new Error("Ativação exige Box Operacional vazio e sem alocação ativa.");
  }

  const agora = params.agora ?? new Date().toISOString();
  const numeroOriginal = caixa.numero;
  const qrOriginal = caixa.qr_code;
  caixa.produto_operacional_alvo_id = params.produtoId;
  caixa.destinacao_operacional_inicio_em = agora;
  caixa.destinacao_operacional_responsavel_id = params.usuarioId;
  caixa.atualizado_em = agora;
  caixa.numero = numeroOriginal;
  caixa.qr_code = qrOriginal;

  const evento: EventoOperacaoBox = {
    id: uid("evt-dest-ativa"),
    tipo: "destinacao_operacional_ativada",
    box_id: caixa.id,
    box_numero: caixa.numero,
    qr_code: caixa.qr_code,
    sessao_id: params.boxId,
    produto_id: params.produtoId,
    motivo: params.motivo,
    usuario_id: params.usuarioId,
    criado_em: agora,
  };
  db.eventos_box_operacional.unshift(evento);
  return evento;
}

export function encerrarDestinacaoOperacional(
  db: DB,
  params: {
    boxId: string;
    usuarioId: string;
    higienizacaoConfirmada: boolean;
    motivo?: string;
    agora?: string;
  }
): EventoOperacaoBox {
  const caixa = db.caixas.find((item) => item.id === params.boxId);
  if (!caixa) throw new Error("Box não encontrado.");
  if (caixa.tipo_box !== "OPERACIONAL") {
    throw new Error("Apenas Box Operacional pode encerrar destinação ativa.");
  }
  if (!caixa.produto_operacional_alvo_id) {
    throw new Error("Este Box Operacional não possui destinação ativa.");
  }
  if ((caixa.quantidade ?? 0) > 0) {
    throw new Error("Encerramento exige saldo zero.");
  }
  if (alocacaoAtivaDaCaixa(db, caixa.id)) {
    throw new Error("Encerramento exige ausência de alocação ativa.");
  }
  if (!params.higienizacaoConfirmada) {
    throw new Error("Confirmação de higienização obrigatória para encerrar a destinação.");
  }

  const agora = params.agora ?? new Date().toISOString();
  const produtoId = caixa.produto_operacional_alvo_id;
  const numeroOriginal = caixa.numero;
  const qrOriginal = caixa.qr_code;
  caixa.produto_operacional_alvo_id = undefined;
  caixa.destinacao_operacional_inicio_em = undefined;
  caixa.destinacao_operacional_responsavel_id = undefined;
  caixa.atualizado_em = agora;
  caixa.numero = numeroOriginal;
  caixa.qr_code = qrOriginal;

  const evento: EventoOperacaoBox = {
    id: uid("evt-dest-encerra"),
    tipo: "destinacao_operacional_encerrada",
    box_id: caixa.id,
    box_numero: caixa.numero,
    qr_code: caixa.qr_code,
    sessao_id: params.boxId,
    produto_id: produtoId,
    motivo: params.motivo,
    higienizacao_confirmada: true,
    encerrado_por_id: params.usuarioId,
    usuario_id: params.usuarioId,
    criado_em: agora,
  };
  db.eventos_box_operacional.unshift(evento);
  return evento;
}

export function aplicarMetadadosBox(
  caixa: Caixa,
  patch: Partial<Pick<Caixa, "numero" | "qr_code" | "tipo_box" | "posicao_fisica" | "local_id">>
): Caixa {
  return {
    ...caixa,
    numero: patch.numero ?? caixa.numero,
    qr_code: patch.qr_code ?? caixa.qr_code,
    tipo_box: patch.tipo_box ?? caixa.tipo_box,
    posicao_fisica: patch.posicao_fisica ?? caixa.posicao_fisica,
    local_id: "local_id" in patch ? patch.local_id : caixa.local_id,
  };
}
