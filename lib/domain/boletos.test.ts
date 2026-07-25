import { describe, expect, it } from "vitest";
import {
  converterLinha47ParaCodigo44,
  identificarFormatoBoleto,
  normalizarLinhaBoleto,
  obterCodigoCanonico,
  validarBoleto,
} from "./boletos";

// Código de barras bancário com 44 dígitos.
const CODIGO_BARRAS_44 = "34191123400000010001234567890123456789012345";

// Linha digitável bancária equivalente ao código de barras acima, com 47 dígitos.
const LINHA_BANCARIA_47 = "34191.23454 67890.123457 67890.123457 1 12340000001000";

// Linha digitável de arrecadação/convênio com 48 dígitos usando módulo 10.
const LINHA_ARRECADACAO_48_MOD10 = "816700000010234567890129345678901231456789012345";

// Linha digitável de arrecadação/convênio com 48 dígitos usando módulo 11.
const LINHA_ARRECADACAO_48_MOD11 = "818900000019234567890128345678901235456789012341";

describe("normalização e identificação de boletos", () => {
  it("normaliza espaços, pontos e traços", () => {
    expect(normalizarLinhaBoleto("34191.23454-67890.123457 67890.123457 1 12340000001000")).toBe(
      "34191234546789012345767890123457112340000001000"
    );
  });

  it("rejeita letras", () => {
    expect(() => normalizarLinhaBoleto("34191A09008 81020 334567")).toThrow("caracteres inválidos");
  });

  it("identifica formatos de 44, 47 e 48 dígitos", () => {
    expect(identificarFormatoBoleto(CODIGO_BARRAS_44)).toBe("codigo_barras_bancario_44");
    expect(identificarFormatoBoleto(normalizarLinhaBoleto(LINHA_BANCARIA_47))).toBe("linha_digitavel_bancaria_47");
    expect(identificarFormatoBoleto(LINHA_ARRECADACAO_48_MOD10)).toBe("linha_digitavel_arrecadacao_48");
  });

  it("rejeita quantidade incorreta de dígitos", () => {
    const resultado = validarBoleto("1234567890");
    expect(resultado.valido).toBe(false);
    expect(resultado.formato).toBe("invalido");
    expect(resultado.erros).toContain("Quantidade de dígitos inválida para boleto brasileiro.");
  });
});

describe("validação de boletos bancários", () => {
  it("aceita código de barras válido de 44 dígitos", () => {
    const resultado = validarBoleto(CODIGO_BARRAS_44);
    expect(resultado).toMatchObject({
      valido: true,
      formato: "codigo_barras_bancario_44",
      valorNormalizado: CODIGO_BARRAS_44,
      codigoCanonico: CODIGO_BARRAS_44,
    });
  });

  it("rejeita código de 44 dígitos alterado", () => {
    const resultado = validarBoleto("34195987600000654000900881020334567890000113");
    expect(resultado.valido).toBe(false);
    expect(resultado.erros).toContain("Dígito verificador geral do código de barras bancário é inválido.");
  });

  it("aceita linha bancária válida de 47 dígitos", () => {
    const resultado = validarBoleto(LINHA_BANCARIA_47);
    expect(resultado).toMatchObject({
      valido: true,
      formato: "linha_digitavel_bancaria_47",
      valorNormalizado: "34191234546789012345767890123457112340000001000",
      codigoCanonico: CODIGO_BARRAS_44,
    });
  });

  it("rejeita campo 1 com dígito incorreto", () => {
    const resultado = validarBoleto("34191.23455 67890.123457 67890.123457 1 12340000001000");
    expect(resultado.valido).toBe(false);
    expect(resultado.erros).toContain("Campo 1 da linha digitável bancária é inválido.");
  });

  it("rejeita campo 2 com dígito incorreto", () => {
    const resultado = validarBoleto("34191.23454 67890.123458 67890.123457 1 12340000001000");
    expect(resultado.valido).toBe(false);
    expect(resultado.erros).toContain("Campo 2 da linha digitável bancária é inválido.");
  });

  it("rejeita campo 3 com dígito incorreto", () => {
    const resultado = validarBoleto("34191.23454 67890.123457 67890.123458 1 12340000001000");
    expect(resultado.valido).toBe(false);
    expect(resultado.erros).toContain("Campo 3 da linha digitável bancária é inválido.");
  });

  it("converte corretamente 47 para 44", () => {
    expect(converterLinha47ParaCodigo44(LINHA_BANCARIA_47)).toBe(CODIGO_BARRAS_44);
  });

  it("produz o mesmo código canônico para a representação de 44 e 47 dígitos", () => {
    expect(obterCodigoCanonico(CODIGO_BARRAS_44)).toBe(CODIGO_BARRAS_44);
    expect(obterCodigoCanonico(LINHA_BANCARIA_47)).toBe(CODIGO_BARRAS_44);
  });
});

describe("validação de linhas de arrecadação", () => {
  it("aceita linha válida de 48 dígitos com módulo 10", () => {
    const resultado = validarBoleto(LINHA_ARRECADACAO_48_MOD10);
    expect(resultado).toMatchObject({
      valido: true,
      formato: "linha_digitavel_arrecadacao_48",
      valorNormalizado: LINHA_ARRECADACAO_48_MOD10,
    });
    expect(resultado.codigoCanonico).toBeUndefined();
  });

  it("aceita linha válida de 48 dígitos com módulo 11", () => {
    const resultado = validarBoleto(LINHA_ARRECADACAO_48_MOD11);
    expect(resultado).toMatchObject({
      valido: true,
      formato: "linha_digitavel_arrecadacao_48",
      valorNormalizado: LINHA_ARRECADACAO_48_MOD11,
    });
  });

  it("rejeita linha de 48 dígitos alterada", () => {
    const resultado = validarBoleto("816700000010234567890129345678901231456789012346");
    expect(resultado.valido).toBe(false);
    expect(resultado.erros).toContain("Campo 4 da linha digitável de arrecadação é inválido.");
  });
});