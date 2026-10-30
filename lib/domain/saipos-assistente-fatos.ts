/**
 * Fatos compactos das vendas Saipos arquivadas — base para o assistente
 * (resposta local ou redação via IA). Não inventa números.
 */

import {
  arquivosNoIntervaloMes,
  mesRefValido,
  rotuloMesRef,
  type SaiposConsumoArquivoState,
} from "./saipos-consumo-arquivo";
import type { ItemVendaSaipos, PratoMontadoSaipos } from "./saipos-vendas";

export type SerieItemMes = {
  mes_ref: string;
  item: string;
  quantidade: number;
  valor: number;
};

export type RankingItemPeriodo = {
  item: string;
  categoria: string;
  quantidade: number;
  valor: number;
};

export type DestaqueItem = {
  termo: string;
  criterio: "quantidade" | "valor";
  mes_ref: string;
  item: string;
  quantidade: number;
  valor: number;
};

export type TotaisTamanho = {
  tamanho: string;
  rotulo: string;
  quantidade: number;
  valor: number;
};

export type FatosVendasSaipos = {
  mes_inicio: string;
  mes_fim: string;
  meses_esperados: string[];
  meses_cobertos: string[];
  meses_faltando: string[];
  meses_sem_vendas: string[];
  termo_buscado: string | null;
  tamanho_buscado: string | null;
  serie_item: SerieItemMes[];
  ranking_itens: RankingItemPeriodo[];
  ranking_pratos_montados: {
    rotulo: string;
    quantidade: number;
    valor: number;
  }[];
  totais_periodo: { quantidade: number; faturamento: number };
  totais_por_categoria: { categoria: string; quantidade: number; valor: number }[];
  /** Soma de pratos montados por tamanho (P/G/KIDS). */
  totais_por_tamanho: TotaisTamanho[];
  destaque: DestaqueItem | null;
};

const STOPWORDS = new Set([
  "qual",
  "quais",
  "que",
  "o",
  "a",
  "os",
  "as",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "um",
  "uma",
  "mais",
  "menos",
  "vendeu",
  "venderam",
  "venda",
  "vendas",
  "vendeu",
  "mes",
  "mês",
  "meses",
  "periodo",
  "período",
  "foi",
  "foram",
  "como",
  "estão",
  "estao",
  "top",
  "melhor",
  "pior",
  "quanto",
  "quanta",
  "quantos",
  "quantas",
  "sobre",
  "pra",
  "para",
  "com",
  "sem",
  "por",
  "entre",
  "ate",
  "até",
  "e",
  "ou",
  "item",
  "itens",
  "produto",
  "produtos",
  "prato",
  "pratos",
  "montado",
  "montados",
  "saipos",
]);

