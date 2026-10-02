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

export interface TokenPdfDanfe {
  str: string;
  x: number;
  y: number;
}

const UNIDADES =
  "UN|UND|KG|CX|PCT|PC|PÇ|LT|L|FD|SC|M|M2|M3|ML|G|GR|DZ|RL|PAR|KIT|BD|BL|TB|GL|CJ|PR|JG|CT|AMP";

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

function itemValido(item: ItemDanfeExtraido): boolean {
  if (!item.descricao || item.quantidade <= 0) return false;
  if (/^(DANFE|NFE|PRODUTO|DESCRI|C[ÓO]DIGO|NCM|CST|CFOP)/i.test(item.descricao)) return false;
  return true;
}

function parseLinhaProduto(linha: string): ItemDanfeExtraido | null {
  const limpa = linha.replace(/[ \t]+/g, " ").trim();
  if (limpa.length < 10) return null;
  if (/^(NCM|CST|CFOP|DADOS|CALCULO|DESTINAT|EMITENTE|CHAVE|VALOR|BASE|ICMS|IPI|PIS|COFINS)/i.test(limpa)) {
    return null;
  }

  // código + descrição + UN + qtd + v.unit + v.total (+ colunas extras opcionais: NCM etc.)
  const padraoFlexivel = new RegExp(
    `^(\\S{1,24})\\s+(.+?)\\s+(${UNIDADES})\\s+(\\d+[.,]\\d+|\\d+)\\s+(\\d+[.,]\\d+)\\s+(\\d+[.,]\\d+)(?:\\s+.*)?$`,
    "i"
  );
  const m = limpa.match(padraoFlexivel);
  if (!m) return null;

  const quantidade = parseNumeroDanfe(m[4]);
  if (quantidade === undefined || quantidade <= 0) return null;

  const item: ItemDanfeExtraido = {
    codigo: m[1].trim(),
    descricao: m[2].replace(/\s+/g, " ").trim(),
    unidade: m[3].toUpperCase().replace("UND", "UN").replace("PÇ", "PC"),
    quantidade: Number(quantidade.toFixed(4)),
    valorUnitario: parseNumeroDanfe(m[5]),
    valorTotal: parseNumeroDanfe(m[6]),
  };
  return itemValido(item) ? item : null;
}

/**
 * Heurística para linhas de produto em DANFE com texto.
 * Aceita unidades extras e colunas à direita (NCM/CST).
 */
export function extrairItensDanfeDoTexto(texto: string): ItemDanfeExtraido[] {
  const linhas = texto.replace(/\u00a0/g, " ").split(/\r?\n/);
  const itens: ItemDanfeExtraido[] = [];
  const visto = new Set<string>();

  for (let i = 0; i < linhas.length; i += 1) {
    let candidato = linhas[i];
    let item = parseLinhaProduto(candidato);

    // descrição quebrada em 2 linhas: junta com a próxima se a atual não fechou
    if (!item && i + 1 < linhas.length) {
      const junta = `${linhas[i]} ${linhas[i + 1]}`.replace(/[ \t]+/g, " ").trim();
      item = parseLinhaProduto(junta);
      if (item) i += 1;
    }

    if (!item) continue;
    const chave = `${item.codigo}|${item.descricao}|${item.quantidade}`;
    if (visto.has(chave)) continue;
    visto.add(chave);
    itens.push(item);
  }

  return itens.slice(0, 80);
}

/**
 * Agrupa tokens do pdfjs por linha (Y) e tenta montar produtos pelas colunas (X).
 * Útil quando o texto vem fragmentado e a regex de linha única falha.
 */
export function extrairItensDanfeDeTokens(tokens: TokenPdfDanfe[]): ItemDanfeExtraido[] {
  if (!tokens.length) return [];

  const ordenados = [...tokens]
    .map((t) => ({
      str: (t.str ?? "").replace(/\u00a0/g, " ").trim(),
      x: t.x,
      y: Math.round(t.y),
    }))
    .filter((t) => t.str);

  const porLinha = new Map<number, typeof ordenados>();
  for (const token of ordenados) {
    let chaveY = token.y;
    for (const yExistente of Array.from(porLinha.keys())) {
      if (Math.abs(yExistente - token.y) <= 3) {
        chaveY = yExistente;
        break;
      }
    }
    const lista = porLinha.get(chaveY) ?? [];
    lista.push(token);
    porLinha.set(chaveY, lista);
  }

  const linhasY = Array.from(porLinha.keys()).sort((a, b) => b - a);
  const linhasTexto = linhasY.map((y) => {
    const toks = (porLinha.get(y) ?? []).sort((a, b) => a.x - b.x);
    return toks.map((t) => t.str).join(" ");
  });

  return extrairItensDanfeDoTexto(linhasTexto.join("\n"));
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
