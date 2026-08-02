import { describe, expect, it } from "vitest";
import type { DB } from "../types";
import {
  alocarLoteEmCaixa,
  ajustarLoteDaCaixa,
  baixarLoteDaCaixa,
  compararPrioridadeConsumo,
  criarLote,
  lotesPendentesDeAlocacao,
  quantidadePendenteLote,
  saldoDosLotes,
} from "./estoque";

function banco(): DB {
  return {
    caixas: [
      { id: "cx-1", numero: 1, qr_code: "CX-1", status: "vazia", atualizado_em: "2026-07-21T10:00:00Z" },
      { id: "cx-2", numero: 2, qr_code: "CX-2", status: "vazia", atualizado_em: "2026-07-21T10:00:00Z" },
    ],
    lotes_estoque: [],
    alocacoes_caixa: [],
  } as unknown as DB;
}

function receber(db: DB) {
  return criarLote(db, {
    id: "lote-1",
    produto_id: "produto-1",
    recebimento_item_id: "item-1",
    origem: "recebimento",
    quantidade: 12,
    data_entrada: "2026-07-21",
    validade: "2026-08-21",
    criado_em: "2026-07-21T10:00:00Z",
    atualizado_em: "2026-07-21T10:00:00Z",
  });
}

describe("lotes de estoque", () => {
  it("contabiliza o lote recebido mesmo antes da alocação física", () => {
    const db = banco();
    receber(db);
    expect(saldoDosLotes(db, "produto-1")).toBe(12);
    expect(lotesPendentesDeAlocacao(db)).toHaveLength(1);
  });

  it("divide um lote entre várias caixas sem criar novo saldo", () => {
    const db = banco();
    const lote = receber(db);
    alocarLoteEmCaixa(db, { id: "a-1", loteId: lote.id, caixaId: "cx-1", quantidade: 6, localId: "seco", agora: "2026-07-21T11:00:00Z" });
    alocarLoteEmCaixa(db, { id: "a-2", loteId: lote.id, caixaId: "cx-2", quantidade: 6, localId: "seco", agora: "2026-07-21T11:05:00Z" });

    expect(db.lotes_estoque).toHaveLength(1);
    expect(db.alocacoes_caixa).toHaveLength(2);
    expect(saldoDosLotes(db, "produto-1")).toBe(12);
    expect(quantidadePendenteLote(db, lote.id)).toBe(0);
    expect(lotesPendentesDeAlocacao(db)).toHaveLength(0);
    expect(db.caixas[0]).toMatchObject({
      status: "cheia",
      produto_id: "produto-1",
      quantidade: 6,
      local_id: "seco",
    });
  });

  it("impede criar dois lotes para o mesmo item de recebimento", () => {
    const db = banco();
    receber(db);
    expect(() => receber(db)).toThrow("já possui lote");
  });

  it("baixa o lote vinculado e limita a saída ao saldo existente", () => {
    const db = banco();
    const lote = receber(db);
    alocarLoteEmCaixa(db, { id: "a-1", loteId: lote.id, caixaId: "cx-1", quantidade: 6, agora: "2026-07-21T11:00:00Z" });

    expect(baixarLoteDaCaixa(db, "cx-1", 20, "2026-07-21T12:00:00Z")).toBe(6);
    expect(saldoDosLotes(db, "produto-1")).toBe(6);
    expect(quantidadePendenteLote(db, lote.id)).toBe(6);
  });

  it("permite corrigir uma contagem zero durante o balanço", () => {
    const db = banco();
    const lote = receber(db);
    alocarLoteEmCaixa(db, { id: "a-1", loteId: lote.id, caixaId: "cx-1", quantidade: 6, agora: "2026-07-21T11:00:00Z" });
    ajustarLoteDaCaixa(db, "cx-1", 0, "2026-07-21T12:00:00Z");
    ajustarLoteDaCaixa(db, "cx-1", 2, "2026-07-21T12:05:00Z");

    expect(db.alocacoes_caixa[0].quantidade_atual).toBe(2);
    expect(saldoDosLotes(db, "produto-1")).toBe(8);
  });
});

describe("prioridade de consumo", () => {
  it("prioriza a validade e usa a data de preparo como desempate", () => {
    const caixas = [
      { validade: "2026-08-10", data_envase: "2026-07-01" },
      { validade: "2026-08-05", data_envase: "2026-07-20" },
      { validade: "2026-08-05", data_envase: "2026-07-10" },
    ].sort(compararPrioridadeConsumo);
    expect(caixas).toEqual([
      { validade: "2026-08-05", data_envase: "2026-07-10" },
      { validade: "2026-08-05", data_envase: "2026-07-20" },
      { validade: "2026-08-10", data_envase: "2026-07-01" },
    ]);
  });
});
