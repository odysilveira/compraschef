/**
 * Baixa de produto acabado/insumo por FEFO em caixas (qualquer tipo_box).
 * Não aplica parcial: ou baixa o total pedido ou lança erro.
 */

import type { Caixa, DB } from "../types";
import {
  alocacaoAtivaDaCaixa,
  baixarLoteDaCaixa,
  compararPrioridadeConsumo,
  loteDaCaixa,
} from "./estoque";

export type MotivoBaixaEstoque = "SAIPOS_CONSUMO_MES" | "PRODUCAO_FICHA" | string;

export type LinhaBaixaFefo = {
  caixa_id: string;
  lote_id: string;
  quantidade: number;
  movimento_id: string;
};

export type ResultadoBaixaFefo = {
  produto_id: string;
  quantidade_baixada: number;
  movimento_ids: string[];
  linhas: LinhaBaixaFefo[];
};

function esvaziarCamposCaixa(caixa: Caixa, agora: string): void {
  caixa.status = "vazia";
  caixa.produto_id = undefined;
  caixa.quantidade = undefined;
  caixa.data_envase = undefined;
  caixa.validade = undefined;
  caixa.atualizado_em = agora;
}

/** Caixas com saldo do produto, ordenadas FEFO (validade, depois data_envase). */
export function listarCaixasFefoProduto(db: DB, produtoId: string): Caixa[] {
  return (db.caixas ?? [])
    .filter((c) => {
      if (c.produto_id !== produtoId) return false;
      const q = Number(c.quantidade) || 0;
      if (q <= 0 || c.status === "vazia") return false;
      return Boolean(alocacaoAtivaDaCaixa(db, c.id));
    })
    .sort((a, b) =>
      compararPrioridadeConsumo(
        { validade: a.validade, data_envase: a.data_envase },
        { validade: b.validade, data_envase: b.data_envase }
      )
    );
}

export function saldoEmCaixasProduto(db: DB, produtoId: string): number {
  return listarCaixasFefoProduto(db, produtoId).reduce((s, c) => s + (Number(c.quantidade) || 0), 0);
}

export function baixarProdutoPorFefo(
  db: DB,
  dados: {
    produtoId: string;
    quantidade: number;
    usuarioId: string;
    motivo: MotivoBaixaEstoque;
    agora: string;
    novoMovimentoId: () => string;
  }
): ResultadoBaixaFefo {
  const qtd = Number(dados.quantidade);
  if (!Number.isFinite(qtd) || qtd <= 0) {
    throw new Error("Quantidade de baixa deve ser maior que zero.");
  }

  const produto = (db.produtos ?? []).find((p) => p.id === dados.produtoId);
  const nome = produto?.nome ?? dados.produtoId;
  const disponivel = saldoEmCaixasProduto(db, dados.produtoId);
  if (disponivel + 1e-9 < qtd) {
    const faltam = Math.round((qtd - disponivel) * 1000) / 1000;
    throw new Error(
      `Saldo insuficiente de “${nome}” nas caixas: precisa ${qtd}, tem ${disponivel} (faltam ${faltam}).`
    );
  }

  let restante = qtd;
  const linhas: LinhaBaixaFefo[] = [];
  const caixas = listarCaixasFefoProduto(db, dados.produtoId);

  for (const caixa of caixas) {
    if (restante <= 1e-9) break;
    const naCaixa = Number(caixa.quantidade) || 0;
    if (naCaixa <= 0) continue;
    const pegar = Math.min(restante, naCaixa);
    const lote = loteDaCaixa(db, caixa.id);
    const aplicada = baixarLoteDaCaixa(db, caixa.id, pegar, dados.agora);
    if (aplicada <= 0) continue;

    const nova = naCaixa - aplicada;
    if (nova <= 1e-9) {
      esvaziarCamposCaixa(caixa, dados.agora);
    } else {
      caixa.quantidade = Math.round(nova * 1000) / 1000;
      caixa.status = "em_uso";
      caixa.atualizado_em = dados.agora;
    }

    const movimento_id = dados.novoMovimentoId();
    db.movimentos_estoque.unshift({
      id: movimento_id,
      produto_id: dados.produtoId,
      caixa_id: caixa.id,
      lote_id: lote?.id,
      tipo: "baixa",
      motivo: dados.motivo,
      quantidade: -aplicada,
      validade: lote?.validade ?? caixa.validade,
      usuario_id: dados.usuarioId,
      criado_em: dados.agora,
      sincronizado: false,
    });

    linhas.push({
      caixa_id: caixa.id,
      lote_id: lote?.id ?? "",
      quantidade: aplicada,
      movimento_id,
    });
    restante = Math.round((restante - aplicada) * 1000) / 1000;
  }

  if (restante > 1e-6) {
    throw new Error(
      `Falha ao baixar “${nome}”: sobrou ${restante} sem caixa alocada (inconsistência de estoque).`
    );
  }

  const quantidade_baixada = Math.round((qtd - Math.max(0, restante)) * 1000) / 1000;
  return {
    produto_id: dados.produtoId,
    quantidade_baixada,
    movimento_ids: linhas.map((l) => l.movimento_id),
    linhas,
  };
}
