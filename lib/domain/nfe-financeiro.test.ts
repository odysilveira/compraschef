import { describe, expect, it } from "vitest";
import { seedDB } from "../data/seed";
import type { DB, NotaFiscal } from "../types";
import {
  abrirModalCorrecaoNfe,
  detalharNotaFiscalFinanceiro,
  exportarNotasFiscaisFinanceiroCsv,
  listarNotasFiscaisFinanceiro,
  montarResumoNotaFiscalFinanceiro,
} from "./nfe-financeiro";

function dbBase(): DB {
  return structuredClone(seedDB) as DB;
}

function criarNota(parcial: Partial<NotaFiscal> & { id: string; numero: string; chave_acesso: string }): NotaFiscal {
  return {
    id: parcial.id,
    fornecedor_id: parcial.fornecedor_id ?? "forn-hortifruti",
    numero: parcial.numero,
    chave_acesso: parcial.chave_acesso,
    cnpj_emitente: parcial.cnpj_emitente,
    valor_total: parcial.valor_total ?? 100,
    emitida_em: parcial.emitida_em ?? "2026-07-20",
    importada_em: parcial.importada_em ?? "2026-07-20T10:00:00.000Z",
    status: parcial.status ?? "conferida",
    origem: parcial.origem,
    itens_importados: parcial.itens_importados,
    correcoes_fornecedor: parcial.correcoes_fornecedor,
    sem_duplicatas_confirmado_em: parcial.sem_duplicatas_confirmado_em,
    sem_duplicatas_confirmado_por: parcial.sem_duplicatas_confirmado_por,
    sem_duplicatas_justificativa: parcial.sem_duplicatas_justificativa,
  };
}

