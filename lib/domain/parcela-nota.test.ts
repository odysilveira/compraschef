import { describe, expect, it } from "vitest";
import { seedDB } from "../data/seed";
import type { NotaFiscal } from "../types";
import { criarParcelaAguardandoDocumento, somarDiasIso } from "./parcela-nota";

describe("parcela-nota", () => {
  it("cria parcela aguardando documento vinculada à nota", () => {
    const db = structuredClone(seedDB);
    db.boletos = [];
    const nota: NotaFiscal = {
      id: "nf-danfe-1",
      fornecedor_id: db.fornecedores[0]?.id ?? "forn-1",
      numero: "788",
      chave_acesso: "1".repeat(44),
      cnpj_emitente: "50.849.311/0001-54",
      valor_total: 318.64,
      emitida_em: "2026-08-24",
      importada_em: "2026-08-24T12:00:00.000Z",
      status: "conferida",
    };
    db.notas_fiscais = [nota];

    const boleto = criarParcelaAguardandoDocumento(db, {
      id: "bol-1",
      nota_id: "nf-danfe-1",
      valor: 318.64,
      vencimento: "2026-08-07",
      cnpj_beneficiario: "50.849.311/0001-54",
    });

    expect(boleto.status_conferencia).toBe("aguardando_documento");
    expect(boleto.status_documento_fiscal).toBe("vinculado");
    expect(db.boletos).toHaveLength(1);
    expect(db.boletos[0].valor).toBe(318.64);
  });

  it("soma dias em data ISO", () => {
    expect(somarDiasIso("2026-08-01", 6)).toBe("2026-08-07");
  });
});
