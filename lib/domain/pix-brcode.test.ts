import { describe, expect, it } from "vitest";
import { crc16Ccitt, montarPixBrCode, podeGerarPixBrCode } from "./pix-brcode";
import { extrairDadosPixCopiaCola, parecePixCopiaCola } from "./pix-copia-cola";

describe("pix-brcode", () => {
  it("calcula CRC conhecido (exemplo Bacen-like)", () => {
    // Payload sem CRC + "6304" → CRC deve fechar o payload completo
    const base =
      "00020126580014br.gov.bcb.pix0136bruno.moto@pix520400005303986540510.005802BR5911BRUNO MOTO6008LONDRINA62070503***6304";
    const crc = crc16Ccitt(base);
    expect(crc).toHaveLength(4);
    expect(/^[0-9A-F]{4}$/.test(crc)).toBe(true);
  });

  it("gera payload legível pelo extrator e com valor correto", () => {
    const payload = montarPixBrCode({
      chave: "bruno.moto@pix",
      nomeRecebedor: "Bruno Motoboy",
      cidade: "Londrina",
      valor: 85.5,
      descricao: "Diaria 01/10",
      txid: "pag123",
    });
    expect(parecePixCopiaCola(payload)).toBe(true);
    expect(payload.endsWith(crc16Ccitt(payload.slice(0, -4)))).toBe(true);

    const dados = extrairDadosPixCopiaCola(payload);
    expect(dados).not.toBeNull();
    expect(dados!.valor).toBe(85.5);
    expect(dados!.nomeRecebedor).toMatch(/BRUNO/i);
    expect(dados!.cidade).toMatch(/LONDRINA/i);
  });

  it("rejeita chave ou valor inválidos", () => {
    expect(podeGerarPixBrCode("", 10)).toBe(false);
    expect(podeGerarPixBrCode("a@b.com", 0)).toBe(false);
    expect(() =>
      montarPixBrCode({ chave: "", nomeRecebedor: "X", cidade: "Y", valor: 10 })
    ).toThrow(/chave/i);
  });
});
