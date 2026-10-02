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
  pdf_boleto: "Boleto → Conferência",
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
 * Heurística: imagem → foto; office/PDF genérico → documentos; CNH/RG → pessoal;
 * resto desconhecido → a identificar. Compra preserva o tipo.
 */
export function mapearTipoRecebimentoParaInbox(
  tipo: TipoArquivoRecebimento,
  opcoes?: { mimeType?: string; nomeArquivo?: string }
): TipoDestinoInbox {
  const mime = (opcoes?.mimeType ?? "").toLowerCase();
  const nome = opcoes?.nomeArquivo ?? "";

  // Mesmo se a classificação antiga vier como compra, nome pessoal/office vence na inbox.
  if (pareceDocumentoPessoalNome(nome)) return "pessoal";
  if (pareceArquivoOfficeNome(nome, mime) && tipo !== "xml_nfe") {
    return "documento_restaurante";
  }

  switch (tipo) {
    case "xml_nfe":
    case "pdf_danfe":
    case "pdf_nfse":
    case "pdf_boleto":
      return tipo;
    case "imagem":
      return "foto_restaurante";
    case "desconhecido": {
      const ehPdf = mime.includes("pdf") || nome.toLowerCase().endsWith(".pdf");
      if (ehPdf) return "documento_restaurante";
      return "desconhecido";
    }
    default:
      return "desconhecido";
  }
}

function pareceDocumentoPessoalNome(nomeArquivo: string): boolean {
  const nome = (nomeArquivo || "").toLowerCase();
  return (
    /\b(cnh|rg\b|cpf|identidade|habilita|passaporte|titulo[_\s-]?eleitor)/i.test(nome) ||
    /cnh-?e/.test(nome)
  );
}

function pareceArquivoOfficeNome(nomeArquivo: string, mime: string): boolean {
  const n = (nomeArquivo || "").toLowerCase();
  if (/\.(docx?|xlsx?|pptx?|odt|ods|rtf|csv)$/i.test(n)) return true;
  return (
    mime.includes("officedocument") ||
    mime.includes("msword") ||
    mime.includes("ms-excel") ||
    mime.includes("ms-powerpoint")
  );
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
      detalhe: "Leva o PDF à Conferência (boletos sem NF) para parear com a nota.",
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

/** Ordena a fila da inbox por data de entrada. */
export function ordenarFilaInboxPorData<T extends { adicionadoEm?: number; id: string }>(
  itens: T[],
  recentesPrimeiro: boolean
): T[] {
  const copia = [...itens];
  copia.sort((a, b) => {
    const ta = a.adicionadoEm ?? 0;
    const tb = b.adicionadoEm ?? 0;
    if (ta !== tb) return recentesPrimeiro ? tb - ta : ta - tb;
    return recentesPrimeiro ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id);
  });
  return copia;
}
