/**
 * Documento fiscal × pagamento: status, cobranças sem nota e vínculo tardio de NFS-e.
 */

import type { Boleto, DB, NotaFiscal, StatusDocumentoFiscalPagamento } from "../types";

const MARCA_GOLPE = "GOLPE CONFIRMADO";

export function golpeConfirmadoPagamento(boleto: Boleto): boolean {
  return boleto.status === "suspeito" && Boolean(boleto.observacao?.startsWith(MARCA_GOLPE));
}

/** Resolve o status efetivo do documento fiscal do pagamento. */
export function statusDocumentoFiscalEfetivo(boleto: Boleto): StatusDocumentoFiscalPagamento {
  if (boleto.status_documento_fiscal) return boleto.status_documento_fiscal;
  if (boleto.nota_id) return "vinculado";
  if (boleto.meio_pagamento_esperado === "pix") return "aguardando_nfse";
  return "nao_aplicavel";
}

export function ehCobrancaSemNota(boleto: Boleto): boolean {
  if (golpeConfirmadoPagamento(boleto)) return false;
  return statusDocumentoFiscalEfetivo(boleto) === "aguardando_nfse" || !boleto.nota_id;
}

export function rotuloStatusDocumentoFiscal(status: StatusDocumentoFiscalPagamento): string {
  switch (status) {
    case "aguardando_nfse":
      return "Aguardando NFS-e";
    case "vinculado":
      return "Nota vinculada";
    case "nao_aplicavel":
      return "Sem nota";
  }
}

export function rotuloMeioPagamento(boleto: Boleto): string {
  if (boleto.meio_pagamento_esperado === "plataforma") return "Plataforma";
  if (boleto.meio_pagamento_esperado === "pix") return "PIX";
  if (boleto.meio_pagamento_esperado === "dinheiro") return "Dinheiro";
  if (boleto.meio_pagamento_esperado === "cartao") {
    return boleto.pagamento_cartao ? `Cartão (${boleto.pagamento_cartao})` : "Cartão";
  }
  return "Boleto";
}

export function fornecedorDoPagamento(db: DB, boleto: Boleto): string {
  if (boleto.fornecedor_id) {
    const direto = db.fornecedores.find((f) => f.id === boleto.fornecedor_id);
    if (direto) return direto.nome;
  }
  if (boleto.nota_id) {
    const nota = db.notas_fiscais.find((n) => n.id === boleto.nota_id);
    if (nota?.fornecedor_id) {
      return db.fornecedores.find((f) => f.id === nota.fornecedor_id)?.nome ?? "Fornecedor não identificado";
    }
    if (nota?.razao_social_emitente) return nota.razao_social_emitente;
  }
  return "Fornecedor não identificado";
}

export function notaDoPagamento(db: DB, boleto: Boleto): NotaFiscal | undefined {
  if (!boleto.nota_id) return undefined;
  return db.notas_fiscais.find((n) => n.id === boleto.nota_id);
}

/** Cobranças PIX/serviço ainda sem NFS-e (podem já estar pagas). */
export function listarCobrancasSemNota(db: DB): Boleto[] {
  return db.boletos
    .filter((b) => ehCobrancaSemNota(b) && statusDocumentoFiscalEfetivo(b) === "aguardando_nfse")
    .sort((a, b) => {
      const va = a.vencimento || "";
      const vb = b.vencimento || "";
      if (va !== vb) return va.localeCompare(vb);
      return a.valor - b.valor;
    });
}

export interface CandidatoVinculoNfse {
  boleto: Boleto;
  nota: NotaFiscal;
  pontuacao: number;
  motivos: string[];
}

function normalizarCnpj(valor?: string): string {
  return (valor ?? "").replace(/\D+/g, "");
}

