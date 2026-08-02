import { describe, expect, it } from "vitest";
import { seedDB } from "../data/seed";
import type { DB } from "../types";
import {
  avaliarCompletudeNfeEntrada,
  avaliarCompletudeNotaFiscal,
  boletosNaoConferidosDaNota,
  corrigirFornecedorNotaFiscal,
} from "./nfe-completude";

function dbBase(): DB {
  return structuredClone(seedDB) as DB;
}

describe("completude e correção segura da NF-e", () => {
  it("bloqueia quando faltam fornecedor, chave e cnpj", () => {
    const db = dbBase();

    const resultado = avaliarCompletudeNfeEntrada(db, {
      valor_total: 100,
      parcelas: [],
    });

    expect(resultado.completa).toBe(false);
    expect(resultado.pendencias.map((item) => item.codigo)).toEqual(
      expect.arrayContaining([
        "fornecedor_ausente",
        "chave_ausente",
        "cnpj_emitente_ausente",
        "sem_duplicatas_sem_confirmacao",
      ])
    );
  });

  it("exige valor e vencimento válidos nas parcelas", () => {
    const db = dbBase();

    const resultado = avaliarCompletudeNfeEntrada(db, {
      fornecedor_id: "forn-hortifruti",
      chave_acesso: "CHAVE-X",
      cnpj_emitente: "12345678000190",
      valor_total: 100,
      parcelas: [{ numero_parcela: "1", vencimento: "", valor: 0 }],
    });

    expect(resultado.completa).toBe(false);
    expect(resultado.pendencias.map((item) => item.codigo)).toEqual(
      expect.arrayContaining(["parcela_sem_vencimento", "parcela_sem_valor"])
    );
  });

  it("avisa divergência entre soma das parcelas e valor da nota sem bloquear", () => {
    const db = dbBase();
    const nota = db.notas_fiscais[0];

    db.boletos.push(
      {
        id: "bol-alerta-1",
        nota_id: nota.id,
        numero_parcela: "1",
        valor: 10,
        vencimento: "2026-08-10",
        status: "travado",
      },
      {
        id: "bol-alerta-2",
        nota_id: nota.id,
        numero_parcela: "2",
        valor: 11,
        vencimento: "2026-09-10",
        status: "travado",
      }
    );

    nota.valor_total = 50;
    nota.chave_acesso = nota.chave_acesso || "CHAVE-ALERTA";
    nota.cnpj_emitente = nota.cnpj_emitente || "12345678000190";

    const resultado = avaliarCompletudeNotaFiscal(db, nota);

    expect(resultado.completa).toBe(true);
    expect(resultado.alertas).toContain("A soma das parcelas diverge do valor total da NF-e.");
  });

  it("corrige somente o fornecedor e grava histórico", () => {
    const db = dbBase();
    const nota = db.notas_fiscais[0];
    const fornecedorDestino = db.fornecedores.find((fornecedor) => fornecedor.id !== nota.fornecedor_id);
    if (!fornecedorDestino) throw new Error("Teste sem fornecedor alternativo disponível.");
    const chaveAnterior = nota.chave_acesso;
    const cnpjAnterior = nota.cnpj_emitente;

    const resultado = corrigirFornecedorNotaFiscal(db, {
      notaId: nota.id,
      fornecedorIdNovo: fornecedorDestino.id,
      responsavel: "usuário local",
      justificativa: "Fornecedor correto após conferência documental",
      gerarIdRegistro: () => "hist-1",
      corrigidoEm: "2026-07-24T10:00:00.000Z",
    });

    expect(resultado.sucesso).toBe(true);
    expect(resultado.alterou).toBe(true);
    expect(nota.fornecedor_id).toBe(fornecedorDestino.id);
    expect(nota.chave_acesso).toBe(chaveAnterior);
    expect(nota.cnpj_emitente).toBe(cnpjAnterior);
    expect(nota.correcoes_fornecedor?.[0]).toMatchObject({
      id: "hist-1",
      fornecedor_novo_id: fornecedorDestino.id,
      corrigido_por: "usuário local",
    });
  });

  it("não permite correção sem mudança e não cria histórico", () => {
    const db = dbBase();
    const nota = db.notas_fiscais[0];
    const historicoAntes = nota.correcoes_fornecedor?.length ?? 0;

    const resultado = corrigirFornecedorNotaFiscal(db, {
      notaId: nota.id,
      fornecedorIdNovo: nota.fornecedor_id,
      responsavel: "usuário local",
      gerarIdRegistro: () => "hist-sem-mudanca",
    });

    expect(resultado.sucesso).toBe(true);
    expect(resultado.alterou).toBe(false);
    expect(resultado.mensagem).toBe("NF-e já está vinculada ao fornecedor informado.");
    expect(nota.correcoes_fornecedor?.length ?? 0).toBe(historicoAntes);
  });

  it("evita histórico duplicado em envio repetido da mesma correção", () => {
    const db = dbBase();
    const nota = db.notas_fiscais[0];
    const fornecedorDestino = db.fornecedores.find((fornecedor) => fornecedor.id !== nota.fornecedor_id);
    if (!fornecedorDestino) throw new Error("Teste sem fornecedor alternativo disponível.");

    const primeiro = corrigirFornecedorNotaFiscal(db, {
      notaId: nota.id,
      fornecedorIdNovo: fornecedorDestino.id,
      responsavel: "usuário local",
      gerarIdRegistro: () => "hist-primeiro",
    });
    const historicoAposPrimeiro = nota.correcoes_fornecedor?.length ?? 0;

    const segundo = corrigirFornecedorNotaFiscal(db, {
      notaId: nota.id,
      fornecedorIdNovo: fornecedorDestino.id,
      responsavel: "usuário local",
      gerarIdRegistro: () => "hist-segundo",
    });

    expect(primeiro.sucesso).toBe(true);
    expect(primeiro.alterou).toBe(true);
    expect(segundo.sucesso).toBe(true);
    expect(segundo.alterou).toBe(false);
    expect(nota.correcoes_fornecedor?.length ?? 0).toBe(historicoAposPrimeiro);
    expect(nota.correcoes_fornecedor?.[0]?.id).toBe("hist-primeiro");
  });

  it("lista somente boletos não confirmados para reconferência", () => {
    const db = dbBase();
    const nota = db.notas_fiscais[0];

    db.boletos.push(
      {
        id: "bol-reconf-1",
        nota_id: nota.id,
        valor: 10,
        vencimento: "2026-08-10",
        status: "travado",
      },
      {
        id: "bol-reconf-2",
        nota_id: nota.id,
        valor: 10,
        vencimento: "2026-08-11",
        status: "liberado",
        status_conferencia: "em_analise",
      },
      {
        id: "bol-reconf-3",
        nota_id: nota.id,
        valor: 10,
        vencimento: "2026-08-12",
        status: "liberado",
        status_conferencia: "conferido",
      }
    );

    const pendentes = boletosNaoConferidosDaNota(db, nota.id);
    expect(pendentes.map((boleto) => boleto.id)).toEqual(
      expect.arrayContaining(["bol-reconf-1", "bol-reconf-2"])
    );
    expect(pendentes.find((boleto) => boleto.id === "bol-reconf-3")).toBeUndefined();
  });
});
