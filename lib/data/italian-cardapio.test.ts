import { describe, expect, it } from "vitest";
import { seedDB } from "./seed";
import { aplicarCardapioItalian, fichasItalian, produtosItalian } from "./italian-cardapio";
import { calcularCustoFicha } from "../domain/fichas-tecnicas";
import type { DB } from "../types";

describe("cardápio A Italian", () => {
  it("cadastra insumos com preço", () => {
    const produtos = produtosItalian();
    expect(produtos.length).toBeGreaterThanOrEqual(40);
    const crispy = produtos.find((p) => p.id === "prod-it-cebola-crispy");
    expect(crispy?.custo_unitario).toBe(60);
    const brocolis = produtos.find((p) => p.id === "prod-it-brocolis");
    expect(brocolis?.custo_unitario).toBe(10);
    expect(brocolis?.unidade_uso_id).toBe("un-un");
  });

  it("gera 27 bases + 36 pratos finais", () => {
    const { receitas, versoes } = fichasItalian("2026-01-01T12:00:00.000Z");
    const bases = receitas.filter((r) => r.tipo === "sub_receita");
    const pratos = receitas.filter((r) => r.tipo === "prato");
    expect(bases).toHaveLength(27);
    expect(pratos).toHaveLength(36);
    expect(versoes).toHaveLength(63);
    expect(pratos.some((p) => p.nome === "Talharim Pomodoro")).toBe(true);
    expect(pratos.some((p) => p.nome === "Penne Bolonhesa")).toBe(true);
  });

  it("seed já traz o cardápio e a aplicação é idempotente", () => {
    expect(seedDB.produtos.some((p) => p.id === "prod-it-carne-moida")).toBe(true);
    expect(seedDB.fichas_tecnicas_receitas?.some((r) => r.id === "ft-it-penne-bolonhesa")).toBe(true);

    const clone = structuredClone(seedDB) as DB;
    const antesProdutos = clone.produtos.length;
    const antesReceitas = clone.fichas_tecnicas_receitas?.length ?? 0;
    expect(aplicarCardapioItalian(clone)).toBe(false);
    expect(clone.produtos).toHaveLength(antesProdutos);
    expect(clone.fichas_tecnicas_receitas).toHaveLength(antesReceitas);
  });

  it("calcula custo completo de um prato final", () => {
    const agora = "2026-01-01T12:00:00.000Z";
    const db = structuredClone(seedDB) as DB;
    aplicarCardapioItalian(db);
    const versoes = db.fichas_tecnicas_versoes ?? [];
    const fichas = versoes.map((v) => v.ficha);
    const penneBolonhesa = fichas.find((f) => f.id === "ft-it-penne-bolonhesa");
    expect(penneBolonhesa).toBeTruthy();
    const custo = calcularCustoFicha(penneBolonhesa!, fichas, db.produtos, db.unidades);
    expect(custo.completo).toBe(true);
    expect(custo.custo_total).toBeGreaterThan(0);
    expect(custo.ingredientes_sem_custo).toHaveLength(0);
  });
});
