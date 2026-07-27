import { describe, expect, it } from "vitest";
import type { DB } from "../types";
import { seedDB } from "../data/seed";
import {
  criarRepositorioFichasTecnicasLocal,
  type PersistenciaBancoLocal,
} from "./fichas-tecnicas-repositorio-local";
import {
  criarCoordenadorNovoRascunhoFichaTecnica,
  criarFormularioNovoRascunhoInicial,
  filtrarItensCatalogoFichasTecnicas,
  listarItensCatalogoFichasTecnicas,
  selecionarUnidadePadraoRascunho,
} from "./fichas-tecnicas-catalogo";

function clone<T>(valor: T): T {
  return structuredClone(valor);
}

function criarBancoBase(): DB {
  const db = clone(seedDB);
  delete db.fichas_tecnicas_receitas;
  delete db.fichas_tecnicas_versoes;
  delete db.ficha_tecnica_custo_snapshots;
  return db;
}

function criarPersistenciaMemoria(dbInicial: DB): {
  persistencia: PersistenciaBancoLocal;
  estadoAtual: () => DB;
} {
  let estado = clone(dbInicial);

  return {
    persistencia: {
      ler: () => clone(estado),
      salvar: (proximoBanco) => {
        estado = clone(proximoBanco);
      },
    },
    estadoAtual: () => clone(estado),
  };
}

