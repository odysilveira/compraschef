import type { DB, DocumentoBoleto } from "../types";
import {
  calcularHashSHA256,
  registrarDocumentoBoleto,
  validarArquivoDocumentoBoleto,
  type ArquivoBoletoEntrada,
} from "./documentos-boleto";
import {
  confrontarBoletoComNfe,
  type DadosBoletoExtraidos,
  type ResultadoConfrontoBoletoNfe,
} from "./boleto-nfe-confronto";
import { validarBoleto } from "./boletos";

export interface ConfirmarConfrontoBoletoEntrada {
  arquivo: ArquivoBoletoEntrada;
  linhaInformada: string;
  dadosExtraidos: DadosBoletoExtraidos;
  resultadoConfrontoInformado?: ResultadoConfrontoBoletoNfe;
  parcelaSelecionadaId?: string;
  boletoEsperadoId?: string;
  confirmacaoHumana: boolean;
  responsavel?: string;
  justificativaConfirmacao?: string;
}

export interface ConfirmarConfrontoBoletoOpcoes {
  agora?: string;
  gerarIdDocumento?: () => string;
}

export interface ConfirmarConfrontoBoletoResultado {
  sucesso: boolean;
  erros: string[];
  confrontoAtual?: ResultadoConfrontoBoletoNfe;
  documento?: DocumentoBoleto;
}

export interface EventoAnaliseConfrontoBoleto {
  id: string;
  criado_em: string;
  criado_por: string;
  resultado: ResultadoConfrontoBoletoNfe["classificacao"];
  dados: Pick<DadosBoletoExtraidos, "codigo_canonico" | "valor_codificado" | "vencimento_extraido" | "chave_nfe" | "numero_parcela">;
  divergencias: string[];
  avisos: string[];
  justificativa?: string;
}

function compararResultadoConfronto(
  informado: ResultadoConfrontoBoletoNfe,
  atual: ResultadoConfrontoBoletoNfe
): boolean {
  if (informado.classificacao !== atual.classificacao) return false;
  if ((informado.nota_id ?? "") !== (atual.nota_id ?? "")) return false;
  if ((informado.parcela_id ?? "") !== (atual.parcela_id ?? "")) return false;
  return true;
}

function erro(confrontoAtual: ResultadoConfrontoBoletoNfe | undefined, ...mensagens: string[]): ConfirmarConfrontoBoletoResultado {
  return { sucesso: false, erros: mensagens, confrontoAtual };
}

function appendHistoricoRecuperacao(observacaoAtual: string | undefined, mensagem: string): string {
  const base = (observacaoAtual ?? "").trim();
  if (!base) return mensagem;
  if (base.includes(mensagem)) return base;
  return `${base} | ${mensagem}`;
}

function documentoBoletoCompativelComParcela(db: DB, documento: DocumentoBoleto, boletoId: string): boolean {
  if (documento.boleto_id === boletoId) return true;
  const legadoParcelaId = (documento as DocumentoBoleto & { parcela_id?: string }).parcela_id;
  if (legadoParcelaId === boletoId) return true;

  const boleto = db.boletos.find((item) => item.id === boletoId);
  if (!boleto) return false;
  if (documento.nota_id !== boleto.nota_id) return false;

  if (!documento.boleto_id) {
    const boletosDaParcela = db.boletos.filter(
      (item) => item.nota_id === boleto.nota_id && (item.numero_parcela ?? "").trim() === (boleto.numero_parcela ?? "").trim()
    );
    return boletosDaParcela.length === 1 && boletosDaParcela[0].id === boleto.id;
  }

  return false;
}

function deduplicarDocumentos(documentos: DocumentoBoleto[]): DocumentoBoleto[] {
  const ids = new Set<string>();
  const unicos: DocumentoBoleto[] = [];
  for (const documento of documentos) {
    if (ids.has(documento.id)) continue;
    ids.add(documento.id);
    unicos.push(documento);
  }
  return unicos;
}

function garanteColecoes(db: DB): void {
  const banco = db as DB & { documentos_boleto?: unknown; boletos?: unknown; notas_fiscais?: unknown };
  if (!Array.isArray(banco.documentos_boleto)) {
    banco.documentos_boleto = [];
  }
  if (!Array.isArray(banco.boletos)) {
    banco.boletos = [];
  }
  if (!Array.isArray(banco.notas_fiscais)) {
    banco.notas_fiscais = [];
  }
}

