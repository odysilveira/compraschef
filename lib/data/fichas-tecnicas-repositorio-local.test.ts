import { describe, expect, it } from "vitest";
import type { DB, FichaTecnica, ReceitaFichaTecnicaVersao } from "../types";
import { seedDB } from "./seed";
import {
  criarRepositorioFichasTecnicasLocal,
  type PersistenciaBancoLocal,
} from "./fichas-tecnicas-repositorio-local";
import type {
  NovaReceitaFichaTecnica,
  NovaVersaoRascunhoFichaTecnica,
} from "../domain/fichas-tecnicas-repositorio";
import { migrarColecoesFichasTecnicas } from "./index";

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

function criarFichaRascunho(versaoId: string, numeroVersao: string, override?: Partial<FichaTecnica>): FichaTecnica {
  return {
    id: versaoId,
    nome: "Molho Base",
    status: "rascunho",
    versao: numeroVersao,
    rendimento_quantidade: 1,
    rendimento_unidade_id: "un-kg",
    ingredientes: [
      {
        id: `${versaoId}-ing-1`,
        tipo: "PRODUTO",
        produto_id: "prod-tomate",
        quantidade: 1,
        unidade_id: "un-kg",
      },
    ],
    passos: [{ ordem: 1, descricao: "Misturar" }],
    alergenicos: alergenicosNaoInformados(),
    criado_em: "2026-07-26T10:00:00.000Z",
    atualizado_em: "2026-07-26T10:00:00.000Z",
    ...override,
  };
}

function criarBancoBase(): DB {
  const db = clone(seedDB);
  delete db.fichas_tecnicas_receitas;
  delete db.fichas_tecnicas_versoes;
  delete db.ficha_tecnica_custo_snapshots;

  for (const produto of db.produtos) {
    if (produto.id === "prod-tomate") produto.custo_unitario = 10;
    if (produto.id === "prod-cebola") produto.custo_unitario = 8;
  }

  return db;
}

function criarPersistenciaMemoria(dbInicial: DB, serializarAoSalvar = false): {
  persistencia: PersistenciaBancoLocal;
  estadoAtual: () => DB;
  estadoInterno: () => DB;
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
        if (serializarAoSalvar) {
          estado = JSON.parse(JSON.stringify(proximoBanco)) as DB;
          return;
        }
        estado = proximoBanco;
      },
    },
    estadoAtual: () => clone(estado),
    estadoInterno: () => estado,
    totalGravacoes: () => gravacoes,
    alterarEstado: (fn) => {
      const proximo = clone(estado);
      fn(proximo);
      estado = proximo;
    },
  };
}

function novaReceitaBase(): NovaReceitaFichaTecnica {
  return {
    id: "rec-molho",
    codigo: "RCP-001",
    nome: "Molho da Casa",
    descricao: "Receita base",
  };
}

function novaVersaoBase(
  id: string,
  receitaId: string,
  numeroVersao: string,
  ficha?: FichaTecnica
): NovaVersaoRascunhoFichaTecnica {
  return {
    id,
    receita_id: receitaId,
    numero_versao: numeroVersao,
    ficha: ficha ?? criarFichaRascunho(id, numeroVersao),
  };
}

