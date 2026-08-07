import type { Boleto, DB, NotaFiscal } from "../types";
import { avaliarCompletudeNotaFiscal } from "./nfe-completude";

export type IndicadorCompletudeFinanceiro =
  | "Completa"
  | "Falta fornecedor"
  | "Faltam dados fiscais"
  | "Faltam dados de parcela"
  | "Sem boleto informado";

export interface NotaFiscalResumoFinanceiro {
  nota: NotaFiscal;
  fornecedorNome: string;
  emitenteNome: string;
  emitenteCnpj: string;
  parcelas: Boleto[];
  quantidadeParcelas: number;
  somaParcelas: number;
  indicadorCompletude: IndicadorCompletudeFinanceiro;
}

export interface FiltroNotasFiscaisFinanceiro {
  pesquisa?: string;
  completude?: "todas" | IndicadorCompletudeFinanceiro;
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

function csvEscape(valor: string): string {
  if (/[;"\n\r]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

function formatarValorCsv(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toFixed(2).replace(".", ",");
}

function rotuloStatusNota(status: NotaFiscal["status"]): string {
  switch (status) {
    case "aguardando_conferencia":
      return "Aguardando conferência";
    case "conferida":
      return "Conferida";
    case "divergente":
      return "Divergente";
  }
}

/**
 * CSV das NF-e filtradas no Financeiro (separador `;`, UTF-8 com BOM).
 */
export function exportarNotasFiscaisFinanceiroCsv(resumos: NotaFiscalResumoFinanceiro[]): string {
  const cabecalho = [
    "NF-e",
    "Fornecedor vinculado",
    "Emitente",
    "CNPJ emitente",
    "Emissão",
    "Total",
    "Parcelas",
    "Soma parcelas",
    "Status",
    "Completude",
    "Chave de acesso",
  ];
  const linhas = resumos.map((resumo) =>
    [
      resumo.nota.numero || "",
      resumo.fornecedorNome,
      resumo.emitenteNome,
      resumo.emitenteCnpj === "—" ? "" : resumo.emitenteCnpj,
      (resumo.nota.emitida_em || "").slice(0, 10),
      formatarValorCsv(resumo.nota.valor_total),
      String(resumo.quantidadeParcelas),
      formatarValorCsv(resumo.somaParcelas),
      rotuloStatusNota(resumo.nota.status),
      resumo.indicadorCompletude,
      resumo.nota.chave_acesso || "",
    ]
      .map((c) => csvEscape(String(c)))
      .join(";")
  );
  return `\uFEFF${[cabecalho.join(";"), ...linhas].join("\r\n")}`;
}
