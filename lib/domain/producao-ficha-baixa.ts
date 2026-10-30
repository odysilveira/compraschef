/**
 * Explode ficha técnica e debita insumos ao registrar produção.
 */

import type { DB, FichaTecnica, Produto } from "../types";
import { baixarProdutoPorFefo, saldoEmCaixasProduto } from "./estoque-baixa";
import { criarLote } from "./estoque";
import { converterUnidadeBasica, obterSiglaUnidade } from "./fichas-tecnicas";

export type InsumoProducao = {
  produto_id: string;
  nome: string;
  quantidade: number;
  unidade_sigla: string;
  saldo_caixas: number;
  ok: boolean;
  motivo?: string;
};

export type PreviaProducaoFicha = {
  produto_id: string;
  ficha_id: string | null;
  ficha_nome: string | null;
  quantidade_produzida: number;
  rendimento_ficha: number | null;
  insumos: InsumoProducao[];
  pode_aplicar_com_baixa: boolean;
  bloqueios: string[];
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

function arred(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function listarFichasDb(db: DB): FichaTecnica[] {
  const dasVersoes = (db.fichas_tecnicas_versoes ?? []).map((v) => v.ficha);
  const legado = db.fichas_tecnicas ?? [];
  const porId = new Map<string, FichaTecnica>();
  for (const f of [...legado, ...dasVersoes]) {
    if (f?.id) porId.set(f.id, f);
  }
  return Array.from(porId.values());
}

/** Encontra ficha do produto acabado (nome / código). Prefere versão publicada. */
export function resolverFichaProdutoAcabado(
  db: DB,
  produtoId: string
): { ficha: FichaTecnica; receita_id?: string } | null {
  const produto = db.produtos.find((p) => p.id === produtoId);
  if (!produto) return null;
  const nProd = normalizar(produto.nome);
  const cod = (produto.codigo_externo || "").trim().toLowerCase();

  const receitas = db.fichas_tecnicas_receitas ?? [];
  const versoes = db.fichas_tecnicas_versoes ?? [];

  for (const receita of receitas) {
    const nRec = normalizar(receita.nome);
    const matchNome =
      nRec === nProd ||
      nRec.includes(nProd) ||
      nProd.includes(nRec) ||
      nRec.replace(/^molho\s+/, "") === nProd.replace(/^molho\s+/, "");
    const matchCod = cod && (receita.codigo || "").toLowerCase() === cod;
    if (!matchNome && !matchCod) continue;

    const versao =
      versoes.find((v) => v.receita_id === receita.id && v.status === "publicada") ??
      versoes.find((v) => v.id === receita.versao_vigente_id) ??
      versoes.find((v) => v.receita_id === receita.id);
    if (versao?.ficha) return { ficha: versao.ficha, receita_id: receita.id };
  }

  const fichas = listarFichasDb(db);
  for (const ficha of fichas) {
    const nF = normalizar(ficha.nome);
    if (
      nF === nProd ||
      nF.includes(nProd) ||
      nProd.includes(nF) ||
      (cod && (ficha.codigo_externo || "").toLowerCase() === cod)
    ) {
      return { ficha };
    }
  }
  return null;
}

function qtdIngredienteNaUnidadeUso(
  quantidade: number,
  unidadeIngredienteId: string,
  produto: Produto,
  db: DB
): number {
  const unidades = db.unidades ?? [];
  if (unidadeIngredienteId === produto.unidade_uso_id) return quantidade;
  if (produto.unidade_compra_id && unidadeIngredienteId === produto.unidade_compra_id) {
    const f = produto.fator_conversao;
    if (!Number.isFinite(f) || f <= 0) {
      throw new Error(`Fator de conversão inválido em “${produto.nome}”.`);
    }
    return quantidade * f;
  }
  const siglaIng = obterSiglaUnidade(unidadeIngredienteId, unidades);
  const siglaUso = obterSiglaUnidade(produto.unidade_uso_id, unidades);
  return converterUnidadeBasica(quantidade, siglaIng, siglaUso);
}

/**
 * Escala ingredientes da ficha pela quantidade produzida / rendimento.
 * SUB_RECEITA é expandida até folhas PRODUTO.
 */
export function explodirInsumosProducao(
  ficha: FichaTecnica,
  quantidadeProduzida: number,
  db: DB,
  visitados = new Set<string>()
): Map<string, number> {
  if (!Number.isFinite(quantidadeProduzida) || quantidadeProduzida <= 0) {
    throw new Error("Quantidade produzida deve ser maior que zero.");
  }
  if (!Number.isFinite(ficha.rendimento_quantidade) || ficha.rendimento_quantidade <= 0) {
    throw new Error(`Rendimento inválido na ficha “${ficha.nome}”.`);
  }
  if (visitados.has(ficha.id)) {
    throw new Error(`Ciclo de sub-receitas detectado em “${ficha.nome}”.`);
  }
  visitados.add(ficha.id);

  const fator = quantidadeProduzida / ficha.rendimento_quantidade;
  const out = new Map<string, number>();
  const todas = listarFichasDb(db);

  for (const ing of ficha.ingredientes ?? []) {
    const qBase = Number(ing.quantidade) || 0;
    if (qBase <= 0) continue;
    const qEscalada = qBase * fator;

    if (ing.tipo === "PRODUTO" && ing.produto_id) {
      const prod = db.produtos.find((p) => p.id === ing.produto_id);
      if (!prod) {
        throw new Error(`Ingrediente da ficha aponta para produto inexistente (${ing.produto_id}).`);
      }
      const qUso = qtdIngredienteNaUnidadeUso(qEscalada, ing.unidade_id, prod, db);
      out.set(prod.id, arred((out.get(prod.id) ?? 0) + qUso));
      continue;
    }

    if (ing.tipo === "SUB_RECEITA" && ing.sub_receita_id) {
      const sub =
        todas.find((f) => f.id === ing.sub_receita_id) ??
        (db.fichas_tecnicas_versoes ?? []).find((v) => v.receita_id === ing.sub_receita_id)?.ficha;
      if (!sub) {
        throw new Error(`Sub-receita ${ing.sub_receita_id} não encontrada.`);
      }
      // qEscalada está na unidade do rendimento da sub — tratar como quantidade de rendimento da sub
      const folhas = explodirInsumosProducao(sub, qEscalada, db, new Set(visitados));
      for (const [pid, q] of Array.from(folhas.entries())) {
        out.set(pid, arred((out.get(pid) ?? 0) + q));
      }
    }
  }

  return out;
}

export function montarPreviaProducaoFicha(
  db: DB,
  produtoId: string,
  quantidadeProduzida: number
): PreviaProducaoFicha {
  const bloqueios: string[] = [];
  const resolvido = resolverFichaProdutoAcabado(db, produtoId);
  if (!resolvido) {
    return {
      produto_id: produtoId,
      ficha_id: null,
      ficha_nome: null,
      quantidade_produzida: quantidadeProduzida,
      rendimento_ficha: null,
      insumos: [],
      pode_aplicar_com_baixa: false,
      bloqueios: ["Nenhuma ficha técnica encontrada para este produto."],
    };
  }

  let mapa: Map<string, number>;
  try {
    mapa = explodirInsumosProducao(resolvido.ficha, quantidadeProduzida, db);
  } catch (e) {
    return {
      produto_id: produtoId,
      ficha_id: resolvido.ficha.id,
      ficha_nome: resolvido.ficha.nome,
      quantidade_produzida: quantidadeProduzida,
      rendimento_ficha: resolvido.ficha.rendimento_quantidade,
      insumos: [],
      pode_aplicar_com_baixa: false,
      bloqueios: [e instanceof Error ? e.message : "Falha ao explodir ficha."],
    };
  }

  const insumos: InsumoProducao[] = [];
  for (const [pid, q] of Array.from(mapa.entries())) {
    const prod = db.produtos.find((p) => p.id === pid);
    const saldo = saldoEmCaixasProduto(db, pid);
    const ok = saldo + 1e-9 >= q;
    let unidade_sigla = "?";
    try {
      unidade_sigla = obterSiglaUnidade(prod?.unidade_uso_id ?? "", db.unidades ?? []);
    } catch {
      unidade_sigla = "un";
    }
    insumos.push({
      produto_id: pid,
      nome: prod?.nome ?? pid,
      quantidade: q,
      unidade_sigla,
      saldo_caixas: saldo,
      ok,
      motivo: ok ? undefined : `Saldo em caixas (${saldo}) < necessidade (${q})`,
    });
  }
  insumos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  for (const i of insumos.filter((x) => !x.ok)) bloqueios.push(i.motivo!);
  if (insumos.length === 0) bloqueios.push("Ficha sem ingredientes de produto para debitar.");

  return {
    produto_id: produtoId,
    ficha_id: resolvido.ficha.id,
    ficha_nome: resolvido.ficha.nome,
    quantidade_produzida: quantidadeProduzida,
    rendimento_ficha: resolvido.ficha.rendimento_quantidade,
    insumos,
    pode_aplicar_com_baixa: bloqueios.length === 0 && insumos.length > 0,
    bloqueios,
  };
}

export function aplicarProducaoComBaixaFicha(
  db: DB,
  dados: {
    produtoId: string;
    quantidade: number;
    dataProducao: string;
    validade: string;
    porcionadoPorId: string;
    usuarioId: string;
    agora: string;
    novoLoteId: () => string;
    novoMovimentoId: () => string;
    /** Se false, só cria lote (comportamento antigo). */
    debitarFicha: boolean;
  }
): { lote_id: string; movimento_producao_id: string; movimento_baixa_ids: string[] } {
  const previa = dados.debitarFicha
    ? montarPreviaProducaoFicha(db, dados.produtoId, dados.quantidade)
    : null;
  if (dados.debitarFicha && previa && !previa.pode_aplicar_com_baixa) {
    throw new Error(previa.bloqueios[0] || "Não é possível debitar a ficha.");
  }

  const lote = criarLote(db, {
    id: dados.novoLoteId(),
    produto_id: dados.produtoId,
    origem: "producao",
    porcionado_por_id: dados.porcionadoPorId,
    quantidade: dados.quantidade,
    data_entrada: dados.dataProducao,
    validade: dados.validade,
    criado_em: dados.agora,
    atualizado_em: dados.agora,
  });

  const movimento_producao_id = dados.novoMovimentoId();
  db.movimentos_estoque.unshift({
    id: movimento_producao_id,
    produto_id: dados.produtoId,
    lote_id: lote.id,
    tipo: "producao",
    motivo: dados.debitarFicha ? "PRODUCAO_COM_FICHA" : "PRODUCAO_SEM_FICHA",
    quantidade: dados.quantidade,
    usuario_id: dados.usuarioId,
    criado_em: dados.agora,
    sincronizado: false,
  });

  const movimento_baixa_ids: string[] = [];
  if (dados.debitarFicha && previa) {
    for (const ins of previa.insumos) {
      const r = baixarProdutoPorFefo(db, {
        produtoId: ins.produto_id,
        quantidade: ins.quantidade,
        usuarioId: dados.usuarioId,
        motivo: "PRODUCAO_FICHA",
        agora: dados.agora,
        novoMovimentoId: dados.novoMovimentoId,
      });
      movimento_baixa_ids.push(...r.movimento_ids);
    }
  }

  return { lote_id: lote.id, movimento_producao_id, movimento_baixa_ids };
}
