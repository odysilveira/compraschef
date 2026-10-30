import { describe, expect, it } from "vitest";
import type { SaiposConsumoArquivoState } from "./saipos-consumo-arquivo";
import { resultadoConsolidadoVazio } from "./saipos-consumo-arquivo";
import {
  extrairTamanhoPergunta,
  extrairTermoPergunta,
  listarMesesNoIntervalo,
  montarFatosVendas,
  responderFatosDeterministico,
} from "./saipos-assistente-fatos";
import type { VendasSaipos } from "./saipos-vendas";

function vendas(
  itens: VendasSaipos["itens"],
  pratos: VendasSaipos["pratos_montados"] = []
): VendasSaipos {
  const fat = itens.reduce((s, i) => s + i.valor, 0);
  const qtd = itens.reduce((s, i) => s + i.quantidade, 0);
  const por_categoria: VendasSaipos["por_categoria"] = {};
  for (const i of itens) {
    const s = por_categoria[i.categoria] ?? { quantidade: 0, valor: 0 };
    s.quantidade += i.quantidade;
    s.valor += i.valor;
    por_categoria[i.categoria] = s;
  }
  return {
    itens,
    totais: { quantidade_itens: qtd, faturamento: fat },
    por_categoria,
    pratos_montados: pratos,
  };
}

function state3meses(): SaiposConsumoArquivoState {
  return {
    version: 1,
    arquivos: [
      {
        id: "1",
        mes_ref: "2026-01",
        periodo_inicio: null,
        periodo_fim: null,
        periodo_rotulo: null,
        nome_arquivo: "jan.xlsx",
        formato: "hierarquico",
        enviado_em: "2026-02-01T00:00:00.000Z",
        total_itens: 1,
        total_opcoes: 0,
        resultado: resultadoConsolidadoVazio(),
        vendas: vendas(
          [
            { item: "Tiramisu", categoria: "sobremesa", quantidade: 10, valor: 180 },
            { item: "Coca-Cola Lata", categoria: "bebida", quantidade: 20, valor: 100 },
          ],
          [
            {
              massa: "Penne",
              molho: "Bolonhesa",
              tamanho: "G",
              quantidade: 12,
              valor: 400,
              rateio_aproximado: false,
            },
          ]
        ),
      },
      {
        id: "2",
        mes_ref: "2026-02",
        periodo_inicio: null,
        periodo_fim: null,
        periodo_rotulo: null,
        nome_arquivo: "fev.xlsx",
        formato: "hierarquico",
        enviado_em: "2026-03-01T00:00:00.000Z",
        total_itens: 1,
        total_opcoes: 0,
        resultado: resultadoConsolidadoVazio(),
        vendas: vendas(
          [
            { item: "Tiramisu", categoria: "sobremesa", quantidade: 25, valor: 450 },
            { item: "Coca-Cola Lata", categoria: "bebida", quantidade: 15, valor: 75 },
          ],
          [
            {
              massa: "Talharim",
              molho: "Bolonhesa",
              tamanho: "G",
              quantidade: 8,
              valor: 280,
              rateio_aproximado: false,
            },
            {
              massa: "Penne",
              molho: "Pomodoro",
              tamanho: "P",
              quantidade: 5,
              valor: 100,
              rateio_aproximado: false,
            },
          ]
        ),
      },
      {
        id: "3",
        mes_ref: "2026-03",
        periodo_inicio: null,
        periodo_fim: null,
        periodo_rotulo: null,
        nome_arquivo: "mar.xlsx",
        formato: "hierarquico",
        enviado_em: "2026-04-01T00:00:00.000Z",
        total_itens: 1,
        total_opcoes: 0,
        resultado: resultadoConsolidadoVazio(),
        vendas: vendas([{ item: "Tiramisu", categoria: "sobremesa", quantidade: 8, valor: 144 }]),
      },
    ],
  };
}

describe("saipos-assistente-fatos", () => {
  it("lista meses no intervalo", () => {
    expect(listarMesesNoIntervalo("2026-01", "2026-03")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("extrai termo tiramisu da pergunta", () => {
    expect(extrairTermoPergunta("qual mês vendeu mais tiramisu?")).toBe("tiramisu");
    expect(extrairTermoPergunta("Como foram as bebidas?")).toBe("bebida");
  });

  it("reconhece Box G e soma porções no período", () => {
    expect(extrairTamanhoPergunta("quantos box g venderam no período?")).toBe("G");
    expect(extrairTermoPergunta("quantos box g venderam no período?")).toBe("box g");

    const fatos = montarFatosVendas(
      state3meses(),
      "2026-01",
      "2026-03",
      "quantos box g venderam no período?"
    );
    const totG = fatos.totais_por_tamanho.find((t) => t.tamanho === "G");
    expect(totG?.quantidade).toBe(20); // 12 + 8
    const texto = responderFatosDeterministico("quantos box g venderam no período?", fatos);
    expect(texto.toLowerCase()).toContain("box g");
    expect(texto).toContain("20");
  });

  it("destaca fevereiro como melhor mês do tiramisu", () => {
    const fatos = montarFatosVendas(
      state3meses(),
      "2026-01",
      "2026-03",
      "qual mês vendeu mais tiramisu?"
    );
    expect(fatos.meses_faltando).toEqual([]);
    expect(fatos.destaque?.mes_ref).toBe("2026-02");
    expect(fatos.destaque?.quantidade).toBe(25);
    expect(fatos.serie_item).toHaveLength(3);

    const texto = responderFatosDeterministico("qual mês vendeu mais tiramisu?", fatos);
    expect(texto.toLowerCase()).toContain("fevereiro");
    expect(texto).toContain("25");
  });

  it("marca mês faltando no intervalo", () => {
    const state = state3meses();
    state.arquivos = state.arquivos.filter((a) => a.mes_ref !== "2026-02");
    const fatos = montarFatosVendas(state, "2026-01", "2026-03", "top 5");
    expect(fatos.meses_faltando).toEqual(["2026-02"]);
  });
});
