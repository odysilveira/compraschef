import { describe, expect, it } from "vitest";
import { extrairDadosDanfeDoTexto, extrairItensDanfeDeTokens, extrairItensDanfeDoTexto, extrairNomeEmitenteDanfe } from "./danfe-extracao";

function gerarChaveNfeValida(base43: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i -= 1) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  return `${base43}${dv >= 10 ? 0 : dv}`;
}

const CHAVE = gerarChaveNfeValida("4116100950611100015455001000000772100999012");

describe("danfe-extracao", () => {
  it("lê emitente e itens de um texto estilo DANFE", () => {
    const texto = `
RECEBEMOS DE FERREIRA PRODUTOS DE LIMPEZA LTDA OS PRODUTOS CONSTANTES
DANFE
Chave de Acesso
${CHAVE.replace(/(\d{4})/g, "$1 ").trim()}
VALOR TOTAL DA NOTA R$ 328,54
1100 DETERGENTE GLASS 05 ML MULTIUSO UN 40,0000 7,5000 300,00
NF-03513476 DESENGRAXANTE H DE ALTA PERFORMANCE UN 1,0000 28,5400 28,54
`;
    const dados = extrairDadosDanfeDoTexto(texto);
    expect(dados.nota?.chave).toBe(CHAVE);
    expect(extrairNomeEmitenteDanfe(texto)).toMatch(/FERREIRA/i);
    const itens = extrairItensDanfeDoTexto(texto);
    expect(itens.length).toBeGreaterThanOrEqual(1);
    expect(itens[0].descricao).toMatch(/DETERGENTE/i);
  });

  it("aceita unidade KG e colunas extras à direita", () => {
    const itens = extrairItensDanfeDoTexto(
      "ABC123 TOMATE CEREJA KG 2,5000 12,0000 30,00 07020010 00 5102"
    );
    expect(itens).toHaveLength(1);
    expect(itens[0].unidade).toBe("KG");
    expect(itens[0].quantidade).toBe(2.5);
  });

  it("monta item a partir de tokens fragmentados por posição", () => {
    const itens = extrairItensDanfeDeTokens([
      { str: "1100", x: 10, y: 100 },
      { str: "DETERGENTE", x: 40, y: 100 },
      { str: "GLASS", x: 90, y: 100 },
      { str: "UN", x: 200, y: 100 },
      { str: "40,0000", x: 230, y: 100 },
      { str: "7,5000", x: 280, y: 100 },
      { str: "300,00", x: 330, y: 100 },
    ]);
    expect(itens).toHaveLength(1);
    expect(itens[0].codigo).toBe("1100");
    expect(itens[0].descricao).toMatch(/DETERGENTE/);
  });
});
