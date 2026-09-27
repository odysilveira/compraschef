// Geração de payload Pix BR Code (EMV QR) — porta pura dos Artifacts PixMoto/PixFreela.
// Sem dependência de React nem do resto do app.

import type { TipoChavePix } from "@/lib/types";

function crc16ccitt(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, "0") + value;
}

export function normalizeText(s?: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .trim();
}

export interface PixPayloadInput {
  chave: string;
  valor?: number | string;
  nome: string;
  cidade?: string;
  descricao?: string;
  txid?: string;
}

export function buildPixPayload({ chave, valor, nome, cidade, descricao, txid }: PixPayloadInput): string {
  const merchantInfo =
    tlv("00", "br.gov.bcb.pix") +
    tlv("01", chave) +
    (descricao ? tlv("02", normalizeText(descricao).slice(0, 25) || descricao.slice(0, 25)) : "");
  const field26 = tlv("26", merchantInfo);
  const amountField = valor ? tlv("54", Number(valor).toFixed(2)) : "";
  const nomeField = tlv("59", (normalizeText(nome) || "RECEBEDOR").slice(0, 25) || "RECEBEDOR");
  const cidadeField = tlv("60", (normalizeText(cidade) || "BRASIL").slice(0, 15) || "BRASIL");
  const txidValue = (txid || "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const addData = tlv("62", tlv("05", txidValue));
  let payload =
    tlv("00", "01") +
    tlv("01", "11") +
    field26 +
    tlv("52", "0000") +
    tlv("53", "986") +
    amountField +
    tlv("58", "BR") +
    nomeField +
    cidadeField +
    addData;
  payload += "6304";
  payload += crc16ccitt(payload);
  return payload;
}

export function formatChave(tipo: TipoChavePix, raw: string): string {
  let v = (raw || "").trim();
  if (tipo === "cpf" || tipo === "cnpj") {
    v = v.replace(/\D/g, "");
  } else if (tipo === "celular") {
    const digits = v.replace(/\D/g, "");
    v = digits.startsWith("55") && digits.length >= 12 ? `+${digits}` : `+55${digits}`;
  } else if (tipo === "email") {
    v = v.toLowerCase();
  }
  return v;
}

export function maskChave(tipo: TipoChavePix, chave: string): string {
  if (tipo === "email" || tipo === "celular") return chave;
  if (chave.length > 8) return chave.slice(0, 4) + "••••" + chave.slice(-4);
  return chave;
}
