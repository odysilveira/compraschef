import type { AlocacaoCaixa, DB, LoteEstoque } from "../types";

export interface ReservaFefoDisponivel {
  caixa_id: string;
  qr_code: string;
  numero: number;
  produto_id: string;
  quantidade_disponivel: number;
  lote_id: string;
  validade?: string;
  data_entrada: string;
}

export interface ReposicaoOperacionalResultado {
  movimento_id: string;
  caixa_origem_id: string;
  caixa_destino_id: string;
  lote_id: string;
  produto_id: string;
  validade?: string;
  quantidade_transferida: number;
  saldo_origem_antes: number;
  saldo_origem_depois: number;
  saldo_destino_antes: number;
  saldo_destino_depois: number;
  criado_em: string;
}

export interface ConfirmacaoLeituraReposicao {
  sessao_id: string;
  qr_confirmado: string;
  caixa_id?: string;
  produto_id?: string;
  lote_id?: string;
  quantidade_confirmada: number;
}

export interface ValidacaoPreTransferenciaReposicaoInput {
  sessaoLeituraAtual: string;
  qrOrigemAtual: string;
  qrOrigemConfirmado?: string;
  qrDestinoAtual: string;
  qrDestinoConfirmado?: string;
  origem?: { id: string; produto_id?: string };
  destino?: { id: string; produto_id?: string };
  produtoId?: string;
  loteId?: string;
  quantidade: number;
  confirmacaoOrigem?: ConfirmacaoLeituraReposicao;
  confirmacaoDestino?: ConfirmacaoLeituraReposicao;
}

export interface ValidacaoPreTransferenciaReposicaoResultado {
  valido: boolean;
  motivo?: string;
}

export interface ValidacaoMotivoObrigatorioInput {
  exigeJustificativa: boolean;
  motivo?: string;
}

export interface ValidacaoMotivoObrigatorioResultado {
  valido: boolean;
  motivo?: string;
}

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

