/**
 * Pareamento manual 1 nota × N boletos (documentos) na Conferência.
 */

import type { Boleto, DB, DocumentoBoleto, NotaFiscal } from "../types";
import { obterCodigoCanonico, validarBoleto } from "./boletos";
import {
  extrairValorDoCodigoBoleto,
  extrairVencimentoDoCodigoBoleto,
  toleranciaMonetariaSuave,
  validarChaveAcessoNfe,
} from "./boleto-nfe-confronto";
import {
  listarBoletosSemNfConferida,
  listarParcelasAguardandoDocumento,
  type BoletoSemNfConferida,
} from "./conferencia-nfe-boleto";
import {
  calcularHashSHA256,
  registrarDocumentoBoleto,
  type ArquivoBoletoEntrada,
} from "./documentos-boleto";

const MARCA_GOLPE = "GOLPE CONFIRMADO";

export type CriterioBoletoJaPago = "codigo_canonico" | "linha_digitavel" | "hash_documento";

export interface BoletoJaPagoDetectado {
  boleto: Boleto;
  criterio: CriterioBoletoJaPago;
  mensagem: string;
}

function limparDigitosCodigo(valor?: string): string {
  return (valor ?? "").replace(/\D+/g, "");
}

function codigoCanonicoDe(valor?: string): string | undefined {
  const limpo = limparDigitosCodigo(valor);
  if (!limpo) return undefined;
  return obterCodigoCanonico(limpo) ?? (limpo.length === 44 ? limpo : undefined);
}

export function aplicarLinhaDigitavelDocumento(
  db: DB,
  documentoId: string,
  linhaBruta: string
): { ok: boolean; erros: string[]; documento?: DocumentoBoleto } {
  const documento = db.documentos_boleto.find((d) => d.id === documentoId);
  if (!documento) {
    return { ok: false, erros: ["Documento do boleto não encontrado."] };
  }

  const validacao = validarBoleto(linhaBruta);
  if (!validacao.valido || validacao.formato === "invalido") {
    return {
      ok: false,
      erros: validacao.erros.length ? validacao.erros : ["Linha digitável inválida."],
    };
  }

  documento.linha_informada = validacao.valorNormalizado;
  documento.codigo_canonico =
    validacao.codigoCanonico || codigoCanonicoDe(validacao.valorNormalizado);
  if (validacao.formato !== "invalido") {
    documento.formato_boleto = validacao.formato;
  }
  if (
    documento.resultado_confronto === "sem_correspondencia" ||
    documento.resultado_confronto === "divergente"
  ) {
    documento.resultado_confronto = undefined;
  }

  return { ok: true, erros: [], documento };
}

/**
 * Procura boleto já pago (ou com pagamento informado) pelo código/linha/hash do PDF.
 * Os boletos pagos permanecem na memória (db.boletos) e servem de memória antifraude/retrabalho.
 */
export function detectarBoletoJaPago(
  db: DB,
  entrada: {
    codigoCanonico?: string;
    linhaDigitavel?: string;
    hashSha256?: string;
  }
): BoletoJaPagoDetectado | null {
  const codigoBusca =
    codigoCanonicoDe(entrada.codigoCanonico) ||
    codigoCanonicoDe(entrada.linhaDigitavel);

  const pagos = (db.boletos ?? []).filter(
    (b) => b.status === "pago" || b.status === "aguardando_conciliacao"
  );

  if (codigoBusca) {
    for (const boleto of pagos) {
      const codigoBoleto =
        codigoCanonicoDe(boleto.linha_digitavel) ||
        (boleto.documento_boleto_id
          ? codigoCanonicoDe(
              db.documentos_boleto.find((d) => d.id === boleto.documento_boleto_id)?.codigo_canonico ||
                db.documentos_boleto.find((d) => d.id === boleto.documento_boleto_id)?.linha_informada
            )
          : undefined);
      if (codigoBoleto && codigoBoleto === codigoBusca) {
        return {
          boleto,
          criterio: "codigo_canonico",
          mensagem: montarMensagemBoletoJaPago(boleto),
        };
      }
    }
  }

  const hash = (entrada.hashSha256 ?? "").trim().toLowerCase();
  if (hash) {
    const doc = (db.documentos_boleto ?? []).find((d) => (d.hash_sha256 || "").toLowerCase() === hash);
    if (doc) {
      const boleto =
        (doc.boleto_id ? db.boletos.find((b) => b.id === doc.boleto_id) : undefined) ||
        db.boletos.find((b) => b.documento_boleto_id === doc.id);
      if (boleto && (boleto.status === "pago" || boleto.status === "aguardando_conciliacao")) {
        return {
          boleto,
          criterio: "hash_documento",
          mensagem: montarMensagemBoletoJaPago(boleto),
        };
      }
    }
  }

  return null;
}