function diasEntre(a: string, b: string): number {
  const da = Date.parse(`${a}T12:00:00`);
  const db = Date.parse(`${b}T12:00:00`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 999;
  return Math.abs(Math.round((da - db) / 86_400_000));
}

/**
 * Sugere pagamentos sem nota para vincular a uma NFS-e recém-chegada.
 * Critérios: CNPJ, valor (±tolerância) e proximidade de data.
 */
export function sugerirVinculosNfseParaPagamentos(
  db: DB,
  nota: NotaFiscal,
  opcoes: { toleranciaValor?: number; janelaDias?: number } = {}
): CandidatoVinculoNfse[] {
  if (nota.tipo && nota.tipo !== "nfse") return [];

  const tolerancia = opcoes.toleranciaValor ?? 0.05; // 5%
  const janela = opcoes.janelaDias ?? 45;
  const cnpjNota = normalizarCnpj(nota.cnpj_emitente);
  const candidatos: CandidatoVinculoNfse[] = [];

  for (const boleto of listarCobrancasSemNota(db)) {
    const motivos: string[] = [];
    let pontuacao = 0;

    const cnpjBol = normalizarCnpj(boleto.cnpj_beneficiario);
    if (cnpjNota && cnpjBol && cnpjNota === cnpjBol) {
      pontuacao += 40;
      motivos.push("mesmo CNPJ");
    }

    if (boleto.fornecedor_id && boleto.fornecedor_id === nota.fornecedor_id) {
      pontuacao += 25;
      motivos.push("mesmo fornecedor");
    }

    const valorNota = Number(nota.valor_total);
    const valorBol = Number(boleto.valor);
    if (Number.isFinite(valorNota) && Number.isFinite(valorBol) && valorNota > 0) {
      const delta = Math.abs(valorNota - valorBol) / valorNota;
      if (delta <= tolerancia) {
        pontuacao += delta < 0.001 ? 30 : 20;
        motivos.push(delta < 0.001 ? "valor igual" : "valor próximo");
      } else {
        continue;
      }
    }

    const refData = boleto.pagamento_data || boleto.vencimento;
    const dataNota = (nota.emitida_em || "").slice(0, 10);
    if (refData && dataNota) {
      const dias = diasEntre(refData, dataNota);
      if (dias <= janela) {
        pontuacao += dias <= 7 ? 15 : 8;
        motivos.push(`datas a ${dias} dia(s)`);
      }
    }

    if (pontuacao < 30 || motivos.length === 0) continue;
    candidatos.push({ boleto, nota, pontuacao, motivos });
  }

  return candidatos.sort((a, b) => b.pontuacao - a.pontuacao);
}

export interface ResultadoVincularNotaAoPagamento {
  sucesso: boolean;
  boleto?: Boleto;
  erros: string[];
}

/** Liga NFS-e/NF-e a um pagamento que estava sem nota. */
export function vincularNotaAoPagamento(
  db: DB,
  boletoId: string,
  notaId: string
): ResultadoVincularNotaAoPagamento {
  const boleto = db.boletos.find((b) => b.id === boletoId);
  if (!boleto) return { sucesso: false, erros: ["Pagamento não encontrado."] };

  const nota = db.notas_fiscais.find((n) => n.id === notaId);
  if (!nota) return { sucesso: false, erros: ["Nota fiscal não encontrada."] };

  if (boleto.nota_id && boleto.nota_id !== notaId) {
    return { sucesso: false, erros: ["Este pagamento já está vinculado a outra nota."] };
  }

  boleto.nota_id = notaId;
  boleto.status_documento_fiscal = "vinculado";
  if (!boleto.fornecedor_id && nota.fornecedor_id) {
    boleto.fornecedor_id = nota.fornecedor_id;
  }
  if (!boleto.cnpj_beneficiario && nota.cnpj_emitente) {
    boleto.cnpj_beneficiario = nota.cnpj_emitente;
  }

  return { sucesso: true, boleto, erros: [] };
}

/** Cria cobrança PIX sem NFS-e ainda (entra na agenda pelo vencimento). */
export function criarCobrancaPixSemNota(
  db: DB,
  dados: {
    id: string;
    valor: number;
    vencimento: string;
    codigoPix: string;
    fornecedor_id?: string;
    cnpj_beneficiario?: string;
    observacao?: string;
  }
): Boleto {
  const boleto: Boleto = {
    id: dados.id,
    valor: dados.valor,
    vencimento: dados.vencimento,
    linha_digitavel: dados.codigoPix.trim(),
    status: "liberado",
    meio_pagamento_esperado: "pix",
    status_conferencia: "conferido",
    status_documento_fiscal: "aguardando_nfse",
    fornecedor_id: dados.fornecedor_id,
    cnpj_beneficiario: dados.cnpj_beneficiario,
    observacao: dados.observacao,
    conferido_em: new Date().toISOString(),
    conferido_por: "local",
  };
  db.boletos.push(boleto);
  return boleto;
}

export interface ResultadoMarcarJaPago {
  sucesso: boolean;
  boleto?: Boleto;
  erros: string[];
}

/**
 * Marca parcela/PIX como já pago (fora do app ou pago antes da conferência).
 * Vai direto para `pago` — não exige importar documento.
 */
export function marcarBoletoComoJaPago(
  db: DB,
  boletoId: string,
  opcoes: {
    dataPagamento?: string;
    responsavel?: string;
    observacao?: string;
    agora?: string;
  } = {}
): ResultadoMarcarJaPago {
  const boleto = db.boletos.find((b) => b.id === boletoId);
  if (!boleto) return { sucesso: false, erros: ["Pagamento não encontrado."] };

  if (golpeConfirmadoPagamento(boleto)) {
    return { sucesso: false, erros: ["Pagamento marcado como golpe — não pode ser pago."] };
  }

  if (boleto.status === "pago") {
    return { sucesso: false, erros: ["Este pagamento já está marcado como pago."] };
  }

  const agora = opcoes.agora ?? new Date().toISOString();
  const dataPagamento =
    opcoes.dataPagamento && /^\d{4}-\d{2}-\d{2}$/.test(opcoes.dataPagamento)
      ? opcoes.dataPagamento
      : agora.slice(0, 10);

  boleto.status = "pago";
  boleto.pagamento_data = dataPagamento;
  boleto.pagamento_valor = boleto.valor;
  boleto.pagamento_banco_conta = boleto.pagamento_banco_conta || "Pago fora do ComprasChef";
  boleto.pagamento_responsavel = opcoes.responsavel?.trim() || "local";
  boleto.pagamento_observacao =
    opcoes.observacao?.trim() || "Marcado como já pago na conferência";
  boleto.pagamento_informado_em = agora;
  if (boleto.status_conferencia !== "conferido") {
    boleto.status_conferencia = "conferido";
    boleto.conferido_em = agora;
    boleto.conferido_por = boleto.pagamento_responsavel;
  }

  return { sucesso: true, boleto, erros: [] };
}
