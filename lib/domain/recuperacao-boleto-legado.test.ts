import { describe, expect, it } from "vitest";
import { seedDB } from "../data/seed";
import type { Boleto, DB, DocumentoBoleto } from "../types";
import { recuperarVinculoBoletoLegado, recuperarVinculosLegadosBoletos } from "./recuperacao-boleto-legado";
import { montarEstadoAgendaPagamentoBoleto } from "./pagar-boleto";

const CODIGO_44 = "34191123400000010001234567890123456789012345";
const LINHA_47 = "34191.23454 67890.123457 67890.123457 1 12340000001000";

function boletoBase(overrides: Partial<Boleto> = {}): Boleto {
  return {
    id: "bol-1",
    nota_id: "nf-1",
    numero_parcela: "001",
    valor: 762.4,
    vencimento: "2026-08-20",
    linha_digitavel: LINHA_47,
    status: "liberado",
    status_conferencia: "conferido",
    conferido_em: "2026-07-24T10:00:00.000Z",
    conferido_por: "Operador",
    ...overrides,
  };
}

function documentoBase(overrides: Partial<DocumentoBoleto> = {}): DocumentoBoleto {
  return {
    id: "doc-1",
    nome_arquivo: "boleto.pdf",
    tipo_arquivo: "application/pdf",
    tamanho_bytes: 123,
    hash_sha256: "hash-1",
    codigo_canonico: CODIGO_44,
    nota_id: "nf-1",
    boleto_id: "bol-1",
    resultado_confronto: "exata",
    confirmado_em: "2026-07-24T10:00:00.000Z",
    confirmado_por: "Operador",
    criado_em: "2026-07-24T10:00:00.000Z",
    criado_por: "Operador",
    ...overrides,
  };
}

function dbBase(): DB {
  const db = structuredClone(seedDB) as DB;
  db.notas_fiscais = [
    {
      id: "nf-1",
      fornecedor_id: "forn-hortifruti",
      numero: "14197",
      chave_acesso: "35260712345678000123550010000012341000012340",
      cnpj_emitente: "12345678000190",
      valor_total: 762.4,
      emitida_em: "2026-07-24",
      importada_em: "2026-07-24T10:00:00.000Z",
      status: "conferida",
      origem: "manual",
      correcoes_fornecedor: [],
    },
  ];
  db.boletos = [boletoBase()];
  db.documentos_boleto = [];
  db.contas_pagar = [];
  return db;
}

describe("recuperação de vínculo legado de boleto", () => {
  it("recupera vínculo único de documento legado", () => {
    const db = dbBase();
    db.documentos_boleto.push(documentoBase({ boleto_id: "bol-1" }));
    db.boletos[0].documento_boleto_id = undefined;

    const resultado = recuperarVinculoBoletoLegado(db, db.boletos[0]);

    expect(resultado.alterou).toBe(true);
    expect(db.boletos[0].documento_boleto_id).toBe("doc-1");
  });

  it("não recupera quando há múltiplos candidatos", () => {
    const db = dbBase();
    db.documentos_boleto.push(documentoBase({ id: "doc-a", hash_sha256: "ha" }));
    db.documentos_boleto.push(documentoBase({ id: "doc-b", hash_sha256: "hb" }));

    const resultado = recuperarVinculoBoletoLegado(db, db.boletos[0]);

    expect(resultado.alterou).toBe(false);
    expect(resultado.motivo).toBe("nao_recuperado_multiplos_documentos");
    expect(db.boletos[0].documento_boleto_id).toBeUndefined();
  });

  it("não inventa código quando não existe", () => {
    const db = dbBase();
    db.boletos[0].linha_digitavel = undefined;

    const resultado = recuperarVinculoBoletoLegado(db, db.boletos[0]);

    expect(resultado.alterou).toBe(false);
    expect(resultado.motivo).toBe("nao_recuperado_sem_codigo");
    expect(db.documentos_boleto).toHaveLength(0);
  });

  it("migra código válido armazenado no boleto", () => {
    const db = dbBase();
    db.boletos[0].linha_digitavel = LINHA_47;

    const resultado = recuperarVinculoBoletoLegado(db, db.boletos[0], {
      gerarIdDocumento: () => "doc-novo",
      responsavelPadrao: "migração legado",
      agora: "2026-07-24T12:00:00.000Z",
    });

    expect(resultado.alterou).toBe(true);
    expect(db.documentos_boleto).toHaveLength(1);
    expect(db.documentos_boleto[0].id).toBe("doc-novo");
    expect(db.documentos_boleto[0].codigo_canonico).toBe(CODIGO_44);
    expect(db.boletos[0].documento_boleto_id).toBe("doc-novo");
  });

  it("rejeita código legado inválido", () => {
    const db = dbBase();
    db.boletos[0].linha_digitavel = "34191.23455 67890.123457 67890.123457 1 12340000001000";

    const resultado = recuperarVinculoBoletoLegado(db, db.boletos[0]);

    expect(resultado.alterou).toBe(false);
    expect(resultado.motivo).toBe("nao_recuperado_codigo_invalido");
    expect(db.documentos_boleto).toHaveLength(0);
  });

  it("após recuperação o boleto torna-se elegível", () => {
    const db = dbBase();
    recuperarVinculoBoletoLegado(db, db.boletos[0], { gerarIdDocumento: () => "doc-ok" });
    const documento = db.documentos_boleto.find((item) => item.id === "doc-ok");

    const estado = montarEstadoAgendaPagamentoBoleto(db.boletos[0], documento);

    expect(estado.podeExibirCodigo).toBe(true);
    expect(estado.podeInformarPagamento).toBe(true);
  });

  it("recuperação não altera NF-e, parcela, valores ou ContaPagar", () => {
    const db = dbBase();
    const snapshotNotas = structuredClone(db.notas_fiscais);
    const snapshotContas = structuredClone(db.contas_pagar);
    const snapshotValor = db.boletos[0].valor;
    const snapshotParcela = db.boletos[0].numero_parcela;

    recuperarVinculoBoletoLegado(db, db.boletos[0], { gerarIdDocumento: () => "doc-x" });

    expect(db.notas_fiscais).toEqual(snapshotNotas);
    expect(db.contas_pagar).toEqual(snapshotContas);
    expect(db.boletos[0].valor).toBe(snapshotValor);
    expect(db.boletos[0].numero_parcela).toBe(snapshotParcela);
    expect(db.boletos).toHaveLength(1);
  });

  it("migração é idempotente", () => {
    const db = dbBase();

    const primeira = recuperarVinculosLegadosBoletos(db, { gerarIdDocumento: () => "doc-idem" });
    const docsAposPrimeira = db.documentos_boleto.length;
    const vinculoAposPrimeira = db.boletos[0].documento_boleto_id;

    const segunda = recuperarVinculosLegadosBoletos(db, { gerarIdDocumento: () => "doc-idem-2" });

    expect(primeira.alteracoes).toBeGreaterThan(0);
    expect(segunda.alteracoes).toBe(0);
    expect(db.documentos_boleto).toHaveLength(docsAposPrimeira);
    expect(db.boletos[0].documento_boleto_id).toBe(vinculoAposPrimeira);
  });
});
