import type { DB, DocumentoBoleto, FormatoBoleto } from "../types";
import { obterCodigoCanonico, validarBoleto } from "./boletos";

const LIMITE_TAMANHO_BYTES = 10 * 1024 * 1024;

const ASSINATURA_PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type TipoArquivoDocumentoBoleto = "application/pdf" | "image/png" | "image/jpeg";

export interface ArquivoBoletoEntrada {
  nomeArquivo: string;
  tipoArquivo: string;
  tamanhoBytes: number;
  conteudo: ArrayBuffer;
}

export interface ResultadoValidacaoArquivoBoleto {
  valido: boolean;
  tipoDetectado?: TipoArquivoDocumentoBoleto;
  erros: string[];
}

export interface RegistroDocumentoBoletoEntrada {
  contaPagarId?: string;
  arquivo: ArquivoBoletoEntrada;
  linhaInformada?: string;
}

export interface RegistroDocumentoBoletoResultado {
  sucesso: boolean;
  documento?: DocumentoBoleto;
  erros: string[];
  duplicadoPorHash?: DocumentoBoleto;
  duplicadoPorCodigoCanonico?: DocumentoBoleto;
}

export interface ReceberBoletoContaResultado {
  sucesso: boolean;
  documento?: DocumentoBoleto;
  erros: string[];
  mensagem?: string;
}

export interface RegistroDocumentoBoletoOpcoes {
  agora?: string;
  criadoPor?: string;
  gerarId?: () => string;
}

function extrairExtensao(nomeArquivo: string): string {
  const nome = nomeArquivo.trim().toLowerCase();
  const indice = nome.lastIndexOf(".");
  return indice >= 0 ? nome.slice(indice + 1) : "";
}

function bytesIniciais(conteudo: ArrayBuffer, quantidade: number): number[] {
  return Array.from(new Uint8Array(conteudo).slice(0, quantidade));
}

function comecaCom(bytes: number[], assinatura: number[]): boolean {
  return assinatura.every((valor, indice) => bytes[indice] === valor);
}

function assinaturaCompativel(tipo: TipoArquivoDocumentoBoleto, conteudo: ArrayBuffer): boolean {
  const bytes = new Uint8Array(conteudo);
  if (tipo === "application/pdf") {
    return comecaCom(Array.from(bytes.slice(0, ASSINATURA_PDF.length)), ASSINATURA_PDF);
  }
  if (tipo === "image/png") {
    return comecaCom(Array.from(bytes.slice(0, ASSINATURA_PNG.length)), ASSINATURA_PNG);
  }
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function tipoEsperadoPorExtensao(extensao: string): TipoArquivoDocumentoBoleto | undefined {
  if (extensao === "pdf") return "application/pdf";
  if (extensao === "png") return "image/png";
  if (extensao === "jpg" || extensao === "jpeg") return "image/jpeg";
  return undefined;
}

function tipoMimeNormalizado(tipoArquivo: string): TipoArquivoDocumentoBoleto | undefined {
  const tipo = tipoArquivo.trim().toLowerCase();
  if (tipo === "application/pdf") return "application/pdf";
  if (tipo === "image/png") return "image/png";
  if (tipo === "image/jpeg" || tipo === "image/jpg") return "image/jpeg";
  return undefined;
}

function formatoRegistravel(formato: FormatoBoleto): Exclude<FormatoBoleto, "invalido"> | undefined {
  return formato === "invalido" ? undefined : formato;
}

export function validarArquivoDocumentoBoleto(arquivo: ArquivoBoletoEntrada): ResultadoValidacaoArquivoBoleto {
  const erros: string[] = [];
  const extensao = extrairExtensao(arquivo.nomeArquivo);
  const tipoPorExtensao = tipoEsperadoPorExtensao(extensao);
  const tipoPorMime = tipoMimeNormalizado(arquivo.tipoArquivo);

  if (arquivo.tamanhoBytes <= 0 || arquivo.conteudo.byteLength <= 0) {
    erros.push("Arquivo de boleto está vazio.");
  }
  if (arquivo.tamanhoBytes > LIMITE_TAMANHO_BYTES) {
    erros.push("Arquivo de boleto excede o limite de 10 MB.");
  }
  if (!tipoPorExtensao) {
    erros.push("Extensão de arquivo não permitida para boleto.");
  }
  if (!tipoPorMime) {
    erros.push("MIME type de arquivo não permitido para boleto.");
  }

  let tipoDetectado: TipoArquivoDocumentoBoleto | undefined;
  if (tipoPorExtensao && tipoPorMime && tipoPorExtensao === tipoPorMime) {
    tipoDetectado = tipoPorMime;
  } else if (tipoPorExtensao && tipoPorMime && tipoPorExtensao !== tipoPorMime) {
    erros.push("Extensão e MIME type do arquivo de boleto são incompatíveis.");
  }

  if (tipoDetectado && !assinaturaCompativel(tipoDetectado, arquivo.conteudo)) {
    erros.push("Assinatura inicial do arquivo é incompatível com o tipo informado.");
  }

  return {
    valido: erros.length === 0,
    tipoDetectado,
    erros,
  };
}

export async function calcularHashSHA256(conteudo: ArrayBuffer): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.subtle) {
    const hash = await cryptoApi.subtle.digest("SHA-256", conteudo);
    return Array.from(new Uint8Array(hash))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  throw new Error("Web Crypto API não está disponível.");
}

