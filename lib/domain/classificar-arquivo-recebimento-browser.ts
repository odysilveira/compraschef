/** Classificação de arquivos no navegador (Downloads do e-mail → triagem). */

import {
  classificarArquivoRecebimento,
  type ResultadoClassificacaoArquivo,
  type TipoArquivoRecebimento,
} from "./classificar-arquivo-recebimento";
import {
  contarPaginasPdf,
  ocrImagemTextoCompleto,
  renderizarPaginaPdfParaCanvas,
} from "./danfe-captura-browser";
import { extrairTextoPdfBrowser } from "./folha-recibo-pdf-browser";
import { identificarCodigoBoletoNoArquivoLocal } from "./identificacao-boleto-browser";

const MAX_PAGINAS_OCR = 3;

export interface ItemLoteClassificado {
  id: string;
  arquivo: File;
  classificacao: ResultadoClassificacaoArquivo;
  /** Tipo efetivo na triagem (pode ser sobrescrito pelo usuário). */
  tipoEscolhido: TipoArquivoRecebimento;
  erroLeitura?: string;
}

function ehPdf(arquivo: File): boolean {
  const nome = arquivo.name.toLowerCase();
  return arquivo.type === "application/pdf" || nome.endsWith(".pdf");
}

function ehXml(arquivo: File): boolean {
  const nome = arquivo.name.toLowerCase();
  const mime = arquivo.type.toLowerCase();
  return (
    nome.endsWith(".xml") ||
    mime.includes("xml") ||
    (mime === "text/plain" && nome.includes("nfe"))
  );
}

function ehImagem(arquivo: File): boolean {
  const nome = arquivo.name.toLowerCase();
  return arquivo.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(nome);
}

async function ocrPdfPaginas(buffer: ArrayBuffer, maxPaginas = MAX_PAGINAS_OCR): Promise<string> {
  const total = Math.min(Math.max(1, await contarPaginasPdf(buffer)), maxPaginas);
  const blocos: string[] = [];
  for (let pagina = 1; pagina <= total; pagina += 1) {
    try {
      const canvas = await renderizarPaginaPdfParaCanvas(buffer, pagina, 2.5);
      const texto = await ocrImagemTextoCompleto(canvas);
      if (texto.trim()) blocos.push(texto.trim());
    } catch {
      // tenta próxima página
    }
  }
  return blocos.join("\n\n");
}

/**
 * Extrai texto de PDF (camada de texto → OCR multi-página se vazio/fraco) para classificação.
 */
export async function extrairTextoParaClassificacao(
  arquivo: File
): Promise<{ texto: string; origem: "texto" | "ocr" | "vazio"; erro?: string }> {
  if (ehXml(arquivo) || arquivo.type.startsWith("text/")) {
    try {
      return { texto: await arquivo.text(), origem: "texto" };
    } catch (erro) {
      return {
        texto: "",
        origem: "vazio",
        erro: erro instanceof Error ? erro.message : "Falha ao ler o arquivo.",
      };
    }
  }

  if (ehPdf(arquivo)) {
    const buffer = await arquivo.arrayBuffer();
    let texto = "";
    try {
      texto = await extrairTextoPdfBrowser(buffer);
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : "Falha ao ler o PDF.";
      try {
        const ocr = await ocrPdfPaginas(buffer);
        if (ocr.trim()) return { texto: ocr, origem: "ocr" };
        return { texto: "", origem: "vazio", erro: msg };
      } catch (erroOcr) {
        return {
          texto: "",
          origem: "vazio",
          erro: erroOcr instanceof Error ? erroOcr.message : msg,
        };
      }
    }

    const preliminar = classificarArquivoRecebimento({
      nomeArquivo: arquivo.name,
      mimeType: arquivo.type,
      texto,
    });

    if (preliminar.tipo !== "desconhecido" && preliminar.confianca !== "baixa" && texto.trim().length >= 40) {
      return { texto, origem: "texto" };
    }

    try {
      const ocr = await ocrPdfPaginas(buffer);
      const melhor = ocr.trim().length > texto.trim().length ? ocr : texto;
      if (!melhor.trim()) return { texto: "", origem: "vazio" };
      return {
        texto: melhor,
        origem: ocr.trim().length > texto.trim().length ? "ocr" : "texto",
      };
    } catch {
      return { texto, origem: texto.trim() ? "texto" : "vazio" };
    }
  }

  if (ehImagem(arquivo)) {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result ?? ""));
        leitor.onerror = () => reject(new Error("Não foi possível ler a imagem."));
        leitor.readAsDataURL(arquivo);
      });
      const ocr = await ocrImagemTextoCompleto(dataUrl);
      return { texto: ocr, origem: ocr.trim() ? "ocr" : "vazio" };
    } catch (erro) {
      return {
        texto: "",
        origem: "vazio",
        erro: erro instanceof Error ? erro.message : "Falha no OCR da imagem.",
      };
    }
  }

  return { texto: "", origem: "vazio" };
}