export function montarMensagemBoletoJaPago(boleto: Boleto): string {
  const data = boleto.pagamento_data || boleto.pagamento_informado_em?.slice(0, 10);
  const dataBr = data
    ? data.includes("-")
      ? data.split("-").reverse().join("/")
      : data
    : "—";
  const valor = Number.isFinite(boleto.pagamento_valor ?? boleto.valor)
    ? (boleto.pagamento_valor ?? boleto.valor).toFixed(2).replace(".", ",")
    : "—";
  const banco = (boleto.pagamento_banco_conta || "").trim();
  const status =
    boleto.status === "pago"
      ? "já está pago"
      : "já teve pagamento informado (aguardando conciliação)";

  return (
    `Atenção: este boleto ${status}` +
    (data ? ` em ${dataBr}` : "") +
    (banco ? ` · ${banco}` : "") +
    ` · R$ ${valor}. Não registre de novo na conferência.`
  );
}

export interface EntradaPareamentoNotaBoletos {
  notaId: string;
  documentoIds: string[];
  justificativa?: string;
  responsavel?: string;
}

export interface ValidacaoPareamentoNotaBoletos {
  ok: boolean;
  erros: string[];
  avisos: string[];
  nota?: NotaFiscal;
  documentos: DocumentoBoleto[];
  somaBoletos: number;
  valorReferencia: number;
  tolerancia: number;
  divergenciaValor: boolean;
  exigeJustificativa: boolean;
}

export interface ResultadoPareamentoNotaBoletos {
  sucesso: boolean;
  erros: string[];
  boletosVinculados: Boleto[];
  documentosConfirmados: DocumentoBoleto[];
}

export interface OpcoesPareamentoNotaBoletos {
  agora?: string;
  gerarIdBoleto?: () => string;
}

function limparTexto(valor?: string): string {
  return (valor ?? "").trim();
}

function golpeConfirmado(boleto: Boleto): boolean {
  return boleto.status === "suspeito" && Boolean(boleto.observacao?.startsWith(MARCA_GOLPE));
}

function valorDoDocumento(documento: DocumentoBoleto, boleto?: Boleto): number | undefined {
  if (boleto && Number.isFinite(boleto.valor)) return boleto.valor;
  const codigo = documento.codigo_canonico || documento.linha_informada;
  return codigo ? extrairValorDoCodigoBoleto(codigo) : undefined;
}

function vencimentoDoDocumento(documento: DocumentoBoleto, boleto?: Boleto): string | undefined {
  if (boleto?.vencimento) return boleto.vencimento;
  const codigo = documento.codigo_canonico || documento.linha_informada;
  return codigo ? extrairVencimentoDoCodigoBoleto(codigo) : undefined;
}

