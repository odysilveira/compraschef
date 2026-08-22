/**
 * Persistência IndexedDB da fila A conciliar (arquivos + metadados).
 * Só guarda itens abertos (pendente / em_andamento).
 */

import type { TipoArquivoRecebimento } from "./classificar-arquivo-recebimento";
import type { ItemFilaLote, StatusItemFilaLote } from "./lote-recebimento-fila";

const DB_NOME = "compraschef-lote-recebimento";
const DB_VERSAO = 1;
const STORE = "itens";

export interface RegistroLoteIdb {
  id: string;
  nome: string;
  tamanho: number;
  tipo: TipoArquivoRecebimento;
  status: StatusItemFilaLote;
  detalhe?: string;
  mimeType: string;
  lastModified: number;
  blob: Blob;
}

export function arquivoParaRegistroIdb(item: ItemFilaLote, arquivo: File): RegistroLoteIdb {
  return {
    id: item.id,
    nome: item.nome,
    tamanho: item.tamanho || arquivo.size,
    tipo: item.tipo,
    status: item.status,
    detalhe: item.detalhe,
    mimeType: arquivo.type || "application/octet-stream",
    lastModified: arquivo.lastModified || Date.now(),
    blob: arquivo,
  };
}

export function registroIdbParaArquivo(registro: RegistroLoteIdb): File {
  return new File([registro.blob], registro.nome, {
    type: registro.mimeType || "application/octet-stream",
    lastModified: registro.lastModified || Date.now(),
  });
}

export function registroIdbParaItem(registro: RegistroLoteIdb): ItemFilaLote {
  return {
    id: registro.id,
    nome: registro.nome,
    tamanho: registro.tamanho,
    tipo: registro.tipo,
    status: registro.status,
    detalhe: registro.detalhe,
  };
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
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha ao abrir IndexedDB."));
  });
}

function reqParaPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha no IndexedDB."));
  });
}

export async function listarRegistrosLoteIdb(): Promise<RegistroLoteIdb[]> {
  const db = await abrirDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const todos = await reqParaPromise(store.getAll() as IDBRequest<RegistroLoteIdb[]>);
    return Array.isArray(todos) ? todos : [];
  } finally {
    db.close();
  }
}

export async function salvarRegistrosLoteIdb(registros: RegistroLoteIdb[]): Promise<void> {
  const db = await abrirDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.clear();
    for (const registro of registros) {
      store.put(registro);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao gravar fila no IndexedDB."));
      tx.onabort = () => reject(tx.error ?? new Error("Gravação da fila abortada."));
    });
  } finally {
    db.close();
  }
}

export async function removerRegistroLoteIdb(id: string): Promise<void> {
  const db = await abrirDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao remover item do IndexedDB."));
    });
  } finally {
    db.close();
  }
}

export async function limparLoteIdb(): Promise<void> {
  const db = await abrirDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao limpar IndexedDB."));
    });
  } finally {
    db.close();
  }
}

export async function lerArquivoLoteIdb(id: string): Promise<File | undefined> {
  const db = await abrirDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const registro = await reqParaPromise(
      tx.objectStore(STORE).get(id) as IDBRequest<RegistroLoteIdb | undefined>
    );
    if (!registro?.blob) return undefined;
    return registroIdbParaArquivo(registro);
  } finally {
    db.close();
  }
}
