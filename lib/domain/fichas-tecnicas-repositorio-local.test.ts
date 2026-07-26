import { describe, expect, it } from "vitest";
import type { DB, FichaTecnica, ReceitaFichaTecnicaVersao } from "../types";
import { seedDB } from "../data/seed";
import { calcularCustoPorConfiguracaoPorcionamento } from "./fichas-tecnicas";
import {
  criarRepositorioFichasTecnicasLocal,
  type PersistenciaBancoLocal,
} from "./fichas-tecnicas-repositorio-local";
import { migrarColecoesFichasTecnicas } from "../data/index";

function clone<T>(valor: T): T {
  return structuredClone(valor);
}

function alergenicosNaoInformados() {
  return {
    gluten: "NAO_INFORMADO" as const,
    lactose: "NAO_INFORMADO" as const,
    ovos: "NAO_INFORMADO" as const,
    peixes: "NAO_INFORMADO" as const,
    crustaceos: "NAO_INFORMADO" as const,
    soja: "NAO_INFORMADO" as const,
    castanhas: "NAO_INFORMADO" as const,
    amendoim: "NAO_INFORMADO" as const,
    outros: [],
  };
}

function criarBancoBase(): DB {
  const db = clone(seedDB);
  delete db.fichas_tecnicas_receitas;
  delete db.fichas_tecnicas_versoes;
  delete db.ficha_tecnica_custo_snapshots;

  for (const produto of db.produtos) {
    if (produto.id === "prod-tomate") {
      produto.custo_unitario = 10;
      produto.unidade_uso_id = "un-kg";
      produto.fator_conversao = 1;
    }
    if (produto.id === "prod-cebola") {
      produto.custo_unitario = 8;
      produto.unidade_uso_id = "un-kg";
      produto.fator_conversao = 1;
    }
  }

  return db;
}

function criarPersistenciaMemoria(dbInicial: DB): {
  persistencia: PersistenciaBancoLocal;
  estadoAtual: () => DB;
  totalGravacoes: () => number;
  alterarEstado: (fn: (db: DB) => void) => void;
} {
  let estado = clone(dbInicial);
  let gravacoes = 0;

  return {
    persistencia: {
      ler: () => clone(estado),
      salvar: (proximoBanco) => {
        gravacoes += 1;
        estado = proximoBanco;
      },
    },
    estadoAtual: () => clone(estado),
    totalGravacoes: () => gravacoes,
    alterarEstado: (fn) => {
      const proximo = clone(estado);
      fn(proximo);
      estado = proximo;
    },
  };
}

function criarFichaRascunho(versaoId: string, numeroVersao: string): FichaTecnica {
  const ficha = {
    id: versaoId,
    nome: "Molho Base",
    status: "rascunho" as const,
    versao: numeroVersao,
    rendimento_quantidade: 1,
    rendimento_unidade_id: "un-kg",
    ingredientes: [
      {
        id: "ing-1",
        tipo: "PRODUTO" as const,
        produto_id: "prod-tomate",
        quantidade: 1,
        unidade_id: "un-kg",
      },
      {
        id: "ing-2",
        tipo: "PRODUTO" as const,
        produto_id: "prod-cebola",
        quantidade: 0.5,
        unidade_id: "un-kg",
      },
    ],
    passos: [
      {
        ordem: 1,
        descricao: "Misturar",
        itens_ingredientes: [{ ingrediente_receita_id: "ing-1" }],
      },
    ],
    alergenicos: alergenicosNaoInformados(),
    pegada_carbono: {
      valor_co2e: 1.25,
      unidade_referencia: "kgCO2e/kg",
      fonte: "inventario interno",
      data_referencia: "2026-07-01",
      metodologia: "ACV simplificada",
    },
    criado_em: "2026-07-26T10:00:00.000Z",
    atualizado_em: "2026-07-26T10:00:00.000Z",
    configuracoes_porcionamento: [
      {
        id: "p",
        nome: "Porção P",
        quantidade_por_porcao: 0.1,
        unidade: "un-kg",
        quantidade_porcoes_teorica: 0,
        ativa: true,
      },
      {
        id: "g",
        nome: "Porção G",
        quantidade_por_porcao: 0.25,
        unidade: "un-kg",
        quantidade_porcoes_teorica: 0,
        ativa: true,
      },
    ],
  };

  return ficha as FichaTecnica;
}

