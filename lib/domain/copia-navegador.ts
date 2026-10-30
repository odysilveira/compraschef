/**
 * Cópia do que este navegador guardou (notas, produtos, PDFs da caixa).
 * O arquivo fica com quem baixa — não entra no GitHub nem na publicação.
 */

export const VERSAO_COPIA_NAVEGADOR = 1;

const PREFIXOS_LOCAL_STORAGE = ["compraschef", "integracao-saipos"];

const BANCOS_INDEXEDDB = [
  "compraschef-caixa-entrada",
  "compraschef-documentos-boleto",
  "compraschef-inbox-favoritas",
  "compraschef-lote-recebimento",
  "compraschef-onedrive-pasta",
];

type ValorCopia =
  | null
  | string
  | number
  | boolean
  | ValorCopia[]
  | { [chave: string]: ValorCopia }
  | { $compraschef: "blob"; tipo: string; base64: string }
  | { $compraschef: "data"; iso: string };

type LojaCopia = {
  nome: string;
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  registros: ValorCopia[];
};

type BancoCopia = {
  nome: string;
  versao: number;
  lojas: LojaCopia[];
};

export type CopiaNavegador = {
  versao: number;
  exportadoEm: string;
  origem: string;
  localStorage: Record<string, string>;
  indexedDB: BancoCopia[];
};

export function chaveEntraNaCopia(chave: string): boolean {
  return PREFIXOS_LOCAL_STORAGE.some((prefixo) => chave === prefixo || chave.startsWith(`${prefixo}-`) || chave.startsWith(`${prefixo}:`));
}

function bufferParaBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binario = "";
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) {
    binario += String.fromCharCode(...bytes.subarray(i, i + passo));
  }
  return btoa(binario);
}

function base64ParaBlob(base64: string, tipo: string): Blob {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: tipo || "application/octet-stream" });
}

function ehHandleArquivo(valor: unknown): boolean {
  return typeof FileSystemHandle !== "undefined" && valor instanceof FileSystemHandle;
}

export async function serializarValor(valor: unknown): Promise<ValorCopia> {
  if (valor == null) return null;
  if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") return valor;
  if (valor instanceof Date) return { $compraschef: "data", iso: valor.toISOString() };
  if (typeof Blob !== "undefined" && valor instanceof Blob) {
    return {
      $compraschef: "blob",
      tipo: valor.type || "application/octet-stream",
      base64: bufferParaBase64(await valor.arrayBuffer()),
    };
  }
  if (ehHandleArquivo(valor)) return null;
  if (Array.isArray(valor)) {
    const itens: ValorCopia[] = [];
    for (const item of valor) itens.push(await serializarValor(item));
    return itens;
  }
  if (typeof valor === "object") {
    const saida: { [chave: string]: ValorCopia } = {};
    for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
      if (ehHandleArquivo(item)) continue;
      saida[chave] = await serializarValor(item);
    }
    return saida;
  }
  return null;
}

export function desserializarValor(valor: ValorCopia): unknown {
  if (valor == null || typeof valor !== "object") return valor;
  if (Array.isArray(valor)) return valor.map((item) => desserializarValor(item));
  if ("$compraschef" in valor && valor.$compraschef === "blob") {
    return base64ParaBlob(valor.base64, valor.tipo);
  }
  if ("$compraschef" in valor && valor.$compraschef === "data") {
    return new Date(valor.iso);
  }
  const saida: Record<string, unknown> = {};
  for (const [chave, item] of Object.entries(valor)) {
    saida[chave] = desserializarValor(item as ValorCopia);
  }
  return saida;
}

function pedido<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha no IndexedDB."));
  });
}

async function nomesBancos(): Promise<string[]> {
  const fabrica = indexedDB as IDBFactory & {
    databases?: () => Promise<Array<{ name?: string | null }>>;
  };
  if (typeof fabrica.databases === "function") {
    const lista = await fabrica.databases();
    const nomes = lista
      .map((item) => item.name || "")
      .filter((nome) => nome.startsWith("compraschef-"));
    if (nomes.length > 0) return nomes;
  }
  return BANCOS_INDEXEDDB;
}

