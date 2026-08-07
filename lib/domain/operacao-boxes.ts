import type { DB, EventoOperacaoBox } from "../types";
import { uid } from "../data";
import { ajustarLoteDaCaixa, loteDaCaixa, validarMotivoObrigatorio } from "./estoque";

export type TipoFiltroEventoOperacaoBox = EventoOperacaoBox["tipo"] | "todos";

export interface ConfirmacaoQrOperacaoBox {
  sessao_id: string;
  qr_confirmado: string;
  caixa_id?: string;
  produto_id?: string;
  lote_id?: string;
}

export interface ContextoBoxOperacional {
  boxId: string;
  qrCode: string;
  boxNumero: number;
  produtoId?: string;
  loteId?: string;
  validade?: string;
  saldoAtual: number;
}

export interface AberturaBoxOperacionalInput {
  sessaoId: string;
  usuarioId: string;
  qrAtual: string;
  confirmacao?: ConfirmacaoQrOperacaoBox;
  quantidadeContada: number;
  necessidadePrevista: number;
  justificativa?: string;
}

export interface AberturaBoxOperacionalResultado {
  abertura: EventoOperacaoBox;
  divergencia?: EventoOperacaoBox;
  ajuste?: EventoOperacaoBox;
  reposicaoSugerida: number;
}

export interface FechamentoBoxOperacionalInput {
  sessaoId: string;
  usuarioId: string;
  qrAtual: string;
  confirmacao?: ConfirmacaoQrOperacaoBox;
  quantidadeContada: number;
  justificativa?: string;
}

export interface FechamentoBoxOperacionalResultado {
  fechamento: EventoOperacaoBox;
  divergencia?: EventoOperacaoBox;
  ajuste?: EventoOperacaoBox;
}

export interface ReposicaoBoxOperacionalInput {
  sessaoId: string;
  usuarioId: string;
  origemQr: string;
  destinoQr: string;
  quantidade: number;
  movimentoId: string;
  alocacaoDestinoId: string;
}

function normalizar(valor: string | undefined): string {
  return (valor ?? "").trim();
}

function caixaPorQr(db: DB, qrCode: string) {
  const normalizado = normalizar(qrCode).toLowerCase();
  return db.caixas.find((caixa) => caixa.qr_code.toLowerCase() === normalizado);
}

function produtoOperacionalEfetivo(caixa: { produto_operacional_alvo_id?: string; produto_id?: string }): string | undefined {
  return caixa.produto_operacional_alvo_id ?? caixa.produto_id;
}

function ultimoEventoDoBox(db: DB, boxId: string, tipos: EventoOperacaoBox["tipo"][]): EventoOperacaoBox | undefined {
  return db.eventos_box_operacional
    .filter((evento) => evento.box_id === boxId && tipos.includes(evento.tipo))
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0];
}

export function ultimoFechamentoDoBox(db: DB, boxId: string): EventoOperacaoBox | undefined {
  return ultimoEventoDoBox(db, boxId, ["fechamento"]);
}

export function ultimaAberturaDoBox(db: DB, boxId: string): EventoOperacaoBox | undefined {
  return ultimoEventoDoBox(db, boxId, ["abertura"]);
}

export function eventosOperacaoBoxOrdenados(db: DB): EventoOperacaoBox[] {
  return [...db.eventos_box_operacional].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
}

export function filtrarEventosOperacaoBox(
  db: DB,
  filtros: { data?: string; boxId?: string; produtoId?: string; tipo?: TipoFiltroEventoOperacaoBox } = {}
): EventoOperacaoBox[] {
  return eventosOperacaoBoxOrdenados(db).filter((evento) => {
    if (filtros.boxId && evento.box_id !== filtros.boxId) return false;
    if (filtros.produtoId && evento.produto_id !== filtros.produtoId) return false;
    if (filtros.tipo && filtros.tipo !== "todos" && evento.tipo !== filtros.tipo) return false;
    if (filtros.data && !evento.criado_em.startsWith(filtros.data)) return false;
    return true;
  });
}

