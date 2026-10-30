import { describe, expect, it } from "vitest";
import type { DB } from "../types";
import { baixarProdutoPorFefo, listarCaixasFefoProduto, saldoEmCaixasProduto } from "./estoque-baixa";

function dbBase(): DB {
  return {
    produtos: [
      {
        id: "prod-massa",
        codigo_externo: "P902",
        nome: "Massa fresca",
        categoria: "produção",
        tipo: "produzido",
        unidade_uso_id: "un-kg",
        fator_conversao: 1,
        estoque_minimo: 0,
        ativo: true,
      },
    ],
    caixas: [
      {
        id: "cx-a",
        numero: 1,
        qr_code: "CX-A",
        tipo_box: "RESERVA",
        posicao_fisica: "NAO_INFORMADA",
        status: "cheia",
        produto_id: "prod-massa",
        quantidade: 3,
        data_envase: "2026-10-01",
        validade: "2026-10-10",
        local_id: "loc-1",
        atualizado_em: "2026-10-01T10:00:00.000Z",
      },
      {
        id: "cx-b",
        numero: 2,
        qr_code: "CX-B",
        tipo_box: "OPERACIONAL",
        posicao_fisica: "NAO_INFORMADA",
        status: "cheia",
        produto_id: "prod-massa",
        quantidade: 4,
        data_envase: "2026-10-02",
        validade: "2026-10-08",
        local_id: "loc-1",
        atualizado_em: "2026-10-02T10:00:00.000Z",
      },
    ],
    lotes_estoque: [
      {
        id: "lote-a",
        produto_id: "prod-massa",
        origem: "producao",
        quantidade_inicial: 3,
        quantidade_atual: 3,
        data_entrada: "2026-10-01",
        validade: "2026-10-10",
        criado_em: "2026-10-01T10:00:00.000Z",
        atualizado_em: "2026-10-01T10:00:00.000Z",
      },
      {
        id: "lote-b",
        produto_id: "prod-massa",
        origem: "producao",
        quantidade_inicial: 4,
        quantidade_atual: 4,
        data_entrada: "2026-10-02",
        validade: "2026-10-08",
        criado_em: "2026-10-02T10:00:00.000Z",
        atualizado_em: "2026-10-02T10:00:00.000Z",
      },
    ],
    alocacoes_caixa: [
      {
        id: "aloc-a",
        lote_id: "lote-a",
        caixa_id: "cx-a",
        quantidade_inicial: 3,
        quantidade_atual: 3,
        criado_em: "2026-10-01T10:00:00.000Z",
        atualizado_em: "2026-10-01T10:00:00.000Z",
      },
      {
        id: "aloc-b",
        lote_id: "lote-b",
        caixa_id: "cx-b",
        quantidade_inicial: 4,
        quantidade_atual: 4,
        criado_em: "2026-10-02T10:00:00.000Z",
        atualizado_em: "2026-10-02T10:00:00.000Z",
      },
    ],
    movimentos_estoque: [],
  } as unknown as DB;
}

describe("baixarProdutoPorFefo", () => {
  it("ordena FEFO pela validade mais próxima", () => {
    const db = dbBase();
    const ordem = listarCaixasFefoProduto(db, "prod-massa").map((c) => c.id);
    expect(ordem).toEqual(["cx-b", "cx-a"]); // 08 antes de 10
  });

  it("baixa da caixa FEFO e registra movimento negativo", () => {
    const db = dbBase();
    let n = 0;
    const r = baixarProdutoPorFefo(db, {
      produtoId: "prod-massa",
      quantidade: 2,
      usuarioId: "perfil-dono",
      motivo: "SAIPOS_CONSUMO_MES",
      agora: "2026-10-05T12:00:00.000Z",
      novoMovimentoId: () => `mov-${++n}`,
    });
    expect(r.quantidade_baixada).toBe(2);
    expect(r.linhas[0].caixa_id).toBe("cx-b");
    expect(db.caixas.find((c) => c.id === "cx-b")?.quantidade).toBe(2);
    expect(db.lotes_estoque.find((l) => l.id === "lote-b")?.quantidade_atual).toBe(2);
    expect(db.movimentos_estoque[0]).toMatchObject({
      tipo: "baixa",
      quantidade: -2,
      motivo: "SAIPOS_CONSUMO_MES",
      caixa_id: "cx-b",
    });
  });

  it("esvazia a caixa quando zera e segue para a próxima", () => {
    const db = dbBase();
    let n = 0;
    baixarProdutoPorFefo(db, {
      produtoId: "prod-massa",
      quantidade: 5,
      usuarioId: "u1",
      motivo: "PRODUCAO_FICHA",
      agora: "2026-10-05T12:00:00.000Z",
      novoMovimentoId: () => `mov-${++n}`,
    });
    const b = db.caixas.find((c) => c.id === "cx-b")!;
    expect(b.status).toBe("vazia");
    expect(b.produto_id).toBeUndefined();
    expect(db.caixas.find((c) => c.id === "cx-a")?.quantidade).toBe(2);
    expect(saldoEmCaixasProduto(db, "prod-massa")).toBe(2);
  });

  it("não aplica parcial se faltar saldo", () => {
    const db = dbBase();
    expect(() =>
      baixarProdutoPorFefo(db, {
        produtoId: "prod-massa",
        quantidade: 10,
        usuarioId: "u1",
        motivo: "SAIPOS_CONSUMO_MES",
        agora: "2026-10-05T12:00:00.000Z",
        novoMovimentoId: () => "mov-x",
      })
    ).toThrow(/Saldo insuficiente/);
    expect(db.movimentos_estoque).toHaveLength(0);
    expect(saldoEmCaixasProduto(db, "prod-massa")).toBe(7);
  });
});
