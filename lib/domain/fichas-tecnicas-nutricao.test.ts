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

describe("nutrição manual", () => {
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
        { codigo: "sodio_mg", rotulo: "Sódio", unidade: "mg", valor_por_100: 1000, valor_por_porcao: null },
      ],
    });

    const sodio = info.linhas.find((linha) => linha.codigo === "sodio_mg");
    expect(sodio?.vd_por_100).toBeCloseTo((1000 / REFERENCIA_IN75_2020.sodio_mg) * 100, 5);
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
