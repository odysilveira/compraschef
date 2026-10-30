import { describe, expect, it } from "vitest";
import type { DB } from "../types";
import { resultadoConsolidadoVazio, type ArquivoConsumoSaipos } from "./saipos-consumo-arquivo";
import {
  aplicarBaixaSaiposMes,
  mapearProdutoMolho,
  montarPreviaBaixaSaipos,
} from "./saipos-baixa-estoque";

const SEP = "\u0000";

function dbEstoque(): DB {
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
      {
        id: "prod-bolonhesa",
        codigo_externo: "P901",
        nome: "Molho bolonhesa",
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
        id: "cx-m",
        numero: 1,
        qr_code: "CX-M",
        tipo_box: "RESERVA",
        posicao_fisica: "NAO_INFORMADA",
        status: "cheia",
        produto_id: "prod-massa",
        quantidade: 20,
        data_envase: "2026-10-01",
        validade: "2026-10-20",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "cx-b",
        numero: 2,
        qr_code: "CX-B",
        tipo_box: "RESERVA",
        posicao_fisica: "NAO_INFORMADA",
        status: "cheia",
        produto_id: "prod-bolonhesa",
        quantidade: 10,
        data_envase: "2026-10-01",
        validade: "2026-10-20",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
    ],
    lotes_estoque: [
      {
        id: "lote-m",
        produto_id: "prod-massa",
        origem: "producao",
        quantidade_inicial: 20,
        quantidade_atual: 20,
        data_entrada: "2026-10-01",
        validade: "2026-10-20",
        criado_em: "2026-10-01T00:00:00.000Z",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "lote-b",
        produto_id: "prod-bolonhesa",
        origem: "producao",
        quantidade_inicial: 10,
        quantidade_atual: 10,
        data_entrada: "2026-10-01",
        validade: "2026-10-20",
        criado_em: "2026-10-01T00:00:00.000Z",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
    ],
    alocacoes_caixa: [
      {
        id: "al-m",
        lote_id: "lote-m",
        caixa_id: "cx-m",
        quantidade_inicial: 20,
        quantidade_atual: 20,
        criado_em: "2026-10-01T00:00:00.000Z",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "al-b",
        lote_id: "lote-b",
        caixa_id: "cx-b",
        quantidade_inicial: 10,
        quantidade_atual: 10,
        criado_em: "2026-10-01T00:00:00.000Z",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
    ],
    movimentos_estoque: [],
    fichas_tecnicas: [],
    fichas_tecnicas_receitas: [],
    fichas_tecnicas_versoes: [],
  } as unknown as DB;
}

function arquivo(): ArquivoConsumoSaipos {
  const resultado = resultadoConsolidadoVazio();
  resultado.massaTamanho[`${"Talharim"}${SEP}G`] = 10; // 10 * 250g = 2.5 kg
  resultado.molhoTamanho[`${"Bolonhesa"}${SEP}Macarrao${SEP}G`] = 10; // 10 * 180g = 1.8 kg
  resultado.molhoTamanho[`${"Pomodoro"}${SEP}Macarrao${SEP}G`] = 5; // sem produto
  return {
    id: "saipos-2026-09",
    mes_ref: "2026-09",
    periodo_inicio: "2026-09-01",
    periodo_fim: "2026-09-30",
    periodo_rotulo: null,
    nome_arquivo: "set.xlsx",
    formato: "hierarquico",
    enviado_em: "2026-10-01T00:00:00.000Z",
    total_itens: 1,
    total_opcoes: 0,
    resultado,
  };
}

describe("saipos-baixa-estoque", () => {
  it("mapeia Bolonhesa para prod-bolonhesa", () => {
    expect(mapearProdutoMolho(dbEstoque(), "Bolonhesa")?.id).toBe("prod-bolonhesa");
  });

  it("monta prévia com kg e avisa molho sem vínculo", () => {
    const previa = montarPreviaBaixaSaipos(arquivo(), dbEstoque());
    const massa = previa.agregadas.find((a) => a.produto_id === "prod-massa");
    const bol = previa.agregadas.find((a) => a.produto_id === "prod-bolonhesa");
    expect(massa?.quantidade_kg).toBe(2.5);
    expect(bol?.quantidade_kg).toBe(1.8);
    expect(previa.pode_aplicar).toBe(true);
    expect(previa.avisos.some((a) => /Pomodoro/i.test(a))).toBe(true);
  });

  it("aplica baixa e fica idempotente", () => {
    const db = dbEstoque();
    let n = 0;
    const { arquivo: arq } = aplicarBaixaSaiposMes(db, arquivo(), "u1", () => `m-${++n}`, "2026-10-08T12:00:00.000Z");
    expect(arq.baixa_estoque?.movimento_ids.length).toBeGreaterThan(0);
    expect(db.caixas.find((c) => c.id === "cx-m")?.quantidade).toBe(17.5);
    expect(db.caixas.find((c) => c.id === "cx-b")?.quantidade).toBe(8.2);
    expect(() => aplicarBaixaSaiposMes(db, arq, "u1", () => `m-${++n}`)).toThrow(/já foi aplicada/);
  });
});
