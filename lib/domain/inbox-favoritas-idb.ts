/**
 * Persistência IndexedDB das pastas favoritas (metadados + FileSystemDirectoryHandle).
 */

import {
  idFavorita,
  LIMITE_FAVORITAS_INBOX,
  nomePadraoFavorita,
  podeAdicionarFavorita,
  type FavoritaInbox,
} from "./inbox-favoritas";

const DB_NOME = "compraschef-inbox-favoritas";
const DB_VERSAO = 1;
const STORE = "favoritas";

export interface RegistroFavoritaIdb extends FavoritaInbox {
  handle: FileSystemDirectoryHandle;
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
    req.onerror = () => reject(req.error ?? new Error("Falha ao abrir IndexedDB das favoritas."));
  });
}

function reqParaPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha no IndexedDB."));
  });
}

export async function listarFavoritasIdb(): Promise<FavoritaInbox[]> {
  const registros = await listarRegistrosFavoritasIdb();
  return registros
    .map(({ handle: _h, ...meta }) => meta)
    .sort((a, b) => a.criadaEm - b.criadaEm);
}

export async function listarRegistrosFavoritasIdb(): Promise<RegistroFavoritaIdb[]> {
  const db = await abrirDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const todos = await reqParaPromise(
      tx.objectStore(STORE).getAll() as IDBRequest<RegistroFavoritaIdb[]>
    );
    return Array.isArray(todos) ? todos : [];
  } finally {
    db.close();
  }
}

export async function obterRegistroFavoritaIdb(
  id: string
): Promise<RegistroFavoritaIdb | null> {
  const db = await abrirDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const reg = await reqParaPromise(
      tx.objectStore(STORE).get(id) as IDBRequest<RegistroFavoritaIdb | undefined>
    );
    return reg ?? null;
  } finally {
    db.close();
  }
}

export async function adicionarFavoritaIdb(
  handle: FileSystemDirectoryHandle,
  nomeOpcional?: string
): Promise<FavoritaInbox> {
  const existentes = await listarFavoritasIdb();
  if (!podeAdicionarFavorita(existentes.length)) {
    throw new Error(
      `Limite de ${LIMITE_FAVORITAS_INBOX} pastas favoritas. Remova uma antes de adicionar.`
    );
  }
  const pastaNome = handle.name || "Pasta";
  const meta: FavoritaInbox = {
    id: idFavorita(),
    nome: (nomeOpcional?.trim() || nomePadraoFavorita(pastaNome, existentes)).slice(0, 80),
    pastaNome,
    criadaEm: Date.now(),
  };
  const registro: RegistroFavoritaIdb = { ...meta, handle };
  const db = await abrirDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(registro);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao salvar favorita."));
      tx.onabort = () => reject(tx.error ?? new Error("Gravação da favorita abortada."));
    });
  } finally {
    db.close();
  }
  return meta;
}

export async function renomearFavoritaIdb(id: string, nome: string): Promise<void> {
  const limpo = nome.trim().slice(0, 80);
  if (!limpo) throw new Error("Informe um nome para a favorita.");
  const registro = await obterRegistroFavoritaIdb(id);
  if (!registro) throw new Error("Favorita não encontrada.");
  const db = await abrirDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ ...registro, nome: limpo });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao renomear favorita."));
      tx.onabort = () => reject(tx.error ?? new Error("Renomeação abortada."));
    });
  } finally {
    db.close();
  }
}

export async function removerFavoritaIdb(id: string): Promise<void> {
  const db = await abrirDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao remover favorita."));
      tx.onabort = () => reject(tx.error ?? new Error("Remoção abortada."));
    });
  } finally {
    db.close();
  }
}
