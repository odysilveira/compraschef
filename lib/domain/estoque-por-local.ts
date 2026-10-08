import type { DB, Local } from "../types";
import { lotesPendentesDeAlocacao, quantidadePendenteLote, saldoDosLotes } from "./estoque";

export type SaldoProdutoLocal = {
  produto_id: string;
  local_id: string;
  quantidade: number;
};

export type BreakdownLocalProduto = {
  local_id: string;
  local_nome: string;
  quantidade: number;
};

export type ResumoProdutoEstoque = {
  produto_id: string;
  total: number;
  por_local: BreakdownLocalProduto[];
  aguardando_caixa: number;
};

const ID_AGUARDANDO = "__aguardando_caixa__";

/** Soma quantidades das caixas com produto, agrupado por local_id (vazio → sem local). */
export function saldosPorLocal(db: DB): SaldoProdutoLocal[] {
  const mapa = new Map<string, number>();
  for (const caixa of db.caixas ?? []) {
    if (!caixa.produto_id) continue;
    const q = Number(caixa.quantidade) || 0;
    if (q <= 0) continue;
    const localKey = caixa.local_id || "__sem_local__";
    const key = `${caixa.produto_id}::${localKey}`;
    mapa.set(key, (mapa.get(key) ?? 0) + q);
  }
  const out: SaldoProdutoLocal[] = [];
  for (const [key, quantidade] of mapa) {
    const [produto_id, local_id] = key.split("::");
    out.push({ produto_id, local_id, quantidade });
  }
  return out;
}

export function saldoProdutoNoLocal(db: DB, produtoId: string, localId: string): number {
  return (db.caixas ?? [])
    .filter((c) => c.produto_id === produtoId && c.local_id === localId)
    .reduce((s, c) => s + (Number(c.quantidade) || 0), 0);
}

/** Quantidade em caixas sem local_id. */
export function saldoProdutoSemLocal(db: DB, produtoId: string): number {
  return (db.caixas ?? [])
    .filter((c) => c.produto_id === produtoId && !c.local_id)
    .reduce((s, c) => s + (Number(c.quantidade) || 0), 0);
}

export function aguardandoCaixaPorProduto(db: DB): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const lote of lotesPendentesDeAlocacao(db)) {
    const q = quantidadePendenteLote(db, lote.id);
    if (q <= 0) continue;
    mapa.set(lote.produto_id, (mapa.get(lote.produto_id) ?? 0) + q);
  }
  return mapa;
}

export function nomeLocalOuRotulo(db: DB, localId: string): string {
  if (localId === ID_AGUARDANDO) return "Aguardando caixa";
  if (localId === "__sem_local__") return "Sem local";
  return db.locais.find((l) => l.id === localId)?.nome ?? localId;
}

/** Visão geral: total por produto + breakdown por local + aguardando caixa. */
export function resumoEstoquePorProdutos(db: DB): ResumoProdutoEstoque[] {
  const ativos = (db.produtos ?? []).filter((p) => p.ativo);
  const porLocal = saldosPorLocal(db);
  const aguardando = aguardandoCaixaPorProduto(db);
  const locaisPorId = new Map((db.locais ?? []).map((l) => [l.id, l]));

  return ativos
    .map((p) => {
      const linhas = porLocal.filter((s) => s.produto_id === p.id);
      const por_local: BreakdownLocalProduto[] = linhas
        .map((s) => ({
          local_id: s.local_id,
          local_nome:
            s.local_id === "__sem_local__"
              ? "Sem local"
              : locaisPorId.get(s.local_id)?.nome ?? s.local_id,
          quantidade: s.quantidade,
        }))
        .sort((a, b) => b.quantidade - a.quantidade);
      const aguardando_caixa = aguardando.get(p.id) ?? 0;
      const total = saldoDosLotes(db, p.id);
      return { produto_id: p.id, total, por_local, aguardando_caixa };
    })
    .filter((r) => r.total > 0 || r.aguardando_caixa > 0 || r.por_local.length > 0)
    .sort((a, b) => b.total - a.total);
}

/** Produtos com quantidade no local (só caixas daquele local). */
export function produtosNoLocal(
  db: DB,
  localId: string
): { produto_id: string; quantidade: number }[] {
  const mapa = new Map<string, number>();
  for (const caixa of db.caixas ?? []) {
    if (caixa.local_id !== localId || !caixa.produto_id) continue;
    const q = Number(caixa.quantidade) || 0;
    if (q <= 0) continue;
    mapa.set(caixa.produto_id, (mapa.get(caixa.produto_id) ?? 0) + q);
  }
  return [...mapa.entries()]
    .map(([produto_id, quantidade]) => ({ produto_id, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

/** Locais ordenados para abas (estoque seco, freezers, geladeiras, balcão…). */
export function locaisOrdenadosParaVisao(db: DB): Local[] {
  const ordemTipo = ["despensa", "freezer", "geladeira", "balcao", "prateleira"];
  return [...(db.locais ?? [])].sort((a, b) => {
    const ta = ordemTipo.indexOf(a.tipo);
    const tb = ordemTipo.indexOf(b.tipo);
    if (ta !== tb) return (ta === -1 ? 99 : ta) - (tb === -1 ? 99 : tb);
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

export { ID_AGUARDANDO as LOCAL_ID_AGUARDANDO_CAIXA };
