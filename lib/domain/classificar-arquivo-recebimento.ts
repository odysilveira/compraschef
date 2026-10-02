import { identificarNotaPorTexto, extrairChavesRotuladasDanfe } from "./danfe-identificacao";
import { validarChaveAcessoNfe } from "./boleto-nfe-confronto";
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

const EXT_OFFICE = new Set([
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "rtf",
  "csv",
]);

const MIME_OFFICE = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/rtf",
  "text/csv",
];

function extensao(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i >= 0 ? nome.slice(i + 1).toLowerCase() : "";
}

function mimeBase(mime?: string): string {
  return (mime ?? "").split(";")[0].trim().toLowerCase();
}

/** Word/Excel/etc. — nunca tratados como NF-e/boleto automaticamente. */
export function pareceArquivoOffice(nomeArquivo: string, mimeType?: string): boolean {
  const ext = extensao(nomeArquivo);
  if (EXT_OFFICE.has(ext)) return true;
  const mime = mimeBase(mimeType);
  return MIME_OFFICE.some((prefix) => mime.startsWith(prefix) || mime === prefix);
}

/** CNH, RG, comprovante pessoal — prioriza OneDrive pessoal na inbox. */
export function pareceDocumentoPessoal(nomeArquivo: string, texto?: string): boolean {
  const nome = (nomeArquivo || "").toLowerCase();
  const t = (texto ?? "").toLowerCase();
  const noNome =
    /\b(cnh|rg\b|cpf|identidade|habilita[cç][aã]o|passaporte|titulo[_\s-]?eleitor|comp\w*resid)/i.test(
      nome
    ) || /cnh-?e/.test(nome);
  if (noNome) return true;
  if (!t.trim()) return false;
  return (
    /\b(carteira\s+nacional\s+de\s+habilita|cnh-?e|departamento\s+estadual\s+de\s+tr[aâ]nsito|detran)\b/i.test(
      t
    ) ||
    (/\bregistro\s+geral\b/i.test(t) &&
      /\bcpf\b/i.test(t) &&
      !/\bdanfe|nf-?e|chave\s*de\s*acesso\b/i.test(t))
  );
}

