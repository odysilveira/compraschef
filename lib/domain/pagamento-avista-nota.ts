/**
 * Pagamento à vista no estabelecimento (PIX, dinheiro ou cartão) a partir da Conferência.
 * Cobre notas sem parcela e notas com parcelas ainda sem boleto conferido.
 */

import type { Boleto, DB, HistoricoPagamentoBoleto, MeioPagamentoNota, NotaFiscal } from "../types";
import { listarNotasComBoletoPendente } from "./conferencia-nfe-boleto";
import { criarParcelaAguardandoDocumento } from "./parcela-nota";

export type MeioPagamentoAvista = Extract<MeioPagamentoNota, "pix" | "dinheiro" | "cartao">;

export const MEIOS_PAGAMENTO_AVISTA: MeioPagamentoAvista[] = ["pix", "dinheiro", "cartao"];

export function rotuloMeioPagamentoAvista(meio: MeioPagamentoAvista): string {
  switch (meio) {
    case "pix":
      return "PIX";
    case "dinheiro":
      return "Dinheiro";
    case "cartao":
      return "Cartão";
  }
}

export interface DadosPagamentoAvistaNota {
  meio: MeioPagamentoAvista;
  dataPagamento: string;
  valorPago: number;
  /** Banco/conta de origem — obrigatório para PIX e cartão. */
  bancoConta?: string;
  /** Identificação do cartão — obrigatório quando meio = cartao. */
  cartao?: string;
  responsavel?: string;
  observacao?: string;
}

export interface ResultadoPagamentoAvistaNota {
  sucesso: boolean;
  boletos: Boleto[];
  historicos: HistoricoPagamentoBoleto[];
  erros: string[];
}

function limparTexto(valor?: string): string {
  return (valor ?? "").trim();
}

