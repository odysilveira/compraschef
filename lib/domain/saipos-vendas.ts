/**
 * Camada de vendas/faturamento do export Saipos (qtd + R$),
 * separada do consumo teórico de cozinha.
 */

import {
  classificarItem,
  classificarOpcao,
  cruzar,
  rotuloTam,
  totalDe,
  type AbaRelatorioSaipos,
  type GrupoItemSaipos,
} from "./saipos-itens-vendidos";

export type CategoriaVendaSaipos =
  | "prato"
  | "risoto"
  | "bebida"
  | "sobremesa"
  | "combo"
  | "promocao"
  | "outro";

export type ItemVendaSaipos = {
  item: string;
  categoria: CategoriaVendaSaipos;
  quantidade: number;
  valor: number;
};

export type TotaisCategoriaVenda = {
  quantidade: number;
  valor: number;
};

export type PratoMontadoSaipos = {
  massa: string;
  molho: string;
  tamanho: string;
  quantidade: number;
  valor: number;
  /** true quando o R$ veio de rateio (combo/vários cruzamentos). */
  rateio_aproximado: boolean;
};

export type VendasSaipos = {
  itens: ItemVendaSaipos[];
  totais: { quantidade_itens: number; faturamento: number };
  por_categoria: Partial<Record<CategoriaVendaSaipos, TotaisCategoriaVenda>>;
  pratos_montados: PratoMontadoSaipos[];
};

const ROTULO_CATEGORIA: Record<CategoriaVendaSaipos, string> = {
  prato: "Prato",
  risoto: "Risoto",
  bebida: "Bebida",
  sobremesa: "Sobremesa",
  combo: "Combo",
  promocao: "Promoção",
  outro: "Outro",
};

function arred(v: number, casas = 2): number {
  const f = 10 ** casas;
  return Math.round(v * f) / f;
}

export function categoriaVendaDoItem(nome: string): CategoriaVendaSaipos {
  const info = classificarItem(nome);
  if (info.cat === "COMBO") return "combo";
  if (info.cat === "BEBIDA") return "bebida";
  if (info.cat === "SOBREMESA") return "sobremesa";
  if (info.cat === "PRATO") {
    if (info.base === "Risoto") return "risoto";
    return "prato";
  }
  const k = nome.toLowerCase();
  if (k.includes("promo") || k.includes("vale muito")) return "promocao";
  return "outro";
}

function somarItem(
  mapa: Map<string, ItemVendaSaipos>,
  item: string,
  categoria: CategoriaVendaSaipos,
  qtd: number,
  valor: number
) {
  const key = `${categoria}::${item}`;
  const prev = mapa.get(key);
  if (prev) {
    prev.quantidade += qtd;
    prev.valor += valor;
  } else {
    mapa.set(key, { item, categoria, quantidade: qtd, valor });
  }
}

/** Extrai massas/molhos das opções (mesma lógica da consolidação). */
function massasMolhosDoGrupo(g: GrupoItemSaipos): {
  massas: Record<string, number>;
  molhos: Record<string, number>;
} {
  const massas: Record<string, number> = {};
  const molhos: Record<string, number> = {};
  for (const o of g.opcoes) {
    const c = classificarOpcao(o.nome);
    const q = o.qtd;
    if (c.cat === "MASSA") {
      const ch = `${c.massa}\u0000${c.tamanho || ""}`;
      massas[ch] = (massas[ch] || 0) + q;
    } else if (c.cat === "MOLHO") {
      const ch = `${c.molho}\u0000${c.base || ""}\u0000${c.tamanho || ""}`;
      molhos[ch] = (molhos[ch] || 0) + q;
    }
  }
  return { massas, molhos };
}

/**
 * Monta pratos Massa · Molho · Tamanho a partir do grupo, rateando o valor do item.
 */
