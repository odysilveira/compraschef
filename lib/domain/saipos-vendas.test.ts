import { describe, expect, it } from "vitest";
import { lerExport, processarMatrizItensVendidos } from "./saipos-itens-vendidos";
import {
  agregarVendasSaipos,
  montarVendasSaipos,
  parseVendasSaipos,
  vendasVazias,
} from "./saipos-vendas";
import {
  agregarArquivosConsumoSaipos,
  parseEstadoArquivoConsumo,
  relatorioParaArquivoMes,
  resultadoConsolidadoVazio,
} from "./saipos-consumo-arquivo";

function matrizHierarquica(): unknown[][] {
  return [
    ["Data Inicial", "01/03/2026", "Data Final", "07/03/2026"],
    [],
    ["Itens e Opções", "Quantidade", "Valor Total"],
    ["Macarrao Bolonhesa", 10, 390],
    ["- Penne Box G (aprox. 800g)", 10, 0],
    ["- Bolonhesa Box G", 10, 0],
    ["Macarrao Bolonhesa", 5, 150],
    ["- Talharim Box P (aprox. 450g)", 5, 0],
    ["- Bolonhesa Box P", 5, 0],
    ["Risoto Funghi", 3, 120],
    ["- Funghi", 3, 0],
    ["Coca-Cola Lata", 8, 40],
    ["Tiramisu", 2, 36],
  ];
}

describe("saipos-vendas", () => {
  it("lê valor em string/moeda do Excel (não só number)", () => {
    const matriz: unknown[][] = [
      ["Itens e Opções", "Quantidade", "Valor Total"],
      ["Coca-Cola Lata", 4, "R$ 20,00"],
      ["Tiramisu", 2, "36,50"],
    ];
    const rel = processarMatrizItensVendidos(matriz, "valores.xlsx");
    expect(rel.vendas?.totais.faturamento).toBe(56.5);
    const coca = rel.vendas?.itens.find((i) => i.item.includes("Coca"));
    expect(coca?.valor).toBe(20);
  });

  it("soma qtd e faturamento por item Saipos", () => {
    const lido = lerExport(matrizHierarquica());
    const vendas = montarVendasSaipos(lido.grupos);
    const mac = vendas.itens.find((i) => i.item === "Macarrao Bolonhesa");
    expect(mac?.quantidade).toBe(15);
    expect(mac?.valor).toBe(540);
    expect(mac?.categoria).toBe("prato");

    const coca = vendas.itens.find((i) => i.item.toLowerCase().includes("coca"));
    expect(coca?.categoria).toBe("bebida");
    expect(coca?.quantidade).toBe(8);
    expect(coca?.valor).toBe(40);

    expect(vendas.totais.faturamento).toBe(540 + 120 + 40 + 36);
    expect(vendas.por_categoria.bebida?.valor).toBe(40);
    expect(vendas.por_categoria.sobremesa?.valor).toBe(36);
    expect(vendas.por_categoria.risoto?.quantidade).toBe(3);
  });

  it("monta pratos Massa · Molho · Tamanho com valor", () => {
    const lido = lerExport(matrizHierarquica());
    const vendas = montarVendasSaipos(lido.grupos);
    const penneG = vendas.pratos_montados.find(
      (p) => p.massa === "Penne" && p.molho === "Bolonhesa" && p.tamanho === "G"
    );
    expect(penneG?.quantidade).toBe(10);
    expect(penneG?.valor).toBe(390);

    const talharimP = vendas.pratos_montados.find(
      (p) => p.massa === "Talharim" && p.molho === "Bolonhesa" && p.tamanho === "P"
    );
    expect(talharimP?.quantidade).toBe(5);
    expect(talharimP?.valor).toBe(150);
  });

  it("entra nas abas do relatório processado", () => {
    const rel = processarMatrizItensVendidos(matrizHierarquica(), "teste.xlsx");
    expect(rel.vendas?.totais.faturamento).toBeGreaterThan(0);
    expect(rel.abas.some((a) => a.nome === "Vendas")).toBe(true);
    expect(rel.abas.some((a) => a.nome === "Pratos montados")).toBe(true);
  });

  it("agrega vendas de vários meses", () => {
    const a = montarVendasSaipos(lerExport(matrizHierarquica()).grupos);
    const b = {
      ...vendasVazias(),
      itens: [{ item: "Coca-Cola Lata", categoria: "bebida" as const, quantidade: 2, valor: 10 }],
      totais: { quantidade_itens: 2, faturamento: 10 },
      por_categoria: { bebida: { quantidade: 2, valor: 10 } },
      pratos_montados: [],
    };
    const agg = agregarVendasSaipos([a, b]);
    const coca = agg.itens.find((i) => i.item.includes("Coca"));
    expect(coca?.quantidade).toBe(10);
    expect(coca?.valor).toBe(50);
  });

  it("parse ignora arquivo antigo sem vendas e aceita payload válido", () => {
    expect(parseVendasSaipos(undefined)).toBeUndefined();
    expect(parseVendasSaipos({ foo: 1 })).toBeUndefined();
    const parsed = parseVendasSaipos({
      itens: [{ item: "X", categoria: "bebida", quantidade: 1, valor: 5 }],
      pratos_montados: [],
    });
    expect(parsed?.totais.faturamento).toBe(5);
  });

  it("arquivo mensal persiste vendas e agregado De/Até soma R$", () => {
    const rel = processarMatrizItensVendidos(matrizHierarquica(), "mar.xlsx");
    const arq = relatorioParaArquivoMes(rel, "2026-03");
    expect(arq.vendas?.totais.faturamento).toBe(rel.vendas?.totais.faturamento);

    const state = parseEstadoArquivoConsumo({
      version: 1,
      arquivos: [
        arq,
        {
          id: "saipos-2026-04",
          mes_ref: "2026-04",
          periodo_inicio: null,
          periodo_fim: null,
          periodo_rotulo: null,
          nome_arquivo: "abr.xlsx",
          formato: "hierarquico",
          enviado_em: "2026-05-01T00:00:00.000Z",
          total_itens: 1,
          total_opcoes: 0,
          resultado: resultadoConsolidadoVazio(),
          // sem vendas — compatível
        },
        {
          id: "saipos-2026-05",
          mes_ref: "2026-05",
          periodo_inicio: null,
          periodo_fim: null,
          periodo_rotulo: null,
          nome_arquivo: "mai.xlsx",
          formato: "hierarquico",
          enviado_em: "2026-06-01T00:00:00.000Z",
          total_itens: 1,
          total_opcoes: 0,
          resultado: resultadoConsolidadoVazio(),
          vendas: {
            itens: [{ item: "Sprite", categoria: "bebida", quantidade: 1, valor: 7 }],
            totais: { quantidade_itens: 1, faturamento: 7 },
            por_categoria: { bebida: { quantidade: 1, valor: 7 } },
            pratos_montados: [],
          },
        },
      ],
    });

    expect(state.arquivos.find((a) => a.mes_ref === "2026-04")?.vendas).toBeUndefined();
    const agg = agregarArquivosConsumoSaipos(
      state.arquivos.filter((a) => a.mes_ref >= "2026-03" && a.mes_ref <= "2026-05")
    );
    expect(agg?.vendas?.totais.faturamento).toBe((rel.vendas?.totais.faturamento ?? 0) + 7);
    expect(agg?.abas.some((a) => a.nome === "Vendas")).toBe(true);
  });
});
