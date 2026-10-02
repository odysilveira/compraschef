import { describe, expect, it } from "vitest";
import { seedDB } from "../data/seed";
import {
  calcularFechamentoDia,
  fechamentoDiaVazio,
  listarSnapshotsPratosFechamento,
  montarLinhaVenda,
  rateioSalarioDiario,
} from "./fechamento-dia";

describe("fechamento do dia", () => {
  it("rateia salário mensal no dia", () => {
    expect(rateioSalarioDiario(3000, 30)).toBe(100);
  });

  it("calcula CMV ponderado, Prime Cost e sobra", () => {
    const fechamento = fechamentoDiaVazio("2026-09-30");
    fechamento.vendas = [
      {
        id: "v1",
        receita_id: "ft-it-penne-pomodoro",
        nome: "Penne Pomodoro",
        canal: "balcao",
        quantidade: 10,
        preco_unitario: 40,
        custo_unitario: 12,
        taxa_percentual: 0,
        taxa_fixa: 0,
      },
      {
        id: "v2",
        receita_id: "ft-it-penne-camarao",
        nome: "Penne Camarão",
        canal: "ifood",
        quantidade: 5,
        preco_unitario: 70,
        custo_unitario: 28,
        taxa_percentual: 12,
        taxa_fixa: 0,
      },
    ];
    fechamento.mao_obra = [
      { id: "m1", pessoa_id: "p1", nome: "Márcia", tipo: "fixo_rateado", valor: 150 },
      { id: "m2", pessoa_id: "p2", nome: "Freela", tipo: "freela", valor: 80, horas: 4 },
    ];
    fechamento.custo_motoboy = 40;

    const r = calcularFechamentoDia(fechamento);
    // receita: 10*40 + 5*70 = 750
    expect(r.receita_bruta).toBe(750);
    // food: 10*12 + 5*28 = 260
    expect(r.custo_food).toBe(260);
    expect(r.cmv_ponderado_percentual).toBe(34.7);
    // taxa ifood: 350 * 0.12 = 42
    expect(r.taxas_canais).toBe(42);
    expect(r.custo_motoboy).toBe(40);
    expect(r.receita_liquida).toBe(668);
    expect(r.mao_obra_total).toBe(230);
    expect(r.prime_cost).toBe(490);
    // sobra: 668 - 260 - 230 = 178
    expect(r.sobra_dia).toBe(178);
    expect(r.qtd_pratos).toBe(15);
  });

  it("monta linha de venda a partir do snapshot da ficha", () => {
    const snaps = listarSnapshotsPratosFechamento(seedDB);
    const pomodoro = snaps.find((s) => s.receita_id === "ft-it-penne-pomodoro");
    expect(pomodoro).toBeTruthy();
    const linha = montarLinhaVenda(pomodoro!, "ifood", 3, "v-test");
    expect(linha.quantidade).toBe(3);
    expect(linha.canal).toBe("ifood");
    expect(linha.preco_unitario).toBeGreaterThan(0);
    expect(linha.custo_unitario).toBeGreaterThan(0);
  });
});
