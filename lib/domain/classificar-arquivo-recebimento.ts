import { identificarNotaPorTexto } from "./danfe-identificacao";
import { identificarBoletosValidosNoTexto } from "./identificacao-boleto";
import { chaveNfseValida, extrairDadosNfseDoTexto } from "./nfse";

/** Tipos que a triagem de lote reconhece (MVP e-mail → Downloads). */
export type TipoArquivoRecebimento =
  | "xml_nfe"
  | "pdf_boleto"
  | "pdf_danfe"
  | "pdf_nfse"
  | "imagem"
  | "desconhecido";

export type ConfiancaClassificacao = "alta" | "media" | "baixa";

export interface EntradaClassificacaoArquivo {
  nomeArquivo: string;
  mimeType?: string;
  /** Conteúdo textual: XML lido ou texto extraído do PDF. */
  texto?: string;
}

export interface ResultadoClassificacaoArquivo {
  tipo: TipoArquivoRecebimento;
  confianca: ConfiancaClassificacao;
  rotulo: string;
  detalhe?: string;
  /** Sinais detectados (para a UI / override). */
  sinais: {
    pareceXmlNfe: boolean;
    temBoletoValido: boolean;
    temChaveDanfe: boolean;
    pareceNfse: boolean;
  };
  /** Resumo útil na triagem. */
  resumo?: {
    chaveNfe?: string;
    chaveNfse?: string;
    numeroBoleto?: string;
    fornecedorHint?: string;
  };
}

const ROTULOS: Record<TipoArquivoRecebimento, string> = {
  xml_nfe: "XML NF-e",
  pdf_boleto: "Boleto",
  pdf_danfe: "DANFE (PDF)",
  pdf_nfse: "NFS-e (serviço)",
  imagem: "Imagem",
  desconhecido: "Revisar",
};

function extensao(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i >= 0 ? nome.slice(i + 1).toLowerCase() : "";
}

function mimeBase(mime?: string): string {
  return (mime ?? "").split(";")[0].trim().toLowerCase();
}

