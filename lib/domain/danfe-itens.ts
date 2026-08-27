export type FonteItensDanfe = "xml_nfe" | "pdf_texto" | "ocr";
export type StatusVinculoItemDanfe = "sugerido" | "confirmado" | "produto_novo" | "pendente";

export interface ItemDanfeConferencia {
  indice: number;
  codigoFornecedor?: string;
  descricao: string;
  ncm?: string;
  cfop?: string;
  unidade?: string;
  quantidade?: number;
  valorUnitario?: number;
  valorTotal?: number;
  confianca: number;
  avisos: string[];
  produtoIdSugerido?: string;
  statusVinculo: StatusVinculoItemDanfe;
}

export interface ResultadoItensDanfe {
  fonte: FonteItensDanfe;
  itens: ItemDanfeConferencia[];
  totalProdutosNota?: number;
  totalItensCalculado?: number;
  divergenciaTotal?: number;
  avisosGerais: string[];
}

export interface EntradaItensDanfe {
  xmlNfe?: string;
  textoPdf?: string;
  textoOcr?: string;
}

function limparTexto(valor: string): string {
  return valor.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

function parseNumeroDanfe(valor?: string): number | undefined {
  if (!valor) return undefined;
  const limpo = valor.trim();
  if (!limpo) return undefined;
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) ? Number(n.toFixed(4)) : undefined;
}

function tag(bloco: string, nome: string): string | undefined {
  const m = bloco.match(new RegExp(`<(?:\\w+:)?${nome}>([\\s\\S]*?)<\\/(?:\\w+:)?${nome}>`, "i"));
  return m?.[1]?.trim();
}

