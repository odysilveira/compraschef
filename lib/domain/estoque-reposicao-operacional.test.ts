import { describe, expect, it } from "vitest";
import { atualizarComNovidades } from "../data";
import type { DB } from "../types";
import {
  calcularQuantidadeReposicao,
  reservasFefoDisponiveis,
  saldoDosLotes,
  transferirReservaParaOperacional,
  validarPreTransferenciaReposicaoPorQr,
  validarMotivoObrigatorio,
  type ConfirmacaoLeituraReposicao,
} from "./estoque";
import {
  ativarDestinacaoOperacional,
  encerrarDestinacaoOperacional,
  produtoOperacionalEfetivo,
} from "./estoque-boxes";
import { registrarAberturaBoxOperacional, registrarFechamentoBoxOperacional } from "./operacao-boxes";

function bancoBase(): DB {
  return {
    perfis: [
      { id: "perfil-1", nome: "Lider Cozinha", papel: "lider", ativo: true },
      { id: "perfil-2", nome: "Gerente", papel: "gerente", ativo: true },
    ],
    produtos: [
      {
        id: "prod-a",
        nome: "Tomate italiano porcionado",
        tipo: "produzido",
        unidade_uso_id: "un-sc",
        fator_conversao: 1,
        estoque_minimo: 0,
        ativo: true,
      },
      {
        id: "prod-b",
        nome: "Risoto porcionado",
        tipo: "produzido",
        unidade_uso_id: "un-sc",
        fator_conversao: 1,
        estoque_minimo: 0,
        ativo: true,
      },
    ] as DB["produtos"],
    unidades: [{ id: "un-sc", nome: "Saco", sigla: "sc" }],
    locais: [{ id: "loc-1", nome: "Freezer 1", tipo: "freezer" }],
    caixas: [
      {
        id: "cx-res-1",
        numero: 1,
        qr_code: "CXCHEF-001",
        tipo_box: "RESERVA",
        posicao_fisica: "TRAS",
        status: "cheia",
        produto_id: "prod-a",
        quantidade: 6,
        data_envase: "2026-08-03",
        validade: "2026-08-07",
        local_id: "loc-1",
        atualizado_em: "2026-08-03T10:00:00.000Z",
      },
      {
        id: "cx-res-2",
        numero: 2,
        qr_code: "CXCHEF-002",
        tipo_box: "RESERVA",
        posicao_fisica: "TRAS",
        status: "cheia",
        produto_id: "prod-a",
        quantidade: 4,
        data_envase: "2026-08-03",
        validade: "2026-08-09",
        local_id: "loc-1",
        atualizado_em: "2026-08-03T10:00:00.000Z",
      },
      {
        id: "cx-op-1",
        numero: 3,
        qr_code: "CXCHEF-003",
        tipo_box: "OPERACIONAL",
        posicao_fisica: "FRENTE",
        status: "em_uso",
        produto_id: "prod-a",
        quantidade: 2,
        data_envase: "2026-08-03",
        validade: "2026-08-07",
        local_id: "loc-1",
        atualizado_em: "2026-08-03T10:00:00.000Z",
      },
      {
        id: "cx-quar-1",
        numero: 4,
        qr_code: "CXCHEF-004",
        tipo_box: "QUARENTENA",
        posicao_fisica: "ISOLADA",
        status: "cheia",
        produto_id: "prod-a",
        quantidade: 8,
        data_envase: "2026-08-03",
        validade: "2026-08-05",
        local_id: "loc-1",
        atualizado_em: "2026-08-03T10:00:00.000Z",
      },
      {
        id: "cx-nao-class",
        numero: 5,
        qr_code: "CXCHEF-005",
        tipo_box: "NAO_CLASSIFICADO",
        posicao_fisica: "NAO_INFORMADA",
        status: "cheia",
        produto_id: "prod-a",
        quantidade: 3,
        data_envase: "2026-08-03",
        validade: "2026-08-06",
        local_id: "loc-1",
        atualizado_em: "2026-08-03T10:00:00.000Z",
      },
      {
        id: "cx-op-2",
        numero: 6,
        qr_code: "CXCHEF-006",
        tipo_box: "OPERACIONAL",
        posicao_fisica: "FRENTE",
        status: "cheia",
        produto_id: "prod-b",
        quantidade: 5,
        data_envase: "2026-08-03",
        validade: "2026-08-08",
        local_id: "loc-1",
        atualizado_em: "2026-08-03T10:00:00.000Z",
      },
    ],
    lotes_estoque: [
      {
        id: "lote-a",
        produto_id: "prod-a",
        origem: "producao",
        quantidade_inicial: 20,
        quantidade_atual: 20,
        data_entrada: "2026-08-03",
        validade: "2026-08-07",
        criado_em: "2026-08-03T10:00:00.000Z",
        atualizado_em: "2026-08-03T10:00:00.000Z",
      },
      {
        id: "lote-b",
        produto_id: "prod-a",
        origem: "producao",
        quantidade_inicial: 8,
        quantidade_atual: 8,
        data_entrada: "2026-08-04",
        validade: "2026-08-09",
        criado_em: "2026-08-04T10:00:00.000Z",
        atualizado_em: "2026-08-04T10:00:00.000Z",
      },
    ],
    alocacoes_caixa: [
      {
        id: "aloc-res-1",
        lote_id: "lote-a",
        caixa_id: "cx-res-1",
        quantidade_inicial: 6,
        quantidade_atual: 6,
        criado_em: "2026-08-03T10:00:00.000Z",
        atualizado_em: "2026-08-03T10:00:00.000Z",
      },
      {
        id: "aloc-res-2",
        lote_id: "lote-a",
        caixa_id: "cx-res-2",
        quantidade_inicial: 4,
        quantidade_atual: 4,
        criado_em: "2026-08-03T10:00:00.000Z",
        atualizado_em: "2026-08-03T10:00:00.000Z",
      },
      {
        id: "aloc-op-1",
        lote_id: "lote-a",
        caixa_id: "cx-op-1",
        quantidade_inicial: 2,
        quantidade_atual: 2,
        criado_em: "2026-08-03T10:00:00.000Z",
        atualizado_em: "2026-08-03T10:00:00.000Z",
      },
      {
        id: "aloc-quar-1",
        lote_id: "lote-b",
        caixa_id: "cx-quar-1",
        quantidade_inicial: 8,
        quantidade_atual: 8,
        criado_em: "2026-08-04T10:00:00.000Z",
        atualizado_em: "2026-08-04T10:00:00.000Z",
      },
      {
        id: "aloc-nao-class",
        lote_id: "lote-a",
        caixa_id: "cx-nao-class",
        quantidade_inicial: 3,
        quantidade_atual: 3,
        criado_em: "2026-08-03T10:00:00.000Z",
        atualizado_em: "2026-08-03T10:00:00.000Z",
      },
      {
        id: "aloc-op-2",
        lote_id: "lote-a",
        caixa_id: "cx-op-2",
        quantidade_inicial: 5,
        quantidade_atual: 5,
        criado_em: "2026-08-03T10:00:00.000Z",
        atualizado_em: "2026-08-03T10:00:00.000Z",
      },
    ],
    movimentos_estoque: [],
    categorias_produtos: [],
    produto_codigos_barras: [],
    fornecedores: [],
    fornecedor_produtos: [],
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
    balancos: [],
    balanco_itens: [],
    eventos_box_operacional: [],
    precos_historico: [],
    integracao_eventos: [],
  } as DB;
}

