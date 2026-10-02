import { describe, expect, it } from "vitest";
import {
  extrairDadosPixCopiaCola,
  formatarDocumentoPix,
  formatarValorPixParaInput,
  parecePixCopiaCola,
} from "./pix-copia-cola";

/** Payload real (TAON PAY) — valor 200.00, CNPJ na chave. */
const PIX_TAON =
  "00020126750014br.gov.bcb.pix0114576437960001070235Cobranca Sistema/Nota Sem 1708-23085204000053039865406200.005802BR5925TAON PAY GESTAO FINANCEIR6008Londrina62280525TAONPAY00000009219863045A6304F1F9";

describe("pix-copia-cola", () => {
  it("reconhece payload PIX", () => {
    expect(parecePixCopiaCola(PIX_TAON)).toBe(true);
    expect(parecePixCopiaCola("34191.09008")).toBe(false);
  });

  it("extrai valor, nome, cidade e CNPJ do payload TAON", () => {
    const dados = extrairDadosPixCopiaCola(PIX_TAON);
    expect(dados).not.toBeNull();
    expect(dados!.valor).toBe(200);
    expect(dados!.nomeRecebedor).toMatch(/TAON/i);
    expect(dados!.cidade).toMatch(/Londrina/i);
    expect(dados!.documentoRecebedor).toBe("57643796000107");
    expect(dados!.descricao).toMatch(/Cobranca/i);
    expect(formatarValorPixParaInput(dados!.valor)).toBe("200,00");
    expect(formatarDocumentoPix(dados!.documentoRecebedor)).toBe("57.643.796/0001-07");
  });

  it("aceita PIX sem valor (campo 54 ausente)", () => {
    const semValor =
      "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913FULANO DE TAL6008SAO PAULO62070503***6304ABCD";
    const dados = extrairDadosPixCopiaCola(semValor);
    expect(dados).not.toBeNull();
    expect(dados!.valor).toBeUndefined();
    expect(dados!.nomeRecebedor).toMatch(/FULANO/i);
  });
});
