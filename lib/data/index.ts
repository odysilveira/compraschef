"use client";

// Camada de dados mock: banco em memória + persistência em localStorage.
// Quando o Supabase for configurado, estas funções serão trocadas por consultas reais
// mantendo as mesmas assinaturas.

import { useEffect, useSyncExternalStore } from "react";
import type { Caixa, ContaPagar, ContaPagarHistorico, DB, Produto, StatusContaPagar } from "@/lib/types";
import { seedDB } from "./seed";
import { LOCAL_ESTOQUE_SECO, LOCAL_GELADEIRA_2, produtosReais, UNIDADE_SACO } from "./catalogo";
import { compararPrioridadeConsumo, saldoDosLotes } from "../domain/estoque";
import { extrairCnpjEmitenteDaChaveAcesso } from "../domain/nfe-parcelas";
import { associarCategoriasProdutos } from "../domain/produtos";
import { recuperarVinculosLegadosBoletos } from "../domain/recuperacao-boleto-legado";
import { pessoaParaSeedDePerfil } from "../domain/rh";

const STORAGE_KEY = "compraschef-db-v1";

let current: DB = seedDB;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((cb) => cb());
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // sem localStorage (SSR ou navegação privada) — segue só em memória
  }
}

/** Garante as coleções de fichas técnicas no banco local (retrocompatível e idempotente). */
export function migrarColecoesFichasTecnicas(db: DB): boolean {
  let mudou = false;

  if (!Array.isArray(db.fichas_tecnicas_receitas)) {
    db.fichas_tecnicas_receitas = [];
    mudou = true;
  }

  if (!Array.isArray(db.fichas_tecnicas_versoes)) {
    db.fichas_tecnicas_versoes = [];
    mudou = true;
  }

  if (!Array.isArray(db.ficha_tecnica_custo_snapshots)) {
    db.ficha_tecnica_custo_snapshots = [];
    mudou = true;
  }

  if (!Array.isArray(db.fichas_tecnicas) || db.fichas_tecnicas.length === 0) {
    return mudou;
  }

  for (const fichaLegada of db.fichas_tecnicas) {
    const receitaId = fichaLegada.id;
    const codigoReceita = fichaLegada.codigo_externo?.trim() || `FT-${fichaLegada.id}`;

    if (!db.fichas_tecnicas_receitas.some((r) => r.id === receitaId)) {
      db.fichas_tecnicas_receitas.push({
        id: receitaId,
        codigo: codigoReceita,
        nome: fichaLegada.nome,
        descricao: fichaLegada.descricao,
        versao_vigente_id: fichaLegada.status === "publicada" ? fichaLegada.id : undefined,
        criado_em: fichaLegada.criado_em,
        atualizado_em: fichaLegada.atualizado_em,
      });
      mudou = true;
    }

    const versaoExiste = db.fichas_tecnicas_versoes.some((v) => v.id === fichaLegada.id);
    if (!versaoExiste) {
      db.fichas_tecnicas_versoes.push({
        id: fichaLegada.id,
        receita_id: receitaId,
        numero_versao: fichaLegada.versao,
        status: fichaLegada.status,
        ficha: structuredClone(fichaLegada),
        publicada_em: fichaLegada.status === "publicada" ? fichaLegada.atualizado_em : undefined,
        criado_em: fichaLegada.criado_em,
        atualizado_em: fichaLegada.atualizado_em,
      });
      mudou = true;
    }
  }

  return mudou;
}

