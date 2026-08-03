/** Worker do PDF.js servido em /public (não empacota no bundle do Webpack/Terser). */
export const PDFJS_WORKER_SRC = "/pdf.worker.min.mjs";

export function configurarWorkerPdfjs(pdfjs: {
  GlobalWorkerOptions?: { workerSrc?: string };
}): void {
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
  }
}
