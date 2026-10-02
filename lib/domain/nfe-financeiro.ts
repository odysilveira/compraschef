import type { Boleto, DB, NotaFiscal } from "../types";
import { avaliarCompletudeNotaFiscal } from "./nfe-completude";

export type IndicadorCompletudeFinanceiro =
  | "Completa"
  | "Falta fornecedor"
  | "Faltam dados fiscais"
  | "Faltam dados de parcela"
  | "Sem boleto informado";

/** Situação de pagamento da nota (derivada das parcelas/boletos). */
export type StatusPagamentoNota =
  | "sem_boleto"
  | "aguardando_pagamento"
  | "parcialmente_paga"
  | "quitada";

export interface NotaFiscalResumoFinanceiro {
  nota: NotaFiscal;
  fornecedorNome: string;
  emitenteNome: string;
  emitenteCnpj: string;
  parcelas: Boleto[];
  quantidadeParcelas: number;
  somaParcelas: number;
  indicadorCompletude: IndicadorCompletudeFinanceiro;
  statusPagamento: StatusPagamentoNota;
}

export interface FiltroNotasFiscaisFinanceiro {
  pesquisa?: string;
  completude?: "todas" | IndicadorCompletudeFinanceiro;
  statusPagamento?: "todas" | StatusPagamentoNota;
}

export interface DetalhesNotaFiscalFinanceiro {
  nota: NotaFiscal;
  fornecedorNome: string;
  emitenteNome: string;
  emitenteCnpj: string;
  parcelas: Boleto[];
  somaParcelas: number;
  pendencias: string[];
}

export interface EstadoModalCorrecaoNfe {
  notaId: string;
  fornecedorCorrecaoId: string;
  justificativaCorrecao: string;
}

function normalizarTexto(valor?: string): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function fornecedorNome(db: DB, nota: NotaFiscal): string {
  const fornecedor = db.fornecedores.find((item) => item.id === nota.fornecedor_id);
  return fornecedor?.nome ?? "Fornecedor não vinculado";
}

function emitenteNome(nota: NotaFiscal): string {
  return nota.razao_social_emitente?.trim() || "Não disponível na importação original";
}

function emitenteCnpj(nota: NotaFiscal): string {
  return nota.cnpj_emitente?.trim() || "—";
}

function parcelasDaNota(db: DB, notaId: string): Boleto[] {
  return db.boletos.filter((boleto) => boleto.nota_id === notaId);
}

const MARCA_GOLPE = "GOLPE CONFIRMADO";

function parcelaAtivaParaPagamento(boleto: Boleto): boolean {
  if (boleto.status === "suspeito" && Boolean(boleto.observacao?.startsWith(MARCA_GOLPE))) {
    return false;
  }
  return true;
}

export function statusPagamentoNota(db: DB, nota: NotaFiscal): StatusPagamentoNota {
  const parcelas = parcelasDaNota(db, nota.id).filter(parcelaAtivaParaPagamento);
  if (parcelas.length === 0) return "sem_boleto";

  const pagos = parcelas.filter((b) => b.status === "pago");
  if (pagos.length === parcelas.length) return "quitada";
  if (pagos.length > 0) return "parcialmente_paga";

  const conferidos = parcelas.filter((b) => b.status_conferencia === "conferido");
  if (conferidos.length === parcelas.length) return "aguardando_pagamento";

  return "sem_boleto";
}

export function rotuloStatusPagamentoNota(status: StatusPagamentoNota): string {
  switch (status) {
    case "sem_boleto":
      return "Sem boleto / a conferir";
    case "aguardando_pagamento":
      return "Aguardando pagamento";
    case "parcialmente_paga":
      return "Parcialmente paga";
    case "quitada":
      return "Quitada (arquivo)";
  }
}

