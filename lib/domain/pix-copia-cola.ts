/**
 * Leitura de PIX copia-e-cola (EMV / BR Code estático ou dinâmico).
 * Extrai valor, nome do recebedor, cidade e CNPJ/CPF quando presentes.
 */

export interface DadosPixCopiaCola {
  bruto: string;
  valor?: number;
  nomeRecebedor?: string;
  cidade?: string;
  /** CNPJ (14) ou CPF (11) só dígitos, se houver no payload. */
  documentoRecebedor?: string;
  /** Descrição / txid quando existir. */
  descricao?: string;
  /** ISO date se encontrar vencimento explícito (raro no estático). */
  vencimento?: string;
}

function parseTlv(payload: string): Map<string, string> {
  const map = new Map<string, string>();
  let i = 0;
  while (i + 4 <= payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!Number.isFinite(len) || len < 0 || i + 4 + len > payload.length) break;
    const valor = payload.slice(i + 4, i + 4 + len);
    map.set(id, valor);
    i += 4 + len;
  }
  return map;
}

function soDigitos(valor: string): string {
  return valor.replace(/\D+/g, "");
}

function extrairDocumentoDeCampo26(campo26: string): { documento?: string; descricao?: string } {
  const sub = parseTlv(campo26);
  // 01 = chave PIX (pode ser e-mail, telefone, EVP ou CNPJ/CPF)
  const chave = sub.get("01") ?? "";
  const digitos = soDigitos(chave);
  let documento: string | undefined;
  if (digitos.length === 14 || digitos.length === 11) {
    documento = digitos;
  }
  // 02 = descrição adicional
  const descricao = sub.get("02")?.trim() || undefined;
  return { documento, descricao };
}

function parseValorEmv(campo54?: string): number | undefined {
  if (!campo54) return undefined;
  const n = Number(campo54.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Number(n.toFixed(2));
}

/** Detecta payload PIX (começa com 000201…). */
export function parecePixCopiaCola(texto: string): boolean {
  const t = normalizarPayloadPix(texto);
  return /^000201/.test(t) && t.toLowerCase().includes("br.gov.bcb.pix");
}

/**
 * Não remove espaços internos — eles entram no comprimento TLV (ex.: descrição).
 * Só tira quebras de linha e espaços nas pontas.
 */
function normalizarPayloadPix(texto: string): string {
  return texto.replace(/[\r\n\t]+/g, "").trim();
}

/**
 * Interpreta o BR Code. Não valida CRC-16 (aceita payloads reais incompletos no fim).
 */
export function extrairDadosPixCopiaCola(texto: string): DadosPixCopiaCola | null {
  const bruto = normalizarPayloadPix(texto);
  if (!parecePixCopiaCola(bruto)) return null;

  const raiz = parseTlv(bruto);
  const campo26 = raiz.get("26") ?? "";
  const { documento, descricao } = extrairDocumentoDeCampo26(campo26);

  const valor = parseValorEmv(raiz.get("54"));
  const nomeRecebedor = raiz.get("59")?.trim() || undefined;
  const cidade = raiz.get("60")?.trim() || undefined;

  // Campo 72 / calendário dinâmico (quando presente): procura yyyy-mm-dd ou ddmmaaaa
  let vencimento: string | undefined;
  const extra = `${raiz.get("62") ?? ""}${raiz.get("72") ?? ""}`;
  const iso = extra.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) vencimento = iso[1];

  return {
    bruto,
    valor,
    nomeRecebedor,
    cidade,
    documentoRecebedor: documento,
    descricao,
    vencimento,
  };
}

/** Formata CNPJ/CPF só dígitos para exibição no campo. */
export function formatarDocumentoPix(digitos?: string): string | undefined {
  if (!digitos) return undefined;
  if (digitos.length === 14) {
    return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
  }
  if (digitos.length === 11) {
    return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
  }
  return digitos;
}

export function formatarValorPixParaInput(valor?: number): string {
  if (valor === undefined) return "";
  return valor.toFixed(2).replace(".", ",");
}

/** Hoje em ISO date (local). */
export function hojeIsoLocal(agora = new Date()): string {
  const y = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, "0");
  const d = String(agora.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