function registrarMovimentoAjuste(
  db: DB,
  params: {
    boxId: string;
    quantidadeAnterior: number;
    quantidadePosterior: number;
    usuarioId: string;
    motivo: string;
    justificativa?: string;
    agora: string;
    referenciaEventoId: string;
  }
): EventoOperacaoBox | undefined {
  const caixa = db.caixas.find((item) => item.id === params.boxId);
  if (!caixa) return undefined;
  const lote = loteDaCaixa(db, caixa.id);
  const delta = params.quantidadePosterior - params.quantidadeAnterior;
  if (delta === 0) return undefined;

  ajustarLoteDaCaixa(db, caixa.id, params.quantidadePosterior, params.agora);
  caixa.quantidade = params.quantidadePosterior;
  caixa.atualizado_em = params.agora;

  db.movimentos_estoque.unshift({
    id: uid("mov-ajuste"),
    produto_id: produtoOperacionalEfetivo(caixa) ?? "",
    caixa_id: caixa.id,
    caixa_origem_id: caixa.id,
    caixa_destino_id: caixa.id,
    lote_id: lote?.id,
    tipo: "ajuste_balanco",
    motivo: params.motivo,
    quantidade: delta,
    validade: lote?.validade,
    saldo_fisico_origem_antes: params.quantidadeAnterior,
    saldo_fisico_origem_depois: params.quantidadePosterior,
    saldo_fisico_destino_antes: params.quantidadeAnterior,
    saldo_fisico_destino_depois: params.quantidadePosterior,
    usuario_id: params.usuarioId,
    criado_em: params.agora,
    sincronizado: false,
  });

  const ajuste: EventoOperacaoBox = {
    id: uid("evt-ajuste"),
    tipo: "ajuste_inventario",
    box_id: caixa.id,
    box_numero: caixa.numero,
    qr_code: caixa.qr_code,
    sessao_id: params.referenciaEventoId,
    produto_id: produtoOperacionalEfetivo(caixa),
    lote_id: lote?.id,
    validade: lote?.validade,
    quantidade: Math.abs(delta),
    saldo_anterior: params.quantidadeAnterior,
    saldo_posterior: params.quantidadePosterior,
    delta,
    motivo: params.motivo,
    justificativa: params.justificativa,
    evento_referencia_id: params.referenciaEventoId,
    status_divergencia: "ajustada",
    usuario_id: params.usuarioId,
    criado_em: params.agora,
  };
  db.eventos_box_operacional.unshift(ajuste);
  return ajuste;
}

function criarEventoBase(params: {
  tipo: EventoOperacaoBox["tipo"];
  caixa: NonNullable<ReturnType<typeof caixaPorQr>>;
  sessaoId: string;
  usuarioId: string;
  agora: string;
  produtoId?: string;
  loteId?: string;
  validade?: string;
}): EventoOperacaoBox {
  return {
    id: uid("evt"),
    tipo: params.tipo,
    box_id: params.caixa.id,
    box_numero: params.caixa.numero,
    qr_code: params.caixa.qr_code,
    sessao_id: params.sessaoId,
    produto_id: params.produtoId,
    lote_id: params.loteId,
    validade: params.validade,
    usuario_id: params.usuarioId,
    criado_em: params.agora,
  };
}