function arredondar2(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function calcularConfianca(item: Omit<ItemDanfeConferencia, "confianca" | "avisos" | "statusVinculo">, fonte: FonteItensDanfe): { confianca: number; avisos: string[] } {
  const avisos: string[] = [];
  let pontos = fonte === "xml_nfe" ? 0.92 : fonte === "pdf_texto" ? 0.76 : 0.58;
  if (!item.codigoFornecedor) {
    pontos -= 0.08;
    avisos.push("Codigo do fornecedor ausente ou duvidoso.");
  }
  if (!item.ncm) {
    pontos -= 0.05;
    avisos.push("NCM ausente.");
  }
  if (!item.cfop) {
    pontos -= 0.05;
    avisos.push("CFOP ausente.");
  }
  if (!item.unidade) {
    pontos -= 0.08;
    avisos.push("Unidade ausente.");
  }
  if (!item.quantidade || item.quantidade <= 0) {
    pontos -= 0.16;
    avisos.push("Quantidade ausente ou invalida.");
  }
  if (item.valorUnitario === undefined) {
    pontos -= 0.06;
    avisos.push("Valor unitario ausente.");
  }
  if (item.valorTotal === undefined) {
    pontos -= 0.06;
    avisos.push("Valor total ausente.");
  }
  if (item.quantidade && item.valorUnitario !== undefined && item.valorTotal !== undefined) {
    const esperado = arredondar2(item.quantidade * item.valorUnitario);
    if (Math.abs(esperado - item.valorTotal) > 0.03) {
      pontos -= 0.12;
      avisos.push(`Total do item diverge de quantidade x valor unitario (${esperado.toFixed(2)}).`);
    }
  }
  return { confianca: Math.max(0.05, Math.min(1, Number(pontos.toFixed(2)))), avisos };
}

function montarItem(
  bruto: Omit<ItemDanfeConferencia, "indice" | "confianca" | "avisos" | "statusVinculo">,
  indice: number,
  fonte: FonteItensDanfe
): ItemDanfeConferencia {
  const base = {
    indice,
    ...bruto,
    descricao: limparTexto(bruto.descricao),
    codigoFornecedor: bruto.codigoFornecedor ? limparTexto(bruto.codigoFornecedor) : undefined,
    unidade: bruto.unidade ? limparTexto(bruto.unidade).toUpperCase() : undefined,
  };
  const qualidade = calcularConfianca(base, fonte);
  return { ...base, ...qualidade, statusVinculo: "pendente" };
}

export function extrairTotalProdutosDanfe(texto: string): number | undefined {
  const t = texto.replace(/\u00a0/g, " ");
  const padroes = [
    /VALOR\s+TOTAL\s+DOS\s+PRODUTOS\s*[:.]?\s*R?\$?\s*([\d.]+,\d{2})/i,
    /TOTAL\s+DOS\s+PRODUTOS\s*[:.]?\s*R?\$?\s*([\d.]+,\d{2})/i,
    /V\.\s*TOTAL\s+PRODUTOS\s*[:.]?\s*R?\$?\s*([\d.]+,\d{2})/i,
  ];
  for (const padrao of padroes) {
    const valor = parseNumeroDanfe(t.match(padrao)?.[1]);
    if (valor !== undefined) return valor;
  }
  return undefined;
}

export function extrairItensDanfeDeXml(xml: string): ItemDanfeConferencia[] {
  const dets = Array.from(xml.matchAll(/<(?:\w+:)?det\b[\s\S]*?<\/(?:\w+:)?det>/gi)).map((m) => m[0]);
  return dets
    .map((det, indice) => {
      const prod = det.match(/<(?:\w+:)?prod>[\s\S]*?<\/(?:\w+:)?prod>/i)?.[0] ?? det;
      return montarItem(
        {
          codigoFornecedor: tag(prod, "cProd"),
          descricao: tag(prod, "xProd") ?? "Item sem descricao",
          ncm: tag(prod, "NCM"),
          cfop: tag(prod, "CFOP"),
          unidade: tag(prod, "uCom") ?? tag(prod, "uTrib"),
          quantidade: parseNumeroDanfe(tag(prod, "qCom") ?? tag(prod, "qTrib")),
          valorUnitario: parseNumeroDanfe(tag(prod, "vUnCom") ?? tag(prod, "vUnTrib")),
          valorTotal: parseNumeroDanfe(tag(prod, "vProd")),
        },
        indice,
        "xml_nfe"
      );
    })
    .filter((item) => item.descricao && item.descricao !== "Item sem descricao");
}

function linhaEhCabecalhoOuRodape(linha: string): boolean {
  return /^(DANFE|DOCUMENTO|AUXILIAR|CHAVE|NCM|CST|CSOSN|CFOP|DADOS|CALCULO|DESTINAT|EMITENTE|VALOR|TOTAL|BASE|PROTOCOLO|COD|CODIGO)/i.test(linha);
}

function tentarItemDeBuffer(buffer: string[], fonte: FonteItensDanfe, indice: number): ItemDanfeConferencia | null {
  const linha = limparTexto(buffer.join(" "));
  if (linha.length < 12) return null;

  const completo = linha.match(/^(\S{1,30})\s+(.+?)\s+(\d{8})\s+(\d{4})\s+([A-Z]{1,6})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)$/i);
  if (completo) {
    return montarItem(
      {
        codigoFornecedor: completo[1],
        descricao: completo[2],
        ncm: somenteDigitos(completo[3]),
        cfop: somenteDigitos(completo[4]),
        unidade: completo[5],
        quantidade: parseNumeroDanfe(completo[6]),
        valorUnitario: parseNumeroDanfe(completo[7]),
        valorTotal: parseNumeroDanfe(completo[8]),
      },
      indice,
      fonte
    );
  }

  const semNcm = linha.match(/^(\S{1,30})\s+(.+?)\s+([A-Z]{1,6})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)$/i);
  if (semNcm) {
    return montarItem(
      {
        codigoFornecedor: semNcm[1],
        descricao: semNcm[2],
        unidade: semNcm[3],
        quantidade: parseNumeroDanfe(semNcm[4]),
        valorUnitario: parseNumeroDanfe(semNcm[5]),
        valorTotal: parseNumeroDanfe(semNcm[6]),
      },
      indice,
      fonte
    );
  }

  return null;
}

