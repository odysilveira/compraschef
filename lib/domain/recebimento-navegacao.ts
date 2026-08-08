import type { StatusRecebimento } from "../types";

export type FiltroRecebimento = "todos" | "problema" | "ok";

export const FILTROS_RECEBIMENTO_UI: { id: FiltroRecebimento; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "problema", rotulo: "Com problema" },
  { id: "ok", rotulo: "Ok" },
];

export function parseFiltroRecebimento(valor: string | null | undefined): FiltroRecebimento {
  if (valor === "problema" || valor === "ok") return valor;
  return "todos";
}

/**
 * Deep link de Recebimento (`?status=` + opcional `recebimento=`).
 * Defaults omitidos: todos e sem id → `/recebimento`.
 * `problema` = divergente | parcial (mesmo critério do Painel).
 */
export function hrefRecebimento(opts?: {
  status?: FiltroRecebimento;
  recebimento?: string;
}): string {
  const params = new URLSearchParams();
  const status = opts?.status ?? "todos";
  if (status !== "todos") params.set("status", status);
  const recebimentoId = (opts?.recebimento ?? "").trim();
  if (recebimentoId) params.set("recebimento", recebimentoId);
  const q = params.toString();
  return q ? `/recebimento?${q}` : "/recebimento";
}

export function filtrarRecebimentosPorStatus<T extends { status: StatusRecebimento }>(
  recebimentos: T[],
  filtro: FiltroRecebimento
): T[] {
  if (filtro === "todos") return recebimentos;
  if (filtro === "ok") return recebimentos.filter((r) => r.status === "ok");
  return recebimentos.filter((r) => r.status === "divergente" || r.status === "parcial");
}

export function rotuloStatusRecebimento(status: StatusRecebimento): string {
  if (status === "ok") return "Ok";
  if (status === "parcial") return "Parcial";
  return "Divergente";
}

export function corBadgeStatusRecebimento(
  status: StatusRecebimento
): "verde" | "laranja" | "vermelho" {
  if (status === "ok") return "verde";
  if (status === "parcial") return "laranja";
  return "vermelho";
}
