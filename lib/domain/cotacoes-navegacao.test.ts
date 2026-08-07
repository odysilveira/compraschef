import { describe, expect, it } from "vitest";
import {
  filtrarCotacoesPorStatus,
  hrefCotacoes,
  parseFiltroStatusCotacao,
} from "./cotacoes-navegacao";

describe("navegação cotações", () => {
  it("parseia status e monta href", () => {
    expect(parseFiltroStatusCotacao("enviada")).toBe("enviada");
    expect(parseFiltroStatusCotacao("xyz")).toBe("todos");
    expect(hrefCotacoes()).toBe("/cotacoes");
    expect(hrefCotacoes({ status: "todos" })).toBe("/cotacoes");
    expect(hrefCotacoes({ status: "enviada" })).toBe("/cotacoes?status=enviada");
  });

  it("filtra por status", () => {
    const lista = [
      { id: "1", status: "enviada" as const },
      { id: "2", status: "respondida" as const },
      { id: "3", status: "enviada" as const },
    ];
    expect(filtrarCotacoesPorStatus(lista, "todos")).toHaveLength(3);
    expect(filtrarCotacoesPorStatus(lista, "enviada").map((c) => c.id)).toEqual(["1", "3"]);
  });
});
