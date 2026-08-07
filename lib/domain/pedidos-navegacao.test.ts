import { describe, expect, it } from "vitest";
import {
  filtrarPedidosPorStatus,
  hrefPedidos,
  parseFiltroStatusPedido,
} from "./pedidos-navegacao";

describe("navegação pedidos", () => {
  it("parseia status e monta href", () => {
    expect(parseFiltroStatusPedido("aguardando_aprovacao")).toBe("aguardando_aprovacao");
    expect(parseFiltroStatusPedido("xyz")).toBe("todos");
    expect(hrefPedidos()).toBe("/pedidos");
    expect(hrefPedidos({ status: "todos" })).toBe("/pedidos");
    expect(hrefPedidos({ status: "aguardando_aprovacao" })).toBe(
      "/pedidos?status=aguardando_aprovacao"
    );
    expect(hrefPedidos({ status: "confirmado", pedido: "ped-1" })).toBe(
      "/pedidos?status=confirmado&pedido=ped-1"
    );
    expect(hrefPedidos({ pedido: "ped-1" })).toBe("/pedidos?pedido=ped-1");
  });

  it("filtra por status", () => {
    const lista = [
      { id: "1", status: "aguardando_aprovacao" as const },
      { id: "2", status: "aprovado" as const },
      { id: "3", status: "aguardando_aprovacao" as const },
    ];
    expect(filtrarPedidosPorStatus(lista, "todos")).toHaveLength(3);
    expect(filtrarPedidosPorStatus(lista, "aguardando_aprovacao").map((p) => p.id)).toEqual([
      "1",
      "3",
    ]);
  });
});
