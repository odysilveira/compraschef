import { describe, expect, it } from "vitest";
import {
  calcularCmvTourLondrina,
  validarSegundoPratoTour,
} from "./tour-londrina";

describe("Tour Londrina CMV", () => {
  const penne = {
    receita_id: "ft-it-penne-bolonhesa",
    nome: "Penne Bolonhesa",
    preco_loja: 40,
    custo_porcao: 12,
  };
  const funghi = {
    receita_id: "ft-it-penne-funghi",
    nome: "Penne Funghi",
    preco_loja: 38,
    custo_porcao: 14,
  };

  it("rejeita 2º prato mais caro que o pago", () => {
    const erros = validarSegundoPratoTour(funghi, penne);
    expect(erros.some((e) => e.includes("igual ou menos"))).toBe(true);
  });

  it("calcula CMV do combo: receita do pago + custo dos dois", () => {
    const r = calcularCmvTourLondrina(penne, funghi, []);
    expect(r.valido).toBe(true);
    expect(r.receita).toBe(40);
    expect(r.custo).toBe(26);
    expect(r.cmv_percentual).toBeCloseTo(65, 5);
    expect(r.margem_reais).toBeCloseTo(14, 5);
  });

  it("soma adicionais cobrados na receita e no custo", () => {
    const r = calcularCmvTourLondrina(penne, funghi, [
      { id: "a1", nome: "Dobrar proteína", preco_venda: 8, custo: 3 },
      { id: "a2", nome: "Bebida", preco_venda: 6, custo: 1.5 },
    ]);
    expect(r.valido).toBe(true);
    expect(r.receita).toBe(54);
    expect(r.custo).toBeCloseTo(30.5, 5);
    expect(r.cmv_percentual).toBeCloseTo((30.5 / 54) * 100, 2);
  });
});
