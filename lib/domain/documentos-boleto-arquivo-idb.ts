/**
 * IndexedDB dos PDFs/imagens de boleto já registrados (para “Ver PDF” na conferência).
 * Metadados ficam em db.documentos_boleto; o blob fica só no navegador.
 */

const DB_NOME = "compraschef-documentos-boleto";
const DB_VERSAO = 1;
const STORE = "arquivos";

export interface RegistroArquivoDocumentoBoleto {
  documentoId: string;
  nome: string;
  mimeType: string;
  lastModified: number;
  blob: Blob;
}

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível."));
      return;
    }
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "documentoId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha ao abrir IndexedDB de boletos."));
  });
}

function reqParaPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha no IndexedDB de boletos."));
  });
}

export async function salvarArquivoDocumentoBoletoIdb(
  documentoId: string,
  arquivo: File | Blob,
  nome?: string
): Promise<void> {
  const registro: RegistroArquivoDocumentoBoleto = {
    documentoId,
    nome: nome || (arquivo instanceof File ? arquivo.name : "boleto.pdf"),
    mimeType: arquivo.type || "application/pdf",
    lastModified: arquivo instanceof File ? arquivo.lastModified : Date.now(),
    blob: arquivo,
  };

  const db = await abrirDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(registro);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao gravar PDF do boleto."));
      tx.onabort = () => reject(tx.error ?? new Error("Gravação do PDF abortada."));
    });
  } finally {
    db.close();
  }
}

export async function lerArquivoDocumentoBoletoIdb(documentoId: string): Promise<File | undefined> {
  const db = await abrirDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const registro = await reqParaPromise(
      tx.objectStore(STORE).get(documentoId) as IDBRequest<RegistroArquivoDocumentoBoleto | undefined>
    );
    if (!registro?.blob) return undefined;
    return new File([registro.blob], registro.nome || "boleto.pdf", {
      type: registro.mimeType || "application/pdf",
      lastModified: registro.lastModified || Date.now(),
    });
  } finally {
    db.close();
  }
}
