/** Classificação de arquivos no navegador (Downloads do e-mail → triagem). */

import {
  classificarArquivoRecebimento,
  type ResultadoClassificacaoArquivo,
  type TipoArquivoRecebimento,
} from "./classificar-arquivo-recebimento";
import { extrairTextoPdfBrowser } from "./folha-recibo-pdf-browser";

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
    mime === "text/plain" && nome.includes("nfe")
  );
}

async function lerTextoArquivo(arquivo: File): Promise<{ texto: string; erro?: string }> {
  if (ehXml(arquivo) || arquivo.type.startsWith("text/")) {
    try {
      return { texto: await arquivo.text() };
    } catch (erro) {
      return {
        texto: "",
        erro: erro instanceof Error ? erro.message : "Falha ao ler o arquivo.",
      };
    }
  }

  if (ehPdf(arquivo)) {
    try {
      const buffer = await arquivo.arrayBuffer();
      const texto = await extrairTextoPdfBrowser(buffer);
      return { texto };
    } catch (erro) {
      return {
        texto: "",
        erro: erro instanceof Error ? erro.message : "Falha ao ler o PDF.",
      };
    }
  }

  // Imagens e demais: sem OCR no lote (MVP) — classifica por mime/nome.
  return { texto: "" };
}

/**
 * Lê e classifica vários arquivos em sequência (evita saturar o worker PDF).
 * Não grava no banco — só prepara a fila de triagem.
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

    const { texto, erro } = await lerTextoArquivo(arquivo);
    const classificacao = classificarArquivoRecebimento({
      nomeArquivo: arquivo.name,
      mimeType: arquivo.type,
      texto,
    });

    if (erro && classificacao.tipo === "desconhecido") {
      classificacao.detalhe = erro;
    }

    itens.push({
      id: `lote-${i}-${arquivo.name}-${arquivo.size}-${arquivo.lastModified}`,
      arquivo,
      classificacao,
      tipoEscolhido: classificacao.tipo,
      erroLeitura: erro,
    });
  }

  opcoes?.onProgresso?.(total, total, "");
  return itens;
}
