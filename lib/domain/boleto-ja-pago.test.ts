import { describe, expect, it } from "vitest";
import type { Boleto, DB, DocumentoBoleto } from "../types";
import { seedDB } from "../data/seed";
import { detectarBoletoJaPago, montarMensagemBoletoJaPago } from "./pareamento-nfe-boleto";

function dbTeste(parcial: Partial<DB> = {}): DB {
  const db = structuredClone(seedDB) as DB;
  db.notas_fiscais = [];
  db.boletos = [];
  db.documentos_boleto = [];
  db.boleto_pagamentos_historico = [];
  Object.assign(db, parcial);
  return db;
}

const CODIGO =
  "34191750000001000001234567890123456789012345";

describe("detecção de boleto já pago", () => {
  it("reconhece pelo código canônico de boleto pago", () => {
    const boleto: Boleto = {
      id: "bol-pago",
      valor: 100,
      vencimento: "2026-09-01",
      status: "pago",
      linha_digitavel: CODIGO,
      pagamento_data: "2026-08-20",
      pagamento_valor: 100,
      pagamento_banco_conta: "Itaú - Operacional",
      status_conferencia: "conferido",
    };
    const db = dbTeste({ boletos: [boleto] });

    const achado = detectarBoletoJaPago(db, { linhaDigitavel: CODIGO });
    expect(achado).not.toBeNull();
    expect(achado?.boleto.id).toBe("bol-pago");
    expect(achado?.mensagem).toMatch(/já está pago/);
    expect(achado?.mensagem).toMatch(/Itaú/);
  });

  it("reconhece pelo hash do PDF vinculado", () => {
    const doc: DocumentoBoleto = {
      id: "doc-1",
      nome_arquivo: "pago.pdf",
      tipo_arquivo: "application/pdf",
      tamanho_bytes: 10,
      hash_sha256: "abc123hash",
      criado_em: "2026-08-01T00:00:00.000Z",
      criado_por: "teste",
      boleto_id: "bol-pago",
    };
    const boleto: Boleto = {
      id: "bol-pago",
      valor: 50,
      vencimento: "2026-09-01",
      status: "aguardando_conciliacao",
      documento_boleto_id: "doc-1",
      pagamento_data: "2026-08-25",
      pagamento_banco_conta: "Bradesco",
      status_conferencia: "conferido",
    };
    const db = dbTeste({ boletos: [boleto], documentos_boleto: [doc] });

    const achado = detectarBoletoJaPago(db, { hashSha256: "ABC123HASH" });
    expect(achado?.criterio).toBe("hash_documento");
    expect(achado?.mensagem).toMatch(/aguardando conciliação/);
  });

  it("não alerta boleto ainda não pago", () => {
    const db = dbTeste({
      boletos: [
        {
          id: "bol-livre",
          valor: 100,
          vencimento: "2026-09-01",
          status: "liberado",
          linha_digitavel: CODIGO,
          status_conferencia: "conferido",
        },
      ],
    });
    expect(detectarBoletoJaPago(db, { linhaDigitavel: CODIGO })).toBeNull();
  });

  it("monta mensagem legível", () => {
    const msg = montarMensagemBoletoJaPago({
      id: "x",
      valor: 10,
      vencimento: "2026-01-01",
      status: "pago",
      pagamento_data: "2026-08-10",
      pagamento_valor: 10,
      pagamento_banco_conta: "Nubank",
    });
    expect(msg).toContain("10/08/2026");
    expect(msg).toContain("Nubank");
  });
});
