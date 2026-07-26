import {
  atualizarFichaRascunho,
  criarSnapshotCusto,
  listarConfiguracoesPorcionamento,
  obterSiglaUnidade,
  publicarFicha,
  converterUnidadeBasica,
} from "./fichas-tecnicas";
import type {
  ContextoOperacaoFichaTecnica,
  NovaReceitaFichaTecnica,
  NovaVersaoRascunhoFichaTecnica,
  RepositorioFichasTecnicas,
} from "./fichas-tecnicas-repositorio";
import { getDB, migrarColecoesFichasTecnicas, substituirDB, uid } from "../data/index";
import type {
  DB,
  EventoHistoricoReceitaVersao,
  FichaTecnica,
  FichaTecnicaConfiguracaoPorcionamento,
  FichaTecnicaIngrediente,
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

function validarResponsavel(contexto: ContextoOperacaoFichaTecnica | undefined, operacao: string): asserts contexto is ContextoOperacaoFichaTecnica {
  if (!contexto || !contexto.responsavel?.trim()) {
    throw new Error(`Responsável é obrigatório para ${operacao}.`);
  }

  if (contexto.em !== undefined) {
    const data = new Date(contexto.em);
    if (Number.isNaN(data.getTime())) {
      throw new Error(`Data/hora inválida para ${operacao}: ${contexto.em}.`);
    }
  }
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
  if (!novaReceita.criado_por?.trim()) {
    throw new Error("Responsável de criação da receita é obrigatório.");
  }
}

function ordenarVersoes(versoes: ReceitaFichaTecnicaVersao[]): ReceitaFichaTecnicaVersao[] {
  return [...versoes].sort((a, b) => {
    const porData = a.criado_em.localeCompare(b.criado_em);
    if (porData !== 0) return porData;
    return a.numero_versao.localeCompare(b.numero_versao);
  });
}

function extrairConfiguracoesPorcionamento(ficha: FichaTecnica): FichaTecnicaConfiguracaoPorcionamento[] {
  return listarConfiguracoesPorcionamento(ficha);
}

function ordenarHistorico(eventos: EventoHistoricoReceitaVersao[]): EventoHistoricoReceitaVersao[] {
  return [...eventos].sort((a, b) => {
    const porData = a.em.localeCompare(b.em);
    if (porData !== 0) return porData;
    const porAcao = a.acao.localeCompare(b.acao);
    if (porAcao !== 0) return porAcao;
    return a.id.localeCompare(b.id);
  });
}

function instanteOperacao(contexto: ContextoOperacaoFichaTecnica): string {
  if (contexto.em) {
    const data = new Date(contexto.em);
    if (Number.isNaN(data.getTime())) {
      throw new Error(`Data/hora inválida: ${contexto.em}.`);
    }
    return data.toISOString();
  }
  return agoraIso();
}

function registrarEventoHistorico(
  versao: ReceitaFichaTecnicaVersao,
  acao: EventoHistoricoReceitaVersao["acao"],
  responsavel: string,
  em: string,
  detalhes?: string
): void {
  if (!versao.id?.trim()) {
    throw new Error("Versão inválida para registro de histórico.");
  }
  if (!responsavel.trim()) {
    throw new Error("Responsável é obrigatório para registrar histórico.");
  }
  const data = new Date(em);
  if (Number.isNaN(data.getTime())) {
    throw new Error(`Data/hora inválida para histórico: ${em}.`);
  }

  if (!versao.historico) {
    versao.historico = [];
  }
  versao.historico.push({
    id: uid("hist-ft"),
    versao_id: versao.id,
    acao,
    responsavel,
    em: data.toISOString(),
    detalhes,
  });
  versao.historico = ordenarHistorico(versao.historico);
}

function congelarConversaoIngredientes(
  fichaPublicada: FichaTecnica,
  versoes: ReceitaFichaTecnicaVersao[],
  db: DB,
  snapshotEm: string
): FichaTecnica {
  const ingredientes = fichaPublicada.ingredientes.map((ingrediente) =>
    congelarConversaoIngrediente(ingrediente, versoes, db, snapshotEm)
  );

  return {
    ...clonarDefensivo(fichaPublicada),
    ingredientes,
  };
}

function congelarConversaoIngrediente(
  ingrediente: FichaTecnicaIngrediente,
  versoes: ReceitaFichaTecnicaVersao[],
  db: DB,
  snapshotEm: string
): FichaTecnicaIngrediente {
  if (ingrediente.tipo === "PRODUTO") {
    const produto = db.produtos.find((item) => item.id === ingrediente.produto_id);
    if (!produto) {
      throw new Error(`Produto com id ${ingrediente.produto_id} não encontrado.`);
    }

    let quantidadeConvertida: number;
    let fatorAplicado = 1;
    let origem = "identidade";

    if (ingrediente.unidade_id === produto.unidade_uso_id) {
      quantidadeConvertida = ingrediente.quantidade;
    } else if (produto.unidade_compra_id && ingrediente.unidade_id === produto.unidade_compra_id) {
      if (!Number.isFinite(produto.fator_conversao) || produto.fator_conversao <= 0) {
        throw new Error(`Produto ${produto.id} com fator de conversão inválido.`);
      }
      fatorAplicado = produto.fator_conversao;
      quantidadeConvertida = ingrediente.quantidade * fatorAplicado;
      origem = `produto:${produto.id}`;
    } else {
      const siglaOrigem = obterSiglaUnidade(ingrediente.unidade_id, db.unidades);
      const siglaBase = obterSiglaUnidade(produto.unidade_uso_id, db.unidades);
      quantidadeConvertida = converterUnidadeBasica(ingrediente.quantidade, siglaOrigem, siglaBase);
      fatorAplicado = quantidadeConvertida / ingrediente.quantidade;
      origem = `unidade:${siglaOrigem}->${siglaBase}`;
    }

    return {
      ...clonarDefensivo(ingrediente),
      conversao_snapshot: {
        unidade_informada: ingrediente.unidade_id,
        unidade_base: produto.unidade_uso_id,
        fator_conversao_aplicado: fatorAplicado,
        quantidade_convertida: quantidadeConvertida,
        origem_conversao: origem,
        snapshot_em: snapshotEm,
      },
    };
  }

  const subReceitaId = ingrediente.sub_receita_id;
  if (!subReceitaId) {
    throw new Error(`Ingrediente ${ingrediente.id} do tipo SUB_RECEITA sem sub_receita_id.`);
  }

  const subReceita = versoes.find((item) => item.id === subReceitaId);
  if (!subReceita) {
    throw new Error(`Sub-receita com id ${subReceitaId} não encontrada.`);
  }

  const unidadeRendimentoSub = subReceita.unidade_rendimento ?? subReceita.ficha.rendimento_unidade_id;

  const siglaOrigem = obterSiglaUnidade(ingrediente.unidade_id, db.unidades);
  const siglaBase = obterSiglaUnidade(unidadeRendimentoSub, db.unidades);
  const quantidadeConvertida = converterUnidadeBasica(ingrediente.quantidade, siglaOrigem, siglaBase);

  return {
    ...clonarDefensivo(ingrediente),
    conversao_snapshot: {
      unidade_informada: ingrediente.unidade_id,
        unidade_base: unidadeRendimentoSub,
      fator_conversao_aplicado: quantidadeConvertida / ingrediente.quantidade,
      quantidade_convertida: quantidadeConvertida,
      origem_conversao: `sub-receita:${subReceita.id}`,
      snapshot_em: snapshotEm,
    },
  };
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
  function executarGravacaoAtomica<T>(operacao: (bancoEditavel: DB) => T): T {
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
        criado_por: novaReceita.criado_por,
        atualizado_por: novaReceita.criado_por,
        criado_em: agora,
        atualizado_em: agora,
      };

      receitas.push(receita);
      return receita;
    });
  }

  function atualizarRascunho(
    versaoId: string,
    atualizacoes: Partial<Omit<FichaTecnica, "id" | "versao" | "criado_em">>,
    contexto: ContextoOperacaoFichaTecnica
  ): ReceitaFichaTecnicaVersao {
    validarResponsavel(contexto, "alteração de rascunho");

    return executarGravacaoAtomica((banco) => {
      const { versoes } = garantirColecoes(banco);
      const versao = versoes.find((item) => item.id === versaoId);
      if (!versao) {
        throw new Error(`Versão com id ${versaoId} não encontrada.`);
      }

      const agora = instanteOperacao(contexto);
      const fichaAtualizada = atualizarFichaRascunho(versao.ficha, clonarDefensivo(atualizacoes), contexto.responsavel);
      versao.ficha = clonarDefensivo(fichaAtualizada);
      versao.status = fichaAtualizada.status;
      versao.rendimento_total = fichaAtualizada.rendimento_quantidade;
      versao.unidade_rendimento = fichaAtualizada.rendimento_unidade_id;
      versao.configuracoes_porcionamento = extrairConfiguracoesPorcionamento(fichaAtualizada);
      versao.atualizado_por = contexto.responsavel;
      versao.atualizado_em = agora;
      registrarEventoHistorico(versao, "alteracao_rascunho", contexto.responsavel, agora);

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

  function salvarNovaVersaoRascunho(novaVersao: NovaVersaoRascunhoFichaTecnica): ReceitaFichaTecnicaVersao {
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
        throw new Error(`A receita ${novaVersao.receita_id} já possui a versão ${novaVersao.numero_versao}.`);
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

      if (!novaVersao.criado_por?.trim()) {
        throw new Error("Responsável de criação da versão é obrigatório.");
      }

      const agora = agoraIso();
      const versao: ReceitaFichaTecnicaVersao = {
        id: novaVersao.id,
        receita_id: novaVersao.receita_id,
        numero_versao: novaVersao.numero_versao,
        status: "rascunho",
        rendimento_total: novaVersao.ficha.rendimento_quantidade,
        unidade_rendimento: novaVersao.ficha.rendimento_unidade_id,
        configuracoes_porcionamento: extrairConfiguracoesPorcionamento(novaVersao.ficha),
        ficha: clonarDefensivo(novaVersao.ficha),
        criado_por: novaVersao.criado_por,
        atualizado_por: novaVersao.criado_por,
        criado_em: agora,
        atualizado_em: agora,
        historico: [],
      };

      registrarEventoHistorico(versao, "criacao", novaVersao.criado_por, agora);
      versoes.push(versao);
      receita.atualizado_por = novaVersao.criado_por;
      receita.atualizado_em = agora;
      return versao;
    });
  }

  function publicarVersao(
    receitaId: string,
    versaoId: string,
    contexto: ContextoOperacaoFichaTecnica
  ): ReceitaFichaTecnicaVersao {
    validarResponsavel(contexto, "publicação de versão");

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
      const fichaPublicadaBase = publicarFicha(
        clonarDefensivo(versao.ficha),
        fichasParaValidacao,
        clonarDefensivo(banco.produtos),
        clonarDefensivo(banco.unidades),
        contexto.responsavel
      );

      const agora = instanteOperacao(contexto);
      const fichaPublicada = congelarConversaoIngredientes(fichaPublicadaBase, versoes, banco, agora);

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

      versao.ficha = clonarDefensivo(fichaPublicada);
      versao.status = "publicada";
      versao.rendimento_total = fichaPublicada.rendimento_quantidade;
      versao.unidade_rendimento = fichaPublicada.rendimento_unidade_id;
      versao.configuracoes_porcionamento = extrairConfiguracoesPorcionamento(fichaPublicada);
      versao.publicado_por = contexto.responsavel;
      versao.publicada_em = agora;
      versao.snapshot_custo_id = snapshot.id;
      versao.atualizado_por = contexto.responsavel;
      versao.atualizado_em = agora;
      registrarEventoHistorico(versao, "publicacao", contexto.responsavel, agora);

      receita.versao_vigente_id = versao.id;
      receita.atualizado_por = contexto.responsavel;
      receita.atualizado_em = agora;

      snapshots.push(snapshot);
      banco.ficha_tecnica_custo_snapshots = snapshots;

      return versao;
    });
  }

  function obterVersaoVigenteEmData(receitaId: string, dataIso: string): ReceitaFichaTecnicaVersao | undefined {
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

  function listarHistoricoDaVersao(versaoId: string): EventoHistoricoReceitaVersao[] {
    const versao = buscarVersaoPorId(versaoId);
    return clonarDefensivo(ordenarHistorico(versao?.historico ?? []));
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
    listarHistoricoDaVersao,
  };
}
