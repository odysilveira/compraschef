/**
 * Leitura do relatório "Itens vendidos" do Saipos (Agrupar opções por produto).
 * Porte do MotorSaipos do relatoriopratos, com gramatura preferindo fichas técnicas.
 */

import * as XLSX from "xlsx";
import type { DB } from "@/lib/types";

export const MOLHOS = [
  "Cheddar com Carne e Bacon",
  "Cheddar com Bacon",
  "Frango com Requeijao Cremoso",
  "Frango Desfiado",
  "Frango Cremoso",
  "Ragu de Costela",
  "Camarao Rose",
  "Quatro Queijos",
  "Carne Moida",
  "Parisiense",
  "Bolonhesa",
  "Pomodoro",
  "Broccoli",
  "Camarao",
  "Funghi",
  "Vegano",
  "Frango",
] as const;

export const APELIDOS_MOLHO: Record<string, string> = {
  Camarao: "Camarao Rose",
  "Frango Cremoso": "Frango com Requeijao Cremoso",
};

export const MASSAS = [
  "Nhoque Recheado de Mucarela",
  "Nhoque Tradicional",
  "Espaguete Grano Duro",
  "Massa Konjac",
  "Penne Integral",
  "Caracolino",
  "Talharim",
  "Penne",
] as const;

export const TAMANHOS: Record<string, string> = {
  P: "Box P (450g)",
  G: "Box G (800g)",
  KIDS: "Box Kids",
  RISOTO: "Risoto (650g)",
  POLENTA: "Polenta (450g)",
  SALADA: "Salada fria (400g)",
};

/** Fallback quando não há gramatura na ficha técnica. */
export const FICHA_MASSA_CRUA_G: Record<string, Partial<Record<string, number>>> = {
  Talharim: { P: 125, G: 250, KIDS: 80 },
  Penne: { P: 120, G: 240, KIDS: 80 },
  "Penne Integral": { P: 120, G: 240, KIDS: 80 },
  Caracolino: { P: 120, G: 240, KIDS: 80 },
  "Nhoque Tradicional": { P: 125, G: 250, KIDS: 80 },
  "Nhoque Recheado de Mucarela": { P: 125, G: 250, KIDS: 80 },
  "Espaguete Grano Duro": { P: 120, G: 240, KIDS: 80, SALADA: 100 },
  "Massa Konjac": { P: 200, G: 400, KIDS: 100 },
};

const PREFIXOS_CATEGORIA = ["Diversos"];
const BEBIDAS_CHAVE = [
  "coca",
  "sprite",
  "fanta",
  "guarana",
  "refrigerante",
  "suco",
  "sucos",
  "agua",
  "energetico",
  "monster",
  "del valle",
  "nectar",
  "cerveja",
  "heineken",
  "tonica",
  "ice tea",
  "cha ",
];
const SOBREMESAS_CHAVE = [
  "cannoli",
  "brownie",
  "tiramisu",
  "pudim",
  "petit gateau",
  "sobremesa",
  "crostini",
  "acompanhamento",
  "palha italiana",
];
const NAO_CONSUMO_CHAVE = [
  "nao preciso de talheres",
  "preciso de talheres",
  "opcao vegetariana",
  "chaveiro",
  "sem cebola",
  "sem queijo",
  "observacao",
  "retirar",
];
const SACHES_CHAVE = ["pimenta do reino", "sal refinado", "sache", "azeite", "molho de pimenta"];
const BASES = ["Macarrao", "Nhoque", "Risoto", "Polenta", "Salada", "Lasanha", "Panqueca"];
const LINHA_IGNORAR = [
  "data inicial",
  "data final",
  "turno",
  "tipo",
  "codigo",
  "itens e opcoes",
  "itens",
  "item de opcao",
  "quantidade",
  "valor total",
  "percentual",
  "metodo de calculo",
];

const SEP = "\u0000";

export type FormatoExportSaipos = "hierarquico" | "plano";

export interface OpcaoGrupoSaipos {
  nome: string;
  qtd: number;
  valor: number;
}

export interface GrupoItemSaipos {
  item: string;
  qtd: number;
  valor: number;
  opcoes: OpcaoGrupoSaipos[];
}

export interface DivergenciaSaipos {
  Tipo: string;
  Item: string;
  Verificacao: string;
  "Qtd do item": number;
  "Soma das opcoes": number;
}

export interface ResultadoConsolidadoSaipos {
  molhoMassa: Record<string, number>;
  molhoTamanho: Record<string, number>;
  massaTamanho: Record<string, number>;
  risotos: Record<string, number>;
  extrasPrato: Record<string, number>;
  extras: Record<string, number>;
  bebidas: Record<string, number>;
  bebidasProduto: Record<string, number>;
  sobremesas: Record<string, number>;
  saches: Record<string, number>;
  observacoes: Record<string, number>;
  combos: Record<string, number>;
  promocoes: Record<string, number>;
  naoClassificado: Record<string, number>;
  divergencias: DivergenciaSaipos[];
  exatoMolhoMassa: boolean;
  semCruzamento: boolean;
  qtdRateada: number;
}