export function registrarAberturaBoxOperacional(
  db: DB,
  input: AberturaBoxOperacionalInput
): AberturaBoxOperacionalResultado {
  const qrAtual = normalizar(input.qrAtual);
  const caixa = caixaPorQr(db, qrAtual);
  if (!caixa || caixa.tipo_box !== "OPERACIONAL") {
    throw new Error("Leia um Box Operacional válido para iniciar a abertura.");
  }
  const produtoEfetivo = produtoOperacionalEfetivo(caixa);
  if (!produtoEfetivo) {
    throw new Error("Sem destinação — configure antes da operação.");
  }
  if (!caixa.local_id) {
    throw new Error("Local físico não definido — configure o box antes da operação.");
  }

  if (!input.confirmacao || input.confirmacao.sessao_id !== input.sessaoId || normalizar(input.confirmacao.qr_confirmado) !== qrAtual) {
    throw new Error("QR obrigatório e confirmado na mesma sessão para a abertura.");
  }

  const fechamentoAnterior = ultimoFechamentoDoBox(db, caixa.id);
  const quantidadeEsperada = fechamentoAnterior?.quantidade_contada ?? 0;
  const quantidadeContada = Math.max(0, input.quantidadeContada);
  const delta = quantidadeContada - quantidadeEsperada;
  const validacaoJustificativa = validarMotivoObrigatorio({ exigeJustificativa: delta !== 0, motivo: input.justificativa });
  if (!validacaoJustificativa.valido) {
    throw new Error(validacaoJustificativa.motivo ?? "Justificativa obrigatória.");
  }

  const agora = new Date().toISOString();
  const lote = loteDaCaixa(db, caixa.id);
  const abertura = criarEventoBase({
    tipo: "abertura",
    caixa,
    sessaoId: input.sessaoId,
    usuarioId: input.usuarioId,
    agora,
    produtoId: produtoEfetivo,
    loteId: lote?.id,
    validade: lote?.validade,
  });
  abertura.quantidade_esperada = quantidadeEsperada;
  abertura.quantidade_contada = quantidadeContada;
  abertura.quantidade_utilizavel = quantidadeContada;
  abertura.necessidade_prevista = Math.max(0, input.necessidadePrevista);
  abertura.reposicao_sugerida = Math.max(abertura.necessidade_prevista - quantidadeContada, 0);
  abertura.saldo_anterior = quantidadeEsperada;
  abertura.saldo_posterior = quantidadeContada;
  abertura.delta = delta;
  abertura.justificativa = input.justificativa?.trim();
  abertura.status_divergencia = delta === 0 ? undefined : "justificada";
  db.eventos_box_operacional.unshift(abertura);

  let divergencia: EventoOperacaoBox | undefined;
  let ajuste: EventoOperacaoBox | undefined;
  if (delta !== 0) {
    divergencia = {
      ...abertura,
      id: uid("evt-div"),
      tipo: "divergencia",
      evento_referencia_id: abertura.id,
      status_divergencia: "justificada",
    };
    db.eventos_box_operacional.unshift(divergencia);
    ajuste = registrarMovimentoAjuste(db, {
      boxId: caixa.id,
      quantidadeAnterior: quantidadeEsperada,
      quantidadePosterior: quantidadeContada,
      usuarioId: input.usuarioId,
      motivo: delta > 0 ? "AJUSTE_ABERTURA_POSITIVO" : "AJUSTE_ABERTURA_NEGATIVO",
      justificativa: input.justificativa,
      agora,
      referenciaEventoId: abertura.id,
    });
  }

  return {
    abertura,
    divergencia,
    ajuste,
    reposicaoSugerida: abertura.reposicao_sugerida ?? 0,
  };
}

