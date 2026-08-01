import { describe, expect, it } from "vitest";
import {
  calcularPrecificacaoPorCanal,
  campoComercialNaoInformado,
  canaisPadraoSemPremissa,
} from "./fichas-tecnicas-comercial";

describe("precificação comercial da ficha técnica", () => {
  it("não aplica valores comerciais fictícios em uma nova ficha", () => {
    const canais = canaisPadraoSemPremissa();

    expect(canais).toEqual([
      { canal: "salao", preco_praticado: 0, taxa_percentual: 0, taxa_fixa: 0, impostos_percentual: 0, cmv_desejado_percentual: 0 },
      { canal: "balcao", preco_praticado: 0, taxa_percentual: 0, taxa_fixa: 0, impostos_percentual: 0, cmv_desejado_percentual: 0 },
      { canal: "delivery_proprio", preco_praticado: 0, taxa_percentual: 0, taxa_fixa: 0, impostos_percentual: 0, cmv_desejado_percentual: 0 },
      { canal: "ifood", preco_praticado: 0, taxa_percentual: 0, taxa_fixa: 0, impostos_percentual: 0, cmv_desejado_percentual: 0 },
    ]);
    expect(campoComercialNaoInformado(canais[0], "preco_praticado")).toBe(true);
    expect(campoComercialNaoInformado(canais[0], "cmv_desejado_percentual")).toBe(true);
  });

  it("mantém valores já gravados em fichas antigas", () => {
    const [linha] = calcularPrecificacaoPorCanal(
      [
        {
          canal: "ifood",
          preco_praticado: 50,
          taxa_percentual: 10,
          taxa_fixa: 2,
          impostos_percentual: 5,
          cmv_desejado_percentual: 25,
        },
      ],
      1000
    );

    expect(linha.preco_praticado).toBe(50);
    expect(linha.taxa_percentual).toBe(10);
    expect(linha.taxa_fixa).toBe(2);
    expect(linha.impostos_percentual).toBe(5);
    expect(linha.cmv_desejado_percentual).toBe(25);
  });

  it("campos zerados não produzem NaN nem Infinity", () => {
    const linhas = calcularPrecificacaoPorCanal(canaisPadraoSemPremissa(), 1250);

    for (const linha of linhas) {
      expect(linha.custo).toBe(12.5);
      expect(linha.custoTotal).toBeNull();
      expect(linha.cmv).toBeNull();
      expect(linha.margemReais).toBeNull();
      expect(linha.margemPercentual).toBeNull();
      expect(linha.precoSugerido).toBeNull();
    }
  });

  it("ativa os cálculos quando o usuário informa os valores", () => {
    const [linha] = calcularPrecificacaoPorCanal(
      [
        {
          canal: "salao",
          preco_praticado: 50,
          taxa_percentual: 10,
          taxa_fixa: 2,
          impostos_percentual: 5,
          cmv_desejado_percentual: 25,
        },
      ],
      1000
    );

    expect(linha.dadosComerciaisPreenchidos).toBe(true);
    expect(linha.custoTotal).toBeCloseTo(19.5, 5);
    expect(linha.cmv).toBeCloseTo(20, 5);
    expect(linha.margemReais).toBeCloseTo(30.5, 5);
    expect(linha.margemPercentual).toBeCloseTo(61, 5);
    expect(linha.precoSugerido).toBeCloseTo(40, 5);
    expect(campoComercialNaoInformado(linha, "preco_praticado")).toBe(false);
  });
});