function normalizar(txt: string): string {
  return String(txt ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lista YYYY-MM inclusivos entre inicio e fim. */
export function listarMesesNoIntervalo(mesInicio: string, mesFim: string): string[] {
  if (!mesRefValido(mesInicio) || !mesRefValido(mesFim)) return [];
  const [de, ate] = mesInicio <= mesFim ? [mesInicio, mesFim] : [mesFim, mesInicio];
  const out: string[] = [];
  let [y, m] = de.split("-").map(Number);
  const [yF, mF] = ate.split("-").map(Number);
  while (y < yF || (y === yF && m <= mF)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Detecta tamanho Box P/G/Kids na pergunta. */
export function extrairTamanhoPergunta(pergunta: string): string | null {
  const n = normalizar(pergunta);
  if (!n) return null;
  if (/\bbox\s*kids\b|\bkids\b/.test(n)) return "KIDS";
  if (/\bbox\s*g\b|\btamanho\s*g\b|\b800\s*g\b/.test(n)) return "G";
  if (/\bbox\s*p\b|\btamanho\s*p\b|\b450\s*g\b/.test(n)) return "P";
  return null;
}

/** Extrai termo de busca da pergunta (ex.: "tiramisu"). */
export function extrairTermoPergunta(pergunta: string): string | null {
  const n = normalizar(pergunta);
  if (!n) return null;

  const tamanho = extrairTamanhoPergunta(pergunta);
  if (tamanho) return `box ${tamanho.toLowerCase()}`;

  // Categorias conhecidas
  if (/\bbebidas?\b/.test(n)) return "bebida";
  if (/\bsobremesas?\b/.test(n)) return "sobremesa";
  if (/\brisotos?\b/.test(n)) return "risoto";
  if (/\bcombos?\b/.test(n)) return "combo";

  const tokens = n.split(" ").filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  if (tokens.length === 0) return null;
  // Prefere o token mais longo (ex.: tiramisu)
  tokens.sort((a, b) => b.length - a.length);
  return tokens[0] ?? null;
}

function codigoTamanhoDoTermo(termo: string): string | null {
  const t = normalizar(termo);
  if (t === "box g" || t === "g") return "G";
  if (t === "box p" || t === "p") return "P";
  if (t === "box kids" || t === "kids") return "KIDS";
  return null;
}

function itemBateTermo(item: ItemVendaSaipos, termo: string): boolean {
  const t = normalizar(termo);
  if (!t) return false;
  if (t === item.categoria) return true;
  const nome = normalizar(item.item);
  const tam = codigoTamanhoDoTermo(termo);
  if (tam) {
    // Item Saipos às vezes traz "Box G" no nome
    if (tam === "G" && (nome.includes("box g") || nome.includes(" 800"))) return true;
    if (tam === "P" && (nome.includes("box p") || nome.includes(" 450"))) return true;
    if (tam === "KIDS" && nome.includes("kids")) return true;
  }
  return nome.includes(t);
}

function pratoBateTermo(p: PratoMontadoSaipos, termo: string): boolean {
  const t = normalizar(termo);
  if (!t) return false;
  const tam = codigoTamanhoDoTermo(termo);
  if (tam) {
    const pt = String(p.tamanho || "").toUpperCase();
    return pt === tam;
  }
  const rotulo = normalizar(`${p.massa} ${p.molho} ${p.tamanho}`);
  return rotulo.includes(t) || normalizar(p.molho).includes(t) || normalizar(p.massa).includes(t);
}

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function qtdFmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function montarFatosVendas(
  state: SaiposConsumoArquivoState,
  mesInicio: string,
  mesFim: string,
  pergunta = ""
): FatosVendasSaipos {
  const meses_esperados = listarMesesNoIntervalo(mesInicio, mesFim);
  const arquivos = arquivosNoIntervaloMes(state, mesInicio, mesFim);
  const porMes = new Map(arquivos.map((a) => [a.mes_ref, a]));
  const meses_cobertos = meses_esperados.filter((m) => porMes.has(m));
  const meses_faltando = meses_esperados.filter((m) => !porMes.has(m));
  const meses_sem_vendas = meses_cobertos.filter((m) => !porMes.get(m)?.vendas);

  const tamanhoBuscado = extrairTamanhoPergunta(pergunta);
  const termo = extrairTermoPergunta(pergunta);

  const rankingMap = new Map<string, RankingItemPeriodo>();
  const catMap = new Map<string, { quantidade: number; valor: number }>();
  const pratosMap = new Map<string, { quantidade: number; valor: number }>();
  const tamanhoMap = new Map<string, { quantidade: number; valor: number }>();
  const serie_item: SerieItemMes[] = [];
  let qtdTotal = 0;
  let fatTotal = 0;

  for (const mes of meses_cobertos) {
    const arq = porMes.get(mes)!;
    const vendas = arq.vendas;
    if (!vendas) continue;

    for (const item of vendas.itens) {
      qtdTotal += item.quantidade;
      fatTotal += item.valor;
      const key = item.item;
      const prev = rankingMap.get(key);
      if (prev) {
        prev.quantidade += item.quantidade;
        prev.valor += item.valor;
      } else {
        rankingMap.set(key, {
          item: item.item,
          categoria: item.categoria,
          quantidade: item.quantidade,
          valor: item.valor,
        });
      }
      const c = catMap.get(item.categoria) ?? { quantidade: 0, valor: 0 };
      c.quantidade += item.quantidade;
      c.valor += item.valor;
      catMap.set(item.categoria, c);

      if (termo && itemBateTermo(item, termo)) {
        serie_item.push({
          mes_ref: mes,
          item: item.item,
          quantidade: item.quantidade,
          valor: item.valor,
        });
      }
    }

    for (const p of vendas.pratos_montados ?? []) {
      const rotulo = `${p.massa} · ${p.molho} · ${p.tamanho || "—"}`;
      const prev = pratosMap.get(rotulo) ?? { quantidade: 0, valor: 0 };
      prev.quantidade += p.quantidade;
      prev.valor += p.valor;
      pratosMap.set(rotulo, prev);

      const tamKey = String(p.tamanho || "").toUpperCase() || "?";
      const tt = tamanhoMap.get(tamKey) ?? { quantidade: 0, valor: 0 };
      tt.quantidade += p.quantidade;
      tt.valor += p.valor;
      tamanhoMap.set(tamKey, tt);

      if (termo && pratoBateTermo(p, termo)) {
        serie_item.push({
          mes_ref: mes,
          item: rotulo,
          quantidade: p.quantidade,
          valor: p.valor,
        });
      }
    }
  }

  // Agrega série por mês+item quando vários itens batem o termo no mesmo mês
  const serieAgg = new Map<string, SerieItemMes>();
  for (const s of serie_item) {
    const key = `${s.mes_ref}::${s.item}`;
    const prev = serieAgg.get(key);
    if (prev) {
      prev.quantidade += s.quantidade;
      prev.valor += s.valor;
    } else {
      serieAgg.set(key, { ...s });
    }
  }
  const serieFinal = Array.from(serieAgg.values()).sort((a, b) => a.mes_ref.localeCompare(b.mes_ref));

  // Destaque: soma por mês do termo e pega o maior
  let destaque: DestaqueItem | null = null;
  if (termo && serieFinal.length) {
    const porMesTermo = new Map<string, { quantidade: number; valor: number; item: string }>();
    for (const s of serieFinal) {
      const prev = porMesTermo.get(s.mes_ref) ?? { quantidade: 0, valor: 0, item: s.item };
      prev.quantidade += s.quantidade;
      prev.valor += s.valor;
      if (s.quantidade >= prev.quantidade) prev.item = s.item;
      porMesTermo.set(s.mes_ref, prev);
    }
    let melhorMes = "";
    let melhorQ = -1;
    let melhorV = -1;
    let melhorItem = "";
    for (const [mes, d] of Array.from(porMesTermo.entries())) {
      if (d.quantidade > melhorQ || (d.quantidade === melhorQ && d.valor > melhorV)) {
        melhorMes = mes;
        melhorQ = d.quantidade;
        melhorV = d.valor;
        melhorItem = d.item;
      }
    }
    if (melhorMes) {
      destaque = {
        termo,
        criterio: "quantidade",
        mes_ref: melhorMes,
        item: melhorItem,
        quantidade: melhorQ,
        valor: melhorV,
      };
    }
  }

  const ranking_itens = Array.from(rankingMap.values())
    .map((r) => ({
      ...r,
      quantidade: Math.round(r.quantidade * 100) / 100,
      valor: Math.round(r.valor * 100) / 100,
    }))
    .sort((a, b) => b.valor - a.valor || b.quantidade - a.quantidade)
    .slice(0, 15);

  const ranking_pratos_montados = Array.from(pratosMap.entries())
    .map(([rotulo, v]) => ({
      rotulo,
      quantidade: Math.round(v.quantidade * 100) / 100,
      valor: Math.round(v.valor * 100) / 100,
    }))
    .sort((a, b) => b.quantidade - a.quantidade || b.valor - a.valor)
    .slice(0, 10);

  const totais_por_categoria = Array.from(catMap.entries())
    .map(([categoria, v]) => ({
      categoria,
      quantidade: Math.round(v.quantidade * 100) / 100,
      valor: Math.round(v.valor * 100) / 100,
    }))
    .sort((a, b) => b.valor - a.valor);

  const rotuloTam = (t: string) =>
    t === "G" ? "Box G" : t === "P" ? "Box P" : t === "KIDS" ? "Box Kids" : t;

  const totais_por_tamanho: TotaisTamanho[] = Array.from(tamanhoMap.entries())
    .map(([tamanho, v]) => ({
      tamanho,
      rotulo: rotuloTam(tamanho),
      quantidade: Math.round(v.quantidade * 100) / 100,
      valor: Math.round(v.valor * 100) / 100,
    }))
    .sort((a, b) => b.quantidade - a.quantidade);

  // Para tamanho (Box G), destaque = total do período (não só um mês)
  let destaqueFinal = destaque;
  if (tamanhoBuscado && !destaqueFinal) {
    const tot = totais_por_tamanho.find((t) => t.tamanho === tamanhoBuscado);
    if (tot && tot.quantidade > 0) {
      destaqueFinal = {
        termo: tot.rotulo,
        criterio: "quantidade",
        mes_ref: meses_cobertos[meses_cobertos.length - 1] || mesInicio,
        item: tot.rotulo,
        quantidade: tot.quantidade,
        valor: tot.valor,
      };
    }
  }

  return {
    mes_inicio: mesInicio <= mesFim ? mesInicio : mesFim,
    mes_fim: mesInicio <= mesFim ? mesFim : mesInicio,
    meses_esperados,
    meses_cobertos,
    meses_faltando,
    meses_sem_vendas,
    termo_buscado: termo,
    tamanho_buscado: tamanhoBuscado,
    serie_item: serieFinal.map((s) => ({
      ...s,
      quantidade: Math.round(s.quantidade * 100) / 100,
      valor: Math.round(s.valor * 100) / 100,
    })),
    ranking_itens,
    ranking_pratos_montados,
    totais_periodo: {
      quantidade: Math.round(qtdTotal * 100) / 100,
      faturamento: Math.round(fatTotal * 100) / 100,
    },
    totais_por_categoria,
    totais_por_tamanho,
    destaque: destaqueFinal,
  };
}

export function responderFatosDeterministico(pergunta: string, fatos: FatosVendasSaipos): string {
  const linhas: string[] = [];
  const n = normalizar(pergunta);

  if (fatos.meses_cobertos.length === 0) {
    return "Não há meses arquivados nesse intervalo. Importe o Excel do Saipos e use Confirmar e arquivar em cada mês.";
  }

  if (fatos.meses_faltando.length) {
    linhas.push(
      `Meses sem arquivo no intervalo: ${fatos.meses_faltando.map(rotuloMesRef).join(", ")}.`
    );
  }
  if (fatos.meses_sem_vendas.length) {
    linhas.push(
      `Arquivados sem faturamento (reimporte o Excel): ${fatos.meses_sem_vendas.map(rotuloMesRef).join(", ")}.`
    );
  }

  const perguntaTop = /\btop\b|\bmaiores\b|\branking\b/.test(n);
  const perguntaBebida = /\bbebidas?\b/.test(n);
  const perguntaPrato = /\bpratos?\b/.test(n) && /\bmontad/.test(n);
  const perguntaMais = /\bmais\b|\bmelhor\b|\bmaior\b/.test(n);
  const perguntaQuantos = /\bquantos?\b|\bquantas?\b/.test(n);

  // Box G / Box P / Kids — total do período
  if (fatos.tamanho_buscado) {
    const tot = (fatos.totais_por_tamanho ?? []).find((t) => t.tamanho === fatos.tamanho_buscado);
    if (tot && tot.quantidade > 0) {
      linhas.push(
        `No período ${rotuloMesRef(fatos.mes_inicio)} → ${rotuloMesRef(fatos.mes_fim)} foram ${qtdFmt(tot.quantidade)} porções ${tot.rotulo} (faturamento rateado ≈ ${moeda(tot.valor)}), somando os pratos montados dos meses arquivados.`
      );
      if (fatos.serie_item.length) {
        const porMes = new Map<string, { q: number; v: number }>();
        for (const s of fatos.serie_item) {
          const p = porMes.get(s.mes_ref) ?? { q: 0, v: 0 };
          p.q += s.quantidade;
          p.v += s.valor;
          porMes.set(s.mes_ref, p);
        }
        const bullets = Array.from(porMes.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([m, p]) => `• ${rotuloMesRef(m)}: ${qtdFmt(p.q)} · ${moeda(p.v)}`);
        linhas.push(bullets.join("\n"));
      }
    } else {
      linhas.push(
        `Não achei porções ${fatos.termo_buscado ?? "desse tamanho"} nos pratos montados do período. Confira se os meses foram arquivados com a planilha completa (depois da atualização de vendas).`
      );
    }
  } else if (fatos.destaque && (perguntaMais || (fatos.termo_buscado && !perguntaQuantos))) {
    const d = fatos.destaque;
    linhas.push(
      `Para “${d.termo}”, o mês com mais vendas foi ${rotuloMesRef(d.mes_ref)}: ${qtdFmt(d.quantidade)} un. de “${d.item}” (${moeda(d.valor)}).`
    );
    if (fatos.serie_item.length > 1) {
      const porMes = new Map<string, { q: number; v: number }>();
      for (const s of fatos.serie_item) {
        const p = porMes.get(s.mes_ref) ?? { q: 0, v: 0 };
        p.q += s.quantidade;
        p.v += s.valor;
        porMes.set(s.mes_ref, p);
      }
      const bullets = Array.from(porMes.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([m, p]) => `• ${rotuloMesRef(m)}: ${qtdFmt(p.q)} un. · ${moeda(p.v)}`);
      linhas.push(bullets.join("\n"));
    }
  } else if (
    fatos.termo_buscado &&
    fatos.serie_item.length === 0 &&
    !perguntaTop &&
    !perguntaBebida &&
    !perguntaPrato
  ) {
    linhas.push(
      `Não encontrei “${fatos.termo_buscado}” nas vendas dos meses arquivados nesse intervalo. Confira o nome do item no Saipos ou se o mês tem faturamento arquivado.`
    );
  } else if (fatos.termo_buscado && fatos.serie_item.length > 0 && perguntaQuantos) {
    const q = fatos.serie_item.reduce((s, i) => s + i.quantidade, 0);
    const v = fatos.serie_item.reduce((s, i) => s + i.valor, 0);
    linhas.push(
      `No período: ${qtdFmt(q)} un. relacionadas a “${fatos.termo_buscado}” (${moeda(v)}).`
    );
  }

  if (perguntaBebida) {
    const beb = fatos.totais_por_categoria.find((c) => c.categoria === "bebida");
    if (beb) {
      linhas.push(`Bebidas no período: ${qtdFmt(beb.quantidade)} un. · ${moeda(beb.valor)}.`);
    } else {
      linhas.push("Não há itens classificados como bebida nesse intervalo.");
    }
    const topBeb = fatos.ranking_itens.filter((i) => i.categoria === "bebida").slice(0, 5);
    if (topBeb.length) {
      linhas.push(
        topBeb.map((i, idx) => `${idx + 1}. ${i.item}: ${qtdFmt(i.quantidade)} · ${moeda(i.valor)}`).join("\n")
      );
    }
  }

  if (perguntaPrato) {
    const top = fatos.ranking_pratos_montados[0];
    if (top) {
      linhas.push(
        `Prato montado que mais saiu: ${top.rotulo} — ${qtdFmt(top.quantidade)} porções (${moeda(top.valor)}).`
      );
      linhas.push(
        fatos.ranking_pratos_montados
          .slice(0, 5)
          .map((p, i) => `${i + 1}. ${p.rotulo}: ${qtdFmt(p.quantidade)} · ${moeda(p.valor)}`)
          .join("\n")
      );
    } else {
      linhas.push("Não há pratos montados nos meses com vendas arquivadas.");
    }
  }

  if (perguntaTop || (!fatos.destaque && !perguntaBebida && !perguntaPrato && !fatos.termo_buscado)) {
    linhas.push(
      `Período ${rotuloMesRef(fatos.mes_inicio)} → ${rotuloMesRef(fatos.mes_fim)}: ${qtdFmt(fatos.totais_periodo.quantidade)} un. · faturamento ${moeda(fatos.totais_periodo.faturamento)}.`
    );
    if (fatos.ranking_itens.length) {
      linhas.push("Top itens por faturamento:");
      linhas.push(
        fatos.ranking_itens
          .slice(0, 5)
          .map((i, idx) => `${idx + 1}. ${i.item}: ${qtdFmt(i.quantidade)} · ${moeda(i.valor)}`)
          .join("\n")
      );
    }
  }

  if (linhas.length === 0) {
    linhas.push(
      `No período há ${fatos.meses_cobertos.length} mês(es) arquivado(s), faturamento ${moeda(fatos.totais_periodo.faturamento)}. Faça uma pergunta mais específica (ex.: “qual mês vendeu mais tiramisu?”).`
    );
  }

  return linhas.join("\n\n");
}

/** Snapshot mínimo enviado à API (sem Excel bruto). */