import { describe, expect, it } from "vitest";
import {
  identificarBoletosValidosNoTexto,
} from "./identificacao-boleto";

const CODIGO_BARRAS_44 = "34191123400000010001234567890123456789012345";
const LINHA_BANCARIA_47 = "34191.23454 67890.123457 67890.123457 1 12340000001000";
const LINHA_ARRECADACAO_48 = "816700000010234567890129345678901231456789012345";

describe("identificação automática de boletos por texto", () => {
  it("identifica linha formatada de 47 dígitos no texto", () => {
    const resultado = identificarBoletosValidosNoTexto(`Boleto encontrado: ${LINHA_BANCARIA_47}.`);

    expect(resultado.validos).toHaveLength(1);
    expect(resultado.validos[0].formato).toBe("linha_digitavel_bancaria_47");
  });

  it("identifica código compacto de 44 dígitos", () => {
    const resultado = identificarBoletosValidosNoTexto(`Codigo: ${CODIGO_BARRAS_44}`);

    expect(resultado.validos).toHaveLength(1);
    expect(resultado.validos[0].formato).toBe("codigo_barras_bancario_44");
  });

  it("identifica linha de 48 dígitos", () => {
    const resultado = identificarBoletosValidosNoTexto(`Arrecadacao ${LINHA_ARRECADACAO_48}`);

    expect(resultado.validos).toHaveLength(1);
    expect(resultado.validos[0].formato).toBe("linha_digitavel_arrecadacao_48");
  });

  it("ignora sequências inválidas", () => {
    const resultado = identificarBoletosValidosNoTexto(
      "Números longos: 12345 67890 12345 67890 12345 67890 12345 67890 12345"
    );

    expect(resultado.validos).toHaveLength(0);
  });

  it("elimina duplicidade entre 44 e 47 do mesmo boleto", () => {
    const resultado = identificarBoletosValidosNoTexto(`${CODIGO_BARRAS_44} ${LINHA_BANCARIA_47}`);

    expect(resultado.validos).toHaveLength(1);
    expect(resultado.validos[0].codigoCanonico).toBe(CODIGO_BARRAS_44);
  });

  it("retorna mais de uma opção quando existem boletos válidos diferentes", () => {
    const resultado = identificarBoletosValidosNoTexto(`${CODIGO_BARRAS_44} texto ${LINHA_ARRECADACAO_48}`);

    expect(resultado.validos).toHaveLength(2);
    expect(resultado.validos.map((item) => item.valorNormalizado)).toEqual(expect.arrayContaining([CODIGO_BARRAS_44, LINHA_ARRECADACAO_48]));
  });
});
