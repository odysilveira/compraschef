import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  analisarPlanilhaPrecosFranquia,
  PRECOS_FRANQUIA_MAX_BYTES,
  validarArquivoPrecosFranquia,
} from "./importar-precos-franquia";
import { aplicarTabelaFranquiaNasFichas } from "./tabela-precos-venda";
import { normalizarCanaisPrecoFicha } from "./fichas-tecnicas-comercial";
import { seedDB } from "../data/seed";

function criarPlanilha(linhas: unknown[][], aba = "Franquia"): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(linhas);
  XLSX.utils.book_append_sheet(workbook, sheet, aba);
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

describe("importar preços da franquia (Excel)", () => {
  it("rejeita extensão inválida e arquivo vazio", () => {
    expect(validarArquivoPrecosFranquia({ name: "precos.csv", size: 10 })).toContain(".xlsx");
    expect(validarArquivoPrecosFranquia({ name: "precos.xlsx", size: 0 })).toContain("vazio");
    expect(
      validarArquivoPrecosFranquia({ name: "precos.xlsx", size: PRECOS_FRANQUIA_MAX_BYTES + 1 })
    ).toContain("10 MB");
  });

  it("lê cabeçalhos flexíveis e preços BR", () => {
    const buffer = criarPlanilha([
      ["Código", "Prato", "Saipos", "iFood", "99"],
      ["IT-PENNE-BOLONHESA", "Penne Bolonhesa", "39,90", "R$ 44,90", "43.90"],
      ["", "Sem preço", "", "", ""],
    ]);
    const resultado = analisarPlanilhaPrecosFranquia(buffer);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.linhas).toHaveLength(1);
    expect(resultado.linhas[0].codigo).toBe("IT-PENNE-BOLONHESA");
    expect(resultado.linhas[0].preco_loja).toBe(39.9);
    expect(resultado.linhas[0].preco_ifood).toBe(44.9);
    expect(resultado.linhas[0].preco_99).toBe(43.9);
  });

  it("exige coluna de identificação e de preço", () => {
    const semNome = analisarPlanilhaPrecosFranquia(
      criarPlanilha([
        ["Loja", "iFood"],
        ["10", "12"],
      ])
    );
    expect(semNome.ok).toBe(false);

    const semPreco = analisarPlanilhaPrecosFranquia(
      criarPlanilha([
        ["Nome"],
        ["Penne"],
      ])
    );
    expect(semPreco.ok).toBe(false);
  });

  it("aplica planilha nas fichas do seed", () => {
    const buffer = criarPlanilha([
      ["codigo", "nome", "loja", "ifood", "99"],
      ["IT-PENNE-BOLONHESA", "Penne Bolonhesa", 39.9, 44.9, 43.9],
    ]);
    const analise = analisarPlanilhaPrecosFranquia(buffer);
    expect(analise.ok).toBe(true);
    if (!analise.ok) return;

    const db = structuredClone(seedDB);
    const aplicados = aplicarTabelaFranquiaNasFichas(db, analise.linhas);
    expect(aplicados).toBe(1);
    const canais = normalizarCanaisPrecoFicha(
      db.fichas_tecnicas_versoes?.find((v) => v.id === "ft-it-penne-bolonhesa")?.ficha.canais_preco
    );
    expect(canais.find((c) => c.canal === "balcao")?.preco_praticado).toBe(39.9);
    expect(canais.find((c) => c.canal === "ifood")?.preco_praticado).toBe(44.9);
  });

  it("lê simulador (pratos em colunas) e expande Box G para as 4 massas", () => {
    const buffer = criarPlanilha(
      [
        [],
        [],
        ["", "", "", "", "Simulador Manual BOX G"],
        ["", "Canal", "Região", "", "Pomodoro G", "Nhoque Pomodoro G", "Bolonhesa G"],
        ["", "", "", "Preço Atual", "R$ 42,90", "R$ 52,90", "R$ 52,90"],
        ["", "", "", "% <> Ajuste", "0.00%", "0.00%", "3.78%"],
        ["Simulador G", "Ifood", "---", "Nova precificação", "R$ 42,90", "R$ 52,90", "R$ 54,90"],
        ["", "Canal", "Região", "", "Pomodoro G", "Nhoque Pomodoro G", "Bolonhesa G"],
        ["", "", "", "Preço Atual", "R$ 38,90", "R$ 47,90", "R$ 44,90"],
        ["Simulador G", "Vendas diretas", "---", "Nova precificação", "R$ 38,90", "R$ 46,90", "R$ 46,90"],
        [],
        ["", "", "", "", "", "", "Simulador BOX M (P)"],
        ["", "", "Região", "", "Pomodoro M", "Bolonhesa M"],
        ["", "", "", "Preço Atual", "R$ 24,90", "R$ 35,90"],
        ["Simulador M", "Ifood", "---", "", "R$ 28,90", "R$ 39,90"],
        ["Simulador M", "Vendas diretas", "---", "", "R$ 25,90", "R$ 33,90"],
      ],
      "Simulador de preços"
    );

    const resultado = analisarPlanilhaPrecosFranquia(buffer);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    expect(resultado.linhas).toHaveLength(8); // 2 sabores G × 4 massas
    const pennePomodoro = resultado.linhas.find((l) => l.nome === "Penne Pomodoro");
    expect(pennePomodoro?.preco_loja).toBe(38.9);
    expect(pennePomodoro?.preco_ifood).toBe(42.9);
    const talharimBolonhesa = resultado.linhas.find((l) => l.nome === "Talharim Bolonhesa");
    expect(talharimBolonhesa?.preco_loja).toBe(46.9);
    expect(talharimBolonhesa?.preco_ifood).toBe(54.9);
    expect(resultado.linhas.every((l) => !l.nome.toLowerCase().includes("nhoque"))).toBe(true);
    expect(resultado.avisos.some((a) => /box m/i.test(a))).toBe(true);

    const db = structuredClone(seedDB);
    const aplicados = aplicarTabelaFranquiaNasFichas(db, resultado.linhas);
    expect(aplicados).toBe(8);
  });
});