export interface AbaRelatorioSaipos {
  nome: string;
  dados: Record<string, string | number>[];
}

export interface RelatorioItensVendidosSaipos {
  resultado: ResultadoConsolidadoSaipos;
  formato: FormatoExportSaipos;
  periodo: string | null;
  totalItens: number;
  totalOpcoes: number;
  abas: AbaRelatorioSaipos[];
  nomeArquivo: string;
}

export function semAcento(txt: string): string {
  return String(txt)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function limpar(txt: unknown): string {
  let t = String(txt ?? "")
    .replace(/\t/g, " ")
    .replace(/\u00a0/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/\s*-?\s*Vale muito a pena!?/gi, "");
  t = t.replace(/^[\s-]+|[\s-]+$/g, "");
  for (const pref of PREFIXOS_CATEGORIA) {
    t = t.replace(new RegExp(`^${pref}\\s*-\\s*`, "i"), "").trim();
  }
  return t;
}

export function chave(txt: unknown): string {
  return semAcento(limpar(txt)).toLowerCase().replace(/\s+/g, " ").trim();
}

function extrairGramatura(nome: string): number | null {
  let m = /aprox\.?\s*(\d{2,4})\s*g/i.exec(nome);
  if (m) return parseInt(m[1], 10);
  m = /\b(\d{3,4})\s*g\b/i.exec(nome);
  return m ? parseInt(m[1], 10) : null;
}

export function detectarTamanho(nome: string, base: string | null): string | null {
  const k = chave(nome);
  if (k.includes("box kids") || k.includes("(kids)")) return "KIDS";
  if (k.includes("box g") || k.includes("(box g)")) return "G";
  if (k.includes("box p") || k.includes("(box p)")) return "P";
  if (base === "Risoto") return "RISOTO";
  if (base === "Polenta") return "POLENTA";
  if (base === "Salada") return "SALADA";
  const g = extrairGramatura(nome);
  if (g !== null) {
    if (g >= 700) return "G";
    if (g >= 600) return "RISOTO";
    if (g >= 350) return "P";
    return "KIDS";
  }
  return null;
}

export function rotuloTam(tam: string | null | undefined): string {
  if (!tam) return "nao informado";
  return TAMANHOS[tam] || tam;
}

export function casarLista(nome: string, lista: readonly string[]): string | null {
  const k = chave(nome);
  for (const item of lista) {
    if (k.includes(chave(item))) return item;
  }
  return null;
}

function contemAlguma(nome: string, palavras: string[]): boolean {
  const k = chave(nome);
  return palavras.some((p) => k.includes(p));
}

function detectarBase(nome: string): string | null {
  const k = chave(nome);
  for (const b of BASES) {
    if (k.indexOf(chave(b)) === 0) return b;
  }
  return null;
}

function paraNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isNaN(n) ? null : Math.round(n);
}

function soma(mapa: Record<string, number>, chaveTxt: string, valor: number): void {
  mapa[chaveTxt] = (mapa[chaveTxt] || 0) + valor;
}

export function totalDe(mapa: Record<string, number>): number {
  let t = 0;
  for (const k of Object.keys(mapa)) t += mapa[k];
  return t;
}

function cruzar(pesos: Record<string, number>, quantidades: Record<string, number>): Record<string, number> {
  const totalPesos = totalDe(pesos);
  const saida: Record<string, number> = {};
  if (!totalPesos) return saida;
  for (const p of Object.keys(pesos)) {
    for (const q of Object.keys(quantidades)) {
      const ch = `${p}${SEP}${q}`;
      saida[ch] = (saida[ch] || 0) + (quantidades[q] * pesos[p]) / totalPesos;
    }
  }
  return saida;
}

type ColCfg = { nome: number; qtd: number; valor: number | null; inicio: number };

function lerHierarquico(matriz: unknown[][], cfg: ColCfg): GrupoItemSaipos[] {
  const grupos: GrupoItemSaipos[] = [];
  let atual: GrupoItemSaipos | null = null;
  for (let i = cfg.inicio; i < matriz.length; i++) {
    const linha = matriz[i] || [];
    const cru = linha[cfg.nome];
    if (cru === null || cru === undefined || cru === "") continue;
    const texto = String(cru).replace(/\t/g, " ").trim();
    if (!texto || LINHA_IGNORAR.includes(chave(texto))) continue;
    const eOpcao = texto.charAt(0) === "-";
    const nome = limpar(texto);
    if (!nome) continue;
    const q = paraNumero(linha[cfg.qtd]);
    if (q === null) continue;
    let v = 0;
    if (cfg.valor !== null && typeof linha[cfg.valor] === "number") v = linha[cfg.valor] as number;
    if (eOpcao) {
      if (atual) atual.opcoes.push({ nome, qtd: q, valor: v });
    } else {
      atual = { item: nome, qtd: q, valor: v, opcoes: [] };
      grupos.push(atual);
    }
  }
  return grupos;
}

