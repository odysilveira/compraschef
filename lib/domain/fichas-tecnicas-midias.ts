import type { FichaTecnicaMidia, TipoMidiaFichaTecnica } from "../types";

export const MIDIA_MAX_BYTES_IMAGEM = 5 * 1024 * 1024;
export const MIDIA_MAX_BYTES_VIDEO = 30 * 1024 * 1024;

export const MIDIA_MIME_IMAGENS_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"] as const;
export const MIDIA_MIME_VIDEOS_PERMITIDOS = ["video/mp4", "video/webm", "video/quicktime"] as const;

export interface ArquivoMidiaSelecionado {
  name: string;
  type: string;
  size: number;
}

function clonarDefensivo<T>(valor: T): T {
  return structuredClone(valor);
}

function validarUrlExterna(url: string): void {
  const limpa = url.trim();
  if (!limpa) {
    throw new Error("Informe uma URL externa válida.");
  }
  if (limpa.startsWith("data:")) {
    throw new Error("URLs base64 não são permitidas neste momento.");
  }
  if (limpa.startsWith("blob:")) {
    throw new Error("URLs temporárias locais não podem ser persistidas.");
  }
  const parsed = new URL(limpa);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("A URL deve usar http ou https.");
  }
}

export function detectarTipoMidiaPorMime(mimeType: string): TipoMidiaFichaTecnica {
  const mime = mimeType.trim().toLowerCase();
  if (MIDIA_MIME_IMAGENS_PERMITIDOS.includes(mime as (typeof MIDIA_MIME_IMAGENS_PERMITIDOS)[number])) {
    return "FOTO";
  }
  if (MIDIA_MIME_VIDEOS_PERMITIDOS.includes(mime as (typeof MIDIA_MIME_VIDEOS_PERMITIDOS)[number])) {
    return "VIDEO";
  }
  throw new Error("Formato de arquivo não permitido. Use imagem JPEG/PNG/WEBP ou vídeo MP4/WEBM/MOV.");
}

export function validarArquivoMidia(arquivo: ArquivoMidiaSelecionado): TipoMidiaFichaTecnica {
  const tipo = detectarTipoMidiaPorMime(arquivo.type);
  const limite = tipo === "FOTO" ? MIDIA_MAX_BYTES_IMAGEM : MIDIA_MAX_BYTES_VIDEO;
  if (!Number.isFinite(arquivo.size) || arquivo.size <= 0) {
    throw new Error("Arquivo inválido: tamanho não informado.");
  }
  if (arquivo.size > limite) {
    const limiteMb = Math.round((limite / (1024 * 1024)) * 10) / 10;
    throw new Error(`Arquivo excede o limite de ${limiteMb} MB para ${tipo === "FOTO" ? "imagem" : "vídeo"}.`);
  }
  return tipo;
}

export function criarMidiaUrlExterna(params: {
  id: string;
  versaoId: string;
  url: string;
  tipo: TipoMidiaFichaTecnica;
  passoId?: string;
  criadoEm?: string;
}): FichaTecnicaMidia {
  validarUrlExterna(params.url);
  if (!params.id.trim()) {
    throw new Error("Id da mídia é obrigatório.");
  }
  if (!params.versaoId.trim()) {
    throw new Error("Versão da mídia é obrigatória.");
  }
  return {
    id: params.id,
    versao_id: params.versaoId,
    tipo: params.tipo,
    origem: "URL_EXTERNA",
    url: params.url.trim(),
    passo_id: params.passoId,
    criado_em: params.criadoEm ?? new Date().toISOString(),
  };
}

export function substituirMidiaPrincipal(midias: FichaTecnicaMidia[], novaMidia?: FichaTecnicaMidia): FichaTecnicaMidia[] {
  const semPrincipal = midias.filter((item) => item.passo_id !== undefined || item.tipo !== "FOTO");
  if (!novaMidia) return clonarDefensivo(semPrincipal);
  return clonarDefensivo([...semPrincipal, novaMidia]);
}

export function substituirMidiaDoPasso(
  midias: FichaTecnicaMidia[],
  passoId: string,
  novaMidia?: FichaTecnicaMidia
): FichaTecnicaMidia[] {
  const restante = midias.filter((item) => item.passo_id !== passoId);
  if (!novaMidia) return clonarDefensivo(restante);
  return clonarDefensivo([...restante, { ...novaMidia, passo_id: passoId }]);
}

export function removerMidiaPorId(midias: FichaTecnicaMidia[], midiaId: string): FichaTecnicaMidia[] {
  return clonarDefensivo(midias.filter((item) => item.id !== midiaId));
}

export function sanitizarMidiasPersistiveis(midias: FichaTecnicaMidia[], versaoId: string): FichaTecnicaMidia[] {
  return clonarDefensivo(
    midias
      .filter((item) => item.versao_id === versaoId)
      .filter((item) => item.origem === "URL_EXTERNA")
      .map((item) => {
        validarUrlExterna(item.url);
        const qualquer = item as unknown as Record<string, unknown>;
        const temFile = typeof File !== "undefined" && qualquer.file instanceof File;
        const temBlob = typeof Blob !== "undefined" && qualquer.blob instanceof Blob;
        const temArrayBuffer = typeof ArrayBuffer !== "undefined" && qualquer.arrayBuffer instanceof ArrayBuffer;
        if (temFile || temBlob || temArrayBuffer) {
          throw new Error("Metadados de mídia não podem carregar conteúdo binário.");
        }
        return {
          id: item.id,
          versao_id: item.versao_id,
          tipo: item.tipo,
          origem: "URL_EXTERNA" as const,
          nome_arquivo: item.nome_arquivo,
          mime_type: item.mime_type,
          tamanho_bytes: item.tamanho_bytes,
          url: item.url,
          passo_id: item.passo_id,
          criado_em: item.criado_em,
        };
      })
  );
}

export function listarMidiasDaVersao(midias: FichaTecnicaMidia[], versaoId: string): FichaTecnicaMidia[] {
  return clonarDefensivo(midias.filter((item) => item.versao_id === versaoId));
}

export function reordenarPassosPreservaAssociacao(midias: FichaTecnicaMidia[], passoIdsValidos: string[]): FichaTecnicaMidia[] {
  const validos = new Set(passoIdsValidos);
  return clonarDefensivo(midias.filter((item) => !item.passo_id || validos.has(item.passo_id)));
}