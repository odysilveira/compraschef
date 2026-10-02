/**
 * Persistência IndexedDB da fila da Caixa de entrada (arquivos + tipo sugerido).
 */

import type { TipoDestinoInbox } from "./inbox-entrada";

const DB_NOME = "compraschef-caixa-entrada";
const DB_VERSAO = 1;
const STORE = "itens";

/**
 * pendente = a classificar (ainda na caixa, destino a confirmar)
 * a_conferir = enviado à compra; fica até Recebimento/Conferência concluir
 * em_andamento = legado (trata como a conferir)
 */
export type StatusItemInbox =
  | "pendente"
  | "a_conferir"
  | "em_andamento"
  | "concluido"
  | "descartado";

export type FaseFilaInbox = "a_classificar" | "a_conferir";

export function itemInboxAberto(status: StatusItemInbox): boolean {
  return status === "pendente" || status === "a_conferir" || status === "em_andamento";
}

export function faseFilaInbox(status: StatusItemInbox): FaseFilaInbox | null {
  if (status === "pendente") return "a_classificar";
  if (status === "a_conferir" || status === "em_andamento") return "a_conferir";
  return null;
}

export function rotuloStatusItemInbox(status: StatusItemInbox): string {
  switch (status) {
    case "pendente":
      return "A classificar";
    case "a_conferir":
    case "em_andamento":
      return "A conferir";
    case "concluido":
      return "Concluído";
    case "descartado":
      return "Descartado";
  }
}

export interface ItemFilaInbox {
  id: string;
  nome: string;
  tamanho: number;
  tipo: TipoDestinoInbox;
  status: StatusItemInbox;
  detalhe?: string;
  /** Quando entrou na caixa (ms). Usado para ordenar recentes/antigos. */
  adicionadoEm?: number;
  /** Impressões digitais para aviso de retrabalho. */
  chaveNfe?: string;
  chaveNfse?: string;
  codigoBoleto?: string;
  hashSha256?: string;
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
  adicionadoEm?: number;
  chaveNfe?: string;
  chaveNfse?: string;
  codigoBoleto?: string;
  hashSha256?: string;
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
    adicionadoEm: item.adicionadoEm,
    chaveNfe: item.chaveNfe,
    chaveNfse: item.chaveNfse,
    codigoBoleto: item.codigoBoleto,
    hashSha256: item.hashSha256,
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
    adicionadoEm: registro.adicionadoEm ?? registro.lastModified,
    chaveNfe: registro.chaveNfe,
    chaveNfse: registro.chaveNfse,
    codigoBoleto: registro.codigoBoleto,
    hashSha256: registro.hashSha256,
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
