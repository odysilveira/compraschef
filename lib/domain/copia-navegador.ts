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

const CAMPOS_DATA = [
  "atualizado_em",
  "importada_em",
  "criado_em",
  "recebido_em",
  "emitida_em",
  "enviado_em",
  "aplicada_em",
  "confirmado_em",
  "matched_at",
  "data",
];

function vazio(valor: unknown): boolean {
  return valor == null || valor === "" || (Array.isArray(valor) && valor.length === 0);
}

function instante(valor: unknown): number {
  if (!valor || typeof valor !== "object") return 0;
  const registro = valor as Record<string, unknown>;
  for (const campo of CAMPOS_DATA) {
    const texto = registro[campo];
    if (typeof texto !== "string" || !texto) continue;
    const tempo = Date.parse(texto);
    if (Number.isFinite(tempo)) return tempo;
  }
  return 0;
}

function pareceRegistro(valor: unknown): valor is { id: string } {
  return !!valor && typeof valor === "object" && typeof (valor as { id?: unknown }).id === "string";
}

/** Preenche buracos. Se os dois têm data, a mais nova manda; empate fica com o primeiro. */
export function juntarRegistro<T extends object>(primeiro: T, segundo: T): T {
  const primeiroFica = instante(primeiro) >= instante(segundo);
  const base = { ...(primeiroFica ? primeiro : segundo) } as Record<string, unknown>;
  const extra = (primeiroFica ? segundo : primeiro) as Record<string, unknown>;
  for (const [chave, valor] of Object.entries(extra)) {
    if (vazio(base[chave]) && !vazio(valor)) base[chave] = valor;
  }
  return base as T;
}

function juntarListas(local: unknown[], vindo: unknown[]): unknown[] {
  if (local.every((item) => typeof item === "string") && vindo.every((item) => typeof item === "string")) {
    return [...new Set([...local, ...vindo])];
  }
  const registros =
    (local.length === 0 || local.every(pareceRegistro)) &&
    (vindo.length === 0 || vindo.every(pareceRegistro));
  if (!registros) {
    const vistos = new Set<string>();
    const saida: unknown[] = [];
    for (const item of [...local, ...vindo]) {
      const chave = JSON.stringify(item);
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push(item);
    }
    return saida;
  }
  const porId = new Map<string, { id: string }>();
  for (const item of local) {
    if (pareceRegistro(item)) porId.set(item.id, item);
  }
  for (const item of vindo) {
    if (!pareceRegistro(item)) continue;
    const ja = porId.get(item.id);
    porId.set(item.id, ja ? juntarRegistro(ja, item) : item);
  }
  return [...porId.values()];
}

/** Junta dois bancos. O que só existe num lado entra. O mesmo id não duplica. */
export function juntarDados(local: unknown, vindo: unknown, raiz = false): unknown {
  if (vazio(local)) return vindo;
  if (vazio(vindo)) return local;
  if (raiz && typeof local === "boolean" && typeof vindo === "boolean") {
    return local || vindo;
  }
  if (Array.isArray(local) || Array.isArray(vindo)) {
    return juntarListas(Array.isArray(local) ? local : [], Array.isArray(vindo) ? vindo : []);
  }
  if (typeof local === "object" && typeof vindo === "object") {
    const a = local as Record<string, unknown>;
    const b = vindo as Record<string, unknown>;
    const saida: Record<string, unknown> = {};
    for (const chave of new Set([...Object.keys(a), ...Object.keys(b)])) {
      saida[chave] = juntarDados(a[chave], b[chave], true);
    }
    if (Array.isArray(saida.arquivos)) {
      saida.arquivos = unirPorCampo(saida.arquivos, "mes_ref");
    }
    return saida;
  }
  return local;
}

function unirPorCampo(lista: unknown[], campo: string): unknown[] {
  const porChave = new Map<string, { id?: string }>();
  const semChave: unknown[] = [];
  for (const item of lista) {
    if (!item || typeof item !== "object") {
      semChave.push(item);
      continue;
    }
    const chave = (item as Record<string, unknown>)[campo];
    if (typeof chave !== "string" || !chave) {
      semChave.push(item);
      continue;
    }
    const ja = porChave.get(chave);
    porChave.set(chave, ja ? juntarRegistro(ja, item as { id?: string }) : (item as { id?: string }));
  }
  return [...porChave.values(), ...semChave];
}

function chaveNota(nota: { chave_acesso?: string }): string {
  return String(nota.chave_acesso || "").replace(/\D/g, "");
}