function montarItemClassificado(
  arquivo: File,
  indice: number,
  texto: string,
  origem: "texto" | "ocr" | "vazio",
  erro?: string
): ItemLoteClassificado {
  const classificacao = classificarArquivoRecebimento({
    nomeArquivo: arquivo.name,
    mimeType: arquivo.type,
    texto,
  });

  if (origem === "ocr" && classificacao.tipo !== "desconhecido") {
    classificacao.detalhe = classificacao.detalhe
      ? `${classificacao.detalhe} · via OCR`
      : "Identificado via OCR do PDF/imagem.";
    classificacao.confianca =
      classificacao.confianca === "alta" ? "media" : classificacao.confianca;
  }

  if (erro && classificacao.tipo === "desconhecido") {
    classificacao.detalhe = erro;
  } else if (origem === "vazio" && ehPdf(arquivo) && classificacao.tipo === "desconhecido") {
    classificacao.detalhe =
      classificacao.detalhe ??
      "PDF sem texto legível — use Ver arquivo ou Reconhecer (OCR) de novo.";
  }

  return {
    id: `lote-${indice}-${arquivo.name}-${arquivo.size}-${arquivo.lastModified}`,
    arquivo,
    classificacao,
    tipoEscolhido: classificacao.tipo,
    erroLeitura: erro,
  };
}

async function tentarBarcodeComoBoleto(
  arquivo: File,
  item: ItemLoteClassificado
): Promise<ItemLoteClassificado> {
  if (!ehPdf(arquivo) && !ehImagem(arquivo)) return item;
  if (item.classificacao.tipo === "pdf_boleto" && item.classificacao.confianca === "alta") {
    return item;
  }
  if (
    item.classificacao.tipo !== "desconhecido" &&
    item.classificacao.tipo !== "imagem" &&
    item.classificacao.confianca !== "baixa"
  ) {
    return item;
  }

  try {
    const resultado = await identificarCodigoBoletoNoArquivoLocal(arquivo, () => false);
    const valido = resultado.validos[0];
    if (!valido) return item;

    const classificacao: ResultadoClassificacaoArquivo = {
      tipo: "pdf_boleto",
      confianca: "alta",
      rotulo: "Boleto",
      detalhe: `Código de barras/linha detectado (${valido.formato.replace(/_/g, " ")}).`,
      sinais: {
        pareceXmlNfe: false,
        temBoletoValido: true,
        temChaveDanfe: item.classificacao.sinais.temChaveDanfe,
        pareceNfse: false,
      },
      resumo: {
        ...item.classificacao.resumo,
        numeroBoleto: valido.valorNormalizado,
      },
    };

    return {
      ...item,
      classificacao,
      tipoEscolhido: "pdf_boleto",
    };
  } catch {
    return item;
  }
}

/**
 * Lê e classifica vários arquivos em sequência (evita saturar o worker PDF/OCR).
 * PDFs sem texto passam por OCR (até 3 páginas) e, se ainda fraco, por código de barras.
 */
export async function classificarArquivosRecebimentoBrowser(
  arquivos: File[],
  opcoes?: {
    onProgresso?: (feito: number, total: number, nome: string) => void;
  }
): Promise<ItemLoteClassificado[]> {
  const total = arquivos.length;
  const itens: ItemLoteClassificado[] = [];

  for (let i = 0; i < arquivos.length; i += 1) {
    const arquivo = arquivos[i];
    opcoes?.onProgresso?.(i, total, arquivo.name);

    const { texto, origem, erro } = await extrairTextoParaClassificacao(arquivo);
    let item = montarItemClassificado(arquivo, i, texto, origem, erro);
    item = await tentarBarcodeComoBoleto(arquivo, item);
    itens.push(item);
  }

  opcoes?.onProgresso?.(total, total, "");
  return itens;
}

/** Reclassifica um único arquivo já na fila (OCR/texto de novo, sem rebaixar). */
export async function reclassificarArquivoRecebimentoBrowser(
  arquivo: File
): Promise<ItemLoteClassificado> {
  const { texto, origem, erro } = await extrairTextoParaClassificacao(arquivo);
  let item = montarItemClassificado(arquivo, Date.now(), texto, origem, erro);
  item = await tentarBarcodeComoBoleto(arquivo, item);
  return item;
}
