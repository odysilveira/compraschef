import { describe, expect, it } from "vitest";
import {
  classificarOpcao,
  consolidar,
  gramaturaMassaCruaG,
  lerExport,
  processarMatrizItensVendidos,
  totalDe,
} from "./saipos-itens-vendidos";
import type { DB } from "../types";

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
    ["Combo Família", 2, 100],
    ["- Penne Box G (aprox. 800g)", 2, 0],
    ["- Bolonhesa Box G", 1, 0],
    ["- Parisiense Box G", 1, 0],
    ["Observacao pedido", 1, 0],
    ["- Sem cebola", 1, 0],
  ];
}

describe("saipos-itens-vendidos", () => {
  it("classifica massa, molho e observação", () => {
    expect(classificarOpcao("Penne Box G (aprox. 800g)").cat).toBe("MASSA");
    expect(classificarOpcao("Bolonhesa Box G").cat).toBe("MOLHO");
    expect(classificarOpcao("Sem cebola").cat).toBe("OBSERVACAO");
  });

  it("lê layout hierárquico e consolida molho x massa", () => {
    const lido = lerExport(matrizHierarquica());
    expect(lido.formato).toBe("hierarquico");
    expect(lido.grupos.length).toBeGreaterThanOrEqual(3);

    const res = consolidar(lido.grupos, lido.soltas);
    expect(totalDe(res.massaTamanho)).toBeGreaterThan(0);
    expect(totalDe(res.molhoTamanho)).toBeGreaterThan(0);
    // 10 do prato + 1 rateado do combo (2 penne × 1 bolonhesa / 2 molhos)
    expect(res.molhoMassa["Bolonhesa\u0000Penne"]).toBe(11);
    expect(res.molhoMassa["Bolonhesa\u0000Talharim"]).toBe(5);
    expect(res.risotos.Funghi).toBe(3);
    expect(res.observacoes["Sem cebola"]).toBe(1);
  });

  it("detecta divergência quando massas não fecham com o item", () => {
    const matriz: unknown[][] = [
      ["Itens e Opções", "Quantidade"],
      ["Macarrao Bolonhesa", 10],
      ["- Penne Box G", 8],
      ["- Bolonhesa Box G", 10],
    ];
    const lido = lerExport(matriz);
    const res = consolidar(lido.grupos, []);
    expect(res.divergencias.some((d) => d.Verificacao === "massas")).toBe(true);
  });

  it("usa gramatura do catálogo e monta consumo", () => {
    const g = gramaturaMassaCruaG("Penne", "G");
    expect(g.origem).toBe("catalogo");
    expect(g.gramas).toBe(240);

    const rel = processarMatrizItensVendidos(matrizHierarquica(), "teste.xlsx");
    const consumo = rel.abas.find((a) => a.nome === "Consumo massa (kg)");
    expect(consumo).toBeTruthy();
    expect(consumo!.dados.some((l) => l.Massa === "TOTAL")).toBe(true);

    const validacao = rel.abas.find((a) => a.nome === "Validacao");
    expect(validacao).toBeTruthy();
  });

  it("prefere gramatura da ficha técnica quando há porcionamento Box G", () => {
    const db = {
      produtos: [],
      fichas_tecnicas_receitas: [
        {
          id: "rec-penne",
          codigo: "PENNE",
          nome: "Penne",
          criado_em: "",
          atualizado_em: "",
        },
      ],
      fichas_tecnicas_versoes: [
        {
          id: "ver-1",
          receita_id: "rec-penne",
          numero_versao: "1",
          status: "publicada" as const,
          configuracoes_porcionamento: [
            {
              id: "p1",
              nome: "Box G",
              codigo: "box-g",
              quantidade_por_porcao: 250,
              unidade: "g",
              quantidade_porcoes_teorica: 1,
              ativa: true,
            },
          ],
          ficha: {
            id: "f1",
            nome: "Penne",
            status: "publicada" as const,
            versao: "1",
            rendimento_quantidade: 1,
            rendimento_unidade_id: "un-kg",
            ingredientes: [],
            passos: [],
          },
          criado_em: "",
          atualizado_em: "",
        },
      ],
      fichas_tecnicas: [],
    } as unknown as DB;

    const g = gramaturaMassaCruaG("Penne", "G", db);
    expect(g.origem).toBe("ficha");
    expect(g.gramas).toBe(250);
  });

  it("lê layout plano (itens + opções separados)", () => {
    const matriz: unknown[][] = [
      ["Itens", "Quantidade"],
      ["Macarrao Bolonhesa", 4],
      [],
      ["Item de opção", "Quantidade"],
      ["Penne Box G", 4],
      ["Bolonhesa Box G", 4],
    ];
    const lido = lerExport(matriz);
    expect(lido.formato).toBe("plano");
    expect(lido.grupos).toHaveLength(1);
    expect(lido.soltas.length).toBe(2);
    const res = consolidar(lido.grupos, lido.soltas);
    expect(res.semCruzamento).toBe(true);
    expect(totalDe(res.massaTamanho)).toBe(4);
  });
});