function limparConteudoFisicoDaCaixa(db: DB, caixaId: string, agora: string): void {
  const caixa = db.caixas.find((c) => c.id === caixaId);
  if (!caixa) return;
  caixa.status = "vazia";
  caixa.produto_id = undefined;
  caixa.quantidade = undefined;
  caixa.data_envase = undefined;
  caixa.validade = undefined;
  caixa.atualizado_em = agora;
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

export function calcularQuantidadeReposicao(necessidadeDoDia: number, saldoOperacionalUtilizavel: number): number {
  if (!Number.isFinite(necessidadeDoDia) || !Number.isFinite(saldoOperacionalUtilizavel)) return 0;
  return Math.max(0, necessidadeDoDia - saldoOperacionalUtilizavel);
}

function normalizarQr(valor: string | undefined): string {
  return (valor ?? "").trim();
}

export function validarPreTransferenciaReposicaoPorQr(
  input: ValidacaoPreTransferenciaReposicaoInput
): ValidacaoPreTransferenciaReposicaoResultado {
  const qrOrigemAtual = normalizarQr(input.qrOrigemAtual);
  const qrDestinoAtual = normalizarQr(input.qrDestinoAtual);
  const qrOrigemConfirmado = normalizarQr(input.qrOrigemConfirmado ?? input.confirmacaoOrigem?.qr_confirmado);
  const qrDestinoConfirmado = normalizarQr(input.qrDestinoConfirmado ?? input.confirmacaoDestino?.qr_confirmado);

  if (!qrOrigemAtual || !qrDestinoAtual) {
    return { valido: false, motivo: "Identifique os dois QRs para seguir." };
  }
  if (!qrOrigemConfirmado || !qrDestinoConfirmado) {
    return { valido: false, motivo: "Leia o QR de origem e destino nesta sessão para confirmar os boxes físicos." };
  }
  if (qrOrigemAtual !== qrOrigemConfirmado || qrDestinoAtual !== qrDestinoConfirmado) {
    return { valido: false, motivo: "QR alterado após leitura. Faça nova leitura do box alterado." };
  }
  if (qrOrigemAtual === qrDestinoAtual) {
    return { valido: false, motivo: "Origem e destino não podem ser o mesmo QR." };
  }
  if (!Number.isFinite(input.quantidade) || input.quantidade <= 0) {
    return { valido: false, motivo: "Quantidade inválida para transferência." };
  }
  if (!input.origem || !input.destino) {
    return { valido: false, motivo: "Origem e destino precisam existir no cadastro de boxes." };
  }
  if (input.origem.id === input.destino.id) {
    return { valido: false, motivo: "Origem e destino não podem ser o mesmo box." };
  }

  if (input.confirmacaoOrigem) {
    if (input.confirmacaoOrigem.sessao_id !== input.sessaoLeituraAtual) {
      return { valido: false, motivo: "Confirmação da origem pertence a outra sessão de leitura." };
    }
    if (input.confirmacaoOrigem.caixa_id && input.confirmacaoOrigem.caixa_id !== input.origem.id) {
      return { valido: false, motivo: "Box de origem mudou após a leitura. Releia o QR." };
    }
    if (input.confirmacaoOrigem.produto_id && input.confirmacaoOrigem.produto_id !== input.produtoId) {
      return { valido: false, motivo: "Produto/porcionamento mudou após a leitura da origem." };
    }
    if (input.confirmacaoOrigem.lote_id && input.confirmacaoOrigem.lote_id !== input.loteId) {
      return { valido: false, motivo: "Lote da origem mudou após leitura. Releia o QR." };
    }
    if (input.confirmacaoOrigem.quantidade_confirmada !== input.quantidade) {
      return { valido: false, motivo: "Quantidade alterada após leitura da origem. Releia o QR." };
    }
  }

  if (input.confirmacaoDestino) {
    if (input.confirmacaoDestino.sessao_id !== input.sessaoLeituraAtual) {
      return { valido: false, motivo: "Confirmação do destino pertence a outra sessão de leitura." };
    }
    if (input.confirmacaoDestino.caixa_id && input.confirmacaoDestino.caixa_id !== input.destino.id) {
      return { valido: false, motivo: "Box de destino mudou após a leitura. Releia o QR." };
    }
    if (input.confirmacaoDestino.produto_id && input.confirmacaoDestino.produto_id !== input.produtoId) {
      return { valido: false, motivo: "Produto/porcionamento mudou após leitura do destino." };
    }
    if (input.confirmacaoDestino.lote_id && input.confirmacaoDestino.lote_id !== input.loteId) {
      return { valido: false, motivo: "Lote do destino mudou após leitura. Releia o QR." };
    }
    if (input.confirmacaoDestino.quantidade_confirmada !== input.quantidade) {
      return { valido: false, motivo: "Quantidade alterada após leitura do destino. Releia o QR." };
    }
  }

  if (qrOrigemConfirmado === qrDestinoAtual || qrDestinoConfirmado === qrOrigemAtual) {
    return { valido: false, motivo: "QR de origem e destino foram invertidos. Faça nova leitura correta." };
  }

  return { valido: true };
}

export function validarMotivoObrigatorio(
  input: ValidacaoMotivoObrigatorioInput
): ValidacaoMotivoObrigatorioResultado {
  if (!input.exigeJustificativa) {
    return { valido: true };
  }

  if (!(input.motivo ?? "").trim()) {
    return { valido: false, motivo: "Justificativa obrigatória para este evento." };
  }

  return { valido: true };
}

export function reservasFefoDisponiveis(db: DB, produtoId: string): ReservaFefoDisponivel[] {
  return db.caixas
    .filter((caixa) => {
      if (caixa.tipo_box !== "RESERVA") return false;
      if (caixa.produto_id !== produtoId) return false;
      const quantidade = caixa.quantidade ?? 0;
      return caixa.status !== "vazia" && quantidade > 0;
    })
    .flatMap((caixa) => {
      const alocacao = alocacaoAtivaDaCaixa(db, caixa.id);
      const lote = alocacao ? db.lotes_estoque.find((item) => item.id === alocacao.lote_id) : undefined;
      if (!alocacao || !lote || !loteEstaValido(lote)) return [];
      return [{
        caixa_id: caixa.id,
        qr_code: caixa.qr_code,
        numero: caixa.numero,
        produto_id: lote.produto_id,
        quantidade_disponivel: caixa.quantidade ?? 0,
        lote_id: lote.id,
        validade: lote.validade,
        data_entrada: lote.data_entrada,
      } satisfies ReservaFefoDisponivel];
    })
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

function produtoOperacionalEfetivo(caixa: { produto_operacional_alvo_id?: string; produto_id?: string }): string | undefined {
  return caixa.produto_operacional_alvo_id ?? caixa.produto_id;
}

function loteEstaValido(lote: Pick<LoteEstoque, "validade">): boolean {
  return !lote.validade || lote.validade >= new Date().toISOString().slice(0, 10);
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

export function transferirReservaParaOperacional(
  db: DB,
  dados: {
    movimentoId: string;
    alocacaoDestinoId: string;
    origemQrCode: string;
    destinoQrCode: string;
    quantidade: number;
    usuarioId: string;
    agora: string;
    motivo?: "REPOSICAO_OPERACIONAL";
  }
): ReposicaoOperacionalResultado {
  const origem = db.caixas.find((caixa) => caixa.qr_code.toLowerCase() === dados.origemQrCode.trim().toLowerCase());
  const destino = db.caixas.find((caixa) => caixa.qr_code.toLowerCase() === dados.destinoQrCode.trim().toLowerCase());

  if (!origem || !destino) {
    throw new Error("Identifique os dois boxes por QR Code antes de transferir.");
  }
  if (origem.id === destino.id) {
    throw new Error("Origem e destino não podem ser o mesmo box.");
  }
  if (!Number.isFinite(dados.quantidade) || dados.quantidade <= 0) {
    throw new Error("A quantidade transferida deve ser maior que zero.");
  }
  if (origem.tipo_box !== "RESERVA" || destino.tipo_box !== "OPERACIONAL") {
    throw new Error("A reposição normal aceita somente origem Reserva e destino Operacional.");
  }

  const alocacaoOrigem = alocacaoAtivaDaCaixa(db, origem.id);
  const loteOrigem = alocacaoOrigem ? db.lotes_estoque.find((lote) => lote.id === alocacaoOrigem.lote_id) : undefined;
  if (!alocacaoOrigem || !loteOrigem || !origem.produto_id) {
    throw new Error("O box de origem não possui lote disponível para transferência.");
  }

  const alocacaoDestino = alocacaoAtivaDaCaixa(db, destino.id);
  const loteDestino = alocacaoDestino ? db.lotes_estoque.find((lote) => lote.id === alocacaoDestino.lote_id) : undefined;
  const destinoProdutoEfetivo = produtoOperacionalEfetivo(destino);
  if (!destinoProdutoEfetivo) {
    throw new Error("Sem destinação — configure antes da operação.");
  }
  if (!destino.local_id) {
    throw new Error("Local físico não definido — configure o box antes da operação.");
  }
  if (destinoProdutoEfetivo !== origem.produto_id) {
    throw new Error("Produto ou porcionamento incompatível entre origem e destino.");
  }
  if (loteDestino && loteDestino.id !== loteOrigem.id) {
    throw new Error("O box operacional já contém outro lote ativo.");
  }

  const saldoOrigemAntes = origem.quantidade ?? 0;
  const saldoDestinoAntes = destino.quantidade ?? 0;
  if (dados.quantidade > saldoOrigemAntes || dados.quantidade > alocacaoOrigem.quantidade_atual) {
    throw new Error("Quantidade acima do saldo disponível no box de origem.");
  }

  alocacaoOrigem.quantidade_atual -= dados.quantidade;
  alocacaoOrigem.atualizado_em = dados.agora;
  if (alocacaoOrigem.quantidade_atual === 0) {
    alocacaoOrigem.finalizado_em = dados.agora;
  }

  if (alocacaoDestino) {
    alocacaoDestino.quantidade_atual += dados.quantidade;
    alocacaoDestino.atualizado_em = dados.agora;
  } else {
    db.alocacoes_caixa.unshift({
      id: dados.alocacaoDestinoId,
      lote_id: loteOrigem.id,
      caixa_id: destino.id,
      quantidade_inicial: dados.quantidade,
      quantidade_atual: dados.quantidade,
      criado_em: dados.agora,
      atualizado_em: dados.agora,
    });
  }

  const saldoOrigemDepois = Math.max(0, saldoOrigemAntes - dados.quantidade);
  const saldoDestinoDepois = saldoDestinoAntes + dados.quantidade;

  if (saldoOrigemDepois === 0) {
    limparConteudoFisicoDaCaixa(db, origem.id, dados.agora);
  } else {
    origem.quantidade = saldoOrigemDepois;
    origem.status = "em_uso";
    origem.atualizado_em = dados.agora;
  }

  destino.produto_id = loteOrigem.produto_id;
  destino.quantidade = saldoDestinoDepois;
  destino.status = saldoDestinoAntes > 0 ? "em_uso" : "cheia";
  destino.data_envase = loteOrigem.data_entrada;
  destino.validade = loteOrigem.validade;
  destino.atualizado_em = dados.agora;

  db.movimentos_estoque.unshift({
    id: dados.movimentoId,
    produto_id: loteOrigem.produto_id,
    caixa_id: destino.id,
    caixa_origem_id: origem.id,
    caixa_destino_id: destino.id,
    lote_id: loteOrigem.id,
    tipo: "transferencia_boxes",
    motivo: dados.motivo ?? "REPOSICAO_OPERACIONAL",
    quantidade: dados.quantidade,
    validade: loteOrigem.validade,
    saldo_fisico_origem_antes: saldoOrigemAntes,
    saldo_fisico_origem_depois: saldoOrigemDepois,
    saldo_fisico_destino_antes: saldoDestinoAntes,
    saldo_fisico_destino_depois: saldoDestinoDepois,
    usuario_id: dados.usuarioId,
    criado_em: dados.agora,
    sincronizado: false,
  });

  return {
    movimento_id: dados.movimentoId,
    caixa_origem_id: origem.id,
    caixa_destino_id: destino.id,
    lote_id: loteOrigem.id,
    produto_id: loteOrigem.produto_id,
    validade: loteOrigem.validade,
    quantidade_transferida: dados.quantidade,
    saldo_origem_antes: saldoOrigemAntes,
    saldo_origem_depois: saldoOrigemDepois,
    saldo_destino_antes: saldoDestinoAntes,
    saldo_destino_depois: saldoDestinoDepois,
    criado_em: dados.agora,
  };
}