describe("notas fiscais no financeiro", () => {
  it("lista notas antigas e novas", () => {
    const db = dbBase();
    db.notas_fiscais = [
      criarNota({ id: "nf-antiga", numero: "100", chave_acesso: "CHAVE-100", emitida_em: "2024-01-10" }),
      criarNota({ id: "nf-nova", numero: "200", chave_acesso: "CHAVE-200", emitida_em: "2026-07-20" }),
    ];

    const lista = listarNotasFiscaisFinanceiro(db, { completude: "todas" });

    expect(lista).toHaveLength(2);
    expect(lista.map((item) => item.nota.id)).toEqual(["nf-nova", "nf-antiga"]);
  });

  it("exibe nota sem fornecedor", () => {
    const db = dbBase();
    db.notas_fiscais = [
      criarNota({ id: "nf-sem-forn", numero: "300", chave_acesso: "CHAVE-300", fornecedor_id: "forn-inexistente" }),
    ];

    const resumo = montarResumoNotaFiscalFinanceiro(db, db.notas_fiscais[0]);

    expect(resumo.fornecedorNome).toBe("Fornecedor não vinculado");
    expect(resumo.indicadorCompletude).toBe("Falta fornecedor");
  });

  it("exibe aviso de indisponibilidade quando razão social do emitente não foi importada", () => {
    const db = dbBase();
    db.notas_fiscais = [
      criarNota({
        id: "nf-sem-razao",
        numero: "301",
        chave_acesso: "CHAVE-301",
        fornecedor_id: "forn-hortifruti",
      }),
    ];

    const resumo = montarResumoNotaFiscalFinanceiro(db, db.notas_fiscais[0]);

    expect(resumo.emitenteNome).toBe("Não disponível na importação original");
    expect(resumo.emitenteNome).not.toBe("Hortifruti São José");
  });

  it("aplica filtros e pesquisa", () => {
    const db = dbBase();
    db.notas_fiscais = [
      criarNota({
        id: "nf-1",
        numero: "400",
        chave_acesso: "CHAVE-400",
        cnpj_emitente: "12345678000190",
        fornecedor_id: "forn-hortifruti",
        sem_duplicatas_confirmado_em: "2026-07-20T10:00:00.000Z",
        sem_duplicatas_confirmado_por: "usuario",
      }),
      criarNota({
        id: "nf-2",
        numero: "401",
        chave_acesso: "CHAVE-401",
        cnpj_emitente: "99887766000122",
        fornecedor_id: "forn-hortifruti",
      }),
    ];

    db.boletos = db.boletos.filter((boleto) => boleto.nota_id !== "nf-1" && boleto.nota_id !== "nf-2");

    const pesquisaNumero = listarNotasFiscaisFinanceiro(db, { pesquisa: "401", completude: "todas" });
    expect(pesquisaNumero).toHaveLength(1);
    expect(pesquisaNumero[0].nota.id).toBe("nf-2");

    const pesquisaCnpj = listarNotasFiscaisFinanceiro(db, { pesquisa: "12345678000190", completude: "todas" });
    expect(pesquisaCnpj).toHaveLength(1);
    expect(pesquisaCnpj[0].nota.id).toBe("nf-1");

    const filtroSemBoleto = listarNotasFiscaisFinanceiro(db, { completude: "Sem boleto informado" });
    expect(filtroSemBoleto).toHaveLength(1);
    expect(filtroSemBoleto[0].nota.id).toBe("nf-2");
  });

  it("detalha nota com parcelas e pendências", () => {
    const db = dbBase();
    db.notas_fiscais = [
      criarNota({ id: "nf-det", numero: "500", chave_acesso: "", cnpj_emitente: "", fornecedor_id: "forn-hortifruti" }),
    ];
    db.boletos = [
      {
        id: "bol-1",
        nota_id: "nf-det",
        numero_parcela: "1",
        valor: 50,
        vencimento: "2026-08-10",
        status: "travado",
      },
      {
        id: "bol-2",
        nota_id: "nf-det",
        numero_parcela: "2",
        valor: 70,
        vencimento: "2026-09-10",
        status: "travado",
      },
    ];

    const detalhes = detalharNotaFiscalFinanceiro(db, "nf-det");

    expect(detalhes).toBeTruthy();
    expect(detalhes?.parcelas).toHaveLength(2);
    expect(detalhes?.somaParcelas).toBe(120);
    expect(detalhes?.pendencias.length).toBeGreaterThan(0);
  });

  it("abre modal de correção para nota existente", () => {
    const db = dbBase();
    db.notas_fiscais = [
      criarNota({ id: "nf-cor", numero: "600", chave_acesso: "CHAVE-600", fornecedor_id: "forn-hortifruti" }),
    ];

    const estado = abrirModalCorrecaoNfe(db, "nf-cor");

    expect(estado).toBeTruthy();
    expect(estado?.notaId).toBe("nf-cor");
    expect(estado?.fornecedorCorrecaoId).toBe("forn-hortifruti");
  });

  it("retorna lista vazia sem erro", () => {
    const db = dbBase();
    db.notas_fiscais = [];

    const lista = listarNotasFiscaisFinanceiro(db, { completude: "todas" });

    expect(lista).toEqual([]);
  });

  it("exporta CSV das notas com BOM e valores pt-BR", () => {
    const db = dbBase();
    db.notas_fiscais = [
      criarNota({
        id: "nf-csv",
        numero: "999",
        chave_acesso: "CHAVE;COM;PV",
        valor_total: 1500.5,
        cnpj_emitente: "12.345.678/0001-99",
        razao_social_emitente: "Emitente Teste",
        emitida_em: "2026-07-20",
        status: "conferida",
      }),
    ];
    db.boletos = [
      {
        id: "bol-csv",
        nota_id: "nf-csv",
        valor: 1500.5,
        vencimento: "2026-08-10",
        status: "liberado",
      },
    ];

    const lista = listarNotasFiscaisFinanceiro(db, { completude: "todas" });
    const csv = exportarNotasFiscaisFinanceiroCsv(lista);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("NF-e;Fornecedor vinculado;Emitente;CNPJ emitente");
    expect(csv).toContain("999");
    expect(csv).toContain("1500,50");
    expect(csv).toContain("Conferida");
    expect(csv).toContain('"CHAVE;COM;PV"');
  });
});
