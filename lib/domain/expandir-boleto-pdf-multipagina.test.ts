import { describe, expect, it } from "vitest";
import { seedDB } from "../data/seed";
import type { DB, DocumentoBoleto } from "../types";
import { expandirDocumentoBoletoMultipagina } from "./expandir-boleto-pdf-multipagina";
import { validarBoleto } from "./boletos";

describe("expandirDocumentoBoletoMultipagina", () => {
  function docBase(overrides: Partial<DocumentoBoleto> = {}): DocumentoBoleto {
    return {
      id: "doc-merge",
      nome_arquivo: "merge-4191440.pdf",
      tipo_arquivo: "application/pdf",
      tamanho_bytes: 50000,
      hash_sha256: "abc123",
      criado_em: "2026-09-11T12:00:00.000Z",
      criado_por: "teste",
      resultado_confronto: "sem_correspondencia",
      ...overrides,
    };
  }

  it("separa DANFE + 3 páginas de boleto em 3 documentos", () => {
    const db = structuredClone(seedDB) as DB;
    db.documentos_boleto = [docBase()];

    let n = 0;
    const resultado = expandirDocumentoBoletoMultipagina(
      db,
      {
        documentoId: "doc-merge",
        paginas: [
          { pagina: 1, pareceDanfe: true, validos: [] },
          { pagina: 2, pareceDanfe: false, validos: [] },
          { pagina: 3, pareceDanfe: false, validos: [] },
          { pagina: 4, pareceDanfe: false, validos: [] },
        ],
      },
      { gerarId: () => `doc-bol-${++n}` }
    );

    expect(resultado.ok).toBe(true);
    expect(resultado.paginasBoleto).toBe(3);
    expect(resultado.paginasDanfe).toBe(1);
    expect(resultado.documentos).toHaveLength(3);
    expect(db.documentos_boleto).toHaveLength(3);
    expect(db.documentos_boleto.map((d) => d.pagina_pdf)).toEqual([2, 3, 4]);
    expect(db.documentos_boleto.every((d) => d.hash_sha256 === "abc123")).toBe(true);
  });

  it("grava linha quando a página veio lida", () => {
    const db = structuredClone(seedDB) as DB;
    db.documentos_boleto = [docBase()];
    const linha = "34191.23454 67890.123457 67890.123457 1 12340000001000";
    const validacao = validarBoleto(linha);
    expect(validacao.valido).toBe(true);

    const resultado = expandirDocumentoBoletoMultipagina(db, {
      documentoId: "doc-merge",
      paginas: [
        {
          pagina: 1,
          pareceDanfe: false,
          validos: [
            {
              valorNormalizado: validacao.valorNormalizado!,
              formato: "linha_digitavel_bancaria_47",
              codigoCanonico: validacao.codigoCanonico,
            },
          ],
        },
        { pagina: 2, pareceDanfe: false, validos: [] },
      ],
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.documentos[0].linha_informada).toBeTruthy();
    expect(resultado.documentos[1].linha_informada).toBeUndefined();
  });

  it("recusa quando só há uma página de boleto", () => {
    const db = structuredClone(seedDB) as DB;
    db.documentos_boleto = [docBase()];
    const resultado = expandirDocumentoBoletoMultipagina(db, {
      documentoId: "doc-merge",
      paginas: [
        { pagina: 1, pareceDanfe: true, validos: [] },
        { pagina: 2, pareceDanfe: false, validos: [] },
      ],
    });
    expect(resultado.ok).toBe(false);
    expect(resultado.erros[0]).toMatch(/1 página/i);
  });
});
