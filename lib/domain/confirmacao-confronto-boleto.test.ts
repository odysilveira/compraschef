import { describe, expect, it } from "vitest";
import type { DB } from "../types";
import { seedDB } from "../data/seed";
import { atualizarComNovidades } from "../data/index";
import { confrontarBoletoComNfe, type DadosBoletoExtraidos } from "./boleto-nfe-confronto";
import { calcularHashSHA256 } from "./documentos-boleto";
import {
  confirmarConfrontoBoleto,
  registrarEventoAnaliseConfrontoEmMemoria,
} from "./confirmacao-confronto-boleto";

const CODIGO_BARRAS_44 = "34191123400000010001234567890123456789012345";
const LINHA_BANCARIA_47 = "34191.23454 67890.123457 67890.123457 1 12340000001000";

function bytesParaArrayBuffer(bytes: number[]): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function arquivoValido() {
  const conteudo = bytesParaArrayBuffer([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
  return {
    nomeArquivo: "boleto.pdf",
    tipoArquivo: "application/pdf",
    tamanhoBytes: conteudo.byteLength,
    conteudo,
  };
}

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

function dbBase(): DB {
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
      status: "travado",
      status_conferencia: "aguardando_documento",
    },
  ];
  return db;
}

function dadosExatos(): DadosBoletoExtraidos {
  return {
    codigo_canonico: CODIGO_BARRAS_44,
    valor_codificado: 10,
    vencimento_extraido: "2026-08-10",
    datas_encontradas: ["2026-08-10"],
    cnpj_beneficiario: "12345678000190",
    cnpjs_encontrados: ["12345678000190"],
    chave_nfe: CHAVE_NFE_VALIDA,
    numero_nfe: "1234",
    numero_parcela: "001",
  };
}

