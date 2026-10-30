import { describe, expect, it } from "vitest";
import {
  agregarArquivosConsumoSaipos,
  agregarResultadosConsumoSaipos,
  arquivosNoIntervaloMes,
  criarSaiposConsumoArquivoRepository,
  mesRefDoPeriodo,
  parseEstadoArquivoConsumo,
  parsePeriodoSaiposRotulo,
  relatorioParaArquivoMes,
  resultadoConsolidadoVazio,
  SAIPOS_CONSUMO_ARQUIVO_BACKUP_KEY,
  SAIPOS_CONSUMO_ARQUIVO_STORAGE_KEY,
  type ArquivoConsumoSaipos,
} from "./saipos-consumo-arquivo";
import type { RelatorioItensVendidosSaipos, ResultadoConsolidadoSaipos } from "./saipos-itens-vendidos";

function memoriaStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

function res(partial: Partial<ResultadoConsolidadoSaipos>): ResultadoConsolidadoSaipos {
  return { ...resultadoConsolidadoVazio(), ...partial };
}

function arq(mes: string, resultado: ResultadoConsolidadoSaipos, extras?: Partial<ArquivoConsumoSaipos>): ArquivoConsumoSaipos {
  return {
    id: `saipos-${mes}`,
    mes_ref: mes,
    periodo_inicio: `${mes}-01`,
    periodo_fim: `${mes}-28`,
    periodo_rotulo: null,
    nome_arquivo: `${mes}.xlsx`,
    formato: "hierarquico",
    enviado_em: "2026-10-01T12:00:00.000Z",
    total_itens: 1,
    total_opcoes: 2,
    resultado,
    ...extras,
  };
}

describe("parsePeriodoSaiposRotulo", () => {
  it("converte intervalo dd/mm/yyyy em ISO", () => {
    const p = parsePeriodoSaiposRotulo("01/10/2026 a 31/10/2026");
    expect(p).toEqual({
      inicio: "2026-10-01",
      fim: "2026-10-31",
      rotulo: "01/10/2026 a 31/10/2026",
    });
  });

  it("aceita data única", () => {
    const p = parsePeriodoSaiposRotulo("07/10/2026");
    expect(p?.inicio).toBe("2026-10-07");
    expect(p?.fim).toBe("2026-10-07");
  });
});

describe("mesRefDoPeriodo", () => {
  it("usa o fim do período", () => {
    expect(mesRefDoPeriodo({ inicio: "2026-09-01", fim: "2026-09-30", rotulo: "" })).toBe("2026-09");
  });
});

describe("agregarResultadosConsumoSaipos", () => {
  it("soma mapas e quantidades rateadas", () => {
    const a = res({
      massaTamanho: { "Talharim|G": 10 },
      molhoTamanho: { "Bolonhesa|G": 5 },
      qtdRateada: 2,
      exatoMolhoMassa: true,
    });
    const b = res({
      massaTamanho: { "Talharim|G": 3, "Ninho|P": 1 },
      molhoTamanho: { "Bolonhesa|G": 1 },
      qtdRateada: 1,
      exatoMolhoMassa: false,
    });
    const out = agregarResultadosConsumoSaipos([a, b]);
    expect(out.massaTamanho["Talharim|G"]).toBe(13);
    expect(out.massaTamanho["Ninho|P"]).toBe(1);
    expect(out.molhoTamanho["Bolonhesa|G"]).toBe(6);
    expect(out.qtdRateada).toBe(3);
    expect(out.exatoMolhoMassa).toBe(false);
  });
});

describe("repositório arquivo consumo", () => {
  it("salva, substitui e remove por mes_ref", () => {
    const repo = criarSaiposConsumoArquivoRepository(memoriaStorage());
    const primeiro = arq("2026-01", res({ risotos: { Funghi: 2 } }));
    repo.salvar(primeiro);
    expect(repo.obter("2026-01")?.resultado.risotos.Funghi).toBe(2);

    const segundo = arq("2026-01", res({ risotos: { Funghi: 9 } }), {
      nome_arquivo: "jan-novo.xlsx",
    });
    repo.salvar(segundo);
    expect(repo.listar()).toHaveLength(1);
    expect(repo.obter("2026-01")?.nome_arquivo).toBe("jan-novo.xlsx");
    expect(repo.obter("2026-01")?.resultado.risotos.Funghi).toBe(9);

    repo.remover("2026-01");
    expect(repo.obter("2026-01")).toBeUndefined();
  });

  it("recupera do backup se a chave principal sumir", () => {
    const storage = memoriaStorage();
    const repo = criarSaiposConsumoArquivoRepository(storage);
    repo.salvar(arq("2026-04", res({ bebidas: { Agua: 3 } })));
    expect(storage.getItem(SAIPOS_CONSUMO_ARQUIVO_BACKUP_KEY)).toBeTruthy();
    storage.removeItem(SAIPOS_CONSUMO_ARQUIVO_STORAGE_KEY);
    const deNovo = criarSaiposConsumoArquivoRepository(storage);
    expect(deNovo.obter("2026-04")?.resultado.bebidas.Agua).toBe(3);
    expect(storage.getItem(SAIPOS_CONSUMO_ARQUIVO_STORAGE_KEY)).toBeTruthy();
  });

  it("não deixa persistir vazio por cima de meses existentes", () => {
    const storage = memoriaStorage();
    const repo = criarSaiposConsumoArquivoRepository(storage);
    repo.salvar(arq("2026-05", res({ bebidas: { Coca: 1 } })));
    expect(() => repo.persistir({ version: 1, arquivos: [] })).toThrow(/Bloqueado/);
    expect(repo.obter("2026-05")?.resultado.bebidas.Coca).toBe(1);
  });

  it("filtra intervalo de meses", () => {
    const state = parseEstadoArquivoConsumo({
      version: 1,
      arquivos: [
        arq("2026-01", res({ bebidas: { Coca: 1 } })),
        arq("2026-03", res({ bebidas: { Coca: 2 } })),
        arq("2026-06", res({ bebidas: { Coca: 3 } })),
      ],
    });
    const lista = arquivosNoIntervaloMes(state, "2026-01", "2026-03");
    expect(lista.map((a) => a.mes_ref)).toEqual(["2026-01", "2026-03"]);
    const agg = agregarArquivosConsumoSaipos(lista);
    expect(agg?.resultado.bebidas.Coca).toBe(3);
    expect(agg?.mesesIncluidos).toEqual(["2026-01", "2026-03"]);
  });
});

describe("relatorioParaArquivoMes", () => {
  it("monta arquivo a partir do relatório", () => {
    const rel: RelatorioItensVendidosSaipos = {
      resultado: res({ massaTamanho: { "X|G": 4 } }),
      formato: "plano",
      periodo: "01/02/2026 a 28/02/2026",
      totalItens: 5,
      totalOpcoes: 8,
      abas: [],
      nomeArquivo: "fev.xlsx",
    };
    const a = relatorioParaArquivoMes(rel, "2026-02", new Date("2026-03-01T10:00:00.000Z"));
    expect(a.mes_ref).toBe("2026-02");
    expect(a.periodo_inicio).toBe("2026-02-01");
    expect(a.periodo_fim).toBe("2026-02-28");
    expect(a.total_itens).toBe(5);
    expect(a.resultado.massaTamanho["X|G"]).toBe(4);
  });
});
