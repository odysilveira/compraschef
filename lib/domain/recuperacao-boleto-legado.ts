import type { Boleto, DB, DocumentoBoleto } from "../types";
import { obterCodigoCanonico, validarBoleto } from "./boletos";

export interface ResultadoRecuperacaoBoletoLegado {
  alterou: boolean;
  motivo:
    | "ja_vinculado_valido"
    | "vinculo_recuperado_documento_existente"
    | "vinculo_recuperado_codigo_legado"
    | "nao_recuperado_sem_codigo"
    | "nao_recuperado_multiplos_documentos"
    | "nao_recuperado_codigo_invalido"
    | "nao_elegivel";
  documentoId?: string;
}

interface OpcoesRecuperacaoBoletoLegado {
  agora?: string;
  responsavelPadrao?: string;
  gerarIdDocumento?: () => string;
}

function limpar(valor?: string): string {
  return (valor ?? "").trim();
}

function codigoCanonicoBancarioValido(valor?: string): string | undefined {
  const texto = limpar(valor);
  if (!texto) return undefined;
  let canonico: string | undefined;
  try {
    canonico = obterCodigoCanonico(texto);
  } catch {
    return undefined;
  }
  if (!canonico) return undefined;
  const validacaoCanonico = validarBoleto(canonico);
  if (!validacaoCanonico.valido || validacaoCanonico.formato !== "codigo_barras_bancario_44") return undefined;
  return validacaoCanonico.codigoCanonico;
}

function codigoCanonicoLegadoNoBoleto(boleto: Boleto): string | undefined {
  const canonicoDaLinha = codigoCanonicoBancarioValido(boleto.linha_digitavel);
  if (canonicoDaLinha) return canonicoDaLinha;

  const candidatoLegado = limpar((boleto as Boleto & { codigo_canonico?: string }).codigo_canonico);
  if (!candidatoLegado) return undefined;
  return codigoCanonicoBancarioValido(candidatoLegado);
}

function mesmoDocumento(a: DocumentoBoleto, b: DocumentoBoleto): boolean {
  return a.id === b.id;
}

function semDuplicadosDocumentos(documentos: DocumentoBoleto[]): DocumentoBoleto[] {
  const unicos: DocumentoBoleto[] = [];
  for (const documento of documentos) {
    if (unicos.some((item) => mesmoDocumento(item, documento))) continue;
    unicos.push(documento);
  }
  return unicos;
}

function numeroParcelaIgual(a?: string, b?: string): boolean {
  return limpar(a) !== "" && limpar(a) === limpar(b);
}

function documentoCompativelPorVinculosLegados(db: DB, boleto: Boleto, documento: DocumentoBoleto): boolean {
  if (documento.boleto_id === boleto.id) return true;

  const legadoParcelaId = limpar((documento as DocumentoBoleto & { parcela_id?: string }).parcela_id);
  if (legadoParcelaId && legadoParcelaId === boleto.id) return true;

  const legadoNumeroParcela = limpar((documento as DocumentoBoleto & { numero_parcela?: string }).numero_parcela);
  if (documento.nota_id === boleto.nota_id && numeroParcelaIgual(legadoNumeroParcela, boleto.numero_parcela)) {
    return true;
  }

  if (documento.nota_id === boleto.nota_id && !documento.boleto_id && boleto.numero_parcela) {
    const boletosMesmaParcela = db.boletos.filter(
      (item) => item.nota_id === boleto.nota_id && numeroParcelaIgual(item.numero_parcela, boleto.numero_parcela)
    );
    if (boletosMesmaParcela.length === 1 && boletosMesmaParcela[0].id === boleto.id) {
      return true;
    }
  }

  return false;
}

function documentoComCodigoValido(documento: DocumentoBoleto): boolean {
  return Boolean(codigoCanonicoBancarioValido(documento.codigo_canonico));
}

