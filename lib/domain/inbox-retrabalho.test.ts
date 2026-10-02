import { describe, expect, it } from "vitest";
import type { Boleto, DB, DocumentoBoleto, NotaFiscal } from "../types";
import { seedDB } from "../data/seed";
import { avaliarRetrabalhoInbox } from "./inbox-retrabalho";

const CHAVE_NFE = "3526071234567800012355001000004321100005678".padEnd(44, "0").slice(0, 44);

function dbBase(): DB {
  const db = structuredClone(seedDB) as DB;
  db.notas_fiscais = [];
  db.boletos = [];
  db.documentos_boleto = [];
  return db;
}

function nota(parcial: Partial<NotaFiscal> & { id: string }): NotaFiscal {
  return {
    id: parcial.id,
    fornecedor_id: "forn-1",
    numero: parcial.numero ?? "100",
    chave_acesso: parcial.chave_acesso ?? CHAVE_NFE,
    valor_total: 100,
    emitida_em: "2026-08-01",
    importada_em: "2026-08-01",
    status: parcial.status ?? "aguardando_conferencia",
    ...parcial,
  };
}

function boleto(parcial: Partial<Boleto> & { id: string }): Boleto {
  return {
    id: parcial.id,
    valor: 50,
    vencimento: "2026-09-01",
    status: parcial.status ?? "liberado",
    ...parcial,
  };
}

function doc(parcial: Partial<DocumentoBoleto> & { id: string }): DocumentoBoleto {
  return {
    id: parcial.id,
    nome_arquivo: "bol.pdf",
    tipo_arquivo: "application/pdf",
    tamanho_bytes: 100,
    hash_sha256: parcial.hash_sha256 ?? "abc",
    criado_em: "2026-08-01T10:00:00.000Z",
    criado_por: "teste",
    ...parcial,
  };
}

describe("avaliarRetrabalhoInbox", () => {
  it("avisa nota já conferida pela chave", () => {
    const db = dbBase();
    db.notas_fiscais = [nota({ id: "nf-1", status: "conferida", numero: "55" })];
    const aviso = avaliarRetrabalhoInbox(db, { tipo: "xml_nfe", chaveNfe: CHAVE_NFE });
    expect(aviso?.codigo).toBe("nota_ja_conferida");
    expect(aviso?.bloqueiaConfirmacao).toBe(true);
    expect(aviso?.mensagem).toMatch(/já conferida/i);
  });

  it("avisa nota já importada ainda aguardando", () => {
    const db = dbBase();
    db.notas_fiscais = [nota({ id: "nf-1", status: "aguardando_conferencia" })];
    const aviso = avaliarRetrabalhoInbox(db, { tipo: "pdf_danfe", chaveNfe: CHAVE_NFE });
    expect(aviso?.codigo).toBe("nota_ja_importada");
  });

  it("avisa boleto já pago pelo código", () => {
    const codigo = "34191123400000010001234567890123456789012345";
    const db = dbBase();
    db.boletos = [
      boleto({
        id: "bol-1",
        status: "pago",
        linha_digitavel: codigo,
        pagamento_data: "2026-08-10",
      }),
    ];
    const aviso = avaliarRetrabalhoInbox(db, { tipo: "pdf_boleto", codigoBoleto: codigo });
    expect(aviso?.codigo).toBe("boleto_ja_baixado");
    expect(aviso?.mensagem).toMatch(/pago|Descarte/i);
  });

  it("avisa boleto já na conferência pelo hash", () => {
    const db = dbBase();
    db.documentos_boleto = [doc({ id: "doc-1", hash_sha256: "deadbeef" })];
    const aviso = avaliarRetrabalhoInbox(db, {
      tipo: "pdf_boleto",
      hashSha256: "DEADBEEF",
    });
    expect(aviso?.codigo).toBe("boleto_ja_na_conferencia");
  });

  it("não avisa OneDrive / sem fingerprint", () => {
    const db = dbBase();
    expect(avaliarRetrabalhoInbox(db, { tipo: "foto_restaurante" })).toBeNull();
    expect(avaliarRetrabalhoInbox(db, { tipo: "xml_nfe" })).toBeNull();
    expect(avaliarRetrabalhoInbox(db, { tipo: "pdf_boleto" })).toBeNull();
  });
});