export function registrarFechamentoBoxOperacional(
  db: DB,
  input: FechamentoBoxOperacionalInput
): FechamentoBoxOperacionalResultado {
  const qrAtual = normalizar(input.qrAtual);
  const caixa = caixaPorQr(db, qrAtual);
  if (!caixa || caixa.tipo_box !== "OPERACIONAL") {
    throw new Error("Leia um Box Operacional válido para concluir o fechamento.");
  }
  const produtoEfetivo = produtoOperacionalEfetivo(caixa);
  if (!produtoEfetivo) {
    throw new Error("Sem destinação — configure antes da operação.");
  }
  if (!caixa.local_id) {
    throw new Error("Local físico não definido — configure o box antes da operação.");
  }

  if (!input.confirmacao || input.confirmacao.sessao_id !== input.sessaoId || normalizar(input.confirmacao.qr_confirmado) !== qrAtual) {
    throw new Error("QR obrigatório e confirmado na mesma sessão para o fechamento.");
  }

  const ultimoFechamento = ultimoFechamentoDoBox(db, caixa.id);
  const quantidadeAnterior = ultimoFechamento?.quantidade_contada ?? caixa.quantidade ?? 0;
  const quantidadeContada = Math.max(0, input.quantidadeContada);
  const delta = quantidadeContada - quantidadeAnterior;
  const validacaoJustificativa = validarMotivoObrigatorio({ exigeJustificativa: delta !== 0, motivo: input.justificativa });
  if (!validacaoJustificativa.valido) {
    throw new Error(validacaoJustificativa.motivo ?? "Justificativa obrigatória.");
  }

  const agora = new Date().toISOString();
  const lote = loteDaCaixa(db, caixa.id);
  const fechamento = criarEventoBase({
    tipo: "fechamento",
    caixa,
    sessaoId: input.sessaoId,
    usuarioId: input.usuarioId,
    agora,
    produtoId: produtoEfetivo,
    loteId: lote?.id,
    validade: lote?.validade,
  });
  fechamento.quantidade_esperada = quantidadeAnterior;
  fechamento.quantidade_contada = quantidadeContada;
  fechamento.quantidade_utilizavel = quantidadeContada;
  fechamento.saldo_anterior = quantidadeAnterior;
  fechamento.saldo_posterior = quantidadeContada;
  fechamento.delta = delta;
  fechamento.justificativa = input.justificativa?.trim();
  fechamento.status_divergencia = delta === 0 ? undefined : "justificada";
  db.eventos_box_operacional.unshift(fechamento);

  let divergencia: EventoOperacaoBox | undefined;
  let ajuste: EventoOperacaoBox | undefined;
  if (delta !== 0) {
    divergencia = {
      ...fechamento,
      id: uid("evt-div"),
      tipo: "divergencia",
      evento_referencia_id: fechamento.id,
      status_divergencia: "justificada",
    };
    db.eventos_box_operacional.unshift(divergencia);
    ajuste = registrarMovimentoAjuste(db, {
      boxId: caixa.id,
      quantidadeAnterior,
      quantidadePosterior: quantidadeContada,
      usuarioId: input.usuarioId,
      motivo: delta > 0 ? "AJUSTE_FECHAMENTO_POSITIVO" : "AJUSTE_FECHAMENTO_NEGATIVO",
      justificativa: input.justificativa,
      agora,
      referenciaEventoId: fechamento.id,
    });
  }

  return {
    fechamento,
    divergencia,
    ajuste,
  };
}

export function registrarEventoReposicaoOperacional(
  db: DB,
  input: ReposicaoBoxOperacionalInput,
  extras: {
    boxOrigemNumero: number;
    boxDestinoNumero: number;
    produtoId: string;
    loteId: string;
    validade?: string;
    quantidadeAnteriorOrigem: number;
    quantidadePosteriorOrigem: number;
    quantidadeAnteriorDestino: number;
    quantidadePosteriorDestino: number;
  }
): EventoOperacaoBox {
  const origem = caixaPorQr(db, input.origemQr);
  const destino = caixaPorQr(db, input.destinoQr);
  if (!origem || !destino) {
    throw new Error("Leia origem e destino para registrar a reposição.");
  }

  const agora = new Date().toISOString();
  const evento: EventoOperacaoBox = {
    id: uid("evt-rep"),
    tipo: "reposicao",
    box_id: destino.id,
    box_numero: extras.boxDestinoNumero,
    qr_code: destino.qr_code,
    sessao_id: input.sessaoId,
    produto_id: extras.produtoId,
    lote_id: extras.loteId,
    validade: extras.validade,
    quantidade: input.quantidade,
    saldo_anterior: extras.quantidadeAnteriorDestino,
    saldo_posterior: extras.quantidadePosteriorDestino,
    origem_box_id: origem.id,
    origem_qr_code: origem.qr_code,
    destino_box_id: destino.id,
    destino_qr_code: destino.qr_code,
    usuario_id: input.usuarioId,
    criado_em: agora,
  };
  evento.delta = input.quantidade;
  db.eventos_box_operacional.unshift(evento);
  return evento;
}

export function eventoPorTipoDescricao(tipo: EventoOperacaoBox["tipo"]): string {
  switch (tipo) {
    case "abertura":
      return "Abertura";
    case "fechamento":
      return "Fechamento";
    case "reposicao":
      return "Reposição";
    case "divergencia":
      return "Divergência";
    case "ajuste_inventario":
      return "Ajuste de inventário";
    case "destinacao_operacional_ativada":
      return "Destinacao operacional ativada";
    case "destinacao_operacional_encerrada":
      return "Destinacao operacional encerrada";
  }
}
