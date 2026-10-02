import { describe, expect, it } from "vitest";
import { seedDB } from "./seed";
import { atualizarComNovidades } from "./index";
import { PRECOS_FRANQUIA_LONDINA_BOX_G } from "./precos-franquia-londrina";
import { aplicarTabelaFranquiaNasFichas, listarTabelaPrecosPratos } from "../domain/tabela-precos-venda";
import { normalizarCanaisPrecoFicha } from "../domain/fichas-tecnicas-comercial";

describe("preços Londrina Box G", () => {
  it("tem 36 linhas (4 massas × 9 sabores)", () => {
    expect(PRECOS_FRANQUIA_LONDINA_BOX_G).toHaveLength(36);
  });

  it("preenche canais_preco nas fichas vazias via migração", () => {
    const db = structuredClone(seedDB);
    for (const versao of db.fichas_tecnicas_versoes ?? []) {
      versao.ficha.canais_preco = undefined;
    }

    expect(atualizarComNovidades(db)).toBe(true);

    const penne = db.fichas_tecnicas_versoes?.find((v) => v.id === "ft-it-penne-pomodoro");
    const canais = normalizarCanaisPrecoFicha(penne?.ficha.canais_preco);
    expect(canais.find((c) => c.canal === "balcao")?.preco_praticado).toBe(38.9);
    expect(canais.find((c) => c.canal === "ifood")?.preco_praticado).toBe(42.9);

    const bolonhesa = db.fichas_tecnicas_versoes?.find((v) => v.id === "ft-it-talharim-bolonhesa");
    const canaisBol = normalizarCanaisPrecoFicha(bolonhesa?.ficha.canais_preco);
    expect(canaisBol.find((c) => c.canal === "balcao")?.preco_praticado).toBe(46.9);

    const comPreco = listarTabelaPrecosPratos(db).filter((l) => l.preco_loja > 0);
    expect(comPreco.length).toBe(36);
  });

  it("somenteVazios não sobrescreve preço já informado", () => {
    const db = structuredClone(seedDB);
    aplicarTabelaFranquiaNasFichas(db, PRECOS_FRANQUIA_LONDINA_BOX_G);
    const versao = db.fichas_tecnicas_versoes?.find((v) => v.id === "ft-it-penne-pomodoro");
    versao!.ficha.canais_preco = normalizarCanaisPrecoFicha(versao?.ficha.canais_preco).map((c) =>
      c.canal === "balcao" ? { ...c, preco_praticado: 99 } : c
    );

    const aplicados = aplicarTabelaFranquiaNasFichas(db, PRECOS_FRANQUIA_LONDINA_BOX_G, {
      somenteVazios: true,
    });
    expect(aplicados).toBeLessThan(36);
    const canais = normalizarCanaisPrecoFicha(versao?.ficha.canais_preco);
    expect(canais.find((c) => c.canal === "balcao")?.preco_praticado).toBe(99);
  });
});
