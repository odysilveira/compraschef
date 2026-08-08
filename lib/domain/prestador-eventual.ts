import type { DB, EscalaSlot, PessoaRH, TipoPagamentoPessoa, TipoPessoaRH } from "../types";
import { formatDataLocal, parseDataLocal } from "./escala";

/** Máximo de serviços na escala por semana (regra operacional; override com confirmação). */
export const LIMITE_SERVICOS_SEMANA_PRESTADOR_EVENTUAL = 2;

/** Prefixo gravado em `EscalaSlot.observacao` quando o dono confirma o risco. */
export const MARCA_LIMITE_SEMANA_OVERRIDE = "[LIMITE_SEMANA_OVERRIDE]";

export const AVISO_REPASSE_INTEGRAL_PRESTADOR =
  "Prestador eventual: sem retenção neste módulo — o valor integral vai ao prestador (impostos e taxas ficam a cargo dele / contador).";

export function ehPrestadorEventual(
  tipo: TipoPessoaRH | Pick<PessoaRH, "tipo"> | null | undefined
): boolean {
  if (!tipo) return false;
  if (typeof tipo === "string") return tipo === "prestador_eventual";
  return tipo.tipo === "prestador_eventual";
}

/** Pagamentos de prestador eventual não abatem consumo nem retenções no ComprasChef. */
export function pagamentoEhRepasseIntegral(pessoa: Pick<PessoaRH, "tipo"> | null | undefined): boolean {
  return ehPrestadorEventual(pessoa);
}

export function tipoPagamentoPadraoPrestadorEventual(): TipoPagamentoPessoa {
  return "freela_hora";
}

/** Valor líquido = bruto (repasse integral). */
export function calcularValorHoraRepasseIntegral(
  valorHora: number,
  horas: number
): { valor_bruto: number; valor: number } | null {
  if (!Number.isFinite(valorHora) || valorHora <= 0) return null;
  if (!Number.isFinite(horas) || horas <= 0) return null;
  const valor = Number((valorHora * horas).toFixed(2));
  return { valor_bruto: valor, valor };
}

export function precisaDadosPagamentoHoraPrestador(tipo: TipoPessoaRH): boolean {
  return tipo === "prestador_eventual";
}

/**
 * Semana operacional alinhada ao calendário da escala (`montarGradeCalendario(..., 1)`).
 * Default: segunda → domingo.
 */
export function limitesSemanaIso(
  dataIso: string,
  inicioSemana: 0 | 1 = 1
): { inicio: string; fim: string } {
  const d = parseDataLocal(dataIso.slice(0, 10));
  const day = d.getDay();
  const offset =
    inicioSemana === 1 ? (day === 0 ? -6 : 1 - day) : -day;
  const inicio = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
  const fim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 6);
  return { inicio: formatDataLocal(inicio), fim: formatDataLocal(fim) };
}

export function contarSlotsPessoaNaSemana(
  slots: Array<Pick<EscalaSlot, "id" | "pessoa_id" | "data">>,
  pessoaId: string,
  dataRef: string,
  opts?: { excluirSlotId?: string; inicioSemana?: 0 | 1 }
): number {
  const { inicio, fim } = limitesSemanaIso(dataRef, opts?.inicioSemana ?? 1);
  return slots.filter(
    (s) =>
      s.pessoa_id === pessoaId &&
      s.id !== opts?.excluirSlotId &&
      s.data >= inicio &&
      s.data <= fim
  ).length;
}

export interface AvaliacaoLimiteSemanaPrestador {
  aplica: boolean;
  /** Já está no limite; incluir/mover mais um exige confirmação. */
  excede: boolean;
  count: number;
  limite: number;
  inicio: string;
  fim: string;
}

export function avaliarLimiteSemanaPrestador(
  pessoa: Pick<PessoaRH, "tipo"> | null | undefined,
  slots: Array<Pick<EscalaSlot, "id" | "pessoa_id" | "data">>,
  pessoaId: string,
  dataRef: string,
  opts?: { excluirSlotId?: string; inicioSemana?: 0 | 1 }
): AvaliacaoLimiteSemanaPrestador {
  const limite = LIMITE_SERVICOS_SEMANA_PRESTADOR_EVENTUAL;
  if (!ehPrestadorEventual(pessoa)) {
    return { aplica: false, excede: false, count: 0, limite, inicio: "", fim: "" };
  }
  const { inicio, fim } = limitesSemanaIso(dataRef, opts?.inicioSemana ?? 1);
  const count = contarSlotsPessoaNaSemana(slots, pessoaId, dataRef, opts);
  return {
    aplica: true,
    excede: count >= limite,
    count,
    limite,
    inicio,
    fim,
  };
}

export function textoOverrideLimiteSemana(info: {
  count: number;
  limite: number;
  inicio: string;
  fim: string;
}): string {
  return `${MARCA_LIMITE_SEMANA_OVERRIDE} ${info.count + 1}>${info.limite} · ${info.inicio}–${info.fim}`;
}

export function anexarObservacaoOverride(
  atual: string | undefined,
  override: string
): string {
  if (!atual?.trim()) return override;
  if (atual.includes(MARCA_LIMITE_SEMANA_OVERRIDE)) return atual;
  return `${override} · ${atual.trim()}`;
}

export interface PrestadorNoLimiteSemana {
  pessoa_id: string;
  nome: string;
  count: number;
  limite: number;
  inicio: string;
  fim: string;
}

/**
 * Prestadores eventuais ativos que já atingiram o limite na semana de `hoje`
 * (próximo serviço exigiria confirmação de risco).
 */
export function listarPrestadoresNoLimiteSemana(
  db: Pick<DB, "pessoas" | "escala_slots">,
  hoje: string = new Date().toISOString().slice(0, 10)
): PrestadorNoLimiteSemana[] {
  const slots = db.escala_slots ?? [];
  const saida: PrestadorNoLimiteSemana[] = [];
  for (const pessoa of db.pessoas ?? []) {
    if (!pessoa.ativo || !ehPrestadorEventual(pessoa)) continue;
    const av = avaliarLimiteSemanaPrestador(pessoa, slots, pessoa.id, hoje);
    if (!av.excede) continue;
    saida.push({
      pessoa_id: pessoa.id,
      nome: pessoa.nome,
      count: av.count,
      limite: av.limite,
      inicio: av.inicio,
      fim: av.fim,
    });
  }
  return saida.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