function lerPlano(
  matriz: unknown[][],
  tabelas: Record<string, ColCfg>
): { grupos: GrupoItemSaipos[]; soltas: OpcaoGrupoSaipos[] } {
  const inicios = Object.values(tabelas)
    .map((t) => t.inicio)
    .sort((a, b) => a - b);
  inicios.push(matriz.length + 1);
  const saida: Record<string, OpcaoGrupoSaipos[]> = {};
  for (const [rotulo, cfg] of Object.entries(tabelas)) {
    let fim = matriz.length + 1;
    for (const ini of inicios) {
      if (ini > cfg.inicio) {
        fim = ini;
        break;
      }
    }
    const regs: OpcaoGrupoSaipos[] = [];
    for (let i = cfg.inicio; i < fim - 1 && i < matriz.length; i++) {
      const linha = matriz[i] || [];
      let nome = linha[cfg.nome];
      if (nome === null || nome === undefined || nome === "") continue;
      nome = limpar(nome);
      if (!nome || LINHA_IGNORAR.includes(chave(nome))) continue;
      const q = paraNumero(linha[cfg.qtd]);
      if (q === null) continue;
      let v = 0;
      if (cfg.valor !== null && typeof linha[cfg.valor] === "number") v = linha[cfg.valor] as number;
      regs.push({ nome, qtd: q, valor: v });
    }
    saida[rotulo] = regs;
  }
  const grupos = (saida.itens || []).map((r) => ({
    item: r.nome,
    qtd: r.qtd,
    valor: r.valor,
    opcoes: [] as OpcaoGrupoSaipos[],
  }));
  return { grupos, soltas: saida.opcoes || [] };
}

export function lerExport(matriz: unknown[][]): {
  grupos: GrupoItemSaipos[];
  soltas: OpcaoGrupoSaipos[];
  formato: FormatoExportSaipos;
} {
  let hier: ColCfg | null = null;
  const tabelas: Record<string, ColCfg> = {};

  for (let idx = 0; idx < matriz.length; idx++) {
    const linha = matriz[idx] || [];
    const celulas = linha.map((c) => (c === null || c === undefined ? "" : chave(c)));
    const colQtd = celulas.indexOf("quantidade");
    if (colQtd < 0) continue;
    let colValor: number | null = null;
    for (let j = 0; j < celulas.length; j++) {
      if (celulas[j].indexOf("valor total") === 0) colValor = j;
    }
    for (let j = 0; j < celulas.length; j++) {
      const c = celulas[j];
      if (c === "itens e opcoes" || c === "item e opcao") {
        hier = { nome: j, qtd: colQtd, valor: colValor, inicio: idx + 1 };
      } else if (c === "itens" || c === "item") {
        tabelas.itens = { nome: j, qtd: colQtd, valor: colValor, inicio: idx + 1 };
      } else if (c === "item de opcao" || c === "itens de opcao" || c === "opcao") {
        tabelas.opcoes = { nome: j, qtd: colQtd, valor: colValor, inicio: idx + 1 };
      }
    }
  }

  if (hier) {
    return { grupos: lerHierarquico(matriz, hier), soltas: [], formato: "hierarquico" };
  }
  if (tabelas.itens && tabelas.opcoes) {
    const r = lerPlano(matriz, tabelas);
    return { grupos: r.grupos, soltas: r.soltas, formato: "plano" };
  }
  throw new Error(
    'Não reconheci o layout da planilha. Esperava a coluna "Itens e Opções" ou as tabelas "Itens" e "Item de opção". Confira se o arquivo é o relatório Itens vendidos exportado do Saipos.'
  );
}

type ClassifItem =
  | { cat: "COMBO" }
  | { cat: "PRATO"; base: string; molho: string | null; tamanho: string | null }
  | { cat: "SACHE" | "SOBREMESA" | "BEBIDA" | "OUTRO" };

type ClassifOpcao =
  | { cat: "EXTRA" | "OBSERVACAO" | "SACHE" | "SOBREMESA" | "BEBIDA" | "NAO_CLASSIFICADO" }
  | { cat: "MASSA"; massa: string; tamanho: string | null }
  | { cat: "MOLHO"; molho: string; base: string | null; tamanho: string | null };

export function classificarItem(nome: string): ClassifItem {
  const k = chave(nome);
  if (k.indexOf("combo") === 0 || k.indexOf("compre ") === 0) return { cat: "COMBO" };
  const base = detectarBase(nome);
  if (base) {
    return {
      cat: "PRATO",
      base,
      molho: casarLista(nome, MOLHOS),
      tamanho: detectarTamanho(nome, base),
    };
  }
  if (contemAlguma(nome, SACHES_CHAVE)) return { cat: "SACHE" };
  if (contemAlguma(nome, SOBREMESAS_CHAVE)) return { cat: "SOBREMESA" };
  if (contemAlguma(nome, BEBIDAS_CHAVE)) return { cat: "BEBIDA" };
  return { cat: "OUTRO" };
}