export function pratosMontadosDoGrupo(g: GrupoItemSaipos): PratoMontadoSaipos[] {
  const info = classificarItem(g.item);
  const { massas, molhos } = massasMolhosDoGrupo(g);
  const out: PratoMontadoSaipos[] = [];
  const valorGrupo = Number(g.valor) || 0;
  const qtdGrupo = Number(g.qtd) || 0;

  if (info.cat === "PRATO" && info.base === "Risoto") {
    const molho = info.molho || Object.keys(molhos)[0]?.split("\u0000")[0] || "Risoto";
    const tam =
      info.tamanho ||
      Object.keys(molhos)[0]?.split("\u0000")[2] ||
      "RISOTO";
    out.push({
      massa: "Risoto",
      molho,
      tamanho: tam,
      quantidade: qtdGrupo,
      valor: valorGrupo,
      rateio_aproximado: false,
    });
    return out;
  }

  if (info.cat === "PRATO" && info.base === "Polenta") {
    const molho = info.molho || Object.keys(molhos)[0]?.split("\u0000")[0] || "Polenta";
    const tam = info.tamanho || "POLENTA";
    out.push({
      massa: "Polenta",
      molho,
      tamanho: tam,
      quantidade: qtdGrupo,
      valor: valorGrupo,
      rateio_aproximado: false,
    });
    return out;
  }

  // Massas por nome; tamanhos a partir das chaves massa|tam e molho|base|tam
  const massaQtd: Record<string, number> = {};
  const tamQtd: Record<string, number> = {};
  const molhoQtd: Record<string, number> = {};

  for (const ch of Object.keys(massas)) {
    const [massa, tam] = ch.split("\u0000");
    massaQtd[massa] = (massaQtd[massa] || 0) + massas[ch];
    if (tam) tamQtd[tam] = (tamQtd[tam] || 0) + massas[ch];
  }
  for (const ch of Object.keys(molhos)) {
    const [molho, , tam] = ch.split("\u0000");
    molhoQtd[molho] = (molhoQtd[molho] || 0) + molhos[ch];
    if (tam) tamQtd[tam] = (tamQtd[tam] || 0) + molhos[ch];
  }

  if (info.cat === "PRATO" && info.molho && !Object.keys(molhoQtd).length) {
    molhoQtd[info.molho] = qtdGrupo;
  }
  if (info.cat === "PRATO" && info.tamanho && !Object.keys(tamQtd).length) {
    tamQtd[info.tamanho] = qtdGrupo;
  }

  if (!Object.keys(massaQtd).length || !Object.keys(molhoQtd).length) {
    return out;
  }

  // Cruzamento massa × molho × tamanho (via massa×tam e molho, ou tam×massa)
  const cruzMassaTam = Object.keys(tamQtd).length
    ? cruzar(tamQtd, massaQtd)
    : Object.fromEntries(Object.keys(massaQtd).map((m) => [`\u0000${m}`, massaQtd[m]]));

  // cruzMassaTam keys: tam|massa → qtd
  const triplas: { massa: string; molho: string; tamanho: string; qtd: number }[] = [];
  const totalMolho = totalDe(molhoQtd) || 1;

  for (const ch of Object.keys(cruzMassaTam)) {
    const [tam, massa] = ch.split("\u0000");
    const qBase = cruzMassaTam[ch];
    for (const molho of Object.keys(molhoQtd)) {
      const q = (qBase * molhoQtd[molho]) / totalMolho;
      if (q <= 0) continue;
      triplas.push({ massa, molho, tamanho: tam || "", qtd: q });
    }
  }

  // Se um único molho e uma massa, usa qtd da massa por tamanho (evita somar massa+molho).
  if (Object.keys(molhoQtd).length === 1 && Object.keys(massaQtd).length === 1) {
    triplas.length = 0;
    const molho = Object.keys(molhoQtd)[0];
    const massa = Object.keys(massaQtd)[0];
    const tamsDaMassa: Record<string, number> = {};
    for (const ch of Object.keys(massas)) {
      const [m, tam] = ch.split("\u0000");
      if (m !== massa) continue;
      const t = tam || "";
      tamsDaMassa[t] = (tamsDaMassa[t] || 0) + massas[ch];
    }
    if (Object.keys(tamsDaMassa).length) {
      for (const tam of Object.keys(tamsDaMassa)) {
        triplas.push({ massa, molho, tamanho: tam, qtd: tamsDaMassa[tam] });
      }
    } else {
      triplas.push({
        massa,
        molho,
        tamanho: info.cat === "PRATO" ? info.tamanho || "" : "",
        qtd: qtdGrupo || massaQtd[massa],
      });
    }
  }

  const somaQ = triplas.reduce((s, t) => s + t.qtd, 0) || 1;
  const rateio = triplas.length > 1 || info.cat === "COMBO";
  for (const t of triplas) {
    out.push({
      massa: t.massa,
      molho: t.molho,
      tamanho: t.tamanho,
      quantidade: arred(t.qtd),
      valor: arred((valorGrupo * t.qtd) / somaQ),
      rateio_aproximado: rateio,
    });
  }

  return out;
}

