import { describe, expect, it } from "vitest";
import { gerarPadraoInterleaved2of5 } from "./pagar-boleto";
import {
  CLASSE_CAIXA_CODIGO_SEM_ROLAGEM,
  CLASSE_GRID_CODIGO_PAGAMENTO,
  acoesUnicasQuandoCodigoAberto,
  abrirCodigoAmpliado,
  fecharCodigoAmpliado,
  modulosTotaisCodigo,
  montarConfiguracaoSvgCodigo,
} from "./codigo-pagamento-ui";

const CODIGO_44 = "34191123400000010001234567890123456789012345";

describe("apresentacao do codigo de pagamento", () => {
  it("codigo sem rolagem horizontal", () => {
    expect(CLASSE_CAIXA_CODIGO_SEM_ROLAGEM).toContain("overflow-hidden");
    expect(CLASSE_CAIXA_CODIGO_SEM_ROLAGEM).not.toContain("overflow-x-auto");
  });

  it("area do codigo ocupa maior parte da linha no desktop", () => {
    expect(CLASSE_GRID_CODIGO_PAGAMENTO).toContain("35%");
    expect(CLASSE_GRID_CODIGO_PAGAMENTO).toContain("65%");
  });

  it("botao ampliar abre e fecha estado", () => {
    const aberto = abrirCodigoAmpliado({
      boletoId: "bol-1",
      codigoCanonico: CODIGO_44,
      fornecedor: "Fornecedor Teste",
      valor: 762.4,
      vencimento: "2026-08-20",
    });

    expect(aberto.boletoId).toBe("bol-1");
    expect(fecharCodigoAmpliado()).toBeNull();
  });

  it("somente um conjunto de acoes e exibido", () => {
    expect(acoesUnicasQuandoCodigoAberto()).toEqual([
      "mostrar_ou_ocultar_linha",
      "copiar_linha",
      "ampliar_codigo",
      "informar_pagamento",
      "ocultar_codigo",
    ]);
  });

  it("ampliacao nao altera o codigo", () => {
    const aberto = abrirCodigoAmpliado({
      boletoId: "bol-1",
      codigoCanonico: CODIGO_44,
      fornecedor: "Fornecedor Teste",
      valor: 762.4,
      vencimento: "2026-08-20",
    });
    expect(aberto.codigoCanonico).toBe(CODIGO_44);
  });

  it("configuracao svg mantem proporcao de modulos e margem branca lateral", () => {
    const segmentos = gerarPadraoInterleaved2of5(CODIGO_44);
    const configuracao = montarConfiguracaoSvgCodigo(segmentos, "linha");

    expect(configuracao.altura).toBeGreaterThanOrEqual(110);
    expect(configuracao.quietZone).toBeGreaterThan(0);
    expect(configuracao.retangulos.length).toBeGreaterThan(0);
    expect(configuracao.larguraModulos).toBe(modulosTotaisCodigo(segmentos));
    expect(configuracao.viewBox.startsWith("0 0 ")).toBe(true);
  });

  it("modo movel pressupoe codigo abaixo dos dados por grid unico sem colunas fixas", () => {
    expect(CLASSE_GRID_CODIGO_PAGAMENTO.startsWith("grid")).toBe(true);
    expect(CLASSE_GRID_CODIGO_PAGAMENTO.includes("lg:grid-cols")).toBe(true);
  });
});