function diferencaDias(a?: string, b?: string): number {
  if (!a || !b) return 999;
  const da = Date.parse(`${a}T12:00:00`);
  const db = Date.parse(`${b}T12:00:00`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 999;
  return Math.abs(Math.round((da - db) / 86_400_000));
}

function pontuarParcelaDocumento(parcela: Boleto, documento: DocumentoBoleto, boletoDoc?: Boleto): number {
  const valorDoc = valorDoDocumento(documento, boletoDoc);
  const vencDoc = vencimentoDoDocumento(documento, boletoDoc);
  let pontos = 0;

  if (valorDoc !== undefined && Number.isFinite(parcela.valor)) {
    const diff = Math.abs(parcela.valor - valorDoc);
    if (diff < 0.005) pontos += 50;
    else if (diff <= toleranciaMonetariaSuave(parcela.valor)) pontos += 30;
    else return -100; // valor outro — não sugere
  }

  if (vencDoc && parcela.vencimento) {
    const dias = diferencaDias(parcela.vencimento, vencDoc);
    if (dias === 0) pontos += 40;
    else if (dias <= 3) pontos += 20;
    else if (dias <= 7) pontos += 5;
    else if (dias > 20) {
      // Ex.: parcela ago/set vs boleto outubro da mesma empresa — outra NF
      return -100;
    } else {
      pontos -= 25;
    }
  }

  return pontos;
}

export function validarPareamentoNotaBoletos(
  db: DB,
  entrada: EntradaPareamentoNotaBoletos
): ValidacaoPareamentoNotaBoletos {
  const erros: string[] = [];
  const avisos: string[] = [];
  const nota = db.notas_fiscais.find((n) => n.id === entrada.notaId);
  const ids = Array.from(new Set((entrada.documentoIds ?? []).map((id) => id.trim()).filter(Boolean)));

  if (!nota) {
    return {
      ok: false,
      erros: ["Nota fiscal não encontrada."],
      avisos,
      documentos: [],
      somaBoletos: 0,
      valorReferencia: 0,
      tolerancia: 0,
      divergenciaValor: false,
      exigeJustificativa: false,
    };
  }

  if (ids.length === 0) {
    erros.push("Selecione ao menos um boleto para parear.");
  }

  const documentos: DocumentoBoleto[] = [];
  for (const id of ids) {
    const doc = db.documentos_boleto.find((d) => d.id === id);
    if (!doc) {
      erros.push(`Documento ${id} não encontrado.`);
      continue;
    }
    documentos.push(doc);
  }

  let somaBoletos = 0;
  const parcelasRestantes = listarParcelasAguardandoDocumento(db)
    .filter((p) => p.boleto.nota_id === nota.id)
    .map((p) => p.boleto);

  for (const doc of documentos) {
    const boleto = doc.boleto_id ? db.boletos.find((b) => b.id === doc.boleto_id) : undefined;
    const valor = valorDoDocumento(doc, boleto);
    if (valor !== undefined && Number.isFinite(valor) && valor > 0) {
      somaBoletos += valor;
      const idx = parcelasRestantes.findIndex((p) => Math.abs(p.valor - valor) < 0.02);
      if (idx >= 0) parcelasRestantes.splice(idx, 1);
      continue;
    }

    const parcela = parcelasRestantes.shift();
    if (!parcela || !Number.isFinite(parcela.valor) || parcela.valor <= 0) {
      erros.push(
        `Boleto “${doc.nome_arquivo}” sem valor legível. Cole a linha digitável do PDF ou use Ler de novo.`
      );
      continue;
    }
    somaBoletos += parcela.valor;
    avisos.push(
      `“${doc.nome_arquivo}” sem leitura — usando o valor da parcela da NF (${parcela.valor.toFixed(2)}).`
    );
  }
  somaBoletos = Number(somaBoletos.toFixed(2));

  const valorReferencia = Number((nota.valor_total || 0).toFixed(2));
  const tolerancia = toleranciaMonetariaSuave(valorReferencia || somaBoletos || 1);
  const divergenciaValor =
    valorReferencia > 0 && Math.abs(somaBoletos - valorReferencia) > tolerancia;
  const justificativa = limparTexto(entrada.justificativa);
  const exigeJustificativa = divergenciaValor;

  if (divergenciaValor && !justificativa) {
    erros.push(
      `Soma dos boletos (${somaBoletos.toFixed(2)}) diverge do valor da nota (${valorReferencia.toFixed(2)}). Informe uma justificativa.`
    );
  } else if (divergenciaValor) {
    avisos.push("Soma dos boletos diverge do valor da nota — será registrada com justificativa.");
  }

  return {
    ok: erros.length === 0,
    erros,
    avisos,
    nota,
    documentos,
    somaBoletos,
    valorReferencia,
    tolerancia,
    divergenciaValor,
    exigeJustificativa,
  };
}

/**
 * Documentos sugeridos para a nota (valor/vencimento próximos das parcelas pendentes).
 * Um candidato por parcela; limiar 30 = valor aproximado ou vencimento próximo.
 */
export function sugerirDocumentosParaNota(db: DB, notaId: string): BoletoSemNfConferida[] {
  const parcelas = listarParcelasAguardandoDocumento(db).filter((p) => p.boleto.nota_id === notaId);
  const candidatos = listarBoletosSemNfConferida(db);
  if (candidatos.length === 0) return [];

  if (parcelas.length === 0) {
    const nota = db.notas_fiscais.find((n) => n.id === notaId);
    const alvo = nota?.valor_total;
    if (alvo == null || !Number.isFinite(alvo)) return [];
    return candidatos.filter((item) => {
      const v = item.valor;
      if (v == null) return false;
      return Math.abs(v - alvo) <= toleranciaMonetariaSuave(alvo);
    });
  }

  const sugeridos: BoletoSemNfConferida[] = [];
  const usados = new Set<string>();

  for (const parcela of parcelas) {
    let melhor: BoletoSemNfConferida | undefined;
    let melhorPts = -Infinity;
    for (const item of candidatos) {
      if (usados.has(item.documento.id)) continue;
      const pts = pontuarParcelaDocumento(parcela.boleto, item.documento, item.boleto);
      if (pts > melhorPts) {
        melhorPts = pts;
        melhor = item;
      }
    }
    if (melhor && melhorPts >= 30) {
      sugeridos.push(melhor);
      usados.add(melhor.documento.id);
    }
  }

  return sugeridos;
}

function liberarBoletoSeMercadoriaOk(db: DB, boleto: Boleto, nota: NotaFiscal) {
  if (boleto.status === "pago" || boleto.status === "aguardando_conciliacao") return;
  if (golpeConfirmado(boleto)) return;
  if (nota.status === "conferida" || nota.status === "divergente") {
    if (boleto.status === "travado" || boleto.status === "liberado") {
      boleto.status = "liberado";
    }
  }
}

function vincularDocumentoAParcela(
  db: DB,
  documento: DocumentoBoleto,
  parcela: Boleto,
  nota: NotaFiscal,
  agora: string,
  responsavel: string,
  justificativa?: string
) {
  documento.boleto_id = parcela.id;
  documento.nota_id = nota.id;
  documento.confirmado_em = agora;
  documento.confirmado_por = responsavel;
  if (justificativa) documento.justificativa_confirmacao = justificativa;
  if (!documento.resultado_confronto || documento.resultado_confronto === "sem_correspondencia" || documento.resultado_confronto === "divergente") {
    documento.resultado_confronto = "parcial";
  }

  parcela.documento_boleto_id = documento.id;
  parcela.nota_id = nota.id;
  parcela.status_documento_fiscal = "vinculado";
  parcela.status_conferencia = "conferido";
  parcela.conferido_em = agora;
  parcela.conferido_por = responsavel;

  const linha = documento.linha_informada || documento.codigo_canonico;
  if (linha && !limparTexto(parcela.linha_digitavel)) {
    parcela.linha_digitavel = linha;
  }
  if (!parcela.cnpj_beneficiario && nota.cnpj_emitente) {
    parcela.cnpj_beneficiario = nota.cnpj_emitente;
  }
  if (!parcela.fornecedor_id && nota.fornecedor_id) {
    parcela.fornecedor_id = nota.fornecedor_id;
  }

  liberarBoletoSeMercadoriaOk(db, parcela, nota);
}

function criarBoletoDaNotaApartirDoDocumento(
  db: DB,
  documento: DocumentoBoleto,
  nota: NotaFiscal,
  agora: string,
  responsavel: string,
  gerarId: () => string,
  justificativa?: string
): Boleto {
  const valor = valorDoDocumento(documento) ?? 0;
  const vencimento = vencimentoDoDocumento(documento) ?? agora.slice(0, 10);
  const boleto: Boleto = {
    id: gerarId(),
    nota_id: nota.id,
    fornecedor_id: nota.fornecedor_id,
    valor,
    vencimento,
    cnpj_beneficiario: nota.cnpj_emitente,
    linha_digitavel: documento.linha_informada || documento.codigo_canonico,
    status: nota.status === "conferida" || nota.status === "divergente" ? "liberado" : "travado",
    documento_boleto_id: documento.id,
    status_conferencia: "conferido",
    status_documento_fiscal: "vinculado",
    conferido_em: agora,
    conferido_por: responsavel,
    observacao: justificativa ? `Pareado com justificativa: ${justificativa}` : undefined,
  };
  db.boletos.push(boleto);

  documento.boleto_id = boleto.id;
  documento.nota_id = nota.id;
  documento.confirmado_em = agora;
  documento.confirmado_por = responsavel;
  if (justificativa) documento.justificativa_confirmacao = justificativa;
  documento.resultado_confronto =
    !documento.resultado_confronto ||
    documento.resultado_confronto === "sem_correspondencia" ||
    documento.resultado_confronto === "divergente"
      ? "parcial"
      : documento.resultado_confronto;

  return boleto;
}

export function confirmarPareamentoNotaBoletos(
  db: DB,
  entrada: EntradaPareamentoNotaBoletos,
  opcoes: OpcoesPareamentoNotaBoletos = {}
): ResultadoPareamentoNotaBoletos {
  const validacao = validarPareamentoNotaBoletos(db, entrada);
  if (!validacao.ok || !validacao.nota) {
    return { sucesso: false, erros: validacao.erros, boletosVinculados: [], documentosConfirmados: [] };
  }

  const nota = validacao.nota;
  const agora = opcoes.agora ?? new Date().toISOString();
  const responsavel = limparTexto(entrada.responsavel) || "usuário local";
  const justificativa = limparTexto(entrada.justificativa) || undefined;
  const gerarId = opcoes.gerarIdBoleto ?? (() => `bol-${Date.now().toString(36)}`);

  const parcelasLivres = listarParcelasAguardandoDocumento(db)
    .filter((p) => p.boleto.nota_id === nota.id)
    .map((p) => p.boleto);

  const usados = new Set<string>();
  const boletosVinculados: Boleto[] = [];
  const documentosConfirmados: DocumentoBoleto[] = [];

  for (const documento of validacao.documentos) {
    const boletoDoc = documento.boleto_id
      ? db.boletos.find((b) => b.id === documento.boleto_id)
      : undefined;

    // Já tem boleto órfão (sem nota ou mesma nota): vincula à nota e, se possível, funde com parcela pendente.
    if (boletoDoc && (!boletoDoc.nota_id || boletoDoc.nota_id === nota.id)) {
      let parcelaAlvo = parcelasLivres.find((p) => !usados.has(p.id) && p.id === boletoDoc.id);
      if (!parcelaAlvo) {
        let melhor: Boleto | undefined;
        let melhorPts = -Infinity;
        for (const parcela of parcelasLivres) {
          if (usados.has(parcela.id)) continue;
          const pts = pontuarParcelaDocumento(parcela, documento, boletoDoc);
          if (pts > melhorPts) {
            melhorPts = pts;
            melhor = parcela;
          }
        }
        if (melhor && melhorPts >= 30) parcelaAlvo = melhor;
      }

      if (parcelaAlvo && parcelaAlvo.id !== boletoDoc.id) {
        // Move dados do documento para a parcela da nota e descarta órfão duplicado
        vincularDocumentoAParcela(db, documento, parcelaAlvo, nota, agora, responsavel, justificativa);
        usados.add(parcelaAlvo.id);
        // Se o órfão era outro registro, remove da agenda (evita duplicar pagamento)
        if (!golpeConfirmado(boletoDoc) && boletoDoc.status !== "pago") {
          db.boletos = db.boletos.filter((b) => b.id !== boletoDoc.id);
        }
        boletosVinculados.push(parcelaAlvo);
      } else {
        boletoDoc.nota_id = nota.id;
        boletoDoc.status_documento_fiscal = "vinculado";
        boletoDoc.status_conferencia = "conferido";
        boletoDoc.conferido_em = agora;
        boletoDoc.conferido_por = responsavel;
        boletoDoc.documento_boleto_id = documento.id;
        documento.boleto_id = boletoDoc.id;
        documento.nota_id = nota.id;
        documento.confirmado_em = agora;
        documento.confirmado_por = responsavel;
        if (justificativa) documento.justificativa_confirmacao = justificativa;
        if (
          !documento.resultado_confronto ||
          documento.resultado_confronto === "sem_correspondencia" ||
          documento.resultado_confronto === "divergente"
        ) {
          documento.resultado_confronto = "parcial";
        }
        liberarBoletoSeMercadoriaOk(db, boletoDoc, nota);
        usados.add(boletoDoc.id);
        boletosVinculados.push(boletoDoc);
      }
      documentosConfirmados.push(documento);
      continue;
    }

    // Escolhe melhor parcela pendente
    let melhor: Boleto | undefined;
    let melhorPts = -Infinity;
    for (const parcela of parcelasLivres) {
      if (usados.has(parcela.id)) continue;
      const pts = pontuarParcelaDocumento(parcela, documento, boletoDoc);
      if (pts > melhorPts) {
        melhorPts = pts;
        melhor = parcela;
      }
    }

    if (melhor && melhorPts >= 20) {
      vincularDocumentoAParcela(db, documento, melhor, nota, agora, responsavel, justificativa);
      usados.add(melhor.id);
      boletosVinculados.push(melhor);
    } else {
      const proxima = parcelasLivres.find((p) => !usados.has(p.id));
      if (proxima) {
        vincularDocumentoAParcela(db, documento, proxima, nota, agora, responsavel, justificativa);
        usados.add(proxima.id);
        boletosVinculados.push(proxima);
      } else {
        const criado = criarBoletoDaNotaApartirDoDocumento(
          db,
          documento,
          nota,
          agora,
          responsavel,
          gerarId,
          justificativa
        );
        boletosVinculados.push(criado);
      }
    }
    documentosConfirmados.push(documento);
  }

  return {
    sucesso: true,
    erros: [],
    boletosVinculados,
    documentosConfirmados,
  };
}

export interface ResultadoReceberBoletoConferencia {
  sucesso: boolean;
  documento?: DocumentoBoleto;
  erros: string[];
  /** Preenchido quando o código/PDF já corresponde a um boleto pago (não entra de novo na fila). */
  jaPago?: BoletoJaPagoDetectado;
}

/**
 * Registra PDF de boleto na fila “boletos sem NF” (sem casar ainda).
 * Se o boleto já estiver pago/informado, só avisa — não cria pendência nova.
 */
export async function receberBoletoPendenteNaConferencia(
  db: DB,
  entrada: {
    arquivo: ArquivoBoletoEntrada;
    linhaInformada?: string;
  },
  opcoes: {
    agora?: string;
    criadoPor?: string;
    gerarId?: () => string;
  } = {}
): Promise<ResultadoReceberBoletoConferencia> {
  const hashSha256 = await calcularHashSHA256(entrada.arquivo.conteudo);
  const codigoCanonico = entrada.linhaInformada
    ? codigoCanonicoDe(entrada.linhaInformada)
    : undefined;

  const jaPago = detectarBoletoJaPago(db, {
    codigoCanonico,
    linhaDigitavel: entrada.linhaInformada,
    hashSha256,
  });
  if (jaPago) {
    return {
      sucesso: true,
      erros: [],
      jaPago,
      documento: jaPago.boleto.documento_boleto_id
        ? db.documentos_boleto.find((d) => d.id === jaPago.boleto.documento_boleto_id)
        : undefined,
    };
  }

  const resultado = await registrarDocumentoBoleto(
    db,
    {
      arquivo: entrada.arquivo,
      linhaInformada: entrada.linhaInformada,
    },
    {
      agora: opcoes.agora,
      criadoPor: opcoes.criadoPor,
      gerarId: opcoes.gerarId,
    }
  );

  if (!resultado.sucesso || !resultado.documento) {
    // Documento já existia: ainda assim checa se o boleto ligado está pago
    const existente = resultado.duplicadoPorHash || resultado.duplicadoPorCodigoCanonico;
    if (existente) {
      const jaPagoExistente = detectarBoletoJaPago(db, {
        codigoCanonico: existente.codigo_canonico,
        linhaDigitavel: existente.linha_informada,
        hashSha256: existente.hash_sha256,
      });
      if (jaPagoExistente) {
        return { sucesso: true, documento: existente, erros: [], jaPago: jaPagoExistente };
      }
      return {
        sucesso: true,
        documento: existente,
        erros: [],
      };
    }
    return { sucesso: false, erros: resultado.erros };
  }

  // Sem parcela ainda — aparece em “boletos sem NF”
  if (entrada.linhaInformada) {
    resultado.documento.resultado_confronto = "sem_correspondencia";
  }
  return { sucesso: true, documento: resultado.documento, erros: [] };
}

export async function hashArquivoBoleto(conteudo: ArrayBuffer): Promise<string> {
  return calcularHashSHA256(conteudo);
}

/**
 * Remove PDF/foto da fila “Boletos sem NF” (não era boleto, já pago fora, etc.).
 * Não apaga parcela da agenda — só o documento pendente.
 */
export function descartarDocumentoBoletoPendente(
  db: DB,
  documentoId: string
): { ok: boolean; erros: string[]; documento?: DocumentoBoleto } {
  const documento = db.documentos_boleto.find((d) => d.id === documentoId);
  if (!documento) {
    return { ok: false, erros: ["Documento não encontrado."] };
  }
  if (documento.confirmado_em) {
    return {
      ok: false,
      erros: ["Este boleto já foi pareado/confirmado. Use Pagamentos ou Boletos pagos."],
    };
  }

  if (documento.boleto_id) {
    const boleto = db.boletos.find((b) => b.id === documento.boleto_id);
    if (boleto && boleto.documento_boleto_id === documento.id) {
      boleto.documento_boleto_id = undefined;
      if (boleto.status_conferencia === "em_analise") {
        boleto.status_conferencia = "aguardando_documento";
      }
    }
  }

  db.documentos_boleto = db.documentos_boleto.filter((d) => d.id !== documentoId);
  return { ok: true, erros: [], documento };
}

/** Nome tipo chave NF-e (44 dígitos) — arquivo classificado errado como boleto. */
export function nomeArquivoPareceChaveNfe(nomeArquivo: string): boolean {
  const digitos = nomeArquivo.replace(/\D+/g, "");
  return digitos.length === 44 && validarChaveAcessoNfe(digitos);
}