export function vendasVazias(): VendasSaipos {
  return {
    itens: [],
    totais: { quantidade_itens: 0, faturamento: 0 },
    por_categoria: {},
    pratos_montados: [],
  };
}

/** Agrega vendas a partir dos grupos do export (ignora opções soltas). */
export function montarVendasSaipos(grupos: GrupoItemSaipos[]): VendasSaipos {
  const mapa = new Map<string, ItemVendaSaipos>();
  const pratosMap = new Map<string, PratoMontadoSaipos>();

  for (const g of grupos) {
    const qtd = Number(g.qtd) || 0;
    const valor = Number(g.valor) || 0;
    if (qtd <= 0 && valor <= 0) continue;
    const categoria = categoriaVendaDoItem(g.item);
    somarItem(mapa, g.item, categoria, qtd, valor);

    for (const p of pratosMontadosDoGrupo(g)) {
      const key = `${p.massa}\u0000${p.molho}\u0000${p.tamanho}`;
      const prev = pratosMap.get(key);
      if (prev) {
        prev.quantidade = arred(prev.quantidade + p.quantidade);
        prev.valor = arred(prev.valor + p.valor);
        prev.rateio_aproximado = prev.rateio_aproximado || p.rateio_aproximado;
      } else {
        pratosMap.set(key, { ...p });
      }
    }
  }

  const itens = [...mapa.values()]
    .map((i) => ({
      ...i,
      quantidade: arred(i.quantidade),
      valor: arred(i.valor),
    }))
    .sort((a, b) => b.valor - a.valor || b.quantidade - a.quantidade);

  const por_categoria: VendasSaipos["por_categoria"] = {};
  let faturamento = 0;
  let quantidade_itens = 0;
  for (const i of itens) {
    faturamento += i.valor;
    quantidade_itens += i.quantidade;
    const slot = por_categoria[i.categoria] ?? { quantidade: 0, valor: 0 };
    slot.quantidade += i.quantidade;
    slot.valor += i.valor;
    por_categoria[i.categoria] = slot;
  }
  for (const c of Object.keys(por_categoria) as CategoriaVendaSaipos[]) {
    const s = por_categoria[c]!;
    s.quantidade = arred(s.quantidade);
    s.valor = arred(s.valor);
  }

  const pratos_montados = [...pratosMap.values()].sort(
    (a, b) => b.quantidade - a.quantidade || b.valor - a.valor
  );

  return {
    itens,
    totais: {
      quantidade_itens: arred(quantidade_itens),
      faturamento: arred(faturamento),
    },
    por_categoria,
    pratos_montados,
  };
}

export function agregarVendasSaipos(lista: VendasSaipos[]): VendasSaipos {
  if (lista.length === 0) return vendasVazias();

  const mapa = new Map<string, ItemVendaSaipos>();
  const pratosMap = new Map<string, PratoMontadoSaipos>();

  for (const v of lista) {
    for (const i of v.itens) {
      somarItem(mapa, i.item, i.categoria, i.quantidade, i.valor);
    }
    for (const p of v.pratos_montados ?? []) {
      const key = `${p.massa}\u0000${p.molho}\u0000${p.tamanho}`;
      const prev = pratosMap.get(key);
      if (prev) {
        prev.quantidade = arred(prev.quantidade + p.quantidade);
        prev.valor = arred(prev.valor + p.valor);
        prev.rateio_aproximado = prev.rateio_aproximado || p.rateio_aproximado;
      } else {
        pratosMap.set(key, { ...p });
      }
    }
  }

  const itens = [...mapa.values()]
    .map((i) => ({
      ...i,
      quantidade: arred(i.quantidade),
      valor: arred(i.valor),
    }))
    .sort((a, b) => b.valor - a.valor || b.quantidade - a.quantidade);

  const por_categoria: VendasSaipos["por_categoria"] = {};
  let faturamento = 0;
  let quantidade_itens = 0;
  for (const i of itens) {
    faturamento += i.valor;
    quantidade_itens += i.quantidade;
    const slot = por_categoria[i.categoria] ?? { quantidade: 0, valor: 0 };
    slot.quantidade += i.quantidade;
    slot.valor += i.valor;
    por_categoria[i.categoria] = slot;
  }
  for (const c of Object.keys(por_categoria) as CategoriaVendaSaipos[]) {
    const s = por_categoria[c]!;
    s.quantidade = arred(s.quantidade);
    s.valor = arred(s.valor);
  }

  return {
    itens,
    totais: {
      quantidade_itens: arred(quantidade_itens),
      faturamento: arred(faturamento),
    },
    por_categoria,
    pratos_montados: [...pratosMap.values()].sort(
      (a, b) => b.quantidade - a.quantidade || b.valor - a.valor
    ),
  };
}

