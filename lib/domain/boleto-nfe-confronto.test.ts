import { describe, expect, it } from "vitest";
import { seedDB } from "../data/seed";
import type { DB } from "../types";
import {
  confrontarBoletoComNfe,
  dataDoFatorVencimentoBoleto,
  extrairDadosEstruturadosDoBoleto,
  extrairValorDoCodigoBoleto,
  extrairVencimentoDoCodigoBoleto,
  validarChaveAcessoNfe,
} from "./boleto-nfe-confronto";

const CODIGO_BARRAS_44 = "34191123400000010001234567890123456789012345";
const LINHA_BANCARIA_47 = "34191.23454 67890.123457 67890.123457 1 12340000001000";
const LINHA_ADG_613 = "34191090080144719315000034870006115310000061334";

function gerarChaveNfeValida(base43: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i -= 1) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  return `${base43}${dv >= 10 ? 0 : dv}`;
}

const CHAVE_NFE_VALIDA = gerarChaveNfeValida("3526071234567800012355001000001234100001234");

function dbConfrontoBase(): DB {
  const db = structuredClone(seedDB) as DB;
  db.documentos_boleto = [];
  db.notas_fiscais = [
    {
      id: "nf-a",
      fornecedor_id: "forn-hortifruti",
      numero: "1234",
      chave_acesso: CHAVE_NFE_VALIDA,
      cnpj_emitente: "12345678000190",
      valor_total: 10,
      emitida_em: "2026-07-01",
      importada_em: "2026-07-01T10:00:00.000Z",
      status: "conferida",
      origem: "manual",
    },
  ];
  db.boletos = [
    {
      id: "bol-a-1",
      nota_id: "nf-a",
      numero_parcela: "001",
      vencimento: "2026-08-10",
      valor: 10,
      cnpj_beneficiario: "12345678000190",
      status: "liberado",
    },
  ];
  return db;
}

describe("extração estruturada de boleto", () => {
  it("extrai valor correto de código 44", () => {
    expect(extrairValorDoCodigoBoleto(CODIGO_BARRAS_44)).toBe(10);
  });

  it("extrai o mesmo valor da representação 47", () => {
    expect(extrairValorDoCodigoBoleto(LINHA_BANCARIA_47)).toBe(10);
  });

  it("não extrai valor de código inválido", () => {
    expect(extrairValorDoCodigoBoleto("34191.23455 67890.123457 67890.123457 1 12340000001000")).toBeUndefined();
  });

  it("extrai vencimento rotulado", () => {
    const dados = extrairDadosEstruturadosDoBoleto(CODIGO_BARRAS_44, "Data de vencimento: 10/08/2026");
    expect(dados.vencimento_extraido).toBe("2026-08-10");
  });

  it("extrai vencimento pelo fator quando o PDF não rotula a data", () => {
    expect(dataDoFatorVencimentoBoleto(1531)).toBe("2026-08-07");
    expect(extrairVencimentoDoCodigoBoleto(LINHA_ADG_613)).toBe("2026-08-07");
    expect(extrairValorDoCodigoBoleto(LINHA_ADG_613)).toBe(613.34);

    const dados = extrairDadosEstruturadosDoBoleto(LINHA_ADG_613, "Beneficiário: 37.681.455/0001-20");
    expect(dados.vencimento_extraido).toBe("2026-08-07");
    expect(dados.valor_codificado).toBe(613.34);
    expect(dados.cnpj_beneficiario).toBe("37681455000120");
  });

  it("prioriza vencimento rotulado único sobre o fator do código", () => {
    const dados = extrairDadosEstruturadosDoBoleto(
      LINHA_ADG_613,
      "Data de vencimento: 10/08/2026\nBeneficiário: 37.681.455/0001-20"
    );
    expect(dados.vencimento_extraido).toBe("2026-08-10");
  });

  it("separa CNPJ do beneficiário e do pagador", () => {
    const dados = extrairDadosEstruturadosDoBoleto(
      CODIGO_BARRAS_44,
      "Beneficiário: 12.345.678/0001-90\nPagador: 98.765.432/0001-10"
    );

    expect(dados.cnpj_beneficiario).toBe("12345678000190");
    expect(dados.cnpj_pagador).toBe("98765432000110");
  });

  it("valida chave de acesso da NF-e", () => {
    expect(validarChaveAcessoNfe(CHAVE_NFE_VALIDA)).toBe(true);
    expect(validarChaveAcessoNfe(`${CHAVE_NFE_VALIDA.slice(0, 43)}9`)).toBe(false);
  });

  it("não confunde código do boleto com chave da NF-e", () => {
    const texto = `Linha digitável: ${LINHA_BANCARIA_47}\nChave de acesso NF-e: ${CHAVE_NFE_VALIDA}`;
    const dados = extrairDadosEstruturadosDoBoleto(LINHA_BANCARIA_47, texto);

    expect(dados.codigo_canonico).toBe(CODIGO_BARRAS_44);
    expect(dados.chave_nfe).toBe(CHAVE_NFE_VALIDA);
    expect(dados.chave_nfe).not.toBe(CODIGO_BARRAS_44);
  });

  it("extrai número da parcela rotulado", () => {
    const dados = extrairDadosEstruturadosDoBoleto(CODIGO_BARRAS_44, "Número da parcela: 001");
    expect(dados.numero_parcela).toBe("001");
  });
});

