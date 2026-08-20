/** Captura de DANFE no navegador: PDF (texto/OCR) e foto (OCR). */

import { extrairTextoPdfBrowser } from "./folha-recibo-pdf-browser";
import { configurarWorkerPdfjs } from "./pdfjs-worker";
import { identificarNotaPorTexto, type NotaIdentificadaDanfe } from "./danfe-identificacao";

export type OrigemIdentificacaoDanfe = "pdf_texto" | "pdf_ocr" | "foto_ocr" | "qr";

export interface ResultadoCapturaDanfe {
  nota: NotaIdentificadaDanfe | null;
  origem?: OrigemIdentificacaoDanfe;
  detalhe?: string;
}

async function arquivoParaDataUrl(arquivo: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result ?? ""));
    leitor.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    leitor.readAsDataURL(arquivo);
  });
}

/** OCR com tesseract.js (português + dígitos). Só no browser. */
export async function ocrImagemDataUrl(dataUrlOuCanvas: string | HTMLCanvasElement): Promise<string> {
  const tesseract = await import("tesseract.js").catch(() => null);
  if (!tesseract?.createWorker) {
    throw new Error("OCR indisponível neste navegador.");
  }

  const worker = await tesseract.createWorker("por");
  try {
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789 ",
    });
    const resultado = await worker.recognize(dataUrlOuCanvas);
    return resultado.data.text ?? "";
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

/** OCR em português completo (NFS-e, boleto, rótulos) — sem whitelist só de dígitos. */
export async function ocrImagemTextoCompleto(
  dataUrlOuCanvas: string | HTMLCanvasElement
): Promise<string> {
  const tesseract = await import("tesseract.js").catch(() => null);
  if (!tesseract?.createWorker) {
    throw new Error("OCR indisponível neste navegador.");
  }

  const worker = await tesseract.createWorker("por");
  try {
    const resultado = await worker.recognize(dataUrlOuCanvas);
    return resultado.data.text ?? "";
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

export async function renderizarPaginaPdfParaCanvas(buffer: ArrayBuffer, pagina = 1): Promise<HTMLCanvasElement> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs").catch(() => null);
  if (!pdfjs?.getDocument) {
    throw new Error("Não foi possível carregar o leitor de PDF.");
  }
  configurarWorkerPdfjs(pdfjs);

  const dados = new Uint8Array(buffer.slice(0));
  const loadingTask = pdfjs.getDocument({ data: dados });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(pagina);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const contexto = canvas.getContext("2d", { alpha: false });
    if (!contexto) throw new Error("Canvas indisponível para OCR do PDF.");
    await page.render({ canvasContext: contexto, viewport, canvas }).promise;
    return canvas;
  } finally {
    const destruir = (doc as { destroy?: () => Promise<void> }).destroy;
    if (destruir) await destruir.call(doc).catch(() => undefined);
  }
}

/**
 * Identifica a DANFE a partir de PDF (texto → OCR da 1ª página) ou foto (OCR).
 */
export async function identificarDanfeDeArquivo(arquivo: File): Promise<ResultadoCapturaDanfe> {
  const nome = arquivo.name.toLowerCase();
  const ehPdf = arquivo.type === "application/pdf" || nome.endsWith(".pdf");

  if (ehPdf) {
    const buffer = await arquivo.arrayBuffer();
    try {
      const texto = await extrairTextoPdfBrowser(buffer);
      const notaTexto = identificarNotaPorTexto(texto);
      if (notaTexto) {
        return { nota: notaTexto, origem: "pdf_texto" };
      }
    } catch {
      // segue para OCR
    }

    try {
      const canvas = await renderizarPaginaPdfParaCanvas(buffer, 1);
      const ocr = await ocrImagemDataUrl(canvas);
      const notaOcr = identificarNotaPorTexto(ocr);
      if (notaOcr) {
        return { nota: notaOcr, origem: "pdf_ocr" };
      }
      return {
        nota: null,
        origem: "pdf_ocr",
        detalhe: "PDF lido, mas não encontrei a chave de acesso (44 dígitos). Tente o QR ou uma foto mais nítida.",
      };
    } catch (erro) {
      return {
        nota: null,
        detalhe: erro instanceof Error ? erro.message : "Falha ao ler o PDF da DANFE.",
      };
    }
  }

  if (!arquivo.type.startsWith("image/") && !/\.(jpe?g|png|webp|gif)$/i.test(nome)) {
    return { nota: null, detalhe: "Envie um PDF da DANFE ou uma foto (JPG/PNG)." };
  }

  try {
    const dataUrl = await arquivoParaDataUrl(arquivo);
    const ocr = await ocrImagemDataUrl(dataUrl);
    const nota = identificarNotaPorTexto(ocr);
    if (nota) {
      return { nota, origem: "foto_ocr" };
    }
    return {
      nota: null,
      origem: "foto_ocr",
      detalhe: "OCR concluído, mas não encontrei a chave de 44 dígitos. Enquadre a chave ou o QR com boa luz.",
    };
  } catch (erro) {
    return {
      nota: null,
      detalhe: erro instanceof Error ? erro.message : "Falha no OCR da foto.",
    };
  }
}
