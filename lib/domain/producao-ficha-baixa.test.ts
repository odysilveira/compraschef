import { describe, expect, it } from "vitest";
import type { DB, FichaTecnica } from "../types";
import {
  aplicarProducaoComBaixaFicha,
  explodirInsumosProducao,
  montarPreviaProducaoFicha,
  resolverFichaProdutoAcabado,
} from "./producao-ficha-baixa";

function fichaBolonhesa(): FichaTecnica {
  return {
    id: "ficha-bol",
    nome: "Molho bolonhesa",
    status: "publicada",
    versao: "1.0.0",
    rendimento_quantidade: 5,
    rendimento_unidade_id: "un-kg",
    ingredientes: [
      {
        id: "ing-1",
        tipo: "PRODUTO",
        produto_id: "prod-carne",
        quantidade: 2,
        unidade_id: "un-kg",
      },
      {
        id: "ing-2",
        tipo: "PRODUTO",
        produto_id: "prod-tomate",
        quantidade: 1,
        unidade_id: "un-kg",
      },
    ],
    passos: [],
    alergenicos: {
      gluten: "NAO_INFORMADO",
      lactose: "NAO_INFORMADO",
      ovos: "NAO_INFORMADO",
      peixes: "NAO_INFORMADO",
      crustaceos: "NAO_INFORMADO",
      soja: "NAO_INFORMADO",
      castanhas: "NAO_INFORMADO",
      amendoim: "NAO_INFORMADO",
      outros: [],
    },
    criado_em: "2026-01-01T00:00:00.000Z",
    atualizado_em: "2026-01-01T00:00:00.000Z",
  };
}

function dbProd(): DB {
  const ficha = fichaBolonhesa();
  return {
    unidades: [
      { id: "un-kg", nome: "Quilo", sigla: "kg" },
      { id: "un-g", nome: "Grama", sigla: "g" },
    ],
    produtos: [
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
      {
        id: "prod-carne",
        codigo_externo: "P1",
        nome: "Carne moída",
        categoria: "carnes",
        tipo: "comprado",
        unidade_uso_id: "un-kg",
        fator_conversao: 1,
        estoque_minimo: 0,
        ativo: true,
      },
      {
        id: "prod-tomate",
        codigo_externo: "P2",
        nome: "Tomate",
        categoria: "hortifruti",
        tipo: "comprado",
        unidade_uso_id: "un-kg",
        fator_conversao: 1,
        estoque_minimo: 0,
        ativo: true,
      },
    ],
    fichas_tecnicas_receitas: [
      {
        id: "rec-bol",
        codigo: "P901",
        nome: "Molho bolonhesa",
        versao_vigente_id: "ver-bol",
        criado_em: "2026-01-01T00:00:00.000Z",
        atualizado_em: "2026-01-01T00:00:00.000Z",
      },
    ],
    fichas_tecnicas_versoes: [
      {
        id: "ver-bol",
        receita_id: "rec-bol",
        versao: "1.0.0",
        status: "publicada",
        ficha,
        criado_em: "2026-01-01T00:00:00.000Z",
        atualizado_em: "2026-01-01T00:00:00.000Z",
      },
    ],
    fichas_tecnicas: [ficha],
    caixas: [
      {
        id: "cx-c",
        numero: 1,
        qr_code: "CX-C",
        tipo_box: "RESERVA",
        posicao_fisica: "NAO_INFORMADA",
        status: "cheia",
        produto_id: "prod-carne",
        quantidade: 10,
        data_envase: "2026-10-01",
        validade: "2026-10-20",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "cx-t",
        numero: 2,
        qr_code: "CX-T",
        tipo_box: "RESERVA",
        posicao_fisica: "NAO_INFORMADA",
        status: "cheia",
        produto_id: "prod-tomate",
        quantidade: 10,
        data_envase: "2026-10-01",
        validade: "2026-10-20",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
    ],
    lotes_estoque: [
      {
        id: "lote-c",
        produto_id: "prod-carne",
        origem: "recebimento",
        quantidade_inicial: 10,
        quantidade_atual: 10,
        data_entrada: "2026-10-01",
        validade: "2026-10-20",
        criado_em: "2026-10-01T00:00:00.000Z",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "lote-t",
        produto_id: "prod-tomate",
        origem: "recebimento",
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
        id: "al-c",
        lote_id: "lote-c",
        caixa_id: "cx-c",
        quantidade_inicial: 10,
        quantidade_atual: 10,
        criado_em: "2026-10-01T00:00:00.000Z",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "al-t",
        lote_id: "lote-t",
        caixa_id: "cx-t",
        quantidade_inicial: 10,
        quantidade_atual: 10,
        criado_em: "2026-10-01T00:00:00.000Z",
        atualizado_em: "2026-10-01T00:00:00.000Z",
      },
    ],
    movimentos_estoque: [],
  } as unknown as DB;
}

describe("producao-ficha-baixa", () => {
  it("resolve ficha pelo nome do produto", () => {
    const r = resolverFichaProdutoAcabado(dbProd(), "prod-bolonhesa");
    expect(r?.ficha.id).toBe("ficha-bol");
  });

  it("explode 5 kg de rendimento → 2 kg carne + 1 kg tomate; 2.5 kg produzidos → metade", () => {
    const mapa = explodirInsumosProducao(fichaBolonhesa(), 2.5, dbProd());
    expect(mapa.get("prod-carne")).toBe(1);
    expect(mapa.get("prod-tomate")).toBe(0.5);
  });

  it("aplica produção com baixa de insumos", () => {
    const db = dbProd();
    let n = 0;
    const r = aplicarProducaoComBaixaFicha(db, {
      produtoId: "prod-bolonhesa",
      quantidade: 2.5,
      dataProducao: "2026-10-08",
      validade: "2026-10-13",
      porcionadoPorId: "u1",
      usuarioId: "u1",
      agora: "2026-10-08T12:00:00.000Z",
      novoLoteId: () => `lote-${++n}`,
      novoMovimentoId: () => `mov-${++n}`,
      debitarFicha: true,
    });
    expect(r.movimento_baixa_ids.length).toBe(2);
    expect(db.lotes_estoque.find((l) => l.produto_id === "prod-bolonhesa")?.quantidade_atual).toBe(2.5);
    expect(db.caixas.find((c) => c.id === "cx-c")?.quantidade).toBe(9);
    expect(db.caixas.find((c) => c.id === "cx-t")?.quantidade).toBe(9.5);
    expect(montarPreviaProducaoFicha(db, "prod-bolonhesa", 2.5).pode_aplicar_com_baixa).toBe(true);
  });
});
