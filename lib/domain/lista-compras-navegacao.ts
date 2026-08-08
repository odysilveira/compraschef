import type { StatusLista } from "../types";

export type FiltroStatusListaCompras = "todos" | StatusLista;

const STATUS_LISTA: StatusLista[] = ["rascunho", "confirmada", "em_cotacao", "finalizada"];

export const FILTROS_STATUS_LISTA_COMPRAS_UI: { id: FiltroStatusListaCompras; rotulo: string }[] = [
  { id: "todos", rotulo: "Todas" },
  { id: "rascunho", rotulo: "Rascunho" },
  { id: "confirmada", rotulo: "Confirmada" },
  { id: "em_cotacao", rotulo: "Em cotação" },
  { id: "finalizada", rotulo: "Finalizada" },
];

export function parseFiltroStatusListaCompras(
  valor: string | null | undefined
): FiltroStatusListaCompras {
  if (valor && (STATUS_LISTA as string[]).includes(valor)) {
    return valor as StatusLista;
  }
  return "todos";
}

/**
 * Deep link da Lista de compras (`?status=`).
 * Default omitido: todos → `/lista-compras`.
 */
export function hrefListaCompras(opts?: { status?: FiltroStatusListaCompras }): string {
  const status = opts?.status ?? "todos";
  if (status === "todos") return "/lista-compras";
  return `/lista-compras?status=${status}`;
}

export function filtrarListasComprasPorStatus<T extends { status: StatusLista }>(
  listas: T[],
  filtro: FiltroStatusListaCompras
): T[] {
  if (filtro === "todos") return listas;
  return listas.filter((l) => l.status === filtro);
}
