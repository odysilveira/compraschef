import { describe, expect, it } from "vitest";
import type { Boleto, DB, DocumentoBoleto, NotaFiscal } from "../types";
import { seedDB } from "../data/seed";
import {
  aplicarLinhaDigitavelDocumento,
  confirmarPareamentoNotaBoletos,
  descartarDocumentoBoletoPendente,
  nomeArquivoPareceChaveNfe,
  sugerirDocumentosParaNota,
  validarPareamentoNotaBoletos,
} from "./pareamento-nfe-boleto";
import { validarChaveAcessoNfe } from "./boleto-nfe-confronto";
import { listarBoletosSemNfConferida, listarNotasComBoletoPendente } from "./conferencia-nfe-boleto";

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

function parcelaBase(overrides: Partial<Boleto> = {}): Boleto {
  return {
    id: "bol-parc-1",
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
    nome_arquivo: "boleto-a.pdf",
    tipo_arquivo: "application/pdf",
    tamanho_bytes: 1024,
    hash_sha256: "hash-a",
    criado_em: "2026-08-20T10:00:00.000Z",
    criado_por: "teste",
    resultado_confronto: "sem_correspondencia",
    // valor 100,00 embutido no final; fator aproximado
    codigo_canonico: "34191750000001000001234567890123456789012345",
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

describe("pareamento NF × boletos", () => {
  it("exige justificativa quando soma diverge do valor da nota", () => {
    const db = dbTeste({
      boletos: [parcelaBase({ valor: 100 }), parcelaBase({ id: "bol-parc-2", valor: 100, numero_parcela: "002" })],
      documentos_boleto: [
        documentoBase({
          id: "doc-1",
          codigo_canonico: "34191750000000500001234567890123456789012345", // 50,00
        }),
      ],
    });

    const validacao = validarPareamentoNotaBoletos(db, {
      notaId: "nf-1",
      documentoIds: ["doc-1"],
    });
    expect(validacao.exigeJustificativa).toBe(true);
    expect(validacao.ok).toBe(false);
  });

  it("pareia 1 nota com 2 boletos e remove das filas pendentes", () => {
    const db = dbTeste({
      boletos: [
        parcelaBase({ id: "bol-1", valor: 100, vencimento: "2026-09-01" }),
        parcelaBase({ id: "bol-2", valor: 100, vencimento: "2026-10-01", numero_parcela: "002" }),
      ],
      documentos_boleto: [
        documentoBase({
          id: "doc-1",
          hash_sha256: "h1",
          codigo_canonico: "34191750000001000001234567890123456789012345",
        }),
        documentoBase({
          id: "doc-2",
          nome_arquivo: "boleto-b.pdf",
          hash_sha256: "h2",
          codigo_canonico: "34191750000001000009876543210987654321098765",
        }),
      ],
    });

    // Força valores lidos via boletos órfãos ligados aos docs (evita depender do fator do código)
    db.boletos.push(
      {
        id: "orf-1",
        valor: 100,
        vencimento: "2026-09-01",
        status: "liberado",
        status_conferencia: "em_analise",
        documento_boleto_id: "doc-1",
      },
      {
        id: "orf-2",
        valor: 100,
        vencimento: "2026-10-01",
        status: "liberado",
        status_conferencia: "em_analise",
        documento_boleto_id: "doc-2",
      }
    );
    db.documentos_boleto[0].boleto_id = "orf-1";
    db.documentos_boleto[1].boleto_id = "orf-2";

    const resultado = confirmarPareamentoNotaBoletos(
      db,
      { notaId: "nf-1", documentoIds: ["doc-1", "doc-2"], responsavel: "Marina" },
      { agora: "2026-08-26T12:00:00.000Z" }
    );

    expect(resultado.sucesso).toBe(true);
    expect(resultado.boletosVinculados).toHaveLength(2);
    expect(listarNotasComBoletoPendente(db)).toHaveLength(0);
    expect(listarBoletosSemNfConferida(db)).toHaveLength(0);

    const parcelas = db.boletos.filter((b) => b.nota_id === "nf-1" && b.status_conferencia === "conferido");
    expect(parcelas.length).toBeGreaterThanOrEqual(2);
    expect(parcelas.every((b) => b.status === "liberado")).toBe(true);
  });

  it("sugere documentos com valor/vencimento próximos", () => {
    const db = dbTeste({
      boletos: [parcelaBase({ valor: 318.4, vencimento: "2026-09-15" })],
      documentos_boleto: [
        documentoBase({
          id: "doc-sug",
          boleto_id: "orf-sug",
        }),
      ],
    });
    db.boletos.push({
      id: "orf-sug",
      valor: 318.4,
      vencimento: "2026-09-15",
      status: "liberado",
      status_conferencia: "em_analise",
      documento_boleto_id: "doc-sug",
    });

    const sugestoes = sugerirDocumentosParaNota(db, "nf-1");
    expect(sugestoes.some((s) => s.documento.id === "doc-sug")).toBe(true);
  });

  it("não sugere boleto com mesmo valor mas vencimento distante (outra NF)", () => {
    const db = dbTeste({
      boletos: [
        parcelaBase({
          id: "bol-ago",
          valor: 318.4,
          vencimento: "2026-08-10",
          status_conferencia: "aguardando_documento",
        }),
        {
          id: "bol-out",
          valor: 318.4,
          vencimento: "2026-10-20",
          status: "liberado",
          status_conferencia: "em_analise",
          documento_boleto_id: "doc-out",
        },
      ],
      documentos_boleto: [
        documentoBase({
          id: "doc-out",
          nome_arquivo: "outubro.pdf",
          boleto_id: "bol-out",
          codigo_canonico: "34199753000003184011091234567890123456789012",
        }),
      ],
    });

    const sugestoes = sugerirDocumentosParaNota(db, "nf-1");
    expect(sugestoes.every((s) => s.documento.id !== "doc-out")).toBe(true);
  });

  it("pareia PDF sem leitura usando o valor da parcela da nota", () => {
    const db = dbTeste({
      notas_fiscais: [notaBase({ valor_total: 100 })],
      boletos: [parcelaBase({ valor: 100 })],
      documentos_boleto: [
        documentoBase({
          nome_arquivo: "Boleto_eGestor_9806.pdf",
          codigo_canonico: undefined,
          resultado_confronto: "sem_correspondencia",
        }),
      ],
    });

    const validacao = validarPareamentoNotaBoletos(db, {
      notaId: "nf-1",
      documentoIds: ["doc-1"],
    });
    expect(validacao.ok).toBe(true);
    expect(validacao.somaBoletos).toBe(100);
    expect(validacao.avisos.join(" ")).toMatch(/sem leitura/i);

    const resultado = confirmarPareamentoNotaBoletos(db, {
      notaId: "nf-1",
      documentoIds: ["doc-1"],
      responsavel: "Marina",
    });
    expect(resultado.sucesso).toBe(true);
    const parcela = db.boletos.find((b) => b.id === "bol-parc-1");
    expect(parcela?.status_conferencia).toBe("conferido");
    expect(parcela?.documento_boleto_id).toBe("doc-1");
  });

  it("grava linha digitável colada no PDF que não foi lido", () => {
    const db = dbTeste({
      documentos_boleto: [
        documentoBase({
          codigo_canonico: undefined,
          resultado_confronto: "sem_correspondencia",
        }),
      ],
    });
    const resultado = aplicarLinhaDigitavelDocumento(
      db,
      "doc-1",
      "34191.23454 67890.123457 67890.123457 1 12340000001000"
    );
    expect(resultado.ok).toBe(true);
    expect(db.documentos_boleto[0].codigo_canonico).toBeTruthy();
    expect(db.documentos_boleto[0].resultado_confronto).toBeUndefined();
  });

  it("descarta documento pendente da fila de boletos sem NF", () => {
    const db = dbTeste({
      documentos_boleto: [
        documentoBase({
          codigo_canonico: undefined,
          resultado_confronto: "sem_correspondencia",
        }),
      ],
    });
    const r = descartarDocumentoBoletoPendente(db, "doc-1");
    expect(r.ok).toBe(true);
    expect(db.documentos_boleto).toHaveLength(0);
  });

  it("detecta nome de arquivo com chave NF-e", () => {
    // chave válida gerada no próprio domínio (padrão 44 dígitos com DV)
    const base = "4126085008651300013555003000013027199886973";
    // usa validarChaveAcessoNfe para achar DV — ou testa com chave conhecida dos testes
    let chave = "";
    for (let dv = 0; dv <= 9; dv += 1) {
      const candidata = base + String(dv);
      if (validarChaveAcessoNfe(candidata)) {
        chave = candidata;
        break;
      }
    }
    expect(chave).toHaveLength(44);
    expect(nomeArquivoPareceChaveNfe(`${chave}.PDF`)).toBe(true);
    expect(nomeArquivoPareceChaveNfe("Boleto_eGestor_9806.pdf")).toBe(false);
  });
});
