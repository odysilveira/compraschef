/**
 * Convenção de códigos de caixa por zona (sem CXCHEF).
 * Formatos: F1-R01 | F1-O01 | G1-01 | ES-01
 */

import type { Local, TipoBox } from "../types";

export type ZonaCaixaCodigo = "F" | "G" | "ES";
export type PapelCaixaCodigo = "R" | "O";

export type CodigoCaixaParseado = {
  codigo: string;
  zona: ZonaCaixaCodigo;
  equipamento: number | null; // F1 → 1; ES → null
  papel: PapelCaixaCodigo | null; // G/ES → null (reserva implícita)
  sequencia: number;
  tipo_box: TipoBox;
};

const RE_FREEZER = /^F(\d+)-([RO])(\d{2})$/i;
const RE_GELADEIRA = /^G(\d+)-(\d{2})$/i;
const RE_SECO = /^ES-(\d{2})$/i;

/** Padrão falado na etiqueta (hífen obrigatório). */
export const PADRAO_CODIGO_CAIXA = /^F\d+-[RO]\d{2}$|^G\d+-\d{2}$|^ES-\d{2}$/i;

export function normalizarCodigoCaixa(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "-");
}

export function parseCodigoCaixa(raw: string): CodigoCaixaParseado | null {
  const codigo = normalizarCodigoCaixa(raw);
  if (!codigo) return null;

  let m = codigo.match(RE_FREEZER);
  if (m) {
    const equipamento = Number(m[1]);
    const papel = m[2].toUpperCase() as PapelCaixaCodigo;
    const sequencia = Number(m[3]);
    if (!equipamento || sequencia < 1 || sequencia > 99) return null;
    return {
      codigo: `F${equipamento}-${papel}${String(sequencia).padStart(2, "0")}`,
      zona: "F",
      equipamento,
      papel,
      sequencia,
      tipo_box: papel === "O" ? "OPERACIONAL" : "RESERVA",
    };
  }

  m = codigo.match(RE_GELADEIRA);
  if (m) {
    const equipamento = Number(m[1]);
    const sequencia = Number(m[2]);
    if (!equipamento || sequencia < 1 || sequencia > 99) return null;
    return {
      codigo: `G${equipamento}-${String(sequencia).padStart(2, "0")}`,
      zona: "G",
      equipamento,
      papel: null,
      sequencia,
      tipo_box: "RESERVA",
    };
  }

  m = codigo.match(RE_SECO);
  if (m) {
    const sequencia = Number(m[1]);
    if (sequencia < 1 || sequencia > 99) return null;
    return {
      codigo: `ES-${String(sequencia).padStart(2, "0")}`,
      zona: "ES",
      equipamento: null,
      papel: null,
      sequencia,
      tipo_box: "RESERVA",
    };
  }

  return null;
}

export function validarCodigoCaixa(raw: string): { ok: true; parseado: CodigoCaixaParseado } | { ok: false; erro: string } {
  const normalizado = normalizarCodigoCaixa(raw);
  if (!normalizado || !PADRAO_CODIGO_CAIXA.test(normalizado)) {
    return {
      ok: false,
      erro: "Código inválido. Use F1-R01, F1-O01, G1-01 ou ES-01.",
    };
  }
  const parseado = parseCodigoCaixa(normalizado);
  if (!parseado) {
    return {
      ok: false,
      erro: "Código inválido. Use F1-R01, F1-O01, G1-01 ou ES-01.",
    };
  }
  return { ok: true, parseado };
}

/** Número interno estável para ordenação (não é o código falado). */
export function numeroInternoDoCodigo(parseado: CodigoCaixaParseado): number {
  const zonaN = parseado.zona === "F" ? 1 : parseado.zona === "G" ? 2 : 3;
  const eq = parseado.equipamento ?? 0;
  const papelN = parseado.papel === "O" ? 1 : 0;
  return zonaN * 100_000 + eq * 1_000 + papelN * 100 + parseado.sequencia;
}

export function montarCodigoCaixa(partes: {
  zona: ZonaCaixaCodigo;
  equipamento?: number;
  papel?: PapelCaixaCodigo;
  sequencia: number;
}): string {
  const seq = String(partes.sequencia).padStart(2, "0");
  if (partes.zona === "ES") return `ES-${seq}`;
  if (partes.zona === "G") return `G${partes.equipamento ?? 1}-${seq}`;
  return `F${partes.equipamento ?? 1}-${partes.papel ?? "R"}${seq}`;
}