describe("catálogo de fichas técnicas", () => {
  it("1. criação válida de um rascunho", async () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);
    const coordenador = criarCoordenadorNovoRascunhoFichaTecnica({
      repositorio: repo,
      criado_por: "maria",
      rendimento_unidade_id: selecionarUnidadePadraoRascunho(ctx.estadoAtual().unidades),
    });

    const resultado = await coordenador.salvar({
      nome: "Molho da casa",
      codigo: "FT-001",
      tipo: "prato",
      categoria_id: "",
      descricao: "Base do cardápio",
    });

    expect(resultado.receita.nome).toBe("Molho da casa");
    expect(resultado.receita.codigo).toBe("FT-001");
    expect(resultado.receita.tipo).toBe("prato");
    expect(resultado.versao.status).toBe("rascunho");
    expect(repo.listarReceitas()).toHaveLength(1);
  });

  it("2. rejeição de nome ou código vazio", async () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);
    const coordenador = criarCoordenadorNovoRascunhoFichaTecnica({
      repositorio: repo,
      criado_por: "maria",
      rendimento_unidade_id: selecionarUnidadePadraoRascunho(ctx.estadoAtual().unidades),
    });

    await expect(
      coordenador.salvar({
        nome: " ",
        codigo: "FT-001",
        tipo: "prato",
        categoria_id: "",
        descricao: "",
      })
    ).rejects.toThrow("Nome da receita é obrigatório");

    await expect(
      coordenador.salvar({
        nome: "Molho",
        codigo: " ",
        tipo: "prato",
        categoria_id: "",
        descricao: "",
      })
    ).rejects.toThrow("Código da receita é obrigatório");
  });

  it("3. rejeição de código duplicado", async () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);
    const coordenador = criarCoordenadorNovoRascunhoFichaTecnica({
      repositorio: repo,
      criado_por: "maria",
      rendimento_unidade_id: selecionarUnidadePadraoRascunho(ctx.estadoAtual().unidades),
    });

    await coordenador.salvar({
      nome: "Molho da casa",
      codigo: "FT-001",
      tipo: "prato",
      categoria_id: "",
      descricao: "",
    });

    await expect(
      coordenador.salvar({
        nome: "Outro molho",
        codigo: "ft-001",
        tipo: "sub_receita",
        categoria_id: "",
        descricao: "",
      })
    ).rejects.toThrow("Receita com código ft-001 já existe");
  });

  it("4. busca por nome e código", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    repo.criarRascunhoBasico({
      nome: "Molho vermelho",
      codigo: "FT-MOLHO",
      tipo: "sub_receita",
      criado_por: "maria",
      rendimento_unidade_id: selecionarUnidadePadraoRascunho(ctx.estadoAtual().unidades),
    });
    repo.criarRascunhoBasico({
      nome: "Lasanha bolonhesa",
      codigo: "FT-LASANHA",
      tipo: "prato",
      criado_por: "maria",
      rendimento_unidade_id: selecionarUnidadePadraoRascunho(ctx.estadoAtual().unidades),
    });

    const itens = listarItensCatalogoFichasTecnicas(repo, ctx.estadoAtual().categorias_produtos);
    expect(filtrarItensCatalogoFichasTecnicas(itens, { busca: "molho", tipo: "todos", status: "todos" })).toHaveLength(1);
    expect(filtrarItensCatalogoFichasTecnicas(itens, { busca: "ft-lasanha", tipo: "todos", status: "todos" })).toHaveLength(1);
  });

  it("5. filtros por tipo e status", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);

    const prato = repo.criarRascunhoBasico({
      nome: "Lasanha bolonhesa",
      codigo: "FT-LASANHA",
      tipo: "prato",
      criado_por: "maria",
      rendimento_unidade_id: selecionarUnidadePadraoRascunho(ctx.estadoAtual().unidades),
    });
    repo.criarRascunhoBasico({
      nome: "Molho vermelho",
      codigo: "FT-MOLHO",
      tipo: "sub_receita",
      criado_por: "maria",
      rendimento_unidade_id: selecionarUnidadePadraoRascunho(ctx.estadoAtual().unidades),
    });
    repo.publicarVersao(prato.receita.id, prato.versao.id, { responsavel: "maria" });

    const itens = listarItensCatalogoFichasTecnicas(repo, ctx.estadoAtual().categorias_produtos);
    expect(filtrarItensCatalogoFichasTecnicas(itens, { busca: "", tipo: "sub_receita", status: "todos" })).toHaveLength(1);
    expect(filtrarItensCatalogoFichasTecnicas(itens, { busca: "", tipo: "todos", status: "publicada" })).toHaveLength(1);
    expect(filtrarItensCatalogoFichasTecnicas(itens, { busca: "", tipo: "prato", status: "publicada" })).toHaveLength(1);
  });

  it("6. cancelamento sem gravação", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);
    const coordenador = criarCoordenadorNovoRascunhoFichaTecnica({
      repositorio: repo,
      criado_por: "maria",
      rendimento_unidade_id: selecionarUnidadePadraoRascunho(ctx.estadoAtual().unidades),
    });

    const formulario = coordenador.cancelar();

    expect(formulario).toEqual(criarFormularioNovoRascunhoInicial());
    expect(repo.listarReceitas()).toHaveLength(0);
  });

  it("7. duplo envio sem duplicação", async () => {
    let chamadas = 0;
    let resolver:
      | ((valor: {
          receita: {
            id: string;
            codigo: string;
            nome: string;
            criado_em: string;
            atualizado_em: string;
          };
          versao: {
            id: string;
            receita_id: string;
            numero_versao: string;
            status: "rascunho";
            ficha: {
              id: string;
              nome: string;
              status: "rascunho";
              versao: string;
              rendimento_quantidade: number;
              rendimento_unidade_id: string;
              ingredientes: [];
              passos: [];
              alergenicos: {
                gluten: "NAO_INFORMADO";
                lactose: "NAO_INFORMADO";
                ovos: "NAO_INFORMADO";
                peixes: "NAO_INFORMADO";
                crustaceos: "NAO_INFORMADO";
                soja: "NAO_INFORMADO";
                castanhas: "NAO_INFORMADO";
                amendoim: "NAO_INFORMADO";
                outros: [];
              };
              criado_em: string;
              atualizado_em: string;
            };
            criado_em: string;
            atualizado_em: string;
          };
        }) => void)
      | undefined;
    const repositorio = {
      criarRascunhoBasico: () => {
        chamadas += 1;
        return new Promise<{
          receita: {
            id: string;
            codigo: string;
            nome: string;
            criado_em: string;
            atualizado_em: string;
          };
          versao: {
            id: string;
            receita_id: string;
            numero_versao: string;
            status: "rascunho";
            ficha: {
              id: string;
              nome: string;
              status: "rascunho";
              versao: string;
              rendimento_quantidade: number;
              rendimento_unidade_id: string;
              ingredientes: [];
              passos: [];
              alergenicos: {
                gluten: "NAO_INFORMADO";
                lactose: "NAO_INFORMADO";
                ovos: "NAO_INFORMADO";
                peixes: "NAO_INFORMADO";
                crustaceos: "NAO_INFORMADO";
                soja: "NAO_INFORMADO";
                castanhas: "NAO_INFORMADO";
                amendoim: "NAO_INFORMADO";
                outros: [];
              };
              criado_em: string;
              atualizado_em: string;
            };
            criado_em: string;
            atualizado_em: string;
          };
        }>((resolve) => {
          resolver = resolve;
        });
      },
    };

    const coordenador = criarCoordenadorNovoRascunhoFichaTecnica({
      repositorio,
      criado_por: "maria",
      rendimento_unidade_id: "un",
    });

    const primeiro = coordenador.salvar({
      nome: "Molho da casa",
      codigo: "FT-001",
      tipo: "prato",
      categoria_id: "",
      descricao: "",
    });
    const segundo = coordenador.salvar({
      nome: "Molho da casa",
      codigo: "FT-001",
      tipo: "prato",
      categoria_id: "",
      descricao: "",
    });

    expect(chamadas).toBe(1);
    expect(segundo).toBe(primeiro);

    resolver?.({
      receita: {
        id: "rec-1",
        codigo: "FT-001",
        nome: "Molho da casa",
        criado_em: "2026-07-27T00:00:00.000Z",
        atualizado_em: "2026-07-27T00:00:00.000Z",
      },
      versao: {
        id: "ver-1",
        receita_id: "rec-1",
        numero_versao: "1.0.0",
        status: "rascunho",
        ficha: {
          id: "ver-1",
          nome: "Molho da casa",
          status: "rascunho",
          versao: "1.0.0",
          rendimento_quantidade: 1,
          rendimento_unidade_id: "un",
          ingredientes: [],
          passos: [],
          alergenicos: {
            gluten: "NAO_INFORMADO",
            lactose: "NAO_INFORMADO",
            ovos: "NAO_INFORMADO",
            peixes: "NAO_INFORMADO",
            crustaceos: "NAO_INFORMADO",
            soja: "NAO_INFORMADO",
            castanhas: "NAO_INFORMADO",
            amendoim: "NAO_INFORMADO",
            outros: [],
          },
          criado_em: "2026-07-27T00:00:00.000Z",
          atualizado_em: "2026-07-27T00:00:00.000Z",
        },
        criado_em: "2026-07-27T00:00:00.000Z",
        atualizado_em: "2026-07-27T00:00:00.000Z",
      },
    });
    await expect(primeiro).resolves.toMatchObject({ receita: { id: "rec-1" }, versao: { id: "ver-1" } });
  });

  it("8. consultas sem mutação acidental dos objetos", () => {
    const ctx = criarPersistenciaMemoria(criarBancoBase());
    const repo = criarRepositorioFichasTecnicasLocal(ctx.persistencia);
    repo.criarRascunhoBasico({
      nome: "Molho vermelho",
      codigo: "FT-MOLHO",
      tipo: "sub_receita",
      criado_por: "maria",
      rendimento_unidade_id: selecionarUnidadePadraoRascunho(ctx.estadoAtual().unidades),
    });

    const itens = listarItensCatalogoFichasTecnicas(repo, ctx.estadoAtual().categorias_produtos);
    itens[0].nome = "Alterado";
    const filtrados = filtrarItensCatalogoFichasTecnicas(itens, { busca: "", tipo: "todos", status: "todos" });
    filtrados[0].codigo = "MUTADO";

    const novaLeitura = listarItensCatalogoFichasTecnicas(repo, ctx.estadoAtual().categorias_produtos);
    expect(novaLeitura[0].nome).toBe("Molho vermelho");
    expect(novaLeitura[0].codigo).toBe("FT-MOLHO");
  });
});