import { describe, expect, it } from "vitest";
import {
  AVISO_REPASSE_INTEGRAL_PRESTADOR,
  LIMITE_SERVICOS_SEMANA_PRESTADOR_EVENTUAL,
  calcularValorHoraRepasseIntegral,
  ehPrestadorEventual,
  pagamentoEhRepasseIntegral,
  precisaDadosPagamentoHoraPrestador,
  tipoPagamentoPadraoPrestadorEventual,
} from "./prestador-eventual";

describe("prestador eventual", () => {
  it("reconhece tipo e repasse integral", () => {
    expect(ehPrestadorEventual("prestador_eventual")).toBe(true);
    expect(ehPrestadorEventual("intermitente")).toBe(false);
    expect(ehPrestadorEventual({ tipo: "prestador_eventual" })).toBe(true);
    expect(pagamentoEhRepasseIntegral({ tipo: "prestador_eventual" })).toBe(true);
    expect(pagamentoEhRepasseIntegral({ tipo: "entregador" })).toBe(false);
    expect(tipoPagamentoPadraoPrestadorEventual()).toBe("freela_hora");
    expect(precisaDadosPagamentoHoraPrestador("prestador_eventual")).toBe(true);
    expect(LIMITE_SERVICOS_SEMANA_PRESTADOR_EVENTUAL).toBe(2);
    expect(AVISO_REPASSE_INTEGRAL_PRESTADOR).toMatch(/repasse|integral|retenção/i);
  });

  it("calcula hora × quantidade sem desconto", () => {
    expect(calcularValorHoraRepasseIntegral(25, 4)).toEqual({ valor_bruto: 100, valor: 100 });
    expect(calcularValorHoraRepasseIntegral(12.5, 5)).toEqual({ valor_bruto: 62.5, valor: 62.5 });
    expect(calcularValorHoraRepasseIntegral(0, 4)).toBeNull();
    expect(calcularValorHoraRepasseIntegral(25, 0)).toBeNull();
  });
});