describe("confirmação e persistência do confronto boleto x NF-e", () => {
  it("migração inicializa status_conferencia sem alterar boletos já ligados", () => {
    const db = structuredClone(seedDB) as DB;
    db.documentos_boleto = [];
    db.boletos = [
      {
        id: "bol-a",
        nota_id: "nf-a",
        valor: 10,
        vencimento: "2026-08-10",
        status: "travado",
      },
      {
        id: "bol-b",
        nota_id: "nf-a",
        valor: 20,
        vencimento: "2026-08-11",
        status: "liberado",
        documento_boleto_id: "doc-vinculado",
      },
    ];

    const mudou = atualizarComNovidades(db);

    expect(mudou).toBe(true);
    expect(db.boletos.find((b) => b.id === "bol-a")?.status_conferencia).toBe("aguardando_documento");
    expect(db.boletos.find((b) => b.id === "bol-b")?.status_conferencia).toBeUndefined();
  });

  it("confirma correspondência exata", async () => {
    const db = dbBase();

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dadosExatos(),
      confirmacaoHumana: true,
      responsavel: "Ana",
    });

    expect(resultado.sucesso).toBe(true);
    expect(resultado.confrontoAtual?.classificacao).toBe("exata");
  });

  it("exata registra DocumentoBoleto", async () => {
    const db = dbBase();

    await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dadosExatos(),
      confirmacaoHumana: true,
    });

    expect(db.documentos_boleto).toHaveLength(1);
    expect(db.documentos_boleto[0].codigo_canonico).toBe(CODIGO_BARRAS_44);
  });

  it("exata liga documento à NF-e e parcela", async () => {
    const db = dbBase();

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dadosExatos(),
      confirmacaoHumana: true,
    });

    expect(resultado.sucesso).toBe(true);
    expect(db.documentos_boleto[0].nota_id).toBe("nf-a");
    expect(db.documentos_boleto[0].boleto_id).toBe("bol-a-1");
    expect(db.boletos[0].documento_boleto_id).toBe(db.documentos_boleto[0].id);
  });

  it("exata coloca parcela em Boletos a vencer", async () => {
    const db = dbBase();

    await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dadosExatos(),
      confirmacaoHumana: true,
    });

    expect(db.boletos[0].status).toBe("liberado");
    expect(db.boletos[0].status_conferencia).toBe("conferido");
  });

  it("parcial sem confirmação é bloqueada", async () => {
    const db = dbBase();
    const dados: DadosBoletoExtraidos = {
      codigo_canonico: CODIGO_BARRAS_44,
      valor_codificado: 10,
      vencimento_extraido: "2026-08-10",
      datas_encontradas: ["2026-08-10"],
      cnpjs_encontrados: [],
    };

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dados,
      confirmacaoHumana: false,
    });

    expect(resultado.sucesso).toBe(false);
    expect(db.documentos_boleto).toHaveLength(0);
  });

  it("parcial sem justificativa é bloqueada", async () => {
    const db = dbBase();
    const dados: DadosBoletoExtraidos = {
      codigo_canonico: CODIGO_BARRAS_44,
      valor_codificado: 10,
      vencimento_extraido: "2026-08-10",
      datas_encontradas: ["2026-08-10"],
      cnpjs_encontrados: [],
    };

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dados,
      confirmacaoHumana: true,
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erros).toContain("Justificativa é obrigatória para confirmar resultado parcial.");
  });

  it("parcial confirmada com justificativa é gravada", async () => {
    const db = dbBase();
    const dados: DadosBoletoExtraidos = {
      codigo_canonico: CODIGO_BARRAS_44,
      valor_codificado: 10,
      vencimento_extraido: "2026-08-10",
      datas_encontradas: ["2026-08-10"],
      cnpjs_encontrados: [],
    };

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dados,
      confirmacaoHumana: true,
      justificativaConfirmacao: "Conferido manualmente com fornecedor",
      responsavel: "Carlos",
    });

    expect(resultado.sucesso).toBe(true);
    expect(db.documentos_boleto).toHaveLength(1);
    expect(db.documentos_boleto[0].resultado_confronto).toBe("parcial");
    expect(db.documentos_boleto[0].justificativa_confirmacao).toBe("Conferido manualmente com fornecedor");
  });

  it("divergente não grava", async () => {
    const db = dbBase();
    const dados = { ...dadosExatos(), valor_codificado: 99 };

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dados,
      confirmacaoHumana: true,
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.confrontoAtual?.classificacao).toBe("divergente");
    expect(db.documentos_boleto).toHaveLength(0);
  });

  it("sem correspondência não grava", async () => {
    const db = dbBase();
    const dados: DadosBoletoExtraidos = {
      codigo_canonico: CODIGO_BARRAS_44,
      valor_codificado: 77,
      vencimento_extraido: "2026-08-19",
      datas_encontradas: ["2026-08-19"],
      cnpjs_encontrados: [],
    };

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dados,
      confirmacaoHumana: true,
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.confrontoAtual?.classificacao).toBe("sem_correspondencia");
    expect(db.documentos_boleto).toHaveLength(0);
  });

  it("múltiplas possibilidades não grava", async () => {
    const db = dbBase();
    db.notas_fiscais.push({
      id: "nf-b",
      fornecedor_id: "forn-acougue",
      numero: "999",
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
      status: "travado",
    });

    const dados: DadosBoletoExtraidos = {
      codigo_canonico: CODIGO_BARRAS_44,
      valor_codificado: 10,
      vencimento_extraido: "2026-08-10",
      datas_encontradas: ["2026-08-10"],
      cnpjs_encontrados: [],
    };

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dados,
      confirmacaoHumana: true,
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.confrontoAtual?.classificacao).toBe("multiplas_possibilidades");
    expect(db.documentos_boleto).toHaveLength(0);
  });

  it("duplicada não grava", async () => {
    const db = dbBase();
    db.documentos_boleto.push({
      id: "doc-x",
      nome_arquivo: "x.pdf",
      tipo_arquivo: "application/pdf",
      tamanho_bytes: 10,
      hash_sha256: "hash-ja-usado",
      codigo_canonico: CODIGO_BARRAS_44,
      criado_em: "2026-07-24T10:00:00.000Z",
      criado_por: "usuário local",
    });

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dadosExatos(),
      confirmacaoHumana: true,
    });

    expect(resultado.sucesso).toBe(false);
    expect(db.documentos_boleto).toHaveLength(1);
  });

  it("revalidação detecta alteração do DB entre análise e confirmação", async () => {
    const db = dbBase();
    const dados = dadosExatos();
    const resultadoAntigo = confrontarBoletoComNfe(db, dados, "hash-analise-antiga");

    db.boletos[0].valor = 99;

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dados,
      resultadoConfrontoInformado: resultadoAntigo,
      confirmacaoHumana: true,
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erros).toContain("Resultado de confronto mudou desde a análise anterior. Reanalise antes de confirmar.");
    expect(db.documentos_boleto).toHaveLength(0);
  });

  it("parcela já ligada é bloqueada", async () => {
    const db = dbBase();
    db.boletos[0].documento_boleto_id = "doc-antigo";

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dadosExatos(),
      confirmacaoHumana: true,
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erros).toContain("Parcela já está ligada a outro DocumentoBoleto.");
  });

  it("falha não deixa documento órfão", async () => {
    const db = dbBase();
    const antesDocumentos = db.documentos_boleto.length;

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: {
        codigo_canonico: CODIGO_BARRAS_44,
        valor_codificado: 10,
        vencimento_extraido: "2026-08-10",
        datas_encontradas: ["2026-08-10"],
        cnpjs_encontrados: [],
      },
      confirmacaoHumana: true,
    });

    expect(resultado.sucesso).toBe(false);
    expect(db.documentos_boleto).toHaveLength(antesDocumentos);
  });

  it("falha não muda status", async () => {
    const db = dbBase();
    const statusAntes = db.boletos[0].status;

    await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: {
        ...dadosExatos(),
        valor_codificado: 999,
      },
      confirmacaoHumana: true,
    });

    expect(db.boletos[0].status).toBe(statusAntes);
  });

  it("responsável padrão usuário local", async () => {
    const db = dbBase();

    await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dadosExatos(),
      confirmacaoHumana: true,
    });

    expect(db.documentos_boleto[0].confirmado_por).toBe("usuário local");
    expect(db.boletos[0].conferido_por).toBe("usuário local");
  });

  it("confirmação não armazena File, Blob, ArrayBuffer, base64 ou texto integral do PDF", async () => {
    const db = dbBase();

    await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dadosExatos(),
      confirmacaoHumana: true,
    });

    const doc = db.documentos_boleto[0] as unknown as Record<string, unknown>;
    const texto = JSON.stringify(doc).toLowerCase();

    expect(Object.keys(doc).some((chave) => /file|blob|arraybuffer|base64|conteudo|texto/i.test(chave))).toBe(false);
    expect(texto.includes("blob")).toBe(false);
    expect(texto.includes("arraybuffer")).toBe(false);
    expect(texto.includes("base64")).toBe(false);
  });

  it("registra evento de análise em memória sem persistir documento", () => {
    const db = dbBase();
    const confronto = confrontarBoletoComNfe(db, { ...dadosExatos(), valor_codificado: 999 }, "hash-evt");

    const eventos = registrarEventoAnaliseConfrontoEmMemoria([], {
      resultadoConfronto: confronto,
      dados: dadosExatos(),
      responsavel: "Analista",
      justificativa: "Documento divergente",
      agora: "2026-07-24T12:00:00.000Z",
      gerarId: () => "evt-1",
    });

    expect(eventos).toHaveLength(1);
    expect(eventos[0].id).toBe("evt-1");
    expect(db.documentos_boleto).toHaveLength(0);
  });

  it("candidato múltiplo válido pode ser selecionado", async () => {
    const db = dbBase();
    db.notas_fiscais.push({
      id: "nf-b",
      fornecedor_id: "forn-acougue",
      numero: "999",
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
      status: "travado",
    });

    const dados: DadosBoletoExtraidos = {
      codigo_canonico: CODIGO_BARRAS_44,
      valor_codificado: 10,
      vencimento_extraido: "2026-08-10",
      datas_encontradas: ["2026-08-10"],
      cnpjs_encontrados: [],
    };

    const confronto = confrontarBoletoComNfe(db, dados, "hash-multi-ok");
    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dados,
      resultadoConfrontoInformado: confronto,
      parcelaSelecionadaId: "bol-a-1",
      justificativaConfirmacao: "Escolha manual do candidato correto",
      confirmacaoHumana: true,
    });

    expect(resultado.sucesso).toBe(true);
    expect(db.documentos_boleto).toHaveLength(1);
  });

  it("candidato fica inválido após mudança do DB", async () => {
    const db = dbBase();
    db.notas_fiscais.push({
      id: "nf-b",
      fornecedor_id: "forn-acougue",
      numero: "999",
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
      status: "travado",
    });

    const dados: DadosBoletoExtraidos = {
      codigo_canonico: CODIGO_BARRAS_44,
      valor_codificado: 10,
      vencimento_extraido: "2026-08-10",
      datas_encontradas: ["2026-08-10"],
      cnpjs_encontrados: [],
    };

    db.boletos = db.boletos.filter((boleto) => boleto.id !== "bol-a-1");

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dados,
      parcelaSelecionadaId: "bol-a-1",
      justificativaConfirmacao: "Escolha manual",
      confirmacaoHumana: true,
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erros.join(" ")).toContain("não está mais disponível");
  });

  it("confirmação atualiza a parcela existente sem criar outra", async () => {
    const db = dbBase();
    const quantidadeAntes = db.boletos.length;

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dadosExatos(),
      confirmacaoHumana: true,
    });

    expect(resultado.sucesso).toBe(true);
    expect(db.boletos).toHaveLength(quantidadeAntes);
    expect(db.boletos[0].documento_boleto_id).toBeTruthy();
  });

  it("confirmação não cria ContaPagar", async () => {
    const db = dbBase();
    const contasAntes = db.contas_pagar.length;

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dadosExatos(),
      confirmacaoHumana: true,
    });

    expect(resultado.sucesso).toBe(true);
    expect(db.contas_pagar).toHaveLength(contasAntes);
  });

  it("falha não altera localStorage/DB", async () => {
    const db = dbBase();
    const snapshot = structuredClone(db);

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: { ...dadosExatos(), valor_codificado: 999 },
      confirmacaoHumana: true,
    });

    expect(resultado.sucesso).toBe(false);
    expect(db).toEqual(snapshot);
  });

  it("duplo envio não cria duplicidade", async () => {
    const db = dbBase();

    const primeiro = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dadosExatos(),
      confirmacaoHumana: true,
    });

    const segundo = await confirmarConfrontoBoleto(db, {
      arquivo: arquivoValido(),
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dadosExatos(),
      confirmacaoHumana: true,
    });

    expect(primeiro.sucesso).toBe(true);
    expect(segundo.sucesso).toBe(false);
    expect(db.documentos_boleto).toHaveLength(1);
  });

  it("reimportação do mesmo PDF completa o vínculo sem duplicar documento", async () => {
    const db = dbBase();
    db.boletos[0].status_conferencia = "conferido";

    const arquivo = arquivoValido();
    const hash = await calcularHashSHA256(arquivo.conteudo);
    db.documentos_boleto.push({
      id: "doc-legado",
      nome_arquivo: "boleto.pdf",
      tipo_arquivo: "application/pdf",
      tamanho_bytes: arquivo.tamanhoBytes,
      hash_sha256: hash,
      codigo_canonico: CODIGO_BARRAS_44,
      nota_id: "nf-a",
      boleto_id: "bol-a-1",
      resultado_confronto: "exata",
      confirmado_em: "2026-07-24T08:00:00.000Z",
      confirmado_por: "Operador legado",
      criado_em: "2026-07-24T08:00:00.000Z",
      criado_por: "Operador legado",
    });

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo,
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dadosExatos(),
      boletoEsperadoId: "bol-a-1",
      confirmacaoHumana: true,
      responsavel: "Ana",
    });

    expect(resultado.sucesso).toBe(true);
    expect(db.documentos_boleto).toHaveLength(1);
    expect(db.boletos[0].documento_boleto_id).toBe("doc-legado");
    expect(db.boletos[0].observacao).toContain("Código recuperado por reimportação");
  });

  it("reimportação divergente é bloqueada", async () => {
    const db = dbBase();
    db.boletos[0].status_conferencia = "conferido";

    db.notas_fiscais.push({
      id: "nf-b",
      fornecedor_id: "forn-acougue",
      numero: "999",
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
      status_conferencia: "conferido",
    });

    const arquivo = arquivoValido();
    const hash = await calcularHashSHA256(arquivo.conteudo);
    db.documentos_boleto.push({
      id: "doc-outra",
      nome_arquivo: "outra.pdf",
      tipo_arquivo: "application/pdf",
      tamanho_bytes: arquivo.tamanhoBytes,
      hash_sha256: hash,
      codigo_canonico: CODIGO_BARRAS_44,
      nota_id: "nf-b",
      boleto_id: "bol-b-1",
      resultado_confronto: "exata",
      confirmado_em: "2026-07-24T08:00:00.000Z",
      confirmado_por: "Operador legado",
      criado_em: "2026-07-24T08:00:00.000Z",
      criado_por: "Operador legado",
    });

    const resultado = await confirmarConfrontoBoleto(db, {
      arquivo,
      linhaInformada: LINHA_BANCARIA_47,
      dadosExtraidos: dadosExatos(),
      boletoEsperadoId: "bol-a-1",
      confirmacaoHumana: true,
      responsavel: "Ana",
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erros.join(" ")).toContain("Reimportação bloqueada");
    expect(db.boletos.find((item) => item.id === "bol-a-1")?.documento_boleto_id).toBeUndefined();
    expect(db.documentos_boleto).toHaveLength(1);
  });
});
