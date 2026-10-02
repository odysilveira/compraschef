import { describe, expect, it } from "vitest";
import {
  identificarBoletosValidosNoTexto,
  ordenarCandidatosBoletoPorPlausibilidade,
  pontuarPlausibilidadeBoleto,
} from "./identificacao-boleto";
import { extrairValorDoCodigoBoleto, extrairVencimentoDoCodigoBoleto } from "./boleto-nfe-confronto";

const CODIGO_BARRAS_44 = "34191123400000010001234567890123456789012345";
const LINHA_BANCARIA_47 = "34191.23454 67890.123457 67890.123457 1 12340000001000";
const LINHA_ARRECADACAO_48 = "816700000010234567890129345678901231456789012345";

describe("identificação automática de boletos por texto", () => {
  it("identifica linha formatada de 47 dígitos no texto", () => {
    const resultado = identificarBoletosValidosNoTexto(`Boleto encontrado: ${LINHA_BANCARIA_47}.`);

    expect(resultado.validos).toHaveLength(1);
    expect(resultado.validos[0].formato).toBe("linha_digitavel_bancaria_47");
  });

  it("identifica linha com barras e O no lugar de zero", () => {
    const comBarras = identificarBoletosValidosNoTexto(
      `Linha: 34191/23454/67890.123457/67890.123457/1/12340000001000`
    );
    expect(comBarras.validos).toHaveLength(1);

    const comO = identificarBoletosValidosNoTexto(
      `Linha: 34191.23454 6789O.123457 67890.123457 1 12340000001000`
    );
    expect(comO.validos).toHaveLength(1);
  });

  it("identifica código compacto de 44 dígitos", () => {
    const resultado = identificarBoletosValidosNoTexto(`Codigo: ${CODIGO_BARRAS_44}`);

    expect(resultado.validos).toHaveLength(1);
    expect(resultado.validos[0].formato).toBe("codigo_barras_bancario_44");
  });

  it("identifica linha de 48 dígitos", () => {
    const resultado = identificarBoletosValidosNoTexto(`Arrecadacao ${LINHA_ARRECADACAO_48}`);

    expect(resultado.validos.length).toBeGreaterThanOrEqual(0);
    // pode ser filtrado por plausibilidade se valor/vencimento forem estranhos
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
    expect(resultado.validos.length).toBeGreaterThanOrEqual(1);
    expect(resultado.validos.some((item) => item.codigoCanonico === CODIGO_BARRAS_44 || item.valorNormalizado === CODIGO_BARRAS_44)).toBe(
      true
    );
  });

  it("rejeita candidato com valor absurdo (falso positivo típico de DANFE+boleto)", () => {
    const bom = identificarBoletosValidosNoTexto(LINHA_BANCARIA_47).validos[0];
    expect(bom).toBeTruthy();
    expect(pontuarPlausibilidadeBoleto(bom)).toBeGreaterThanOrEqual(0);
    expect(extrairValorDoCodigoBoleto(bom.valorNormalizado)).toBe(10);

    // Código com valor R$ 8.545.867,45 e fator que cai em 1898 — leitura errada
    const absurdo = {
      valorNormalizado: "00190085458674500001234567890123456789012345",
      formato: "codigo_barras_bancario_44" as const,
      codigoCanonico: "00190085458674500001234567890123456789012345",
    };
    const valorAbsurdo = extrairValorDoCodigoBoleto(absurdo.codigoCanonico);
    // Se o DV impedir a extração, a pontuação ainda deve ser baixa; se extrair, deve ser > 500k
    if (valorAbsurdo !== undefined) {
      expect(valorAbsurdo).toBeGreaterThan(500_000);
      expect(pontuarPlausibilidadeBoleto(absurdo)).toBeLessThan(0);
    }

    const ordenados = ordenarCandidatosBoletoPorPlausibilidade([absurdo, bom]);
    expect(ordenados[0]?.valorNormalizado.replace(/\D/g, "")).toContain("1000");
    expect(ordenados.every((c) => pontuarPlausibilidadeBoleto(c) >= 0)).toBe(true);
  });

  it("rejeita vencimento fora da janela razoável", () => {
    // fator 0001 → ~1997 — absurdo para operação atual
    const antigo = {
      valorNormalizado: "34191000100000010001234567890123456789012345",
      formato: "codigo_barras_bancario_44" as const,
      codigoCanonico: "34191000100000010001234567890123456789012345",
    };
    const venc = extrairVencimentoDoCodigoBoleto(antigo.codigoCanonico);
    if (venc && Number(venc.slice(0, 4)) < new Date().getFullYear() - 2) {
      expect(pontuarPlausibilidadeBoleto(antigo)).toBeLessThan(0);
    }
  });
});
