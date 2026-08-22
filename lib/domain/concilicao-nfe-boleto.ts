/**
 * Filas de trabalho NF-e × boleto (mesma fonte de verdade — sem BD duplicado).
 *
 * 1) Parcelas da agenda ainda sem documento conferido
 * 2) Documentos de boleto ainda sem vínculo confirmado com parcela
 * 3) Notas com pelo menos uma parcela nessa pendência
 *
 * Diferente de status "aguardando_conciliacao" (= pagamento já informado).
 */

import type { Boleto, DB, DocumentoBoleto, NotaFiscal } from "../types";
import { filtrarItensAbertos, type ItemFilaLote } from "./lote-recebimento-fila";

const MARCA_GOLPE = "GOLPE CONFIRMADO";

export type MotivoParcelaPendente =
  | "aguardando_documento"
  | "em_analise"
  | "sem_status_conferencia"
  | "documento_ausente";

export type MotivoDocumentoPendente =
  | "nao_confirmado"
  | "sem_parcela"
  | "parcela_nao_conferida"
  | "confronto_bloqueado";

export interface ParcelaAguardandoDocumento {
  boleto: Boleto;
  nota: NotaFiscal | undefined;
  fornecedorNome: string;
  motivo: MotivoParcelaPendente;
  rotuloMotivo: string;
}

export interface DocumentoAguardandoVinculo {
  documento: DocumentoBoleto;
  motivo: MotivoDocumentoPendente;
  rotuloMotivo: string;
  boleto?: Boleto;
  nota?: NotaFiscal;
  fornecedorNome?: string;
}

export interface NotaComBoletoPendente {
  nota: NotaFiscal;
  fornecedorNome: string;
  parcelasPendentes: Boleto[];
  quantidadePendentes: number;
  valorPendente: number;
}

export interface ResumoFilasConcilicaoNfeBoleto {
  parcelas: ParcelaAguardandoDocumento[];
  documentos: DocumentoAguardandoVinculo[];
  notas: NotaComBoletoPendente[];
  totalParcelas: number;
  totalDocumentos: number;
  totalNotas: number;
  valorParcelasPendentes: number;
}

function golpeConfirmado(boleto: Boleto): boolean {
  return boleto.status === "suspeito" && Boolean(boleto.observacao?.startsWith(MARCA_GOLPE));
}

function nomeFornecedorNota(db: DB, nota?: NotaFiscal): string {
  if (!nota?.fornecedor_id) return "Fornecedor não identificado";
  return db.fornecedores.find((f) => f.id === nota.fornecedor_id)?.nome ?? "Fornecedor não identificado";
}

function rotuloMotivoParcela(motivo: MotivoParcelaPendente): string {
  switch (motivo) {
    case "aguardando_documento":
      return "Aguardando PDF/linha do boleto";
    case "em_analise":
      return "Documento em análise / reimportação";
    case "sem_status_conferencia":
      return "Conferência do boleto ainda não iniciada";
    case "documento_ausente":
      return "Sem documento vinculado";
  }
}

function rotuloMotivoDocumento(motivo: MotivoDocumentoPendente): string {
  switch (motivo) {
    case "nao_confirmado":
      return "Importado, ainda sem confirmação do vínculo";
    case "sem_parcela":
      return "Sem parcela de NF-e vinculada";
    case "parcela_nao_conferida":
      return "Parcela ligada, mas ainda não conferida";
    case "confronto_bloqueado":
      return "Confronto divergente ou sem correspondência";
  }
}

function motivoParcelaPendente(boleto: Boleto): MotivoParcelaPendente | null {
  if (golpeConfirmado(boleto)) return null;
  if (boleto.status === "pago" || boleto.status === "aguardando_conciliacao") return null;
  if (boleto.status_conferencia === "conferido") return null;

  if (boleto.status_conferencia === "em_analise") return "em_analise";
  if (boleto.status_conferencia === "aguardando_documento") return "aguardando_documento";
  if (!boleto.documento_boleto_id) return "documento_ausente";
  return "sem_status_conferencia";
}

function motivoDocumentoPendente(db: DB, documento: DocumentoBoleto): MotivoDocumentoPendente | null {
  const resultado = documento.resultado_confronto;
  if (
    resultado === "divergente" ||
    resultado === "sem_correspondencia" ||
    resultado === "duplicada"
  ) {
    return "confronto_bloqueado";
  }

  if (!documento.confirmado_em) {
    if (!documento.boleto_id) return "sem_parcela";
    return "nao_confirmado";
  }

  if (!documento.boleto_id) return "sem_parcela";

  const boleto = db.boletos.find((b) => b.id === documento.boleto_id);
  if (!boleto || boleto.status_conferencia !== "conferido") return "parcela_nao_conferida";

  return null;
}

