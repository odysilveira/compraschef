import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { seedDB } from "../data/seed";
import type { DB } from "../types";
import {
  TEXTO_NFSE_DEMO_ANOTA_AI,
  TEXTO_NFSE_DEMO_IFOOD_SP,
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

  it("lê NFS-e Paulistana / iFood com rótulos e valores em linhas separadas", () => {
    const dados = extrairDadosNfseDoTexto(TEXTO_NFSE_DEMO_IFOOD_SP);
    expect(dados.numero).toBe("45678");
    expect(dados.emitida_em).toBe("2024-09-06");
    expect(dados.cnpj_prestador).toBe("14380200000121");
    expect(dados.razao_social_prestador?.toUpperCase()).toContain("IFOOD");
    expect(dados.valor_total).toBe(5839.33);
    expect(dados.chave_nfse).toBe("AB12CD34");
    expect(dados.descricao_servico?.toUpperCase()).toContain("AGENCIAMENTO");
    expect(chaveNfseValida(dados.chave_nfse)).toBe(true);
    expect(dados.valor_total).not.toBe(6092.19);
    expect(dados.valor_total).not.toBe(656.94);
  });

  it("lê NFS-e Campinas / iFood real (licenciamento)", () => {
    const texto = readFileSync(
      path.join(process.cwd(), "fixtures/nfse-ifood-campinas-zyqq0v7tp.txt"),
      "utf8"
    );
    const dados = extrairDadosNfseDoTexto(texto);
    expect(dados.numero).toBe("13358572");
    expect(dados.serie).toBe("E");
    expect(dados.emitida_em).toBe("2026-09-07");
    expect(dados.cnpj_prestador).toBe("14380200000393");
    expect(dados.razao_social_prestador?.toUpperCase()).toContain("IFOOD");
    expect(dados.valor_total).toBe(110);
    expect(dados.chave_nfse).toBe("35095021214380200000393000001335857226096004446848");
    expect(dados.descricao_servico?.toUpperCase()).toContain("LICENCIAMENTO");
    expect(dados.municipio?.toUpperCase()).toContain("CAMPINAS");
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

  it("registra NFS-e já debitada na plataforma como paga (sem pendência)", () => {
    const db = structuredClone(seedDB) as DB;
    const dados = extrairDadosNfseDoTexto(TEXTO_NFSE_DEMO_ANOTA_AI);
    const forn = garantirFornecedorNfse(db, {
      cnpj: dados.cnpj_prestador!,
      razao_social: "IFOOD.COM AGENCIA DE RESTAURANTES ONLINE S.A.",
      meio_pagamento: "plataforma",
      gerarId: () => "forn-ifood",
    });

    const resultado = registrarNfseIdempotente(
      db,
      {
        fornecedor_id: forn.id,
        numero: dados.numero!,
        chave_nfse: dados.chave_nfse!,
        cnpj_emitente: dados.cnpj_prestador!,
        razao_social_emitente: "IFOOD.COM AGENCIA DE RESTAURANTES ONLINE S.A.",
        valor_total: dados.valor_total!,
        emitida_em: dados.emitida_em!,
        importada_em: "2026-09-06T12:00:00.000Z",
        descricao_servico: dados.descricao_servico,
        meio_pagamento: "plataforma",
        vencimento: dados.emitida_em!,
      },
      { notaId: "nfse-ifood", boletoId: "bol-ifood" }
    );

    expect(resultado.sucesso).toBe(true);
    const bol = db.boletos.find((b) => b.id === "bol-ifood");
    expect(bol?.status).toBe("pago");
    expect(bol?.meio_pagamento_esperado).toBe("plataforma");
    expect(bol?.status_conferencia).toBe("conferido");
    expect(bol?.pagamento_banco_conta).toMatch(/Plataforma/i);
    expect(bol?.observacao).toMatch(/já debitado/i);
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
