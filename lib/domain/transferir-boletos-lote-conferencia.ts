/**
 * Move PDFs de boleto da fila do lote (A conciliar) e da Caixa (A conferir)
 * para documentos na Conferência (“Boletos sem NF”), sem casar ainda.
 */

import type { DB, DocumentoBoleto } from "../types";
import { calcularHashSHA256 } from "./documentos-boleto";
import { salvarArquivoDocumentoBoletoIdb } from "./documentos-boleto-arquivo-idb";
import { identificarCodigoBoletoNoArquivoLocal } from "./identificacao-boleto-browser";
import { listarBoletosLoteAguardandoVinculo } from "./conferencia-nfe-boleto";
import { faseFilaInbox, type ItemFilaInbox } from "./inbox-entrada-idb";
import type { ItemFilaLote } from "./lote-recebimento-fila";
import {
  receberBoletoPendenteNaConferencia,
  type BoletoJaPagoDetectado,
} from "./pareamento-nfe-boleto";

export interface ResultadoTransferenciaBoletoLote {
  id: string;
  nome: string;
  ok: boolean;
  documento?: DocumentoBoleto;
  jaPago?: BoletoJaPagoDetectado;
  erros: string[];
}

export interface ResultadoTransferenciaBoletosLote {
  transferidos: number;
  jaPagos: number;
  falhas: number;
  resultados: ResultadoTransferenciaBoletoLote[];
}

export async function transferirUmBoletoLoteParaConferencia(
  db: DB,
  entrada: { id: string; arquivo: File },
  opcoes: { gerarId?: () => string } = {}
): Promise<ResultadoTransferenciaBoletoLote> {
  const { id, arquivo } = entrada;
  try {
    const conteudo = await arquivo.arrayBuffer();
    let linha: string | undefined;
    try {
      const identificado = await identificarCodigoBoletoNoArquivoLocal(arquivo, () => false);
      linha = identificado.validos[0]?.valorNormalizado;
    } catch {
      // entra mesmo sem linha
    }

    let hash: string | undefined;
    try {
      hash = await calcularHashSHA256(conteudo);
    } catch {
      // ignore
    }

    const resultado = await receberBoletoPendenteNaConferencia(
      db,
      {
        arquivo: {
          nomeArquivo: arquivo.name,
          tipoArquivo: arquivo.type,
          tamanhoBytes: arquivo.size,
          conteudo,
        },
        linhaInformada: linha,
      },
      { gerarId: opcoes.gerarId }
    );

    if (resultado.jaPago) {
      return {
        id,
        nome: arquivo.name,
        ok: true,
        jaPago: resultado.jaPago,
        documento: resultado.documento,
        erros: [],
      };
    }

    if (!resultado.sucesso || !resultado.documento) {
      return {
        id,
        nome: arquivo.name,
        ok: false,
        erros: resultado.erros.length ? resultado.erros : ["Falha ao registrar boleto na conferência."],
      };
    }

    try {
      await salvarArquivoDocumentoBoletoIdb(resultado.documento.id, arquivo);
    } catch {
      // Ver PDF pode falhar até reimportar
    }

    if (hash && !resultado.documento.hash_sha256) {
      resultado.documento.hash_sha256 = hash;
    }

    return {
      id,
      nome: arquivo.name,
      ok: true,
      documento: resultado.documento,
      erros: [],
    };
  } catch (e) {
    return {
      id,
      nome: entrada.arquivo.name,
      ok: false,
      erros: [e instanceof Error ? e.message : "Falha ao transferir boleto."],
    };
  }
}

function idsPendentesUnicos(
  itensLote: ItemFilaLote[],
  itensInbox: ItemFilaInbox[],
  opcoes: { incluirInbox?: boolean } = {}
): Array<{ id: string; nome: string; origem: "lote" | "inbox" }> {
  const mapa = new Map<string, { id: string; nome: string; origem: "lote" | "inbox" }>();

  for (const item of listarBoletosLoteAguardandoVinculo(itensLote)) {
    mapa.set(item.id, { id: item.id, nome: item.nome, origem: "lote" });
  }

  if (opcoes.incluirInbox !== false) {
    for (const item of itensInbox) {
      if (item.tipo !== "pdf_boleto") continue;
      if (faseFilaInbox(item.status) !== "a_conferir" && item.status !== "pendente") continue;
      if (!mapa.has(item.id)) {
        mapa.set(item.id, { id: item.id, nome: item.nome, origem: "inbox" });
      }
    }
  }

  return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Transfere boletos abertos do lote (e opcionalmente da Caixa) para “Boletos sem NF”.
 * Mutação in-place em `db`. Quem chama conclui os ids ok no lote/inbox.
 */
export async function transferirBoletosLoteParaConferencia(
  db: DB,
  itensLote: ItemFilaLote[],
  obterArquivo: (id: string) => Promise<File | undefined | null>,
  opcoes: {
    gerarId?: () => string;
    itensInbox?: ItemFilaInbox[];
    /** default true; use false no auto-envio para não esvaziar a Caixa. */
    incluirInbox?: boolean;
  } = {}
): Promise<ResultadoTransferenciaBoletosLote> {
  const pendentes = idsPendentesUnicos(itensLote, opcoes.itensInbox ?? [], {
    incluirInbox: opcoes.incluirInbox,
  });
  const resultados: ResultadoTransferenciaBoletoLote[] = [];

  for (const item of pendentes) {
    const arquivo = await obterArquivo(item.id);
    if (!arquivo) {
      resultados.push({
        id: item.id,
        nome: item.nome,
        ok: false,
        erros: ["Arquivo do boleto não encontrado neste navegador."],
      });
      continue;
    }
    resultados.push(
      await transferirUmBoletoLoteParaConferencia(db, { id: item.id, arquivo }, opcoes)
    );
  }

  return {
    transferidos: resultados.filter((r) => r.ok && !r.jaPago).length,
    jaPagos: resultados.filter((r) => r.ok && r.jaPago).length,
    falhas: resultados.filter((r) => !r.ok).length,
    resultados,
  };
}
