import { describe, expect, it } from "vitest";
import {
  hrefEstoque,
  parseAlertaEstoque,
  parseDataAlvoEstoque,
  parseDiasVencimentoEstoque,
} from "./estoque-navegacao";

describe("navegação estoque", () => {
  it("parseia alerta e dias", () => {
    expect(parseAlertaEstoque("minimo")).toBe("minimo");
    expect(parseAlertaEstoque("validade")).toBe("validade");
    expect(parseAlertaEstoque("xyz")).toBeNull();
    expect(parseDiasVencimentoEstoque("0")).toBe(0);
    expect(parseDiasVencimentoEstoque("7")).toBe(7);
    expect(parseDiasVencimentoEstoque("9")).toBe(3);
    expect(parseDiasVencimentoEstoque(null)).toBe(3);
    expect(parseDataAlvoEstoque("2026-08-10")).toBe("2026-08-10");
    expect(parseDataAlvoEstoque("x")).toBeNull();
  });

  it("monta href omitindo defaults", () => {
    expect(hrefEstoque()).toBe("/estoque");
    expect(hrefEstoque({ alerta: "minimo" })).toBe("/estoque?alerta=minimo");
    expect(hrefEstoque({ alerta: "validade" })).toBe("/estoque?alerta=validade");
    expect(hrefEstoque({ alerta: "validade", dias: 3 })).toBe("/estoque?alerta=validade");
    expect(hrefEstoque({ alerta: "validade", dias: 7 })).toBe("/estoque?alerta=validade&dias=7");
    expect(hrefEstoque({ alerta: "validade", dias: 0 })).toBe("/estoque?alerta=validade&dias=0");
    expect(hrefEstoque({ alerta: "validade", ate: "2026-08-10" })).toBe(
      "/estoque?alerta=validade&ate=2026-08-10"
    );
  });
});
