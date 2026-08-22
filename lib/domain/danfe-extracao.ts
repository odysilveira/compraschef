/**
 * Extração estruturada a partir do texto de uma DANFE (PDF com texto selecionável).
 * Não substitui o XML da NF-e — cobre chave, emitente e linhas de produto quando legíveis.
 */

import { identificarNotaPorTexto, type NotaIdentificadaDanfe } from "./danfe-identificacao";

export interface ItemDanfeExtraido {
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  valorUnitario?: number;
  valorTotal?: number;
}

export interface DadosDanfeExtraidos {
  nota: NotaIdentificadaDanfe | null;
  nomeEmitente?: string;
  valorTotalNota?: number;
  itens: ItemDanfeExtraido[];
  origemTexto: boolean;
}

function somenteDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function parseNumeroDanfe(bruto: string): number | undefined {
  const limpo = bruto.trim();
  if (!limpo) return undefined;
  // 40,0000 ou 7,5000 ou 300,00 → vírgula decimal
  if (/^\d+,\d+$/.test(limpo)) {
    const n = Number(limpo.replace(",", "."));
    return Number.isFinite(n) ? Number(n.toFixed(4)) : undefined;
  }
  // 1.234,56 → milhar + decimal BR
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

/** Razão social do emitente (bloco superior da DANFE). */
export function extrairNomeEmitenteDanfe(texto: string): string | undefined {
  const t = texto.replace(/\u00a0/g, " ");
  const candidatos = [
    primeiroMatch(t, /RECEBEMOS\s+DE\s+([A-ZÀ-Ú0-9][A-ZÀ-Ú0-9\s\.\,&\-]{5,80}?)\s+OS\s+PRODUTOS/i),
    primeiroMatch(t, /IDENTIFICA[CÇ][AÃ]O\s+DO\s+EMITENTE\s*\n+\s*([^\n]{5,90})/i),
    primeiroMatch(t, /^\s*([A-ZÀ-Ú][A-ZÀ-Ú0-9\s\.\,&\-]{8,80}(?:LTDA|S\/?A|EIRELI|ME|EPP))/im),
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
 * Heurística para linhas de produto em DANFE com texto.
 * Formato típico: código + descrição + UN + qtd + v.unit + v.total
 */
export function extrairItensDanfeDoTexto(texto: string): ItemDanfeExtraido[] {
  const linhas = texto.replace(/\u00a0/g, " ").split(/\r?\n/);
  const itens: ItemDanfeExtraido[] = [];
  const visto = new Set<string>();

  // Ex.: 1100 DETERGENTE ... UN 40,0000 7,5000 300,00
  const padrao =
    /^(\S{1,20})\s+(.+?)\s+(UN|KG|CX|PCT|PC|LT|L|FD|SC|M|M2|M3)\s+(\d+[.,]\d+|\d+)\s+(\d+[.,]\d+)\s+(\d+[.,]\d+)\s*$/i;

  for (const linhaBruta of linhas) {
    const linha = linhaBruta.replace(/[ \t]+/g, " ").trim();
    if (linha.length < 12) continue;
    if (/^(NCM|CST|CFOP|DADOS|CALCULO|DESTINAT|EMITENTE|CHAVE|VALOR)/i.test(linha)) continue;

    const m = linha.match(padrao);
    if (!m) continue;

    const codigo = m[1].trim();
    const descricao = m[2].replace(/\s+/g, " ").trim();
    const unidade = m[3].toUpperCase();
    const quantidade = parseNumeroDanfe(m[4]);
    const valorUnitario = parseNumeroDanfe(m[5]);
    const valorTotal = parseNumeroDanfe(m[6]);
    if (!descricao || quantidade === undefined || quantidade <= 0) continue;
    if (/^(DANFE|NFE|PRODUTO)/i.test(descricao)) continue;

    const chave = `${codigo}|${descricao}|${quantidade}`;
    if (visto.has(chave)) continue;
    visto.add(chave);

    itens.push({
      codigo,
      descricao,
      unidade,
      quantidade: Number(quantidade.toFixed(4)),
      valorUnitario,
      valorTotal,
    });
  }

  return itens.slice(0, 80);
}

export function extrairDadosDanfeDoTexto(texto: string): DadosDanfeExtraidos {
  const nota = identificarNotaPorTexto(texto);
  return {
    nota,
    nomeEmitente: extrairNomeEmitenteDanfe(texto),
    valorTotalNota: extrairValorTotalDanfe(texto),
    itens: extrairItensDanfeDoTexto(texto),
    origemTexto: Boolean(texto.trim()),
  };
}

export function cnpjDaNotaDanfe(nota: NotaIdentificadaDanfe | null): string | undefined {
  if (!nota?.cnpj || somenteDigitos(nota.cnpj).length !== 14) return undefined;
  return somenteDigitos(nota.cnpj);
}