export function classificarOpcao(nome: string): ClassifOpcao {
  const k = chave(nome);
  if (k.indexOf("extra") === 0 || k.indexOf("adicional") === 0 || k.includes("porcao extra")) {
    return { cat: "EXTRA" };
  }
  if (contemAlguma(nome, NAO_CONSUMO_CHAVE)) return { cat: "OBSERVACAO" };
  if (contemAlguma(nome, SACHES_CHAVE)) return { cat: "SACHE" };
  const massa = casarLista(nome, MASSAS);
  if (massa) return { cat: "MASSA", massa, tamanho: detectarTamanho(nome, null) };
  if (contemAlguma(nome, SOBREMESAS_CHAVE)) return { cat: "SOBREMESA" };
  if (contemAlguma(nome, BEBIDAS_CHAVE)) return { cat: "BEBIDA" };
  const base = detectarBase(nome);
  let molho = casarLista(nome, MOLHOS);
  if (molho) {
    if (k.includes("box") && APELIDOS_MOLHO[molho]) molho = APELIDOS_MOLHO[molho];
    return { cat: "MOLHO", molho, base, tamanho: detectarTamanho(nome, base) };
  }
  return { cat: "NAO_CLASSIFICADO" };
}

export function consolidar(grupos: GrupoItemSaipos[], soltas: OpcaoGrupoSaipos[]): ResultadoConsolidadoSaipos {
  const r: ResultadoConsolidadoSaipos = {
    molhoMassa: {},
    molhoTamanho: {},
    massaTamanho: {},
    risotos: {},
    extrasPrato: {},
    extras: {},
    bebidas: {},
    bebidasProduto: {},
    sobremesas: {},
    saches: {},
    observacoes: {},
    combos: {},
    promocoes: {},
    naoClassificado: {},
    divergencias: [],
    exatoMolhoMassa: true,
    semCruzamento: false,
    qtdRateada: 0,
  };

  function processarOpcoes(g: GrupoItemSaipos, rotuloPrato: string) {
    const massas: Record<string, number> = {};
    const molhos: Record<string, number> = {};
    for (const o of g.opcoes) {
      const c = classificarOpcao(o.nome);
      const q = o.qtd;
      if (c.cat === "MASSA") soma(massas, `${c.massa}${SEP}${c.tamanho || ""}`, q);
      else if (c.cat === "MOLHO")
        soma(molhos, `${c.molho}${SEP}${c.base || ""}${SEP}${c.tamanho || ""}`, q);
      else if (c.cat === "EXTRA") {
        soma(r.extras, o.nome, q);
        soma(r.extrasPrato, `${rotuloPrato}${SEP}${o.nome}`, q);
      } else if (c.cat === "BEBIDA") soma(r.bebidas, o.nome, q);
      else if (c.cat === "SOBREMESA") soma(r.sobremesas, o.nome, q);
      else if (c.cat === "SACHE") soma(r.saches, o.nome, q);
      else if (c.cat === "OBSERVACAO") soma(r.observacoes, o.nome, q);
      else soma(r.naoClassificado, o.nome, q);
    }
    return { massas, molhos };
  }

  for (const g of grupos) {
    const info = classificarItem(g.item);
    const cat = info.cat;
    const qtd = g.qtd;
    const molhoNasOpcoes = g.opcoes.some((o) => classificarOpcao(o.nome).cat === "MOLHO");
    const composto =
      cat === "COMBO" || (molhoNasOpcoes && !(cat === "PRATO" && info.cat === "PRATO" && info.molho));

    if (composto) {
      if (cat === "COMBO") soma(r.combos, g.item, qtd);
      else soma(r.promocoes, g.item, qtd);
      const res = processarOpcoes(g, g.item);
      const mSimples: Record<string, number> = {};
      const maSimples: Record<string, number> = {};
      for (const ch of Object.keys(res.molhos)) {
        const [molho, baseOp, tam] = ch.split(SEP);
        const q = res.molhos[ch];
        if (baseOp === "Risoto" || baseOp === "Polenta") {
          soma(r.molhoTamanho, `${molho}${SEP}${baseOp}${SEP}${tam}`, q);
          if (baseOp === "Risoto") soma(r.risotos, molho, q);
          continue;
        }
        soma(mSimples, molho, q);
        soma(
          r.molhoTamanho,
          `${molho}${SEP}${cat === "COMBO" ? "Combo" : "Promocao"}${SEP}${tam}`,
          q
        );
      }
      for (const ch of Object.keys(res.massas)) {
        const [massa] = ch.split(SEP);
        soma(maSimples, massa, res.massas[ch]);
        soma(r.massaTamanho, ch, res.massas[ch]);
      }
      if (Object.keys(mSimples).length > 1 && Object.keys(maSimples).length > 1) {
        r.exatoMolhoMassa = false;
        r.qtdRateada += totalDe(maSimples);
      }
      const cruz = cruzar(mSimples, maSimples);
      for (const ch of Object.keys(cruz)) soma(r.molhoMassa, ch, cruz[ch]);
      continue;
    }

    if (cat === "PRATO" && info.molho) {
      const molho = info.molho;
      const base = info.base;
      const res2 = processarOpcoes(g, `${base} ${molho}`);
      const tamQtd: Record<string, number> = {};

      if (Object.keys(res2.molhos).length) {
        for (const ch of Object.keys(res2.molhos)) {
          const tam = ch.split(SEP)[2];
          const q = res2.molhos[ch];
          soma(tamQtd, tam, q);
          soma(r.molhoTamanho, `${molho}${SEP}${base}${SEP}${tam}`, q);
        }
        const somaTam = totalDe(tamQtd);
        if (somaTam !== qtd) {
          r.divergencias.push({
            Tipo: "erro",
            Item: g.item,
            Verificacao: "tamanhos",
            "Qtd do item": qtd,
            "Soma das opcoes": somaTam,
          });
        }
      } else if (info.tamanho !== null) {
        tamQtd[info.tamanho] = qtd;
        soma(r.molhoTamanho, `${molho}${SEP}${base}${SEP}${info.tamanho}`, qtd);
      } else if (g.opcoes.length) {
        tamQtd[""] = qtd;
        soma(r.molhoTamanho, `${molho}${SEP}${base}${SEP}`, qtd);
      }

      if (Object.keys(res2.massas).length) {
        const massaQtd: Record<string, number> = {};
        for (const ch of Object.keys(res2.massas)) {
          soma(massaQtd, ch.split(SEP)[0], res2.massas[ch]);
        }
        const somaMassa = totalDe(massaQtd);
        if (somaMassa !== qtd) {
          r.divergencias.push({
            Tipo: "erro",
            Item: g.item,
            Verificacao: "massas",
            "Qtd do item": qtd,
            "Soma das opcoes": somaMassa,
          });
        }
        for (const m of Object.keys(massaQtd)) soma(r.molhoMassa, `${molho}${SEP}${m}`, massaQtd[m]);
        const cruz2 = cruzar(tamQtd, massaQtd);
        for (const ch of Object.keys(cruz2)) {
          const [tam, massa] = ch.split(SEP);
          soma(r.massaTamanho, `${massa}${SEP}${tam}`, cruz2[ch]);
        }
      }
      if (base === "Risoto") soma(r.risotos, molho, qtd);
      continue;
    }

    if (cat !== "PRATO") {
      const molhoNome = casarLista(g.item, MOLHOS);
      const massaNome = casarLista(g.item, MASSAS);
      if (molhoNome && massaNome) {
        const tamN = detectarTamanho(g.item, null) || "P";
        processarOpcoes(g, g.item);
        soma(r.molhoTamanho, `${molhoNome}${SEP}Promocao${SEP}${tamN}`, qtd);
        soma(r.massaTamanho, `${massaNome}${SEP}${tamN}`, qtd);
        soma(r.molhoMassa, `${molhoNome}${SEP}${massaNome}`, qtd);
        soma(r.promocoes, g.item, qtd);
        continue;
      }
    }

    processarOpcoes(g, g.item);
    let opcBebida = 0;
    let opcSobrem = 0;
    for (const o of g.opcoes) {
      const c = classificarOpcao(o.nome);
      if (c.cat === "BEBIDA") opcBebida += o.qtd;
      if (c.cat === "SOBREMESA") opcSobrem += o.qtd;
    }

    if (cat === "BEBIDA") {
      soma(r.bebidasProduto, g.item, qtd);
      if (opcBebida) {
        if (opcBebida !== qtd) {
          r.divergencias.push({
            Tipo: "informativo",
            Item: g.item,
            Verificacao: "produto x sabor",
            "Qtd do item": qtd,
            "Soma das opcoes": opcBebida,
          });
        }
      } else soma(r.bebidas, g.item, qtd);
    } else if (cat === "SOBREMESA") {
      if (!opcSobrem) soma(r.sobremesas, g.item, qtd);
    } else if (cat === "SACHE") soma(r.saches, g.item, qtd);
    else soma(r.naoClassificado, g.item, qtd);
  }

  for (const o of soltas) {
    const c = classificarOpcao(o.nome);
    const q = o.qtd;
    if (c.cat === "MASSA") soma(r.massaTamanho, `${c.massa}${SEP}${c.tamanho || ""}`, q);
    else if (c.cat === "MOLHO") {
      soma(r.molhoTamanho, `${c.molho}${SEP}${c.base || "Macarrao"}${SEP}${c.tamanho || ""}`, q);
      r.exatoMolhoMassa = false;
      r.semCruzamento = true;
    } else if (c.cat === "EXTRA") soma(r.extras, o.nome, q);
    else if (c.cat === "BEBIDA") soma(r.bebidas, o.nome, q);
    else if (c.cat === "SOBREMESA") soma(r.sobremesas, o.nome, q);
    else if (c.cat === "SACHE") soma(r.saches, o.nome, q);
    else if (c.cat === "OBSERVACAO") soma(r.observacoes, o.nome, q);
    else soma(r.naoClassificado, o.nome, q);
  }

  return r;
}

