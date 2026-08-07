import { describe, expect, it } from "vitest";
import { atualizarComNovidades } from "../data/index";
import type { DB } from "../types";
import {
  aplicarMetadadosBox,
  ativarDestinacaoOperacional,
  avisoIncompatibilidadeBox,
  boxEstaAptoParaFluxoOperacionalFuturo,
  boxEstaClassificado,
  SUPORTA_TRANSFERENCIAS_ENTRE_BOXES,
} from "./estoque-boxes";

function bancoLegado(): DB {
  return {
    caixas: [
      {
        id: "cx-1",
        numero: 1,
        qr_code: "CXCHEF-001",
        status: "cheia",
        produto_id: "prod-1",
        quantidade: 5,
        data_envase: "2026-08-03",
        validade: "2026-08-06",
        local_id: "loc-1",
        atualizado_em: "2026-08-03T10:00:00.000Z",
      } as DB["caixas"][number],
    ],
    lotes_estoque: [
      {
        id: "lote-1",
        produto_id: "prod-1",
        origem: "manual",
        quantidade_inicial: 5,
        quantidade_atual: 5,
        data_entrada: "2026-08-03",
        validade: "2026-08-06",
        criado_em: "2026-08-03T10:00:00.000Z",
        atualizado_em: "2026-08-03T10:00:00.000Z",
      },
    ],
    alocacoes_caixa: [
      {
        id: "aloc-1",
        lote_id: "lote-1",
        caixa_id: "cx-1",
        quantidade_inicial: 5,
        quantidade_atual: 5,
        criado_em: "2026-08-03T10:00:00.000Z",
        atualizado_em: "2026-08-03T10:00:00.000Z",
      },
    ],
    produtos: [],
    categorias_produtos: [],
    produto_codigos_barras: [],
    fornecedores: [],
    fornecedor_produtos: [],
    locais: [],
    perfis: [],
    unidades: [],
    listas_compras: [],
    lista_itens: [],
    cotacoes: [],
    cotacao_itens: [],
    pedidos: [],
    pedido_itens: [],
    notas_fiscais: [],
    boletos: [],
    boleto_pagamentos_historico: [],
    contas_pagar: [],
    conta_pagar_historico: [],
    documentos_boleto: [],
    recebimentos: [],
    recebimento_itens: [],
    movimentos_estoque: [],
    balancos: [],
    balanco_itens: [],
    eventos_box_operacional: [],
    precos_historico: [],
    integracao_eventos: [],
  } as DB;
}

