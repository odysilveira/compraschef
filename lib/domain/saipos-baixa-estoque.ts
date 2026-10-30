/**
 * Prévia e aplicação de baixa de produtos acabados (massa/molho)
 * a partir do consumo teórico Saipos arquivado.
 */

import type { DB } from "../types";
import { baixarProdutoPorFefo, saldoEmCaixasProduto } from "./estoque-baixa";
import type {
  ArquivoConsumoSaipos,
  BaixaEstoqueArquivoSaipos,
} from "./saipos-consumo-arquivo";
import {
  FICHA_MASSA_CRUA_G,
  gramaturaMassaCruaG,
  type ResultadoConsolidadoSaipos,
} from "./saipos-itens-vendidos";

const SEP = "\u0000";

/** Fallback g/porção de molho quando não há ficha. */
export const FICHA_MOLHO_G: Partial<Record<string, number>> = {
  P: 100,
  G: 180,
  KIDS: 60,
  RISOTO: 120,
  POLENTA: 100,
  SALADA: 80,
};

export type LinhaPreviaBaixaSaipos = {
  chave: string;
  tipo: "massa" | "molho";
  rotulo: string;
  porcoes: number;
  gramas_unit: number | null;
  quantidade_kg: number;
  produto_id: string | null;
  produto_nome: string | null;
  saldo_caixas: number;
  origem_gramatura: "ficha" | "catalogo" | "ausente" | "—";
  ok: boolean;
  motivo?: string;
};

export type PreviaBaixaSaipos = {
  mes_ref: string;
  ja_aplicada: boolean;
  aplicada_em: string | null;
  linhas: LinhaPreviaBaixaSaipos[];
  agregadas: {
    produto_id: string;
    nome: string;
    quantidade_kg: number;
    saldo_caixas: number;
    ok: boolean;
    motivo?: string;
  }[];
  pode_aplicar: boolean;
  bloqueios: string[];
  /** Molhos/massas sem produto — não entram na baixa, só aviso. */
  avisos: string[];
};