function arred(v: number, casas = 2): number {
  const f = 10 ** casas;
  return Math.round(v * f) / f;
}

function ordenarPor<T extends Record<string, string | number>>(linhas: T[], coluna: string): T[] {
  return linhas.slice().sort((a, b) => Number(b[coluna] ?? 0) - Number(a[coluna] ?? 0));
}

/**
 * Gramatura crua (g) por porção: ficha técnica do ComprasChef, senão catálogo Italian.
 */
type DbFichas = Pick<
  DB,
  "fichas_tecnicas" | "fichas_tecnicas_receitas" | "fichas_tecnicas_versoes" | "produtos"
>;

export function gramaturaMassaCruaG(
  massa: string,
  tamanho: string,
  db?: DbFichas
): { gramas: number | null; origem: "ficha" | "catalogo" | "ausente" } {
  if (db) {
    const daFicha = gramaturaDeFichas(db, massa, tamanho);
    if (daFicha != null) return { gramas: daFicha, origem: "ficha" };
  }
  const ficha = FICHA_MASSA_CRUA_G[massa];
  const g = ficha?.[tamanho];
  if (g != null) return { gramas: g, origem: "catalogo" };
  return { gramas: null, origem: "ausente" };
}

function gramaturaDeFichas(db: DbFichas, massa: string, tamanho: string): number | null {
  const kMassa = chave(massa);
  const versoes = db.fichas_tecnicas_versoes ?? [];
  const fichas = db.fichas_tecnicas ?? [];
  const receitas = db.fichas_tecnicas_receitas ?? [];

  const candidatos: { porcs: NonNullable<(typeof fichas)[0]["configuracoes_porcionamento"]> }[] = [];
  for (const receita of receitas) {
    if (!(chave(receita.nome).includes(kMassa) || chave(receita.nome) === kMassa)) continue;
    const versao =
      versoes.find((v) => v.receita_id === receita.id && v.status === "publicada") ??
      versoes.find((v) => v.id === receita.versao_vigente_id) ??
      versoes.find((v) => v.receita_id === receita.id);
    const porcs = versao?.configuracoes_porcionamento ?? versao?.ficha?.configuracoes_porcionamento;
    if (porcs?.length) candidatos.push({ porcs });
  }
  for (const ficha of fichas) {
    if (!(chave(ficha.nome).includes(kMassa) || chave(ficha.nome) === kMassa)) continue;
    if (ficha.configuracoes_porcionamento?.length) {
      candidatos.push({ porcs: ficha.configuracoes_porcionamento });
    }
  }

  for (const { porcs } of candidatos) {
    const alvo =
      tamanho === "G"
        ? porcs.find((p) => /box\s*g|\b800\b/i.test(p.nome) || /box\s*g/i.test(p.codigo ?? ""))
        : tamanho === "P"
          ? porcs.find((p) => /box\s*p|\b450\b/i.test(p.nome) || /box\s*p/i.test(p.codigo ?? ""))
          : tamanho === "KIDS"
            ? porcs.find((p) => /kids/i.test(p.nome) || /kids/i.test(p.codigo ?? ""))
            : undefined;
    if (alvo && Number(alvo.quantidade_por_porcao) > 0) {
      const q = Number(alvo.quantidade_por_porcao);
      const un = (alvo.unidade || "").toLowerCase();
      if (un === "kg") return Math.round(q * 1000);
      if (un === "g" || un === "gr" || un === "grama" || un === "gramas" || !un) return Math.round(q);
    }
  }
  return null;
}

