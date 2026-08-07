import type { StatusCotacao } from "../types";

export type FiltroStatusCotacao = "todos" | StatusCotacao;

const STATUS_COTACAO: StatusCotacao[] = ["enviada", "respondida", "expirada"];

export const FILTROS_STATUS_COTACAO_UI: { id: FiltroStatusCotacao; rotulo: string }[] = [
  { id: "todos", rotulo: "Todas" },
  { id: "enviada", rotulo: "Aguardando" },
  { id: "respondida", rotulo: "Respondida" },
  { id: "expirada", rotulo: "Expirada" },
];

export function parseFiltroStatusCotacao(
  valor: string | null | undefined
): FiltroStatusCotacao {
  if (valor && (STATUS_COTACAO as string[]).includes(valor)) {
    return valor as StatusCotacao;
  }
  return "todos";
}

/**
 * Deep link de Cotações (`?status=`).
 * Default omitido: todos → `/cotacoes`.
 */
export function hrefCotacoes(opts?: { status?: FiltroStatusCotacao }): string {
  const status = opts?.status ?? "todos";
  if (status === "todos") return "/cotacoes";
  return `/cotacoes?status=${status}`;
}

export function filtrarCotacoesPorStatus<T extends { status: StatusCotacao }>(
  cotacoes: T[],
  filtro: FiltroStatusCotacao
): T[] {
  if (filtro === "todos") return cotacoes;
  return cotacoes.filter((c) => c.status === filtro);
}
