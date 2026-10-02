import { describe, expect, it } from "vitest";
import { seedDB } from "../data/seed";
import {
  aplicarTabelaFranquiaNasFichas,
  listarTabelaPrecosPratos,
  atualizarPrecosCanaisDaVersao,
  excluirReceitaFichaDoCatalogo,
  calcularCmvAtualVsSaipos,
  formatarCmvAtual,
  formatarPercentualAcimaDoSaipos,
  mediaCmvAtual,
  percentualAcimaDoSaipos,
  reajustarPrecosPratosEmLote,
} from "./tabela-precos-venda";
import { normalizarCanaisPrecoFicha } from "./fichas-tecnicas-comercial";
import { PRECOS_FRANQUIA_LONDINA_BOX_G } from "../data/precos-franquia-londrina";
import { aplicarCardapioItalian } from "../data/italian-cardapio";

describe("tabela de preços de venda", () => {
  it("lista pratos finalizados do cardápio Italian", () => {
    const linhas = listarTabelaPrecosPratos(seedDB);
    expect(linhas.length).toBeGreaterThanOrEqual(36);
    expect(linhas.some((l) => l.nome.includes("Bolonhesa"))).toBe(true);
  });

  it("aplica tabela da franquia por código", () => {
    const db = structuredClone(seedDB);
    const aplicados = aplicarTabelaFranquiaNasFichas(db, [
      {
        codigo: "IT-PENNE-BOLONHESA",
        nome: "Penne Bolonhesa",
        preco_loja: 39.9,
        preco_ifood: 44.9,
        preco_99: 43.9,
        taxa_ifood_percentual: 12,
        cmv_desejado_percentual: 30,
      },
    ]);
    expect(aplicados).toBe(1);
    const versao = db.fichas_tecnicas_versoes?.find((v) => v.id === "ft-it-penne-bolonhesa");
    const canais = normalizarCanaisPrecoFicha(versao?.ficha.canais_preco);
    expect(canais.find((c) => c.canal === "balcao")?.preco_praticado).toBe(39.9);
    expect(canais.find((c) => c.canal === "ifood")?.preco_praticado).toBe(44.9);
    expect(canais.find((c) => c.canal === "delivery_99")?.preco_praticado).toBe(43.9);
  });

  it("atualiza preços na edição rápida", () => {
    const db = structuredClone(seedDB);
    expect(
      atualizarPrecosCanaisDaVersao(db, "ft-it-penne-pomodoro", {
        loja: 35,
        ifood: 39,
        noventa: 38,
        cmvDesejado: 28,
      })
    ).toBe(true);
    const canais = normalizarCanaisPrecoFicha(
      db.fichas_tecnicas_versoes?.find((v) => v.id === "ft-it-penne-pomodoro")?.ficha.canais_preco
    );
    expect(canais[0].preco_praticado).toBe(35);
    expect(canais[1].preco_praticado).toBe(39);
    expect(canais[2].preco_praticado).toBe(38);
  });

  it("calcula % a mais do canal vs Saipos", () => {
    expect(percentualAcimaDoSaipos(42.9, 38.9)).toBe(10.3);
    expect(formatarPercentualAcimaDoSaipos(42.9, 38.9)).toBe("+10,3%");
    expect(formatarPercentualAcimaDoSaipos(0, 38.9)).toBe("—");
    expect(formatarPercentualAcimaDoSaipos(38.9, 0)).toBe("—");
  });

  it("calcula CMV atual vs preço Saipos", () => {
    expect(calcularCmvAtualVsSaipos(11.67, 38.9)).toBe(30);
    expect(formatarCmvAtual(30)).toBe("30,0%");
    expect(calcularCmvAtualVsSaipos(10, 0)).toBeNull();
    expect(formatarCmvAtual(null)).toBe("—");
  });

  it("calcula média de CMV de todos os pratos", () => {
    expect(mediaCmvAtual([{ cmv_atual: 20 }, { cmv_atual: 30 }, { cmv_atual: null }])).toBe(25);
    expect(mediaCmvAtual([{ cmv_atual: null }])).toBeNull();
  });

  it("lista tabela com CMV atual em relação à Saipos", () => {
    const db = structuredClone(seedDB);
    aplicarTabelaFranquiaNasFichas(db, PRECOS_FRANQUIA_LONDINA_BOX_G);
    const linhas = listarTabelaPrecosPratos(db);
    const penne = linhas.find((l) => l.codigo === "IT-PENNE-POMODORO");
    expect(penne).toBeTruthy();
    expect(penne!.preco_loja).toBe(38.9);
    expect(penne!.custo_porcao).toBeGreaterThan(0);
    expect(penne!.cmv_atual).not.toBeNull();
    expect(penne!.cmv_atual!).toBeGreaterThan(0);
  });

  it("reajusta preços em lote por R$ e por %", () => {
    const db = structuredClone(seedDB);
    aplicarTabelaFranquiaNasFichas(db, PRECOS_FRANQUIA_LONDINA_BOX_G);

    const porReais = reajustarPrecosPratosEmLote(db, {
      modo: "reais",
      valor: 2,
      canais: { loja: true, ifood: true, noventa: false },
      receitaIds: ["ft-it-penne-pomodoro"],
    });
    expect(porReais).toBe(1);
    let canais = normalizarCanaisPrecoFicha(
      db.fichas_tecnicas_versoes?.find((v) => v.id === "ft-it-penne-pomodoro")?.ficha.canais_preco
    );
    expect(canais.find((c) => c.canal === "balcao")?.preco_praticado).toBe(40.9);
    expect(canais.find((c) => c.canal === "ifood")?.preco_praticado).toBe(44.9);

    const porPct = reajustarPrecosPratosEmLote(db, {
      modo: "percentual",
      valor: 10,
      canais: { loja: true, ifood: false, noventa: false },
      receitaIds: ["ft-it-penne-pomodoro"],
    });
    expect(porPct).toBe(1);
    canais = normalizarCanaisPrecoFicha(
      db.fichas_tecnicas_versoes?.find((v) => v.id === "ft-it-penne-pomodoro")?.ficha.canais_preco
    );
    expect(canais.find((c) => c.canal === "balcao")?.preco_praticado).toBe(44.99);
  });

  it("exclui receita do catálogo e não volta no seed Italian", () => {
    const db = structuredClone(seedDB);
    expect(excluirReceitaFichaDoCatalogo(db, "ft-it-penne-pomodoro")).toBe(true);
    expect(db.fichas_tecnicas_receitas?.some((r) => r.id === "ft-it-penne-pomodoro")).toBe(false);
    expect(db.fichas_tecnicas_versoes?.some((v) => v.receita_id === "ft-it-penne-pomodoro")).toBe(false);
    expect(db.fichas_tecnicas_excluidas_ids).toContain("ft-it-penne-pomodoro");

    aplicarCardapioItalian(db);
    expect(db.fichas_tecnicas_receitas?.some((r) => r.id === "ft-it-penne-pomodoro")).toBe(false);
  });
});
