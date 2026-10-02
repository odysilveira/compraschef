/**
 * Aviso de retrabalho na Caixa: nota já importada/conferida ou boleto já baixado/já na conferência.
 */

import type { DB, NotaFiscal } from "../types";
import type { TipoDestinoInbox } from "./inbox-entrada";
import { localizarNotaFiscalPorChave } from "./nfe-parcelas";
import { localizarNotaPorChaveNfse } from "./nfse";
import { detectarBoletoJaPago } from "./pareamento-nfe-boleto";

export type CodigoAvisoRetrabalhoInbox =
  | "nota_ja_conferida"
  | "nota_ja_importada"
  | "boleto_ja_baixado"
  | "boleto_ja_na_conferencia";

export interface AvisoRetrabalhoInbox {
  codigo: CodigoAvisoRetrabalhoInbox;
  mensagem: string;
  /** Na Caixa: Confirmar fica desabilitado; Descartar elimina o arquivo. */
  bloqueiaConfirmacao: true;
  notaId?: string;
  boletoId?: string;
  documentoId?: string;
}

export interface EntradaAvaliacaoRetrabalhoInbox {
  tipo: TipoDestinoInbox;
  chaveNfe?: string;
  chaveNfse?: string;
  codigoBoleto?: string;
  hashSha256?: string;
}

function codigoCanonicoSimples(valor?: string): string | undefined {
  const limpo = (valor ?? "").replace(/\D/g, "");
  if (!limpo) return undefined;
  if (limpo.length === 44 || limpo.length === 47 || limpo.length === 48) return limpo;
  return limpo.length >= 44 ? limpo.slice(0, 44) : undefined;
}

function rotuloStatusNota(nota: NotaFiscal): string {
  switch (nota.status) {
    case "conferida":
      return "já conferida";
    case "divergente":
      return "já importada (divergente)";
    case "aguardando_conferencia":
      return "já importada (aguardando conferência)";
    default:
      return "já importada";
  }
}

function avaliarNota(
  db: DB,
  entrada: EntradaAvaliacaoRetrabalhoInbox
): AvisoRetrabalhoInbox | null {
  const chaveNfe = (entrada.chaveNfe ?? "").trim();
  const chaveNfse = (entrada.chaveNfse ?? "").trim();

  let nota: NotaFiscal | undefined;
  if (chaveNfe) nota = localizarNotaFiscalPorChave(db, chaveNfe);
  if (!nota && chaveNfse) nota = localizarNotaPorChaveNfse(db, chaveNfse);
  if (!nota) return null;

  const conferida = nota.status === "conferida";
  const codigo: CodigoAvisoRetrabalhoInbox = conferida ? "nota_ja_conferida" : "nota_ja_importada";
  const tipoLabel = nota.tipo === "nfse" ? "NFS-e" : "NF-e";
  return {
    codigo,
    mensagem: `${tipoLabel} nº ${nota.numero} ${rotuloStatusNota(nota)}. Descarte se for reenvio — não precisa importar de novo.`,
    bloqueiaConfirmacao: true,
    notaId: nota.id,
  };
}

function localizarDocumentoBoletoExistente(
  db: DB,
  entrada: { codigoBoleto?: string; hashSha256?: string }
) {
  const hash = (entrada.hashSha256 ?? "").trim().toLowerCase();
  if (hash) {
    const porHash = db.documentos_boleto.find((d) => (d.hash_sha256 || "").toLowerCase() === hash);
    if (porHash) return porHash;
  }
  const codigo = codigoCanonicoSimples(entrada.codigoBoleto);
  if (codigo) {
    return db.documentos_boleto.find((d) => {
      const docCodigo =
        codigoCanonicoSimples(d.codigo_canonico) || codigoCanonicoSimples(d.linha_informada);
      return docCodigo === codigo || (codigo.length === 44 && docCodigo?.startsWith(codigo));
    });
  }
  return undefined;
}

function avaliarBoleto(
  db: DB,
  entrada: EntradaAvaliacaoRetrabalhoInbox
): AvisoRetrabalhoInbox | null {
  const jaPago = detectarBoletoJaPago(db, {
    linhaDigitavel: entrada.codigoBoleto,
    codigoCanonico: codigoCanonicoSimples(entrada.codigoBoleto),
    hashSha256: entrada.hashSha256,
  });
  if (jaPago) {
    return {
      codigo: "boleto_ja_baixado",
      mensagem: `${jaPago.mensagem} Descarte este arquivo na caixa.`,
      bloqueiaConfirmacao: true,
      boletoId: jaPago.boleto.id,
      documentoId: jaPago.boleto.documento_boleto_id,
    };
  }

  const doc = localizarDocumentoBoletoExistente(db, entrada);
  if (!doc) return null;

  const boleto =
    (doc.boleto_id ? db.boletos.find((b) => b.id === doc.boleto_id) : undefined) ||
    db.boletos.find((b) => b.documento_boleto_id === doc.id);

  if (boleto && (boleto.status === "pago" || boleto.status === "aguardando_conciliacao")) {
    return {
      codigo: "boleto_ja_baixado",
      mensagem: `Boleto já baixado/informado (mesmo PDF ou código). Descarte na caixa.`,
      bloqueiaConfirmacao: true,
      boletoId: boleto.id,
      documentoId: doc.id,
    };
  }

  if (boleto?.status_conferencia === "conferido") {
    return {
      codigo: "boleto_ja_na_conferencia",
      mensagem: `Boleto já conferido/pareado. Descarte se for reenvio.`,
      bloqueiaConfirmacao: true,
      boletoId: boleto.id,
      documentoId: doc.id,
    };
  }

  return {
    codigo: "boleto_ja_na_conferencia",
    mensagem: `Boleto já está na Conferência (mesmo PDF ou código). Descarte se for duplicata.`,
    bloqueiaConfirmacao: true,
    boletoId: boleto?.id,
    documentoId: doc.id,
  };
}

/**
 * Avalia se o arquivo de compra já existe no sistema (evita reimportar).
 * OneDrive / desconhecido → sem aviso.
 */
export function avaliarRetrabalhoInbox(
  db: DB,
  entrada: EntradaAvaliacaoRetrabalhoInbox
): AvisoRetrabalhoInbox | null {
  switch (entrada.tipo) {
    case "xml_nfe":
    case "pdf_danfe":
    case "pdf_nfse":
      return avaliarNota(db, entrada);
    case "pdf_boleto":
      return avaliarBoleto(db, entrada);
    default:
      return null;
  }
}
