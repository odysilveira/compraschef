import type { Boleto } from "../types";
import { boletoProntoParaAgendaPagamentos } from "./pagar-boleto";

export type ResumoCaixaPeriodo = {
  total: number;
  quantidade: number;
  /** Já passou do dia de referência (ainda em aberto na agenda). */
  atrasados: number;
  /** Vencimento = dia de referência. */
  vencendoHoje: number;
  /** Vencimento no período e ainda no futuro. */
  aVencer: number;
};

function somenteData(valor?: string): string {
  return (valor ?? "").slice(0, 10);
}

function dataIsoValida(valor: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

function hojeIsoLocal(agora = new Date()): string {
  const y = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, "0");
  const d = String(agora.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Mesma regra da agenda (Atrasados / Hoje / A vencer):
 * não pago, não aguardando conciliação, e liberado na agenda (boleto conferido ou PIX sem NFS-e).
 */
export function boletoContaNoCaixaFuturo(boleto: Boleto): boolean {
  if (boleto.status === "aguardando_conciliacao" || boleto.status === "pago") return false;
  return boletoProntoParaAgendaPagamentos(boleto);
}

export function limitesMesCorrente(agora = new Date()): { inicio: string; fim: string } {
  const y = agora.getFullYear();
  const m = agora.getMonth();
  const inicio = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const ultimoDia = new Date(y, m + 1, 0).getDate();
  const fim = `${y}-${String(m + 1).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  return { inicio, fim };
}

/** Do dia de hoje até o mesmo dia N meses à frente. */
export function limitesProximosMeses(meses: number, agora = new Date()): { inicio: string; fim: string } {
  const inicioDate = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const fimDate = new Date(inicioDate);
  fimDate.setMonth(fimDate.getMonth() + Math.max(0, meses));
  const y1 = inicioDate.getFullYear();
  const m1 = String(inicioDate.getMonth() + 1).padStart(2, "0");
  const d1 = String(inicioDate.getDate()).padStart(2, "0");
  const y2 = fimDate.getFullYear();
  const m2 = String(fimDate.getMonth() + 1).padStart(2, "0");
  const d2 = String(fimDate.getDate()).padStart(2, "0");
  return { inicio: `${y1}-${m1}-${d1}`, fim: `${y2}-${m2}-${d2}` };
}

/**
 * Título entra no caixa do intervalo se:
 * - vencimento está em [inicio, fim], ou
 * - está atrasado e o intervalo cobre “hoje” (dívida aberta ainda precisa sair do caixa agora).
 * Assim o card do mês / “a partir de hoje” bate com Atrasados + Hoje + A vencer da agenda.
 */
export function boletoEntraNoPeriodoCaixa(
  vencimento: string,
  inicio: string,
  fim: string,
  hoje: string
): boolean {
  const venc = somenteData(vencimento);
  const de = somenteData(inicio);
  const ate = somenteData(fim);
  const dia = somenteData(hoje);
  if (!dataIsoValida(venc) || !dataIsoValida(de) || !dataIsoValida(ate) || !dataIsoValida(dia)) {
    return false;
  }
  const [ini, fimOrd] = de <= ate ? [de, ate] : [ate, de];
  if (venc >= ini && venc <= fimOrd) return true;
  // Atrasado anterior ao início: só conta se o período inclui o dia de hoje.
  return venc < dia && ini <= dia && dia <= fimOrd;
}

/**
 * Soma títulos da agenda no intervalo de caixa [inicio, fim].
 * Quebra em atrasados / hoje / a vencer em relação a `hoje`.
 */
export function somarBoletosAPagarNoPeriodo(
  boletos: Boleto[],
  inicio: string,
  fim: string,
  hoje = hojeIsoLocal()
): ResumoCaixaPeriodo {
  const de = somenteData(inicio);
  const ate = somenteData(fim);
  const dia = somenteData(hoje);
  if (!dataIsoValida(de) || !dataIsoValida(ate) || !dataIsoValida(dia)) {
    return { total: 0, quantidade: 0, atrasados: 0, vencendoHoje: 0, aVencer: 0 };
  }

  let total = 0;
  let quantidade = 0;
  let atrasados = 0;
  let vencendoHoje = 0;
  let aVencer = 0;

  for (const boleto of boletos) {
    if (!boletoContaNoCaixaFuturo(boleto)) continue;
    const venc = somenteData(boleto.vencimento);
    if (!boletoEntraNoPeriodoCaixa(venc, de, ate, dia)) continue;
    const valor = Number(boleto.valor);
    if (!Number.isFinite(valor) || valor <= 0) continue;
    total += valor;
    quantidade += 1;
    if (venc < dia) atrasados += 1;
    else if (venc === dia) vencendoHoje += 1;
    else aVencer += 1;
  }
  return {
    total: Math.round(total * 100) / 100,
    quantidade,
    atrasados,
    vencendoHoje,
    aVencer,
  };
}
