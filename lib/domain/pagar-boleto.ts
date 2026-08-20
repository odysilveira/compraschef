import { obterCodigoCanonico, validarBoleto } from "./boletos";
import type { Boleto, DB, DocumentoBoleto, HistoricoPagamentoBoleto, StatusBoleto } from "../types";

export type MotivoBloqueioPagamentoBoleto =
  | "status_invalido"
  | "sem_linha_digitavel"
  | "sem_documento_boleto"
  | "sem_conferencia"
  | "ja_informado"
  | "ja_pago";

export interface ElegibilidadePagamentoBoleto {
  permitido: boolean;
  motivoBloqueio?: MotivoBloqueioPagamentoBoleto;
  mensagem: string;
}

export interface SnapshotPagamentoBoleto {
  boletoId: string;
  status: StatusBoleto;
  valor: number;
  vencimento: string;
  linhaDigitavel?: string;
  documentoBoletoId?: string;
  statusConferencia?: Boleto["status_conferencia"];
}

export interface DadosPagamentoBoleto {
  dataPagamento: string;
  valorPago: number;
  bancoConta: string;
  responsavel?: string;
  observacao?: string;
  confirmouAviso: boolean;
}

export interface ResultadoInformarPagamentoBoleto {
  sucesso: boolean;
  boleto?: Boleto;
  historico?: HistoricoPagamentoBoleto;
  erros: string[];
}

export interface OpcoesInformarPagamentoBoleto {
  agora?: string;
  responsavelPadrao?: string;
  gerarIdHistorico?: () => string;
}

export interface EstadoAgendaPagamentoBoleto {
  podeExibirCodigo: boolean;
  podeCopiarLinha: boolean;
  podeInformarPagamento: boolean;
  mostrarImportarBoleto: boolean;
  rotuloImportarBoleto?: string;
  codigoCanonico?: string;
  motivoBloqueio?: string;
}

export type LayoutAcoesPagamentoAgenda = "desktop" | "mobile";

function limparTexto(valor?: string): string {
  return (valor ?? "").trim();
}

