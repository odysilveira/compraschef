/** Extração de texto de PDF no navegador (folha do contador). */

export async function extrairTextoPdfBrowser(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs").catch(() => null);
  if (!pdfjs?.getDocument) {
    throw new Error("Não foi possível carregar o leitor de PDF.");
  }
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
  }

  const dados = new Uint8Array(buffer.slice(0));
  const loadingTask = pdfjs.getDocument({ data: dados });
  const doc = await loadingTask.promise;
  const partes: string[] = [];

  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const lines: string[] = [];
      let row: string[] = [];
      let lastY: number | null = null;

      for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
        const str = (item.str ?? "").replace(/\u00a0/g, " ").trim();
        if (!str) continue;
        const y = Math.round(item.transform?.[5] ?? 0);
        if (lastY !== null && Math.abs(y - lastY) > 3) {
          lines.push(row.join(" ").replace(/[ \t]+/g, " ").trim());
          row = [];
        }
        row.push(str);
        lastY = y;
      }
      if (row.length) lines.push(row.join(" ").replace(/[ \t]+/g, " ").trim());
      partes.push(lines.filter(Boolean).join("\n"));
    }
  } finally {
    const destruir = (doc as { destroy?: () => Promise<void> }).destroy;
    if (destruir) await destruir.call(doc).catch(() => undefined);
    const destruirTask = (loadingTask as { destroy?: () => Promise<void> }).destroy;
    if (destruirTask) await destruirTask.call(loadingTask).catch(() => undefined);
  }

  return partes.join("\n\n");
}
