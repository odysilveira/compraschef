import type { ContratoArquivoPessoa } from "../types";

/** Limite para não estourar o localStorage da demo (~5 MB total). */
export const TAMANHO_MAX_CONTRATO_BYTES = 1_500_000;

export const TIPOS_MIME_CONTRATO = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const EXTENSOES_OK = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

export function formatarTamanhoArquivo(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function tipoArquivoContratoAceito(tipo: string, nome: string): boolean {
  const mime = (tipo || "").toLowerCase();
  if ((TIPOS_MIME_CONTRATO as readonly string[]).includes(mime)) return true;
  const lower = nome.toLowerCase();
  return EXTENSOES_OK.some((ext) => lower.endsWith(ext));
}

export function validarArquivoContrato(arquivo: {
  name: string;
  type: string;
  size: number;
}): { ok: true } | { ok: false; erro: string } {
  if (!arquivo.name?.trim()) {
    return { ok: false, erro: "Selecione um arquivo." };
  }
  if (!tipoArquivoContratoAceito(arquivo.type, arquivo.name)) {
    return { ok: false, erro: "Use PDF, JPG, PNG ou WEBP." };
  }
  if (arquivo.size <= 0) {
    return { ok: false, erro: "Arquivo vazio." };
  }
  if (arquivo.size > TAMANHO_MAX_CONTRATO_BYTES) {
    return {
      ok: false,
      erro: `Arquivo grande demais (máx. ${formatarTamanhoArquivo(TAMANHO_MAX_CONTRATO_BYTES)}).`,
    };
  }
  return { ok: true };
}

export function lerArquivoComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(leitor.error ?? new Error("Falha ao ler o arquivo."));
    leitor.onload = () => {
      const result = leitor.result;
      if (typeof result !== "string" || !result.startsWith("data:")) {
        reject(new Error("Não foi possível ler o arquivo."));
        return;
      }
      resolve(result);
    };
    leitor.readAsDataURL(arquivo);
  });
}

export async function montarContratoArquivo(
  arquivo: File,
  agora: string = new Date().toISOString()
): Promise<{ ok: true; contrato: ContratoArquivoPessoa } | { ok: false; erro: string }> {
  const validacao = validarArquivoContrato(arquivo);
  if (!validacao.ok) return validacao;
  try {
    const data_url = await lerArquivoComoDataUrl(arquivo);
    return {
      ok: true,
      contrato: {
        nome_arquivo: arquivo.name,
        tipo_arquivo: arquivo.type || "application/octet-stream",
        tamanho_bytes: arquivo.size,
        enviado_em: agora,
        data_url,
      },
    };
  } catch {
    return { ok: false, erro: "Não foi possível ler o arquivo. Tente outro." };
  }
}
