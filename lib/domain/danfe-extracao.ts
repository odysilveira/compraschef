/**
 * Extracao estruturada a partir do texto de uma DANFE (PDF com texto selecionavel),
 * OCR ou XML da NF-e quando disponivel.
 * Nao confirma recebimento nem movimenta estoque: apenas prepara dados para conferencia humana.
 */

import { identificarNotaPorTexto, type NotaIdentificadaDanfe } from "./danfe-identificacao";
import {
  extrairItensDanfePipeline,
  type EntradaItensDanfe,
  type FonteItensDanfe,
  type ItemDanfeConferencia,
  type ResultadoItensDanfe,
} from "./danfe-itens";

export interface ItemDanfeExtraido {
  codigo: string;
  descricao: string;
  ncm?: string;
  cfop?: string;
  unidade: string;
  quantidade: number;
  valorUnitario?: number;
  valorTotal?: number;
  confianca?: number;
  avisos?: string[];
}

export interface DadosDanfeExtraidos {
  nota: NotaIdentificadaDanfe | null;
  nomeEmitente?: string;
  valorTotalNota?: number;
  itens: ItemDanfeExtraido[];
  itensConferencia?: ResultadoItensDanfe;
  origemTexto: boolean;
}

function somenteDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function parseNumeroDanfe(bruto: string): number | undefined {
  const limpo = bruto.trim();
  if (!limpo) return undefined;
  if (/^\d+,\d+$/.test(limpo)) {
    const n = Number(limpo.replace(",", "."));
    return Number.isFinite(n) ? Number(n.toFixed(4)) : undefined;
  }
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(limpo)) {
    const n = Number(limpo.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? Number(n.toFixed(2)) : undefined;
  }
  const n = Number(limpo.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function primeiroMatch(texto: string, regex: RegExp): string | undefined {
  const m = texto.match(regex);
  return m?.[1]?.trim() || undefined;
}

function mapearItemConferencia(item: ItemDanfeConferencia): ItemDanfeExtraido {
  return {
    codigo: item.codigoFornecedor ?? "",
    descricao: item.descricao,
    ncm: item.ncm,
    cfop: item.cfop,
    unidade: item.unidade ?? "",
    quantidade: item.quantidade ?? 0,
    valorUnitario: item.valorUnitario,
    valorTotal: item.valorTotal,
    confianca: item.confianca,
    avisos: item.avisos,
  };
}

function entradaPorFonte(texto: string, fonte: FonteItensDanfe): EntradaItensDanfe {
  if (fonte === "xml_nfe") return { xmlNfe: texto };
  if (fonte === "ocr") return { textoOcr: texto };
  return { textoPdf: texto };
}

/** Razao social do emitente (bloco superior da DANFE). */
export function extrairNomeEmitenteDanfe(texto: string): string | undefined {
  const t = texto.replace(/\u00a0/g, " ");
  const candidatos = [
    primeiroMatch(t, /RECEBEMOS\s+DE\s+([A-Z\u00c0-\u00da0-9][A-Z\u00c0-\u00da0-9\s\.,&\-]{5,80}?)\s+OS\s+PRODUTOS/i),
    primeiroMatch(t, /IDENTIFICA[C\u00c7][A\u00c3]O\s+DO\s+EMITENTE\s*\n+\s*([^\n]{5,90})/i),
    primeiroMatch(t, /^\s*([A-Z\u00c0-\u00da][A-Z\u00c0-\u00da0-9\s\.,&\-]{8,80}(?:LTDA|S\/?A|EIRELI|ME|EPP))/im),
  ];
  for (const c of candidatos) {
    const nome = c?.replace(/\s+/g, " ").trim();
    if (nome && nome.length >= 5 && !/DANFE|NFE|CHAVE/i.test(nome)) return nome;
  }
  return undefined;
}

export function extrairValorTotalDanfe(texto: string): number | undefined {
  const t = texto.replace(/\u00a0/g, " ");
  const bruto =
    primeiroMatch(t, /VALOR\s+TOTAL\s+DA\s+NOTA\s*[:.]?\s*R?\$?\s*([\d.]+,\d{2})/i) ||
    primeiroMatch(t, /V\.\s*TOTAL\s+DA\s+NOTA\s*[:.]?\s*R?\$?\s*([\d.]+,\d{2})/i);
  return bruto ? parseNumeroDanfe(bruto) : undefined;
}

/**
 * Heuristica para linhas de produto em DANFE com texto.
 * Formato tipico: codigo + descricao + NCM + CFOP + UN + qtd + v.unit + v.total.
 */
export function extrairItensDanfeDoTexto(texto: string, fonte: FonteItensDanfe = "pdf_texto"): ItemDanfeExtraido[] {
  return extrairItensDanfePipeline(entradaPorFonte(texto, fonte)).itens.map(mapearItemConferencia);
}

export function extrairDadosDanfeDoTexto(texto: string, fonte: FonteItensDanfe = "pdf_texto"): DadosDanfeExtraidos {
  const nota = identificarNotaPorTexto(texto);
  const itensConferencia = extrairItensDanfePipeline(entradaPorFonte(texto, fonte));
  return {
    nota,
    nomeEmitente: fonte === "xml_nfe" ? undefined : extrairNomeEmitenteDanfe(texto),
    valorTotalNota: itensConferencia.totalProdutosNota ?? (fonte === "xml_nfe" ? undefined : extrairValorTotalDanfe(texto)),
    itens: itensConferencia.itens.map(mapearItemConferencia),
    itensConferencia,
    origemTexto: Boolean(texto.trim()),
  };
}

export function cnpjDaNotaDanfe(nota: NotaIdentificadaDanfe | null): string | undefined {
  if (!nota?.cnpj || somenteDigitos(nota.cnpj).length !== 14) return undefined;
  return somenteDigitos(nota.cnpj);
}