/** Chave 44 dígitos no XML (Id=NFe… ou chNFe). */
export function extrairChaveNfeDoXml(texto: string): string | undefined {
  const t = texto || "";
  const idMatch = t.match(/Id\s*=\s*["']NFe(\d{44})["']/i);
  if (idMatch?.[1] && validarChaveAcessoNfe(idMatch[1])) return idMatch[1];
  const chMatch = t.match(/<(?:\w+:)?chNFe>\s*(\d{44})\s*<\/(?:\w+:)?chNFe>/i);
  if (chMatch?.[1] && validarChaveAcessoNfe(chMatch[1])) return chMatch[1];
  return undefined;
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

/** Contexto fiscal real — evita CNH/OCR virar DANFE por 44 dígitos “válidos” ao acaso. */
export function pareceContextoDanfe(texto: string): boolean {
  const t = texto.replace(/\u00a0/g, " ");
  if (!t.trim()) return false;
  return /DANFE|documento\s+auxiliar\s+da\s+nota\s+fiscal|chave\s*de\s*acesso|nota\s+fiscal\s+eletr[oô]nica|\bNF-?e\b|protNFe|nfeProc|consulta\s+via\s+leitor|emiss[aã]o\s+normal/i.test(
    t
  );
}

/**
 * Só aceita DANFE se houver chave rotulada válida OU (contexto fiscal + chave válida).
 * Janela deslizante pura em OCR solto não basta.
 */
export function identificarDanfeParaClassificacao(texto: string) {
  const bruto = texto ?? "";
  if (!bruto.trim()) return null;

  const rotuladas = extrairChavesRotuladasDanfe(bruto).filter((chave) =>
    validarChaveAcessoNfe(chave)
  );
  if (rotuladas.length > 0) {
    return identificarNotaPorTexto(rotuladas[0]) ?? identificarNotaPorTexto(bruto);
  }

  if (!pareceContextoDanfe(bruto)) return null;
  return identificarNotaPorTexto(bruto);
}

/** Dica pelo nome do arquivo — usada quando o texto ainda é fraco. */
export function dicaTipoPeloNomeArquivo(
  nomeArquivo: string
): "pdf_boleto" | "pdf_danfe" | "pdf_nfse" | null {
  const n = (nomeArquivo || "").toLowerCase();
  if (!n) return null;
  if (/\b(boleto|linha[\s_-]?digit|codigo[\s_-]?barra)/i.test(n)) return "pdf_boleto";
  if (/\b(nfse|nfs-e|nota[\s_-]?servi)/i.test(n)) return "pdf_nfse";
  if (/\b(danfe|nfe|nf-e|nota[\s_-]?fiscal|xml)/i.test(n) && !/\bboleto\b/i.test(n)) return "pdf_danfe";
  return null;
}

function ehPdfOuImagem(ext: string, mime: string): boolean {
  if (ext === "pdf" || mime === "application/pdf") return true;
  return mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic"].includes(ext);
}

/**
 * Classifica um arquivo já “lido” (nome + texto opcional).
 * Ordem: office/pessoal → XML → NFS-e → boleto → DANFE (endurecido) → imagem → desconhecido.
 * Não grava nada — só sugere tipo para a triagem.
 */
export function classificarArquivoRecebimento(
  entrada: EntradaClassificacaoArquivo
): ResultadoClassificacaoArquivo {
  const nome = entrada.nomeArquivo || "arquivo";
  const ext = extensao(nome);
  const mime = mimeBase(entrada.mimeType);
  const texto = entrada.texto ?? "";

  const sinaisBase = {
    pareceXmlNfe: false,
    temBoletoValido: false,
    temChaveDanfe: false,
    pareceNfse: false,
  };

  // Office e documentos pessoais: nunca forçar fluxo de compra.
  if (pareceArquivoOffice(nome, mime)) {
    return {
      tipo: "desconhecido",
      confianca: "alta",
      rotulo: ROTULOS.desconhecido,
      detalhe: "Documento de escritório (Word/Excel/etc.) — use OneDrive, não o fluxo de compra.",
      sinais: sinaisBase,
    };
  }

  if (pareceDocumentoPessoal(nome, texto)) {
    return {
      tipo: "desconhecido",
      confianca: "alta",
      rotulo: ROTULOS.desconhecido,
      detalhe: "Parece documento pessoal (CNH/RG/etc.) — inbox sugere pasta pessoal.",
      sinais: sinaisBase,
    };
  }

  const xml = pareceXmlNfe(texto) || (ext === "xml" && /nfe|infNFe|nfeProc/i.test(texto));
  const nfse = pareceNfseNoTexto(texto);
  const boletos = identificarBoletosValidosNoTexto(texto);
  const temBoleto = boletos.validos.length > 0;
  const danfe = ehPdfOuImagem(ext, mime) ? identificarDanfeParaClassificacao(texto) : null;
  const temDanfe = Boolean(danfe?.chave);
  const dadosNfse = nfse ? extrairDadosNfseDoTexto(texto) : null;

  const sinais = {
    pareceXmlNfe: xml,
    temBoletoValido: temBoleto,
    temChaveDanfe: temDanfe,
    pareceNfse: nfse,
  };

  const chaveXml = xml || ext === "xml" ? extrairChaveNfeDoXml(texto) : undefined;

  const resumo = {
    chaveNfe: danfe?.chave || chaveXml,
    chaveNfse: dadosNfse?.chave_nfse,
    numeroBoleto: boletos.validos[0]?.valorNormalizado,
    fornecedorHint: dadosNfse?.razao_social_prestador,
  };

  if (xml || (ext === "xml" && texto.trim().startsWith("<"))) {
    return {
      tipo: "xml_nfe",
      confianca: xml ? "alta" : "media",
      rotulo: ROTULOS.xml_nfe,
      detalhe: chaveXml
        ? `NF-e · chave …${chaveXml.slice(-8)}`
        : xml
          ? "Conteúdo de NF-e detectado."
          : "Extensão .xml — confira se é NF-e.",
      sinais,
      resumo,
    };
  }

  // PDF / texto: NFS-e antes de boleto (NFS-e às vezes traz linha, mas o documento é a nota)
  if (nfse && !xml && ehPdfOuImagem(ext, mime)) {
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

  if (temBoleto && ehPdfOuImagem(ext, mime)) {
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
    const rotulada = extrairChavesRotuladasDanfe(texto).some((c) => validarChaveAcessoNfe(c));
    return {
      tipo: "pdf_danfe",
      confianca: rotulada ? "alta" : "media",
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
      detalhe: "Foto — inbox sugere OneDrive (fotos); no lote use OCR/DANFE se for nota.",
      sinais,
      resumo,
    };
  }

  if (ext === "pdf" || mime === "application/pdf") {
    const dica = dicaTipoPeloNomeArquivo(nome);
    if (dica === "pdf_boleto") {
      return {
        tipo: "pdf_boleto",
        confianca: "baixa",
        rotulo: ROTULOS.pdf_boleto,
        detalhe: "Nome do arquivo sugere boleto — confirme na triagem ou recomece o OCR.",
        sinais,
        resumo,
      };
    }
    if (dica === "pdf_danfe") {
      return {
        tipo: "pdf_danfe",
        confianca: "baixa",
        rotulo: ROTULOS.pdf_danfe,
        detalhe: "Nome do arquivo sugere DANFE/NF-e — confira a chave ao abrir.",
        sinais,
        resumo,
      };
    }
    if (dica === "pdf_nfse") {
      return {
        tipo: "pdf_nfse",
        confianca: "baixa",
        rotulo: ROTULOS.pdf_nfse,
        detalhe: "Nome do arquivo sugere NFS-e.",
        sinais,
        resumo,
      };
    }
    return {
      tipo: "desconhecido",
      confianca: "baixa",
      rotulo: ROTULOS.desconhecido,
      detalhe: texto.trim()
        ? "PDF sem sinais claros de NFS-e, boleto ou DANFE — inbox sugere documentos."
        : "PDF sem texto selecionável — pode ser scan; inbox sugere documentos ou a identificar.",
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