describe("confronto boleto x NF-e", () => {
  it("resultado exato por chave + parcela", () => {
    const db = dbConfrontoBase();
    const dados = {
      codigo_canonico: CODIGO_BARRAS_44,
      valor_codificado: 10,
      vencimento_extraido: "2026-08-10",
      datas_encontradas: ["2026-08-10"],
      cnpjs_encontrados: ["12345678000190"],
      cnpj_beneficiario: "12345678000190",
      chave_nfe: CHAVE_NFE_VALIDA,
      numero_parcela: "001",
      numero_nfe: "1234",
    };

    const resultado = confrontarBoletoComNfe(db, dados, "hash-exato");

    expect(resultado.classificacao).toBe("exata");
    expect(resultado.nota_id).toBe("nf-a");
    expect(resultado.parcela_id).toBe("bol-a-1");
    expect(resultado.exige_confirmacao_humana).toBe(false);
  });

  it("divergência de valor", () => {
    const db = dbConfrontoBase();
    const dados = {
      codigo_canonico: CODIGO_BARRAS_44,
      valor_codificado: 10.5,
      vencimento_extraido: "2026-08-10",
      datas_encontradas: ["2026-08-10"],
      cnpjs_encontrados: ["12345678000190"],
      cnpj_beneficiario: "12345678000190",
      chave_nfe: CHAVE_NFE_VALIDA,
      numero_parcela: "001",
    };

    const resultado = confrontarBoletoComNfe(db, dados, "hash-div-valor");

    expect(resultado.classificacao).toBe("divergente");
    expect(resultado.divergencias).toContain("Valor divergente.");
  });

  it("divergência de vencimento", () => {
    const db = dbConfrontoBase();
    const dados = {
      codigo_canonico: CODIGO_BARRAS_44,
      valor_codificado: 10,
      vencimento_extraido: "2026-08-11",
      datas_encontradas: ["2026-08-11"],
      cnpjs_encontrados: ["12345678000190"],
      cnpj_beneficiario: "12345678000190",
      chave_nfe: CHAVE_NFE_VALIDA,
      numero_parcela: "001",
    };

    const resultado = confrontarBoletoComNfe(db, dados, "hash-div-venc");

    expect(resultado.classificacao).toBe("divergente");
    expect(resultado.divergencias).toContain("Vencimento divergente.");
  });

  it("divergência de CNPJ", () => {
    const db = dbConfrontoBase();
    const dados = {
      codigo_canonico: CODIGO_BARRAS_44,
      valor_codificado: 10,
      vencimento_extraido: "2026-08-10",
      datas_encontradas: ["2026-08-10"],
      cnpjs_encontrados: ["11111111000111"],
      cnpj_beneficiario: "11111111000111",
      chave_nfe: CHAVE_NFE_VALIDA,
      numero_parcela: "001",
    };

    const resultado = confrontarBoletoComNfe(db, dados, "hash-div-cnpj");

    expect(resultado.classificacao).toBe("divergente");
    expect(resultado.divergencias).toContain("CNPJ do beneficiário divergente.");
  });

  it("resultado parcial único por CNPJ + valor + vencimento", () => {
    const db = dbConfrontoBase();
    const dados = {
      codigo_canonico: CODIGO_BARRAS_44,
      valor_codificado: 10,
      vencimento_extraido: "2026-08-10",
      datas_encontradas: ["2026-08-10"],
      cnpjs_encontrados: ["12345678000190"],
      cnpj_beneficiario: "12345678000190",
    };

    const resultado = confrontarBoletoComNfe(db, dados, "hash-parcial-cnpj");

    expect(resultado.classificacao).toBe("parcial");
    expect(resultado.parcela_id).toBe("bol-a-1");
    expect(resultado.exige_confirmacao_humana).toBe(true);
  });

  it("resultado parcial sem CNPJ", () => {
    const db = dbConfrontoBase();
    const dados = {
      codigo_canonico: CODIGO_BARRAS_44,
      valor_codificado: 10,
      vencimento_extraido: "2026-08-10",
      datas_encontradas: ["2026-08-10"],
      cnpjs_encontrados: [],
    };

    const resultado = confrontarBoletoComNfe(db, dados, "hash-parcial-sem-cnpj");

    expect(resultado.classificacao).toBe("parcial");
    expect(resultado.avisos).toContain("Beneficiário não confirmado.");
  });

  it("múltiplas possibilidades", () => {
    const db = dbConfrontoBase();
    db.notas_fiscais.push({
      id: "nf-b",
      fornecedor_id: "forn-acougue",
      numero: "987",
      chave_acesso: gerarChaveNfeValida("3526071234567800012355001000004321100005678"),
      cnpj_emitente: "98765432000110",
      valor_total: 10,
      emitida_em: "2026-07-01",
      importada_em: "2026-07-01T11:00:00.000Z",
      status: "conferida",
      origem: "manual",
    });
    db.boletos.push({
      id: "bol-b-1",
      nota_id: "nf-b",
      numero_parcela: "001",
      vencimento: "2026-08-10",
      valor: 10,
      status: "liberado",
    });

    const dados = {
      codigo_canonico: CODIGO_BARRAS_44,
      valor_codificado: 10,
      vencimento_extraido: "2026-08-10",
      datas_encontradas: ["2026-08-10"],
      cnpjs_encontrados: [],
    };

    const resultado = confrontarBoletoComNfe(db, dados, "hash-multi");

    expect(resultado.classificacao).toBe("multiplas_possibilidades");
    expect(resultado.candidatos).toHaveLength(2);
  });

  it("sem correspondência", () => {
    const db = dbConfrontoBase();
    const dados = {
      codigo_canonico: CODIGO_BARRAS_44,
      valor_codificado: 777,
      vencimento_extraido: "2026-12-31",
      datas_encontradas: ["2026-12-31"],
      cnpjs_encontrados: [],
    };

    const resultado = confrontarBoletoComNfe(db, dados, "hash-sem");

    expect(resultado.classificacao).toBe("sem_correspondencia");
  });

  it("duplicidade por hash", () => {
    const db = dbConfrontoBase();
    db.documentos_boleto.push({
      id: "doc-1",
      nome_arquivo: "a.pdf",
      tipo_arquivo: "application/pdf",
      tamanho_bytes: 100,
      hash_sha256: "hash-repetido",
      codigo_canonico: "999",
      criado_em: "2026-07-24T12:00:00.000Z",
      criado_por: "usuário local",
    });

    const dados = {
      codigo_canonico: CODIGO_BARRAS_44,
      datas_encontradas: [],
      cnpjs_encontrados: [],
    };

    const resultado = confrontarBoletoComNfe(db, dados, "hash-repetido");

    expect(resultado.classificacao).toBe("duplicada");
    expect(resultado.criterios_coincidentes).toContain("hash_sha256");
  });

  it("duplicidade por código canônico", () => {
    const db = dbConfrontoBase();
    db.documentos_boleto.push({
      id: "doc-2",
      nome_arquivo: "a.pdf",
      tipo_arquivo: "application/pdf",
      tamanho_bytes: 100,
      hash_sha256: "hash-outro",
      codigo_canonico: CODIGO_BARRAS_44,
      criado_em: "2026-07-24T12:00:00.000Z",
      criado_por: "usuário local",
    });

    const dados = {
      codigo_canonico: CODIGO_BARRAS_44,
      datas_encontradas: [],
      cnpjs_encontrados: [],
    };

    const resultado = confrontarBoletoComNfe(db, dados, "hash-novo");

    expect(resultado.classificacao).toBe("duplicada");
    expect(resultado.criterios_coincidentes).toContain("codigo_canonico");
  });

  it("fallback para parcela antiga sem número", () => {
    const db = dbConfrontoBase();
    db.boletos[0].numero_parcela = undefined;

    const dados = {
      codigo_canonico: CODIGO_BARRAS_44,
      valor_codificado: 10,
      vencimento_extraido: "2026-08-10",
      datas_encontradas: ["2026-08-10"],
      cnpjs_encontrados: ["12345678000190"],
      cnpj_beneficiario: "12345678000190",
      chave_nfe: CHAVE_NFE_VALIDA,
      numero_parcela: "001",
    };

    const resultado = confrontarBoletoComNfe(db, dados, "hash-fallback");

    expect(resultado.classificacao).toBe("exata");
    expect(resultado.parcela_id).toBe("bol-a-1");
  });

  it("confronto não altera o DB", () => {
    const db = dbConfrontoBase();
    const snapshot = structuredClone(db);

    const dados = {
      codigo_canonico: CODIGO_BARRAS_44,
      valor_codificado: 10,
      vencimento_extraido: "2026-08-10",
      datas_encontradas: ["2026-08-10"],
      cnpjs_encontrados: ["12345678000190"],
      cnpj_beneficiario: "12345678000190",
      chave_nfe: CHAVE_NFE_VALIDA,
      numero_parcela: "001",
    };

    confrontarBoletoComNfe(db, dados, "hash-imutavel");

    expect(db).toEqual(snapshot);
  });
});
