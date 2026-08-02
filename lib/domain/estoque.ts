import type { AlocacaoCaixa, DB, LoteEstoque } from "../types";

export function compararPrioridadeConsumo(
  a: { validade?: string; data_envase?: string },
  b: { validade?: string; data_envase?: string }
): number {
  const validadeA = a.validade ?? "9999-12-31";
  const validadeB = b.validade ?? "9999-12-31";
  return validadeA.localeCompare(validadeB) || (a.data_envase ?? "").localeCompare(b.data_envase ?? "");
}

export function alocacaoAtivaDaCaixa(db: DB, caixaId: string): AlocacaoCaixa | undefined {
  return db.alocacoes_caixa.find((a) => a.caixa_id === caixaId && a.quantidade_atual > 0);
}

export function loteDaCaixa(db: DB, caixaId: string): LoteEstoque | undefined {
  const alocacao = alocacaoAtivaDaCaixa(db, caixaId);
  return alocacao ? db.lotes_estoque.find((l) => l.id === alocacao.lote_id) : undefined;
}

export function quantidadePendenteLote(db: DB, loteId: string): number {
  const lote = db.lotes_estoque.find((l) => l.id === loteId);
  if (!lote) return 0;
  const alocada = db.alocacoes_caixa
    .filter((a) => a.lote_id === loteId)
    .reduce((soma, a) => soma + a.quantidade_atual, 0);
  return Math.max(0, lote.quantidade_atual - alocada);
}

export function lotesPendentesDeAlocacao(db: DB): LoteEstoque[] {
  return db.lotes_estoque
    .filter((l) => quantidadePendenteLote(db, l.id) > 0)
    .sort((a, b) => {
      const validadeA = a.validade ?? "9999-12-31";
      const validadeB = b.validade ?? "9999-12-31";
      return validadeA.localeCompare(validadeB) || a.data_entrada.localeCompare(b.data_entrada);
    });
}

export function saldoDosLotes(db: DB, produtoId: string): number {
  return db.lotes_estoque
    .filter((lote) => lote.produto_id === produtoId)
    .reduce((soma, lote) => soma + lote.quantidade_atual, 0);
}

export function criarLote(
  db: DB,
  lote: Omit<LoteEstoque, "quantidade_inicial" | "quantidade_atual"> & { quantidade: number }
): LoteEstoque {
  if (!Number.isFinite(lote.quantidade) || lote.quantidade <= 0) {
    throw new Error("A quantidade do lote deve ser maior que zero.");
  }
  if (lote.recebimento_item_id && db.lotes_estoque.some((l) => l.recebimento_item_id === lote.recebimento_item_id)) {
    throw new Error("O item de recebimento já possui lote.");
  }
  if (db.lotes_estoque.some((existente) => existente.id === lote.id)) {
    throw new Error("Este lote já foi registrado.");
  }
  const { quantidade, ...dados } = lote;
  const novo: LoteEstoque = { ...dados, quantidade_inicial: quantidade, quantidade_atual: quantidade };
  db.lotes_estoque.unshift(novo);
  return novo;
}

/** Distribui parte de um lote em uma caixa vazia sem gerar nova entrada de estoque. */
export function alocarLoteEmCaixa(
  db: DB,
  dados: {
    id: string;
    loteId: string;
    caixaId: string;
    quantidade: number;
    localId?: string;
    agora: string;
  }
): AlocacaoCaixa {
  const lote = db.lotes_estoque.find((l) => l.id === dados.loteId);
  const caixa = db.caixas.find((c) => c.id === dados.caixaId);
  if (!lote || lote.quantidade_atual <= 0) throw new Error("Lote indisponível.");
  if (!caixa || caixa.status !== "vazia" || alocacaoAtivaDaCaixa(db, dados.caixaId)) {
    throw new Error("A caixa escolhida não está vazia.");
  }
  const pendente = quantidadePendenteLote(db, lote.id);
  if (!Number.isFinite(dados.quantidade) || dados.quantidade <= 0 || dados.quantidade > pendente) {
    throw new Error("Quantidade maior que o saldo do lote aguardando caixa.");
  }

  const alocacao: AlocacaoCaixa = {
    id: dados.id,
    lote_id: lote.id,
    caixa_id: caixa.id,
    quantidade_inicial: dados.quantidade,
    quantidade_atual: dados.quantidade,
    criado_em: dados.agora,
    atualizado_em: dados.agora,
  };
  db.alocacoes_caixa.unshift(alocacao);
  caixa.status = "cheia";
  caixa.produto_id = lote.produto_id;
  caixa.quantidade = dados.quantidade;
  caixa.data_envase = lote.data_entrada;
  caixa.validade = lote.validade;
  caixa.local_id = dados.localId;
  caixa.atualizado_em = dados.agora;
  lote.atualizado_em = dados.agora;
  return alocacao;
}

export function baixarLoteDaCaixa(db: DB, caixaId: string, quantidade: number, agora: string): number {
  const alocacao = alocacaoAtivaDaCaixa(db, caixaId);
  const lote = alocacao ? db.lotes_estoque.find((l) => l.id === alocacao.lote_id) : undefined;
  if (!lote || !alocacao || quantidade <= 0) return 0;
  const aplicada = Math.min(quantidade, alocacao.quantidade_atual, lote.quantidade_atual);
  alocacao.quantidade_atual -= aplicada;
  alocacao.atualizado_em = agora;
  lote.quantidade_atual -= aplicada;
  lote.atualizado_em = agora;
  if (alocacao.quantidade_atual === 0) alocacao.finalizado_em = agora;
  return aplicada;
}

export function ajustarLoteDaCaixa(db: DB, caixaId: string, quantidade: number, agora: string): void {
  // Usa a alocação mais recente mesmo se a contagem anterior foi zero, permitindo
  // corrigir uma leitura feita durante o mesmo balanço.
  const alocacao = db.alocacoes_caixa.find((a) => a.caixa_id === caixaId);
  const lote = alocacao ? db.lotes_estoque.find((l) => l.id === alocacao.lote_id) : undefined;
  if (!lote || !alocacao) return;
  const encontrada = Math.max(0, quantidade);
  const delta = encontrada - alocacao.quantidade_atual;
  alocacao.quantidade_atual = encontrada;
  alocacao.atualizado_em = agora;
  alocacao.finalizado_em = encontrada === 0 ? agora : undefined;
  lote.quantidade_atual = Math.max(0, lote.quantidade_atual + delta);
  lote.atualizado_em = agora;
}