function dataIsoValida(valor: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

function rotuloStatus(status: StatusBoleto): string {
  switch (status) {
    case "travado":
      return "travado";
    case "liberado":
      return "liberado";
    case "aguardando_conciliacao":
      return "aguardando conciliação";
    case "pago":
      return "pago";
    case "suspeito":
      return "suspeito";
  }
}

function codigoCanonicoValido(codigo?: string): string | undefined {
  const candidato = (codigo ?? "").trim();
  if (!candidato) return undefined;
  // Aceita 44 direto ou linha 47 convertida — antes só 44 “cru” e o botão sumia.
  return obterCodigoCanonico(candidato);
}

export function obterCodigoCanonicoConfirmadoDoDocumento(documento?: DocumentoBoleto): string | undefined {
  if (!documento) return undefined;
  if (!documento.confirmado_em || !documento.confirmado_por) return undefined;
  return (
    codigoCanonicoValido(documento.codigo_canonico) ||
    codigoCanonicoValido(documento.linha_informada)
  );
}

/**
 * Resolve o código de barras (44) para exibir na agenda.
 * 1) Documento confirmado; 2) boleto já conferido com linha/código gravados.
 */
export function resolverCodigoCanonicoParaPagamento(
  boleto: Boleto,
  documento?: DocumentoBoleto
): string | undefined {
  const doDocumento = obterCodigoCanonicoConfirmadoDoDocumento(documento);
  if (doDocumento) return doDocumento;

  if (boleto.status !== "liberado" || boleto.status_conferencia !== "conferido") {
    return undefined;
  }

  return (
    codigoCanonicoValido(boleto.linha_digitavel) ||
    codigoCanonicoValido(documento?.codigo_canonico) ||
    codigoCanonicoValido(documento?.linha_informada)
  );
}

export function montarEstadoAgendaPagamentoBoleto(boleto: Boleto, documento?: DocumentoBoleto): EstadoAgendaPagamentoBoleto {
  if (boleto.status === "suspeito") {
    return {
      podeExibirCodigo: false,
      podeCopiarLinha: false,
      podeInformarPagamento: false,
      mostrarImportarBoleto: false,
      motivoBloqueio: "Boleto suspeito. Confirme legitimidade antes de qualquer pagamento.",
    };
  }

  if (boleto.status !== "liberado") {
    const motivosPorStatus: Partial<Record<StatusBoleto, string>> = {
      travado: "Boleto travado até conferência da mercadoria.",
      aguardando_conciliacao: "Pagamento já informado. Aguardando conciliação bancária.",
      pago: "Boleto já pago.",
    };
    return {
      podeExibirCodigo: false,
      podeCopiarLinha: false,
      podeInformarPagamento: false,
      mostrarImportarBoleto: false,
      motivoBloqueio: motivosPorStatus[boleto.status] ?? `Boleto em status ${rotuloStatus(boleto.status)}.`,
    };
  }

  if (
    documento?.resultado_confronto === "divergente" ||
    documento?.resultado_confronto === "sem_correspondencia" ||
    documento?.resultado_confronto === "duplicada"
  ) {
    const motivoPorConfronto: Record<NonNullable<DocumentoBoleto["resultado_confronto"]>, string> = {
      exata: "",
      parcial: "",
      multiplas_possibilidades: "",
      divergente: "Boleto bloqueado por divergências no confronto com a NF-e.",
      sem_correspondencia: "Boleto bloqueado: sem correspondência confiável com a NF-e.",
      duplicada: "Boleto bloqueado: documento duplicado detectado.",
    };
    return {
      podeExibirCodigo: false,
      podeCopiarLinha: false,
      podeInformarPagamento: false,
      mostrarImportarBoleto: false,
      motivoBloqueio: motivoPorConfronto[documento.resultado_confronto],
    };
  }

  const codigoCanonico = resolverCodigoCanonicoParaPagamento(boleto, documento);
  if (!codigoCanonico) {
    const semCodigoEmRegistroConferido = boleto.status_conferencia === "conferido";
    return {
      podeExibirCodigo: false,
      podeCopiarLinha: false,
      podeInformarPagamento: false,
      mostrarImportarBoleto: true,
      rotuloImportarBoleto: semCodigoEmRegistroConferido ? "Reimportar boleto" : "Importar boleto",
      motivoBloqueio: semCodigoEmRegistroConferido
        ? "Código não preservado na importação anterior — reimporte o PDF ou a linha digitável."
        : "Boleto ainda não recebido — importe o PDF/linha para exibir o código.",
    };
  }

  const boletoParaElegibilidade: Boleto = {
    ...boleto,
    linha_digitavel: boleto.linha_digitavel ?? documento?.linha_informada ?? codigoCanonico,
  };
  const elegibilidade = avaliarElegibilidadePagamentoBoleto(boletoParaElegibilidade);
  if (!elegibilidade.permitido) {
    return {
      podeExibirCodigo: false,
      podeCopiarLinha: false,
      podeInformarPagamento: false,
      mostrarImportarBoleto: false,
      motivoBloqueio: elegibilidade.mensagem,
    };
  }

  return {
    podeExibirCodigo: true,
    podeCopiarLinha: true,
    podeInformarPagamento: true,
    mostrarImportarBoleto: false,
    codigoCanonico,
  };
}

export function alternarCodigoAberto(codigoAbertoId: string | null, boletoId: string): string | null {
  if (codigoAbertoId === boletoId) return null;
  return boletoId;
}

export function acoesPagamentoDisponiveisNoLayout(_layout: LayoutAcoesPagamentoAgenda, estado: EstadoAgendaPagamentoBoleto): string[] {
  const acoes: string[] = [];
  if (estado.podeExibirCodigo) acoes.push("exibir_codigo");
  if (estado.podeCopiarLinha) acoes.push("copiar_linha");
  if (estado.podeInformarPagamento) acoes.push("informar_pagamento");
  if (estado.mostrarImportarBoleto) acoes.push("importar_boleto");
  return acoes;
}

export function avaliarElegibilidadePagamentoBoleto(boleto: Boleto): ElegibilidadePagamentoBoleto {
  if (boleto.status === "pago") {
    return {
      permitido: false,
      motivoBloqueio: "ja_pago",
      mensagem: "Este boleto já está pago.",
    };
  }

  if (boleto.status === "aguardando_conciliacao") {
    return {
      permitido: false,
      motivoBloqueio: "ja_informado",
      mensagem: "Pagamento já informado. Aguarde a conciliação bancária.",
    };
  }

  if (boleto.status !== "liberado") {
    return {
      permitido: false,
      motivoBloqueio: "status_invalido",
      mensagem: `Boleto em status ${rotuloStatus(boleto.status)} não pode receber pagamento nesta etapa.`,
    };
  }

  if (!limparTexto(boleto.linha_digitavel)) {
    return {
      permitido: false,
      motivoBloqueio: "sem_linha_digitavel",
      mensagem: "Boleto sem linha digitável/código de barras para pagamento.",
    };
  }

  if (!limparTexto(boleto.documento_boleto_id)) {
    return {
      permitido: false,
      motivoBloqueio: "sem_documento_boleto",
      mensagem: "Boleto sem documento associado. Refaça a conferência antes de pagar.",
    };
  }

  if (boleto.status_conferencia !== "conferido") {
    return {
      permitido: false,
      motivoBloqueio: "sem_conferencia",
      mensagem: "Boleto ainda não está conferido.",
    };
  }

  return {
    permitido: true,
    mensagem: "Boleto apto para informar pagamento.",
  };
}

export function criarSnapshotPagamentoBoleto(boleto: Boleto): SnapshotPagamentoBoleto {
  return {
    boletoId: boleto.id,
    status: boleto.status,
    valor: boleto.valor,
    vencimento: boleto.vencimento,
    linhaDigitavel: boleto.linha_digitavel,
    documentoBoletoId: boleto.documento_boleto_id,
    statusConferencia: boleto.status_conferencia,
  };
}

export function snapshotPagamentoConfere(boletoAtual: Boleto, snapshot: SnapshotPagamentoBoleto): boolean {
  return (
    boletoAtual.id === snapshot.boletoId &&
    boletoAtual.status === snapshot.status &&
    boletoAtual.valor === snapshot.valor &&
    boletoAtual.vencimento === snapshot.vencimento &&
    (boletoAtual.linha_digitavel ?? "") === (snapshot.linhaDigitavel ?? "") &&
    (boletoAtual.documento_boleto_id ?? "") === (snapshot.documentoBoletoId ?? "") &&
    (boletoAtual.status_conferencia ?? "") === (snapshot.statusConferencia ?? "")
  );
}

export function informarPagamentoBoleto(
  db: DB,
  boletoId: string,
  snapshot: SnapshotPagamentoBoleto,
  dados: DadosPagamentoBoleto,
  opcoes: OpcoesInformarPagamentoBoleto = {}
): ResultadoInformarPagamentoBoleto {
  const boleto = db.boletos.find((item) => item.id === boletoId);
  if (!boleto) {
    return {
      sucesso: false,
      erros: ["Boleto não encontrado."],
    };
  }

  if (!snapshotPagamentoConfere(boleto, snapshot)) {
    return {
      sucesso: false,
      erros: ["O boleto mudou desde a abertura da tela. Reabra o pagamento e confirme novamente."],
    };
  }

  const elegibilidade = avaliarElegibilidadePagamentoBoleto(boleto);
  if (!elegibilidade.permitido) {
    return {
      sucesso: false,
      erros: [elegibilidade.mensagem],
    };
  }

  if (!dados.confirmouAviso) {
    return {
      sucesso: false,
      erros: ["Confirme o aviso de responsabilidade antes de continuar."],
    };
  }

  if (!dataIsoValida(dados.dataPagamento)) {
    return {
      sucesso: false,
      erros: ["Informe uma data de pagamento válida."],
    };
  }

  if (!Number.isFinite(dados.valorPago) || dados.valorPago <= 0) {
    return {
      sucesso: false,
      erros: ["Informe um valor pago válido."],
    };
  }

  const bancoConta = limparTexto(dados.bancoConta);
  if (!bancoConta) {
    return {
      sucesso: false,
      erros: ["Informe banco/conta usada no pagamento."],
    };
  }

  const agora = opcoes.agora ?? new Date().toISOString();
  const responsavel = limparTexto(dados.responsavel) || opcoes.responsavelPadrao || "usuário local";
  const observacao = limparTexto(dados.observacao) || undefined;
  const statusAnterior = boleto.status;

  boleto.status = "aguardando_conciliacao";
  boleto.pagamento_data = dados.dataPagamento;
  boleto.pagamento_valor = Number(dados.valorPago.toFixed(2));
  boleto.pagamento_banco_conta = bancoConta;
  boleto.pagamento_responsavel = responsavel;
  boleto.pagamento_observacao = observacao;
  boleto.pagamento_informado_em = agora;

  const historico: HistoricoPagamentoBoleto = {
    id: opcoes.gerarIdHistorico ? opcoes.gerarIdHistorico() : `bph-${Date.now().toString(36)}`,
    boleto_id: boleto.id,
    nota_id: boleto.nota_id,
    acao: "pagamento_informado",
    status_anterior: statusAnterior,
    status_novo: "aguardando_conciliacao",
    data_pagamento: dados.dataPagamento,
    valor_pago: Number(dados.valorPago.toFixed(2)),
    banco_conta: bancoConta,
    responsavel,
    observado_em: agora,
    observacao,
  };

  db.boleto_pagamentos_historico.push(historico);

  return {
    sucesso: true,
    boleto,
    historico,
    erros: [],
  };
}

const PADRAO_DIGITO_ITF: Record<string, string> = {
  "0": "nnwwn",
  "1": "wnnnw",
  "2": "nwnnw",
  "3": "wwnnn",
  "4": "nnwnw",
  "5": "wnwnn",
  "6": "nwwnn",
  "7": "nnnww",
  "8": "wnnwn",
  "9": "nwnwn",
};

export interface SegmentoCodigoBarrasItf {
  tipo: "bar" | "space";
  largo: boolean;
}

export function gerarPadraoInterleaved2of5(codigoCanonico: string): SegmentoCodigoBarrasItf[] {
  const digitos = codigoCanonico.replace(/\D+/g, "");
  if (!digitos) {
    throw new Error("Código canônico vazio para gerar Interleaved 2 of 5.");
  }
  if (digitos.length % 2 !== 0) {
    throw new Error("Código canônico do Interleaved 2 of 5 deve ter quantidade par de dígitos.");
  }

  const segmentos: SegmentoCodigoBarrasItf[] = [
    { tipo: "bar", largo: false },
    { tipo: "space", largo: false },
    { tipo: "bar", largo: false },
    { tipo: "space", largo: false },
  ];

  for (let indice = 0; indice < digitos.length; indice += 2) {
    const parBarra = PADRAO_DIGITO_ITF[digitos[indice]];
    const parEspaco = PADRAO_DIGITO_ITF[digitos[indice + 1]];
    if (!parBarra || !parEspaco) {
      throw new Error("Código canônico contém dígitos inválidos para Interleaved 2 of 5.");
    }

    for (let posicao = 0; posicao < 5; posicao += 1) {
      segmentos.push({ tipo: "bar", largo: parBarra[posicao] === "w" });
      segmentos.push({ tipo: "space", largo: parEspaco[posicao] === "w" });
    }
  }

  segmentos.push({ tipo: "bar", largo: true });
  segmentos.push({ tipo: "space", largo: false });
  segmentos.push({ tipo: "bar", largo: false });

  return segmentos;
}
