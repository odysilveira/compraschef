import type { StatusPedido } from "../types";

export type FiltroStatusPedido = "todos" | StatusPedido;

const STATUS_PEDIDO: StatusPedido[] = [
  "aguardando_aprovacao",
  "aprovado",
  "enviado",
  "confirmado",
  "entregue",
  "cancelado",
];

/** Chips principais na lista (cancelado fica acessível via Todos ou chip próprio). */
export const FILTROS_STATUS_PEDIDO_UI: { id: FiltroStatusPedido; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "aguardando_aprovacao", rotulo: "Aguardando aprovação" },
  { id: "aprovado", rotulo: "Aprovado" },
  { id: "enviado", rotulo: "Enviado" },
  { id: "confirmado", rotulo: "Confirmado" },
  { id: "entregue", rotulo: "Entregue" },
  { id: "cancelado", rotulo: "Cancelado" },
];

export function parseFiltroStatusPedido(
  valor: string | null | undefined
): FiltroStatusPedido {
  if (valor && (STATUS_PEDIDO as string[]).includes(valor)) {
    return valor as StatusPedido;
  }
  return "todos";
}

/**
 * Deep link de Pedidos (`?status=` + opcional `pedido=`).
 * Defaults omitidos: todos e sem pedido → `/pedidos`.
 */
export function hrefPedidos(opts?: {
  status?: FiltroStatusPedido;
  pedido?: string;
}): string {
  const params = new URLSearchParams();
  const status = opts?.status ?? "todos";
  if (status !== "todos") params.set("status", status);
  const pedidoId = (opts?.pedido ?? "").trim();
  if (pedidoId) params.set("pedido", pedidoId);
  const q = params.toString();
  return q ? `/pedidos?${q}` : "/pedidos";
}

export function filtrarPedidosPorStatus<T extends { status: StatusPedido }>(
  pedidos: T[],
  filtro: FiltroStatusPedido
): T[] {
  if (filtro === "todos") return pedidos;
  return pedidos.filter((p) => p.status === filtro);
}