describe("Repositorio local de fichas tecnicas - etapa 1C corrigida", () => {
  it("1. duas configurações de porcionamento na mesma versão", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({
      id: "ver-1",
      receita_id: "rec-1",
      numero_versao: "1.0.0",
      ficha: criarFichaRascunho("ver-1", "1.0.0"),
      criado_por: "ana",
    });

    const versao = repo.buscarVersaoPorId("ver-1")!;
    expect(versao.configuracoes_porcionamento).toHaveLength(2);
  });

  it("2. cálculo de custo diferente para porções P e G", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({
      id: "ver-1",
      receita_id: "rec-1",
      numero_versao: "1.0.0",
      ficha: criarFichaRascunho("ver-1", "1.0.0"),
      criado_por: "ana",
    });
    const publicada = repo.publicarVersao("rec-1", "ver-1", { responsavel: "ana" });

    const db = ctx.estadoAtual();
    const snapshot = db.ficha_tecnica_custo_snapshots?.find((item) => item.id === publicada.snapshot_custo_id);
    const custoP = snapshot?.custos_por_configuracao_porcionamento?.find((item) => item.configuracao_id === "p");
    const custoG = snapshot?.custos_por_configuracao_porcionamento?.find((item) => item.configuracao_id === "g");

    expect(custoP?.custo_por_porcao).toBeDefined();
    expect(custoG?.custo_por_porcao).toBeDefined();
    expect(custoP?.custo_por_porcao).not.toBe(custoG?.custo_por_porcao);

    const custoSelecionadoP = calcularCustoPorConfiguracaoPorcionamento(snapshot!, { id: "p" });
    const custoSelecionadoG = calcularCustoPorConfiguracaoPorcionamento(snapshot!, { id: "g" });
    expect(custoSelecionadoP).toBe(custoP!.custo_por_porcao);
    expect(custoSelecionadoG).toBe(custoG!.custo_por_porcao);
  });

  it("2.1. duplicação da mesma configuração é rejeitada sem mutação parcial", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    const ficha = criarFichaRascunho("ver-1", "1.0.0");
    ficha.configuracoes_porcionamento = [
      {
        id: "dup",
        nome: "Porção P",
        quantidade_por_porcao: 0.1,
        unidade: "un-kg",
        quantidade_porcoes_teorica: 0,
        ativa: true,
      },
      {
        id: "dup",
        nome: "Porção G",
        quantidade_por_porcao: 0.25,
        unidade: "un-kg",
        quantidade_porcoes_teorica: 0,
        ativa: true,
      },
    ];
    const fichaAntes = clone(ficha);

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    const gravacoesAntes = ctx.totalGravacoes();
    const estadoAntes = ctx.estadoAtual();

    expect(() =>
      repo.salvarNovaVersaoRascunho({
        id: "ver-1",
        receita_id: "rec-1",
        numero_versao: "1.0.0",
        ficha,
        criado_por: "ana",
      })
    ).toThrow(/duplicada por id/i);

    expect(ficha).toEqual(fichaAntes);
    expect(ctx.totalGravacoes()).toBe(gravacoesAntes);
    expect(ctx.estadoAtual()).toEqual(estadoAntes);
  });

  it("2.2. configuração inexistente ou ambígua é rejeitada na seleção de custo", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({
      id: "ver-1",
      receita_id: "rec-1",
      numero_versao: "1.0.0",
      ficha: criarFichaRascunho("ver-1", "1.0.0"),
      criado_por: "ana",
    });
    const publicada = repo.publicarVersao("rec-1", "ver-1", { responsavel: "ana" });
    const snapshot = ctx
      .estadoAtual()
      .ficha_tecnica_custo_snapshots?.find((item) => item.id === publicada.snapshot_custo_id)!;

    expect(() => calcularCustoPorConfiguracaoPorcionamento(snapshot, { id: "nao-existe" })).toThrow(
      /não encontrada/i
    );
    expect(() => calcularCustoPorConfiguracaoPorcionamento(snapshot, {})).toThrow(/ambígua/i);
  });

  it("3. quantidade teórica derivada do rendimento", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({
      id: "ver-1",
      receita_id: "rec-1",
      numero_versao: "1.0.0",
      ficha: criarFichaRascunho("ver-1", "1.0.0"),
      criado_por: "ana",
    });

    const versao = repo.buscarVersaoPorId("ver-1")!;
    const configs = versao.configuracoes_porcionamento ?? [];
    const p = configs.find((item) => item.id === "p")!;
    const g = configs.find((item) => item.id === "g")!;

    expect(p.quantidade_porcoes_teorica).toBe(10);
    expect(g.quantidade_porcoes_teorica).toBe(4);
  });

  it("4. alteração posterior da conversão não afetar versão publicada", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({
      id: "ver-1",
      receita_id: "rec-1",
      numero_versao: "1.0.0",
      ficha: criarFichaRascunho("ver-1", "1.0.0"),
      criado_por: "ana",
    });

    repo.publicarVersao("rec-1", "ver-1", { responsavel: "ana" });
    const antes = repo.buscarVersaoPorId("ver-1")!;

    ctx.alterarEstado((db) => {
      const tomate = db.produtos.find((p) => p.id === "prod-tomate");
      if (tomate) {
        tomate.fator_conversao = 999;
      }
    });

    const depois = repo.buscarVersaoPorId("ver-1")!;
    expect(depois.ficha.ingredientes[0].conversao_snapshot).toEqual(antes.ficha.ingredientes[0].conversao_snapshot);
  });

  it("5. rascunho poder utilizar conversão atual", () => {
    const db = criarBancoBase();
    const tomate = db.produtos.find((p) => p.id === "prod-tomate");
    if (tomate) {
      tomate.unidade_compra_id = "un-cx";
      tomate.fator_conversao = 2;
    }

    const ctx = criarPersistenciaMemoria(db);
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    const ficha = criarFichaRascunho("ver-1", "1.0.0");
    ficha.ingredientes[0].unidade_id = "un-cx";

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({ id: "ver-1", receita_id: "rec-1", numero_versao: "1.0.0", ficha, criado_por: "ana" });

    ctx.alterarEstado((estado) => {
      const p = estado.produtos.find((item) => item.id === "prod-tomate");
      if (p) p.fator_conversao = 3;
    });

    const publicada = repo.publicarVersao("rec-1", "ver-1", { responsavel: "ana" });
    expect(publicada.ficha.ingredientes[0].conversao_snapshot?.fator_conversao_aplicado).toBe(3);
  });

  it("6. snapshot carregar unidade e fator congelados", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({
      id: "ver-1",
      receita_id: "rec-1",
      numero_versao: "1.0.0",
      ficha: criarFichaRascunho("ver-1", "1.0.0"),
      criado_por: "ana",
    });

    const publicada = repo.publicarVersao("rec-1", "ver-1", { responsavel: "ana" });
    const conv = publicada.ficha.ingredientes[0].conversao_snapshot;
    expect(conv?.unidade_informada).toBe("un-kg");
    expect(conv?.unidade_base).toBe("un-kg");
    expect(conv?.fator_conversao_aplicado).toBe(1);
  });

  it("7. criação, alteração e publicação registrarem responsáveis", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({
      id: "ver-1",
      receita_id: "rec-1",
      numero_versao: "1.0.0",
      ficha: criarFichaRascunho("ver-1", "1.0.0"),
      criado_por: "ana",
    });
    repo.atualizarRascunho("ver-1", { nome: "Nova" }, { responsavel: "bruno" });
    const publicada = repo.publicarVersao("rec-1", "ver-1", { responsavel: "carla" });

    expect(publicada.criado_por).toBe("ana");
    expect(publicada.atualizado_por).toBe("carla");
    expect(publicada.publicado_por).toBe("carla");
  });

  it("8. histórico preservar eventos anteriores", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({
      id: "ver-1",
      receita_id: "rec-1",
      numero_versao: "1.0.0",
      ficha: criarFichaRascunho("ver-1", "1.0.0"),
      criado_por: "ana",
    });
    repo.atualizarRascunho("ver-1", { nome: "Nova" }, { responsavel: "bruno" });
    repo.publicarVersao("rec-1", "ver-1", { responsavel: "carla" });

    const historico = repo.listarHistoricoDaVersao?.("ver-1") ?? [];
    expect(historico.map((item) => item.acao)).toEqual(["criacao", "alteracao_rascunho", "publicacao"]);
    expect(historico.map((item) => item.responsavel)).toEqual(["ana", "bruno", "carla"]);
  });

  it("8.1. histórico é ordenado de forma determinística por data", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({
      id: "ver-1",
      receita_id: "rec-1",
      numero_versao: "1.0.0",
      ficha: criarFichaRascunho("ver-1", "1.0.0"),
      criado_por: "ana",
    });

    repo.atualizarRascunho("ver-1", { nome: "T2" }, { responsavel: "bruno", em: "2026-07-26T10:00:02.000Z" });
    repo.atualizarRascunho("ver-1", { nome: "T1" }, { responsavel: "bruno", em: "2026-07-26T10:00:01.000Z" });

    const historico = repo.listarHistoricoDaVersao?.("ver-1") ?? [];
    const datas = historico.map((item) => item.em);
    expect(datas).toEqual([...datas].sort((a, b) => a.localeCompare(b)));
  });

  it("9. pegada de carbono preservar fonte, data e unidade", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    const ficha = criarFichaRascunho("ver-1", "1.0.0");
    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({ id: "ver-1", receita_id: "rec-1", numero_versao: "1.0.0", ficha, criado_por: "ana" });

    const versao = repo.buscarVersaoPorId("ver-1")!;
    expect(versao.ficha.pegada_carbono?.fonte).toBe("inventario interno");
    expect(versao.ficha.pegada_carbono?.data_referencia).toBe("2026-07-01");
    expect(versao.ficha.pegada_carbono?.unidade_referencia).toBe("kgCO2e/kg");
  });

  it("10. passo aceitar vários ingredientes", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    const ficha = criarFichaRascunho("ver-1", "1.0.0");
    ficha.passos[0].itens_ingredientes = [
      { ingrediente_receita_id: "ing-1", quantidade_utilizada: 0.2, unidade: "un-kg" },
      { ingrediente_receita_id: "ing-2", quantidade_utilizada: 0.1, unidade: "un-kg" },
    ];

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({ id: "ver-1", receita_id: "rec-1", numero_versao: "1.0.0", ficha, criado_por: "ana" });
    expect(() => repo.publicarVersao("rec-1", "ver-1", { responsavel: "ana" })).not.toThrow();
  });

  it("11. ingrediente inexistente no passo ser rejeitado", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    const ficha = criarFichaRascunho("ver-1", "1.0.0");
    ficha.passos[0].itens_ingredientes = [{ ingrediente_receita_id: "ing-nao-existe" }];

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({ id: "ver-1", receita_id: "rec-1", numero_versao: "1.0.0", ficha, criado_por: "ana" });

    expect(() => repo.publicarVersao("rec-1", "ver-1", { responsavel: "ana" })).toThrow(/referencia ingrediente/i);
  });

  it("12. ingrediente de outra versão ser rejeitado", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    const fichaA = criarFichaRascunho("ver-a", "1.0.0");
    const fichaB = criarFichaRascunho("ver-b", "1.0.1");
    fichaA.ingredientes = [
      {
        id: "ing-a-1",
        tipo: "PRODUTO",
        produto_id: "prod-tomate",
        quantidade: 1,
        unidade_id: "un-kg",
      },
    ];
    fichaB.ingredientes = [
      {
        id: "ing-b-only",
        tipo: "PRODUTO",
        produto_id: "prod-cebola",
        quantidade: 1,
        unidade_id: "un-kg",
      },
    ];
    fichaA.passos[0].itens_ingredientes = [{ ingrediente_receita_id: "ing-b-only" }];

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({ id: "ver-a", receita_id: "rec-1", numero_versao: "1.0.0", ficha: fichaA, criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({ id: "ver-b", receita_id: "rec-1", numero_versao: "1.0.1", ficha: fichaB, criado_por: "ana" });

    expect(() => repo.publicarVersao("rec-1", "ver-a", { responsavel: "ana" })).toThrow(/inexistente na versão/i);
  });

  it("12.1. ingrediente da mesma versão é aceito", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    const fichaA = criarFichaRascunho("ver-a", "1.0.0");
    fichaA.ingredientes = [
      {
        id: "ing-a-1",
        tipo: "PRODUTO",
        produto_id: "prod-tomate",
        quantidade: 1,
        unidade_id: "un-kg",
      },
    ];
    fichaA.passos[0].itens_ingredientes = [{ ingrediente_receita_id: "ing-a-1" }];

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({ id: "ver-a", receita_id: "rec-1", numero_versao: "1.0.0", ficha: fichaA, criado_por: "ana" });

    expect(() => repo.publicarVersao("rec-1", "ver-a", { responsavel: "ana" })).not.toThrow();
  });

  it("12.2. falha de auditoria bloqueia operação sem mutação parcial", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({
      id: "ver-1",
      receita_id: "rec-1",
      numero_versao: "1.0.0",
      ficha: criarFichaRascunho("ver-1", "1.0.0"),
      criado_por: "ana",
    });

    const estadoAntes = ctx.estadoAtual();
    const gravacoesAntes = ctx.totalGravacoes();
    expect(() => repo.atualizarRascunho("ver-1", { nome: "x" }, { responsavel: "", em: "2026-07-26T10:00:00.000Z" })).toThrow(
      /Responsável é obrigatório/
    );
    expect(() => repo.publicarVersao("rec-1", "ver-1", { responsavel: "ana", em: "data-invalida" })).toThrow(
      /Data\/hora inválida/
    );
    expect(ctx.totalGravacoes()).toBe(gravacoesAntes);
    expect(ctx.estadoAtual()).toEqual(estadoAntes);
  });

  it("13. falha de validação não causar gravação parcial", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    const ficha = criarFichaRascunho("ver-1", "1.0.0");
    ficha.passos[0].itens_ingredientes = [{ ingrediente_receita_id: "id-invalido" }];

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({ id: "ver-1", receita_id: "rec-1", numero_versao: "1.0.0", ficha, criado_por: "ana" });
    const gravacoesAntes = ctx.totalGravacoes();
    const estadoAntes = ctx.estadoAtual();

    expect(() => repo.publicarVersao("rec-1", "ver-1", { responsavel: "ana" })).toThrow();
    expect(ctx.totalGravacoes()).toBe(gravacoesAntes);
    expect(ctx.estadoAtual()).toEqual(estadoAntes);
  });

  it("14. migração de banco antigo continuar idempotente", () => {
    const legado = criarBancoBase();

    const mudouPrimeira = migrarColecoesFichasTecnicas(legado);
    const depoisPrimeira = clone(legado);
    const mudouSegunda = migrarColecoesFichasTecnicas(legado);

    expect(mudouPrimeira).toBe(true);
    expect(mudouSegunda).toBe(false);
    expect(legado).toEqual(depoisPrimeira);
  });

  it("15. consultas continuarem retornando cópias defensivas", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita({ id: "rec-1", codigo: "RCP-1", nome: "Receita", criado_por: "ana" });
    repo.salvarNovaVersaoRascunho({
      id: "ver-1",
      receita_id: "rec-1",
      numero_versao: "1.0.0",
      ficha: criarFichaRascunho("ver-1", "1.0.0"),
      criado_por: "ana",
    });

    const receita = repo.buscarReceitaPorId("rec-1")!;
    receita.nome = "Mutado";
    const versao = repo.buscarVersaoPorId("ver-1")!;
    versao.ficha.nome = "Mutado";

    expect(repo.buscarReceitaPorId("rec-1")?.nome).toBe("Receita");
    expect(repo.buscarVersaoPorId("ver-1")?.ficha.nome).toBe("Molho Base");
  });
});