function tabelaSimples(mapa: Record<string, number>, rotulo: string): Record<string, string | number>[] | null {
  const linhas = Object.keys(mapa).map((k) => ({ [rotulo]: k, Quantidade: arred(mapa[k]) }));
  return linhas.length ? ordenarPor(linhas, "Quantidade") : null;
}

function tabelaMolhoMassa(res: ResultadoConsolidadoSaipos): Record<string, string | number>[] | null {
  const chaves = Object.keys(res.molhoMassa);
  if (!chaves.length) return null;
  const molhos: Record<string, 1> = {};
  const massas: Record<string, 1> = {};
  for (const ch of chaves) {
    const [m, ma] = ch.split(SEP);
    molhos[m] = 1;
    massas[ma] = 1;
  }
  const listaMolhos = Object.keys(molhos);
  const listaMassas = Object.keys(massas).sort();
  let linhas = listaMolhos.map((molho) => {
    const o: Record<string, string | number> = { Molho: molho };
    let total = 0;
    for (const massa of listaMassas) {
      const v = res.molhoMassa[`${molho}${SEP}${massa}`] || 0;
      o[massa] = arred(v);
      total += v;
    }
    o.TOTAL = arred(total);
    return o;
  });
  linhas = ordenarPor(linhas, "TOTAL");
  const total: Record<string, string | number> = { Molho: "TOTAL" };
  for (const c of [...listaMassas, "TOTAL"]) {
    total[c] = arred(linhas.reduce((s, l) => s + Number(l[c] || 0), 0));
  }
  linhas.push(total);
  return linhas;
}

