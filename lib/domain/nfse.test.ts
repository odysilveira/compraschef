import { describe, expect, it } from "vitest";
import { seedDB } from "../data/seed";
import type { DB } from "../types";
import {
  TEXTO_NFSE_DEMO_ANOTA_AI,
  chaveNfseValida,
  extrairDadosNfseDoTexto,
  garantirFornecedorNfse,
  localizarNotaPorChaveNfse,
  registrarNfseIdempotente,
} from "./nfse";

describe("extrairDadosNfseDoTexto", () => {
  it("lê NFS-e Osasco / Anota AI do texto do PDF", () => {
    const dados = extrairDadosNfseDoTexto(TEXTO_NFSE_DEMO_ANOTA_AI);
    expect(dados.numero).toBe("1449123");
    expect(dados.emitida_em).toBe("2026-07-31");
    expect(dados.cnpj_prestador).toBe("27864392000193");
    expect(dados.razao_social_prestador?.toUpperCase()).toContain("ANOTA AI");
    expect(dados.cnpj_tomador).toBe("52977266000192");
    expect(dados.valor_total).toBe(209.99);
    expect(dados.chave_nfse).toBe("NFS35344011227864392000193000000144912326076420365616");
    expect(dados.descricao_servico?.toUpperCase()).toContain("LICENCIAMENTO");
    expect(chaveNfseValida(dados.chave_nfse)).toBe(true);
  });
});

describe("registrarNfseIdempotente", () => {
  it("cria fornecedor, nota conferida e título liberado (PIX)", () => {
    const db = structuredClone(seedDB) as DB;
    const dados = extrairDadosNfseDoTexto(TEXTO_NFSE_DEMO_ANOTA_AI);
    const forn = garantirFornecedorNfse(db, {
      cnpj: dados.cnpj_prestador!,
      razao_social: dados.razao_social_prestador!,
      meio_pagamento: "pix",
      gerarId: () => "forn-anota",
    });

    const resultado = registrarNfseIdempotente(
      db,
      {
        fornecedor_id: forn.id,
        numero: dados.numero!,
        chave_nfse: dados.chave_nfse!,
        cnpj_emitente: dados.cnpj_prestador!,
        razao_social_emitente: dados.razao_social_prestador!,
        valor_total: dados.valor_total!,
        emitida_em: dados.emitida_em!,
        importada_em: "2026-08-12T12:00:00.000Z",
        descricao_servico: dados.descricao_servico,
        municipio_emissao: "Osasco",
        arquivo_pdf_nome: "nfse-anota.pdf",
        meio_pagamento: "pix",
        vencimento: "2026-08-14",
      },
      { notaId: "nfse-1", boletoId: "bol-nfse-1" }
    );

    expect(resultado.sucesso).toBe(true);
    const nota = db.notas_fiscais.find((n) => n.id === "nfse-1");
    expect(nota?.tipo).toBe("nfse");
    expect(nota?.status).toBe("conferida");
    expect(nota?.meio_pagamento_esperado).toBe("pix");
    const bol = db.boletos.find((b) => b.id === "bol-nfse-1");
    expect(bol?.status).toBe("liberado");
    expect(bol?.meio_pagamento_esperado).toBe("pix");
    expect(bol?.valor).toBe(209.99);
    expect(bol?.observacao).toMatch(/PIX/i);
  });

  it("é idempotente pela chave NFS-e", () => {
    const db = structuredClone(seedDB) as DB;
    const dados = extrairDadosNfseDoTexto(TEXTO_NFSE_DEMO_ANOTA_AI);
    const forn = garantirFornecedorNfse(db, {
      cnpj: dados.cnpj_prestador!,
      razao_social: dados.razao_social_prestador!,
      meio_pagamento: "boleto",
      gerarId: () => "forn-anota",
    });
    const entrada = {
      fornecedor_id: forn.id,
      numero: dados.numero!,
      chave_nfse: dados.chave_nfse!,
      cnpj_emitente: dados.cnpj_prestador!,
      razao_social_emitente: dados.razao_social_prestador!,
      valor_total: dados.valor_total!,
      emitida_em: dados.emitida_em!,
      importada_em: "2026-08-12T12:00:00.000Z",
      meio_pagamento: "boleto" as const,
      vencimento: "2026-08-20",
    };
    expect(registrarNfseIdempotente(db, entrada, { notaId: "a", boletoId: "b" }).sucesso).toBe(true);
    const segundo = registrarNfseIdempotente(db, entrada, { notaId: "c", boletoId: "d" });
    expect(segundo.sucesso).toBe(false);
    expect(segundo.mensagem).toMatch(/já importada/i);
    expect(localizarNotaPorChaveNfse(db, dados.chave_nfse!)?.id).toBe("a");
    expect(db.boletos.filter((b) => b.nota_id === "a")).toHaveLength(1);
  });
});