/** Duas importações da mesma NF (ids diferentes, mesma chave) viram uma nota. */
export function unirNotasPelaChave(banco: Record<string, unknown>, idsLocais: Set<string>): void {
  const notas = banco.notas_fiscais;
  if (!Array.isArray(notas)) return;
  const porChave = new Map<string, Array<{ id: string; chave_acesso?: string }>>();
  for (const nota of notas) {
    if (!pareceRegistro(nota)) continue;
    const chave = chaveNota(nota as { chave_acesso?: string });
    if (chave.length < 20) continue;
    const grupo = porChave.get(chave) ?? [];
    grupo.push(nota as { id: string; chave_acesso?: string });
    porChave.set(chave, grupo);
  }
  const trocar = new Map<string, string>();
  const ficar = new Map<string, { id: string }>();
  for (const grupo of porChave.values()) {
    if (grupo.length < 2) continue;
    const local = grupo.find((nota) => idsLocais.has(nota.id));
    const keeper = local ?? [...grupo].sort((a, b) => instante(b) - instante(a))[0];
    let fundido = keeper;
    for (const nota of grupo) {
      if (nota.id !== keeper.id) {
        fundido = { ...juntarRegistro(fundido, nota), id: keeper.id };
        trocar.set(nota.id, keeper.id);
      }
    }
    ficar.set(keeper.id, fundido);
  }
  if (trocar.size === 0) return;
  banco.notas_fiscais = notas
    .filter((nota) => !(pareceRegistro(nota) && trocar.has(nota.id)))
    .map((nota) => (pareceRegistro(nota) && ficar.has(nota.id) ? ficar.get(nota.id) : nota));
  apontarNotas(banco, trocar);
}

function apontarNotas(valor: unknown, trocar: Map<string, string>): void {
  if (!valor || typeof valor !== "object") return;
  if (Array.isArray(valor)) {
    for (const item of valor) apontarNotas(item, trocar);
    return;
  }
  const registro = valor as Record<string, unknown>;
  for (const campo of ["nota_id", "notaId"]) {
    const id = registro[campo];
    if (typeof id === "string" && trocar.has(id)) registro[campo] = trocar.get(id);
  }
  for (const item of Object.values(registro)) apontarNotas(item, trocar);
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

function criarLoja(db: IDBDatabase, loja: LojaCopia) {
  if (db.objectStoreNames.contains(loja.nome)) return;
  const opcoes: IDBObjectStoreParameters = {};
  if (loja.keyPath) opcoes.keyPath = loja.keyPath;
  if (loja.autoIncrement) opcoes.autoIncrement = true;
  db.createObjectStore(loja.nome, opcoes);
}

async function abrirBancoParaJuntar(banco: BancoCopia): Promise<IDBDatabase> {
  const atual = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(banco.nome);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha ao abrir o banco local."));
  });
  const faltam = banco.lojas.filter((loja) => !atual.objectStoreNames.contains(loja.nome));
  if (faltam.length === 0) return atual;
  const versao = atual.version + 1;
  atual.close();
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(banco.nome, versao);
    req.onupgradeneeded = () => {
      for (const loja of faltam) criarLoja(req.result, loja);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha ao preparar o banco local."));
  });
}

async function importarBanco(banco: BancoCopia): Promise<void> {
  const db = await abrirBancoParaJuntar(banco);
  const nomes = banco.lojas.map((loja) => loja.nome).filter((nome) => db.objectStoreNames.contains(nome));
  if (nomes.length === 0) {
    db.close();
    return;
  }
  await new Promise<void>((resolve, reject) => {
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
  });
}

function juntarTextoJson(local: string | null, vindo: string): string {
  if (!local) return vindo;
  try {
    return JSON.stringify(juntarDados(JSON.parse(local), JSON.parse(vindo), true));
  } catch {
    return local;
  }
}

export async function importarCopiaNavegador(texto: string): Promise<string> {
  const lido: unknown = JSON.parse(texto);
  if (!copiaValida(lido)) throw new Error("Este arquivo não é uma cópia do ComprasChef.");
  if (!lido.localStorage["compraschef-db-v1"]) {
    throw new Error("A cópia não tem o cadastro de notas e produtos.");
  }
  const vindo = JSON.parse(lido.localStorage["compraschef-db-v1"]) as Record<string, unknown>;
  const localRaw = localStorage.getItem("compraschef-db-v1");
  let fundido = vindo;
  if (localRaw) {
    const local = JSON.parse(localRaw) as Record<string, unknown>;
    const idsLocais = new Set(
      (Array.isArray(local.notas_fiscais) ? local.notas_fiscais : [])
        .filter(pareceRegistro)
        .map((nota) => nota.id)
    );
    fundido = juntarDados(local, vindo, true) as Record<string, unknown>;
    unirNotasPelaChave(fundido, idsLocais);
  }
  localStorage.setItem("compraschef-db-v1", JSON.stringify(fundido));
  for (const [chave, valor] of Object.entries(lido.localStorage)) {
    if (!chaveEntraNaCopia(chave) || chave === "compraschef-db-v1") continue;
    localStorage.setItem(chave, juntarTextoJson(localStorage.getItem(chave), valor));
  }
  for (const banco of lido.indexedDB) {
    await importarBanco(banco);
  }
  const produtos = Array.isArray(fundido.produtos) ? fundido.produtos.length : 0;
  const notas = Array.isArray(fundido.notas_fiscais) ? fundido.notas_fiscais.length : 0;
  return `${produtos} produtos e ${notas} notas neste navegador, já juntados.`;
}