export function indicadorCompletudeFinanceiro(db: DB, nota: NotaFiscal): IndicadorCompletudeFinanceiro {
  const completude = avaliarCompletudeNotaFiscal(db, nota);
  const codigos = new Set(completude.pendencias.map((item) => item.codigo));

  if (completude.completa) return "Completa";
  if (codigos.has("fornecedor_ausente")) return "Falta fornecedor";
  if (codigos.has("chave_ausente") || codigos.has("cnpj_emitente_ausente")) return "Faltam dados fiscais";
  if (codigos.has("parcela_sem_valor") || codigos.has("parcela_sem_vencimento")) return "Faltam dados de parcela";
  if (codigos.has("sem_duplicatas_sem_confirmacao")) return "Sem boleto informado";

  return "Faltam dados fiscais";
}

export function montarResumoNotaFiscalFinanceiro(db: DB, nota: NotaFiscal): NotaFiscalResumoFinanceiro {
  const parcelas = parcelasDaNota(db, nota.id);
  const somaParcelas = parcelas.reduce((acumulado, parcela) => acumulado + parcela.valor, 0);

  return {
    nota,
    fornecedorNome: fornecedorNome(db, nota),
    emitenteNome: emitenteNome(nota),
    emitenteCnpj: emitenteCnpj(nota),
    parcelas,
    quantidadeParcelas: parcelas.length,
    somaParcelas,
    indicadorCompletude: indicadorCompletudeFinanceiro(db, nota),
    statusPagamento: statusPagamentoNota(db, nota),
  };
}

export function listarNotasFiscaisFinanceiro(db: DB, filtros: FiltroNotasFiscaisFinanceiro = {}): NotaFiscalResumoFinanceiro[] {
  const pesquisa = normalizarTexto(filtros.pesquisa);

  return db.notas_fiscais
    .map((nota) => montarResumoNotaFiscalFinanceiro(db, nota))
    .filter((resumo) => {
      if (filtros.completude && filtros.completude !== "todas" && resumo.indicadorCompletude !== filtros.completude) {
        return false;
      }

      if (
        filtros.statusPagamento &&
        filtros.statusPagamento !== "todas" &&
        resumo.statusPagamento !== filtros.statusPagamento
      ) {
        return false;
      }

      if (!pesquisa) return true;

      const campos = [
        resumo.nota.numero,
        resumo.fornecedorNome,
        resumo.emitenteCnpj,
        resumo.nota.chave_acesso,
      ];

      return campos.some((campo) => normalizarTexto(campo).includes(pesquisa));
    })
    .sort((a, b) => {
      const dataA = (a.nota.emitida_em || a.nota.importada_em || "").slice(0, 10);
      const dataB = (b.nota.emitida_em || b.nota.importada_em || "").slice(0, 10);
      return dataB.localeCompare(dataA);
    });
}

export function detalharNotaFiscalFinanceiro(db: DB, notaId: string): DetalhesNotaFiscalFinanceiro | undefined {
  const nota = db.notas_fiscais.find((item) => item.id === notaId);
  if (!nota) return undefined;

  const parcelas = parcelasDaNota(db, nota.id);
  const somaParcelas = parcelas.reduce((acumulado, parcela) => acumulado + parcela.valor, 0);
  const completude = avaliarCompletudeNotaFiscal(db, nota);

  return {
    nota,
    fornecedorNome: fornecedorNome(db, nota),
    emitenteNome: emitenteNome(nota),
    emitenteCnpj: emitenteCnpj(nota),
    parcelas,
    somaParcelas,
    pendencias: completude.pendencias.map((item) => item.mensagem),
  };
}

export function abrirModalCorrecaoNfe(db: DB, notaId: string): EstadoModalCorrecaoNfe | undefined {
  const nota = db.notas_fiscais.find((item) => item.id === notaId);
  if (!nota) return undefined;
  return {
    notaId,
    fornecedorCorrecaoId: nota.fornecedor_id || "",
    justificativaCorrecao: "",
  };
}
