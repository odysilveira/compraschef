/**
 * Monta PIX copia-e-cola (BR Code estático) — EMV / Bacen.
 * Complementa pix-copia-cola.ts (que só lê).
 */

export interface DadosPixBrCode {
  chave: string;
  nomeRecebedor: string;
  cidade: string;
  valor: number;
  /** Descrição / referência (máx. ~72 no campo 02 interno). */
  descricao?: string;
  /** TxId (campo 62-05). Padrão "***". */
  txid?: string;
}

function tlv(id: string, valor: string): string {
  const len = String(valor.length).padStart(2, "0");
  return `${id}${len}${valor}`;
}

function semAcentoUpper(txt: string): string {
  return txt
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 .\/\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncar(txt: string, max: number): string {
  return txt.length <= max ? txt : txt.slice(0, max);
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — padrão PIX. */
export function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Gera payload PIX estático (copia-e-cola) com valor.
 * Nome ≤ 25, cidade ≤ 15 (limite Bacen).
 */
export function montarPixBrCode(dados: DadosPixBrCode): string {
  const chave = (dados.chave || "").trim();
  if (!chave) throw new Error("Informe a chave PIX.");
  if (!Number.isFinite(dados.valor) || dados.valor <= 0) {
    throw new Error("Informe um valor PIX válido.");
  }

  const nome = truncar(semAcentoUpper(dados.nomeRecebedor || "RECEBEDOR"), 25) || "RECEBEDOR";
  const cidade = truncar(semAcentoUpper(dados.cidade || "LONDRINA"), 15) || "LONDRINA";
  const valorStr = dados.valor.toFixed(2);
  const desc = truncar((dados.descricao || "").trim(), 72);
  const txid = truncar((dados.txid || "***").trim() || "***", 25);

  let mai = tlv("00", "br.gov.bcb.pix") + tlv("01", chave);
  if (desc) mai += tlv("02", desc);

  let payload = "";
  payload += tlv("00", "01");
  payload += tlv("26", mai);
  payload += tlv("52", "0000");
  payload += tlv("53", "986");
  payload += tlv("54", valorStr);
  payload += tlv("58", "BR");
  payload += tlv("59", nome);
  payload += tlv("60", cidade);
  payload += tlv("62", tlv("05", txid));
  payload += "6304";
  payload += crc16Ccitt(payload);
  return payload;
}

export function podeGerarPixBrCode(chave?: string, valor?: number): boolean {
  return Boolean((chave || "").trim()) && Number.isFinite(valor) && (valor ?? 0) > 0;
}