function tabelaMolhoTamanho(res: ResultadoConsolidadoSaipos): Record<string, string | number>[] | null {
  const linhas = Object.keys(res.molhoTamanho).map((ch) => {
    const [molho, prato, tam] = ch.split(SEP);
    return {
      Prato: prato,
      Molho: molho,
      Tamanho: rotuloTam(tam),
      Quantidade: arred(res.molhoTamanho[ch]),
    };
  });
  return linhas.length ? ordenarPor(linhas, "Quantidade") : null;
}

function agregar(
  mapa: Record<string, number>,
  indice: number,
  rotulo: string,
  colValor: string
): Record<string, string | number>[] | null {
  const tot: Record<string, number> = {};
  for (const ch of Object.keys(mapa)) soma(tot, ch.split(SEP)[indice], mapa[ch]);
  const linhas = Object.keys(tot).map((k) => ({ [rotulo]: k, [colValor]: arred(tot[k]) }));
  return linhas.length ? ordenarPor(linhas, colValor) : null;
}

function tabelaMassaTamanho(res: ResultadoConsolidadoSaipos): Record<string, string | number>[] | null {
  const linhas = Object.keys(res.massaTamanho).map((ch) => {
    const [massa, tam] = ch.split(SEP);
    return { Massa: massa, Tamanho: rotuloTam(tam), Porcoes: arred(res.massaTamanho[ch]) };
  });
  return linhas.length ? ordenarPor(linhas, "Porcoes") : null;
}

function tabelaConsumoMassa(
  res: ResultadoConsolidadoSaipos,
  db?: DbFichas
): Record<string, string | number>[] | null {
  const linhas: Record<string, string | number>[] = [];
  for (const ch of Object.keys(res.massaTamanho)) {
    const [massa, tam] = ch.split(SEP);
    const { gramas, origem } = gramaturaMassaCruaG(massa, tam, db);
    if (gramas == null) continue;
    const q = res.massaTamanho[ch];
    linhas.push({
      Massa: massa,
      Tamanho: rotuloTam(tam),
      Porcoes: arred(q),
      "Gramatura crua (g)": gramas,
      Origem: origem === "ficha" ? "ficha técnica" : "catálogo",
      "Consumo (kg)": arred((q * gramas) / 1000, 3),
    });
  }
  if (!linhas.length) return null;
  const ordenadas = ordenarPor(linhas, "Consumo (kg)");
  ordenadas.push({
    Massa: "TOTAL",
    Tamanho: "",
    Porcoes: arred(ordenadas.reduce((s, l) => s + Number(l.Porcoes), 0)),
    "Gramatura crua (g)": "",
    Origem: "",
    "Consumo (kg)": arred(
      ordenadas.reduce((s, l) => s + Number(l["Consumo (kg)"]), 0),
      3
    ),
  });
  return ordenadas;
}

function tabelaExtrasPrato(res: ResultadoConsolidadoSaipos): Record<string, string | number>[] | null {
  const linhas = Object.keys(res.extrasPrato).map((ch) => {
    const [prato, extra] = ch.split(SEP);
    return { Prato: prato, Extra: extra, Quantidade: res.extrasPrato[ch] };
  });
  return linhas.length ? ordenarPor(linhas, "Quantidade") : null;
}

export function descreverCruzamento(res: ResultadoConsolidadoSaipos): string {
  if (res.semCruzamento) return "Indisponível neste formato de export";
  if (res.exatoMolhoMassa) return "Exato";
  return `Exato fora dos combos (${Math.round(res.qtdRateada)} porções rateadas)`;
}

function tabelaResumo(
  res: ResultadoConsolidadoSaipos,
  nomeArquivo: string,
  formato: FormatoExportSaipos,
  periodo: string | null
): Record<string, string | number>[] {
  const l: Record<string, string | number>[] = [];
  const add = (i: string, v: string | number) => l.push({ Indicador: i, Valor: v });
  add("Arquivo", nomeArquivo);
  if (periodo) add("Período", periodo);
  add(
    "Formato do export",
    formato === "hierarquico" ? "hierárquico (opções aninhadas)" : "plano (duas tabelas separadas)"
  );
  add("Cruzamento molho x massa", descreverCruzamento(res));
  add(
    "Por que aparecem numeros quebrados",
    "Combos e a divisao por tamanho sao repartidos proporcionalmente. Os totais fecham em numero inteiro."
  );
  add("", "");
  add("Porções de molho", arred(totalDe(res.molhoTamanho)));
  add("Porções de massa", arred(totalDe(res.massaTamanho)));
  add("Risotos", totalDe(res.risotos));
  add("Extras", totalDe(res.extras));
  add("Bebidas vendidas avulsas (por produto)", totalDe(res.bebidasProduto));
  add("Bebidas escolhidas por sabor (inclui combos)", totalDe(res.bebidas));
  add("Sobremesas", totalDe(res.sobremesas));
  add("Combos", totalDe(res.combos));
  add("Promoções / itens avulsos", totalDe(res.promocoes));
  add("", "");
  add("Linhas não classificadas", totalDe(res.naoClassificado));
  add("Divergências encontradas", res.divergencias.filter((d) => d.Tipo === "erro").length);
  return l;
}

