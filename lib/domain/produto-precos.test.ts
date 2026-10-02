import { describe, expect, it } from "vitest";
import {
  completarPrecoEmbalagemLegado,
  custoUsoDeEmbalagem,
  precoEmbalagemDeCustoUso,
  precoReferenciaCotacao,
} from "./produto-precos";
import type { Produto } from "../types";

describe("produto-precos", () => {
  it("converte canudo: pacote 4,90 / 100 un", () => {
    expect(custoUsoDeEmbalagem(4.9, 100)).toBeCloseTo(0.049, 6);
    expect(precoEmbalagemDeCustoUso(0.049, 100)).toBeCloseTo(4.9, 6);
  });

  it("detergente frasco: fator 1 mantém o mesmo valor", () => {
    expect(custoUsoDeEmbalagem(8.5, 1)).toBe(8.5);
    expect(precoReferenciaCotacao({ custo_unitario: 8.5, fator_conversao: 1 })).toBe(8.5);
  });

  it("preferência de cotação usa embalagem quando existe", () => {
    expect(
      precoReferenciaCotacao({
        preco_embalagem_compra: 42,
        custo_unitario: 7,
        fator_conversao: 6,
      })
    ).toBe(42);
    expect(
      precoReferenciaCotacao({
        custo_unitario: 7,
        fator_conversao: 6,
      })
    ).toBe(42);
  });

  it("completa legado sem embalagem", () => {
    const p = {
      id: "1",
      nome: "X",
      tipo: "comprado",
      unidade_uso_id: "un-un",
      fator_conversao: 100,
      estoque_minimo: 0,
      custo_unitario: 0.049,
      ativo: true,
    } as Produto;
    expect(completarPrecoEmbalagemLegado(p)).toBe(true);
    expect(p.preco_embalagem_compra).toBeCloseTo(4.9, 6);
  });
});
