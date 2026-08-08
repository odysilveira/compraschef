import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDB, substituirDB } from "../data";
import type { DB } from "../types";
import {
  eventosOperacaoBoxOrdenados,
  filtrarEventosOperacaoBox,
  registrarAberturaBoxOperacional,
  registrarFechamentoBoxOperacional,
  registrarEventoReposicaoOperacional,
  ultimoFechamentoDoBox,
} from "./operacao-boxes";
import { calcularQuantidadeReposicao, reservasFefoDisponiveis, saldoDosLotes, transferirReservaParaOperacional } from "./estoque";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-06T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

function bancoOperacao(): DB {
  return {
    perfis: [
      { id: "perfil-1", nome: "Lider", papel: "lider", ativo: true },
      { id: "perfil-2", nome: "Gerente", papel: "gerente", ativo: true },
    ],
    unidades: [{ id: "un-kg", nome: "Quilo", sigla: "kg" }],
    produtos: [
      { id: "prod-a", nome: "Tomate italiano", tipo: "produzido", unidade_uso_id: "un-kg", fator_conversao: 1, estoque_minimo: 0, ativo: true },
    ] as DB["produtos"],
    locais: [{ id: "loc-1", nome: "Freezer 1", tipo: "freezer" }],
    caixas: [
      { id: "cx-op-1", numero: 3, qr_code: "CXCHEF-003", tipo_box: "OPERACIONAL", posicao_fisica: "FRENTE", status: "em_uso", produto_id: "prod-a", quantidade: 3, data_envase: "2026-08-03", validade: "2026-08-07", local_id: "loc-1", atualizado_em: "2026-08-03T10:00:00.000Z" },
      { id: "cx-res-1", numero: 1, qr_code: "CXCHEF-001", tipo_box: "RESERVA", posicao_fisica: "TRAS", status: "cheia", produto_id: "prod-a", quantidade: 30, data_envase: "2026-08-03", validade: "2026-08-07", local_id: "loc-1", atualizado_em: "2026-08-03T10:00:00.000Z" },
      { id: "cx-res-2", numero: 2, qr_code: "CXCHEF-002", tipo_box: "RESERVA", posicao_fisica: "TRAS", status: "cheia", produto_id: "prod-a", quantidade: 30, data_envase: "2026-08-04", validade: "2026-08-09", local_id: "loc-1", atualizado_em: "2026-08-04T10:00:00.000Z" },
      { id: "cx-quar-1", numero: 4, qr_code: "CXCHEF-004", tipo_box: "QUARENTENA", posicao_fisica: "ISOLADA", status: "cheia", produto_id: "prod-a", quantidade: 10, data_envase: "2026-08-02", validade: "2026-08-05", local_id: "loc-1", atualizado_em: "2026-08-02T10:00:00.000Z" },
    ],
    lotes_estoque: [
      { id: "lote-op-1", produto_id: "prod-a", origem: "producao", quantidade_inicial: 3, quantidade_atual: 3, data_entrada: "2026-08-03", validade: "2026-08-07", criado_em: "2026-08-03T10:00:00.000Z", atualizado_em: "2026-08-03T10:00:00.000Z" },
      { id: "lote-res-1", produto_id: "prod-a", origem: "producao", quantidade_inicial: 30, quantidade_atual: 30, data_entrada: "2026-08-03", validade: "2026-08-07", criado_em: "2026-08-03T10:00:00.000Z", atualizado_em: "2026-08-03T10:00:00.000Z" },
      { id: "lote-res-2", produto_id: "prod-a", origem: "producao", quantidade_inicial: 30, quantidade_atual: 30, data_entrada: "2026-08-04", validade: "2026-08-09", criado_em: "2026-08-04T10:00:00.000Z", atualizado_em: "2026-08-04T10:00:00.000Z" },
      { id: "lote-quar-1", produto_id: "prod-a", origem: "producao", quantidade_inicial: 10, quantidade_atual: 10, data_entrada: "2026-08-02", validade: "2026-08-05", criado_em: "2026-08-02T10:00:00.000Z", atualizado_em: "2026-08-02T10:00:00.000Z" },
    ],
    alocacoes_caixa: [
      { id: "aloc-op-1", lote_id: "lote-op-1", caixa_id: "cx-op-1", quantidade_inicial: 3, quantidade_atual: 3, criado_em: "2026-08-03T10:00:00.000Z", atualizado_em: "2026-08-03T10:00:00.000Z" },
      { id: "aloc-res-1", lote_id: "lote-res-1", caixa_id: "cx-res-1", quantidade_inicial: 30, quantidade_atual: 30, criado_em: "2026-08-03T10:00:00.000Z", atualizado_em: "2026-08-03T10:00:00.000Z" },
      { id: "aloc-res-2", lote_id: "lote-res-2", caixa_id: "cx-res-2", quantidade_inicial: 30, quantidade_atual: 30, criado_em: "2026-08-04T10:00:00.000Z", atualizado_em: "2026-08-04T10:00:00.000Z" },
      { id: "aloc-quar-1", lote_id: "lote-quar-1", caixa_id: "cx-quar-1", quantidade_inicial: 10, quantidade_atual: 10, criado_em: "2026-08-02T10:00:00.000Z", atualizado_em: "2026-08-02T10:00:00.000Z" },
    ],
    listas_compras: [],
    lista_itens: [],
    cotacoes: [],
    cotacao_itens: [],
    pedidos: [],
    pedido_itens: [],
    fornecedores: [],
    produto_codigos_barras: [],
    fornecedor_produtos: [],
    categorias_produtos: [],
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

describe("operação diária dos boxes", () => {
  it("fechamento com sobra 3 registra evento e preserva reload", () => {
    const db = bancoOperacao();
    const resultado = registrarFechamentoBoxOperacional(db, {
      sessaoId: "sess-fe-1",
      usuarioId: "perfil-1",
      qrAtual: "CXCHEF-003",
      confirmacao: { sessao_id: "sess-fe-1", qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1", produto_id: "prod-a", lote_id: "lote-op-1" },
      quantidadeContada: 3,
    });

    expect(resultado.fechamento.quantidade_contada).toBe(3);
    expect(resultado.fechamento.delta).toBe(0);
    expect(db.eventos_box_operacional[0].tipo).toBe("fechamento");
    const recarregado = structuredClone(db);
    expect(ultimoFechamentoDoBox(recarregado, "cx-op-1")?.quantidade_contada).toBe(3);
  });

  it("abertura seguinte encontra 3 e sugere 47", () => {
    const db = bancoOperacao();
    registrarFechamentoBoxOperacional(db, {
      sessaoId: "sess-fe-1",
      usuarioId: "perfil-1",
      qrAtual: "CXCHEF-003",
      confirmacao: { sessao_id: "sess-fe-1", qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1", produto_id: "prod-a", lote_id: "lote-op-1" },
      quantidadeContada: 3,
    });

    const abertura = registrarAberturaBoxOperacional(db, {
      sessaoId: "sess-ab-1",
      usuarioId: "perfil-1",
      qrAtual: "CXCHEF-003",
      confirmacao: { sessao_id: "sess-ab-1", qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1", produto_id: "prod-a", lote_id: "lote-op-1" },
      quantidadeContada: 3,
      necessidadePrevista: 50,
    });

    expect(abertura.abertura.quantidade_esperada).toBe(3);
    expect(abertura.reposicaoSugerida).toBe(47);
  });

  it("abertura com 2 quando fechamento era 3 exige justificativa e sugere 48", () => {
    const db = bancoOperacao();
    registrarFechamentoBoxOperacional(db, {
      sessaoId: "sess-fe-1",
      usuarioId: "perfil-1",
      qrAtual: "CXCHEF-003",
      confirmacao: { sessao_id: "sess-fe-1", qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1", produto_id: "prod-a", lote_id: "lote-op-1" },
      quantidadeContada: 3,
    });

    expect(() =>
      registrarAberturaBoxOperacional(db, {
        sessaoId: "sess-ab-1",
        usuarioId: "perfil-1",
        qrAtual: "CXCHEF-003",
        confirmacao: { sessao_id: "sess-ab-1", qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1", produto_id: "prod-a", lote_id: "lote-op-1" },
        quantidadeContada: 2,
        necessidadePrevista: 50,
      })
    ).toThrow("Justificativa obrigatória");

    const abertura = registrarAberturaBoxOperacional(db, {
      sessaoId: "sess-ab-1",
      usuarioId: "perfil-1",
      qrAtual: "CXCHEF-003",
      confirmacao: { sessao_id: "sess-ab-1", qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1", produto_id: "prod-a", lote_id: "lote-op-1" },
      quantidadeContada: 2,
      necessidadePrevista: 50,
      justificativa: "Dupla contagem revisada",
    });

    expect(abertura.abertura.delta).toBe(-1);
    expect(abertura.reposicaoSugerida).toBe(48);
  });

  it("fechamento não transfere sobra para Reserva", () => {
    const db = bancoOperacao();
    registrarFechamentoBoxOperacional(db, {
      sessaoId: "sess-fe-1",
      usuarioId: "perfil-1",
      qrAtual: "CXCHEF-003",
      confirmacao: { sessao_id: "sess-fe-1", qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1", produto_id: "prod-a", lote_id: "lote-op-1" },
      quantidadeContada: 3,
    });
    expect(db.caixas.find((caixa) => caixa.id === "cx-res-1")?.quantidade).toBe(30);
    expect(db.caixas.find((caixa) => caixa.id === "cx-op-1")?.quantidade).toBe(3);
  });

  it("histórico registra abertura, reposição, fechamento e divergência com ordenação cronológica", () => {
    const db = bancoOperacao();
    registrarFechamentoBoxOperacional(db, {
      sessaoId: "sess-fe-1",
      usuarioId: "perfil-1",
      qrAtual: "CXCHEF-003",
      confirmacao: { sessao_id: "sess-fe-1", qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1", produto_id: "prod-a", lote_id: "lote-op-1" },
      quantidadeContada: 3,
    });
    registrarAberturaBoxOperacional(db, {
      sessaoId: "sess-ab-1",
      usuarioId: "perfil-1",
      qrAtual: "CXCHEF-003",
      confirmacao: { sessao_id: "sess-ab-1", qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1", produto_id: "prod-a", lote_id: "lote-op-1" },
      quantidadeContada: 3,
      necessidadePrevista: 50,
    });
    const caixaDestino = db.caixas.find((caixa) => caixa.id === "cx-op-1")!;
    caixaDestino.quantidade = 0;
    caixaDestino.produto_id = undefined;
    caixaDestino.produto_operacional_alvo_id = "prod-a";
    const alocacaoDestino = db.alocacoes_caixa.find((alocacao) => alocacao.caixa_id === "cx-op-1")!;
    alocacaoDestino.quantidade_atual = 0;
    alocacaoDestino.lote_id = "lote-res-1";
    const reposicao = transferirReservaParaOperacional(db, {
      movimentoId: "mov-1",
      alocacaoDestinoId: "aloc-dest-1",
      origemQrCode: "CXCHEF-001",
      destinoQrCode: "CXCHEF-003",
      quantidade: 20,
      usuarioId: "perfil-1",
      agora: "2026-08-04T08:00:00.000Z",
    });
    registrarEventoReposicaoOperacional(
      db,
      { sessaoId: "sess-rep-1", usuarioId: "perfil-1", origemQr: "CXCHEF-001", destinoQr: "CXCHEF-003", quantidade: 20, movimentoId: reposicao.movimento_id, alocacaoDestinoId: "aloc-hist-1" },
      {
        boxOrigemNumero: 1,
        boxDestinoNumero: 3,
        produtoId: reposicao.produto_id,
        loteId: reposicao.lote_id,
        validade: reposicao.validade,
        quantidadeAnteriorOrigem: 30,
        quantidadePosteriorOrigem: 10,
        quantidadeAnteriorDestino: 3,
        quantidadePosteriorDestino: 23,
      }
    );

    const cronologia = eventosOperacaoBoxOrdenados(db);
    expect(cronologia.map((evento) => evento.tipo)).toContain("abertura");
    expect(cronologia.map((evento) => evento.tipo)).toContain("reposicao");
    expect(cronologia.map((evento) => evento.tipo)).toContain("fechamento");
    expect(cronologia.every((evento, index, arr) => index === 0 || arr[index - 1].criado_em <= evento.criado_em)).toBe(true);
  });

  it("filtros do histórico retornam apenas o evento desejado", () => {
    const db = bancoOperacao();
    registrarFechamentoBoxOperacional(db, {
      sessaoId: "sess-fe-1",
      usuarioId: "perfil-1",
      qrAtual: "CXCHEF-003",
      confirmacao: { sessao_id: "sess-fe-1", qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1", produto_id: "prod-a", lote_id: "lote-op-1" },
      quantidadeContada: 3,
    });
    const filtrado = filtrarEventosOperacaoBox(db, { boxId: "cx-op-1", tipo: "fechamento" });
    expect(filtrado).toHaveLength(1);
    expect(filtrado[0].tipo).toBe("fechamento");
  });

  it("QR obrigatório na abertura e no fechamento", () => {
    const db = bancoOperacao();
    expect(() =>
      registrarAberturaBoxOperacional(db, {
        sessaoId: "sess-ab-1",
        usuarioId: "perfil-1",
        qrAtual: "CXCHEF-003",
        quantidadeContada: 3,
        necessidadePrevista: 50,
      })
    ).toThrow("QR obrigatório");

    expect(() =>
      registrarFechamentoBoxOperacional(db, {
        sessaoId: "sess-fe-1",
        usuarioId: "perfil-1",
        qrAtual: "CXCHEF-003",
        quantidadeContada: 3,
      })
    ).toThrow("QR obrigatório");
  });

  it("nova sessão de QR por operação invalida reutilização", () => {
    const db = bancoOperacao();
    registrarFechamentoBoxOperacional(db, {
      sessaoId: "sess-fe-1",
      usuarioId: "perfil-1",
      qrAtual: "CXCHEF-003",
      confirmacao: { sessao_id: "sess-fe-1", qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1", produto_id: "prod-a", lote_id: "lote-op-1" },
      quantidadeContada: 3,
    });
    expect(() =>
      registrarAberturaBoxOperacional(db, {
        sessaoId: "sess-ab-2",
        usuarioId: "perfil-1",
        qrAtual: "CXCHEF-003",
        confirmacao: { sessao_id: "sess-ab-1", qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1", produto_id: "prod-a", lote_id: "lote-op-1" },
        quantidadeContada: 3,
        necessidadePrevista: 50,
      })
    ).toThrow("QR obrigatório");
  });

  it("ajuste mantém saldo canônico e alocações coerentes", () => {
    const db = bancoOperacao();
    const antes = saldoDosLotes(db, "prod-a");
    registrarFechamentoBoxOperacional(db, {
      sessaoId: "sess-fe-1",
      usuarioId: "perfil-1",
      qrAtual: "CXCHEF-003",
      confirmacao: { sessao_id: "sess-fe-1", qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1", produto_id: "prod-a", lote_id: "lote-op-1" },
      quantidadeContada: 2,
      justificativa: "Contagem revisada",
    });
    expect(saldoDosLotes(db, "prod-a")).toBe(antes - 1);
    expect(db.alocacoes_caixa.find((alocacao) => alocacao.caixa_id === "cx-op-1")?.quantidade_atual).toBe(2);
  });

  it("registro de reposição preserva o saldo total do lote e exclui quarentena da FEFO", () => {
    const db = bancoOperacao();
    const caixaDestino = db.caixas.find((caixa) => caixa.id === "cx-op-1")!;
    caixaDestino.quantidade = 0;
    caixaDestino.produto_id = undefined;
    caixaDestino.produto_operacional_alvo_id = "prod-a";
    const alocacaoDestino = db.alocacoes_caixa.find((alocacao) => alocacao.caixa_id === "cx-op-1")!;
    alocacaoDestino.quantidade_atual = 0;
    alocacaoDestino.lote_id = "lote-res-1";
    const saldoAntes = saldoDosLotes(db, "prod-a");
    const reservas = reservasFefoDisponiveis(db, "prod-a");
    expect(reservas.map((reserva) => reserva.caixa_id)).toEqual(["cx-res-1", "cx-res-2"]);
    expect(reservas.some((reserva) => reserva.caixa_id === "cx-quar-1")).toBe(false);
    const transferencia = transferirReservaParaOperacional(db, {
      movimentoId: "mov-1",
      alocacaoDestinoId: "aloc-dest-1",
      origemQrCode: "CXCHEF-001",
      destinoQrCode: "CXCHEF-003",
      quantidade: 20,
      usuarioId: "perfil-1",
      agora: "2026-08-04T08:00:00.000Z",
    });
    expect(saldoDosLotes(db, "prod-a")).toBe(saldoAntes);
    expect(transferencia.saldo_origem_antes).toBe(30);
    expect(transferencia.saldo_origem_depois).toBe(10);
  });

  it("reload preserva histórico e últimos fechamentos quando o banco é reaplicado", () => {
    const db = bancoOperacao();
    registrarFechamentoBoxOperacional(db, {
      sessaoId: "sess-fe-1",
      usuarioId: "perfil-1",
      qrAtual: "CXCHEF-003",
      confirmacao: { sessao_id: "sess-fe-1", qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1", produto_id: "prod-a", lote_id: "lote-op-1" },
      quantidadeContada: 3,
    });
    const copiado = structuredClone(db);
    substituirDB(copiado);
    expect(ultimoFechamentoDoBox(copiado, "cx-op-1")?.quantidade_contada).toBe(3);
    expect(copiado.eventos_box_operacional.some((evento) => evento.tipo === "fechamento")).toBe(true);
    resetDB();
  });
});

describe("local fisico na operacao diaria", () => {
  it("bloqueia abertura e fechamento reais de Operacional sem local fisico", () => {
    const db = bancoOperacao();
    const operacional = db.caixas.find((caixa) => caixa.id === "cx-op-1")!;
    operacional.local_id = undefined;

    expect(() =>
      registrarAberturaBoxOperacional(db, {
        sessaoId: "sess-local-ab",
        usuarioId: "perfil-1",
        qrAtual: "CXCHEF-003",
        confirmacao: { sessao_id: "sess-local-ab", qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1", produto_id: "prod-a", lote_id: "lote-op-1" },
        quantidadeContada: 3,
        necessidadePrevista: 50,
      })
    ).toThrow("Local físico não definido");

    expect(() =>
      registrarFechamentoBoxOperacional(db, {
        sessaoId: "sess-local-fe",
        usuarioId: "perfil-1",
        qrAtual: "CXCHEF-003",
        confirmacao: { sessao_id: "sess-local-fe", qr_confirmado: "CXCHEF-003", caixa_id: "cx-op-1", produto_id: "prod-a", lote_id: "lote-op-1" },
        quantidadeContada: 3,
      })
    ).toThrow("Local físico não definido");

    expect(db.eventos_box_operacional).toHaveLength(0);
  });

  it("divergencias nao cria registro sem eventos reais", () => {
    const db = bancoOperacao();
    const divergencias = eventosOperacaoBoxOrdenados(db).filter((evento) => {
      if (evento.tipo === "reposicao") return false;
      return (evento.delta ?? 0) !== 0 || evento.tipo === "divergencia" || evento.status_divergencia !== undefined;
    });

    expect(divergencias).toEqual([]);
    expect(db.eventos_box_operacional).toHaveLength(0);
  });
});