function revalidarSelecionadaEntreCandidatos(
  db: DB,
  dadosBase: DadosBoletoExtraidos,
  confrontoAtual: ResultadoConfrontoBoletoNfe,
  parcelaSelecionadaId?: string
): { confrontoRevalidado?: ResultadoConfrontoBoletoNfe; erro?: string; overrideParcial?: boolean } {
  if (parcelaSelecionadaId && confrontoAtual.classificacao !== "multiplas_possibilidades") {
    if (!confrontoAtual.parcela_id || confrontoAtual.parcela_id !== parcelaSelecionadaId) {
      return { erro: "A parcela selecionada não está mais disponível no banco atual." };
    }
  }

  if (confrontoAtual.classificacao !== "multiplas_possibilidades") {
    return { confrontoRevalidado: confrontoAtual };
  }

  if (!parcelaSelecionadaId) {
    return { erro: "Seleção de parcela é obrigatória para múltiplas possibilidades." };
  }

  const candidato = confrontoAtual.candidatos.find((item) => item.boleto_id === parcelaSelecionadaId);
  if (!candidato) {
    return { erro: "A parcela selecionada não pertence à lista atual de candidatos." };
  }

  const nota = db.notas_fiscais.find((item) => item.id === candidato.nota_id);
  const boleto = db.boletos.find((item) => item.id === candidato.boleto_id && item.nota_id === candidato.nota_id);
  if (!nota || !boleto) {
    return { erro: "A parcela selecionada não está mais disponível no banco atual." };
  }

  const dadosRefinados: DadosBoletoExtraidos = {
    ...dadosBase,
    chave_nfe: nota.chave_acesso,
    numero_parcela: boleto.numero_parcela,
    numero_nfe: nota.numero,
  };

  const confrontoRevalidado = confrontarBoletoComNfe(db, dadosRefinados);
  if (confrontoRevalidado.classificacao !== "exata" && confrontoRevalidado.classificacao !== "parcial") {
    return { erro: "A parcela selecionada ficou inválida após revalidação no banco atual." };
  }

  confrontoRevalidado.parcela_id = candidato.boleto_id;
  confrontoRevalidado.nota_id = candidato.nota_id;
  confrontoRevalidado.classificacao = "parcial";
  confrontoRevalidado.exige_confirmacao_humana = true;
  if (!confrontoRevalidado.criterios_coincidentes.includes("selecao_humana_candidato")) {
    confrontoRevalidado.criterios_coincidentes.push("selecao_humana_candidato");
  }

  return { confrontoRevalidado, overrideParcial: true };
}

