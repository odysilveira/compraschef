import { describe, expect, it, beforeEach } from "vitest";
import type { DB, StatusContaPagar } from "../types";
import { seedDB } from "../data/seed";
import { calcularValorFinal, criarContaManual, alterarStatusConta, informarPagamento, atualizarComNovidades } from "../data/index";
import {
  contaEstaAtrasada,
  contaVenceHoje,
  contaVenceNosProximos7Dias,
  filtrarContasPagar,
  ordenarContasPagar,
} from "./financeiro";

describe("fundação financeira", () => {
  let db: DB;

  beforeEach(() => {
    db = structuredClone(seedDB) as DB;
  });

  it("inicializa DB antigo sem coleções financeiras", () => {
    const antigo = structuredClone(db) as DB & {
      contas_pagar?: unknown;
      conta_pagar_historico?: unknown;
      boleto_pagamentos_historico?: unknown;
    };
    delete (antigo as any).contas_pagar;
    delete (antigo as any).conta_pagar_historico;
    delete (antigo as any).boleto_pagamentos_historico;

    const mudou = atualizarComNovidades(antigo as DB);

    expect(mudou).toBe(true);
    expect(Array.isArray((antigo as DB).contas_pagar)).toBe(true);
    expect(Array.isArray((antigo as DB).conta_pagar_historico)).toBe(true);
    expect(Array.isArray((antigo as DB).boleto_pagamentos_historico)).toBe(true);
    expect((antigo as DB).contas_pagar).toEqual([]);
    expect((antigo as DB).conta_pagar_historico).toEqual([]);
    expect((antigo as DB).boleto_pagamentos_historico).toEqual([]);
  });

  it("preserva bancos antigos com contas a pagar existentes", () => {
    db.contas_pagar.push({
      id: "cp-1",
      fornecedor_id: "forn-hortifruti",
      descricao: "Conta histórica",
      origem: "manual",
      documento_id: "DOC-1",
      categoria: "Compras",
      data_emissao: "2026-07-01",
      data_vencimento: "2026-07-10",
      valor_original: 100,
      juros: 5,
      desconto: 2,
      valor_final: 103,
      observacoes: "Teste preservação",
      status: "aguardando_boleto",
      criado_em: "2026-07-01T12:00:00.000Z",
      atualizado_em: "2026-07-01T12:00:00.000Z",
    });

    const antigo = structuredClone(db) as DB;
    const mudou = atualizarComNovidades(antigo);

    expect(mudou).toBe(true); // migrações podem rodar, mas não apagar o registro
    expect(antigo.contas_pagar).toHaveLength(1);
    expect(antigo.contas_pagar[0].descricao).toBe("Conta histórica");
  });

  it("cria conta manual e registra histórico", () => {
    const conta = criarContaManual(db, {
      fornecedor_id: "forn-hortifruti",
      descricao: "Conta manual",
      origem: "manual",
      documento_id: "DOC-2",
      categoria: "Compras",
      centro_custo: "C01",
      data_emissao: "2026-07-15",
      data_vencimento: "2026-07-22",
      valor_original: 200,
      juros: 10,
      desconto: 5,
      observacoes: "Criada para teste",
      status: "aguardando_boleto",
    });

    expect(conta.id).toMatch(/^cp-/);
    expect(conta.valor_final).toBe(205);
    expect(conta.criado_em).toBeTruthy();
    expect(conta.atualizado_em).toBeTruthy();
    expect(db.contas_pagar).toContainEqual(conta);
    expect(db.conta_pagar_historico).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conta_pagar_id: conta.id,
          acao: "Conta criada manualmente",
          status_anterior: null,
          status_novo: "aguardando_boleto",
          responsavel: "usuário local",
        }),
      ])
    );
  });

  it("calcula valor final com juros e desconto", () => {
    expect(calcularValorFinal(100, 12.5, 7.5)).toBe(105);
    expect(calcularValorFinal(50, 0, 5)).toBe(45);
    expect(calcularValorFinal(50, 2.25, 0)).toBe(52.25);
  });

  it("altera status e registra histórico", () => {
    const conta = criarContaManual(db, {
      descricao: "Conta para status",
      origem: "manual",
      categoria: "Compras",
      data_emissao: "2026-07-15",
      data_vencimento: "2026-07-22",
      valor_original: 100,
      status: "aguardando_boleto",
    });

    const resultado = alterarStatusConta(db, conta.id, "compativel", "Confirmação manual");

    expect(resultado).toBeDefined();
    expect(resultado?.status).toBe("compativel");
    expect(resultado?.observacoes).toContain("Confirmação manual");
    expect(db.conta_pagar_historico).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conta_pagar_id: conta.id,
          status_anterior: "aguardando_boleto",
          status_novo: "compativel",
          responsavel: "usuário local",
          observacao: "Confirmação manual",
        }),
      ])
    );
  });

  it("usa usuário local como responsável padrão quando nenhum responsável é informado", () => {
    const conta = criarContaManual(db, {
      descricao: "Conta sem responsável",
      origem: "manual",
      categoria: "Compras",
      data_emissao: "2026-07-15",
      data_vencimento: "2026-07-22",
      valor_original: 150,
      status: "boleto_recebido",
    });

    alterarStatusConta(db, conta.id, "compativel", "Mudança de status sem responsável explícito");
    informarPagamento(db, conta.id, "Pagamento informado sem responsável explícito");

    expect(db.conta_pagar_historico).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conta_pagar_id: conta.id,
          status_novo: "compativel",
          responsavel: "usuário local",
        }),
        expect.objectContaining({
          conta_pagar_id: conta.id,
          status_novo: "aguardando_conciliacao",
          responsavel: "usuário local",
        }),
      ])
    );
  });

  it("informar pagamento leva para aguardando_conciliacao e registra histórico", () => {
    const conta = criarContaManual(db, {
      descricao: "Conta para pagamento",
      origem: "manual",
      categoria: "Compras",
      data_emissao: "2026-07-15",
      data_vencimento: "2026-07-22",
      valor_original: 100,
      status: "boleto_recebido",
    });

    const resultado = informarPagamento(db, conta.id, "Pagamento relatado no financeiro");

    expect(resultado).toBeDefined();
    expect(resultado?.status).toBe("aguardando_conciliacao");
    expect(db.conta_pagar_historico).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          conta_pagar_id: conta.id,
          status_anterior: "boleto_recebido",
          status_novo: "aguardando_conciliacao",
          responsavel: "usuário local",
          observacao: "Pagamento relatado no financeiro",
        }),
      ])
    );
  });
});

