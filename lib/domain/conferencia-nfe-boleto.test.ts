import { describe, expect, it } from "vitest";
import type { Boleto, DB, DocumentoBoleto, NotaFiscal } from "../types";
import { seedDB } from "../data/seed";
import {
  listarBoletosLoteAguardandoVinculo,
  listarDocumentosAguardandoVinculo,
  listarNotasComBoletoPendente,
  listarParcelasAguardandoDocumento,
  montarResumoFilasConferenciaNfeBoleto,
} from "./conferencia-nfe-boleto";

function notaBase(overrides: Partial<NotaFiscal> = {}): NotaFiscal {
  return {
    id: "nf-1",
    fornecedor_id: "forn-1",
    numero: "100",
    chave_acesso: "1".repeat(44),
    valor_total: 200,
    emitida_em: "2026-08-01",
    importada_em: "2026-08-01T12:00:00.000Z",
    status: "conferida",
    ...overrides,
  };
}

function boletoBase(overrides: Partial<Boleto> = {}): Boleto {
  return {
    id: "bol-1",
    nota_id: "nf-1",
    numero_parcela: "001",
    valor: 100,
    vencimento: "2026-09-01",
    status: "liberado",
    status_conferencia: "aguardando_documento",
    ...overrides,
  };
}

function documentoBase(overrides: Partial<DocumentoBoleto> = {}): DocumentoBoleto {
  return {
    id: "doc-1",
    nome_arquivo: "boleto.pdf",
    tipo_arquivo: "application/pdf",
    tamanho_bytes: 1024,
    hash_sha256: "abc",
    criado_em: "2026-08-20T10:00:00.000Z",
    criado_por: "teste",
    ...overrides,
  };
}

function dbTeste(parcial: Partial<DB> = {}): DB {
  const db = structuredClone(seedDB) as DB;
  db.notas_fiscais = [notaBase()];
  db.boletos = [];
  db.documentos_boleto = [];
  db.boleto_pagamentos_historico = [];
  Object.assign(db, parcial);
  return db;
}

describe("filas conferência NF-e × boleto", () => {
  it("lista parcela liberada sem documento conferido", () => {
    const db = dbTeste({ boletos: [boletoBase()] });
    const lista = listarParcelasAguardandoDocumento(db);
    expect(lista).toHaveLength(1);
    expect(lista[0].motivo).toBe("aguardando_documento");
    expect(lista[0].rotuloMotivo).toMatch(/PDF\/linha/);
  });

  it("ignora parcela já conferida e pagamento informado", () => {
    const db = dbTeste({
      boletos: [
        boletoBase({ id: "a", status_conferencia: "conferido", documento_boleto_id: "doc-x" }),
        boletoBase({ id: "b", status: "aguardando_conciliacao", status_conferencia: "conferido" }),
        boletoBase({ id: "c", status: "pago", status_conferencia: "conferido" }),
      ],
    });
    expect(listarParcelasAguardandoDocumento(db)).toHaveLength(0);
  });

  it("lista documento importado sem confirmação", () => {
    const db = dbTeste({
      documentos_boleto: [documentoBase({ resultado_confronto: "parcial" })],
    });
    const lista = listarDocumentosAguardandoVinculo(db);
    expect(lista).toHaveLength(1);
    expect(lista[0].motivo).toBe("sem_parcela");
  });

  it("lista documento confirmado cujo boleto ainda não está conferido", () => {
    const db = dbTeste({
      boletos: [boletoBase({ id: "bol-1", status_conferencia: "em_analise", documento_boleto_id: "doc-1" })],
      documentos_boleto: [
        documentoBase({
          boleto_id: "bol-1",
          nota_id: "nf-1",
          confirmado_em: "2026-08-20T11:00:00.000Z",
          confirmado_por: "op",
          resultado_confronto: "parcial",
        }),
      ],
    });
    const docs = listarDocumentosAguardandoVinculo(db);
    expect(docs.some((d) => d.motivo === "parcela_nao_conferida")).toBe(true);
  });

  it("agrupa notas com parcelas pendentes", () => {
    const db = dbTeste({
      boletos: [
        boletoBase({ id: "bol-1", valor: 40 }),
        boletoBase({ id: "bol-2", numero_parcela: "002", valor: 60, vencimento: "2026-09-10" }),
      ],
    });
    const notas = listarNotasComBoletoPendente(db);
    expect(notas).toHaveLength(1);
    expect(notas[0].quantidadePendentes).toBe(2);
    expect(notas[0].valorPendente).toBe(100);
  });

  it("resumo agrega as três filas", () => {
    const db = dbTeste({
      boletos: [boletoBase()],
      documentos_boleto: [documentoBase()],
    });
    const resumo = montarResumoFilasConferenciaNfeBoleto(db);
    expect(resumo.totalParcelas).toBe(1);
    expect(resumo.totalDocumentos).toBe(1);
    expect(resumo.totalNotas).toBe(1);
    expect(resumo.valorParcelasPendentes).toBe(100);
  });

  it("lista boletos abertos na fila do lote", () => {
    const lista = listarBoletosLoteAguardandoVinculo([
      {
        id: "1",
        nome: "boleto-a.pdf",
        tamanho: 10,
        tipo: "pdf_boleto",
        status: "pendente",
      },
      {
        id: "2",
        nome: "nota.xml",
        tamanho: 10,
        tipo: "xml_nfe",
        status: "pendente",
      },
      {
        id: "3",
        nome: "boleto-ok.pdf",
        tamanho: 10,
        tipo: "pdf_boleto",
        status: "concluido",
      },
    ]);
    expect(lista.map((i) => i.id)).toEqual(["1"]);
  });
});
