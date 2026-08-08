import { describe, expect, it } from "vitest";
import {
  filtrarListasComprasPorStatus,
  hrefListaCompras,
  parseFiltroStatusListaCompras,
} from "./lista-compras-navegacao";

describe("navegação lista de compras", () => {
  it("parseia status e monta href", () => {
    expect(parseFiltroStatusListaCompras("rascunho")).toBe("rascunho");
    expect(parseFiltroStatusListaCompras("xyz")).toBe("todos");
    expect(hrefListaCompras()).toBe("/lista-compras");
    expect(hrefListaCompras({ status: "todos" })).toBe("/lista-compras");
    expect(hrefListaCompras({ status: "rascunho" })).toBe("/lista-compras?status=rascunho");
  });

  it("filtra por status", () => {
    const lista = [
      { id: "1", status: "rascunho" as const },
      { id: "2", status: "em_cotacao" as const },
      { id: "3", status: "rascunho" as const },
    ];
    expect(filtrarListasComprasPorStatus(lista, "todos")).toHaveLength(3);
    expect(filtrarListasComprasPorStatus(lista, "rascunho").map((c) => c.id)).toEqual(["1", "3"]);
  });
});
