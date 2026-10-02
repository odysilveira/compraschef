import { describe, expect, it } from "vitest";
import type { Boleto, DB, NotaFiscal } from "../types";
import { seedDB } from "../data/seed";
import {
  criarCobrancaPixSemNota,
  ehCobrancaSemNota,
  listarCobrancasSemNota,
  marcarBoletoComoJaPago,
  statusDocumentoFiscalEfetivo,
  sugerirVinculosNfseParaPagamentos,
  vincularNotaAoPagamento,
} from "./pagamento-documento-fiscal";
import { avaliarElegibilidadePagamentoBoleto, montarEstadoAgendaPagamentoBoleto } from "./pagar-boleto";

function dbBase(): DB {
  const db = structuredClone(seedDB) as DB;
  db.boletos = [];
  db.boleto_pagamentos_historico = [];
  return db;
}

function notaNfse(overrides: Partial<NotaFiscal> = {}): NotaFiscal {
  return {
    id: "nfse-1",
    fornecedor_id: "forn-1",
    numero: "9001",
    chave_acesso: "NFS123",
    tipo: "nfse",
    cnpj_emitente: "12345678000190",
    valor_total: 89.9,
    emitida_em: "2026-08-20",
    importada_em: "2026-08-20T12:00:00.000Z",
    status: "conferida",
    ...overrides,
  };
}

describe("status documento fiscal do pagamento", () => {
  it("PIX sem nota fica aguardando NFS-e", () => {
    const boleto: Boleto = {
      id: "pix-1",
      valor: 89.9,
      vencimento: "2026-08-25",
      status: "liberado",
      meio_pagamento_esperado: "pix",
      status_documento_fiscal: "aguardando_nfse",
      linha_digitavel: "00020126PIXCOPIACOLA",
    };
    expect(statusDocumentoFiscalEfetivo(boleto)).toBe("aguardando_nfse");
    expect(ehCobrancaSemNota(boleto)).toBe(true);
  });

  it("boleto com nota_id é vinculado", () => {
    const boleto: Boleto = {
      id: "bol-1",
      nota_id: "nf-1",
      valor: 100,
      vencimento: "2026-08-25",
      status: "liberado",
    };
    expect(statusDocumentoFiscalEfetivo(boleto)).toBe("vinculado");
  });
});

describe("elegibilidade PIX sem NFS-e", () => {
  it("permite pagar PIX liberado sem documento de boleto", () => {
    const boleto: Boleto = {
      id: "pix-1",
      valor: 89.9,
      vencimento: "2026-08-25",
      status: "liberado",
      meio_pagamento_esperado: "pix",
      status_documento_fiscal: "aguardando_nfse",
      status_conferencia: "conferido",
      linha_digitavel: "00020126PIXCOPIACOLAEXEMPLO",
    };
    const eleg = avaliarElegibilidadePagamentoBoleto(boleto);
    expect(eleg.permitido).toBe(true);

    const estado = montarEstadoAgendaPagamentoBoleto(boleto);
    expect(estado.podeInformarPagamento).toBe(true);
    expect(estado.podeCopiarLinha).toBe(true);
  });

  it("bloqueia PIX sem código", () => {
    const boleto: Boleto = {
      id: "pix-2",
      valor: 50,
      vencimento: "2026-08-25",
      status: "liberado",
      meio_pagamento_esperado: "pix",
      status_documento_fiscal: "aguardando_nfse",
      linha_digitavel: "",
    };
    expect(avaliarElegibilidadePagamentoBoleto(boleto).permitido).toBe(false);
  });
});

describe("vínculo tardio NFS-e", () => {
  it("cria cobrança sem nota e lista na fila", () => {
    const db = dbBase();
    criarCobrancaPixSemNota(db, {
      id: "pix-1",
      valor: 89.9,
      vencimento: "2026-08-25",
      codigoPix: "00020126PIX",
      fornecedor_id: "forn-1",
      cnpj_beneficiario: "12.345.678/0001-90",
    });
    expect(listarCobrancasSemNota(db)).toHaveLength(1);
  });

  it("sugere e vincula NFS-e ao PIX já registrado", () => {
    const db = dbBase();
    criarCobrancaPixSemNota(db, {
      id: "pix-1",
      valor: 89.9,
      vencimento: "2026-08-22",
      codigoPix: "00020126PIX",
      fornecedor_id: "forn-1",
      cnpj_beneficiario: "12345678000190",
    });
    const nota = notaNfse();
    db.notas_fiscais.push(nota);

    const sugestoes = sugerirVinculosNfseParaPagamentos(db, nota);
    expect(sugestoes.length).toBeGreaterThan(0);
    expect(sugestoes[0].boleto.id).toBe("pix-1");

    const vinculo = vincularNotaAoPagamento(db, "pix-1", nota.id);
    expect(vinculo.sucesso).toBe(true);
    expect(db.boletos[0].nota_id).toBe(nota.id);
    expect(db.boletos[0].status_documento_fiscal).toBe("vinculado");
    expect(listarCobrancasSemNota(db)).toHaveLength(0);
  });

  it("marca boleto como já pago na conferência", () => {
    const db = dbBase();
    db.boletos.push({
      id: "bol-1",
      nota_id: "nf-1",
      valor: 100,
      vencimento: "2026-09-01",
      status: "liberado",
      status_conferencia: "aguardando_documento",
    });
    const r = marcarBoletoComoJaPago(db, "bol-1", { dataPagamento: "2026-08-20" });
    expect(r.sucesso).toBe(true);
    expect(db.boletos[0].status).toBe("pago");
    expect(db.boletos[0].status_conferencia).toBe("conferido");
    expect(db.boletos[0].pagamento_data).toBe("2026-08-20");
  });
});
