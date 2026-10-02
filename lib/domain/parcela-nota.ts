/**
 * Criação de parcela (boleto) a partir de nota — DANFE e vínculo manual.
 */

import type { Boleto, DB, MeioPagamentoNota } from "../types";

export interface DadosParcelaNota {
  id: string;
  nota_id: string;
  valor: number;
  vencimento: string;
  cnpj_beneficiario?: string;
  numero_parcela?: string;
  meio_pagamento_esperado?: MeioPagamentoNota;
  status?: Boleto["status"];
}

/** Cria parcela aguardando PDF/linha do boleto (ou já liberada para agenda). */
export function criarParcelaAguardandoDocumento(db: DB, dados: DadosParcelaNota): Boleto {
  const valor = Number(dados.valor);
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new Error("Valor da parcela inválido.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.vencimento)) {
    throw new Error("Vencimento da parcela inválido.");
  }
  if (!db.notas_fiscais.some((n) => n.id === dados.nota_id)) {
    throw new Error("Nota fiscal não encontrada para criar a parcela.");
  }

  const boleto: Boleto = {
    id: dados.id,
    nota_id: dados.nota_id,
    numero_parcela: dados.numero_parcela ?? "001",
    valor: Number(valor.toFixed(2)),
    vencimento: dados.vencimento,
    cnpj_beneficiario: dados.cnpj_beneficiario,
    status: dados.status ?? "liberado",
    meio_pagamento_esperado: dados.meio_pagamento_esperado ?? "boleto",
    status_conferencia: "aguardando_documento",
    status_documento_fiscal: "vinculado",
  };
  db.boletos.push(boleto);
  return boleto;
}

/** Soma dias a uma data ISO local (yyyy-mm-dd). */
export function somarDiasIso(dataIso: string, dias: number): string {
  const base = Date.parse(`${dataIso}T12:00:00`);
  if (!Number.isFinite(base)) return dataIso;
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