function normalizar(txt: string): string {
  return String(txt ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function arredKg(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Resolve produto acabado para nomes de massa Saipos. */
export function mapearProdutoMassa(db: DB, _massa: string): { id: string; nome: string } | null {
  const porId = db.produtos.find((p) => p.id === "prod-massa" && p.ativo);
  if (porId) return { id: porId.id, nome: porId.nome };
  const n = normalizar("massa fresca");
  const porNome = db.produtos.find((p) => p.ativo && normalizar(p.nome).includes(n));
  return porNome ? { id: porNome.id, nome: porNome.nome } : null;
}

/** Resolve produto acabado para nomes de molho Saipos. */
export function mapearProdutoMolho(db: DB, molho: string): { id: string; nome: string } | null {
  const n = normalizar(molho);
  if (n.includes("bolonhesa")) {
    const b = db.produtos.find((p) => p.id === "prod-bolonhesa" && p.ativo);
    if (b) return { id: b.id, nome: b.nome };
  }
  if (n.includes("funghi")) {
    const r = db.produtos.find((p) => p.id === "prod-risoto-base" && p.ativo);
    if (r) return { id: r.id, nome: r.nome };
  }
  const candidatos = (db.produtos ?? []).filter((p) => p.ativo && p.tipo === "produzido");
  for (const p of candidatos) {
    const pn = normalizar(p.nome);
    if (pn.includes(n) || n.includes(pn.replace(/^molho\s+/, ""))) {
      return { id: p.id, nome: p.nome };
    }
  }
  return null;
}

function gramaturaMolhoG(
  molho: string,
  tamanho: string,
  db: DB
): { gramas: number | null; origem: "ficha" | "catalogo" | "ausente" } {
  // Reaproveita busca de porcionamento por nome (ficha cujo nome contém o molho)
  const viaFicha = gramaturaMassaCruaG(molho, tamanho, db);
  if (viaFicha.origem === "ficha" && viaFicha.gramas != null) return viaFicha;
  const g = FICHA_MOLHO_G[tamanho];
  if (g != null) return { gramas: g, origem: "catalogo" };
  return { gramas: null, origem: "ausente" };
}

function somarMassaTamanho(res: ResultadoConsolidadoSaipos): Map<string, { massa: string; tamanho: string; porcoes: number }> {
  const out = new Map<string, { massa: string; tamanho: string; porcoes: number }>();
  for (const [ch, q] of Object.entries(res.massaTamanho ?? {})) {
    const [massa, tamanho = ""] = ch.split(SEP);
    if (!massa || !q) continue;
    const key = `${massa}${SEP}${tamanho}`;
    const prev = out.get(key) ?? { massa, tamanho, porcoes: 0 };
    prev.porcoes += q;
    out.set(key, prev);
  }
  return out;
}

function somarMolhoTamanho(res: ResultadoConsolidadoSaipos): Map<string, { molho: string; tamanho: string; porcoes: number }> {
  const out = new Map<string, { molho: string; tamanho: string; porcoes: number }>();
  for (const [ch, q] of Object.entries(res.molhoTamanho ?? {})) {
    const [molho, , tamanho = ""] = ch.split(SEP);
    if (!molho || !q) continue;
    const key = `${molho}${SEP}${tamanho || "G"}`;
    const prev = out.get(key) ?? { molho, tamanho: tamanho || "G", porcoes: 0 };
    prev.porcoes += q;
    out.set(key, prev);
  }
  // Se só houver molhoMassa sem tamanho, rateia como G
  if (out.size === 0) {
    for (const [ch, q] of Object.entries(res.molhoMassa ?? {})) {
      const [molho] = ch.split(SEP);
      if (!molho || !q) continue;
      const key = `${molho}${SEP}G`;
      const prev = out.get(key) ?? { molho, tamanho: "G", porcoes: 0 };
      prev.porcoes += q;
      out.set(key, prev);
    }
  }
  return out;
}

export function montarPreviaBaixaSaipos(arquivo: ArquivoConsumoSaipos, db: DB): PreviaBaixaSaipos {
  const linhas: LinhaPreviaBaixaSaipos[] = [];
  const res = arquivo.resultado;

  for (const { massa, tamanho, porcoes } of Array.from(somarMassaTamanho(res).values())) {
    const { gramas, origem } = gramaturaMassaCruaG(massa, tamanho, db);
    const prod = mapearProdutoMassa(db, massa);
    const kg = gramas != null ? arredKg((porcoes * gramas) / 1000) : 0;
    const saldo = prod ? saldoEmCaixasProduto(db, prod.id) : 0;
    let ok = Boolean(prod && gramas != null && kg > 0);
    let motivo: string | undefined;
    if (!prod) {
      ok = false;
      motivo = "Sem produto vinculado (Massa fresca)";
    } else if (gramas == null) {
      ok = false;
      motivo = `Sem gramatura para ${massa} ${tamanho || ""}`.trim();
    }
    linhas.push({
      chave: `massa:${massa}:${tamanho}`,
      tipo: "massa",
      rotulo: `${massa}${tamanho ? ` · ${tamanho}` : ""}`,
      porcoes,
      gramas_unit: gramas,
      quantidade_kg: kg,
      produto_id: prod?.id ?? null,
      produto_nome: prod?.nome ?? null,
      saldo_caixas: saldo,
      origem_gramatura: origem,
      ok,
      motivo,
    });
  }

  for (const { molho, tamanho, porcoes } of Array.from(somarMolhoTamanho(res).values())) {
    const { gramas, origem } = gramaturaMolhoG(molho, tamanho, db);
    const prod = mapearProdutoMolho(db, molho);
    const kg = gramas != null ? arredKg((porcoes * gramas) / 1000) : 0;
    const saldo = prod ? saldoEmCaixasProduto(db, prod.id) : 0;
    let ok = Boolean(prod && gramas != null && kg > 0);
    let motivo: string | undefined;
    if (!prod) {
      ok = false;
      motivo = `Sem produto vinculado para molho “${molho}”`;
    } else if (gramas == null) {
      ok = false;
      motivo = `Sem gramatura para molho ${molho} ${tamanho}`;
    }
    linhas.push({
      chave: `molho:${molho}:${tamanho}`,
      tipo: "molho",
      rotulo: `${molho}${tamanho ? ` · ${tamanho}` : ""}`,
      porcoes,
      gramas_unit: gramas,
      quantidade_kg: kg,
      produto_id: prod?.id ?? null,
      produto_nome: prod?.nome ?? null,
      saldo_caixas: saldo,
      origem_gramatura: origem,
      ok,
      motivo,
    });
  }

  const porProduto = new Map<
    string,
    { produto_id: string; nome: string; quantidade_kg: number; saldo_caixas: number }
  >();
  for (const l of linhas) {
    if (!l.produto_id || l.quantidade_kg <= 0) continue;
    const prev = porProduto.get(l.produto_id) ?? {
      produto_id: l.produto_id,
      nome: l.produto_nome || l.produto_id,
      quantidade_kg: 0,
      saldo_caixas: l.saldo_caixas,
    };
    prev.quantidade_kg = arredKg(prev.quantidade_kg + l.quantidade_kg);
    prev.saldo_caixas = l.saldo_caixas;
    porProduto.set(l.produto_id, prev);
  }

  const agregadas = Array.from(porProduto.values()).map((a) => {
    const ok = a.saldo_caixas + 1e-9 >= a.quantidade_kg;
    return {
      ...a,
      ok,
      motivo: ok ? undefined : `Saldo em caixas (${a.saldo_caixas}) < necessidade (${a.quantidade_kg})`,
    };
  });

  const bloqueios: string[] = [];
  const avisos: string[] = [];
  if (arquivo.baixa_estoque?.aplicada_em) {
    bloqueios.push(`Baixa já aplicada em ${arquivo.baixa_estoque.aplicada_em}.`);
  }
  for (const a of agregadas.filter((x) => !x.ok)) {
    bloqueios.push(a.motivo!);
  }
  if (agregadas.length === 0 && !arquivo.baixa_estoque) {
    bloqueios.push("Nada a baixar (sem massa/molho mapeados com gramatura).");
  }
  for (const l of linhas.filter((x) => x.porcoes > 0 && !x.produto_id)) {
    if (l.motivo) avisos.push(l.motivo);
  }

  const ja_aplicada = Boolean(arquivo.baixa_estoque?.aplicada_em);
  const pode_aplicar = !ja_aplicada && agregadas.length > 0 && agregadas.every((a) => a.ok);

  return {
    mes_ref: arquivo.mes_ref,
    ja_aplicada,
    aplicada_em: arquivo.baixa_estoque?.aplicada_em ?? null,
    linhas,
    agregadas,
    pode_aplicar,
    bloqueios: Array.from(new Set(bloqueios)),
    avisos: Array.from(new Set(avisos)),
  };
}

/**
 * Aplica baixas FEFO no DB e devolve o arquivo com `baixa_estoque` marcado.
 * Idempotente: se já aplicada, lança erro.
 */
export function aplicarBaixaSaiposMes(
  db: DB,
  arquivo: ArquivoConsumoSaipos,
  usuarioId: string,
  novoMovimentoId: () => string,
  agora = new Date().toISOString()
): { arquivo: ArquivoConsumoSaipos; movimento_ids: string[]; previa: PreviaBaixaSaipos } {
  const previa = montarPreviaBaixaSaipos(arquivo, db);
  if (previa.ja_aplicada) {
    throw new Error(`Baixa do mês ${arquivo.mes_ref} já foi aplicada.`);
  }
  if (!previa.pode_aplicar) {
    throw new Error(previa.bloqueios[0] || "Não é possível aplicar a baixa.");
  }

  const movimento_ids: string[] = [];
  const resumo: BaixaEstoqueArquivoSaipos["resumo"] = [];

  for (const a of previa.agregadas) {
    const r = baixarProdutoPorFefo(db, {
      produtoId: a.produto_id,
      quantidade: a.quantidade_kg,
      usuarioId,
      motivo: "SAIPOS_CONSUMO_MES",
      agora,
      novoMovimentoId,
    });
    movimento_ids.push(...r.movimento_ids);
    resumo.push({
      produto_id: a.produto_id,
      nome: a.nome,
      quantidade_kg: a.quantidade_kg,
    });
  }

  const baixa_estoque: BaixaEstoqueArquivoSaipos = {
    aplicada_em: agora,
    movimento_ids,
    resumo,
  };

  return {
    arquivo: { ...arquivo, baixa_estoque },
    movimento_ids,
    previa,
  };
}

/** Catálogo de massa (export para testes). */
export { FICHA_MASSA_CRUA_G };