describe("reposicao do box operacional - fase 2", () => {
  it("mantem saldo operacional do dia anterior e calcula a reposicao sem negativo", () => {
    const db = bancoBase();
    const saldoOperacionalAnterior = db.caixas.find((caixa) => caixa.id === "cx-op-1")?.quantidade ?? 0;

    expect(saldoOperacionalAnterior).toBe(2);
    expect(calcularQuantidadeReposicao(10, saldoOperacionalAnterior)).toBe(8);
    expect(calcularQuantidadeReposicao(1, saldoOperacionalAnterior)).toBe(0);
  });

  it("repoe usando um box reserva", () => {
    const db = bancoBase();
    transferirReservaParaOperacional(db, {
      movimentoId: "mov-1",
      alocacaoDestinoId: "aloc-dest-1",
      origemQrCode: "CXCHEF-001",
      destinoQrCode: "CXCHEF-003",
      quantidade: 3,
      usuarioId: "perfil-1",
      agora: "2026-08-06T08:00:00.000Z",
    });

    expect(db.caixas.find((caixa) => caixa.id === "cx-res-1")?.quantidade).toBe(3);
    expect(db.caixas.find((caixa) => caixa.id === "cx-op-1")?.quantidade).toBe(5);
  });

  it("repor usando dois boxes reserva preserva o saldo total do lote", () => {
    const db = bancoBase();
    const saldoLoteAntes = saldoDosLotes(db, "prod-a");

    transferirReservaParaOperacional(db, {
      movimentoId: "mov-1",
      alocacaoDestinoId: "aloc-dest-1",
      origemQrCode: "CXCHEF-001",
      destinoQrCode: "CXCHEF-003",
      quantidade: 4,
      usuarioId: "perfil-1",
      agora: "2026-08-06T08:00:00.000Z",
    });

    transferirReservaParaOperacional(db, {
      movimentoId: "mov-2",
      alocacaoDestinoId: "aloc-dest-2",
      origemQrCode: "CXCHEF-002",
      destinoQrCode: "CXCHEF-003",
      quantidade: 2,
      usuarioId: "perfil-1",
      agora: "2026-08-06T08:05:00.000Z",
    });

    expect(db.caixas.find((caixa) => caixa.id === "cx-op-1")?.quantidade).toBe(8);
    expect(db.caixas.find((caixa) => caixa.id === "cx-res-1")?.quantidade).toBe(2);
    expect(db.caixas.find((caixa) => caixa.id === "cx-res-2")?.quantidade).toBe(2);
    expect(saldoDosLotes(db, "prod-a")).toBe(saldoLoteAntes);
  });

  it("sugere FEFO entre reservas e exclui quarentena", () => {
    const db = bancoBase();
    const reservas = reservasFefoDisponiveis(db, "prod-a");

    expect(reservas.map((r) => r.caixa_id)).toEqual(["cx-res-1", "cx-res-2"]);
    expect(reservas.some((r) => r.caixa_id === "cx-quar-1")).toBe(false);
  });

  it("preserva lote e validade da origem no operacional", () => {
    const db = bancoBase();
    const recibo = transferirReservaParaOperacional(db, {
      movimentoId: "mov-1",
      alocacaoDestinoId: "aloc-dest-1",
      origemQrCode: "CXCHEF-001",
      destinoQrCode: "CXCHEF-003",
      quantidade: 1,
      usuarioId: "perfil-1",
      agora: "2026-08-06T08:00:00.000Z",
    });

    const operacional = db.caixas.find((caixa) => caixa.id === "cx-op-1");
    expect(recibo.lote_id).toBe("lote-a");
    expect(operacional?.validade).toBe("2026-08-07");
  });

  it("bloqueia box quarentena na origem e no destino", () => {
    const db = bancoBase();
    expect(() =>
      transferirReservaParaOperacional(db, {
        movimentoId: "mov-1",
        alocacaoDestinoId: "aloc-dest-1",
        origemQrCode: "CXCHEF-004",
        destinoQrCode: "CXCHEF-003",
        quantidade: 1,
        usuarioId: "perfil-1",
        agora: "2026-08-06T08:00:00.000Z",
      })
    ).toThrow("origem Reserva e destino Operacional");

    expect(() =>
      transferirReservaParaOperacional(db, {
        movimentoId: "mov-2",
        alocacaoDestinoId: "aloc-dest-2",
        origemQrCode: "CXCHEF-001",
        destinoQrCode: "CXCHEF-004",
        quantidade: 1,
        usuarioId: "perfil-1",
        agora: "2026-08-06T08:00:00.000Z",
      })
    ).toThrow("origem Reserva e destino Operacional");
  });

  it("bloqueia incompatibilidade de produto/porcionamento", () => {
    const db = bancoBase();
    expect(() =>
      transferirReservaParaOperacional(db, {
        movimentoId: "mov-1",
        alocacaoDestinoId: "aloc-dest-1",
        origemQrCode: "CXCHEF-001",
        destinoQrCode: "CXCHEF-006",
        quantidade: 1,
        usuarioId: "perfil-1",
        agora: "2026-08-06T08:00:00.000Z",
      })
    ).toThrow("incompatível");
  });

  it("bloqueia saldo insuficiente", () => {
    const db = bancoBase();
    expect(() =>
      transferirReservaParaOperacional(db, {
        movimentoId: "mov-1",
        alocacaoDestinoId: "aloc-dest-1",
        origemQrCode: "CXCHEF-001",
        destinoQrCode: "CXCHEF-003",
        quantidade: 100,
        usuarioId: "perfil-1",
        agora: "2026-08-06T08:00:00.000Z",
      })
    ).toThrow("saldo disponível");
  });

  it("bloqueia quantidade zero ou negativa", () => {
    const db = bancoBase();

    expect(() =>
      transferirReservaParaOperacional(db, {
        movimentoId: "mov-1",
        alocacaoDestinoId: "aloc-dest-1",
        origemQrCode: "CXCHEF-001",
        destinoQrCode: "CXCHEF-003",
        quantidade: 0,
        usuarioId: "perfil-1",
        agora: "2026-08-06T08:00:00.000Z",
      })
    ).toThrow("maior que zero");

    expect(() =>
      transferirReservaParaOperacional(db, {
        movimentoId: "mov-2",
        alocacaoDestinoId: "aloc-dest-2",
        origemQrCode: "CXCHEF-001",
        destinoQrCode: "CXCHEF-003",
        quantidade: -1,
        usuarioId: "perfil-1",
        agora: "2026-08-06T08:00:00.000Z",
      })
    ).toThrow("maior que zero");
  });

  it("bloqueia origem igual ao destino", () => {
    const db = bancoBase();
    expect(() =>
      transferirReservaParaOperacional(db, {
        movimentoId: "mov-1",
        alocacaoDestinoId: "aloc-dest-1",
        origemQrCode: "CXCHEF-001",
        destinoQrCode: "CXCHEF-001",
        quantidade: 1,
        usuarioId: "perfil-1",
        agora: "2026-08-06T08:00:00.000Z",
      })
    ).toThrow("mesmo box");
  });

  it("nao permite transferencia operacional para reserva no fluxo normal", () => {
    const db = bancoBase();
    expect(() =>
      transferirReservaParaOperacional(db, {
        movimentoId: "mov-1",
        alocacaoDestinoId: "aloc-dest-1",
        origemQrCode: "CXCHEF-003",
        destinoQrCode: "CXCHEF-001",
        quantidade: 1,
        usuarioId: "perfil-1",
        agora: "2026-08-06T08:00:00.000Z",
      })
    ).toThrow("origem Reserva e destino Operacional");
  });

  it("gera auditoria completa do movimento", () => {
    const db = bancoBase();
    const recibo = transferirReservaParaOperacional(db, {
      movimentoId: "mov-1",
      alocacaoDestinoId: "aloc-dest-1",
      origemQrCode: "CXCHEF-001",
      destinoQrCode: "CXCHEF-003",
      quantidade: 2,
      usuarioId: "perfil-2",
      agora: "2026-08-06T08:00:00.000Z",
    });

    const movimento = db.movimentos_estoque[0];
    expect(recibo.movimento_id).toBe("mov-1");
    expect(movimento).toMatchObject({
      id: "mov-1",
      caixa_origem_id: "cx-res-1",
      caixa_destino_id: "cx-op-1",
      lote_id: "lote-a",
      validade: "2026-08-07",
      quantidade: 2,
      motivo: "REPOSICAO_OPERACIONAL",
      usuario_id: "perfil-2",
      saldo_fisico_origem_antes: 6,
      saldo_fisico_origem_depois: 4,
      saldo_fisico_destino_antes: 2,
      saldo_fisico_destino_depois: 4,
    });
  });

  it("caixas antigas seguem nao classificadas e fora da reposicao FEFO", () => {
    const db = bancoBase();
    db.caixas.push({
      id: "cx-legado",
      numero: 99,
      qr_code: "CXCHEF-099",
      status: "cheia",
      produto_id: "prod-a",
      quantidade: 1,
      data_envase: "2026-08-01",
      validade: "2026-08-04",
      local_id: "loc-1",
      atualizado_em: "2026-08-01T10:00:00.000Z",
    } as DB["caixas"][number]);

    atualizarComNovidades(db);

    const legado = db.caixas.find((caixa) => caixa.id === "cx-legado");
    const reservas = reservasFefoDisponiveis(db, "prod-a");

    expect(legado?.tipo_box).toBe("NAO_CLASSIFICADO");
    expect(legado?.posicao_fisica).toBe("NAO_INFORMADA");
    expect(reservas.some((item) => item.caixa_id === "cx-legado")).toBe(false);
  });

  it("ativa destinacao em Operacional vazio, deriva unidade do Produto e preserva QR e numero", () => {
    const db = bancoBase();
    db.caixas.push({
      id: "cx-op-vazio",
      numero: 7,
      qr_code: "CXCHEF-007",
      tipo_box: "OPERACIONAL",
      posicao_fisica: "FRENTE",
      status: "vazia",
      local_id: "loc-1",
      atualizado_em: "2026-08-06T07:00:00.000Z",
    });

    const evento = ativarDestinacaoOperacional(db, {
      boxId: "cx-op-vazio",
      produtoId: "prod-a",
      usuarioId: "perfil-1",
      motivo: "Inicio do dia",
      agora: "2026-08-06T07:30:00.000Z",
    });
    const caixa = db.caixas.find((item) => item.id === "cx-op-vazio")!;
    const unidade = db.unidades.find((item) => item.id === db.produtos.find((produto) => produto.id === caixa.produto_operacional_alvo_id)?.unidade_uso_id);

    expect(caixa.numero).toBe(7);
    expect(caixa.qr_code).toBe("CXCHEF-007");
    expect(caixa.produto_operacional_alvo_id).toBe("prod-a");
    expect(unidade?.sigla).toBe("sc");
    expect(evento.tipo).toBe("destinacao_operacional_ativada");
    expect(evento.produto_id).toBe("prod-a");
  });

  it("bloqueia destinacao em Reserva, Quarentena, com saldo e troca direta", () => {
    const db = bancoBase();
    expect(() => ativarDestinacaoOperacional(db, { boxId: "cx-res-1", produtoId: "prod-a", usuarioId: "perfil-1" })).toThrow("Operacional");
    expect(() => ativarDestinacaoOperacional(db, { boxId: "cx-quar-1", produtoId: "prod-a", usuarioId: "perfil-1" })).toThrow("Operacional");
    expect(() => ativarDestinacaoOperacional(db, { boxId: "cx-op-1", produtoId: "prod-a", usuarioId: "perfil-1" })).toThrow("vazio");

    db.caixas.push({
      id: "cx-op-vazio",
      numero: 7,
      qr_code: "CXCHEF-007",
      tipo_box: "OPERACIONAL",
      posicao_fisica: "FRENTE",
      status: "vazia",
      local_id: "loc-1",
      atualizado_em: "2026-08-06T07:00:00.000Z",
    });
    ativarDestinacaoOperacional(db, { boxId: "cx-op-vazio", produtoId: "prod-a", usuarioId: "perfil-1" });
    const saldoLoteAntes = saldoDosLotes(db, "prod-a");
    expect(() => ativarDestinacaoOperacional(db, { boxId: "cx-op-vazio", produtoId: "prod-b", usuarioId: "perfil-1" })).toThrow("destinação ativa");
  });

  it("bloqueia ativacao em Operacional com saldo zero mas alocacao ativa", () => {
    const db = bancoBase();
    db.caixas.push({
      id: "cx-op-com-alocacao",
      numero: 8,
      qr_code: "CXCHEF-008",
      tipo_box: "OPERACIONAL",
      posicao_fisica: "FRENTE",
      status: "vazia",
      local_id: "loc-1",
      atualizado_em: "2026-08-06T07:00:00.000Z",
    });
    db.alocacoes_caixa.push({
      id: "aloc-op-com-alocacao",
      lote_id: "lote-a",
      caixa_id: "cx-op-com-alocacao",
      quantidade_inicial: 1,
      quantidade_atual: 1,
      criado_em: "2026-08-06T07:00:00.000Z",
      atualizado_em: "2026-08-06T07:00:00.000Z",
    });
    const eventosAntes = db.eventos_box_operacional.length;

    expect(() =>
      ativarDestinacaoOperacional(db, {
        boxId: "cx-op-com-alocacao",
        produtoId: "prod-a",
        usuarioId: "perfil-1",
      })
    ).toThrow("alocação ativa");

    const caixa = db.caixas.find((item) => item.id === "cx-op-com-alocacao")!;
    expect(db.eventos_box_operacional).toHaveLength(eventosAntes);
    expect(db.eventos_box_operacional.some((evento) => evento.tipo === "destinacao_operacional_ativada")).toBe(false);
    expect(caixa.numero).toBe(8);
    expect(caixa.qr_code).toBe("CXCHEF-008");
    expect(caixa.produto_operacional_alvo_id).toBeUndefined();
  });

  it("encerra destinacao somente com saldo zero, sem alocacao ativa e higienizacao", () => {
    const db = bancoBase();
    db.caixas.push({
      id: "cx-op-vazio",
      numero: 7,
      qr_code: "CXCHEF-007",
      tipo_box: "OPERACIONAL",
      posicao_fisica: "FRENTE",
      status: "vazia",
      local_id: "loc-1",
      atualizado_em: "2026-08-06T07:00:00.000Z",
    });
    ativarDestinacaoOperacional(db, { boxId: "cx-op-vazio", produtoId: "prod-a", usuarioId: "perfil-1" });
    const saldoLoteAntes = saldoDosLotes(db, "prod-a");

    expect(() =>
      encerrarDestinacaoOperacional(db, { boxId: "cx-op-vazio", usuarioId: "perfil-2", higienizacaoConfirmada: false })
    ).toThrow("higienização");

    db.caixas.find((item) => item.id === "cx-op-vazio")!.quantidade = 1;
    expect(() =>
      encerrarDestinacaoOperacional(db, { boxId: "cx-op-vazio", usuarioId: "perfil-2", higienizacaoConfirmada: true })
    ).toThrow("saldo zero");

    db.caixas.find((item) => item.id === "cx-op-vazio")!.quantidade = 0;
    db.alocacoes_caixa.push({
      id: "aloc-op-vazio",
      lote_id: "lote-a",
      caixa_id: "cx-op-vazio",
      quantidade_inicial: 1,
      quantidade_atual: 1,
      criado_em: "2026-08-06T08:00:00.000Z",
      atualizado_em: "2026-08-06T08:00:00.000Z",
    });
    expect(() =>
      encerrarDestinacaoOperacional(db, { boxId: "cx-op-vazio", usuarioId: "perfil-2", higienizacaoConfirmada: true })
    ).toThrow("alocação ativa");
    db.alocacoes_caixa = db.alocacoes_caixa.filter((item) => item.id !== "aloc-op-vazio");

    const evento = encerrarDestinacaoOperacional(db, {
      boxId: "cx-op-vazio",
      usuarioId: "perfil-2",
      higienizacaoConfirmada: true,
      motivo: "Troca planejada",
      agora: "2026-08-06T09:30:00.000Z",
    });
    const caixaEncerrada = db.caixas.find((item) => item.id === "cx-op-vazio")!;

    expect(evento.tipo).toBe("destinacao_operacional_encerrada");
    expect(evento.produto_id).toBe("prod-a");
    expect(evento.usuario_id).toBe("perfil-2");
    expect(evento.encerrado_por_id).toBe("perfil-2");
    expect(evento.criado_em).toBe("2026-08-06T09:30:00.000Z");
    expect(Number.isNaN(Date.parse(evento.criado_em))).toBe(false);
    expect(evento.motivo).toBe("Troca planejada");
    expect(evento.higienizacao_confirmada).toBe(true);
    expect(caixaEncerrada.numero).toBe(7);
    expect(caixaEncerrada.qr_code).toBe("CXCHEF-007");
    expect(caixaEncerrada.produto_operacional_alvo_id).toBeUndefined();
    expect(caixaEncerrada.produto_id).toBeUndefined();
    expect(caixaEncerrada.quantidade ?? 0).toBe(0);
    expect(saldoDosLotes(db, "prod-a")).toBe(saldoLoteAntes);
  });

  it("abertura usa produto alvo com saldo zero e Operacional vazio sem alvo e bloqueado", () => {
    const db = bancoBase();
    db.caixas.push({
      id: "cx-op-vazio",
      numero: 7,
      qr_code: "CXCHEF-007",
      tipo_box: "OPERACIONAL",
      posicao_fisica: "FRENTE",
      status: "vazia",
      local_id: "loc-1",
      atualizado_em: "2026-08-06T07:00:00.000Z",
    });

    expect(() =>
      registrarAberturaBoxOperacional(db, {
        sessaoId: "sess-sem-alvo",
        usuarioId: "perfil-1",
        qrAtual: "CXCHEF-007",
        confirmacao: { sessao_id: "sess-sem-alvo", qr_confirmado: "CXCHEF-007", caixa_id: "cx-op-vazio" },
        quantidadeContada: 0,
        necessidadePrevista: 50,
      })
    ).toThrow("Sem destinação");

    ativarDestinacaoOperacional(db, { boxId: "cx-op-vazio", produtoId: "prod-a", usuarioId: "perfil-1" });
    const abertura = registrarAberturaBoxOperacional(db, {
      sessaoId: "sess-com-alvo",
      usuarioId: "perfil-1",
      qrAtual: "CXCHEF-007",
      confirmacao: { sessao_id: "sess-com-alvo", qr_confirmado: "CXCHEF-007", caixa_id: "cx-op-vazio", produto_id: "prod-a" },
      quantidadeContada: 0,
      necessidadePrevista: 50,
    });

    expect(abertura.abertura.produto_id).toBe("prod-a");
    expect(abertura.abertura.quantidade_contada).toBe(0);
    expect(abertura.reposicaoSugerida).toBe(50);
  });

  it("FEFO usa alvo, bloqueia origem incompativel e primeira transferencia cria alocacao preservando saldo total", () => {
    const db = bancoBase();
    db.caixas.push({
      id: "cx-op-vazio",
      numero: 7,
      qr_code: "CXCHEF-007",
      tipo_box: "OPERACIONAL",
      posicao_fisica: "FRENTE",
      status: "vazia",
      local_id: "loc-1",
      atualizado_em: "2026-08-06T07:00:00.000Z",
    });
    ativarDestinacaoOperacional(db, { boxId: "cx-op-vazio", produtoId: "prod-a", usuarioId: "perfil-1" });
    db.caixas.push({
      id: "cx-res-vencida",
      numero: 8,
      qr_code: "CXCHEF-008",
      tipo_box: "RESERVA",
      posicao_fisica: "TRAS",
      status: "cheia",
      produto_id: "prod-a",
      quantidade: 5,
      data_envase: "2026-08-01",
      validade: "2026-08-01",
      local_id: "loc-1",
      atualizado_em: "2026-08-01T08:00:00.000Z",
    });
    db.lotes_estoque.push({
      id: "lote-vencido",
      produto_id: "prod-a",
      origem: "producao",
      quantidade_inicial: 5,
      quantidade_atual: 5,
      data_entrada: "2026-08-01",
      validade: "2026-08-01",
      criado_em: "2026-08-01T08:00:00.000Z",
      atualizado_em: "2026-08-01T08:00:00.000Z",
    });
    db.alocacoes_caixa.push({
      id: "aloc-vencida",
      lote_id: "lote-vencido",
      caixa_id: "cx-res-vencida",
      quantidade_inicial: 5,
      quantidade_atual: 5,
      criado_em: "2026-08-01T08:00:00.000Z",
      atualizado_em: "2026-08-01T08:00:00.000Z",
    });

    const alvo = produtoOperacionalEfetivo(db.caixas.find((item) => item.id === "cx-op-vazio")!);
    expect(reservasFefoDisponiveis(db, alvo ?? "").map((item) => item.caixa_id)).toEqual(["cx-res-1", "cx-res-2"]);

    expect(() =>
      transferirReservaParaOperacional(db, {
        movimentoId: "mov-incompativel",
        alocacaoDestinoId: "aloc-incompativel",
        origemQrCode: "CXCHEF-002",
        destinoQrCode: "CXCHEF-006",
        quantidade: 1,
        usuarioId: "perfil-1",
        agora: "2026-08-06T08:00:00.000Z",
      })
    ).toThrow("incompat");

    const saldoAntes = saldoDosLotes(db, "prod-a");
    const transferencia = transferirReservaParaOperacional(db, {
      movimentoId: "mov-primeira",
      alocacaoDestinoId: "aloc-dest-primeira",
      origemQrCode: "CXCHEF-001",
      destinoQrCode: "CXCHEF-007",
      quantidade: 2,
      usuarioId: "perfil-1",
      agora: "2026-08-06T08:00:00.000Z",
    });

    const destino = db.caixas.find((item) => item.id === "cx-op-vazio")!;
    expect(db.alocacoes_caixa.some((item) => item.id === "aloc-dest-primeira" && item.caixa_id === "cx-op-vazio")).toBe(true);
    expect(destino.produto_id).toBe("prod-a");
    expect(destino.produto_operacional_alvo_id).toBe("prod-a");
    expect(destino.validade).toBe("2026-08-07");
    expect(transferencia.lote_id).toBe("lote-a");
    expect(saldoDosLotes(db, "prod-a")).toBe(saldoAntes);
  });

  it("fechamento zero mantem destinacao ativa e Operacional antigo usa produto atual como efetivo", () => {
    const db = bancoBase();
    expect(produtoOperacionalEfetivo(db.caixas.find((item) => item.id === "cx-op-1")!)).toBe("prod-a");

    db.caixas.push({
      id: "cx-op-vazio",
      numero: 7,
      qr_code: "CXCHEF-007",
      tipo_box: "OPERACIONAL",
      posicao_fisica: "FRENTE",
      status: "vazia",
      local_id: "loc-1",
      atualizado_em: "2026-08-06T07:00:00.000Z",
    });
    ativarDestinacaoOperacional(db, { boxId: "cx-op-vazio", produtoId: "prod-a", usuarioId: "perfil-1" });
    registrarFechamentoBoxOperacional(db, {
      sessaoId: "sess-fe-zero",
      usuarioId: "perfil-1",
      qrAtual: "CXCHEF-007",
      confirmacao: { sessao_id: "sess-fe-zero", qr_confirmado: "CXCHEF-007", caixa_id: "cx-op-vazio", produto_id: "prod-a" },
      quantidadeContada: 0,
    });

    expect(db.caixas.find((item) => item.id === "cx-op-vazio")?.produto_operacional_alvo_id).toBe("prod-a");
  });
});
describe("validacao de leitura por QR na reposicao", () => {
  function confirmacaoBase(
    parcial?: Partial<ConfirmacaoLeituraReposicao>
  ): ConfirmacaoLeituraReposicao {
    return {
      sessao_id: "sess-1",
      qr_confirmado: "CXCHEF-001",
      caixa_id: "cx-res-1",
      produto_id: "prod-a",
      lote_id: "lote-a",
      quantidade_confirmada: 2,
      ...parcial,
    };
  }

  function validacaoPadrao() {
    return validarPreTransferenciaReposicaoPorQr({
      sessaoLeituraAtual: "sess-1",
      qrOrigemAtual: "CXCHEF-001",
      qrOrigemConfirmado: "CXCHEF-001",
      qrDestinoAtual: "CXCHEF-003",
      qrDestinoConfirmado: "CXCHEF-003",
      origem: { id: "cx-res-1", produto_id: "prod-a" },
      destino: { id: "cx-op-1", produto_id: "prod-a" },
      produtoId: "prod-a",
      loteId: "lote-a",
      quantidade: 2,
      confirmacaoOrigem: confirmacaoBase(),
      confirmacaoDestino: confirmacaoBase({
        qr_confirmado: "CXCHEF-003",
        caixa_id: "cx-op-1",
      }),
    });
  }

  it("digitação manual não confirma", () => {
    const resultado = validarPreTransferenciaReposicaoPorQr({
      sessaoLeituraAtual: "sess-1",
      qrOrigemAtual: "CXCHEF-001",
      qrDestinoAtual: "CXCHEF-003",
      quantidade: 2,
      origem: { id: "cx-res-1", produto_id: "prod-a" },
      destino: { id: "cx-op-1", produto_id: "prod-a" },
      produtoId: "prod-a",
      loteId: "lote-a",
    });
    expect(resultado.valido).toBe(false);
  });

  it("colagem não confirma", () => {
    const resultado = validarPreTransferenciaReposicaoPorQr({
      sessaoLeituraAtual: "sess-1",
      qrOrigemAtual: "CXCHEF-001",
      qrDestinoAtual: "CXCHEF-003",
      qrOrigemConfirmado: "",
      qrDestinoConfirmado: "",
      quantidade: 2,
      origem: { id: "cx-res-1", produto_id: "prod-a" },
      destino: { id: "cx-op-1", produto_id: "prod-a" },
      produtoId: "prod-a",
      loteId: "lote-a",
    });
    expect(resultado.valido).toBe(false);
  });

  it("leitura da origem confirma somente a origem", () => {
    const resultado = validarPreTransferenciaReposicaoPorQr({
      sessaoLeituraAtual: "sess-1",
      qrOrigemAtual: "CXCHEF-001",
      qrOrigemConfirmado: "CXCHEF-001",
      qrDestinoAtual: "CXCHEF-003",
      quantidade: 2,
      origem: { id: "cx-res-1", produto_id: "prod-a" },
      destino: { id: "cx-op-1", produto_id: "prod-a" },
      produtoId: "prod-a",
      loteId: "lote-a",
      confirmacaoOrigem: confirmacaoBase(),
    });
    expect(resultado.valido).toBe(false);
  });

  it("leitura do destino confirma somente o destino", () => {
    const resultado = validarPreTransferenciaReposicaoPorQr({
      sessaoLeituraAtual: "sess-1",
      qrOrigemAtual: "CXCHEF-001",
      qrDestinoAtual: "CXCHEF-003",
      qrDestinoConfirmado: "CXCHEF-003",
      quantidade: 2,
      origem: { id: "cx-res-1", produto_id: "prod-a" },
      destino: { id: "cx-op-1", produto_id: "prod-a" },
      produtoId: "prod-a",
      loteId: "lote-a",
      confirmacaoDestino: confirmacaoBase({
        qr_confirmado: "CXCHEF-003",
        caixa_id: "cx-op-1",
      }),
    });
    expect(resultado.valido).toBe(false);
  });

  it("ambos confirmados permitem avançar", () => {
    expect(validacaoPadrao().valido).toBe(true);
  });

  it("alteração do QR invalida confirmação", () => {
    const resultado = validarPreTransferenciaReposicaoPorQr({
      sessaoLeituraAtual: "sess-1",
      qrOrigemAtual: "CXCHEF-009",
      qrOrigemConfirmado: "CXCHEF-001",
      qrDestinoAtual: "CXCHEF-003",
      qrDestinoConfirmado: "CXCHEF-003",
      origem: { id: "cx-res-1", produto_id: "prod-a" },
      destino: { id: "cx-op-1", produto_id: "prod-a" },
      produtoId: "prod-a",
      loteId: "lote-a",
      quantidade: 2,
      confirmacaoOrigem: confirmacaoBase(),
      confirmacaoDestino: confirmacaoBase({ qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1" }),
    });
    expect(resultado.valido).toBe(false);
  });

  it("alteração do box invalida confirmação", () => {
    const resultado = validarPreTransferenciaReposicaoPorQr({
      sessaoLeituraAtual: "sess-1",
      qrOrigemAtual: "CXCHEF-001",
      qrOrigemConfirmado: "CXCHEF-001",
      qrDestinoAtual: "CXCHEF-003",
      qrDestinoConfirmado: "CXCHEF-003",
      origem: { id: "cx-res-2", produto_id: "prod-a" },
      destino: { id: "cx-op-1", produto_id: "prod-a" },
      produtoId: "prod-a",
      loteId: "lote-a",
      quantidade: 2,
      confirmacaoOrigem: confirmacaoBase(),
      confirmacaoDestino: confirmacaoBase({ qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1" }),
    });
    expect(resultado.valido).toBe(false);
  });

  it("alteração de produto ou lote invalida operação", () => {
    const produtoInvalido = validarPreTransferenciaReposicaoPorQr({
      sessaoLeituraAtual: "sess-1",
      qrOrigemAtual: "CXCHEF-001",
      qrOrigemConfirmado: "CXCHEF-001",
      qrDestinoAtual: "CXCHEF-003",
      qrDestinoConfirmado: "CXCHEF-003",
      origem: { id: "cx-res-1", produto_id: "prod-a" },
      destino: { id: "cx-op-1", produto_id: "prod-a" },
      produtoId: "prod-b",
      loteId: "lote-a",
      quantidade: 2,
      confirmacaoOrigem: confirmacaoBase(),
      confirmacaoDestino: confirmacaoBase({ qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1" }),
    });
    const loteInvalido = validarPreTransferenciaReposicaoPorQr({
      sessaoLeituraAtual: "sess-1",
      qrOrigemAtual: "CXCHEF-001",
      qrOrigemConfirmado: "CXCHEF-001",
      qrDestinoAtual: "CXCHEF-003",
      qrDestinoConfirmado: "CXCHEF-003",
      origem: { id: "cx-res-1", produto_id: "prod-a" },
      destino: { id: "cx-op-1", produto_id: "prod-a" },
      produtoId: "prod-a",
      loteId: "lote-x",
      quantidade: 2,
      confirmacaoOrigem: confirmacaoBase(),
      confirmacaoDestino: confirmacaoBase({ qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1" }),
    });
    expect(produtoInvalido.valido).toBe(false);
    expect(loteInvalido.valido).toBe(false);
  });

  it("origem igual ao destino é bloqueada", () => {
    const resultado = validarPreTransferenciaReposicaoPorQr({
      sessaoLeituraAtual: "sess-1",
      qrOrigemAtual: "CXCHEF-001",
      qrOrigemConfirmado: "CXCHEF-001",
      qrDestinoAtual: "CXCHEF-001",
      qrDestinoConfirmado: "CXCHEF-001",
      origem: { id: "cx-res-1", produto_id: "prod-a" },
      destino: { id: "cx-res-1", produto_id: "prod-a" },
      produtoId: "prod-a",
      loteId: "lote-a",
      quantidade: 2,
      confirmacaoOrigem: confirmacaoBase(),
      confirmacaoDestino: confirmacaoBase({ qr_confirmado: "CXCHEF-001", caixa_id: "cx-res-1" }),
    });
    expect(resultado.valido).toBe(false);
  });

  it("nova transferência exige novas leituras", () => {
    const resultado = validarPreTransferenciaReposicaoPorQr({
      sessaoLeituraAtual: "sess-2",
      qrOrigemAtual: "CXCHEF-001",
      qrOrigemConfirmado: "CXCHEF-001",
      qrDestinoAtual: "CXCHEF-003",
      qrDestinoConfirmado: "CXCHEF-003",
      origem: { id: "cx-res-1", produto_id: "prod-a" },
      destino: { id: "cx-op-1", produto_id: "prod-a" },
      produtoId: "prod-a",
      loteId: "lote-a",
      quantidade: 2,
      confirmacaoOrigem: confirmacaoBase(),
      confirmacaoDestino: confirmacaoBase({ qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1" }),
    });
    expect(resultado.valido).toBe(false);
  });

  it("confirmação anterior não pode ser reutilizada", () => {
    const resultado = validarPreTransferenciaReposicaoPorQr({
      sessaoLeituraAtual: "sess-1",
      qrOrigemAtual: "CXCHEF-001",
      qrOrigemConfirmado: "CXCHEF-001",
      qrDestinoAtual: "CXCHEF-003",
      qrDestinoConfirmado: "CXCHEF-003",
      origem: { id: "cx-res-1", produto_id: "prod-a" },
      destino: { id: "cx-op-1", produto_id: "prod-a" },
      produtoId: "prod-a",
      loteId: "lote-a",
      quantidade: 4,
      confirmacaoOrigem: confirmacaoBase({ quantidade_confirmada: 2 }),
      confirmacaoDestino: confirmacaoBase({ qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1", quantidade_confirmada: 2 }),
    });
    expect(resultado.valido).toBe(false);
  });

  it("sugestão FEFO só preenche origem e não confirma leitura física", () => {
    const resultado = validarPreTransferenciaReposicaoPorQr({
      sessaoLeituraAtual: "sess-1",
      qrOrigemAtual: "CXCHEF-001",
      qrDestinoAtual: "CXCHEF-003",
      qrDestinoConfirmado: "CXCHEF-003",
      origem: { id: "cx-res-1", produto_id: "prod-a" },
      destino: { id: "cx-op-1", produto_id: "prod-a" },
      produtoId: "prod-a",
      loteId: "lote-a",
      quantidade: 2,
      confirmacaoDestino: confirmacaoBase({ qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1" }),
    });
    expect(resultado.valido).toBe(false);
  });

  it("motivo é opcional quando o evento não exige justificativa", () => {
    expect(validarMotivoObrigatorio({ exigeJustificativa: false }).valido).toBe(true);
  });

  it("motivo é obrigatório quando o evento exige justificativa", () => {
    const resultado = validarMotivoObrigatorio({ exigeJustificativa: true, motivo: "   " });
    expect(resultado.valido).toBe(false);
    expect(resultado.motivo).toBe("Justificativa obrigatória para este evento.");
  });

  it("motivo preenchido libera o evento que exige justificativa", () => {
    expect(validarMotivoObrigatorio({ exigeJustificativa: true, motivo: "Divergência registrada" }).valido).toBe(true);
  });
});

describe("local fisico na reposicao operacional", () => {
  it("transferencia Reserva para Operacional nao copia local da origem e preserva local do destino", () => {
    const db = bancoBase();
    db.locais.push({ id: "loc-2", nome: "Geladeira 1", tipo: "geladeira" });
    const origem = db.caixas.find((caixa) => caixa.id === "cx-res-1")!;
    const destino = db.caixas.find((caixa) => caixa.id === "cx-op-1")!;
    origem.local_id = "loc-1";
    destino.local_id = "loc-2";
    const numeroDestinoAntes = destino.numero;
    const qrDestinoAntes = destino.qr_code;

    transferirReservaParaOperacional(db, {
      movimentoId: "mov-local-1",
      alocacaoDestinoId: "aloc-local-1",
      origemQrCode: "CXCHEF-001",
      destinoQrCode: "CXCHEF-003",
      quantidade: 1,
      usuarioId: "perfil-1",
      agora: "2026-08-06T08:00:00.000Z",
    });

    expect(origem.local_id).toBe("loc-1");
    expect(destino.local_id).toBe("loc-2");
    expect(destino.numero).toBe(numeroDestinoAntes);
    expect(destino.qr_code).toBe(qrDestinoAntes);
  });

  it("bloqueia reposicao real para Operacional sem local fisico", () => {
    const db = bancoBase();
    const destino = db.caixas.find((caixa) => caixa.id === "cx-op-1")!;
    destino.local_id = undefined;

    expect(() =>
      transferirReservaParaOperacional(db, {
        movimentoId: "mov-local-2",
        alocacaoDestinoId: "aloc-local-2",
        origemQrCode: "CXCHEF-001",
        destinoQrCode: "CXCHEF-003",
        quantidade: 1,
        usuarioId: "perfil-1",
        agora: "2026-08-06T08:00:00.000Z",
      })
    ).toThrow("Local físico não definido");

    expect(destino.local_id).toBeUndefined();
  });
});

describe("local fisico ao esvaziar conteudo", () => {
  it("esvaziar Reserva por transferencia preserva local fisico do box", () => {
    const db = bancoBase();
    const origem = db.caixas.find((caixa) => caixa.id === "cx-res-2")!;
    const destino = db.caixas.find((caixa) => caixa.id === "cx-op-1")!;
    origem.local_id = "loc-1";
    destino.local_id = "loc-1";

    transferirReservaParaOperacional(db, {
      movimentoId: "mov-local-3",
      alocacaoDestinoId: "aloc-local-3",
      origemQrCode: "CXCHEF-002",
      destinoQrCode: "CXCHEF-003",
      quantidade: 4,
      usuarioId: "perfil-1",
      agora: "2026-08-06T08:00:00.000Z",
    });

    expect(origem.status).toBe("vazia");
    expect(origem.local_id).toBe("loc-1");
  });
});