function dataIsoValida(valor: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

function parcelasPendentesDaNota(db: DB, notaId: string): Boleto[] {
  const item = listarNotasComBoletoPendente(db).find((n) => n.nota.id === notaId);
  return item?.parcelasPendentes ?? [];
}

function montarObservacao(dados: DadosPagamentoAvistaNota): string {
  const partes = [
    `Pago à vista (${rotuloMeioPagamentoAvista(dados.meio)}) no estabelecimento`,
  ];
  if (dados.meio === "cartao" && limparTexto(dados.cartao)) {
    partes.push(`cartão: ${limparTexto(dados.cartao)}`);
  }
  const extra = limparTexto(dados.observacao);
  if (extra) partes.push(extra);
  return partes.join(" · ");
}

function bancoContaEfetivo(dados: DadosPagamentoAvistaNota): string {
  if (dados.meio === "dinheiro") {
    return limparTexto(dados.bancoConta) || "Dinheiro (caixa)";
  }
  return limparTexto(dados.bancoConta);
}

export function validarDadosPagamentoAvistaNota(
  dados: DadosPagamentoAvistaNota
): string[] {
  const erros: string[] = [];

  if (!MEIOS_PAGAMENTO_AVISTA.includes(dados.meio)) {
    erros.push("Escolha o meio de pagamento: PIX, dinheiro ou cartão.");
  }
  if (!dataIsoValida(dados.dataPagamento)) {
    erros.push("Informe a data do pagamento.");
  }
  if (!Number.isFinite(dados.valorPago) || dados.valorPago <= 0) {
    erros.push("Informe o valor pago.");
  }
  if (dados.meio === "pix" || dados.meio === "cartao") {
    if (!limparTexto(dados.bancoConta)) {
      erros.push(
        dados.meio === "pix"
          ? "Informe o banco/conta de onde saiu o PIX."
          : "Informe o banco/conta do cartão."
      );
    }
  }
  if (dados.meio === "cartao" && !limparTexto(dados.cartao)) {
    erros.push("Informe qual cartão foi usado (bandeira/final).");
  }
  return erros;
}

/**
 * Registra pagamento à vista da nota:
 * - sem parcela → cria título 001 e marca pago/aguardando conciliação;
 * - com parcelas pendentes → aplica o mesmo meio/data/banco em cada pendente.
 */
export function registrarPagamentoAvistaNota(
  db: DB,
  notaId: string,
  dados: DadosPagamentoAvistaNota,
  opcoes: {
    agora?: string;
    gerarIdParcela?: () => string;
    gerarIdHistorico?: () => string;
    responsavelPadrao?: string;
  } = {}
): ResultadoPagamentoAvistaNota {
  const erros = validarDadosPagamentoAvistaNota(dados);
  if (erros.length > 0) return { sucesso: false, boletos: [], historicos: [], erros };

  const nota = db.notas_fiscais.find((n) => n.id === notaId);
  if (!nota) {
    return { sucesso: false, boletos: [], historicos: [], erros: ["Nota fiscal não encontrada."] };
  }

  const agora = opcoes.agora ?? new Date().toISOString();
  const responsavel =
    limparTexto(dados.responsavel) || opcoes.responsavelPadrao || "usuário local";
  const bancoConta = bancoContaEfetivo(dados);
  const observacao = montarObservacao(dados);
  const cartao = dados.meio === "cartao" ? limparTexto(dados.cartao) : undefined;

  /** PIX/cartão entram na fila de conciliação; dinheiro baixa direto. */
  const statusNovo: Boleto["status"] =
    dados.meio === "dinheiro" ? "pago" : "aguardando_conciliacao";

  if (!Array.isArray(db.boleto_pagamentos_historico)) {
    db.boleto_pagamentos_historico = [];
  }

  let alvos = parcelasPendentesDaNota(db, notaId);

  if (alvos.length === 0) {
    const parcela = criarParcelaAguardandoDocumento(db, {
      id: opcoes.gerarIdParcela ? opcoes.gerarIdParcela() : `bol-avista-${Date.now().toString(36)}`,
      nota_id: nota.id,
      valor: Number(dados.valorPago.toFixed(2)),
      vencimento: dados.dataPagamento,
      cnpj_beneficiario: nota.cnpj_emitente,
      numero_parcela: "001",
      meio_pagamento_esperado: dados.meio,
      status: "liberado",
    });
    alvos = [parcela];
  }

  const valorPorParcela =
    alvos.length === 1
      ? Number(dados.valorPago.toFixed(2))
      : undefined;

  const boletos: Boleto[] = [];
  const historicos: HistoricoPagamentoBoleto[] = [];

  for (const boleto of alvos) {
    const statusAnterior = boleto.status;
    const valorPago =
      valorPorParcela ??
      (Number.isFinite(boleto.valor) && boleto.valor > 0
        ? Number(boleto.valor.toFixed(2))
        : Number(dados.valorPago.toFixed(2)));

    boleto.meio_pagamento_esperado = dados.meio;
    boleto.status = statusNovo;
    boleto.status_conferencia = "conferido";
    boleto.status_documento_fiscal = "vinculado";
    boleto.conferido_em = agora;
    boleto.conferido_por = responsavel;
    boleto.pagamento_data = dados.dataPagamento;
    boleto.pagamento_valor = valorPago;
    boleto.pagamento_banco_conta = bancoConta;
    boleto.pagamento_cartao = cartao;
    boleto.pagamento_responsavel = responsavel;
    boleto.pagamento_observacao = observacao;
    boleto.pagamento_informado_em = agora;

    const historico: HistoricoPagamentoBoleto = {
      id: opcoes.gerarIdHistorico
        ? opcoes.gerarIdHistorico()
        : `bph-avista-${Date.now().toString(36)}-${boleto.id}`,
      boleto_id: boleto.id,
      nota_id: nota.id,
      acao: "pagamento_informado",
      status_anterior: statusAnterior,
      status_novo: statusNovo,
      data_pagamento: dados.dataPagamento,
      valor_pago: valorPago,
      banco_conta: cartao ? `${bancoConta} · ${cartao}` : bancoConta,
      responsavel,
      observado_em: agora,
      observacao,
    };
    db.boleto_pagamentos_historico.push(historico);
    boletos.push(boleto);
    historicos.push(historico);
  }

  // Marca a nota com o meio realizado (ajuda filtros / retrabalho).
  nota.meio_pagamento_esperado = dados.meio;

  return { sucesso: true, boletos, historicos, erros: [] };
}

export function notaAindaPendenteNaConferencia(db: DB, notaId: string): boolean {
  return listarNotasComBoletoPendente(db).some((n) => n.nota.id === notaId);
}

export function resumoNotaParaExibicao(
  db: DB,
  nota: NotaFiscal
): {
  fornecedorNome: string;
  numero: string;
  tipo: string;
  valor: number;
  emitidaEm?: string;
  chave?: string;
  arquivoPdfNome?: string;
} {
  const fornecedor =
    db.fornecedores.find((f) => f.id === nota.fornecedor_id)?.nome ||
    nota.razao_social_emitente ||
    "Fornecedor não identificado";
  return {
    fornecedorNome: fornecedor,
    numero: nota.numero,
    tipo: nota.tipo === "nfse" ? "NFS-e" : "NF-e",
    valor: nota.valor_total,
    emitidaEm: nota.emitida_em?.slice(0, 10),
    chave: nota.chave_acesso || nota.chave_nfse,
    arquivoPdfNome: nota.arquivo_pdf_nome,
  };
}
