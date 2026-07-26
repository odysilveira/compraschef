import {
  atualizarFichaRascunho,
  criarSnapshotCusto,
  publicarFicha,
} from "../domain/fichas-tecnicas";
import type {
  NovaReceitaFichaTecnica,
  NovaVersaoRascunhoFichaTecnica,
  RepositorioFichasTecnicas,
} from "../domain/fichas-tecnicas-repositorio";
import { getDB, migrarColecoesFichasTecnicas, substituirDB } from "./index";
import type {
  DB,
  FichaTecnica,
  ReceitaFichaTecnica,
  ReceitaFichaTecnicaVersao,
} from "../types";

export interface PersistenciaBancoLocal {
  ler(): DB;
  salvar(proximoBanco: DB): void;
}

function clonarDefensivo<T>(valor: T): T {
  return structuredClone(valor);
}

function agoraIso(): string {
  return new Date().toISOString();
}

function normalizarCodigo(codigo: string): string {
  return codigo.trim().toLocaleLowerCase("pt-BR");
}

function garantirColecoes(db: DB): {
  receitas: ReceitaFichaTecnica[];
  versoes: ReceitaFichaTecnicaVersao[];
} {
  migrarColecoesFichasTecnicas(db);
  if (!db.fichas_tecnicas_receitas) {
    db.fichas_tecnicas_receitas = [];
  }
  if (!db.fichas_tecnicas_versoes) {
    db.fichas_tecnicas_versoes = [];
  }
  if (!db.ficha_tecnica_custo_snapshots) {
    db.ficha_tecnica_custo_snapshots = [];
  }

  return {
    receitas: db.fichas_tecnicas_receitas,
    versoes: db.fichas_tecnicas_versoes,
  };
}

function leituraNormalizada(persistencia: PersistenciaBancoLocal): DB {
  const banco = clonarDefensivo(persistencia.ler());
  migrarColecoesFichasTecnicas(banco);
  return banco;
}

function validarDadosBase(novaReceita: NovaReceitaFichaTecnica): void {
  if (!novaReceita.id.trim()) {
    throw new Error("Id da receita é obrigatório.");
  }
  if (!novaReceita.codigo.trim()) {
    throw new Error("Código da receita é obrigatório.");
  }
  if (!novaReceita.nome.trim()) {
    throw new Error("Nome da receita é obrigatório.");
  }
}

function ordenarVersoes(versoes: ReceitaFichaTecnicaVersao[]): ReceitaFichaTecnicaVersao[] {
  return [...versoes].sort((a, b) => {
    const porData = a.criado_em.localeCompare(b.criado_em);
    if (porData !== 0) return porData;
    return a.numero_versao.localeCompare(b.numero_versao);
  });
}

export function criarPersistenciaBancoLocalPadrao(): PersistenciaBancoLocal {
  return {
    ler: () => getDB(),
    salvar: (proximoBanco) => {
      substituirDB(proximoBanco);
    },
  };
}

