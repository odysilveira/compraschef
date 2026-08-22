import { describe, expect, it } from "vitest";
import { extrairDadosDanfeDoTexto, extrairItensDanfeDoTexto, extrairNomeEmitenteDanfe } from "./danfe-extracao";

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
});