/** Acrescenta ao banco salvo itens novos do catálogo (idempotente — nada é sobrescrito). */
export function atualizarComNovidades(db: DB): boolean {
  let mudou = false;

  if (migrarColecoesFichasTecnicas(db)) {
    mudou = true;
  }

  if (!Array.isArray(db.pessoas)) {
    const agora = new Date().toISOString();
    db.pessoas = (db.perfis ?? []).map((perfil) =>
      pessoaParaSeedDePerfil({
        id: perfil.id,
        nome: perfil.nome,
        papel: perfil.papel,
        agora,
      })
    );
    mudou = true;
  }

  if (!Array.isArray(db.pagamentos_pessoas)) {
    db.pagamentos_pessoas = [];
    mudou = true;
  }

  if (!Array.isArray(db.consumos_pessoas)) {
    db.consumos_pessoas = [];
    mudou = true;
  }

  if (!Array.isArray(db.escala_slots)) {
    db.escala_slots = [];
    mudou = true;
  }

  if (!Array.isArray(db.convocacoes)) {
    db.convocacoes = [];
    mudou = true;
  }

  if (!Array.isArray(db.contas_bancarias)) {
    db.contas_bancarias = [];
    mudou = true;
  }

  if (!Array.isArray(db.batidas_ponto)) {
    db.batidas_ponto = [];
    mudou = true;
  }

  if (!Array.isArray(db.pendencias_ponto)) {
    db.pendencias_ponto = [];
    mudou = true;
  }

  if (!db.config_rh) {
    db.config_rh = {
      aviso_ponto_horas: 24,
      atualizado_em: new Date().toISOString(),
    };
    mudou = true;
  } else if (
    typeof db.config_rh.aviso_ponto_horas !== "number" ||
    !Number.isFinite(db.config_rh.aviso_ponto_horas)
  ) {
    db.config_rh.aviso_ponto_horas = 24;
    mudou = true;
  }

  // Migração do mock anterior: transforma cada caixa ocupada em um lote canônico,
  // preservando exatamente o saldo que já estava salvo no navegador.
  if (!Array.isArray(db.lotes_estoque)) {
    db.lotes_estoque = db.caixas
      .filter((c) => c.status !== "vazia" && c.produto_id && (c.quantidade ?? 0) > 0)
      .map((c) => ({
        id: `lote-migrado-${c.id}`,
        produto_id: c.produto_id!,
        origem: "manual" as const,
        quantidade_inicial: c.quantidade!,
        quantidade_atual: c.quantidade!,
        data_entrada: c.data_envase ?? c.atualizado_em.slice(0, 10),
        validade: c.validade,
        criado_em: c.atualizado_em,
        atualizado_em: c.atualizado_em,
      }));
    mudou = true;
  }
  for (const lote of db.lotes_estoque) {
    if (!lote.origem) {
      const produto = db.produtos.find((p) => p.id === lote.produto_id);
      lote.origem = lote.recebimento_item_id ? "recebimento" : produto?.tipo === "produzido" ? "producao" : "manual";
      mudou = true;
    }
  }
  if (!Array.isArray(db.alocacoes_caixa)) {
    type LoteLegado = (typeof db.lotes_estoque)[number] & { caixa_id?: string; local_id?: string };
    db.alocacoes_caixa = db.caixas
      .filter((c) => c.status !== "vazia" && c.produto_id && (c.quantidade ?? 0) > 0)
      .map((c) => {
        const legado = db.lotes_estoque.find((l) => (l as LoteLegado).caixa_id === c.id);
        const lote = legado ?? db.lotes_estoque.find(
          (l) => l.produto_id === c.produto_id && l.quantidade_atual === c.quantidade
        );
        return {
          id: `aloc-migrada-${c.id}`,
          lote_id: lote?.id ?? `lote-migrado-${c.id}`,
          caixa_id: c.id,
          quantidade_inicial: c.quantidade!,
          quantidade_atual: c.quantidade!,
          criado_em: c.atualizado_em,
          atualizado_em: c.atualizado_em,
        };
      });
    for (const lote of db.lotes_estoque as LoteLegado[]) {
      delete lote.caixa_id;
      delete lote.local_id;
    }
    mudou = true;
  }
  if (!Array.isArray(db.categorias_produtos)) {
    db.categorias_produtos = [];
    mudou = true;
  }
  if (!Array.isArray(db.produto_codigos_barras)) {
    db.produto_codigos_barras = [];
    for (const produto of db.produtos) {
      if (produto.codigo_barras) {
        db.produto_codigos_barras.push({
          id: uid("pcb"),
          produto_id: produto.id,
          codigo_barras: produto.codigo_barras,
          principal: true,
        });
      }
    }
    mudou = true;
  } else {
    const existente = new Set(db.produto_codigos_barras.map((codigo) => `${codigo.produto_id}|${codigo.codigo_barras}`));
    for (const produto of db.produtos) {
      if (produto.codigo_barras && !existente.has(`${produto.id}|${produto.codigo_barras}`)) {
        db.produto_codigos_barras.push({
          id: uid("pcb"),
          produto_id: produto.id,
          codigo_barras: produto.codigo_barras,
          principal: true,
        });
        mudou = true;
      }
    }
  }
  if (!Array.isArray(db.contas_pagar)) {
    db.contas_pagar = [];
    mudou = true;
  }
  if (!Array.isArray(db.conta_pagar_historico)) {
    db.conta_pagar_historico = [];
    mudou = true;
  }
  if (!Array.isArray(db.documentos_boleto)) {
    db.documentos_boleto = [];
    mudou = true;
  }
  if (!Array.isArray(db.boleto_pagamentos_historico)) {
    db.boleto_pagamentos_historico = [];
    mudou = true;
  }
  for (const boleto of db.boletos) {
    if (boleto.documento_boleto_id) {
      continue;
    }
    if (!boleto.status_conferencia) {
      boleto.status_conferencia = "aguardando_documento";
      mudou = true;
    }
  }
  const recuperacaoLegado = recuperarVinculosLegadosBoletos(db, {
    responsavelPadrao: "migração legado",
    gerarIdDocumento: () => uid("docbol"),
  });
  if (recuperacaoLegado.alteracoes > 0) {
    mudou = true;
  }
  const boletosPorNota = new Map<string, Array<{ boleto: (typeof db.boletos)[number]; ordemOriginal: number }>>();
  db.boletos.forEach((boleto, indice) => {
    const grupo = boletosPorNota.get(boleto.nota_id) ?? [];
    grupo.push({ boleto, ordemOriginal: indice });
    boletosPorNota.set(boleto.nota_id, grupo);
  });

  for (const grupo of Array.from(boletosPorNota.values())) {
    const numerosExistentes = new Set<number>();
    for (const { boleto } of grupo) {
      const numeroAtual = boleto.numero_parcela?.trim();
      if (!numeroAtual) continue;
      if (/^\d+$/.test(numeroAtual)) {
        numerosExistentes.add(Number(numeroAtual));
      }
    }

    const semNumero: Array<{ boleto: (typeof db.boletos)[number]; ordemOriginal: number }> = grupo
      .filter(({ boleto }) => !boleto.numero_parcela?.trim())
      .sort((a, b) => {
        const porVencimento = (a.boleto.vencimento || "").localeCompare(b.boleto.vencimento || "");
        if (porVencimento !== 0) return porVencimento;
        return a.ordemOriginal - b.ordemOriginal;
      });

    let proximoNumero = 1;
    for (const { boleto } of semNumero) {
      while (numerosExistentes.has(proximoNumero)) {
        proximoNumero += 1;
      }
      boleto.numero_parcela = String(proximoNumero).padStart(3, "0");
      numerosExistentes.add(proximoNumero);
      proximoNumero += 1;
      mudou = true;
    }
  }

  for (const nota of db.notas_fiscais) {
    if (!Array.isArray(nota.correcoes_fornecedor)) {
      nota.correcoes_fornecedor = [];
      mudou = true;
    }
    if (!nota.cnpj_emitente?.trim()) {
      const cnpjDaChave = extrairCnpjEmitenteDaChaveAcesso(nota.chave_acesso);
      if (cnpjDaChave) {
        nota.cnpj_emitente = cnpjDaChave;
        mudou = true;
      }
    }
  }
  for (const produto of db.produtos) {
    if (produto.controla_lote === undefined) {
      produto.controla_lote = false;
      mudou = true;
    }
    if (produto.controla_validade === undefined) {
      produto.controla_validade = false;
      mudou = true;
    }
  }
  if (!db.unidades.some((u) => u.id === UNIDADE_SACO.id)) {
    db.unidades.push({ ...UNIDADE_SACO });
    mudou = true;
  }
  if (!db.locais.some((l) => l.id === LOCAL_ESTOQUE_SECO.id)) {
    db.locais.push({ ...LOCAL_ESTOQUE_SECO });
    mudou = true;
  }
  const jaTemGeladeira2 = db.locais.some(
    (l) => l.id === LOCAL_GELADEIRA_2.id || l.nome.trim().toLocaleLowerCase("pt-BR") === "geladeira 2"
  );
  if (!jaTemGeladeira2) {
    db.locais.push({ ...LOCAL_GELADEIRA_2 });
    mudou = true;
  }
  for (const produto of produtosReais()) {
    if (!db.produtos.some((p) => p.id === produto.id)) {
      db.produtos.push(produto);
      mudou = true;
    }
  }
  const categoriasAssociadas = associarCategoriasProdutos(db);
  if (categoriasAssociadas.categorias.length > 0) {
    mudou = true;
  }
  // Notas de demonstração que ganharam itens importados/origem depois de salvas:
  // completa nas cópias antigas sem tocar no resto dos dados do usuário.
  for (const semente of seedDB.notas_fiscais) {
    if (!semente.itens_importados) continue;
    const existente = db.notas_fiscais.find((n) => n.id === semente.id);
    if (existente && !existente.itens_importados) {
      existente.itens_importados = semente.itens_importados;
      existente.origem = semente.origem;
      mudou = true;
    }
  }
  return mudou;
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const carregado = JSON.parse(raw) as DB;
      if (atualizarComNovidades(carregado)) {
        current = carregado;
        persist();
      } else {
        current = carregado;
      }
      emit();
    }
  } catch {
    current = seedDB;
  }
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getDB(): DB {
  return current;
}

