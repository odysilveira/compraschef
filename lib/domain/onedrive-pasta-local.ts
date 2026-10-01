/**
 * Pasta OneDrive local via File System Access API (Chrome/Edge).
 * O usuário escolhe a raiz uma vez; o app grava o handle e copia arquivos
 * para ComprasChef-Inbox/… — a sync do OneDrive sobe para a nuvem.
 * Sem Microsoft Graph nesta fase.
 */

export const NOME_PASTA_INBOX = "ComprasChef-Inbox";

/** Pastas relativas sob ComprasChef-Inbox. */
export const PASTAS_INBOX = [
  "_a-identificar",
  "restaurante/fotos",
  "restaurante/documentos",
  "pessoal",
] as const;

export type PastaRelativaInbox = (typeof PASTAS_INBOX)[number];

type ShowDirectoryPickerOptions = {
  mode?: "read" | "readwrite";
  /** Pasta inicial do diálogo (Chrome/Edge). */
  startIn?: FileSystemHandle | "desktop" | "documents" | "downloads";
};

type WindowComPasta = Window & {
  showDirectoryPicker?: (options?: ShowDirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
};

const DB_NOME = "compraschef-onedrive-pasta";
const DB_VERSAO = 1;
const STORE = "handles";
const CHAVE_RAIZ = "raiz";

function windowComPasta(): WindowComPasta | null {
  if (typeof window === "undefined") return null;
  return window as WindowComPasta;
}

function apiDisponivel(): boolean {
  const w = windowComPasta();
  return Boolean(w && typeof w.showDirectoryPicker === "function");
}

export function onedrivePastaLocalDisponivel(): boolean {
  return apiDisponivel();
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
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha ao abrir IndexedDB da pasta OneDrive."));
  });
}

async function salvarHandleRaiz(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await abrirDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(handle, CHAVE_RAIZ);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao gravar pasta OneDrive."));
      tx.onabort = () => reject(tx.error ?? new Error("Gravação da pasta abortada."));
    });
  } finally {
    db.close();
  }
}

async function lerHandleRaiz(): Promise<FileSystemDirectoryHandle | null> {
  const db = await abrirDb();
  try {
    const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(CHAVE_RAIZ);
      req.onsuccess = () => {
        const valor = req.result;
        resolve(valor && typeof valor === "object" ? (valor as FileSystemDirectoryHandle) : null);
      };
      req.onerror = () => reject(req.error ?? new Error("Falha ao ler pasta OneDrive."));
    });
    return handle;
  } finally {
    db.close();
  }
}

export async function limparHandleRaizOneDrive(): Promise<void> {
  const db = await abrirDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(CHAVE_RAIZ);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Falha ao limpar pasta OneDrive."));
      tx.onabort = () => reject(tx.error ?? new Error("Limpeza da pasta abortada."));
    });
  } finally {
    db.close();
  }
}

