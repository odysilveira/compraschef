import { describe, expect, it } from "vitest";
import {
  classificarFalhaPdf,
  combinarTextosPdfFragmentados,
  criarBytesPdfComCopia,
  identificarCodigoBoletoNoArquivoLocal,
  deveManterCampoManual,
  validarResultadosVisuaisBrutos,
} from "./identificacao-boleto-browser";

const CODIGO_BARRAS_44 = "34191123400000010001234567890123456789012345";
const LINHA_BANCARIA_47 = "34191.23454 67890.123457 67890.123457 1 12340000001000";

describe("fallback visual de identificação de boleto", () => {
  it("lida com texto fragmentado de PDF", () => {
    const texto = combinarTextosPdfFragmentados({
      items: [
        { str: "34191." },
        { str: "23454" },
        { str: "67890.123457" },
        { str: "67890.123457" },
        { str: "1" },
        { str: "12340000001000" },
      ],
    });

    const resultado = validarResultadosVisuaisBrutos([texto]);
    expect(resultado.validos).toHaveLength(1);
    expect(resultado.validos[0].formato).toBe("linha_digitavel_bancaria_47");
  });

  it("aceita números separados no conteúdo visual", () => {
    const resultado = validarResultadosVisuaisBrutos([
      "34191 23454 67890 123457 67890 123457 1 12340000001000",
    ]);

    expect(resultado.validos).toHaveLength(1);
    expect(resultado.validos[0].formato).toBe("linha_digitavel_bancaria_47");
  });

  it("ignora leituras visuais inválidas", () => {
    const resultado = validarResultadosVisuaisBrutos([
      "1234 5678 9012 3456 7890 1234 5678 9012 3456",
      "99999.99999 99999.999999 99999.999999 9 99999999999999",
    ]);

    expect(resultado.validos).toHaveLength(0);
  });

  it("valida resultado visual e mantém somente códigos válidos de 44, 47 ou 48", () => {
    const resultado = validarResultadosVisuaisBrutos([
      CODIGO_BARRAS_44,
      "1234567890123456789012345678901234567890123",
      LINHA_BANCARIA_47,
    ]);

    expect(resultado.validos).toHaveLength(1);
    expect(resultado.validos[0].codigoCanonico).toBe(CODIGO_BARRAS_44);
  });

  it("mantém fallback manual quando não há identificação válida", () => {
    const semValido = validarResultadosVisuaisBrutos(["sem dígitos úteis"]);
    const comValido = validarResultadosVisuaisBrutos([CODIGO_BARRAS_44]);

    expect(deveManterCampoManual(semValido)).toBe(true);
    expect(deveManterCampoManual(comValido)).toBe(false);
  });

  it("não oculta falha técnica e retorna diagnóstico", async () => {
    const arquivoInvalido = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "falho.png", {
      type: "image/png",
    });

    const resultado = await identificarCodigoBoletoNoArquivoLocal(arquivoInvalido, () => false);

    expect(resultado.validos).toHaveLength(0);
    expect(resultado.diagnostico.resultadoValidoEncontrado).toBe(false);
    expect(resultado.diagnostico.falhaTecnica).toBeTruthy();
  });

  it("classifica falhas de PDF em categorias seguras", () => {
    expect(classificarFalhaPdf(new Error("Setting up fake worker failed"))).toBe("worker não carregado");
    expect(classificarFalhaPdf(new Error("PasswordException: password required"))).toBe("PDF protegido por senha");
    expect(classificarFalhaPdf(new Error("InvalidPDFException: invalid pdf structure"))).toBe("PDF inválido");
    expect(classificarFalhaPdf(new Error("AbortException: operation cancelled"))).toBe("leitura cancelada");
    expect(classificarFalhaPdf(new Error("something else"))).toBe("erro desconhecido");
  });

  it("cria Uint8Array com cópia do buffer original", () => {
    const original = new Uint8Array([10, 20, 30, 40]);
    const bytes = criarBytesPdfComCopia(original.buffer);

    original[0] = 99;

    expect(bytes[0]).toBe(10);
    expect(bytes).not.toBe(original);
  });
});