export async function confirmarConfrontoBoleto(
  db: DB,
  entrada: ConfirmarConfrontoBoletoEntrada,
  opcoes: ConfirmarConfrontoBoletoOpcoes = {}
): Promise<ConfirmarConfrontoBoletoResultado> {
  const responsavel = entrada.responsavel?.trim() || "usuário local";
  const justificativa = entrada.justificativaConfirmacao?.trim();

  if (!entrada.confirmacaoHumana) {
    return erro(undefined, "Confirmação humana explícita é obrigatória.");
  }

  const validacaoLinha = validarBoleto(entrada.linhaInformada);
  if (!validacaoLinha.valido || !validacaoLinha.codigoCanonico) {
    return erro(undefined, "Linha informada do boleto é inválida para confirmação.");
  }

  if (validacaoLinha.codigoCanonico !== entrada.dadosExtraidos.codigo_canonico) {
    return erro(undefined, "Código canônico informado não corresponde à linha validada do boleto.");
  }

  const validacaoArquivo = validarArquivoDocumentoBoleto(entrada.arquivo);
  if (!validacaoArquivo.valido) {
    return erro(undefined, ...validacaoArquivo.erros);
  }

  const hashAtual = await calcularHashSHA256(entrada.arquivo.conteudo);
  const documentosAtuais = Array.isArray((db as DB & { documentos_boleto?: unknown }).documentos_boleto)
    ? db.documentos_boleto
    : [];
  const documentosMesmoHash = documentosAtuais.filter((doc) => doc.hash_sha256 === hashAtual);
  const documentosMesmoCodigo = documentosAtuais.filter((doc) => doc.codigo_canonico === entrada.dadosExtraidos.codigo_canonico);
  const documentosDuplicados = deduplicarDocumentos([...documentosMesmoHash, ...documentosMesmoCodigo]);

  const confrontoBruto = confrontarBoletoComNfe(db, entrada.dadosExtraidos, hashAtual);

  const boletoEsperado = entrada.boletoEsperadoId
    ? db.boletos.find((boleto) => boleto.id === entrada.boletoEsperadoId)
    : undefined;
  if (entrada.boletoEsperadoId && !boletoEsperado) {
    return erro(confrontoBruto, "Boleto alvo da recuperação não está mais disponível.");
  }

  if (entrada.resultadoConfrontoInformado && !compararResultadoConfronto(entrada.resultadoConfrontoInformado, confrontoBruto)) {
    return erro(confrontoBruto, "Resultado de confronto mudou desde a análise anterior. Reanalise antes de confirmar.");
  }

  const parcelaSelecionadaId =
    entrada.parcelaSelecionadaId ??
    (confrontoBruto.classificacao === "multiplas_possibilidades" && boletoEsperado ? boletoEsperado.id : undefined);
  const selecao = revalidarSelecionadaEntreCandidatos(db, entrada.dadosExtraidos, confrontoBruto, parcelaSelecionadaId);
  if (selecao.erro) {
    return erro(confrontoBruto, selecao.erro);
  }
  const confrontoAtual = selecao.confrontoRevalidado ?? confrontoBruto;

  if (boletoEsperado && confrontoAtual.parcela_id && confrontoAtual.parcela_id !== boletoEsperado.id) {
    return erro(confrontoAtual, "O boleto importado aponta para outra obrigação e não pode completar esta recuperação.");
  }

  if (boletoEsperado && documentosDuplicados.length > 0) {
    const documentosCompativeis = documentosDuplicados.filter((documento) =>
      documentoBoletoCompativelComParcela(db, documento, boletoEsperado.id)
    );
    if (documentosCompativeis.length !== 1) {
      return erro(
        confrontoAtual,
        "Reimportação bloqueada: não foi possível validar vínculo único com o documento legado desta obrigação."
      );
    }

    const proximo = structuredClone(db) as DB;
    garanteColecoes(proximo);

    const documentoRecuperado = proximo.documentos_boleto.find((item) => item.id === documentosCompativeis[0].id);
    const boletoRecuperado = proximo.boletos.find((item) => item.id === boletoEsperado.id);
    if (!documentoRecuperado || !boletoRecuperado) {
      return erro(confrontoAtual, "Falha ao recuperar vínculo legado no estado atual do banco.");
    }

    if (boletoRecuperado.documento_boleto_id && boletoRecuperado.documento_boleto_id !== documentoRecuperado.id) {
      return erro(confrontoAtual, "Parcela já está ligada a outro DocumentoBoleto.");
    }

    const confirmadoEm = opcoes.agora ?? new Date().toISOString();
    const codigoCanonico = entrada.dadosExtraidos.codigo_canonico;
    documentoRecuperado.codigo_canonico = documentoRecuperado.codigo_canonico ?? codigoCanonico;
    documentoRecuperado.linha_informada = documentoRecuperado.linha_informada ?? entrada.linhaInformada;
    documentoRecuperado.nota_id = documentoRecuperado.nota_id ?? boletoRecuperado.nota_id;
    documentoRecuperado.boleto_id = documentoRecuperado.boleto_id ?? boletoRecuperado.id;
    documentoRecuperado.confirmado_em = documentoRecuperado.confirmado_em ?? confirmadoEm;
    documentoRecuperado.confirmado_por = documentoRecuperado.confirmado_por ?? responsavel;
    if (!documentoRecuperado.criterios_conferidos?.includes("codigo_recuperado_por_reimportacao")) {
      documentoRecuperado.criterios_conferidos = [
        ...(documentoRecuperado.criterios_conferidos ?? []),
        "codigo_recuperado_por_reimportacao",
      ];
    }
    const historicoRecuperacao = `Código recuperado por reimportação (${responsavel}, ${confirmadoEm.slice(0, 10)})`;
    documentoRecuperado.justificativa_confirmacao = appendHistoricoRecuperacao(
      documentoRecuperado.justificativa_confirmacao,
      historicoRecuperacao
    );

    boletoRecuperado.documento_boleto_id = documentoRecuperado.id;
    boletoRecuperado.status_conferencia = "conferido";
    boletoRecuperado.conferido_em = boletoRecuperado.conferido_em ?? confirmadoEm;
    boletoRecuperado.conferido_por = boletoRecuperado.conferido_por ?? responsavel;
    boletoRecuperado.observacao = appendHistoricoRecuperacao(boletoRecuperado.observacao, historicoRecuperacao);

    Object.assign(db, proximo);
    return {
      sucesso: true,
      erros: [],
      confrontoAtual,
      documento: documentoRecuperado,
    };
  }

  if (documentosMesmoHash.length > 0) {
    return erro(confrontoAtual, "Documento de boleto já registrado com o mesmo hash SHA-256.");
  }
  if (documentosMesmoCodigo.length > 0) {
    return erro(confrontoAtual, "Documento de boleto já registrado com o mesmo código canônico.");
  }

  if (confrontoAtual.classificacao !== "exata" && confrontoAtual.classificacao !== "parcial") {
    return erro(confrontoAtual, `Resultado ${confrontoAtual.classificacao} não pode ser confirmado.`);
  }

  if (confrontoAtual.classificacao === "parcial" && !justificativa) {
    return erro(confrontoAtual, "Justificativa é obrigatória para confirmar resultado parcial.");
  }

  if (!confrontoAtual.nota_id || !confrontoAtual.parcela_id) {
    return erro(confrontoAtual, "Confronto não retornou NF-e/parcela única para confirmação.");
  }

  const boletoAtual = db.boletos.find((boleto) => boleto.id === confrontoAtual.parcela_id && boleto.nota_id === confrontoAtual.nota_id);
  if (!boletoAtual) {
    return erro(confrontoAtual, "Parcela candidata não existe mais no banco atual.");
  }

  if (boletoAtual.documento_boleto_id) {
    return erro(confrontoAtual, "Parcela já está ligada a outro DocumentoBoleto.");
  }

  const proximo = structuredClone(db) as DB;
  garanteColecoes(proximo);

  const resultadoRegistro = await registrarDocumentoBoleto(
    proximo,
    {
      arquivo: entrada.arquivo,
      linhaInformada: entrada.linhaInformada,
    },
    {
      agora: opcoes.agora,
      criadoPor: responsavel,
      gerarId: opcoes.gerarIdDocumento,
    }
  );

  if (!resultadoRegistro.sucesso || !resultadoRegistro.documento) {
    return erro(confrontoAtual, ...(resultadoRegistro.erros.length ? resultadoRegistro.erros : ["Falha ao registrar DocumentoBoleto."]));
  }

  const documento = proximo.documentos_boleto.find((doc) => doc.id === resultadoRegistro.documento?.id);
  if (!documento) {
    return erro(confrontoAtual, "Falha ao localizar DocumentoBoleto recém-registrado.");
  }

  const notaConfirmada = proximo.notas_fiscais.find((nota) => nota.id === confrontoAtual.nota_id);
  const boletoConfirmado = proximo.boletos.find((boleto) => boleto.id === confrontoAtual.parcela_id && boleto.nota_id === confrontoAtual.nota_id);

  if (!notaConfirmada || !boletoConfirmado) {
    return erro(confrontoAtual, "NF-e ou parcela indisponível no momento da gravação.");
  }

  if (boletoConfirmado.documento_boleto_id) {
    return erro(confrontoAtual, "Parcela já está ligada a outro DocumentoBoleto.");
  }

  const confirmadoEm = opcoes.agora ?? new Date().toISOString();
  documento.nota_id = notaConfirmada.id;
  documento.boleto_id = boletoConfirmado.id;
  documento.resultado_confronto = confrontoAtual.classificacao;
  documento.criterios_conferidos = [...confrontoAtual.criterios_coincidentes];
  documento.divergencias = [...confrontoAtual.divergencias];
  documento.confirmado_em = confirmadoEm;
  documento.confirmado_por = responsavel;
  documento.justificativa_confirmacao = justificativa || undefined;

  boletoConfirmado.documento_boleto_id = documento.id;
  boletoConfirmado.status_conferencia = "conferido";
  boletoConfirmado.conferido_em = confirmadoEm;
  boletoConfirmado.conferido_por = responsavel;
  boletoConfirmado.status = "liberado";

  Object.assign(db, proximo);

  return {
    sucesso: true,
    erros: [],
    confrontoAtual,
    documento,
  };
}