export async function registrarDocumentoBoleto(
  db: DB,
  entrada: RegistroDocumentoBoletoEntrada,
  opcoes: RegistroDocumentoBoletoOpcoes = {}
): Promise<RegistroDocumentoBoletoResultado> {
  const validacaoArquivo = validarArquivoDocumentoBoleto(entrada.arquivo);
  if (!validacaoArquivo.valido || !validacaoArquivo.tipoDetectado) {
    return {
      sucesso: false,
      erros: validacaoArquivo.erros,
    };
  }

  let codigoCanonico: string | undefined;
  let formatoBoleto: Exclude<FormatoBoleto, "invalido"> | undefined;
  if (entrada.linhaInformada) {
    const validacaoLinha = validarBoleto(entrada.linhaInformada);
    if (!validacaoLinha.valido) {
      return {
        sucesso: false,
        erros: validacaoLinha.erros,
      };
    }
    codigoCanonico = validacaoLinha.codigoCanonico;
    formatoBoleto = formatoRegistravel(validacaoLinha.formato);
  }

  const hashSha256 = await calcularHashSHA256(entrada.arquivo.conteudo);
  const existentePorHash = db.documentos_boleto.find((documento) => documento.hash_sha256 === hashSha256);
  if (existentePorHash) {
    return {
      sucesso: false,
      erros: ["Documento de boleto já registrado com o mesmo hash SHA-256."],
      duplicadoPorHash: existentePorHash,
    };
  }

  if (codigoCanonico) {
    const existentePorCodigoCanonico = db.documentos_boleto.find(
      (documento) => documento.codigo_canonico === codigoCanonico
    );
    if (existentePorCodigoCanonico) {
      return {
        sucesso: false,
        erros: ["Documento de boleto já registrado com o mesmo código canônico."],
        duplicadoPorCodigoCanonico: existentePorCodigoCanonico,
      };
    }
  }

  const documento: DocumentoBoleto = {
    id: opcoes.gerarId ? opcoes.gerarId() : `docbol-${Date.now().toString(36)}`,
    conta_pagar_id: entrada.contaPagarId,
    nome_arquivo: entrada.arquivo.nomeArquivo,
    tipo_arquivo: validacaoArquivo.tipoDetectado,
    tamanho_bytes: entrada.arquivo.tamanhoBytes,
    hash_sha256: hashSha256,
    linha_informada: entrada.linhaInformada,
    codigo_canonico: codigoCanonico,
    formato_boleto: formatoBoleto,
    criado_em: opcoes.agora ?? new Date().toISOString(),
    criado_por: opcoes.criadoPor ?? "usuário local",
  };

  db.documentos_boleto.push(documento);
  return {
    sucesso: true,
    documento,
    erros: [],
  };
}

export async function receberBoletoContaPagar(
  db: DB,
  entrada: RegistroDocumentoBoletoEntrada & { contaPagarId: string },
  opcoes: RegistroDocumentoBoletoOpcoes & { gerarIdHistorico?: () => string } = {}
): Promise<ReceberBoletoContaResultado> {
  const conta = db.contas_pagar.find((item) => item.id === entrada.contaPagarId);
  if (!conta) {
    return {
      sucesso: false,
      erros: ["Conta a pagar não encontrada."],
    };
  }

  const statusAnterior = conta.status;
  const resultadoDocumento = await registrarDocumentoBoleto(
    db,
    {
      contaPagarId: entrada.contaPagarId,
      arquivo: entrada.arquivo,
      linhaInformada: entrada.linhaInformada,
    },
    opcoes
  );

  if (!resultadoDocumento.sucesso || !resultadoDocumento.documento) {
    return {
      sucesso: false,
      erros: resultadoDocumento.erros,
    };
  }

  const responsavel = opcoes.criadoPor ?? "usuário local";
  const agora = opcoes.agora ?? new Date().toISOString();
  conta.status = "boleto_recebido";
  conta.atualizado_em = agora;
  db.conta_pagar_historico.push({
    id: opcoes.gerarIdHistorico ? opcoes.gerarIdHistorico() : `cph-${Date.now().toString(36)}`,
    conta_pagar_id: conta.id,
    acao: "documento_boleto_registrado",
    status_anterior: statusAnterior,
    status_novo: "boleto_recebido",
    data: agora,
    responsavel,
    observacao: "Boleto recebido e aguardando conferência.",
  });

  return {
    sucesso: true,
    documento: resultadoDocumento.documento,
    erros: [],
    mensagem: "Boleto recebido e aguardando conferência.",
  };
}

export { LIMITE_TAMANHO_BYTES, bytesIniciais, extrairExtensao };