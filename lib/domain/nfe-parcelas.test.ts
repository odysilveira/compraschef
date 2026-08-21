import { describe, expect, it } from "vitest";
import type { DB } from "../types";
import { seedDB } from "../data/seed";
import { atualizarComNovidades } from "../data/index";
import {
  extrairCnpjEmitenteDaChaveAcesso,
  localizarNotaFiscalPorChave,
  normalizarDuplicatasLidas,
  registrarNotaEParcelasIdempotente,
  verificarParcelaDuplicada,
} from "./nfe-parcelas";

function dbBase(): DB {
  return structuredClone(seedDB) as DB;
}

function montarChaveAcessoValidaComCnpj(cnpj: string): string {
  const base43 = `352607${cnpj}55001000012905100012905`;
  let soma = 0;
  let peso = 2;
  for (let indice = base43.length - 1; indice >= 0; indice -= 1) {
    soma += Number(base43[indice]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dvCalculado = 11 - resto;
  const dv = dvCalculado >= 10 ? 0 : dvCalculado;
  return `${base43}${dv}`;
}

describe("preparação de NF-e e parcelas", () => {
  it("lê nDup do XML", () => {
    const duplicatas = normalizarDuplicatasLidas([
      { numero_parcela: "001", vencimento: "2026-08-10", valor: 120 },
    ]);

    expect(duplicatas[0].numero_parcela).toBe("001");
  });

  it("gera sequência quando nDup não existe", () => {
    const duplicatas = normalizarDuplicatasLidas([
      { vencimento: "2026-08-10", valor: 100 },
      { vencimento: "2026-09-10", valor: 200 },
    ]);

    expect(duplicatas.map((item) => item.numero_parcela)).toEqual(["1", "2"]);
  });

  it("persiste cnpj_emitente", () => {
    const db = dbBase();

    const resultado = registrarNotaEParcelasIdempotente(
      db,
      {
        fornecedor_id: "forn-hortifruti",
        numero: "100",
        chave_acesso: "CHAVE-100",
        cnpj_emitente: "12345678000190",
        valor_total: 300,
        emitida_em: "2026-07-24",
        importada_em: "2026-07-24T12:00:00.000Z",
        status: "conferida",
        origem: "manual",
        parcelas: [{ numero_parcela: "001", vencimento: "2026-08-10", valor: 300 }],
        status_boleto: "liberado",
        cnpj_beneficiario: "12345678000190",
        vencimento_padrao: "2026-08-10",
      },
      { notaId: "nf-teste", gerarIdBoleto: () => "bol-nfe-test-1" }
    );

    expect(resultado.sucesso).toBe(true);
    expect(db.notas_fiscais[0].cnpj_emitente).toBe("12345678000190");
  });

  it("persiste razão social emitente ao registrar nova NF-e", () => {
    const db = dbBase();

    const resultado = registrarNotaEParcelasIdempotente(
      db,
      {
        fornecedor_id: "forn-hortifruti",
        numero: "100A",
        chave_acesso: "CHAVE-100A",
        cnpj_emitente: "12345678000190",
        razao_social_emitente: "HORTIFRUTI SAO JOSE LTDA",
        valor_total: 300,
        emitida_em: "2026-07-24",
        importada_em: "2026-07-24T12:00:00.000Z",
        status: "conferida",
        origem: "manual",
        parcelas: [{ numero_parcela: "001", vencimento: "2026-08-10", valor: 300 }],
        status_boleto: "liberado",
        cnpj_beneficiario: "12345678000190",
        vencimento_padrao: "2026-08-10",
      },
      { notaId: "nf-teste-razao", gerarIdBoleto: () => "bol-nfe-test-razao" }
    );

    expect(resultado.sucesso).toBe(true);
    expect(db.notas_fiscais[0].cnpj_emitente).toBe("12345678000190");
    expect(db.notas_fiscais[0].razao_social_emitente).toBe("HORTIFRUTI SAO JOSE LTDA");
  });

  it("persiste numero_parcela", () => {
    const db = dbBase();

    registrarNotaEParcelasIdempotente(
      db,
      {
        fornecedor_id: "forn-hortifruti",
        numero: "101",
        chave_acesso: "CHAVE-101",
        valor_total: 400,
        emitida_em: "2026-07-24",
        importada_em: "2026-07-24T12:00:00.000Z",
        status: "conferida",
        origem: "manual",
        parcelas: [{ numero_parcela: "002", vencimento: "2026-08-20", valor: 400 }],
        status_boleto: "liberado",
        vencimento_padrao: "2026-08-20",
      },
      { notaId: "nf-teste-2", gerarIdBoleto: () => "bol-nfe-test-2" }
    );

    const boleto = db.boletos.find((item) => item.id === "bol-nfe-test-2");
    expect(boleto?.numero_parcela).toBe("002");
  });

  it("persiste confirmação explícita quando NF-e não possui duplicatas", () => {
    const db = dbBase();

    const agora = "2026-07-24T12:00:00.000Z";
    registrarNotaEParcelasIdempotente(
      db,
      {
        fornecedor_id: "forn-hortifruti",
        numero: "101A",
        chave_acesso: "CHAVE-101A",
        valor_total: 400,
        emitida_em: "2026-07-24",
        importada_em: agora,
        status: "conferida",
        origem: "manual",
        parcelas: [],
        status_boleto: "liberado",
        vencimento_padrao: "2026-08-20",
        sem_duplicatas_confirmado_em: agora,
        sem_duplicatas_confirmado_por: "usuário local",
        sem_duplicatas_justificativa: "Sem cobrança a prazo.",
      },
      { notaId: "nf-sem-dup" }
    );

    const nota = db.notas_fiscais.find((item) => item.id === "nf-sem-dup");
    expect(nota?.sem_duplicatas_confirmado_em).toBe(agora);
    expect(nota?.sem_duplicatas_confirmado_por).toBe("usuário local");
  });

  it("bloqueia segunda importação pela mesma chave_acesso", () => {
    const db = dbBase();

    const primeiro = registrarNotaEParcelasIdempotente(
      db,
      {
        fornecedor_id: "forn-hortifruti",
        numero: "102",
        chave_acesso: "CHAVE-102",
        valor_total: 500,
        emitida_em: "2026-07-24",
        importada_em: "2026-07-24T12:00:00.000Z",
        status: "conferida",
        origem: "manual",
        parcelas: [{ numero_parcela: "001", vencimento: "2026-08-10", valor: 500 }],
        status_boleto: "liberado",
        vencimento_padrao: "2026-08-10",
      },
      { notaId: "nf-chave", gerarIdBoleto: () => "bol-nfe-test-3" }
    );

    const segundo = registrarNotaEParcelasIdempotente(
      db,
      {
        fornecedor_id: "forn-hortifruti",
        numero: "102",
        chave_acesso: "CHAVE-102",
        valor_total: 500,
        emitida_em: "2026-07-24",
        importada_em: "2026-07-24T12:01:00.000Z",
        status: "conferida",
        origem: "manual",
        parcelas: [{ numero_parcela: "001", vencimento: "2026-08-10", valor: 500 }],
        status_boleto: "liberado",
        vencimento_padrao: "2026-08-10",
      },
      { notaId: "nf-chave-2", gerarIdBoleto: () => "bol-nfe-test-4" }
    );

    expect(primeiro.sucesso).toBe(true);
    expect(segundo.sucesso).toBe(false);
    expect(segundo.mensagem).toBe("NF-e já importada");
    expect(localizarNotaFiscalPorChave(db, "CHAVE-102")?.id).toBe("nf-chave");
  });

  it("segunda tentativa não duplica parcelas", () => {
    const db = dbBase();

    registrarNotaEParcelasIdempotente(
      db,
      {
        fornecedor_id: "forn-hortifruti",
        numero: "103",
        chave_acesso: "CHAVE-103",
        valor_total: 200,
        emitida_em: "2026-07-24",
        importada_em: "2026-07-24T12:00:00.000Z",
        status: "conferida",
        origem: "manual",
        parcelas: [{ numero_parcela: "001", vencimento: "2026-08-11", valor: 200 }],
        status_boleto: "liberado",
        vencimento_padrao: "2026-08-11",
      },
      { notaId: "nf-dup", gerarIdBoleto: () => "bol-nfe-test-5" }
    );

    const antes = db.boletos.length;
    registrarNotaEParcelasIdempotente(
      db,
      {
        fornecedor_id: "forn-hortifruti",
        numero: "103",
        chave_acesso: "CHAVE-103",
        valor_total: 200,
        emitida_em: "2026-07-24",
        importada_em: "2026-07-24T12:02:00.000Z",
        status: "conferida",
        origem: "manual",
        parcelas: [{ numero_parcela: "001", vencimento: "2026-08-11", valor: 200 }],
        status_boleto: "liberado",
        vencimento_padrao: "2026-08-11",
      },
      { notaId: "nf-dup-2", gerarIdBoleto: () => "bol-nfe-test-6" }
    );

    expect(db.boletos).toHaveLength(antes);
  });

  it("segunda tentativa não altera estoque/lotes/preços no helper", () => {
    const db = dbBase();
    const snapshot = {
      lotes: db.lotes_estoque.length,
      movimentos: db.movimentos_estoque.length,
      precos: db.precos_historico.length,
    };

    registrarNotaEParcelasIdempotente(
      db,
      {
        fornecedor_id: "forn-hortifruti",
        numero: "104",
        chave_acesso: "CHAVE-104",
        valor_total: 700,
        emitida_em: "2026-07-24",
        importada_em: "2026-07-24T12:00:00.000Z",
        status: "conferida",
        origem: "manual",
        parcelas: [{ numero_parcela: "001", vencimento: "2026-08-15", valor: 700 }],
        status_boleto: "liberado",
        vencimento_padrao: "2026-08-15",
      },
      { notaId: "nf-stock", gerarIdBoleto: () => "bol-nfe-test-7" }
    );

    registrarNotaEParcelasIdempotente(
      db,
      {
        fornecedor_id: "forn-hortifruti",
        numero: "104",
        chave_acesso: "CHAVE-104",
        valor_total: 700,
        emitida_em: "2026-07-24",
        importada_em: "2026-07-24T12:03:00.000Z",
        status: "conferida",
        origem: "manual",
        parcelas: [{ numero_parcela: "001", vencimento: "2026-08-15", valor: 700 }],
        status_boleto: "liberado",
        vencimento_padrao: "2026-08-15",
      },
      { notaId: "nf-stock-2", gerarIdBoleto: () => "bol-nfe-test-8" }
    );

    expect(db.lotes_estoque).toHaveLength(snapshot.lotes);
    expect(db.movimentos_estoque).toHaveLength(snapshot.movimentos);
    expect(db.precos_historico).toHaveLength(snapshot.precos);
  });

  it("detecta parcela duplicada por nota_id + numero_parcela", () => {
    const db = dbBase();
    db.boletos.push({
      id: "bol-dup-num",
      nota_id: "nf-num",
      numero_parcela: "003",
      valor: 99,
      vencimento: "2026-08-30",
      status: "travado",
    });

    const duplicada = verificarParcelaDuplicada(db, {
      nota_id: "nf-num",
      numero_parcela: "003",
      vencimento: "2026-09-01",
      valor: 120,
    });

    expect(duplicada?.id).toBe("bol-dup-num");
  });

  it("usa fallback para parcela antiga sem número", () => {
    const db = dbBase();
    db.boletos.push({
      id: "bol-legacy",
      nota_id: "nf-legacy",
      valor: 150,
      vencimento: "2026-09-10",
      status: "travado",
    });

    const duplicada = verificarParcelaDuplicada(db, {
      nota_id: "nf-legacy",
      numero_parcela: "001",
      vencimento: "2026-09-10",
      valor: 150,
    });

    expect(duplicada?.id).toBe("bol-legacy");
  });

  it("migra DB antigo sem perder dados", () => {
    const antigo = dbBase() as DB & { contas_pagar?: unknown; documentos_boleto?: unknown };
    delete (antigo as { contas_pagar?: unknown }).contas_pagar;
    delete (antigo as { documentos_boleto?: unknown }).documentos_boleto;
    for (const nota of antigo.notas_fiscais) {
      delete (nota as { correcoes_fornecedor?: unknown }).correcoes_fornecedor;
    }

    const notasAntes = antigo.notas_fiscais.length;
    const boletosAntes = antigo.boletos.length;

    const mudou = atualizarComNovidades(antigo as DB);

    expect(mudou).toBe(true);
    expect((antigo as DB).notas_fiscais).toHaveLength(notasAntes);
    expect((antigo as DB).boletos).toHaveLength(boletosAntes);
    expect((antigo as DB).notas_fiscais.every((nota) => Array.isArray(nota.correcoes_fornecedor))).toBe(true);
  });

  it("extrai CNPJ do emitente quando a chave de acesso é válida", () => {
    const cnpj = "12345678000195";
    const chaveValida = montarChaveAcessoValidaComCnpj(cnpj);
    expect(extrairCnpjEmitenteDaChaveAcesso(chaveValida)).toBe(cnpj);
  });

  it("não extrai CNPJ quando a chave de acesso é inválida", () => {
    const chaveValida = montarChaveAcessoValidaComCnpj("12345678000195");
    const dvCorrompido = chaveValida.endsWith("9") ? "0" : "9";
    const chaveInvalida = `${chaveValida.slice(0, 43)}${dvCorrompido}`;
    expect(extrairCnpjEmitenteDaChaveAcesso(chaveInvalida)).toBeUndefined();
  });

  it("migra nota antiga preenchendo cnpj_emitente a partir da chave válida", () => {
    const db = dbBase();
    const nota = db.notas_fiscais[0];
    nota.chave_acesso = montarChaveAcessoValidaComCnpj("12345678000195");
    nota.cnpj_emitente = "";

    const mudou = atualizarComNovidades(db);

    expect(mudou).toBe(true);
    expect(nota.cnpj_emitente).toBe("12345678000195");
  });

  it("não migra cnpj_emitente quando a chave é inválida", () => {
    const db = dbBase();
    const nota = db.notas_fiscais[0];
    nota.chave_acesso = "35260723456789000101550010000129051000129052";
    nota.cnpj_emitente = "";

    atualizarComNovidades(db);

    expect(nota.cnpj_emitente).toBe("");
  });

  it("preserva cnpj_emitente já existente durante migração", () => {
    const db = dbBase();
    const nota = db.notas_fiscais[0];
    nota.chave_acesso = montarChaveAcessoValidaComCnpj("12345678000195");
    nota.cnpj_emitente = "99888777000166";

    atualizarComNovidades(db);

    expect(nota.cnpj_emitente).toBe("99888777000166");
  });

  it("numera parcelas antigas sem número de forma estável, sem alterar demais dados e sem renumerar", () => {
    const db = dbBase();
    db.boletos = [
      {
        id: "bol-leg-1",
        nota_id: "nf-legada",
        valor: 100,
        vencimento: "2026-08-20",
        status: "travado",
      },
      {
        id: "bol-leg-2",
        nota_id: "nf-legada",
        valor: 110,
        vencimento: "2026-08-10",
        status: "liberado",
      },
      {
        id: "bol-leg-3",
        nota_id: "nf-legada",
        numero_parcela: "007",
        valor: 120,
        vencimento: "2026-08-15",
        status: "pago",
      },
      {
        id: "bol-leg-4",
        nota_id: "nf-legada",
        valor: 130,
        vencimento: "2026-08-10",
        status: "suspeito",
        documento_boleto_id: "doc-leg-4",
        status_conferencia: "conferido",
        conferido_por: "usuário local",
        conferido_em: "2026-07-24T10:00:00.000Z",
      },
    ];

    const antesCampos = db.boletos.map((boleto) => ({
      id: boleto.id,
      nota_id: boleto.nota_id,
      valor: boleto.valor,
      vencimento: boleto.vencimento,
      status: boleto.status,
      documento_boleto_id: boleto.documento_boleto_id,
    }));

    const mudouPrimeiraVez = atualizarComNovidades(db);

    expect(mudouPrimeiraVez).toBe(true);
    expect(db.boletos.find((b) => b.id === "bol-leg-2")?.numero_parcela).toBe("001");
    expect(db.boletos.find((b) => b.id === "bol-leg-4")?.numero_parcela).toBe("002");
    expect(db.boletos.find((b) => b.id === "bol-leg-1")?.numero_parcela).toBe("003");
    expect(db.boletos.find((b) => b.id === "bol-leg-3")?.numero_parcela).toBe("007");

    const depoisCampos = db.boletos
      .filter((boleto) => boleto.id.startsWith("bol-leg-"))
      .map((boleto) => ({
      id: boleto.id,
      nota_id: boleto.nota_id,
      valor: boleto.valor,
      vencimento: boleto.vencimento,
      status: boleto.status,
      documento_boleto_id: boleto.documento_boleto_id,
    }));
    expect(depoisCampos).toEqual(antesCampos);

    const numeroParcelaAposPrimeira = db.boletos
      .filter((boleto) => boleto.id.startsWith("bol-leg-"))
      .map((boleto) => ({ id: boleto.id, numero_parcela: boleto.numero_parcela }));
    atualizarComNovidades(db);
    const numeroParcelaAposSegunda = db.boletos
      .filter((boleto) => boleto.id.startsWith("bol-leg-"))
      .map((boleto) => ({ id: boleto.id, numero_parcela: boleto.numero_parcela }));

    expect(numeroParcelaAposSegunda).toEqual(numeroParcelaAposPrimeira);
  });
});