export function registrarEventoAnaliseConfrontoEmMemoria(
  eventosAtuais: EventoAnaliseConfrontoBoleto[],
  entrada: {
    resultadoConfronto: ResultadoConfrontoBoletoNfe;
    dados: DadosBoletoExtraidos;
    responsavel?: string;
    justificativa?: string;
    agora?: string;
    gerarId?: () => string;
  }
): EventoAnaliseConfrontoBoleto[] {
  const evento: EventoAnaliseConfrontoBoleto = {
    id: entrada.gerarId ? entrada.gerarId() : `analise-bol-${Date.now().toString(36)}`,
    criado_em: entrada.agora ?? new Date().toISOString(),
    criado_por: entrada.responsavel?.trim() || "usuário local",
    resultado: entrada.resultadoConfronto.classificacao,
    dados: {
      codigo_canonico: entrada.dados.codigo_canonico,
      valor_codificado: entrada.dados.valor_codificado,
      vencimento_extraido: entrada.dados.vencimento_extraido,
      chave_nfe: entrada.dados.chave_nfe,
      numero_parcela: entrada.dados.numero_parcela,
    },
    divergencias: [...entrada.resultadoConfronto.divergencias],
    avisos: [...entrada.resultadoConfronto.avisos],
    justificativa: entrada.justificativa?.trim() || undefined,
  };

  return [...eventosAtuais, evento];
}
