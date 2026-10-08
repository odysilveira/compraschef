import { describe, expect, it } from "vitest";
import {
  aoAlterarConteudoEmbalagem,
  completarPrecoEmbalagemLegado,
  conteudoTotalEmbalagem,
  custoUsoApartirDaMediaHistorica,
  custoUsoDeEmbalagem,
  modoMioloEmbalagemAtivo,
  normalizarPrecosCadastroProduto,
  precoEmbalagemDeCustoUso,
  precoReferenciaCotacao,
  sincronizarFatorDoMiolo,
} from "./produto-precos";
import type { Produto } from "../types";

function produtoBase(parcial: Partial<Produto>): Produto {
  return {
    id: "1",
    nome: "X",
    tipo: "comprado",
    unidade_uso_id: "un-un",
    fator_conversao: 1,
    estoque_minimo: 0,
    ativo: true,
    ...parcial,
  } as Produto;
}

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
    ).toBe(7);
  });

  it("legado sem embalagem: custo era preço do pacote", () => {
    const p = produtoBase({
      fator_conversao: 100,
      custo_unitario: 4.9,
    });
    expect(completarPrecoEmbalagemLegado(p)).toBe(true);
    expect(p.preco_embalagem_compra).toBeCloseTo(4.9, 6);
    expect(p.custo_unitario).toBeCloseTo(0.049, 6);
  });

  it("corrige canudo com embalagem multiplicada indevidamente (490 em vez de 4,90)", () => {
    const p = produtoBase({
      fator_conversao: 100,
      preco_embalagem_compra: 490,
      custo_unitario: 4.9,
    });
    expect(
      normalizarPrecosCadastroProduto(p, {
        mediaHistorica: 4.9,
      })
    ).toBe(true);
    expect(p.preco_embalagem_compra).toBeCloseTo(4.9, 6);
    expect(p.custo_unitario).toBeCloseTo(0.049, 6);
  });

  it("corrige com preço de fornecedor (unidade de compra)", () => {
    const p = produtoBase({
      fator_conversao: 100,
      preco_embalagem_compra: 490,
      custo_unitario: 4.9,
    });
    expect(
      normalizarPrecosCadastroProduto(p, {
        precoCompraFornecedor: 4.9,
      })
    ).toBe(true);
    expect(p.preco_embalagem_compra).toBeCloseTo(4.9, 6);
    expect(p.custo_unitario).toBeCloseTo(0.049, 6);
  });

  it("não quebra bacon correto (1 pct = 5 kg)", () => {
    const p = produtoBase({
      fator_conversao: 5,
      preco_embalagem_compra: 45,
      custo_unitario: 9,
    });
    expect(
      normalizarPrecosCadastroProduto(p, {
        mediaHistorica: 9,
        precoCompraFornecedor: 45,
      })
    ).toBe(false);
    expect(p.preco_embalagem_compra).toBe(45);
    expect(p.custo_unitario).toBe(9);
  });

  it("ao alterar conteúdo sem embalagem, não multiplica o preço do pacote", () => {
    expect(aoAlterarConteudoEmbalagem(100, { custo_unitario: 4.9 })).toEqual({
      fator_conversao: 100,
      preco_embalagem_compra: 4.9,
      custo_unitario: 0.049,
    });
  });

  it("aceita conteúdo fracionário 0,5 (1 pct = 0,5 kg)", () => {
    expect(aoAlterarConteudoEmbalagem(0.5, { preco_embalagem_compra: 10 })).toEqual({
      fator_conversao: 0.5,
      preco_embalagem_compra: 10,
      custo_unitario: 20,
    });
    expect(aoAlterarConteudoEmbalagem(0.5, { custo_unitario: 10 })).toEqual({
      fator_conversao: 0.5,
      preco_embalagem_compra: 10,
      custo_unitario: 20,
    });
  });

  it("média histórica no preço da embalagem vira CMV", () => {
    expect(custoUsoApartirDaMediaHistorica(4.9, 100, 4.9)).toBeCloseTo(0.049, 6);
    expect(custoUsoApartirDaMediaHistorica(0.049, 100, 4.9)).toBeCloseTo(0.049, 4);
  });

  it("preenche cadastro vazio com preço do fornecedor (carne suína / kg)", () => {
    const p = produtoBase({
      fator_conversao: 1,
      unidade_compra_id: "un-kg",
      unidade_uso_id: "un-kg",
    });
    expect(
      normalizarPrecosCadastroProduto(p, {
        precoCompraFornecedor: 28.5,
        mediaHistorica: 28.5,
      })
    ).toBe(true);
    expect(p.preco_embalagem_compra).toBeCloseTo(28.5, 6);
    expect(p.custo_unitario).toBeCloseTo(28.5, 6);
  });

  it("preenche cadastro vazio só com média histórica em unidade de uso", () => {
    const p = produtoBase({
      fator_conversao: 100,
    });
    expect(
      normalizarPrecosCadastroProduto(p, {
        mediaHistorica: 0.049,
      })
    ).toBe(true);
    expect(p.custo_unitario).toBeCloseTo(0.049, 6);
    expect(p.preco_embalagem_compra).toBeCloseTo(4.9, 6);
  });

  it("milho: 6 × 1,5 kg = 9 kg por caixa (sem subunidade_id)", () => {
    const p = produtoBase({
      unidade_compra_id: "un-cx",
      unidade_uso_id: "un-kg",
      quantidade_subunidade: 6,
      conteudo_por_subunidade: 1.5,
      fator_conversao: 1,
      preco_embalagem_compra: 45,
    });
    expect(modoMioloEmbalagemAtivo(p)).toBe(true);
    expect(conteudoTotalEmbalagem(p)).toBeCloseTo(9, 6);
    const sync = sincronizarFatorDoMiolo(p);
    expect(sync.fator_conversao).toBeCloseTo(9, 6);
    expect(sync.custo_unitario).toBeCloseTo(5, 6);
  });

  it("canudo: 100 unidades dentro, cada=1 implícito", () => {
    expect(
      conteudoTotalEmbalagem(
        produtoBase({
          unidade_uso_id: "un-un",
          quantidade_subunidade: 100,
          fator_conversao: 1,
        })
      )
    ).toBe(100);
  });

  it("bacon simples: sem qtd interna, 5 kg na embalagem", () => {
    const p = produtoBase({
      unidade_compra_id: "un-pct",
      unidade_uso_id: "un-kg",
      conteudo_por_subunidade: 5,
      fator_conversao: 1,
      preco_embalagem_compra: 45,
    });
    expect(modoMioloEmbalagemAtivo(p)).toBe(false);
    expect(conteudoTotalEmbalagem(p)).toBe(5);
    const sync = sincronizarFatorDoMiolo(p);
    expect(sync.fator_conversao).toBe(5);
    expect(sync.custo_unitario).toBeCloseTo(9, 6);
  });
});
