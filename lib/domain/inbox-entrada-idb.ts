/**
 * Persistência IndexedDB da fila da Caixa de entrada (arquivos + tipo sugerido).
 */

import type { TipoDestinoInbox } from "./inbox-entrada";

const DB_NOME = "compraschef-caixa-entrada";
const DB_VERSAO = 1;
const STORE = "itens";

export type StatusItemInbox = "pendente" | "em_andamento" | "concluido" | "descartado";

export interface ItemFilaInbox {
  id: string;
  nome: string;
  tamanho: number;
  tipo: TipoDestinoInbox;
  status: StatusItemInbox;
  detalhe?: string;
}

export interface RegistroInboxIdb {
  id: string;
  nome: string;
  tamanho: number;
  tipo: TipoDestinoInbox;
  status: StatusItemInbox;
  detalhe?: string;
  mimeType: string;
  lastModified: number;
  blob: Blob;
}

export function arquivoParaRegistroInboxIdb(
  item: ItemFilaInbox,
  arquivo: File
): RegistroInboxIdb {
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

export function registroInboxIdbParaArquivo(registro: RegistroInboxIdb): File {
  return new File([registro.blob], registro.nome, {
    type: registro.mimeType || "application/octet-stream",
    lastModified: registro.lastModified || Date.now(),
  });
}

export function registroInboxIdbParaItem(registro: RegistroInboxIdb): ItemFilaInbox {
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
    req.onerror = () => reject(req.error ?? new Error("Falha ao abrir IndexedDB da inbox."));
  });
}

function reqParaPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha no IndexedDB."));
  });
}

export async function listarRegistrosInboxIdb(): Promise<RegistroInboxIdb[]> {
  const db = await abrirDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const todos = await reqParaPromise(store.getAll() as IDBRequest<RegistroInboxIdb[]>);
    return Array.isArray(todos) ? todos : [];
  } finally {
    db.close();
  }
}

export async function salvarRegistrosInboxIdb(registros: RegistroInboxIdb[]): Promise<void> {
  const db = await abrirDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const chaves = await reqParaPromise(store.getAllKeys() as IDBRequest<IDBValidKey[]>);
    const idsNovos = new Set(registros.map((r) => r.id));
    for (const chave of chaves ?? []) {
      const id = String(chave);
      if (!idsNovos.has(id)) store.delete(id);
    }
    for (const registro of registros) {
      store.put(registro);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao gravar inbox no IndexedDB."));
      tx.onabort = () => reject(tx.error ?? new Error("Gravação da inbox abortada."));
    });
  } finally {
    db.close();
  }
}

export async function removerRegistroInboxIdb(id: string): Promise<void> {
  const db = await abrirDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao remover item da inbox."));
      tx.onabort = () => reject(tx.error ?? new Error("Remoção abortada."));
    });
  } finally {
    db.close();
  }
}

export async function limparInboxIdb(): Promise<void> {
  const db = await abrirDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao limpar inbox."));
      tx.onabort = () => reject(tx.error ?? new Error("Limpeza abortada."));
    });
  } finally {
    db.close();
  }
}