export function pareceXmlNfe(texto: string): boolean {
  const t = texto.trim();
  if (!t) return false;
  if (!t.includes("<") || !/nfe|infNFe|nfeProc|NFe/i.test(t)) return false;
  return /<(?:\w+:)?(?:nfeProc|NFe|infNFe)\b/i.test(t) || /Id\s*=\s*["']NFe\d{44}/i.test(t);
}

export function pareceNfseNoTexto(texto: string): boolean {
  const t = texto.replace(/\u00a0/g, " ");
  if (!t.trim()) return false;
  if (/NFS-?e|Nota\s+Fiscal\s+de\s+Servi[cç]os/i.test(t)) return true;
  const dados = extrairDadosNfseDoTexto(t);
  return Boolean(dados.chave_nfse && chaveNfseValida(dados.chave_nfse));
}

/**
 * Classifica um arquivo já “lido” (nome + texto opcional).
 * Ordem: XML → NFS-e → boleto → DANFE → imagem por mime → desconhecido.
 * Não grava nada — só sugere tipo para a triagem.
 */
export function classificarArquivoRecebimento(
  entrada: EntradaClassificacaoArquivo
): ResultadoClassificacaoArquivo {
  const nome = entrada.nomeArquivo || "arquivo";
  const ext = extensao(nome);
  const mime = mimeBase(entrada.mimeType);
  const texto = entrada.texto ?? "";

  const xml = pareceXmlNfe(texto) || (ext === "xml" && /nfe|infNFe|nfeProc/i.test(texto));
  const nfse = pareceNfseNoTexto(texto);
  const boletos = identificarBoletosValidosNoTexto(texto);
  const temBoleto = boletos.validos.length > 0;
  const danfe = identificarNotaPorTexto(texto);
  const temDanfe = Boolean(danfe?.chave);
  const dadosNfse = nfse ? extrairDadosNfseDoTexto(texto) : null;

  const sinais = {
    pareceXmlNfe: xml,
    temBoletoValido: temBoleto,
    temChaveDanfe: temDanfe,
    pareceNfse: nfse,
  };

  const resumo = {
    chaveNfe: danfe?.chave,
    chaveNfse: dadosNfse?.chave_nfse,
    numeroBoleto: boletos.validos[0]?.valorNormalizado,
    fornecedorHint: dadosNfse?.razao_social_prestador,
  };

  if (xml || (ext === "xml" && texto.trim().startsWith("<"))) {
    return {
      tipo: "xml_nfe",
      confianca: xml ? "alta" : "media",
      rotulo: ROTULOS.xml_nfe,
      detalhe: xml ? "Conteúdo de NF-e detectado." : "Extensão .xml — confira se é NF-e.",
      sinais,
      resumo,
    };
  }

  // PDF / texto: NFS-e antes de boleto (NFS-e às vezes traz linha, mas o documento é a nota)
  if (nfse && !xml) {
    const confianca: ConfiancaClassificacao =
      dadosNfse?.chave_nfse && chaveNfseValida(dadosNfse.chave_nfse) ? "alta" : "media";
    return {
      tipo: "pdf_nfse",
      confianca,
      rotulo: ROTULOS.pdf_nfse,
      detalhe: dadosNfse?.chave_nfse
        ? `Chave ${dadosNfse.chave_nfse.slice(0, 20)}…`
        : "Texto de nota de serviço.",
      sinais,
      resumo,
    };
  }

  if (temBoleto) {
    return {
      tipo: "pdf_boleto",
      confianca: "alta",
      rotulo: ROTULOS.pdf_boleto,
      detalhe: `Linha/código ${boletos.validos[0].formato.replace(/_/g, " ")}.`,
      sinais,
      resumo,
    };
  }

  if (temDanfe) {
    return {
      tipo: "pdf_danfe",
      confianca: "alta",
      rotulo: ROTULOS.pdf_danfe,
      detalhe: `NF-e nº ${danfe!.numero} · chave …${danfe!.chave.slice(-8)}`,
      sinais,
      resumo,
    };
  }

  const ehImagem =
    mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic"].includes(ext);
  if (ehImagem) {
    return {
      tipo: "imagem",
      confianca: "media",
      rotulo: ROTULOS.imagem,
      detalhe: "Foto — use OCR no fluxo DANFE ou revise à mão.",
      sinais,
      resumo,
    };
  }

  if (ext === "pdf" || mime === "application/pdf") {
    return {
      tipo: "desconhecido",
      confianca: "baixa",
      rotulo: ROTULOS.desconhecido,
      detalhe: texto.trim()
        ? "PDF sem sinais claros de NFS-e, boleto ou DANFE."
        : "PDF sem texto selecionável — pode ser só imagem (scan).",
      sinais,
      resumo,
    };
  }

  if (ext === "xml") {
    return {
      tipo: "xml_nfe",
      confianca: "baixa",
      rotulo: ROTULOS.xml_nfe,
      detalhe: "Arquivo .xml sem estrutura NF-e óbvia — revise.",
      sinais,
      resumo,
    };
  }

  return {
    tipo: "desconhecido",
    confianca: "baixa",
    rotulo: ROTULOS.desconhecido,
    detalhe: "Tipo não identificado — escolha na triagem.",
    sinais,
    resumo,
  };
}

export function rotuloTipoArquivoRecebimento(tipo: TipoArquivoRecebimento): string {
  return ROTULOS[tipo];
}

export function contarPorTipo(
  itens: { tipo: TipoArquivoRecebimento }[]
): Record<TipoArquivoRecebimento, number> {
  const contagem: Record<TipoArquivoRecebimento, number> = {
    xml_nfe: 0,
    pdf_boleto: 0,
    pdf_danfe: 0,
    pdf_nfse: 0,
    imagem: 0,
    desconhecido: 0,
  };
  for (const item of itens) {
    contagem[item.tipo] += 1;
  }
  return contagem;
}
