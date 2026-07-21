import { describe, expect, it } from "vitest";
import type { DB } from "../types";
import { converterParaUnidadeUso, identificarProduto, precoPorUnidadeUso } from "./produtos";

const db = {
  unidades: [
    { id: "kg", nome: "quilograma", sigla: "kg" },
    { id: "cx", nome: "caixa", sigla: "cx" },
    { id: "fd", nome: "fardo", sigla: "fd" },
  ],
  produtos: [
    {
      id: "arroz",
      codigo_externo: "EASE-10",
      nome: "Arroz arbóreo",
      tipo: "comprado",
      unidade_compra_id: "fd",
      unidade_uso_id: "kg",
      fator_conversao: 10,
      codigo_barras: "7890001",
      estoque_minimo: 1,
      ativo: true,
    },
  ],
  fornecedor_produtos: [
    {
      id: "fp-1",
      fornecedor_id: "fornecedor-a",
      produto_id: "arroz",
      codigo_produto_fornecedor: "CPROD-77",
      codigo_barras_fornecedor: "789CAIXA",
      unidade_compra_id: "cx",
      fator_conversao: 6,
    },
  ],
} as unknown as DB;

describe("conversão para unidade de uso", () => {
  it("mantém quantidade quando a origem já é a unidade de uso", () => {
    expect(converterParaUnidadeUso(db, "arroz", 3, { unidadeOrigemId: "kg" })).toMatchObject({
      quantidadeUso: 3,
      fator: 1,
      origem: "unidade_uso",
      reconhecida: true,
    });
  });

  it("usa o fator de compra padrão do produto", () => {
    expect(converterParaUnidadeUso(db, "arroz", 2, { unidadeOrigemId: "fd" })).toMatchObject({
      quantidadeUso: 20,
      fator: 10,
      origem: "cadastro_produto",
    });
  });

  it("prioriza a embalagem específica do fornecedor", () => {
    expect(
      converterParaUnidadeUso(db, "arroz", 2, {
        unidadeOrigemId: "cx",
        fornecedorId: "fornecedor-a",
      })
    ).toMatchObject({ quantidadeUso: 12, fator: 6, origem: "cadastro_fornecedor" });
  });

  it("normaliza o preço para a unidade de uso", () => {
    expect(
      precoPorUnidadeUso(db, "arroz", 60, {
        unidadeOrigemId: "cx",
        fornecedorId: "fornecedor-a",
      })
    ).toBe(10);
  });

  it("não inventa conversão para unidade desconhecida", () => {
    expect(converterParaUnidadeUso(db, "arroz", 4, { unidadeOrigemId: "outra" })).toMatchObject({
      quantidadeUso: 4,
      fator: 1,
      reconhecida: false,
    });
  });
});

describe("identificação de produto na NF-e", () => {
  it("prioriza o cProd do fornecedor, sem confundi-lo com o código EaseEat", () => {
    expect(
      identificarProduto(db, {
        fornecedorId: "fornecedor-a",
        codigoFornecedor: " cprod-77 ",
        ean: "7890001",
      })
    ).toMatchObject({ criterio: "codigo_fornecedor", produto: { id: "arroz" } });
  });

  it("usa EAN como alternativa", () => {
    expect(identificarProduto(db, { ean: "7890001" })).toMatchObject({
      criterio: "ean_produto",
      produto: { id: "arroz" },
    });
  });
});
