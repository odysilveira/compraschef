/**
 * Fila de conciliação do lote em memória de sessão (sobrevive a trocas de modo
 * no Recebimento). Arquivos File ficam no Map; metadados na lista.
 * Refresh da página perde os Files — aí é preciso selecionar o lote de novo.
 */

"use client";

import { useSyncExternalStore } from "react";
import type { ItemLoteClassificado } from "./classificar-arquivo-recebimento-browser";
import type { TipoArquivoRecebimento } from "./classificar-arquivo-recebimento";
import {
  contarItensAbertos,
  filtrarItensAbertos,
  type ItemFilaLote,
  type StatusItemFilaLote,
} from "./lote-recebimento-fila";

const arquivosPorId = new Map<string, File>();
let itens: ItemFilaLote[] = [];
const ouvintes = new Set<() => void>();

function notificar() {
  ouvintes.forEach((ouvinte) => ouvinte());
}

function atualizarItem(id: string, mudanca: Partial<ItemFilaLote>) {
  const idx = itens.findIndex((i) => i.id === id);
  if (idx < 0) return;
  itens = itens.map((item, i) => (i === idx ? { ...item, ...mudanca } : item));
  notificar();
}

/** Substitui a fila pelos arquivos recém-classificados (nova seleção). */
export function definirFilaDeClassificados(classificados: ItemLoteClassificado[]) {
  arquivosPorId.clear();
  itens = classificados.map((c) => {
    arquivosPorId.set(c.id, c.arquivo);
    return {
      id: c.id,
      nome: c.arquivo.name,
      tamanho: c.arquivo.size,
      tipo: c.tipoEscolhido,
      status: "pendente" as StatusItemFilaLote,
      detalhe: c.classificacao.detalhe,
    };
  });
  notificar();
}

/** Acrescenta à fila sem apagar os ainda abertos. */
export function acrescentarClassificados(classificados: ItemLoteClassificado[]) {
  const novos: ItemFilaLote[] = classificados.map((c) => {
    arquivosPorId.set(c.id, c.arquivo);
    return {
      id: c.id,
      nome: c.arquivo.name,
      tamanho: c.arquivo.size,
      tipo: c.tipoEscolhido,
      status: "pendente" as StatusItemFilaLote,
      detalhe: c.classificacao.detalhe,
    };
  });
  // remove concluídos/descartados antigos da lista visual, mantém abertos
  const abertos = filtrarItensAbertos(itens);
  itens = [...abertos, ...novos];
  notificar();
}

export function alterarTipoItemFila(id: string, tipo: TipoArquivoRecebimento) {
  atualizarItem(id, { tipo });
}

export function marcarItemEmAndamento(id: string) {
  atualizarItem(id, { status: "em_andamento" });
}

export function marcarItemPendente(id: string) {
  const atual = itens.find((i) => i.id === id);
  if (!atual || atual.status === "concluido" || atual.status === "descartado") return;
  atualizarItem(id, { status: "pendente" });
}

export function marcarItemConcluido(id: string) {
  atualizarItem(id, { status: "concluido" });
  arquivosPorId.delete(id);
}

export function descartarItemFila(id: string) {
  atualizarItem(id, { status: "descartado" });
  arquivosPorId.delete(id);
}

export function limparFilaLote() {
  arquivosPorId.clear();
  itens = [];
  notificar();
}

export function limparConcluidosEDescartados() {
  itens = filtrarItensAbertos(itens);
  notificar();
}

export function obterArquivoFila(id: string): File | undefined {
  return arquivosPorId.get(id);
}

export function obterItemFila(id: string): ItemFilaLote | undefined {
  return itens.find((i) => i.id === id);
}

export function listarFilaLote(): ItemFilaLote[] {
  return itens;
}

export function listarFilaAberta(): ItemFilaLote[] {
  return filtrarItensAbertos(itens);
}

export function quantidadeFilaAberta(): number {
  return contarItensAbertos(itens);
}

function subscribe(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

function getSnapshot(): ItemFilaLote[] {
  return itens;
}

function getServerSnapshot(): ItemFilaLote[] {
  return [];
}

/** Hook: re-renderiza quando a fila muda. */
export function useFilaLoteRecebimento(): ItemFilaLote[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
