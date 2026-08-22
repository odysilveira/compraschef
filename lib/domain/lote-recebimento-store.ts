/**
 * Fila de conferência do lote: memória + IndexedDB.
 * Sobrevive a F5 e a sair/voltar do Recebimento enquanto os itens estão abertos.
 */

"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { ItemLoteClassificado } from "./classificar-arquivo-recebimento-browser";
import type { TipoArquivoRecebimento } from "./classificar-arquivo-recebimento";
import {
  contarItensAbertos,
  filtrarItensAbertos,
  type ItemFilaLote,
  type StatusItemFilaLote,
} from "./lote-recebimento-fila";
import {
  arquivoParaRegistroIdb,
  limparLoteIdb,
  listarRegistrosLoteIdb,
  lerArquivoLoteIdb,
  registroIdbParaArquivo,
  registroIdbParaItem,
  removerRegistroLoteIdb,
  salvarRegistrosLoteIdb,
} from "./lote-recebimento-idb";

const arquivosPorId = new Map<string, File>();
let itens: ItemFilaLote[] = [];
const ouvintes = new Set<() => void>();
let hidratado = false;
let hidratando: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
/** Incrementa a cada mutação local (import/limpar) — impede a hidratação de apagar a fila. */
let geracaoLocal = 0;
/** Versão da persistência: só a última agenda grava (evita clear vazio sobrescrever). */
let persistVersao = 0;
let cadeiaPersistencia: Promise<void> = Promise.resolve();
let versaoFila = 0;

function notificar() {
  versaoFila += 1;
  ouvintes.forEach((ouvinte) => ouvinte());
}

function marcarMutacaoLocal() {
  geracaoLocal += 1;
}

function agendarPersistencia() {
  if (typeof indexedDB === "undefined") return;
  persistVersao += 1;
  const versao = persistVersao;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    cadeiaPersistencia = cadeiaPersistencia
      .then(async () => {
        if (versao !== persistVersao) return;
        await persistirFilaAgora();
      })
      .catch(() => undefined);
  }, 80);
}

async function persistirFilaAgora() {
  try {
    const abertos = filtrarItensAbertos(itens);
    const registros = abertos
      .map((item) => {
        const arquivo = arquivosPorId.get(item.id);
        return arquivo ? arquivoParaRegistroIdb(item, arquivo) : null;
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    await salvarRegistrosLoteIdb(registros);
  } catch {
    // IndexedDB pode falhar em modo privado — a fila em memória segue.
  }
}

function atualizarItem(id: string, mudanca: Partial<ItemFilaLote>) {
  const idx = itens.findIndex((i) => i.id === id);
  if (idx < 0) return;
  marcarMutacaoLocal();
  itens = itens.map((item, i) => (i === idx ? { ...item, ...mudanca } : item));
  notificar();
  agendarPersistencia();
}

/** Carrega a fila do IndexedDB (uma vez). Nunca sobrescreve mutação local recente. */
export function hidratarFilaLoteDoIdb(): Promise<void> {
  if (hidratado) return Promise.resolve();
  if (hidratando) return hidratando;

  const geracaoAoIniciar = geracaoLocal;

  hidratando = (async () => {
    try {
      if (itens.length > 0 || geracaoLocal !== geracaoAoIniciar) return;

      const registros = await listarRegistrosLoteIdb();

      // TOCTOU: o usuário pode ter importado enquanto o IDB lia.
      if (itens.length > 0 || geracaoLocal !== geracaoAoIniciar) return;

      const restaurados: ItemFilaLote[] = [];
      for (const registro of registros) {
        if (registro.status !== "pendente" && registro.status !== "em_andamento") continue;
        const arquivo = registroIdbParaArquivo(registro);
        arquivosPorId.set(registro.id, arquivo);
        restaurados.push(registroIdbParaItem(registro));
      }

      if (itens.length > 0 || geracaoLocal !== geracaoAoIniciar) return;

      itens = restaurados;
      notificar();
    } catch {
      // sem IDB — segue vazio
    } finally {
      hidratado = true;
      hidratando = null;
      notificar();
    }
  })();

  return hidratando;
}

export function filaLoteJaHidratada(): boolean {
  return hidratado;
}

/** Substitui a fila pelos arquivos recém-classificados (nova seleção). */
export function definirFilaDeClassificados(classificados: ItemLoteClassificado[]) {
  marcarMutacaoLocal();
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
  agendarPersistencia();
}

/** Acrescenta à fila sem apagar os ainda abertos. */
export function acrescentarClassificados(classificados: ItemLoteClassificado[]) {
  marcarMutacaoLocal();
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
  const abertos = filtrarItensAbertos(itens);
  itens = [...abertos, ...novos];
  notificar();
  agendarPersistencia();
}

export function alterarTipoItemFila(id: string, tipo: TipoArquivoRecebimento) {
  atualizarItem(id, { tipo });
}

export function atualizarClassificacaoItemFila(
  id: string,
  tipo: TipoArquivoRecebimento,
  detalhe?: string
) {
  atualizarItem(id, { tipo, detalhe, status: "pendente" });
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
  marcarMutacaoLocal();
  itens = itens.filter((i) => i.id !== id);
  arquivosPorId.delete(id);
  notificar();
  void removerRegistroLoteIdb(id).catch(() => undefined);
  agendarPersistencia();
}

export function descartarItemFila(id: string) {
  marcarMutacaoLocal();
  itens = itens.filter((i) => i.id !== id);
  arquivosPorId.delete(id);
  notificar();
  void removerRegistroLoteIdb(id).catch(() => undefined);
  agendarPersistencia();
}

export function limparFilaLote() {
  marcarMutacaoLocal();
  arquivosPorId.clear();
  itens = [];
  notificar();
  void limparLoteIdb().catch(() => undefined);
}

export function limparConcluidosEDescartados() {
  marcarMutacaoLocal();
  itens = filtrarItensAbertos(itens);
  notificar();
  agendarPersistencia();
}

export function obterArquivoFila(id: string): File | undefined {
  return arquivosPorId.get(id);
}

/** Busca na memória; se faltar, tenta IndexedDB e recoloca no Map. */
export async function obterArquivoFilaAsync(id: string): Promise<File | undefined> {
  const emMemoria = arquivosPorId.get(id);
  if (emMemoria) return emMemoria;
  try {
    const doIdb = await lerArquivoLoteIdb(id);
    if (doIdb) {
      arquivosPorId.set(id, doIdb);
      return doIdb;
    }
  } catch {
    // ignore
  }
  return undefined;
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

/** Hook: hidrata do IndexedDB e re-renderiza quando a fila muda. */
export function useFilaLoteRecebimento(): ItemFilaLote[] {
  useEffect(() => {
    void hidratarFilaLoteDoIdb();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** True enquanto a 1ª leitura do IndexedDB ainda não terminou. */
export function useFilaLoteHidratando(): boolean {
  useEffect(() => {
    void hidratarFilaLoteDoIdb();
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => !hidratado,
    () => false
  );
}