/** Substitui o banco por completo em uma única gravação (persist + notificação). */
export function substituirDB(next: DB): DB {
  current = next;
  persist();
  emit();
  return current;
}

/** Aplica uma mutação ao banco (clona, altera, persiste e notifica). */
export function mutate(fn: (db: DB) => void): DB {
  const next = structuredClone(current);
  fn(next);
  current = next;
  persist();
  emit();
  return current;
}

export function calcularValorFinal(valorOriginal: number, juros = 0, desconto = 0): number {
  return Number((valorOriginal + (juros || 0) - (desconto || 0)).toFixed(2));
}

export function criarContaManual(db: DB, conta: Omit<ContaPagar, "id" | "criado_em" | "atualizado_em" | "valor_final">): ContaPagar {
  const criadoEm = new Date().toISOString();
  const novaConta: ContaPagar = {
    ...conta,
    id: uid("cp"),
    valor_final: calcularValorFinal(conta.valor_original, conta.juros, conta.desconto),
    criado_em: criadoEm,
    atualizado_em: criadoEm,
  };
  db.contas_pagar.push(novaConta);
  db.conta_pagar_historico.push({
    id: uid("cph"),
    conta_pagar_id: novaConta.id,
    acao: "Conta criada manualmente",
    status_anterior: null,
    status_novo: novaConta.status,
    data: criadoEm,
    responsavel: "usuário local",
  });
  return novaConta;
}

