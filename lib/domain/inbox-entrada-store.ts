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
  itemInboxAberto,
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
/** Snapshot estável dos abertos — mesma referência até a fila mudar (evita loop no React). */
let snapshotAbertos: ItemFilaInbox[] = [];
const SNAPSHOT_VAZIO: ItemFilaInbox[] = [];
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
  snapshotAbertos = filtrarAbertos(itens);
  ouvintes.forEach((ouvinte) => ouvinte());
}

function marcarMutacaoLocal() {
  geracaoLocal += 1;
}

function filtrarAbertos(lista: ItemFilaInbox[]): ItemFilaInbox[] {
  return lista.filter((i) => itemInboxAberto(i.status));
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
        if (!itemInboxAberto(registro.status)) continue;
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

function fingerprintsDeClassificado(c: ItemLoteClassificado): Pick<
  ItemFilaInbox,
  "chaveNfe" | "chaveNfse" | "codigoBoleto"
> {
  return {
    chaveNfe: c.classificacao.resumo?.chaveNfe,
    chaveNfse: c.classificacao.resumo?.chaveNfse,
    codigoBoleto: c.classificacao.resumo?.numeroBoleto,
  };
}

export function acrescentarClassificadosNaInbox(classificados: ItemLoteClassificado[]) {
  marcarMutacaoLocal();
  const agora = Date.now();
  const novos: ItemFilaInbox[] = classificados.map((c, i) => {
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
      adicionadoEm: agora + i,
      ...fingerprintsDeClassificado(c),
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
  const agora = Date.now();
  itens = classificados.map((c, i) => {
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
      adicionadoEm: agora + i,
      ...fingerprintsDeClassificado(c),
    };
  });
  notificar();
  agendarPersistencia();
}

export function alterarTipoItemInbox(id: string, tipo: TipoDestinoInbox) {
  atualizarItem(id, { tipo });
}

export function atualizarFingerprintsItemInbox(
  id: string,
  fingerprints: Partial<
    Pick<ItemFilaInbox, "chaveNfe" | "chaveNfse" | "codigoBoleto" | "hashSha256">
  >
) {
  atualizarItem(id, fingerprints);
}

export function marcarItemInboxEmAndamento(id: string) {
  atualizarItem(id, { status: "a_conferir" });
}

/** Compra confirmada: fica na caixa em “A conferir” até o fluxo concluir. */
export function marcarItemInboxAConferir(id: string) {
  atualizarItem(id, { status: "a_conferir" });
}

/** Ciclo fechado no Recebimento/Conferência — some da fila aberta. */
export function marcarItemInboxConcluido(id: string) {
  const atual = itens.find((i) => i.id === id);
  if (!atual) return;
  marcarMutacaoLocal();
  itens = itens.filter((i) => i.id !== id);
  arquivosPorId.delete(id);
  notificar();
  void removerRegistroInboxIdb(id).catch(() => undefined);
  agendarPersistencia();
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

function getSnapshot(): ItemFilaInbox[] {
  return snapshotAbertos;
}

function getServerSnapshot(): ItemFilaInbox[] {
  return SNAPSHOT_VAZIO;
}

export function useFilaInboxEntrada(): ItemFilaInbox[] {
  useEffect(() => {
    void hidratarInboxDoIdb();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
