import { describe, expect, it } from "vitest";
import {
  aplicarSugestaoContaDreProdutos,
  sugerirContaDrePorNome,
} from "./sugerir-conta-dre-nome";
import type { DB, Produto } from "../types";

describe("sugerirContaDrePorNome", () => {
  it("classifica food, limpeza e descartáveis", () => {
    expect(sugerirContaDrePorNome("ACUCAR REFINADO 1KG")).toBe("dre-cv-outros");
    expect(sugerirContaDrePorNome("AGUA SANITARIA QBOA 1L")).toBe("dre-op-limpeza");
    expect(sugerirContaDrePorNome("BOBINA PICOT. 20X30")).toBe("dre-cv-descartaveis");
    expect(sugerirContaDrePorNome("CANUDO 06MM PRETO")).toBe("dre-cv-descartaveis");
    expect(sugerirContaDrePorNome("QUEIJO MUCARELA KG")).toBe("dre-cv-laticinios");
    expect(sugerirContaDrePorNome("PEITO DE FRANGO")).toBe("dre-cv-carnes-frango");
    expect(sugerirContaDrePorNome("BACON DEFUMADO KG")).toBe("dre-cv-carnes-bacon");
    expect(sugerirContaDrePorNome("ARROZ MONDO ARBOREO")).toBe("dre-cv-risoto");
    expect(sugerirContaDrePorNome("TOMATE PELATI")).toBe("dre-cv-molho-vermelho");
    expect(sugerirContaDrePorNome("4 Queijos G")).toBe("dre-cv-porcionamentos");
  });
});

describe("aplicarSugestaoContaDreProdutos", () => {
  it("preenche só produtos sem conta e não sobrescreve", () => {
    const db = {
      contas_dre: [],
      produtos: [
        {
          id: "1",
          nome: "AGUA SANITARIA",
          tipo: "comprado",
          unidade_uso_id: "un-l",
          fator_conversao: 1,
          estoque_minimo: 0,
          ativo: true,
        },
        {
          id: "2",
          nome: "ACUCAR",
          tipo: "comprado",
          unidade_uso_id: "un-kg",
          fator_conversao: 1,
          estoque_minimo: 0,
          conta_dre_id: "dre-cv-laticinios",
          ativo: true,
        },
      ] as Produto[],
    } as Pick<DB, "produtos" | "contas_dre">;

    const r = aplicarSugestaoContaDreProdutos(db);
    expect(r.preenchidos).toBe(1);
    expect(db.produtos[0].conta_dre_id).toBe("dre-op-limpeza");
    expect(db.produtos[0].entra_no_cmv).toBe(false);
    expect(db.produtos[1].conta_dre_id).toBe("dre-cv-laticinios");
  });
});