export function registrarHistorico(db: DB, contaPagarId: string, acao: string, statusAnterior: StatusContaPagar | null, statusNovo: StatusContaPagar, observacao?: string) {
  db.conta_pagar_historico.push({
    id: uid("cph"),
    conta_pagar_id: contaPagarId,
    acao,
    status_anterior: statusAnterior,
    status_novo: statusNovo,
    data: new Date().toISOString(),
    responsavel: "usuário local",
    observacao,
  });
}

export function alterarStatusConta(db: DB, contaPagarId: string, status: StatusContaPagar, observacao?: string): ContaPagar | undefined {
  const conta = db.contas_pagar.find((c) => c.id === contaPagarId);
  if (!conta) return undefined;
  const statusAnterior = conta.status;
  conta.status = status;
  conta.observacoes = observacao ?? conta.observacoes;
  conta.atualizado_em = new Date().toISOString();
  registrarHistorico(db, conta.id, `Status alterado para ${status}`, statusAnterior, status, observacao);
  return conta;
}

export function informarPagamento(db: DB, contaPagarId: string, observacao?: string): ContaPagar | undefined {
  return alterarStatusConta(db, contaPagarId, "aguardando_conciliacao", observacao ?? "Pagamento informado e aguardando conciliação");
}

/** Volta o banco aos dados de demonstração originais. */
export function resetDB() {
  current = structuredClone(seedDB);
  persist();
  emit();
}

let seq = 0;
export function uid(prefixo: string): string {
  seq += 1;
  return `${prefixo}-${Date.now().toString(36)}-${seq}`;
}

