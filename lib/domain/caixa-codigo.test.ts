import { describe, expect, it } from "vitest";
import {
  inferirZonaDoLocal,
  localCompativelComCodigo,
  montarCodigoCaixa,
  numeroInternoDoCodigo,
  PADRAO_CODIGO_CAIXA,
  parseCodigoCaixa,
  sugerirProximoCodigoCaixa,
  validarCodigoCaixa,
} from "./caixa-codigo";

describe("caixa-codigo", () => {
  it("parseia freezer reserva/operacional, geladeira e seco", () => {
    expect(parseCodigoCaixa("f1-r01")).toMatchObject({
      codigo: "F1-R01",
      zona: "F",
      equipamento: 1,
      papel: "R",
      tipo_box: "RESERVA",
    });
    expect(parseCodigoCaixa("F2-O03")?.tipo_box).toBe("OPERACIONAL");
    expect(parseCodigoCaixa("G1-05")).toMatchObject({ zona: "G", sequencia: 5, tipo_box: "RESERVA" });
    expect(parseCodigoCaixa("ES-12")).toMatchObject({ zona: "ES", sequencia: 12 });
  });

  it("rejeita formatos inválidos", () => {
    expect(parseCodigoCaixa("CXCHEF-001")).toBeNull();
    expect(validarCodigoCaixa("F1-R").ok).toBe(false);
    expect(validarCodigoCaixa("G1-O01").ok).toBe(false);
    expect(PADRAO_CODIGO_CAIXA.test("F1-R01")).toBe(true);
    expect(PADRAO_CODIGO_CAIXA.test("G2-01")).toBe(true);
    expect(PADRAO_CODIGO_CAIXA.test("ES-03")).toBe(true);
    expect(PADRAO_CODIGO_CAIXA.test("F1R01")).toBe(false);
    expect(PADRAO_CODIGO_CAIXA.test("CXCHEF-001")).toBe(false);
  });

  it("monta e sugere próximo livre", () => {
    expect(montarCodigoCaixa({ zona: "F", equipamento: 1, papel: "R", sequencia: 2 })).toBe("F1-R02");
    expect(sugerirProximoCodigoCaixa(["F1-R01", "F1-R02"], { zona: "F", equipamento: 1, papel: "R" })).toBe(
      "F1-R03"
    );
  });

  it("infere zona do local e valida compatibilidade", () => {
    expect(inferirZonaDoLocal({ nome: "Freezer 1", tipo: "freezer" })).toEqual({
      zona: "F",
      equipamento: 1,
    });
    const p = parseCodigoCaixa("F1-R01")!;
    expect(localCompativelComCodigo(p, { nome: "Freezer 1", tipo: "freezer" })).toBe(true);
    expect(localCompativelComCodigo(p, { nome: "Geladeira 1", tipo: "geladeira" })).toBe(false);
    expect(numeroInternoDoCodigo(p)).toBeGreaterThan(0);
  });
});