function tabelaValidacao(res: ResultadoConsolidadoSaipos): Record<string, string | number>[] {
  const erros = res.divergencias.filter((d) => d.Tipo === "erro");
  let massaEsperada = 0;
  for (const ch of Object.keys(res.molhoTamanho)) {
    const base = ch.split(SEP)[1];
    if (["Macarrao", "Nhoque", "Salada", "Combo", "Promocao"].includes(base)) {
      massaEsperada += res.molhoTamanho[ch];
    }
  }
  const checagens: Record<string, string | number>[] = [
    {
      Verificacao: "Linhas sem classificação (deve ser zero)",
      Esperado: 0,
      Obtido: arred(totalDe(res.naoClassificado)),
    },
    {
      Verificacao: "Pratos de massa x massas escolhidas",
      Esperado: arred(massaEsperada),
      Obtido: arred(totalDe(res.massaTamanho)),
    },
    {
      Verificacao: "Itens com soma de opções divergente",
      Esperado: 0,
      Obtido: erros.length,
    },
  ];
  for (const c of checagens) {
    c.Status = c.Esperado === c.Obtido ? "OK" : "REVISAR";
  }
  return [
    ...checagens,
    {},
    ...res.divergencias.map((d) => ({
      Verificacao: `${d.Tipo}: ${d.Item} (${d.Verificacao})`,
      Esperado: d["Qtd do item"],
      Obtido: d["Soma das opcoes"],
      Status: d.Tipo === "erro" ? "REVISAR" : "INFO",
    })),
  ];
}

export function montarTabelas(
  res: ResultadoConsolidadoSaipos,
  nomeArquivo: string,
  formato: FormatoExportSaipos,
  periodo: string | null,
  db?: DbFichas
): AbaRelatorioSaipos[] {
  const abas: AbaRelatorioSaipos[] = [];
  const push = (nome: string, dados: Record<string, string | number>[] | null) => {
    if (dados?.length) abas.push({ nome, dados });
  };
  push("Resumo", tabelaResumo(res, nomeArquivo, formato, periodo));
  push("Molho x Massa", tabelaMolhoMassa(res));
  push("Molho x Tamanho", tabelaMolhoTamanho(res));
  push("Molhos total", agregar(res.molhoTamanho, 0, "Molho", "Porcoes"));
  push("Massa x Tamanho", tabelaMassaTamanho(res));
  push("Massas total", agregar(res.massaTamanho, 0, "Massa", "Porcoes"));
  push("Consumo massa (kg)", tabelaConsumoMassa(res, db));
  push("Risotos", tabelaSimples(res.risotos, "Risoto (molho)"));
  push("Extras por prato", tabelaExtrasPrato(res));
  push("Extras total", tabelaSimples(res.extras, "Extra"));
  push("Bebidas por sabor", tabelaSimples(res.bebidas, "Sabor"));
  push("Bebidas por produto", tabelaSimples(res.bebidasProduto, "Produto"));
  push("Sobremesas", tabelaSimples(res.sobremesas, "Sobremesa"));
  push("Combos", tabelaSimples(res.combos, "Combo"));
  push("Promocoes", tabelaSimples(res.promocoes, "Item"));
  push("Saches", tabelaSimples(res.saches, "Item"));
  push("Observacoes", tabelaSimples(res.observacoes, "Item"));
  push("NAO CLASSIFICADO", tabelaSimples(res.naoClassificado, "Item"));
  push("Validacao", tabelaValidacao(res));
  return abas;
}

export function lerPeriodo(matriz: unknown[][]): string | null {
  for (let i = 0; i < Math.min(6, matriz.length); i++) {
    const linha = matriz[i] || [];
    for (let j = 0; j < linha.length; j++) {
      const v = linha[j];
      if (typeof v === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(v.trim())) {
        let fim: string | null = null;
        for (let k = j + 1; k < linha.length; k++) {
          if (typeof linha[k] === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(String(linha[k]).trim())) {
            fim = String(linha[k]).trim();
            break;
          }
        }
        return fim ? `${v.trim()} a ${fim}` : v.trim();
      }
    }
  }
  return null;
}

export function processarMatrizItensVendidos(
  matriz: unknown[][],
  nomeArquivo: string,
  db?: DbFichas
): RelatorioItensVendidosSaipos {
  const lido = lerExport(matriz);
  const resultado = consolidar(lido.grupos, lido.soltas);
  const periodo = lerPeriodo(matriz);
  return {
    resultado,
    formato: lido.formato,
    periodo,
    totalItens: lido.grupos.length,
    totalOpcoes: lido.grupos.reduce((s, g) => s + g.opcoes.length, 0),
    abas: montarTabelas(resultado, nomeArquivo, lido.formato, periodo, db),
    nomeArquivo,
  };
}

export function processarArquivoItensVendidos(
  buffer: ArrayBuffer,
  nomeArquivo: string,
  db?: DbFichas
): RelatorioItensVendidosSaipos {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as unknown[][];
  return processarMatrizItensVendidos(matriz, nomeArquivo, db);
}