function completarMetadadosDocumento(
  documento: DocumentoBoleto,
  boleto: Boleto,
  codigoCanonico: string,
  opcoes: OpcoesRecuperacaoBoletoLegado = {}
): boolean {
  let alterou = false;
  const confirmadoEm = boleto.conferido_em ?? opcoes.agora ?? new Date().toISOString();
  const confirmadoPor = boleto.conferido_por ?? opcoes.responsavelPadrao ?? "usuário local";

  if (!documento.nome_arquivo) {
    documento.nome_arquivo = `recuperado-legado-${boleto.id}.txt`;
    alterou = true;
  }
  if (!documento.tipo_arquivo) {
    documento.tipo_arquivo = "application/pdf";
    alterou = true;
  }
  if (!Number.isFinite(documento.tamanho_bytes)) {
    documento.tamanho_bytes = 0;
    alterou = true;
  }
  if (!documento.hash_sha256) {
    documento.hash_sha256 = `legado-${boleto.id}-${codigoCanonico}`;
    alterou = true;
  }
  if (!documento.codigo_canonico) {
    documento.codigo_canonico = codigoCanonico;
    alterou = true;
  }
  if (!documento.linha_informada && boleto.linha_digitavel) {
    documento.linha_informada = boleto.linha_digitavel;
    alterou = true;
  }
  if (!documento.nota_id) {
    documento.nota_id = boleto.nota_id;
    alterou = true;
  }
  if (!documento.boleto_id) {
    documento.boleto_id = boleto.id;
    alterou = true;
  }
  if (!documento.confirmado_em) {
    documento.confirmado_em = confirmadoEm;
    alterou = true;
  }
  if (!documento.confirmado_por) {
    documento.confirmado_por = confirmadoPor;
    alterou = true;
  }
  if (!documento.criado_em) {
    documento.criado_em = confirmadoEm;
    alterou = true;
  }
  if (!documento.criado_por) {
    documento.criado_por = confirmadoPor;
    alterou = true;
  }

  return alterou;
}

function vincularDocumentoAoBoleto(boleto: Boleto, documento: DocumentoBoleto): boolean {
  if (boleto.documento_boleto_id === documento.id) return false;
  boleto.documento_boleto_id = documento.id;
  return true;
}

function buscarDocumentosCompativeisLegado(db: DB, boleto: Boleto): DocumentoBoleto[] {
  const codigoCanonicoDoBoleto = codigoCanonicoLegadoNoBoleto(boleto);
  const candidatos = db.documentos_boleto.filter((documento) => {
    if (!documentoComCodigoValido(documento)) return false;
    if (documentoCompativelPorVinculosLegados(db, boleto, documento)) return true;

    const codigoDocumento = codigoCanonicoBancarioValido(documento.codigo_canonico);
    return Boolean(codigoCanonicoDoBoleto && codigoDocumento && codigoCanonicoDoBoleto === codigoDocumento);
  });
  return semDuplicadosDocumentos(candidatos);
}