/** Hook reativo: re-renderiza quando o banco muda. */
export function useDB(): DB {
  const db = useSyncExternalStore(
    subscribe,
    () => current,
    () => seedDB
  );
  useEffect(() => {
    ensureLoaded();
  }, []);
  return db;
}

// ---------- Helpers de domínio ----------

/** Estoque atual de um produto (soma dos lotes, alocados ou ainda pendentes), na unidade de uso. */
export function estoqueAtual(db: DB, produtoId: string): number {
  return saldoDosLotes(db, produtoId);
}

/** Produtos com estoque abaixo do mínimo. */
export function produtosAbaixoDoMinimo(db: DB): { produto: Produto; estoque: number }[] {
  return db.produtos
    .filter((p) => p.ativo && p.estoque_minimo > 0)
    .map((produto) => ({ produto, estoque: estoqueAtual(db, produto.id) }))
    .filter(({ produto, estoque }) => estoque < produto.estoque_minimo);
}

/** Caixa que deve ser usada primeiro: menor validade (FEFO), depois preparo/entrada mais antigo (FIFO). */
export function caixaFifo(db: DB, produtoId: string): Caixa | undefined {
  return db.caixas
    .filter((c) => c.produto_id === produtoId && c.status !== "vazia" && (c.quantidade ?? 0) > 0)
    .sort(compararPrioridadeConsumo)[0];
}

/** Caixas com validade nos próximos `dias` dias (inclui vencidas). */
export function caixasVencendo(db: DB, dias: number): Caixa[] {
  const limite = new Date();
  limite.setDate(limite.getDate() + dias);
  const limiteISO = limite.toISOString().slice(0, 10);
  return db.caixas
    .filter((c) => c.status !== "vazia" && c.validade && c.validade <= limiteISO)
    .sort((a, b) => (a.validade ?? "").localeCompare(b.validade ?? ""));
}

/** Consumo médio diário de um produto (baixas dos últimos 30 dias). */
export function consumoMedioDiario(db: DB, produtoId: string): number {
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 30);
  const inicioISO = inicio.toISOString();
  const baixas = db.movimentos_estoque.filter(
    (m) => m.produto_id === produtoId && m.criado_em >= inicioISO && (m.tipo === "baixa" || m.tipo === "perda")
  );
  const total = baixas.reduce((soma, m) => soma + Math.abs(m.quantidade), 0);
  return total / 30;
}

/** Preço médio histórico de um produto (para detectar preço fora do padrão). */
export function precoMedioHistorico(db: DB, produtoId: string): number | undefined {
  const precos = db.precos_historico.filter((p) => p.produto_id === produtoId);
  if (precos.length === 0) return undefined;
  return precos.reduce((s, p) => s + p.preco, 0) / precos.length;
}

/** Um preço está "fora do padrão" se estiver 15%+ acima da média histórica. */
export function precoForaDoPadrao(db: DB, produtoId: string, preco: number): boolean {
  const media = precoMedioHistorico(db, produtoId);
  if (media === undefined) return false;
  return preco > media * 1.15;
}

// ---------- Lookups simples ----------

export function nomeProduto(db: DB, id?: string): string {
  return db.produtos.find((p) => p.id === id)?.nome ?? "—";
}

export function nomeFornecedor(db: DB, id?: string): string {
  return db.fornecedores.find((f) => f.id === id)?.nome ?? "—";
}

export function siglaUnidadeUso(db: DB, produtoId?: string): string {
  const produto = db.produtos.find((p) => p.id === produtoId);
  return db.unidades.find((u) => u.id === produto?.unidade_uso_id)?.sigla ?? "";
}

/** Sigla de um item de lista/cotação/pedido: usa a unidade trocada no item, senão a do produto. */
export function siglaParaItem(db: DB, produtoId?: string, unidadeId?: string): string {
  if (unidadeId) return db.unidades.find((u) => u.id === unidadeId)?.sigla ?? "";
  return siglaUnidadeUso(db, produtoId);
}

export function nomeLocal(db: DB, id?: string): string {
  return db.locais.find((l) => l.id === id)?.nome ?? "sem local";
}

export function nomePerfil(db: DB, id?: string): string {
  return db.perfis.find((p) => p.id === id)?.nome ?? "—";
}