async function exportarBanco(nome: string): Promise<BancoCopia | null> {
  let db: IDBDatabase;
  try {
    db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(nome);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
  try {
    const lojas: LojaCopia[] = [];
    for (const nomeLoja of Array.from(db.objectStoreNames)) {
      const tx = db.transaction(nomeLoja, "readonly");
      const loja = tx.objectStore(nomeLoja);
      const registros = await pedido(loja.getAll());
      const serializados: ValorCopia[] = [];
      for (const registro of registros) serializados.push(await serializarValor(registro));
      lojas.push({
        nome: nomeLoja,
        keyPath: loja.keyPath,
        autoIncrement: loja.autoIncrement,
        registros: serializados,
      });
    }
    return { nome, versao: db.version || 1, lojas };
  } finally {
    db.close();
  }
}

export async function exportarCopiaNavegador(): Promise<CopiaNavegador> {
  const local: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const chave = localStorage.key(i);
    if (!chave || !chaveEntraNaCopia(chave)) continue;
    const valor = localStorage.getItem(chave);
    if (valor != null) local[chave] = valor;
  }
  const bancos: BancoCopia[] = [];
  for (const nome of await nomesBancos()) {
    const banco = await exportarBanco(nome);
    if (banco) bancos.push(banco);
  }
  return {
    versao: VERSAO_COPIA_NAVEGADOR,
    exportadoEm: new Date().toISOString(),
    origem: typeof location === "undefined" ? "" : location.origin,
    localStorage: local,
    indexedDB: bancos,
  };
}

export function resumoCopia(copia: CopiaNavegador): string {
  let notas = 0;
  let produtos = 0;
  try {
    const banco = JSON.parse(copia.localStorage["compraschef-db-v1"] || "{}") as {
      notas_fiscais?: unknown[];
      produtos?: unknown[];
    };
    notas = banco.notas_fiscais?.length ?? 0;
    produtos = banco.produtos?.length ?? 0;
  } catch {
    // resumo parcial
  }
  const arquivos = copia.indexedDB.reduce(
    (total, banco) => total + banco.lojas.reduce((n, loja) => n + loja.registros.length, 0),
    0
  );
  return `${produtos} produtos, ${notas} notas e ${arquivos} arquivos deste navegador.`;
}

function copiaValida(valor: unknown): valor is CopiaNavegador {
  if (!valor || typeof valor !== "object") return false;
  const copia = valor as CopiaNavegador;
  return copia.versao === VERSAO_COPIA_NAVEGADOR && !!copia.localStorage && Array.isArray(copia.indexedDB);
}

async function importarBanco(banco: BancoCopia): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const pedidoExclusao = indexedDB.deleteDatabase(banco.nome);
    pedidoExclusao.onsuccess = () => resolve();
    pedidoExclusao.onerror = () => reject(pedidoExclusao.error ?? new Error("Falha ao limpar o banco local."));
    pedidoExclusao.onblocked = () => resolve();
  });
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(banco.nome, banco.versao || 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const loja of banco.lojas) {
        if (db.objectStoreNames.contains(loja.nome)) continue;
        const opcoes: IDBObjectStoreParameters = {};
        if (loja.keyPath) opcoes.keyPath = loja.keyPath;
        if (loja.autoIncrement) opcoes.autoIncrement = true;
        db.createObjectStore(loja.nome, opcoes);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const nomes = banco.lojas.map((loja) => loja.nome).filter((nome) => db.objectStoreNames.contains(nome));
      if (nomes.length === 0) {
        db.close();
        resolve();
        return;
      }
      const tx = db.transaction(nomes, "readwrite");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("Falha ao gravar arquivos da cópia."));
      };
      for (const loja of banco.lojas) {
        if (!db.objectStoreNames.contains(loja.nome)) continue;
        const store = tx.objectStore(loja.nome);
        for (const registro of loja.registros) {
          store.put(desserializarValor(registro));
        }
      }
    };
    req.onerror = () => reject(req.error ?? new Error("Falha ao abrir o banco local."));
  });
}

export async function importarCopiaNavegador(texto: string): Promise<string> {
  const lido: unknown = JSON.parse(texto);
  if (!copiaValida(lido)) throw new Error("Este arquivo não é uma cópia do ComprasChef.");
  if (!lido.localStorage["compraschef-db-v1"]) {
    throw new Error("A cópia não tem o cadastro de notas e produtos.");
  }
  for (const [chave, valor] of Object.entries(lido.localStorage)) {
    if (chaveEntraNaCopia(chave)) localStorage.setItem(chave, valor);
  }
  for (const banco of lido.indexedDB) {
    await importarBanco(banco);
  }
  return resumoCopia(lido);
}
