import { describe, expect, it } from "vitest";
import type { FichaTecnica } from "../types";
import {
  atualizarLinhaNutricional,
  criarInformacaoNutricionalPadrao,
  formatarValorNutricional,
  normalizarFichaTecnicaComNutricao,
  normalizarInformacaoNutricional,
  REFERENCIA_IN75_2020,
} from "./fichas-tecnicas-nutricao";

function obterLinha(info: ReturnType<typeof normalizarInformacaoNutricional>, codigo: string) {
  return info.linhas.find((linha) => linha.codigo === codigo);
}

describe("nutrição manual", () => {
  it("mantém as referências da IN 75/2020 alinhadas ao Anexo II", () => {
    expect(REFERENCIA_IN75_2020.valor_energetico_kcal).toBe(2000);
    expect(REFERENCIA_IN75_2020.carboidratos_g).toBe(300);
    expect(REFERENCIA_IN75_2020.acucares_adicionados_g).toBe(50);
    expect(REFERENCIA_IN75_2020.proteinas_g).toBe(50);
    expect(REFERENCIA_IN75_2020.gorduras_totais_g).toBe(65);
    expect(REFERENCIA_IN75_2020.gorduras_saturadas_g).toBe(20);
    expect(REFERENCIA_IN75_2020.gorduras_trans_g).toBe(2);
    expect(REFERENCIA_IN75_2020.fibra_alimentar_g).toBe(25);
    expect(REFERENCIA_IN75_2020.sodio_mg).toBe(2000);
  });

  it("converte valor por 100 g para porção", () => {
    const info = normalizarInformacaoNutricional({
      tamanho_porcao: 50,
      linhas: [
        { codigo: "carboidratos_g", rotulo: "Carboidratos", unidade: "g", valor_por_100: 30, valor_por_porcao: null },
      ],
    });

    expect(info.linhas.find((linha) => linha.codigo === "carboidratos_g")?.valor_por_porcao).toBe(15);
  });

  it("converte valor por porção para 100 g", () => {
    const info = normalizarInformacaoNutricional({
      tamanho_porcao: 50,
      linhas: [
        { codigo: "proteinas_g", rotulo: "Proteínas", unidade: "g", valor_por_100: null, valor_por_porcao: 10 },
      ],
    });

    expect(info.linhas.find((linha) => linha.codigo === "proteinas_g")?.valor_por_100).toBe(20);
  });

  it("converte kcal para kJ e vice-versa", () => {
    const info = atualizarLinhaNutricional(
      normalizarInformacaoNutricional({ tamanho_porcao: 100 }),
      "valor_energetico_kcal",
      "valor_por_100",
      200
    );

    const kcal = info.linhas.find((linha) => linha.codigo === "valor_energetico_kcal");
    const kj = info.linhas.find((linha) => linha.codigo === "valor_energetico_kj");

    expect(kcal?.valor_por_100).toBe(200);
    expect(kj?.valor_por_100).toBeCloseTo(836.8, 1);

    const infoReversa = atualizarLinhaNutricional(info, "valor_energetico_kj", "valor_por_100", 418.4);
    const kcalReversa = infoReversa.linhas.find((linha) => linha.codigo === "valor_energetico_kcal");
    expect(kcalReversa?.valor_por_100).toBeCloseTo(100, 5);
  });

  it("calcula %VD com a referência da IN 75/2020", () => {
    const info = normalizarInformacaoNutricional({
      tamanho_porcao: 100,
      linhas: [
        { codigo: "valor_energetico_kcal", rotulo: "Valor energético (kcal)", unidade: "kcal", valor_por_100: 250, valor_por_porcao: null },
        { codigo: "acucares_totais_g", rotulo: "Açúcares totais", unidade: "g", valor_por_100: 12, valor_por_porcao: null },
        { codigo: "sodio_mg", rotulo: "Sódio", unidade: "mg", valor_por_100: 1000, valor_por_porcao: null },
        { codigo: "proteinas_g", rotulo: "Proteínas", unidade: "g", valor_por_100: 25, valor_por_porcao: null },
        { codigo: "gorduras_totais_g", rotulo: "Gorduras totais", unidade: "g", valor_por_100: 13, valor_por_porcao: null },
        { codigo: "gorduras_saturadas_g", rotulo: "Gorduras saturadas", unidade: "g", valor_por_100: 10, valor_por_porcao: null },
        { codigo: "gorduras_trans_g", rotulo: "Gorduras trans", unidade: "g", valor_por_100: 1, valor_por_porcao: null },
      ],
    });

    const sodio = obterLinha(info, "sodio_mg");
    const proteinas = obterLinha(info, "proteinas_g");
    const gordurasTotais = obterLinha(info, "gorduras_totais_g");
    const gordurasSaturadas = obterLinha(info, "gorduras_saturadas_g");
    const gordurasTrans = obterLinha(info, "gorduras_trans_g");
    const acucaresTotais = obterLinha(info, "acucares_totais_g");
    const valorEnergeticoKj = obterLinha(info, "valor_energetico_kj");

    expect(sodio?.vd_por_100).toBeCloseTo((1000 / REFERENCIA_IN75_2020.sodio_mg) * 100, 5);
    expect(proteinas?.vd_por_100).toBeCloseTo((25 / REFERENCIA_IN75_2020.proteinas_g) * 100, 5);
    expect(gordurasTotais?.vd_por_100).toBeCloseTo((13 / REFERENCIA_IN75_2020.gorduras_totais_g) * 100, 5);
    expect(gordurasSaturadas?.vd_por_100).toBeCloseTo((10 / REFERENCIA_IN75_2020.gorduras_saturadas_g) * 100, 5);
    expect(gordurasTrans?.vd_por_100).toBeCloseTo((1 / REFERENCIA_IN75_2020.gorduras_trans_g) * 100, 5);
    expect(acucaresTotais?.vd_por_100).toBeNull();
    expect(valorEnergeticoKj?.vd_por_100).toBeNull();
  });

  it("recalcula valores e %VD por porção quando a porção muda", () => {
    const infoBase = normalizarInformacaoNutricional({
      tamanho_porcao: 50,
      linhas: [
        { codigo: "proteinas_g", rotulo: "Proteínas", unidade: "g", valor_por_100: 100, valor_por_porcao: null },
      ],
    });

    const proteina50 = obterLinha(infoBase, "proteinas_g");
    expect(proteina50?.valor_por_porcao).toBe(50);
    expect(proteina50?.vd_por_porcao).toBeCloseTo(100, 5);

    const recalculada = normalizarInformacaoNutricional({
      ...infoBase,
      tamanho_porcao: 25,
    });

    const proteina25 = obterLinha(recalculada, "proteinas_g");
    expect(proteina25?.valor_por_100).toBe(100);
    expect(proteina25?.valor_por_porcao).toBe(25);
    expect(proteina25?.vd_por_porcao).toBeCloseTo(50, 5);
  });

  it("não sobrescreve ajuste manual por porção ao recalcular a porção", () => {
    const infoManual = atualizarLinhaNutricional(
      normalizarInformacaoNutricional({ tamanho_porcao: 50 }),
      "proteinas_g",
      "valor_por_porcao",
      12
    );

    const recalculada = normalizarInformacaoNutricional({
      ...infoManual,
      tamanho_porcao: 25,
    });

    const proteinas = obterLinha(recalculada, "proteinas_g");
    expect(proteinas?.ajuste_manual_por_porcao).toBe(true);
    expect(proteinas?.valor_por_porcao).toBe(12);
    expect(proteinas?.valor_por_100).toBe(48);
    expect(proteinas?.vd_por_porcao).toBeCloseTo((12 / REFERENCIA_IN75_2020.proteinas_g) * 100, 5);
  });

  it("mantém campos vazios sem NaN ou Infinity", () => {
    const info = criarInformacaoNutricionalPadrao();
    expect(info.linhas.every((linha) => linha.valor_por_100 === null || Number.isFinite(linha.valor_por_100))).toBe(true);
    expect(info.linhas.every((linha) => linha.valor_por_porcao === null || Number.isFinite(linha.valor_por_porcao))).toBe(true);
    expect(formatarValorNutricional(undefined, "g")).toBe("—");
  });

  it("aceita zero e rejeita valores negativos", () => {
    const infoZero = normalizarInformacaoNutricional({
      tamanho_porcao: 100,
      linhas: [
        { codigo: "fibra_alimentar_g", rotulo: "Fibra alimentar", unidade: "g", valor_por_100: 0, valor_por_porcao: null },
      ],
    });

    expect(infoZero.linhas.find((linha) => linha.codigo === "fibra_alimentar_g")?.valor_por_porcao).toBe(0);

    expect(() =>
      normalizarInformacaoNutricional({
        tamanho_porcao: 100,
        linhas: [
          { codigo: "fibra_alimentar_g", rotulo: "Fibra alimentar", unidade: "g", valor_por_100: -1, valor_por_porcao: null },
        ],
      })
    ).toThrow(/negativos/);
  });

  it("preserva a seção de alergênicos ao normalizar nutrição da ficha", () => {
    const ficha: FichaTecnica = {
      id: "f-1",
      nome: "Teste",
      status: "rascunho",
      versao: "1.0.0",
      rendimento_quantidade: 1,
      rendimento_unidade_id: "u-kg",
      ingredientes: [],
      passos: [],
      alergenicos: {
        gluten: "CONTEM",
        lactose: "NAO_INFORMADO",
        ovos: "NAO_INFORMADO",
        peixes: "NAO_INFORMADO",
        crustaceos: "NAO_INFORMADO",
        soja: "NAO_INFORMADO",
        castanhas: "NAO_INFORMADO",
        amendoim: "NAO_INFORMADO",
      },
      informacao_nutricional: {
        origem: "MANUAL",
        fonte_descricao: "Planilha interna",
        status_validacao: "estimado",
        linhas: [],
      },
      criado_em: "2026-08-01T00:00:00Z",
      atualizado_em: "2026-08-01T00:00:00Z",
    };

    const normalizada = normalizarFichaTecnicaComNutricao(ficha);

    expect(normalizada.alergenicos).toEqual(ficha.alergenicos);
    expect(normalizada.informacao_nutricional?.origem).toBe("MANUAL");
  });

  it("restaura dados serializados sem perder informações", () => {
    const info = normalizarInformacaoNutricional({
      origem: "MANUAL",
      fonte_descricao: "Laudo interno",
      data_referencia: "2026-08-01",
      responsavel: "nutricionista",
      status_validacao: "conferido",
      tamanho_porcao: 80,
      unidade_porcao: "g",
      quantidade_porcoes: 4,
      observacoes: "Revisado manualmente",
      linhas: [
        { codigo: "gorduras_totais_g", rotulo: "Gorduras totais", unidade: "g", valor_por_100: 12, valor_por_porcao: null },
      ],
    });

    const restaurado = normalizarInformacaoNutricional(JSON.parse(JSON.stringify(info)));
    expect(restaurado.fonte_descricao).toBe("Laudo interno");
    expect(restaurado.quantidade_porcoes).toBe(4);
    expect(restaurado.linhas.find((linha) => linha.codigo === "gorduras_totais_g")?.valor_por_porcao).toBeCloseTo(9.6, 5);
  });
});
