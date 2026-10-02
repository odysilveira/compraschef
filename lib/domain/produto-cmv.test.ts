import { describe, expect, it } from "vitest";
import {
  garantirEntraNoCmvProdutos,
  inferirEntraNoCmv,
  produtoEntraNoCmv,
} from "./produto-cmv";
import type { ContaDre, Produto } from "../types";

describe("inferirEntraNoCmv", () => {
  it("mantém food da NF no CMV", () => {
    expect(inferirEntraNoCmv({ nome: "ACUCAR REFINADO 1KG CARAVELAS" })).toBe(true);
    expect(inferirEntraNoCmv({ nome: "ARROZ MONDO ARBOREO 1KG" })).toBe(true);
  });

  it("tira limpeza do CMV e mantém embalagem/descartáveis", () => {
    expect(inferirEntraNoCmv({ nome: "AGUA SANITARIA QBOA 1L" })).toBe(false);
    expect(inferirEntraNoCmv({ nome: "ALCOOL LIQUIDO 70% 1LT" })).toBe(false);
    expect(inferirEntraNoCmv({ nome: "BOBINA PICOT. 20X30 PLASK" })).toBe(true);
    expect(inferirEntraNoCmv({ nome: "CANUDO 06MM 21CM TRADICIONAL PRETO" })).toBe(true);
  });

  it("respeita conta DRE fora de custos variáveis", () => {
    const contas: ContaDre[] = [
      {
        id: "dre-op-limpeza",
        grupo: "fixo_operacao",
        codigo: "op.limpeza",
        nome: "Limpeza",
        ordem: 1,
        ativo: true,
      },
    ];
    expect(
      inferirEntraNoCmv({ nome: "PRODUTO X", contaDreId: "dre-op-limpeza", contasDre: contas })
    ).toBe(false);
  });
});

describe("produtoEntraNoCmv / garantir", () => {
  it("honra flag explícita e infere quando ausente", () => {
    expect(produtoEntraNoCmv({ nome: "ACUCAR", entra_no_cmv: true })).toBe(true);
    expect(produtoEntraNoCmv({ nome: "ACUCAR", entra_no_cmv: false })).toBe(false);
    expect(produtoEntraNoCmv({ nome: "AGUA SANITARIA" })).toBe(false);
  });

  it("preenche undefined uma vez", () => {
    const produtos = [
      { id: "1", nome: "TOMATE", entra_no_cmv: undefined },
      { id: "2", nome: "AGUA SANITARIA", entra_no_cmv: undefined },
      { id: "3", nome: "X", entra_no_cmv: false },
    ] as Produto[];
    expect(garantirEntraNoCmvProdutos(produtos)).toBe(true);
    expect(produtos[0].entra_no_cmv).toBe(true);
    expect(produtos[1].entra_no_cmv).toBe(false);
    expect(produtos[2].entra_no_cmv).toBe(false);
    expect(garantirEntraNoCmvProdutos(produtos)).toBe(false);
  });
});
