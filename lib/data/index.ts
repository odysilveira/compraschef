"use client";

// Camada de dados mock: banco em memória + persistência em localStorage.
// Quando o Supabase for configurado, estas funções serão trocadas por consultas reais
// mantendo as mesmas assinaturas.

import { useEffect, useSyncExternalStore } from "react";
import type { Caixa, DB, Produto } from "@/lib/types";
import { seedDB } from "./seed";

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

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      current = JSON.parse(raw) as DB;
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

/** Aplica uma mutação ao banco (clona, altera, persiste e notifica). */
export function mutate(fn: (db: DB) => void): DB {
  const next = structuredClone(current);
  fn(next);
  current = next;
  persist();
  emit();
  return current;
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

/** Estoque atual de um produto (soma das caixas cheias/em uso), na unidade de uso. */
export function estoqueAtual(db: DB, produtoId: string): number {
  return db.caixas
    .filter((c) => c.produto_id === produtoId && c.status !== "vazia")
    .reduce((soma, c) => soma + (c.quantidade ?? 0), 0);
}

/** Produtos com estoque abaixo do mínimo. */
export function produtosAbaixoDoMinimo(db: DB): { produto: Produto; estoque: number }[] {
  return db.produtos
    .filter((p) => p.ativo && p.estoque_minimo > 0)
    .map((produto) => ({ produto, estoque: estoqueAtual(db, produto.id) }))
    .filter(({ produto, estoque }) => estoque < produto.estoque_minimo);
}

/** Caixa que deve ser usada primeiro (FIFO — envase mais antigo) para um produto. */
export function caixaFifo(db: DB, produtoId: string): Caixa | undefined {
  return db.caixas
    .filter((c) => c.produto_id === produtoId && c.status !== "vazia" && (c.quantidade ?? 0) > 0)
    .sort((a, b) => (a.data_envase ?? "").localeCompare(b.data_envase ?? ""))[0];
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

export function nomeLocal(db: DB, id?: string): string {
  return db.locais.find((l) => l.id === id)?.nome ?? "sem local";
}

export function nomePerfil(db: DB, id?: string): string {
  return db.perfis.find((p) => p.id === id)?.nome ?? "—";
}