export function parseVendasSaipos(raw: unknown): VendasSaipos | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Partial<VendasSaipos>;
  if (!Array.isArray(o.itens)) return undefined;
  const itens: ItemVendaSaipos[] = [];
  for (const i of o.itens) {
    if (!i || typeof i !== "object") continue;
    const item = String((i as ItemVendaSaipos).item || "");
    if (!item) continue;
    itens.push({
      item,
      categoria: ((i as ItemVendaSaipos).categoria || "outro") as CategoriaVendaSaipos,
      quantidade: Number((i as ItemVendaSaipos).quantidade) || 0,
      valor: Number((i as ItemVendaSaipos).valor) || 0,
    });
  }
  const pratos_montados: PratoMontadoSaipos[] = [];
  if (Array.isArray(o.pratos_montados)) {
    for (const p of o.pratos_montados) {
      if (!p || typeof p !== "object") continue;
      pratos_montados.push({
        massa: String((p as PratoMontadoSaipos).massa || ""),
        molho: String((p as PratoMontadoSaipos).molho || ""),
        tamanho: String((p as PratoMontadoSaipos).tamanho || ""),
        quantidade: Number((p as PratoMontadoSaipos).quantidade) || 0,
        valor: Number((p as PratoMontadoSaipos).valor) || 0,
        rateio_aproximado: Boolean((p as PratoMontadoSaipos).rateio_aproximado),
      });
    }
  }
  return agregarVendasSaipos([
    {
      itens,
      totais: { quantidade_itens: 0, faturamento: 0 },
      por_categoria: {},
      pratos_montados,
    },
  ]);
}

export function tabelaVendasSaipos(vendas: VendasSaipos): Record<string, string | number>[] {
  const fat = vendas.totais.faturamento || 1;
  return vendas.itens.map((i) => ({
    Item: i.item,
    Categoria: ROTULO_CATEGORIA[i.categoria] ?? i.categoria,
    Quantidade: i.quantidade,
    "Faturamento (R$)": i.valor,
    "% do mês": arred((100 * i.valor) / fat, 1),
  }));
}

export function tabelaPratosMontados(vendas: VendasSaipos): Record<string, string | number>[] {
  return vendas.pratos_montados.map((p) => ({
    Massa: p.massa,
    Molho: p.molho,
    Tamanho: rotuloTam(p.tamanho) || p.tamanho || "—",
    Quantidade: p.quantidade,
    "Faturamento (R$)": p.valor,
    Rateio: p.rateio_aproximado ? "aproximado" : "direto",
  }));
}

export function tabelaVendasPorCategoria(vendas: VendasSaipos): Record<string, string | number>[] {
  return (Object.keys(vendas.por_categoria) as CategoriaVendaSaipos[])
    .map((c) => ({
      Categoria: ROTULO_CATEGORIA[c],
      Quantidade: vendas.por_categoria[c]!.quantidade,
      "Faturamento (R$)": vendas.por_categoria[c]!.valor,
    }))
    .sort((a, b) => Number(b["Faturamento (R$)"]) - Number(a["Faturamento (R$)"]));
}

export function abasVendasSaipos(vendas: VendasSaipos): AbaRelatorioSaipos[] {
  const abas: AbaRelatorioSaipos[] = [];
  const tv = tabelaVendasSaipos(vendas);
  if (tv.length) abas.push({ nome: "Vendas", dados: tv });
  const tp = tabelaPratosMontados(vendas);
  if (tp.length) abas.push({ nome: "Pratos montados", dados: tp });
  const tc = tabelaVendasPorCategoria(vendas);
  if (tc.length) abas.push({ nome: "Vendas por categoria", dados: tc });
  return abas;
}

export { ROTULO_CATEGORIA };