async function garantirPermissaoEscrita(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const comPermissao = handle as FileSystemDirectoryHandle & {
    queryPermission?: (desc: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (desc: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  };
  if (typeof comPermissao.queryPermission === "function") {
    const atual = await comPermissao.queryPermission({ mode: "readwrite" });
    if (atual === "granted") return true;
  }
  if (typeof comPermissao.requestPermission === "function") {
    const pedida = await comPermissao.requestPermission({ mode: "readwrite" });
    return pedida === "granted";
  }
  // Ambientes sem query/request: tenta usar direto.
  return true;
}

/** Obtém ou cria uma cadeia de subpastas a partir de um handle. */
export async function obterOuCriarSubpastas(
  raiz: FileSystemDirectoryHandle,
  segmentos: string[]
): Promise<FileSystemDirectoryHandle> {
  let atual = raiz;
  for (const segmento of segmentos) {
    if (!segmento) continue;
    atual = await atual.getDirectoryHandle(segmento, { create: true });
  }
  return atual;
}

/** Cria ComprasChef-Inbox e as pastas padrão sob a raiz escolhida. */
export async function garantirArvoreInbox(
  raizOneDrive: FileSystemDirectoryHandle
): Promise<FileSystemDirectoryHandle> {
  const inbox = await obterOuCriarSubpastas(raizOneDrive, [NOME_PASTA_INBOX]);
  for (const relativa of PASTAS_INBOX) {
    await obterOuCriarSubpastas(inbox, relativa.split("/"));
  }
  return inbox;
}

/**
 * Pedido explícito do usuário (gesto): escolher pasta raiz do OneDrive no PC.
 */
export async function escolherPastaRaizOneDrive(): Promise<FileSystemDirectoryHandle> {
  if (!apiDisponivel()) {
    throw new Error(
      "Este navegador não permite escolher pasta local. Use Chrome ou Edge no computador."
    );
  }
  const w = windowComPasta()!;
  const handle = await w.showDirectoryPicker!({ mode: "readwrite" });
  await salvarHandleRaiz(handle);
  await garantirArvoreInbox(handle);
  return handle;
}

/** Recupera a pasta raiz salva e pede permissão se necessário. */
export async function obterPastaRaizOneDrive(): Promise<FileSystemDirectoryHandle | null> {
  if (!apiDisponivel()) return null;
  try {
    const handle = await lerHandleRaiz();
    if (!handle) return null;
    const ok = await garantirPermissaoEscrita(handle);
    if (!ok) return null;
    return handle;
  } catch {
    return null;
  }
}

export function nomeArquivoSeguro(nome: string): string {
  const base = nome.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "arquivo";
  return base.slice(0, 180);
}

/** Evita sobrescrever: se já existir, acrescenta -2, -3… antes da extensão. */
export async function nomeUnicoNaPasta(
  pasta: FileSystemDirectoryHandle,
  nomeDesejado: string
): Promise<string> {
  const seguro = nomeArquivoSeguro(nomeDesejado);
  const ponto = seguro.lastIndexOf(".");
  const stem = ponto > 0 ? seguro.slice(0, ponto) : seguro;
  const ext = ponto > 0 ? seguro.slice(ponto) : "";

  for (let i = 0; i < 200; i += 1) {
    const candidato = i === 0 ? seguro : `${stem}-${i + 1}${ext}`;
    try {
      await pasta.getFileHandle(candidato);
      // existe — tenta próximo
    } catch {
      return candidato;
    }
  }
  return `${stem}-${Date.now()}${ext}`;
}

/**
 * Copia o arquivo para ComprasChef-Inbox/<pastaRelativa>/ sob a raiz OneDrive.
 * Retorna o caminho relativo gravado.
 */
export async function copiarArquivoParaInboxOneDrive(
  raizOneDrive: FileSystemDirectoryHandle,
  pastaRelativa: PastaRelativaInbox,
  arquivo: File
): Promise<{ caminhoRelativo: string; nomeGravado: string }> {
  const ok = await garantirPermissaoEscrita(raizOneDrive);
  if (!ok) {
    throw new Error("Sem permissão de escrita na pasta OneDrive. Escolha a pasta de novo.");
  }
  const inbox = await garantirArvoreInbox(raizOneDrive);
  const destino = await obterOuCriarSubpastas(inbox, pastaRelativa.split("/"));
  const nomeGravado = await nomeUnicoNaPasta(destino, arquivo.name);
  const fileHandle = await destino.getFileHandle(nomeGravado, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(await arquivo.arrayBuffer());
  } finally {
    await writable.close();
  }
  return {
    caminhoRelativo: `${NOME_PASTA_INBOX}/${pastaRelativa}/${nomeGravado}`,
    nomeGravado,
  };
}

/** Abre o diálogo do sistema para o usuário navegar e escolher a pasta de destino. */
export async function escolherPastaDestinoEscrita(
  startIn?: FileSystemHandle | null
): Promise<FileSystemDirectoryHandle> {
  if (!apiDisponivel()) {
    throw new Error(
      "Este navegador não permite escolher pasta local. Use Chrome ou Edge no computador."
    );
  }
  const w = windowComPasta()!;
  const options: ShowDirectoryPickerOptions = { mode: "readwrite" };
  if (startIn) options.startIn = startIn;
  return w.showDirectoryPicker!(options);
}

/**
 * Resolve a subpasta sugerida sob a raiz (para abrir o diálogo já “dentro” dela).
 * Se falhar, devolve a raiz ou null.
 */
export async function obterPastaSugestaoParaPicker(
  raizOneDrive: FileSystemDirectoryHandle | null,
  pastaRelativa: PastaRelativaInbox
): Promise<FileSystemDirectoryHandle | null> {
  if (!raizOneDrive) return null;
  try {
    const ok = await garantirPermissaoEscrita(raizOneDrive);
    if (!ok) return raizOneDrive;
    const inbox = await garantirArvoreInbox(raizOneDrive);
    return await obterOuCriarSubpastas(inbox, pastaRelativa.split("/"));
  } catch {
    return raizOneDrive;
  }
}

/** Copia o arquivo para uma pasta qualquer escolhida no diálogo. */
export async function copiarArquivoParaPastaHandle(
  pastaDestino: FileSystemDirectoryHandle,
  arquivo: File
): Promise<{ nomeGravado: string; pastaNome: string }> {
  const ok = await garantirPermissaoEscrita(pastaDestino);
  if (!ok) {
    throw new Error("Sem permissão de escrita nesta pasta. Escolha outra.");
  }
  const nomeGravado = await nomeUnicoNaPasta(pastaDestino, arquivo.name);
  const fileHandle = await pastaDestino.getFileHandle(nomeGravado, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(await arquivo.arrayBuffer());
  } finally {
    await writable.close();
  }
  return { nomeGravado, pastaNome: pastaDestino.name };
}