export function recuperarVinculoBoletoLegado(
  db: DB,
  boleto: Boleto,
  opcoes: OpcoesRecuperacaoBoletoLegado = {}
): ResultadoRecuperacaoBoletoLegado {
  if (boleto.status_conferencia !== "conferido") {
    return { alterou: false, motivo: "nao_elegivel" };
  }

  const documentoAtual = boleto.documento_boleto_id
    ? db.documentos_boleto.find((item) => item.id === boleto.documento_boleto_id)
    : undefined;
  const codigoAtual = documentoAtual ? codigoCanonicoBancarioValido(documentoAtual.codigo_canonico) : undefined;
  if (documentoAtual && codigoAtual) {
    return { alterou: false, motivo: "ja_vinculado_valido", documentoId: documentoAtual.id };
  }

  const candidatos = buscarDocumentosCompativeisLegado(db, boleto);
  if (candidatos.length > 1) {
    return { alterou: false, motivo: "nao_recuperado_multiplos_documentos" };
  }

  if (candidatos.length === 1) {
    const documento = candidatos[0];
    const codigoCanonico = codigoCanonicoBancarioValido(documento.codigo_canonico);
    if (!codigoCanonico) {
      return { alterou: false, motivo: "nao_recuperado_codigo_invalido" };
    }
    const alterouMetadados = completarMetadadosDocumento(documento, boleto, codigoCanonico, opcoes);
    const alterouVinculo = vincularDocumentoAoBoleto(boleto, documento);
    return {
      alterou: alterouMetadados || alterouVinculo,
      motivo: "vinculo_recuperado_documento_existente",
      documentoId: documento.id,
    };
  }

  const codigoLegado = codigoCanonicoLegadoNoBoleto(boleto);
  if (!codigoLegado) {
    const candidatoInvalido = limpar((boleto as Boleto & { codigo_canonico?: string }).codigo_canonico) || limpar(boleto.linha_digitavel);
    if (candidatoInvalido) {
      return { alterou: false, motivo: "nao_recuperado_codigo_invalido" };
    }
    return { alterou: false, motivo: "nao_recuperado_sem_codigo" };
  }

  const docsMesmoCodigo = db.documentos_boleto.filter(
    (documento) => codigoCanonicoBancarioValido(documento.codigo_canonico) === codigoLegado
  );
  if (docsMesmoCodigo.length > 1) {
    return { alterou: false, motivo: "nao_recuperado_multiplos_documentos" };
  }

  if (docsMesmoCodigo.length === 1) {
    const documento = docsMesmoCodigo[0];
    const alterouMetadados = completarMetadadosDocumento(documento, boleto, codigoLegado, opcoes);
    const alterouVinculo = vincularDocumentoAoBoleto(boleto, documento);
    return {
      alterou: alterouMetadados || alterouVinculo,
      motivo: "vinculo_recuperado_codigo_legado",
      documentoId: documento.id,
    };
  }

  const criadoEm = boleto.conferido_em ?? opcoes.agora ?? new Date().toISOString();
  const criadoPor = boleto.conferido_por ?? opcoes.responsavelPadrao ?? "migração legado";
  const documentoNovo: DocumentoBoleto = {
    id: opcoes.gerarIdDocumento ? opcoes.gerarIdDocumento() : `docbol-leg-${Date.now().toString(36)}`,
    nota_id: boleto.nota_id,
    boleto_id: boleto.id,
    nome_arquivo: `recuperado-legado-${boleto.id}.txt`,
    tipo_arquivo: "application/pdf",
    tamanho_bytes: 0,
    hash_sha256: `legado-${boleto.id}-${codigoLegado}`,
    linha_informada: boleto.linha_digitavel,
    codigo_canonico: codigoLegado,
    formato_boleto: obterCodigoCanonico(codigoLegado) ? "codigo_barras_bancario_44" : undefined,
    resultado_confronto: "parcial",
    criterios_conferidos: ["codigo_recuperado_de_registro_legado"],
    confirmado_em: criadoEm,
    confirmado_por: criadoPor,
    justificativa_confirmacao: "Código recuperado a partir de registro legado do boleto.",
    criado_em: criadoEm,
    criado_por: criadoPor,
  };
  db.documentos_boleto.push(documentoNovo);
  boleto.documento_boleto_id = documentoNovo.id;
  return {
    alterou: true,
    motivo: "vinculo_recuperado_codigo_legado",
    documentoId: documentoNovo.id,
  };
}

export function recuperarVinculosLegadosBoletos(
  db: DB,
  opcoes: OpcoesRecuperacaoBoletoLegado = {}
): { alteracoes: number } {
  let alteracoes = 0;
  for (const boleto of db.boletos) {
    const resultado = recuperarVinculoBoletoLegado(db, boleto, opcoes);
    if (resultado.alterou) alteracoes += 1;
  }
  return { alteracoes };
}