export function extrairItensDanfeDeTexto(texto: string, fonte: FonteItensDanfe = "pdf_texto"): ItemDanfeConferencia[] {
  const linhas = texto
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map(limparTexto)
    .filter(Boolean);
  const itens: ItemDanfeConferencia[] = [];
  let buffer: string[] = [];

  function descarregar() {
    if (buffer.length === 0) return;
    const item = tentarItemDeBuffer(buffer, fonte, itens.length);
    if (item) itens.push(item);
    buffer = [];
  }

  for (const linha of linhas) {
    if (linhaEhCabecalhoOuRodape(linha)) {
      descarregar();
      continue;
    }
    const primeiroToken = linha.split(" ")[0] ?? "";
    const iniciaItem = /^\S{1,30}\s+/.test(linha) && /\d/.test(primeiroToken) && !/^\d{8}\s+\d{4}\b/.test(linha);
    if (iniciaItem && buffer.length > 0) {
      const item = tentarItemDeBuffer(buffer, fonte, itens.length);
      if (item) {
        itens.push(item);
        buffer = [linha];
        continue;
      }
    }
    buffer.push(linha);
    const item = tentarItemDeBuffer(buffer, fonte, itens.length);
    if (item) {
      itens.push(item);
      buffer = [];
    }
  }
  descarregar();

  const vistos = new Set<string>();
  return itens.filter((item) => {
    const chave = `${item.codigoFornecedor}|${item.descricao}|${item.quantidade}|${item.valorTotal}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  }).slice(0, 120);
}

export function validarTotalItensDanfe(itens: ItemDanfeConferencia[], totalProdutosNota?: number): Pick<ResultadoItensDanfe, "totalItensCalculado" | "divergenciaTotal" | "avisosGerais"> {
  const totalItensCalculado = arredondar2(
    itens.reduce((soma, item) => soma + (item.valorTotal ?? 0), 0)
  );
  if (totalProdutosNota === undefined) {
    return { totalItensCalculado, avisosGerais: ["Total dos produtos da nota nao encontrado para conferencia."] };
  }
  const divergenciaTotal = arredondar2(totalItensCalculado - totalProdutosNota);
  return {
    totalItensCalculado,
    divergenciaTotal,
    avisosGerais: Math.abs(divergenciaTotal) > 0.03
      ? [`Soma dos itens diverge do total dos produtos da nota em ${divergenciaTotal.toFixed(2)}.`]
      : [],
  };
}

function totalProdutosXml(xml: string): number | undefined {
  return parseNumeroDanfe(
    xml.match(/<(?:\w+:)?ICMSTot>[\s\S]*?<(?:\w+:)?vProd>([\s\S]*?)<\/(?:\w+:)?vProd>[\s\S]*?<\/(?:\w+:)?ICMSTot>/i)?.[1]
  );
}

export function extrairItensDanfePipeline(entrada: EntradaItensDanfe): ResultadoItensDanfe {
  const xml = entrada.xmlNfe?.trim();
  if (xml) {
    const itens = extrairItensDanfeDeXml(xml);
    const totalProdutosNota = totalProdutosXml(xml);
    return { fonte: "xml_nfe", itens, totalProdutosNota, ...validarTotalItensDanfe(itens, totalProdutosNota) };
  }

  const textoPdf = entrada.textoPdf?.trim();
  if (textoPdf) {
    const itens = extrairItensDanfeDeTexto(textoPdf, "pdf_texto");
    const totalProdutosNota = extrairTotalProdutosDanfe(textoPdf);
    return { fonte: "pdf_texto", itens, totalProdutosNota, ...validarTotalItensDanfe(itens, totalProdutosNota) };
  }

  const textoOcr = entrada.textoOcr?.trim() ?? "";
  const itens = textoOcr ? extrairItensDanfeDeTexto(textoOcr, "ocr") : [];
  const totalProdutosNota = textoOcr ? extrairTotalProdutosDanfe(textoOcr) : undefined;
  const resultadoValidacao = validarTotalItensDanfe(itens, totalProdutosNota);
  return {
    fonte: "ocr",
    itens,
    totalProdutosNota,
    ...resultadoValidacao,
    avisosGerais: [
      "OCR serve apenas para pre-preenchimento: exige conferencia humana antes do recebimento.",
      ...resultadoValidacao.avisosGerais,
    ],
  };
}