describe("estoque boxes fase 1", () => {
  it("caixa existente recebe NAO_CLASSIFICADO por padrão", () => {
    const db = bancoLegado();
    atualizarComNovidades(db);

    expect(db.caixas[0].tipo_box).toBe("NAO_CLASSIFICADO");
    expect(db.caixas[0].posicao_fisica).toBe("NAO_INFORMADA");
  });

  it("permite dois boxes Reserva no mesmo local e com o mesmo produto sem unir registros", () => {
    const db = bancoLegado();
    atualizarComNovidades(db);

    db.caixas.push({
      id: "cx-2",
      numero: 2,
      qr_code: "CXCHEF-002",
      tipo_box: "RESERVA",
      posicao_fisica: "TRAS",
      status: "cheia",
      produto_id: "prod-1",
      quantidade: 3,
      data_envase: "2026-08-03",
      validade: "2026-08-06",
      local_id: "loc-1",
      atualizado_em: "2026-08-03T11:00:00.000Z",
    });
    db.caixas[0] = aplicarMetadadosBox(db.caixas[0], {
      tipo_box: "RESERVA",
      posicao_fisica: "TRAS",
    });

    expect(db.caixas).toHaveLength(2);
    expect(new Set(db.caixas.map((caixa) => caixa.qr_code)).size).toBe(2);
    expect(db.caixas.every((caixa) => caixa.tipo_box === "RESERVA")).toBe(true);
    expect(db.caixas.every((caixa) => caixa.local_id === "loc-1")).toBe(true);
    expect(db.caixas.every((caixa) => caixa.produto_id === "prod-1")).toBe(true);
    expect(db.lotes_estoque).toHaveLength(1);
    expect(db.alocacoes_caixa).toHaveLength(1);
  });

  it("editar um box Reserva não substitui o outro nem duplica saldo", () => {
    const db = bancoLegado();
    atualizarComNovidades(db);

    db.caixas.push({
      id: "cx-2",
      numero: 2,
      qr_code: "CXCHEF-002",
      tipo_box: "RESERVA",
      posicao_fisica: "TRAS",
      status: "cheia",
      produto_id: "prod-1",
      quantidade: 5,
      data_envase: "2026-08-03",
      validade: "2026-08-06",
      local_id: "loc-1",
      atualizado_em: "2026-08-03T11:00:00.000Z",
    });

    const saldoAntes = db.lotes_estoque[0].quantidade_atual;
    const primeiroQrAntes = db.caixas[0].qr_code;

    db.caixas[1] = aplicarMetadadosBox(db.caixas[1], { tipo_box: "OPERACIONAL", posicao_fisica: "FRENTE" });

    expect(db.caixas[0].qr_code).toBe(primeiroQrAntes);
    expect(db.caixas[0].tipo_box).toBe("NAO_CLASSIFICADO");
    expect(db.caixas[1].tipo_box).toBe("OPERACIONAL");
    expect(db.lotes_estoque[0].quantidade_atual).toBe(saldoAntes);
    expect(db.alocacoes_caixa).toHaveLength(1);
  });

  it("editar tipo não altera saldo", () => {
    const db = bancoLegado();
    atualizarComNovidades(db);
    const saldoAntes = db.lotes_estoque[0].quantidade_atual;

    db.caixas[0] = aplicarMetadadosBox(db.caixas[0], { tipo_box: "OPERACIONAL" });

    expect(db.caixas[0].tipo_box).toBe("OPERACIONAL");
    expect(db.lotes_estoque[0].quantidade_atual).toBe(saldoAntes);
  });

  it("editar posição não altera lote ou alocação", () => {
    const db = bancoLegado();
    atualizarComNovidades(db);
    const loteAntes = structuredClone(db.lotes_estoque);
    const alocacoesAntes = structuredClone(db.alocacoes_caixa);

    db.caixas[0] = aplicarMetadadosBox(db.caixas[0], { posicao_fisica: "TRAS" });

    expect(db.lotes_estoque).toEqual(loteAntes);
    expect(db.alocacoes_caixa).toEqual(alocacoesAntes);
  });

  it("OPERACIONAL + FRENTE não gera aviso", () => {
    expect(avisoIncompatibilidadeBox({ tipo_box: "OPERACIONAL", posicao_fisica: "FRENTE" })).toBeNull();
  });

  it("RESERVA + TRAS não gera aviso", () => {
    expect(avisoIncompatibilidadeBox({ tipo_box: "RESERVA", posicao_fisica: "TRAS" })).toBeNull();
  });

  it("QUARENTENA + ISOLADA não gera aviso", () => {
    expect(avisoIncompatibilidadeBox({ tipo_box: "QUARENTENA", posicao_fisica: "ISOLADA" })).toBeNull();
  });

  it("OPERACIONAL + TRAS gera aviso", () => {
    expect(avisoIncompatibilidadeBox({ tipo_box: "OPERACIONAL", posicao_fisica: "TRAS" })).toContain("frente");
  });

  it("RESERVA + FRENTE gera aviso", () => {
    expect(avisoIncompatibilidadeBox({ tipo_box: "RESERVA", posicao_fisica: "FRENTE" })).toContain("atrás");
  });

  it("QUARENTENA fora de ISOLADA gera aviso", () => {
    expect(avisoIncompatibilidadeBox({ tipo_box: "QUARENTENA", posicao_fisica: "OUTRA" })).toContain("isolado");
  });

  it("box não classificado não está apto para futuro fluxo operacional", () => {
    expect(boxEstaClassificado({ tipo_box: "NAO_CLASSIFICADO" })).toBe(false);
    expect(boxEstaAptoParaFluxoOperacionalFuturo({ tipo_box: "NAO_CLASSIFICADO" })).toBe(false);
  });

  it("QR Code permanece preservado", () => {
    const db = bancoLegado();
    atualizarComNovidades(db);

    db.caixas[0] = aplicarMetadadosBox(db.caixas[0], {
      tipo_box: "RESERVA",
      posicao_fisica: "TRAS",
    });

    expect(db.caixas[0].qr_code).toBe("CXCHEF-001");
  });

  it("nenhuma devolução operacional para reserva foi implementada", () => {
    expect(SUPORTA_TRANSFERENCIAS_ENTRE_BOXES).toBe(false);
  });


  it("permite atualizar local_id como metadado fisico sem alterar saldo, lote, numero ou QR", () => {
    const db = bancoLegado();
    atualizarComNovidades(db);
    const loteAntes = structuredClone(db.lotes_estoque);
    const alocacoesAntes = structuredClone(db.alocacoes_caixa);

    db.caixas[0] = aplicarMetadadosBox(db.caixas[0], { local_id: "loc-2" });

    expect(db.caixas[0].local_id).toBe("loc-2");
    expect(db.caixas[0].numero).toBe(1);
    expect(db.caixas[0].qr_code).toBe("CXCHEF-001");
    expect(db.lotes_estoque).toEqual(loteAntes);
    expect(db.alocacoes_caixa).toEqual(alocacoesAntes);
  });

  it("nova destinacao operacional exige local fisico definido", () => {
    const db = bancoLegado();
    atualizarComNovidades(db);
    db.produtos.push({ id: "prod-2", nome: "File mignon", unidade_uso_id: "un-kg", fator_conversao: 1, estoque_minimo: 0, ativo: true } as DB["produtos"][number]);
    db.caixas.push({
      id: "cx-op-vazio",
      numero: 13,
      qr_code: "CXCHEF-013",
      tipo_box: "OPERACIONAL",
      posicao_fisica: "FRENTE",
      status: "vazia",
      quantidade: 0,
      atualizado_em: "2026-08-06T10:00:00.000Z",
    });

    expect(() =>
      ativarDestinacaoOperacional(db, {
        boxId: "cx-op-vazio",
        produtoId: "prod-2",
        usuarioId: "perfil-1",
      })
    ).toThrow("Local físico não definido");

    const caixa = db.caixas.find((item) => item.id === "cx-op-vazio")!;
    caixa.local_id = "loc-1";
    ativarDestinacaoOperacional(db, { boxId: "cx-op-vazio", produtoId: "prod-2", usuarioId: "perfil-1" });
    expect(caixa.produto_operacional_alvo_id).toBe("prod-2");
    expect(caixa.numero).toBe(13);
    expect(caixa.qr_code).toBe("CXCHEF-013");
  });});