/** Infere zona/equipamento a partir do nome do local (Freezer 1, Geladeira 2, Estoque seco…). */
export function inferirZonaDoLocal(local: Pick<Local, "nome" | "tipo"> | undefined): {
  zona: ZonaCaixaCodigo;
  equipamento: number | null;
} | null {
  if (!local) return null;
  const nome = local.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const tipo = (local.tipo || "").toLowerCase();

  if (tipo === "freezer" || /\bfreezer\b/.test(nome)) {
    const n = nome.match(/(\d+)/);
    return { zona: "F", equipamento: n ? Number(n[1]) : 1 };
  }
  if (tipo === "geladeira" || /\bgeladeira\b/.test(nome)) {
    const n = nome.match(/(\d+)/);
    return { zona: "G", equipamento: n ? Number(n[1]) : 1 };
  }
  if (
    tipo === "despensa" ||
    tipo === "prateleira" ||
    /\bestoque seco\b/.test(nome) ||
    /\bdespensa\b/.test(nome) ||
    /\bprateleira\b/.test(nome)
  ) {
    return { zona: "ES", equipamento: null };
  }
  return null;
}

/** Local sugerido a partir do código (match por nome). */
export function sugerirLocalIdParaCodigo(
  parseado: CodigoCaixaParseado,
  locais: Local[]
): string | undefined {
  const lista = locais ?? [];
  if (parseado.zona === "ES") {
    const seco = lista.find((l) => /estoque seco/i.test(l.nome));
    if (seco) return seco.id;
    const desp = lista.find((l) => l.tipo === "despensa" || /despensa/i.test(l.nome));
    return desp?.id;
  }
  if (parseado.zona === "F") {
    const alvo = lista.find(
      (l) =>
        (l.tipo === "freezer" || /freezer/i.test(l.nome)) &&
        new RegExp(`\\b${parseado.equipamento}\\b`).test(l.nome)
    );
    return alvo?.id ?? lista.find((l) => l.tipo === "freezer")?.id;
  }
  if (parseado.zona === "G") {
    const alvo = lista.find(
      (l) =>
        (l.tipo === "geladeira" || /geladeira/i.test(l.nome)) &&
        new RegExp(`\\b${parseado.equipamento}\\b`).test(l.nome)
    );
    return alvo?.id ?? lista.find((l) => l.tipo === "geladeira")?.id;
  }
  return undefined;
}

/** Próximo código livre no banco para zona/papel/equipamento. */
export function sugerirProximoCodigoCaixa(
  qrCodesExistentes: string[],
  opts: { zona: ZonaCaixaCodigo; equipamento?: number; papel?: PapelCaixaCodigo }
): string {
  const usados = new Set(
    qrCodesExistentes.map((q) => normalizarCodigoCaixa(q)).filter(Boolean)
  );
  for (let seq = 1; seq <= 99; seq++) {
    const codigo = montarCodigoCaixa({
      zona: opts.zona,
      equipamento: opts.equipamento,
      papel: opts.papel,
      sequencia: seq,
    });
    if (!usados.has(codigo)) return codigo;
  }
  throw new Error("Não há sequência livre (01–99) para este local/papel.");
}

/** Valida se o local bate com a zona do código. */
export function localCompativelComCodigo(
  parseado: CodigoCaixaParseado,
  local: Pick<Local, "nome" | "tipo"> | undefined
): boolean {
  const inf = inferirZonaDoLocal(local);
  if (!inf) return false;
  if (inf.zona !== parseado.zona) return false;
  if (parseado.zona === "ES") return true;
  return inf.equipamento === parseado.equipamento;
}

export const EXEMPLO_CODIGO_CAIXA = "F1-R01";
export const DICA_CODIGO_CAIXA =
  "Código da etiqueta: F1-R01 (freezer reserva), F1-O01 (operacional), G1-01 / G2-01 (geladeira), ES-01 (estoque seco). Padrão: F#-R## | F#-O## | G#-## | ES-##.";
