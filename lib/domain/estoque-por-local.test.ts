import { describe, expect, it } from "vitest";
import type { DB } from "../types";
import {
  aguardandoCaixaPorProduto,
  produtosNoLocal,
  resumoEstoquePorProdutos,
  saldoProdutoNoLocal,
  saldosPorLocal,
} from "./estoque-por-local";

function dbBase(): DB {
  return {
    produtos: [
      {
        id: "p-molho",
        nome: "Molho tomate",
        tipo: "comprado",
        unidade_uso_id: "un-kg",
        fator_conversao: 1,
        estoque_minimo: 0,
        ativo: true,
        local_padrao_id: "loc-seco",
      },
      {
        id: "p-carne",
        nome: "Carne",
        tipo: "comprado",
        unidade_uso_id: "un-kg",
        fator_conversao: 1,
        estoque_minimo: 0,
        ativo: true,
        local_padrao_id: "loc-gel",
      },
    ],
    locais: [
      { id: "loc-seco", nome: "Estoque seco", tipo: "despensa" },
      { id: "loc-gel", nome: "Geladeira 1", tipo: "geladeira" },
      { id: "loc-freez", nome: "Freezer 1", tipo: "freezer" },
    ],
    caixas: [
      {
        id: "cx1",
        numero: 1,
        qr_code: "CX-1",
        tipo_box: "NAO_CLASSIFICADO",
        posicao_fisica: "NAO_INFORMADA",
        status: "cheia",
        produto_id: "p-molho",
        quantidade: 10,
        local_id: "loc-seco",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "cx2",
        numero: 2,
        qr_code: "CX-2",
        tipo_box: "NAO_CLASSIFICADO",
        posicao_fisica: "NAO_INFORMADA",
        status: "cheia",
        produto_id: "p-carne",
        quantidade: 4,
        local_id: "loc-gel",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "cx3",
        numero: 3,
        qr_code: "CX-3",
        tipo_box: "NAO_CLASSIFICADO",
        posicao_fisica: "NAO_INFORMADA",
        status: "cheia",
        produto_id: "p-carne",
        quantidade: 6,
        local_id: "loc-freez",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
    ],
    lotes_estoque: [
      {
        id: "lote-molho",
        produto_id: "p-molho",
        quantidade_inicial: 10,
        quantidade_atual: 10,
        data_entrada: "2026-10-01",
        origem: "recebimento",
        criado_em: "2026-10-01T00:00:00.000Z",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "lote-carne",
        produto_id: "p-carne",
        quantidade_inicial: 12,
        quantidade_atual: 12,
        data_entrada: "2026-10-01",
        origem: "recebimento",
        criado_em: "2026-10-01T00:00:00.000Z",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "lote-pendente",
        produto_id: "p-molho",
        quantidade_inicial: 5,
        quantidade_atual: 5,
        data_entrada: "2026-10-02",
        origem: "recebimento",
        criado_em: "2026-10-02T00:00:00.000Z",
        atualizado_em: "2026-10-02T00:00:00.000Z",
      },
    ],
    alocacoes_caixa: [
      {
        id: "al1",
        lote_id: "lote-molho",
        caixa_id: "cx1",
        quantidade_inicial: 10,
        quantidade_atual: 10,
        criado_em: "2026-10-01T00:00:00.000Z",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "al2",
        lote_id: "lote-carne",
        caixa_id: "cx2",
        quantidade_inicial: 4,
        quantidade_atual: 4,
        criado_em: "2026-10-01T00:00:00.000Z",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "al3",
        lote_id: "lote-carne",
        caixa_id: "cx3",
        quantidade_inicial: 6,
        quantidade_atual: 6,
        criado_em: "2026-10-01T00:00:00.000Z",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
    ],
  } as unknown as DB;
}

describe("estoque-por-local", () => {
  it("soma saldos por local", () => {
    const db = dbBase();
    expect(saldoProdutoNoLocal(db, "p-carne", "loc-gel")).toBe(4);
    expect(saldoProdutoNoLocal(db, "p-carne", "loc-freez")).toBe(6);
    const todos = saldosPorLocal(db);
    expect(todos.find((s) => s.produto_id === "p-molho" && s.local_id === "loc-seco")?.quantidade).toBe(10);
  });

  it("lista produtos no local", () => {
    const db = dbBase();
    expect(produtosNoLocal(db, "loc-freez")).toEqual([{ produto_id: "p-carne", quantidade: 6 }]);
  });

  it("detecta aguardando caixa e monta visão geral", () => {
    const db = dbBase();
    const aguardando = aguardandoCaixaPorProduto(db);
    expect(aguardando.get("p-molho")).toBe(5);

    const resumo = resumoEstoquePorProdutos(db);
    const molho = resumo.find((r) => r.produto_id === "p-molho");
    expect(molho?.total).toBe(15);
    expect(molho?.aguardando_caixa).toBe(5);
    expect(molho?.por_local.some((l) => l.local_id === "loc-seco" && l.quantidade === 10)).toBe(true);

    const carne = resumo.find((r) => r.produto_id === "p-carne");
    expect(carne?.total).toBe(12);
    expect(carne?.por_local).toHaveLength(2);
  });
});
