/**
 * Caixa de entrada unificada: taxonomia de destino + sugestão de ação.
 * Compra → fluxo ComprasChef; resto → pastas OneDrive (ComprasChef-Inbox/…).
 */

import type { TipoArquivoRecebimento } from "./classificar-arquivo-recebimento";
import type { PastaRelativaInbox } from "./onedrive-pasta-local";
import { PASTAS_INBOX } from "./onedrive-pasta-local";

/** Tipos de destino na inbox (override humano incluso). */
export type TipoDestinoInbox =
  | "xml_nfe"
  | "pdf_danfe"
  | "pdf_nfse"
  | "pdf_boleto"
  | "foto_restaurante"
  | "documento_restaurante"
  | "pessoal"
  | "desconhecido";

export type CanalAcaoInbox = "compra" | "onedrive";

export type FluxoCompraInbox = "recebimento" | "financeiro";

export interface SugestaoAcaoInbox {
  tipo: TipoDestinoInbox;
  canal: CanalAcaoInbox;
  /** Só quando canal === "compra". */
  fluxoCompra?: FluxoCompraInbox;
  /** Só quando canal === "onedrive". */
  pastaOneDrive?: PastaRelativaInbox;
  rotulo: string;
  detalhe: string;
}

const ROTULOS: Record<TipoDestinoInbox, string> = {
  xml_nfe: "XML NF-e → Recebimento",
  pdf_danfe: "DANFE → Recebimento",
  pdf_nfse: "NFS-e → Recebimento",
  pdf_boleto: "Boleto → Financeiro",
  foto_restaurante: "Foto → OneDrive (restaurante/fotos)",
  documento_restaurante: "Documento → OneDrive (restaurante/documentos)",
  pessoal: "Pessoal → OneDrive (pessoal)",
  desconhecido: "A identificar → OneDrive",
};

const PASTA_POR_TIPO: Partial<Record<TipoDestinoInbox, PastaRelativaInbox>> = {
  foto_restaurante: "restaurante/fotos",
  documento_restaurante: "restaurante/documentos",
  pessoal: "pessoal",
  desconhecido: "_a-identificar",
};

export const TIPOS_DESTINO_INBOX: TipoDestinoInbox[] = [
  "xml_nfe",
  "pdf_danfe",
  "pdf_nfse",
  "pdf_boleto",
  "foto_restaurante",
  "documento_restaurante",
  "pessoal",
  "desconhecido",
];

export function rotuloTipoDestinoInbox(tipo: TipoDestinoInbox): string {
  return ROTULOS[tipo];
}

export function pastaOneDriveDoTipo(tipo: TipoDestinoInbox): PastaRelativaInbox | null {
  return PASTA_POR_TIPO[tipo] ?? null;
}

/** Pasta padrão ao usar o atalho “Enviar ao OneDrive” (compra → a identificar). */
export function pastaPadraoEnvioOneDrive(tipo: TipoDestinoInbox): PastaRelativaInbox {
  return PASTA_POR_TIPO[tipo] ?? "_a-identificar";
}

export const ROTULOS_PASTA_INBOX: Record<PastaRelativaInbox, string> = {
  "_a-identificar": "A identificar",
  "restaurante/fotos": "Restaurante / fotos",
  "restaurante/documentos": "Restaurante / documentos",
  pessoal: "Pessoal",
};

export function rotuloPastaInbox(pasta: PastaRelativaInbox): string {
  return ROTULOS_PASTA_INBOX[pasta];
}

export function taxonomiaPastasInbox(): readonly PastaRelativaInbox[] {
  return PASTAS_INBOX;
}

/**
 * Mapeia a classificação do lote/recebimento para o destino da inbox.
 * Heurística modesta: imagem → foto; PDF genérico (desconhecido) → documento;
 * resto desconhecido → a identificar. Compra preserva o tipo.
 */
export function mapearTipoRecebimentoParaInbox(
  tipo: TipoArquivoRecebimento,
  opcoes?: { mimeType?: string; nomeArquivo?: string }
): TipoDestinoInbox {
  switch (tipo) {
    case "xml_nfe":
    case "pdf_danfe":
    case "pdf_nfse":
    case "pdf_boleto":
      return tipo;
    case "imagem":
      return "foto_restaurante";
    case "desconhecido": {
      const mime = (opcoes?.mimeType ?? "").toLowerCase();
      const nome = (opcoes?.nomeArquivo ?? "").toLowerCase();
      const ehPdf = mime.includes("pdf") || nome.endsWith(".pdf");
      return ehPdf ? "documento_restaurante" : "desconhecido";
    }
    default:
      return "desconhecido";
  }
}

/** Tipo de arquivo de compra compatível com a fila do lote. */
export function tipoRecebimentoDaCompra(
  tipo: TipoDestinoInbox
): TipoArquivoRecebimento | null {
  switch (tipo) {
    case "xml_nfe":
    case "pdf_danfe":
    case "pdf_nfse":
    case "pdf_boleto":
      return tipo;
    default:
      return null;
  }
}

export function montarSugestaoInbox(tipo: TipoDestinoInbox): SugestaoAcaoInbox {
  if (tipo === "pdf_boleto") {
    return {
      tipo,
      canal: "compra",
      fluxoCompra: "financeiro",
      rotulo: ROTULOS[tipo],
      detalhe: "Leva o PDF ao Financeiro para vincular à parcela.",
    };
  }
  if (tipo === "xml_nfe" || tipo === "pdf_danfe" || tipo === "pdf_nfse") {
    return {
      tipo,
      canal: "compra",
      fluxoCompra: "recebimento",
      rotulo: ROTULOS[tipo],
      detalhe: "Abre o fluxo de Recebimento com este arquivo.",
    };
  }
  const pasta = PASTA_POR_TIPO[tipo] ?? "_a-identificar";
  return {
    tipo,
    canal: "onedrive",
    pastaOneDrive: pasta,
    rotulo: ROTULOS[tipo],
    detalhe: `Copia para ${pasta} na pasta OneDrive escolhida.`,
  };
}

/**
 * Sugestão a partir do resultado da classificação existente (+ mime/nome para PDF genérico).
 */
export function sugerirAcaoInboxDeClassificacao(
  tipoRecebimento: TipoArquivoRecebimento,
  opcoes?: { mimeType?: string; nomeArquivo?: string }
): SugestaoAcaoInbox {
  return montarSugestaoInbox(mapearTipoRecebimentoParaInbox(tipoRecebimento, opcoes));
}
