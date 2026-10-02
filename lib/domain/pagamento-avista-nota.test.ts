import { describe, expect, it } from "vitest";
import type { Boleto, DB, NotaFiscal } from "../types";
import { seedDB } from "../data/seed";
import { listarNotasComBoletoPendente } from "./conferencia-nfe-boleto";
import {
  registrarPagamentoAvistaNota,
  validarDadosPagamentoAvistaNota,
} from "./pagamento-avista-nota";

function dbBase(): DB {
  const db = structuredClone(seedDB) as DB;
  db.notas_fiscais = [];
  db.boletos = [];
  db.boleto_pagamentos_historico = [];
  db.documentos_boleto = [];
  return db;
}

function notaMuffato(overrides: Partial<NotaFiscal> = {}): NotaFiscal {
  return {
    id: "nota-muffato",
    fornecedor_id: "forn-hortifruti",
    numero: "214964",
    chave_acesso: "35260712345678000123550010002149641000012340",
    tipo: "nfe",
    cnpj_emitente: "12345678000190",
    razao_social_emitente: "IRMAOS MUFFATO e CIA LTDA - MAX PIONEIROS",
    valor_total: 215.28,
    emitida_em: "2026-09-20",
    importada_em: "2026-09-20T12:00:00.000Z",
    status: "conferida",
    arquivo_pdf_nome: "danfe-muffato.pdf",
    ...overrides,
  };
}

describe("validarDadosPagamentoAvistaNota", () => {
  it("exige banco no PIX e cartão no cartão", () => {
    expect(
      validarDadosPagamentoAvistaNota({
        meio: "pix",
        dataPagamento: "2026-09-20",
        valorPago: 215.28,
      })
    ).toContain("Informe o banco/conta de onde saiu o PIX.");

    expect(
      validarDadosPagamentoAvistaNota({
        meio: "cartao",
        dataPagamento: "2026-09-20",
        valorPago: 215.28,
        bancoConta: "Itaú — conta corrente",
      })
    ).toContain("Informe qual cartão foi usado (bandeira/final).");

    expect(
      validarDadosPagamentoAvistaNota({
        meio: "dinheiro",
        dataPagamento: "2026-09-20",
        valorPago: 215.28,
      })
    ).toEqual([]);
  });
});

describe("registrarPagamentoAvistaNota", () => {
  it("cria parcela e remove nota sem parcela da conferência (PIX à vista)", () => {
    const db = dbBase();
    db.notas_fiscais = [notaMuffato()];

    expect(listarNotasComBoletoPendente(db).map((n) => n.nota.id)).toContain("nota-muffato");

    const r = registrarPagamentoAvistaNota(
      db,
      "nota-muffato",
      {
        meio: "pix",
        dataPagamento: "2026-09-20",
        valorPago: 215.28,
        bancoConta: "Itaú — conta corrente",
      },
      { agora: "2026-09-20T18:00:00.000Z", gerarIdParcela: () => "bol-avista-1" }
    );

    expect(r.sucesso).toBe(true);
    expect(r.boletos).toHaveLength(1);
    expect(r.boletos[0].status).toBe("aguardando_conciliacao");
    expect(r.boletos[0].meio_pagamento_esperado).toBe("pix");
    expect(r.boletos[0].pagamento_banco_conta).toBe("Itaú — conta corrente");
    expect(r.boletos[0].pagamento_valor).toBe(215.28);
    expect(r.boletos[0].status_conferencia).toBe("conferido");
    expect(db.boleto_pagamentos_historico).toHaveLength(1);
    expect(listarNotasComBoletoPendente(db).map((n) => n.nota.id)).not.toContain("nota-muffato");
  });

  it("dinheiro baixa direto como pago", () => {
    const db = dbBase();
    db.notas_fiscais = [notaMuffato()];

    const r = registrarPagamentoAvistaNota(db, "nota-muffato", {
      meio: "dinheiro",
      dataPagamento: "2026-09-21",
      valorPago: 215.28,
    });

    expect(r.sucesso).toBe(true);
    expect(r.boletos[0].status).toBe("pago");
    expect(r.boletos[0].pagamento_banco_conta).toBe("Dinheiro (caixa)");
  });

  it("cartão guarda banco e identificação do cartão", () => {
    const db = dbBase();
    db.notas_fiscais = [notaMuffato()];

    const r = registrarPagamentoAvistaNota(db, "nota-muffato", {
      meio: "cartao",
      dataPagamento: "2026-09-22",
      valorPago: 215.28,
      bancoConta: "Nubank — conta PJ",
      cartao: "Visa final 4412",
    });

    expect(r.sucesso).toBe(true);
    expect(r.boletos[0].meio_pagamento_esperado).toBe("cartao");
    expect(r.boletos[0].pagamento_cartao).toBe("Visa final 4412");
    expect(r.historicos[0].banco_conta).toContain("Visa final 4412");
  });

  it("aplica à vista em todas as parcelas pendentes da nota", () => {
    const db = dbBase();
    db.notas_fiscais = [notaMuffato({ id: "nota-parc", valor_total: 300 })];
    const p1: Boleto = {
      id: "bol-1",
      nota_id: "nota-parc",
      numero_parcela: "001",
      valor: 100,
      vencimento: "2026-10-01",
      status: "liberado",
      status_conferencia: "aguardando_documento",
    };
    const p2: Boleto = {
      id: "bol-2",
      nota_id: "nota-parc",
      numero_parcela: "002",
      valor: 200,
      vencimento: "2026-11-01",
      status: "liberado",
      status_conferencia: "aguardando_documento",
    };
    db.boletos = [p1, p2];

    expect(listarNotasComBoletoPendente(db)[0]?.quantidadePendentes).toBe(2);

    const r = registrarPagamentoAvistaNota(db, "nota-parc", {
      meio: "pix",
      dataPagamento: "2026-09-25",
      valorPago: 300,
      bancoConta: "Bradesco — conta corrente",
    });

    expect(r.sucesso).toBe(true);
    expect(r.boletos).toHaveLength(2);
    expect(r.boletos.map((b) => b.pagamento_valor).sort()).toEqual([100, 200]);
    expect(listarNotasComBoletoPendente(db)).toHaveLength(0);
  });
});
