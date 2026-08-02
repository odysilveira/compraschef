import { describe, expect, it } from "vitest";
import type { DB, PagamentoPessoa } from "../types";
import { seedDB } from "../data/seed";
import {
  conciliarPagamentoPessoa,
  informarPagamentoPessoa,
  liberarPagamentoPessoa,
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
});