export function criarRepositorioFichasTecnicasLocal(
  persistencia: PersistenciaBancoLocal = criarPersistenciaBancoLocalPadrao()
): RepositorioFichasTecnicas {
  function executarGravacaoAtomica<T>(
    operacao: (bancoEditavel: DB) => T
  ): T {
    const bancoBase = leituraNormalizada(persistencia);
    const bancoProposto = clonarDefensivo(bancoBase);
    const resultado = operacao(bancoProposto);
    persistencia.salvar(bancoProposto);
    return clonarDefensivo(resultado);
  }

  function listarReceitas(): ReceitaFichaTecnica[] {
    const banco = leituraNormalizada(persistencia);
    const { receitas } = garantirColecoes(banco);
    return clonarDefensivo(receitas);
  }

  function buscarReceitaPorId(receitaId: string): ReceitaFichaTecnica | undefined {
    const banco = leituraNormalizada(persistencia);
    const { receitas } = garantirColecoes(banco);
    const receita = receitas.find((item) => item.id === receitaId);
    return receita ? clonarDefensivo(receita) : undefined;
  }

  function buscarReceitaPorCodigo(codigo: string): ReceitaFichaTecnica | undefined {
    const banco = leituraNormalizada(persistencia);
    const { receitas } = garantirColecoes(banco);
    const codigoNormalizado = normalizarCodigo(codigo);
    const receita = receitas.find((item) => normalizarCodigo(item.codigo) === codigoNormalizado);
    return receita ? clonarDefensivo(receita) : undefined;
  }

  function salvarNovaReceita(novaReceita: NovaReceitaFichaTecnica): ReceitaFichaTecnica {
    validarDadosBase(novaReceita);

    return executarGravacaoAtomica((banco) => {
      const { receitas } = garantirColecoes(banco);
      if (receitas.some((item) => item.id === novaReceita.id)) {
        throw new Error(`Receita com id ${novaReceita.id} já existe.`);
      }
      if (receitas.some((item) => normalizarCodigo(item.codigo) === normalizarCodigo(novaReceita.codigo))) {
        throw new Error(`Receita com código ${novaReceita.codigo} já existe.`);
      }

      const agora = agoraIso();
      const receita: ReceitaFichaTecnica = {
        id: novaReceita.id,
        codigo: novaReceita.codigo.trim(),
        nome: novaReceita.nome.trim(),
        descricao: novaReceita.descricao?.trim() || undefined,
        criado_em: agora,
        atualizado_em: agora,
      };

      receitas.push(receita);
      return receita;
    });
  }

  function atualizarRascunho(
    versaoId: string,
    atualizacoes: Partial<Omit<FichaTecnica, "id" | "versao" | "criado_em">>
  ): ReceitaFichaTecnicaVersao {
    return executarGravacaoAtomica((banco) => {
      const { versoes } = garantirColecoes(banco);
      const versao = versoes.find((item) => item.id === versaoId);
      if (!versao) {
        throw new Error(`Versão com id ${versaoId} não encontrada.`);
      }

      const fichaAtualizada = atualizarFichaRascunho(versao.ficha, clonarDefensivo(atualizacoes));
      versao.ficha = clonarDefensivo(fichaAtualizada);
      versao.status = fichaAtualizada.status;
      versao.atualizado_em = agoraIso();

      return versao;
    });
  }

  function listarVersoesDaReceita(receitaId: string): ReceitaFichaTecnicaVersao[] {
    const banco = leituraNormalizada(persistencia);
    const { versoes } = garantirColecoes(banco);
    return clonarDefensivo(ordenarVersoes(versoes.filter((item) => item.receita_id === receitaId)));
  }

  function buscarVersaoPorId(versaoId: string): ReceitaFichaTecnicaVersao | undefined {
    const banco = leituraNormalizada(persistencia);
    const { versoes } = garantirColecoes(banco);
    const versao = versoes.find((item) => item.id === versaoId);
    return versao ? clonarDefensivo(versao) : undefined;
  }

  function salvarNovaVersaoRascunho(
    novaVersao: NovaVersaoRascunhoFichaTecnica
  ): ReceitaFichaTecnicaVersao {
    return executarGravacaoAtomica((banco) => {
      const { receitas, versoes } = garantirColecoes(banco);

      const receita = receitas.find((item) => item.id === novaVersao.receita_id);
      if (!receita) {
        throw new Error(`Receita com id ${novaVersao.receita_id} não encontrada.`);
      }

      if (versoes.some((item) => item.id === novaVersao.id)) {
        throw new Error(`Versão com id ${novaVersao.id} já existe.`);
      }

      if (versoes.some((item) => item.receita_id === novaVersao.receita_id && item.numero_versao === novaVersao.numero_versao)) {
        throw new Error(
          `A receita ${novaVersao.receita_id} já possui a versão ${novaVersao.numero_versao}.`
        );
      }

      if (novaVersao.ficha.id !== novaVersao.id) {
        throw new Error("Id da versão deve ser igual ao id da ficha técnica.");
      }

      if (novaVersao.ficha.versao !== novaVersao.numero_versao) {
        throw new Error("Número da versão deve ser igual ao campo versao da ficha técnica.");
      }

      if (novaVersao.ficha.status !== "rascunho") {
        throw new Error("Somente versões em rascunho podem ser salvas nesta operação.");
      }

      const agora = agoraIso();
      const versao: ReceitaFichaTecnicaVersao = {
        id: novaVersao.id,
        receita_id: novaVersao.receita_id,
        numero_versao: novaVersao.numero_versao,
        status: "rascunho",
        ficha: clonarDefensivo(novaVersao.ficha),
        criado_em: agora,
        atualizado_em: agora,
      };

      versoes.push(versao);
      receita.atualizado_em = agora;
      return versao;
    });
  }

  function publicarVersao(receitaId: string, versaoId: string): ReceitaFichaTecnicaVersao {
    return executarGravacaoAtomica((banco) => {
      const { receitas, versoes } = garantirColecoes(banco);
      const snapshots = banco.ficha_tecnica_custo_snapshots ?? [];

      const receita = receitas.find((item) => item.id === receitaId);
      if (!receita) {
        throw new Error(`Receita com id ${receitaId} não encontrada.`);
      }

      const versao = versoes.find((item) => item.id === versaoId);
      if (!versao) {
        throw new Error(`Versão com id ${versaoId} não encontrada.`);
      }

      if (versao.receita_id !== receitaId) {
        throw new Error(`Versão ${versaoId} não pertence à receita ${receitaId}.`);
      }

      if (versao.status !== "rascunho" || versao.ficha.status !== "rascunho") {
        throw new Error(`A versão ${versao.id} não está em rascunho para publicação.`);
      }

      const fichasParaValidacao = versoes.map((item) => clonarDefensivo(item.ficha));
      const fichaPublicada = publicarFicha(
        clonarDefensivo(versao.ficha),
        fichasParaValidacao,
        clonarDefensivo(banco.produtos),
        clonarDefensivo(banco.unidades)
      );

      const fichasComPublicacao = versoes.map((item) =>
        item.id === versaoId ? clonarDefensivo(fichaPublicada) : clonarDefensivo(item.ficha)
      );
      const snapshot = criarSnapshotCusto(
        clonarDefensivo(fichaPublicada),
        fichasComPublicacao,
        clonarDefensivo(banco.produtos),
        clonarDefensivo(banco.unidades)
      );

      if (snapshots.some((item) => item.id === snapshot.id)) {
        throw new Error(`Snapshot de custo com id ${snapshot.id} já existe.`);
      }

      const agora = agoraIso();
      versao.ficha = clonarDefensivo(fichaPublicada);
      versao.status = "publicada";
      versao.publicada_em = agora;
      versao.snapshot_custo_id = snapshot.id;
      versao.atualizado_em = agora;

      receita.versao_vigente_id = versao.id;
      receita.atualizado_em = agora;

      snapshots.push(snapshot);
      banco.ficha_tecnica_custo_snapshots = snapshots;

      return versao;
    });
  }

  function obterVersaoVigenteEmData(
    receitaId: string,
    dataIso: string
  ): ReceitaFichaTecnicaVersao | undefined {
    const data = new Date(dataIso);
    if (Number.isNaN(data.getTime())) {
      throw new Error(`Data inválida: ${dataIso}.`);
    }

    const banco = leituraNormalizada(persistencia);
    const { versoes } = garantirColecoes(banco);
    const candidatas = versoes
      .filter((item) => item.receita_id === receitaId && item.status === "publicada" && item.publicada_em)
      .filter((item) => new Date(item.publicada_em as string).getTime() <= data.getTime())
      .sort((a, b) => (b.publicada_em as string).localeCompare(a.publicada_em as string));

    const vigente = candidatas[0];
    return vigente ? clonarDefensivo(vigente) : undefined;
  }

  return {
    listarReceitas,
    buscarReceitaPorId,
    buscarReceitaPorCodigo,
    salvarNovaReceita,
    atualizarRascunho,
    listarVersoesDaReceita,
    buscarVersaoPorId,
    salvarNovaVersaoRascunho,
    publicarVersao,
    obterVersaoVigenteEmData,
  };
}
