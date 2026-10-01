import { describe, expect, it } from "vitest";
import type { DB, PagamentoPessoa } from "../types";
import { seedDB } from "../data/seed";
import {
  conciliarPagamentoPessoa,
  conciliarPagamentosAguardando,
  exportarPagamentosPessoasCsv,
  informarPagamentoPessoa,
  informarPagamentosLiberados,
  liberarPagamentoPessoa,
  liberarPagamentosPrevistos,
  registrarDivergenciaPagamentoPessoa,
} from "./pagamentos-pessoas";

function dbCom(pagamento: PagamentoPessoa): DB {
  const db = structuredClone(seedDB) as DB;
  db.pagamentos_pessoas = [pagamento];
  return db;
}

function baseLiberado(overrides: Partial<PagamentoPessoa> = {}): PagamentoPessoa {
  return {
    id: "pag-x",
    pessoa_id: "pes-gerente",
    tipo: "salario",
    vencimento: "2026-08-10",
    valor: 1000,
    status: "liberado",
    criado_em: "2026-08-01T10:00:00.000Z",
    atualizado_em: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("pagamentos de pessoas", () => {
  it("libera previsto para liberado", () => {
    const db = dbCom(baseLiberado({ status: "previsto" }));
    const r = liberarPagamentoPessoa(db, "pag-x");
    expect(r.sucesso).toBe(true);
    expect(db.pagamentos_pessoas[0].status).toBe("liberado");
  });

  it("libera vários previstos em lote", () => {
    const db = structuredClone(seedDB) as DB;
    db.pagamentos_pessoas = [
      baseLiberado({ id: "p1", status: "previsto" }),
      baseLiberado({ id: "p2", status: "previsto" }),
      baseLiberado({ id: "p3", status: "liberado" }),
    ];
    const r = liberarPagamentosPrevistos(db, ["p1", "p2", "p3"]);
    expect(r.liberados).toBe(2);
    expect(db.pagamentos_pessoas.find((p) => p.id === "p1")?.status).toBe("liberado");
    expect(db.pagamentos_pessoas.find((p) => p.id === "p2")?.status).toBe("liberado");
    expect(db.pagamentos_pessoas.find((p) => p.id === "p3")?.status).toBe("liberado");
  });

  it("informar pagamento nao marca como pago", () => {
    const db = dbCom(baseLiberado());
    const r = informarPagamentoPessoa(db, "pag-x", {
      dataPagamento: "2026-08-08",
      valorPago: 1000,
      bancoConta: "PIX",
      responsavel: "Ody",
    });
    expect(r.sucesso).toBe(true);
    expect(db.pagamentos_pessoas[0].status).toBe("aguardando_conciliacao");
    expect(db.pagamentos_pessoas[0].status).not.toBe("pago");
  });

  it("informa vários liberados em lote com o valor de cada título", () => {
    const db = structuredClone(seedDB) as DB;
    db.pagamentos_pessoas = [
      baseLiberado({ id: "i1", valor: 1000 }),
      baseLiberado({ id: "i2", valor: 500 }),
      baseLiberado({ id: "i3", status: "previsto", valor: 200 }),
    ];
    const r = informarPagamentosLiberados(db, ["i1", "i2", "i3"], {
      dataPagamento: "2026-08-08",
      bancoConta: "Conta corrente",
      responsavel: "Ody",
    });
    expect(r.informados).toBe(2);
    expect(db.pagamentos_pessoas.find((p) => p.id === "i1")?.status).toBe("aguardando_conciliacao");
    expect(db.pagamentos_pessoas.find((p) => p.id === "i1")?.pagamento_valor).toBe(1000);
    expect(db.pagamentos_pessoas.find((p) => p.id === "i2")?.pagamento_valor).toBe(500);
    expect(db.pagamentos_pessoas.find((p) => p.id === "i3")?.status).toBe("previsto");
    expect(r.erros.length).toBeGreaterThan(0);
  });

  it("concilia para pago e limpa divergencia", () => {
    const db = dbCom(
      baseLiberado({
        status: "aguardando_conciliacao",
        pagamento_valor: 1000,
        pagamento_data: "2026-08-08",
        pagamento_banco_conta: "PIX",
        conciliacao_divergente: true,
        conciliacao_divergencia_motivo: "diferença",
      })
    );
    const r = conciliarPagamentoPessoa(db, "pag-x", {
      dataLiquidacao: "2026-08-09",
      responsavel: "Ody",
    });
    expect(r.sucesso).toBe(true);
    expect(db.pagamentos_pessoas[0].status).toBe("pago");
    expect(db.pagamentos_pessoas[0].conciliacao_divergente).toBe(false);
  });

  it("concilia vários aguardando em lote", () => {
    const db = structuredClone(seedDB) as DB;
    db.pagamentos_pessoas = [
      baseLiberado({
        id: "c1",
        status: "aguardando_conciliacao",
        pagamento_data: "2026-08-08",
        pagamento_valor: 1000,
      }),
      baseLiberado({
        id: "c2",
        status: "aguardando_conciliacao",
        pagamento_data: "2026-08-08",
        pagamento_valor: 500,
      }),
      baseLiberado({ id: "c3", status: "liberado" }),
    ];
    const r = conciliarPagamentosAguardando(db, ["c1", "c2", "c3"], {
      dataLiquidacao: "2026-08-09",
      responsavel: "Ody",
    });
    expect(r.conciliados).toBe(2);
    expect(db.pagamentos_pessoas.find((p) => p.id === "c1")?.status).toBe("pago");
    expect(db.pagamentos_pessoas.find((p) => p.id === "c2")?.status).toBe("pago");
    expect(db.pagamentos_pessoas.find((p) => p.id === "c3")?.status).toBe("liberado");
  });

  it("registra divergencia sem pagar", () => {
    const db = dbCom(
      baseLiberado({
        status: "aguardando_conciliacao",
        pagamento_valor: 1000,
        pagamento_data: "2026-08-08",
        pagamento_banco_conta: "PIX",
      })
    );
    const r = registrarDivergenciaPagamentoPessoa(db, "pag-x", {
      motivo: "Não apareceu no extrato",
      responsavel: "Ody",
    });
    expect(r.sucesso).toBe(true);
    expect(db.pagamentos_pessoas[0].status).toBe("aguardando_conciliacao");
    expect(db.pagamentos_pessoas[0].conciliacao_divergente).toBe(true);
  });

  it("exporta CSV dos pagamentos com BOM e status", () => {
    const csv = exportarPagamentosPessoasCsv(
      [
        baseLiberado({
          descricao: "Salário agosto",
          competencia: "2026-08",
          valor: 1500.5,
          valor_bruto: 1600,
          desconto_consumo: 99.5,
        }),
      ],
      () => "Maria Silva"
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Pessoa;Tipo;Descrição;Competência;Vencimento;Valor");
    expect(csv).toContain("Maria Silva");
    expect(csv).toContain("Salário");
    expect(csv).toContain("Liberado");
    expect(csv).toContain("1500,50");
  });
});