describe("helpers de contas a pagar na tela", () => {
  function contaBase(overrides: Partial<DB["contas_pagar"][number]> = {}): DB["contas_pagar"][number] {
    return {
      id: overrides.id ?? "cp-base",
      fornecedor_id: overrides.fornecedor_id,
      descricao: overrides.descricao ?? "Conta base",
      origem: overrides.origem ?? "manual",
      documento_id: overrides.documento_id,
      categoria: overrides.categoria ?? "Compras",
      centro_custo: overrides.centro_custo,
      data_emissao: overrides.data_emissao ?? "2026-07-20",
      data_vencimento: overrides.data_vencimento ?? "2026-07-24",
      valor_original: overrides.valor_original ?? 100,
      juros: overrides.juros,
      desconto: overrides.desconto,
      valor_final: overrides.valor_final ?? 100,
      observacoes: overrides.observacoes,
      status: overrides.status ?? "aguardando_boleto",
      criado_em: overrides.criado_em ?? "2026-07-20T12:00:00.000Z",
      atualizado_em: overrides.atualizado_em ?? "2026-07-20T12:00:00.000Z",
    };
  }

  it("identifica contas atrasadas", () => {
    expect(contaEstaAtrasada(contaBase({ data_vencimento: "2026-07-23" }), "2026-07-24")).toBe(true);
    expect(contaEstaAtrasada(contaBase({ data_vencimento: "2026-07-24" }), "2026-07-24")).toBe(false);
  });

  it("identifica contas vencendo hoje", () => {
    expect(contaVenceHoje(contaBase({ data_vencimento: "2026-07-24" }), "2026-07-24")).toBe(true);
    expect(contaVenceHoje(contaBase({ data_vencimento: "2026-07-25" }), "2026-07-24")).toBe(false);
  });

  it("identifica contas vencendo nos próximos 7 dias", () => {
    expect(contaVenceNosProximos7Dias(contaBase({ data_vencimento: "2026-07-25" }), "2026-07-24")).toBe(true);
    expect(contaVenceNosProximos7Dias(contaBase({ data_vencimento: "2026-07-31" }), "2026-07-24")).toBe(true);
    expect(contaVenceNosProximos7Dias(contaBase({ data_vencimento: "2026-07-24" }), "2026-07-24")).toBe(false);
    expect(contaVenceNosProximos7Dias(contaBase({ data_vencimento: "2026-08-01" }), "2026-07-24")).toBe(false);
  });

  it("ordena primeiro atrasadas e depois pelo vencimento mais próximo", () => {
    const contas = [
      contaBase({ id: "cp-3", data_vencimento: "2026-07-29" }),
      contaBase({ id: "cp-1", data_vencimento: "2026-07-22" }),
      contaBase({ id: "cp-4", data_vencimento: "2026-07-24" }),
      contaBase({ id: "cp-2", data_vencimento: "2026-07-23" }),
    ];

    expect(ordenarContasPagar(contas, "2026-07-24").map((conta) => conta.id)).toEqual(["cp-1", "cp-2", "cp-4", "cp-3"]);
  });

  it("filtra contas por texto e status", () => {
    const contas = [
      contaBase({ id: "cp-1", fornecedor_id: "forn-a", descricao: "Compra de queijo", documento_id: "NF-100", status: "boleto_recebido" }),
      contaBase({ id: "cp-2", fornecedor_id: "forn-b", descricao: "Aluguel", documento_id: "DOC-200", status: "aguardando_boleto" }),
      contaBase({ id: "cp-3", fornecedor_id: "forn-a", descricao: "Compra de tomate", documento_id: "NF-300", status: "boleto_recebido" }),
    ];

    const filtradas = filtrarContasPagar(
      contas,
      {
        texto: "fornecedor a",
        status: "boleto_recebido",
        vencimento: "todas",
        fornecedorPorId: { "forn-a": "Fornecedor A", "forn-b": "Fornecedor B" },
      },
      "2026-07-24"
    );

    expect(filtradas.map((conta) => conta.id)).toEqual(["cp-1", "cp-3"]);
  });
});