/** Parcelas da agenda que ainda precisam do PDF/linha conferido com a NF-e. */
export function listarParcelasAguardandoDocumento(db: DB): ParcelaAguardandoDocumento[] {
  const itens: ParcelaAguardandoDocumento[] = [];

  for (const boleto of db.boletos) {
    const motivo = motivoParcelaPendente(boleto);
    if (!motivo) continue;
    const nota = db.notas_fiscais.find((n) => n.id === boleto.nota_id);
    itens.push({
      boleto,
      nota,
      fornecedorNome: nomeFornecedorNota(db, nota),
      motivo,
      rotuloMotivo: rotuloMotivoParcela(motivo),
    });
  }

  return itens.sort((a, b) => {
    const va = a.boleto.vencimento || "";
    const vb = b.boleto.vencimento || "";
    if (va !== vb) return va.localeCompare(vb);
    return a.fornecedorNome.localeCompare(b.fornecedorNome, "pt-BR");
  });
}

/** Documentos de boleto ainda sem vínculo confirmado com uma parcela. */
export function listarDocumentosAguardandoVinculo(db: DB): DocumentoAguardandoVinculo[] {
  const itens: DocumentoAguardandoVinculo[] = [];

  for (const documento of db.documentos_boleto) {
    const motivo = motivoDocumentoPendente(db, documento);
    if (!motivo) continue;

    const boleto = documento.boleto_id
      ? db.boletos.find((b) => b.id === documento.boleto_id)
      : undefined;
    const notaId = documento.nota_id ?? boleto?.nota_id;
    const nota = notaId ? db.notas_fiscais.find((n) => n.id === notaId) : undefined;

    itens.push({
      documento,
      motivo,
      rotuloMotivo: rotuloMotivoDocumento(motivo),
      boleto,
      nota,
      fornecedorNome: nota ? nomeFornecedorNota(db, nota) : undefined,
    });
  }

  return itens.sort((a, b) => b.documento.criado_em.localeCompare(a.documento.criado_em));
}

/** Notas com pelo menos uma parcela ainda sem boleto conferido. */
export function listarNotasComBoletoPendente(db: DB): NotaComBoletoPendente[] {
  const porNota = new Map<string, Boleto[]>();

  for (const item of listarParcelasAguardandoDocumento(db)) {
    const lista = porNota.get(item.boleto.nota_id) ?? [];
    lista.push(item.boleto);
    porNota.set(item.boleto.nota_id, lista);
  }

  const notas: NotaComBoletoPendente[] = [];
  for (const [notaId, parcelasPendentes] of Array.from(porNota.entries())) {
    const nota = db.notas_fiscais.find((n) => n.id === notaId);
    if (!nota) continue;
    notas.push({
      nota,
      fornecedorNome: nomeFornecedorNota(db, nota),
      parcelasPendentes,
      quantidadePendentes: parcelasPendentes.length,
      valorPendente: parcelasPendentes.reduce(
        (s: number, p: Boleto) => s + (Number.isFinite(p.valor) ? p.valor : 0),
        0
      ),
    });
  }

  return notas.sort((a, b) => b.quantidadePendentes - a.quantidadePendentes);
}

export function montarResumoFilasConcilicaoNfeBoleto(db: DB): ResumoFilasConcilicaoNfeBoleto {
  const parcelas = listarParcelasAguardandoDocumento(db);
  const documentos = listarDocumentosAguardandoVinculo(db);
  const notas = listarNotasComBoletoPendente(db);

  return {
    parcelas,
    documentos,
    notas,
    totalParcelas: parcelas.length,
    totalDocumentos: documentos.length,
    totalNotas: notas.length,
    valorParcelasPendentes: parcelas.reduce(
      (s, p) => s + (Number.isFinite(p.boleto.valor) ? p.boleto.valor : 0),
      0
    ),
  };
}

/** PDFs de boleto ainda abertos na fila do lote (Recebimento → A conciliar). */
export function listarBoletosLoteAguardandoVinculo(itens: ItemFilaLote[]): ItemFilaLote[] {
  return filtrarItensAbertos(itens)
    .filter((item) => item.tipo === "pdf_boleto")
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
