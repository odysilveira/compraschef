/**
 * Fila da Caixa de entrada: memória + IndexedDB.
 */

"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { ItemLoteClassificado } from "./classificar-arquivo-recebimento-browser";
import {
  mapearTipoRecebimentoParaInbox,
  type TipoDestinoInbox,
} from "./inbox-entrada";
import {
  arquivoParaRegistroInboxIdb,
  limparInboxIdb,
  listarRegistrosInboxIdb,
  registroInboxIdbParaArquivo,
  registroInboxIdbParaItem,
  removerRegistroInboxIdb,
  salvarRegistrosInboxIdb,
  type ItemFilaInbox,
  type StatusItemInbox,
} from "./inbox-entrada-idb";

const arquivosPorId = new Map<string, File>();
let itens: ItemFilaInbox[] = [];
const ouvintes = new Set<() => void>();
let hidratado = false;
let hidratando: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let geracaoLocal = 0;
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

function filtrarAbertos(lista: ItemFilaInbox[]): ItemFilaInbox[] {
  return lista.filter((i) => i.status === "pendente" || i.status === "em_andamento");
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
        await persistirAgora();
      })
      .catch(() => undefined);
  }, 80);
}

export async function flushPersistenciaInbox(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  persistVersao += 1;
  const versao = persistVersao;
  await cadeiaPersistencia.catch(() => undefined);
  if (versao !== persistVersao) return;
  await persistirAgora();
}

async function persistirAgora() {
  try {
    const abertos = filtrarAbertos(itens);
    const registros = abertos
      .map((item) => {
        const arquivo = arquivosPorId.get(item.id);
        return arquivo ? arquivoParaRegistroInboxIdb(item, arquivo) : null;
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    await salvarRegistrosInboxIdb(registros);
  } catch {
    // memória segue
  }
}

function atualizarItem(id: string, mudanca: Partial<ItemFilaInbox>) {
  const idx = itens.findIndex((i) => i.id === id);
  if (idx < 0) return;
  marcarMutacaoLocal();
  itens = itens.map((item, i) => (i === idx ? { ...item, ...mudanca } : item));
  notificar();
  agendarPersistencia();
}

export function hidratarInboxDoIdb(): Promise<void> {
  if (hidratado) return Promise.resolve();
  if (hidratando) return hidratando;

  const geracaoAoIniciar = geracaoLocal;

  hidratando = (async () => {
    try {
      if (itens.length > 0 || geracaoLocal !== geracaoAoIniciar) return;
      const registros = await listarRegistrosInboxIdb();
      if (itens.length > 0 || geracaoLocal !== geracaoAoIniciar) return;

      const restaurados: ItemFilaInbox[] = [];
      for (const registro of registros) {
        if (registro.status !== "pendente" && registro.status !== "em_andamento") continue;
        arquivosPorId.set(registro.id, registroInboxIdbParaArquivo(registro));
        restaurados.push(registroInboxIdbParaItem(registro));
      }
      if (itens.length > 0 || geracaoLocal !== geracaoAoIniciar) return;
      itens = restaurados;
      notificar();
    } catch {
      // sem IDB
    } finally {
      hidratado = true;
      hidratando = null;
      notificar();
    }
  })();

  return hidratando;
}

export function acrescentarClassificadosNaInbox(classificados: ItemLoteClassificado[]) {
  marcarMutacaoLocal();
  const novos: ItemFilaInbox[] = classificados.map((c) => {
    arquivosPorId.set(c.id, c.arquivo);
    const tipo = mapearTipoRecebimentoParaInbox(c.tipoEscolhido, {
      mimeType: c.arquivo.type,
      nomeArquivo: c.arquivo.name,
    });
    return {
      id: c.id,
      nome: c.arquivo.name,
      tamanho: c.arquivo.size,
      tipo,
      status: "pendente" as StatusItemInbox,
      detalhe: c.classificacao.detalhe,
    };
  });
  const abertos = filtrarAbertos(itens);
  itens = [...abertos, ...novos];
  notificar();
  agendarPersistencia();
}

export function definirFilaInboxDeClassificados(classificados: ItemLoteClassificado[]) {
  marcarMutacaoLocal();
  arquivosPorId.clear();
  itens = classificados.map((c) => {
    arquivosPorId.set(c.id, c.arquivo);
    const tipo = mapearTipoRecebimentoParaInbox(c.tipoEscolhido, {
      mimeType: c.arquivo.type,
      nomeArquivo: c.arquivo.name,
    });
    return {
      id: c.id,
      nome: c.arquivo.name,
      tamanho: c.arquivo.size,
      tipo,
      status: "pendente" as StatusItemInbox,
      detalhe: c.classificacao.detalhe,
    };
  });
  notificar();
  agendarPersistencia();
}

export function alterarTipoItemInbox(id: string, tipo: TipoDestinoInbox) {
  atualizarItem(id, { tipo });
}

export function marcarItemInboxEmAndamento(id: string) {
  atualizarItem(id, { status: "em_andamento" });
}

export function removerItemInbox(id: string) {
  marcarMutacaoLocal();
  itens = itens.filter((i) => i.id !== id);
  arquivosPorId.delete(id);
  notificar();
  void removerRegistroInboxIdb(id).catch(() => undefined);
  agendarPersistencia();
}

export function limparFilaInbox() {
  marcarMutacaoLocal();
  itens = [];
  arquivosPorId.clear();
  notificar();
  void limparInboxIdb().catch(() => undefined);
}

export async function obterArquivoInboxAsync(id: string): Promise<File | null> {
  const emMemoria = arquivosPorId.get(id);
  if (emMemoria) return emMemoria;
  await hidratarInboxDoIdb();
  return arquivosPorId.get(id) ?? null;
}

export function listarItensAbertosInbox(): ItemFilaInbox[] {
  return filtrarAbertos(itens);
}

function subscribe(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

function getSnapshot() {
  return versaoFila;
}

export function useFilaInboxEntrada(): ItemFilaInbox[] {
  const versao = useSyncExternalStore(subscribe, getSnapshot, () => 0);
  useEffect(() => {
    void hidratarInboxDoIdb();
  }, []);
  void versao;
  return filtrarAbertos(itens);
}