describe("Repositorio local de fichas tecnicas", () => {
  it("migra banco antigo sem colecoes de fichas", () => {
    const legado = criarBancoBase();

    const mudou = migrarColecoesFichasTecnicas(legado);

    expect(mudou).toBe(true);
    expect(Array.isArray(legado.fichas_tecnicas_receitas)).toBe(true);
    expect(Array.isArray(legado.fichas_tecnicas_versoes)).toBe(true);
    expect(Array.isArray(legado.ficha_tecnica_custo_snapshots)).toBe(true);
  });

  it("preserva produtos, fornecedores e dados antigos na migracao", () => {
    const legado = criarBancoBase();
    const totalProdutos = legado.produtos.length;
    const totalFornecedores = legado.fornecedores.length;

    migrarColecoesFichasTecnicas(legado);

    expect(legado.produtos.length).toBe(totalProdutos);
    expect(legado.fornecedores.length).toBe(totalFornecedores);
  });

  it("migracao executada duas vezes produz o mesmo resultado", () => {
    const legado = criarBancoBase();
    migrarColecoesFichasTecnicas(legado);
    const snapshotA = clone(legado);

    const mudouNaSegunda = migrarColecoesFichasTecnicas(legado);

    expect(mudouNaSegunda).toBe(false);
    expect(legado).toEqual(snapshotA);
  });

  it("salva e recupera uma receita", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita(novaReceitaBase());
    const receita = repo.buscarReceitaPorId("rec-molho");

    expect(receita?.codigo).toBe("RCP-001");
  });

  it("atualiza rascunho sem duplicar receita", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita(novaReceitaBase());
    repo.salvarNovaVersaoRascunho(novaVersaoBase("ver-1", "rec-molho", "1.0.0"));
    repo.atualizarRascunho("ver-1", { nome: "Molho Atualizado" });

    expect(repo.listarReceitas().length).toBe(1);
    expect(repo.buscarVersaoPorId("ver-1")?.ficha.nome).toBe("Molho Atualizado");
  });

  it("rejeita codigo de receita duplicado", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita(novaReceitaBase());

    expect(() =>
      repo.salvarNovaReceita({ ...novaReceitaBase(), id: "rec-outra" })
    ).toThrow(/código RCP-001 já existe/i);
  });

  it("salva e lista versoes na ordem correta", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita(novaReceitaBase());
    repo.salvarNovaVersaoRascunho(novaVersaoBase("ver-1", "rec-molho", "1.0.0"));
    repo.salvarNovaVersaoRascunho(novaVersaoBase("ver-2", "rec-molho", "1.1.0"));

    const ids = repo.listarVersoesDaReceita("rec-molho").map((item) => item.id);
    expect(ids).toEqual(["ver-1", "ver-2"]);
  });

  it("rejeita numero de versao duplicado", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita(novaReceitaBase());
    repo.salvarNovaVersaoRascunho(novaVersaoBase("ver-1", "rec-molho", "1.0.0"));

    expect(() =>
      repo.salvarNovaVersaoRascunho(novaVersaoBase("ver-2", "rec-molho", "1.0.0"))
    ).toThrow(/já possui a versão 1.0.0/);
  });

  it("rejeita versao com receita inexistente", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    expect(() =>
      repo.salvarNovaVersaoRascunho(novaVersaoBase("ver-x", "rec-inexistente", "1.0.0"))
    ).toThrow(/Receita com id rec-inexistente não encontrada/);
  });

  it("consultas retornam copias defensivas", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita(novaReceitaBase());
    repo.salvarNovaVersaoRascunho(novaVersaoBase("ver-1", "rec-molho", "1.0.0"));

    const receita = repo.buscarReceitaPorId("rec-molho")!;
    receita.nome = "Mutado";
    const versao = repo.buscarVersaoPorId("ver-1")!;
    versao.ficha.nome = "Mutado";

    expect(repo.buscarReceitaPorId("rec-molho")?.nome).toBe("Molho da Casa");
    expect(repo.buscarVersaoPorId("ver-1")?.ficha.nome).toBe("Molho Base");
  });

  it("objetos recebidos nao sao mutados", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    const receitaEntrada = novaReceitaBase();
    const versaoEntrada = novaVersaoBase("ver-1", "rec-molho", "1.0.0");
    const receitaAntes = clone(receitaEntrada);
    const versaoAntes = clone(versaoEntrada);

    repo.salvarNovaReceita(receitaEntrada);
    repo.salvarNovaVersaoRascunho(versaoEntrada);

    expect(receitaEntrada).toEqual(receitaAntes);
    expect(versaoEntrada).toEqual(versaoAntes);
  });

  it("versao publicada nao pode ser editada", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita(novaReceitaBase());
    repo.salvarNovaVersaoRascunho(novaVersaoBase("ver-1", "rec-molho", "1.0.0"));
    repo.publicarVersao("rec-molho", "ver-1");

    expect(() => repo.atualizarRascunho("ver-1", { nome: "Nao pode" })).toThrow(/imutável/);
  });

  it("publicacao atualiza a versao vigente da receita", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita(novaReceitaBase());
    repo.salvarNovaVersaoRascunho(novaVersaoBase("ver-1", "rec-molho", "1.0.0"));
    repo.publicarVersao("rec-molho", "ver-1");

    expect(repo.buscarReceitaPorId("rec-molho")?.versao_vigente_id).toBe("ver-1");
  });

  it("publicacao mantem snapshot historico congelado", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita(novaReceitaBase());
    repo.salvarNovaVersaoRascunho(novaVersaoBase("ver-1", "rec-molho", "1.0.0"));
    const publicada = repo.publicarVersao("rec-molho", "ver-1");

    const banco = ctx.estadoInterno();
    const snapshot = banco.ficha_tecnica_custo_snapshots?.find(
      (item) => item.id === publicada.snapshot_custo_id
    );

    expect(snapshot).toBeDefined();
    expect(() => {
      (snapshot as { custo_total: number }).custo_total = 123;
    }).toThrow(TypeError);
  });

  it("falha de validacao nao realiza gravacao parcial", () => {
    const db = criarBancoBase();
    const tomate = db.produtos.find((p) => p.id === "prod-tomate");
    if (tomate) {
      tomate.custo_unitario = undefined;
    }

    const ctx = criarPersistenciaMemoria(db);
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita(novaReceitaBase());
    repo.salvarNovaVersaoRascunho(novaVersaoBase("ver-1", "rec-molho", "1.0.0"));
    const antes = ctx.estadoAtual();
    const gravacoesAntes = ctx.totalGravacoes();

    expect(() => repo.publicarVersao("rec-molho", "ver-1")).toThrow();

    expect(ctx.totalGravacoes()).toBe(gravacoesAntes);
    expect(ctx.estadoAtual()).toEqual(antes);
  });

  it("referencia inexistente nao realiza gravacao", () => {
    const db = criarBancoBase();
    const ctx = criarPersistenciaMemoria(db);
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita(novaReceitaBase());
    const fichaComReferenciaInvalida = criarFichaRascunho("ver-1", "1.0.0", {
      ingredientes: [
        {
          id: "ing-sub",
          tipo: "SUB_RECEITA",
          sub_receita_id: "versao-inexistente",
          quantidade: 1,
          unidade_id: "un-kg",
        },
      ],
    });
    repo.salvarNovaVersaoRascunho(novaVersaoBase("ver-1", "rec-molho", "1.0.0", fichaComReferenciaInvalida));

    const antes = ctx.estadoAtual();
    expect(() => repo.publicarVersao("rec-molho", "ver-1")).toThrow(/não encontrada/);
    expect(ctx.estadoAtual()).toEqual(antes);
  });

  it("ciclo de sub-receitas nao realiza gravacao", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita({ id: "rec-a", codigo: "A", nome: "A" });
    repo.salvarNovaReceita({ id: "rec-b", codigo: "B", nome: "B" });

    const fichaA = criarFichaRascunho("ver-a", "1.0.0", {
      ingredientes: [
        {
          id: "ing-a",
          tipo: "SUB_RECEITA",
          sub_receita_id: "ver-b",
          quantidade: 1,
          unidade_id: "un-kg",
        },
      ],
    });
    const fichaB = criarFichaRascunho("ver-b", "1.0.0", {
      ingredientes: [
        {
          id: "ing-b",
          tipo: "SUB_RECEITA",
          sub_receita_id: "ver-a",
          quantidade: 1,
          unidade_id: "un-kg",
        },
      ],
    });

    repo.salvarNovaVersaoRascunho(novaVersaoBase("ver-a", "rec-a", "1.0.0", fichaA));
    repo.salvarNovaVersaoRascunho(novaVersaoBase("ver-b", "rec-b", "1.0.0", fichaB));

    const antes = ctx.estadoAtual();
    expect(() => repo.publicarVersao("rec-a", "ver-a")).toThrow(/ciclo detectado/i);
    expect(ctx.estadoAtual()).toEqual(antes);
  });

  it("serializacao e nova leitura preservam os dados", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase(), true);
    let repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita(novaReceitaBase());
    repo.salvarNovaVersaoRascunho(novaVersaoBase("ver-1", "rec-molho", "1.0.0"));

    repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);
    const receita = repo.buscarReceitaPorId("rec-molho");
    const versao = repo.buscarVersaoPorId("ver-1");

    expect(receita?.codigo).toBe("RCP-001");
    expect(versao?.numero_versao).toBe("1.0.0");
  });

  it("versao vigente em determinada data e selecionada corretamente", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita(novaReceitaBase());
    repo.salvarNovaVersaoRascunho(novaVersaoBase("ver-1", "rec-molho", "1.0.0"));
    repo.salvarNovaVersaoRascunho(novaVersaoBase("ver-2", "rec-molho", "2.0.0"));
    repo.publicarVersao("rec-molho", "ver-1");
    repo.publicarVersao("rec-molho", "ver-2");

    ctx.alterarEstado((db) => {
      const versoes = db.fichas_tecnicas_versoes as ReceitaFichaTecnicaVersao[];
      const v1 = versoes.find((item) => item.id === "ver-1");
      const v2 = versoes.find((item) => item.id === "ver-2");
      if (!v1 || !v2) return;
      v1.publicada_em = "2026-07-20T10:00:00.000Z";
      v2.publicada_em = "2026-07-21T10:00:00.000Z";
    });

    const vigenteAntes = repo.obterVersaoVigenteEmData("rec-molho", "2026-07-20T12:00:00.000Z");
    const vigenteDepois = repo.obterVersaoVigenteEmData("rec-molho", "2026-07-21T12:00:00.000Z");

    expect(vigenteAntes?.id).toBe("ver-1");
    expect(vigenteDepois?.id).toBe("ver-2");
  });

  it("nenhum teste depende do localStorage real do navegador", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.salvarNovaReceita(novaReceitaBase());
    const receitas = repo.listarReceitas();

    expect(receitas.length).toBe(1);
  });
});
