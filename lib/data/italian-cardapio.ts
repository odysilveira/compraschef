/**
 * Cardápio A Italian — insumos, bases (porcionamento) e pratos finais.
 * Fonte: planilhas de precificação / porcionamento / finalização.
 * Ids fixos; aplicação no DB é idempotente (não sobrescreve o que já existe).
 */

import type {
  DB,
  FichaTecnica,
  FichaTecnicaIngrediente,
  PrecoHistorico,
  Produto,
  ReceitaFichaTecnica,
  ReceitaFichaTecnicaVersao,
} from "@/lib/types";

const UN_KG = "un-kg";
const UN_L = "un-l";
const UN_UN = "un-un";
const FORN_ITALIAN = "forn-italian-interno";

const ALERGENICOS_NI = {
  gluten: "NAO_INFORMADO" as const,
  lactose: "NAO_INFORMADO" as const,
  ovos: "NAO_INFORMADO" as const,
  peixes: "NAO_INFORMADO" as const,
  crustaceos: "NAO_INFORMADO" as const,
  soja: "NAO_INFORMADO" as const,
  castanhas: "NAO_INFORMADO" as const,
  amendoim: "NAO_INFORMADO" as const,
  outros: [] as { nome: string; presenca: "NAO_INFORMADO" | "PODE_CONTER" | "CONTEM" }[],
};

type InsumoDef = {
  id: string;
  nome: string;
  unidade: "kg" | "l" | "un";
  preco: number;
  categoria: string;
};

/** Insumos da planilha (cebola crispy = 60; brócolis = 10/un). */
const INSUMOS: InsumoDef[] = [
  { id: "prod-it-cebola", nome: "Cebola", unidade: "kg", preco: 10, categoria: "hortifrúti" },
  { id: "prod-it-alho", nome: "Alho", unidade: "kg", preco: 30, categoria: "hortifrúti" },
  { id: "prod-it-cenoura", nome: "Cenoura", unidade: "kg", preco: 5, categoria: "hortifrúti" },
  { id: "prod-it-manjericao", nome: "Manjericão", unidade: "un", preco: 13, categoria: "hortifrúti" },
  { id: "prod-it-brocolis", nome: "Brócolis", unidade: "un", preco: 10, categoria: "hortifrúti" },
  { id: "prod-it-abobrinha", nome: "Abobrinha", unidade: "kg", preco: 7, categoria: "hortifrúti" },
  { id: "prod-it-cebolinha", nome: "Cebolinha", unidade: "kg", preco: 40, categoria: "hortifrúti" },
  { id: "prod-it-alecrim", nome: "Alecrim", unidade: "un", preco: 5, categoria: "hortifrúti" },
  { id: "prod-it-parmesao", nome: "Parmesão", unidade: "kg", preco: 70, categoria: "laticínios" },
  { id: "prod-it-mucarela", nome: "Muçarela", unidade: "kg", preco: 35, categoria: "laticínios" },
  { id: "prod-it-gorgonzola", nome: "Gorgonzola", unidade: "kg", preco: 80, categoria: "laticínios" },
  { id: "prod-it-provolone", nome: "Provolone", unidade: "kg", preco: 60, categoria: "laticínios" },
  { id: "prod-it-cheddar-fatiado", nome: "Cheddar fatiado", unidade: "kg", preco: 50, categoria: "laticínios" },
  { id: "prod-it-cheddar-creme", nome: "Cheddar creme", unidade: "kg", preco: 70, categoria: "laticínios" },
  { id: "prod-it-manteiga", nome: "Manteiga", unidade: "kg", preco: 24, categoria: "laticínios" },
  { id: "prod-it-creme-culinario", nome: "Creme culinário", unidade: "kg", preco: 16, categoria: "laticínios" },
  { id: "prod-it-sal", nome: "Sal", unidade: "kg", preco: 5, categoria: "mercearia" },
  { id: "prod-it-oleo", nome: "Óleo", unidade: "l", preco: 10, categoria: "mercearia" },
  { id: "prod-it-acucar", nome: "Açúcar", unidade: "kg", preco: 5, categoria: "mercearia" },
  { id: "prod-it-molho-heinz", nome: "Molho Heinz", unidade: "kg", preco: 13, categoria: "mercearia" },
  { id: "prod-it-tomate-pelati", nome: "Tomate pelati", unidade: "kg", preco: 11.98, categoria: "mercearia" },
  { id: "prod-it-molho-tomate", nome: "Molho de tomate", unidade: "kg", preco: 11.98, categoria: "mercearia" },
  { id: "prod-it-funghi", nome: "Funghi seco", unidade: "kg", preco: 60, categoria: "mercearia" },
  { id: "prod-it-caldo-legumes", nome: "Caldo de legumes", unidade: "kg", preco: 30, categoria: "mercearia" },
  { id: "prod-it-arroz-arboreo", nome: "Arroz arbóreo", unidade: "kg", preco: 18, categoria: "mercearia" },
  { id: "prod-it-alho-frito", nome: "Alho frito", unidade: "kg", preco: 42, categoria: "mercearia" },
  { id: "prod-it-cebola-crispy", nome: "Cebola crispy", unidade: "kg", preco: 60, categoria: "mercearia" },
  { id: "prod-it-semolina", nome: "Semolina", unidade: "kg", preco: 8, categoria: "mercearia" },
  { id: "prod-it-glutamato", nome: "Glutamato", unidade: "kg", preco: 45, categoria: "mercearia" },
  { id: "prod-it-vinho-branco", nome: "Vinho branco seco", unidade: "un", preco: 15, categoria: "mercearia" },
  { id: "prod-it-vinho-tinto", nome: "Vinho tinto seco", unidade: "un", preco: 15, categoria: "mercearia" },
  { id: "prod-it-carne-moida", nome: "Carne moída", unidade: "kg", preco: 35, categoria: "carnes" },
  { id: "prod-it-costela", nome: "Costela", unidade: "kg", preco: 25, categoria: "carnes" },
  { id: "prod-it-bacon", nome: "Bacon", unidade: "kg", preco: 32, categoria: "carnes" },
  { id: "prod-it-presunto", nome: "Presunto", unidade: "kg", preco: 30, categoria: "carnes" },
  { id: "prod-it-camarao", nome: "Camarão", unidade: "kg", preco: 85, categoria: "carnes" },
  { id: "prod-it-ervilha", nome: "Ervilha", unidade: "kg", preco: 15, categoria: "mercearia" },
  { id: "prod-it-talharim", nome: "Talharim", unidade: "kg", preco: 12, categoria: "mercearia" },
  { id: "prod-it-penne", nome: "Penne", unidade: "kg", preco: 12.6, categoria: "mercearia" },
  { id: "prod-it-caracolino", nome: "Caracolino", unidade: "kg", preco: 12, categoria: "mercearia" },
  { id: "prod-it-penne-integral", nome: "Penne integral", unidade: "kg", preco: 15, categoria: "mercearia" },
  { id: "prod-it-nhoque-tradicional", nome: "Nhoque tradicional", unidade: "kg", preco: 15, categoria: "mercearia" },
  { id: "prod-it-nhoque-recheado", nome: "Nhoque recheado", unidade: "kg", preco: 20, categoria: "mercearia" },
  { id: "prod-it-risoto", nome: "Risoto (arroz)", unidade: "kg", preco: 18, categoria: "mercearia" },
  { id: "prod-it-agua", nome: "Água", unidade: "l", preco: 0.01, categoria: "mercearia" },
  { id: "prod-it-box", nome: "Box", unidade: "un", preco: 1.09, categoria: "embalagens" },
  { id: "prod-it-etiqueta", nome: "Etiqueta", unidade: "un", preco: 0.1, categoria: "embalagens" },
  { id: "prod-it-kraft", nome: "Kraft", unidade: "un", preco: 0.1, categoria: "embalagens" },
  { id: "prod-it-copinho", nome: "Copinho finalização", unidade: "un", preco: 0.05, categoria: "embalagens" },
  { id: "prod-it-saco-refri", nome: "Saco refri", unidade: "un", preco: 0.05, categoria: "embalagens" },
];

function unidadeUso(u: InsumoDef["unidade"]): string {
  if (u === "kg") return UN_KG;
  if (u === "l") return UN_L;
  return UN_UN;
}

export function produtosItalian(): Produto[] {
  return INSUMOS.map((item) => ({
    id: item.id,
    codigo_externo: item.id.replace("prod-it-", "IT-").toUpperCase(),
    nome: item.nome,
    categoria: item.categoria,
    tipo: "comprado" as const,
    unidade_compra_id: unidadeUso(item.unidade),
    unidade_uso_id: unidadeUso(item.unidade),
    fator_conversao: 1,
    estoque_minimo: 0,
    custo_unitario: item.preco,
    ativo: true,
  }));
}

export function precosItalian(dataIso: string): PrecoHistorico[] {
  return INSUMOS.map((item) => ({
    id: `ph-it-${item.id}`,
    produto_id: item.id,
    fornecedor_id: FORN_ITALIAN,
    preco: item.preco,
    origem: "cotacao" as const,
    data: dataIso.slice(0, 10),
  }));
}

type IngProd = { produto: string; qtd: number; un: string };
type IngSub = { sub: string; qtd: number; un: string };

type BaseDef = {
  slug: string;
  nome: string;
  codigo: string;
  porcoes: number;
  pesoPorcaoKg?: number;
  rendimentoKg?: number;
  ingredientes: IngProd[];
};

/** Bases / porcionamentos (sub-receitas). Rendimento em porções (un). */
const BASES: BaseDef[] = [
  {
    slug: "carne-moida",
    nome: "Carne moída (porção)",
    codigo: "IT-BASE-CARNE",
    porcoes: 45,
    pesoPorcaoKg: 0.08,
    rendimentoKg: 4,
    ingredientes: [
      { produto: "prod-it-cebola", qtd: 0.4, un: UN_KG },
      { produto: "prod-it-alho", qtd: 0.06, un: UN_KG },
      { produto: "prod-it-carne-moida", qtd: 5, un: UN_KG },
      { produto: "prod-it-oleo", qtd: 0.1, un: UN_L },
      { produto: "prod-it-sal", qtd: 0.05, un: UN_KG },
    ],
  },
  {
    slug: "funghi",
    nome: "Funghi (porção)",
    codigo: "IT-BASE-FUNGHI",
    porcoes: 32,
    rendimentoKg: 2.9,
    ingredientes: [
      { produto: "prod-it-funghi", qtd: 1, un: UN_KG },
      { produto: "prod-it-vinho-branco", qtd: 2, un: UN_UN },
      { produto: "prod-it-agua", qtd: 0.5, un: UN_L },
    ],
  },
  {
    slug: "alho",
    nome: "Alho (porção)",
    codigo: "IT-BASE-ALHO",
    porcoes: 1,
    ingredientes: [{ produto: "prod-it-alho", qtd: 0.01, un: UN_KG }],
  },
  {
    slug: "cebola-crispy",
    nome: "Cebola crispy (porção)",
    codigo: "IT-BASE-CEB-CRISPY",
    porcoes: 1,
    ingredientes: [{ produto: "prod-it-cebola", qtd: 0.02, un: UN_KG }],
  },
  {
    slug: "copo-mucarela",
    nome: "Copo muçarela",
    codigo: "IT-BASE-MUC",
    porcoes: 1,
    ingredientes: [{ produto: "prod-it-mucarela", qtd: 0.045, un: UN_KG }],
  },
  {
    slug: "copo-bacon",
    nome: "Copo bacon",
    codigo: "IT-BASE-BACON",
    porcoes: 1,
    ingredientes: [{ produto: "prod-it-bacon", qtd: 0.025, un: UN_KG }],
  },
  {
    slug: "copo-parmesao",
    nome: "Copo parmesão",
    codigo: "IT-BASE-PARM",
    porcoes: 1,
    ingredientes: [{ produto: "prod-it-parmesao", qtd: 0.015, un: UN_KG }],
  },
  {
    slug: "abobrinha",
    nome: "Abobrinha (porção)",
    codigo: "IT-BASE-ABOB",
    porcoes: 3,
    ingredientes: [{ produto: "prod-it-abobrinha", qtd: 1, un: UN_KG }],
  },
  {
    slug: "molho-vermelho",
    nome: "Molho vermelho",
    codigo: "IT-BASE-MOLHO-VERM",
    porcoes: 15,
    ingredientes: [
      { produto: "prod-it-molho-tomate", qtd: 5, un: UN_KG },
      { produto: "prod-it-cenoura", qtd: 0.5, un: UN_KG },
      { produto: "prod-it-cebola", qtd: 0.5, un: UN_KG },
      { produto: "prod-it-sal", qtd: 0.1, un: UN_KG },
      { produto: "prod-it-agua", qtd: 5, un: UN_L },
      { produto: "prod-it-molho-heinz", qtd: 1, un: UN_KG },
      { produto: "prod-it-oleo", qtd: 0.1, un: UN_L },
      { produto: "prod-it-alho", qtd: 0.1, un: UN_KG },
      { produto: "prod-it-glutamato", qtd: 0.01, un: UN_KG },
      { produto: "prod-it-manjericao", qtd: 1, un: UN_UN },
    ],
  },
  {
    slug: "ragu-costela",
    nome: "Ragu de costela",
    codigo: "IT-BASE-RAGU",
    porcoes: 32,
    pesoPorcaoKg: 0.08,
    rendimentoKg: 2.6,
    ingredientes: [
      { produto: "prod-it-cebola", qtd: 0.9, un: UN_KG },
      { produto: "prod-it-alho", qtd: 0.08, un: UN_KG },
      { produto: "prod-it-vinho-tinto", qtd: 1, un: UN_UN },
      { produto: "prod-it-agua", qtd: 0.75, un: UN_L },
      { produto: "prod-it-sal", qtd: 0.05, un: UN_KG },
      { produto: "prod-it-costela", qtd: 5, un: UN_KG },
    ],
  },
  {
    slug: "camarao",
    nome: "Camarão (porção)",
    codigo: "IT-BASE-CAMARAO",
    porcoes: 1,
    ingredientes: [{ produto: "prod-it-camarao", qtd: 0.16, un: UN_KG }],
  },
  {
    slug: "presunto",
    nome: "Presunto (porção)",
    codigo: "IT-BASE-PRESUNTO",
    porcoes: 1,
    ingredientes: [{ produto: "prod-it-presunto", qtd: 0.09, un: UN_KG }],
  },
  {
    slug: "brocoli",
    nome: "Brócoli (porção)",
    codigo: "IT-BASE-BROCOLI",
    porcoes: 1,
    // Planilha: 0,07 kg; compra é por unidade (R$ 10). Usa ~1/5 da unidade por porção.
    ingredientes: [{ produto: "prod-it-brocolis", qtd: 0.2, un: UN_UN }],
  },
  {
    slug: "nhoque-tradicional",
    nome: "Nhoque tradicional (porção)",
    codigo: "IT-BASE-NHOQUE-T",
    porcoes: 1,
    ingredientes: [{ produto: "prod-it-nhoque-tradicional", qtd: 0.3, un: UN_KG }],
  },
  {
    slug: "nhoque-mucarela",
    nome: "Nhoque muçarela (porção)",
    codigo: "IT-BASE-NHOQUE-M",
    porcoes: 1,
    ingredientes: [{ produto: "prod-it-nhoque-recheado", qtd: 0.3, un: UN_KG }],
  },
  {
    slug: "agua-massa",
    nome: "Molho água de massa",
    codigo: "IT-BASE-AGUA-MASSA",
    porcoes: 1.3,
    ingredientes: [
      { produto: "prod-it-agua", qtd: 1, un: UN_L },
      { produto: "prod-it-semolina", qtd: 0.02, un: UN_KG },
      { produto: "prod-it-sal", qtd: 0.01, un: UN_KG },
    ],
  },
  {
    slug: "creme-culinario",
    nome: "Creme culinário (porção)",
    codigo: "IT-BASE-CREME",
    porcoes: 1,
    ingredientes: [{ produto: "prod-it-creme-culinario", qtd: 0.2, un: UN_KG }],
  },
  {
    slug: "ervilha",
    nome: "Ervilha (porção)",
    codigo: "IT-BASE-ERVILHA",
    porcoes: 1,
    ingredientes: [{ produto: "prod-it-ervilha", qtd: 0.05, un: UN_KG }],
  },
  {
    slug: "4-queijos",
    nome: "4 queijos (porção)",
    codigo: "IT-BASE-4Q",
    porcoes: 1,
    pesoPorcaoKg: 0.105,
    ingredientes: [
      { produto: "prod-it-mucarela", qtd: 0.04, un: UN_KG },
      { produto: "prod-it-gorgonzola", qtd: 0.03, un: UN_KG },
      { produto: "prod-it-provolone", qtd: 0.03, un: UN_KG },
      { produto: "prod-it-parmesao", qtd: 0.05, un: UN_KG },
    ],
  },
  {
    slug: "cheddar",
    nome: "Cheddar (porção)",
    codigo: "IT-BASE-CHEDDAR",
    porcoes: 1,
    ingredientes: [
      { produto: "prod-it-cheddar-fatiado", qtd: 0.045, un: UN_KG },
      { produto: "prod-it-cheddar-creme", qtd: 0.055, un: UN_KG },
    ],
  },
  {
    slug: "talharim",
    nome: "Talharim (porção)",
    codigo: "IT-BASE-TALHARIM",
    porcoes: 13,
    ingredientes: [{ produto: "prod-it-talharim", qtd: 1, un: UN_KG }],
  },
  {
    slug: "penne",
    nome: "Penne (porção)",
    codigo: "IT-BASE-PENNE",
    porcoes: 13,
    ingredientes: [{ produto: "prod-it-penne", qtd: 1, un: UN_KG }],
  },
  {
    slug: "penne-integral",
    nome: "Penne integral (porção)",
    codigo: "IT-BASE-PENNE-INT",
    porcoes: 13,
    ingredientes: [{ produto: "prod-it-penne-integral", qtd: 1, un: UN_KG }],
  },
  {
    slug: "caracolino",
    nome: "Caracolino (porção)",
    codigo: "IT-BASE-CARACOLINO",
    porcoes: 13,
    ingredientes: [{ produto: "prod-it-caracolino", qtd: 1, un: UN_KG }],
  },
  {
    slug: "risoto",
    nome: "Risoto (porção)",
    codigo: "IT-BASE-RISOTO",
    porcoes: 15,
    rendimentoKg: 3.75,
    ingredientes: [
      { produto: "prod-it-agua", qtd: 2, un: UN_L },
      { produto: "prod-it-arroz-arboreo", qtd: 2, un: UN_KG },
      { produto: "prod-it-oleo", qtd: 0.01, un: UN_L },
      { produto: "prod-it-caldo-legumes", qtd: 0.03, un: UN_KG },
      { produto: "prod-it-vinho-branco", qtd: 1, un: UN_UN },
      { produto: "prod-it-manteiga", qtd: 0.1, un: UN_KG },
    ],
  },
  {
    slug: "cebolinha",
    nome: "Cebolinha (porção)",
    codigo: "IT-BASE-CEBOLINHA",
    porcoes: 1,
    ingredientes: [{ produto: "prod-it-cebolinha", qtd: 0.01, un: UN_KG }],
  },
  {
    slug: "manteiga",
    nome: "Manteiga (porção)",
    codigo: "IT-BASE-MANTEIGA",
    porcoes: 1,
    ingredientes: [{ produto: "prod-it-manteiga", qtd: 0.02, un: UN_KG }],
  },
];

const MASSAS = [
  { slug: "penne", nome: "Penne", base: "penne" },
  { slug: "penne-integral", nome: "Penne integral", base: "penne-integral" },
  { slug: "caracolino", nome: "Caracolino", base: "caracolino" },
  { slug: "talharim", nome: "Talharim", base: "talharim" },
] as const;

type SaborDef = {
  slug: string;
  nome: string;
  itens: IngSub[];
};

/** Pratos finais: 1 porção de cada base (TALHARIM corrigido vs planilha). */
const SABORES: SaborDef[] = [
  {
    slug: "pomodoro",
    nome: "Pomodoro",
    itens: [
      { sub: "molho-vermelho", qtd: 1, un: UN_UN },
      { sub: "copo-mucarela", qtd: 1, un: UN_UN },
      { sub: "cebolinha", qtd: 1, un: UN_UN },
    ],
  },
  {
    slug: "bolonhesa",
    nome: "Bolonhesa",
    itens: [
      { sub: "molho-vermelho", qtd: 1, un: UN_UN },
      { sub: "copo-mucarela", qtd: 1, un: UN_UN },
      { sub: "cebolinha", qtd: 1, un: UN_UN },
      { sub: "carne-moida", qtd: 1, un: UN_UN },
    ],
  },
  {
    slug: "ragu-costela",
    nome: "Ragu de costela",
    itens: [
      { sub: "molho-vermelho", qtd: 1, un: UN_UN },
      { sub: "copo-mucarela", qtd: 1, un: UN_UN },
      { sub: "cebolinha", qtd: 1, un: UN_UN },
      { sub: "ragu-costela", qtd: 1, un: UN_UN },
    ],
  },
  {
    slug: "4-queijos",
    nome: "4 queijos",
    itens: [
      { sub: "agua-massa", qtd: 1, un: UN_UN },
      { sub: "copo-mucarela", qtd: 1, un: UN_UN },
      { sub: "cebolinha", qtd: 1, un: UN_UN },
      { sub: "4-queijos", qtd: 1, un: UN_UN },
      { sub: "copo-bacon", qtd: 2, un: UN_UN },
      { sub: "creme-culinario", qtd: 1, un: UN_UN },
    ],
  },
  {
    slug: "funghi",
    nome: "Funghi",
    itens: [
      { sub: "agua-massa", qtd: 1, un: UN_UN },
      { sub: "copo-mucarela", qtd: 1, un: UN_UN },
      { sub: "cebolinha", qtd: 1, un: UN_UN },
      { sub: "funghi", qtd: 1, un: UN_UN },
      { sub: "creme-culinario", qtd: 1, un: UN_UN },
    ],
  },
  {
    slug: "cheddar",
    nome: "Cheddar",
    itens: [
      { sub: "agua-massa", qtd: 1, un: UN_UN },
      { sub: "copo-mucarela", qtd: 1, un: UN_UN },
      { sub: "cebolinha", qtd: 1, un: UN_UN },
      { sub: "creme-culinario", qtd: 1, un: UN_UN },
      { sub: "cheddar", qtd: 1, un: UN_UN },
      { sub: "copo-bacon", qtd: 2, un: UN_UN },
    ],
  },
  {
    slug: "brocoli",
    nome: "Brócoli",
    itens: [
      { sub: "agua-massa", qtd: 1, un: UN_UN },
      { sub: "copo-mucarela", qtd: 1, un: UN_UN },
      { sub: "cebolinha", qtd: 1, un: UN_UN },
      { sub: "creme-culinario", qtd: 1, un: UN_UN },
      { sub: "brocoli", qtd: 1, un: UN_UN },
      { sub: "copo-bacon", qtd: 2, un: UN_UN },
    ],
  },
  {
    slug: "camarao",
    nome: "Camarão",
    itens: [
      { sub: "molho-vermelho", qtd: 1, un: UN_UN },
      { sub: "copo-mucarela", qtd: 1, un: UN_UN },
      { sub: "cebolinha", qtd: 1, un: UN_UN },
      { sub: "creme-culinario", qtd: 1, un: UN_UN },
      { sub: "camarao", qtd: 1, un: UN_UN },
    ],
  },
  {
    slug: "parisiense",
    nome: "Parisiense",
    itens: [
      { sub: "agua-massa", qtd: 1, un: UN_UN },
      { sub: "copo-mucarela", qtd: 1, un: UN_UN },
      { sub: "cebolinha", qtd: 1, un: UN_UN },
      { sub: "creme-culinario", qtd: 1, un: UN_UN },
      { sub: "copo-bacon", qtd: 2, un: UN_UN },
      { sub: "presunto", qtd: 1, un: UN_UN },
      { sub: "ervilha", qtd: 1, un: UN_UN },
    ],
  },
];

function idFicha(slug: string): string {
  return `ft-it-${slug}`;
}

function ingProduto(
  fichaSlug: string,
  produtoId: string,
  qtd: number,
  un: string,
  idx: number
): FichaTecnicaIngrediente {
  return {
    id: `ing-${fichaSlug}-p${idx}`,
    tipo: "PRODUTO",
    produto_id: produtoId,
    quantidade: qtd,
    quantidade_bruta: qtd,
    quantidade_liquida: qtd,
    unidade_id: un,
  };
}

function ingSub(
  fichaSlug: string,
  subSlug: string,
  qtd: number,
  un: string,
  idx: number
): FichaTecnicaIngrediente {
  return {
    id: `ing-${fichaSlug}-s${idx}`,
    tipo: "SUB_RECEITA",
    sub_receita_id: idFicha(subSlug),
    quantidade: qtd,
    quantidade_bruta: qtd,
    quantidade_liquida: qtd,
    unidade_id: un,
  };
}

function montarReceitaVersao(opts: {
  slug: string;
  nome: string;
  codigo: string;
  tipo: "prato" | "sub_receita";
  porcoes: number;
  pesoPorcaoKg?: number;
  ingredientes: FichaTecnicaIngrediente[];
  agora: string;
}): { receita: ReceitaFichaTecnica; versao: ReceitaFichaTecnicaVersao } {
  const id = idFicha(opts.slug);
  const ficha: FichaTecnica = {
    id,
    codigo_externo: opts.codigo,
    nome: opts.nome,
    tipo_receita: opts.tipo,
    status: "publicada",
    versao: "1.0.0",
    rendimento_quantidade: opts.porcoes,
    rendimento_unidade_id: UN_UN,
    porcoes_config: {
      quantidade_porcoes: opts.porcoes,
      peso_por_porcao: opts.pesoPorcaoKg,
      unidade_porcao_id: opts.pesoPorcaoKg != null ? UN_KG : undefined,
    },
    ingredientes: opts.ingredientes,
    passos: [
      {
        ordem: 1,
        titulo: "Montagem",
        descricao: "Seguir o porcionamento padrão da casa.",
      },
    ],
    midias: [],
    alergenicos: { ...ALERGENICOS_NI, outros: [] },
    criado_em: opts.agora,
    atualizado_em: opts.agora,
  };

  const receita: ReceitaFichaTecnica = {
    id,
    codigo: opts.codigo,
    nome: opts.nome,
    tipo: opts.tipo,
    versao_vigente_id: id,
    criado_por: "import-italian",
    atualizado_por: "import-italian",
    criado_em: opts.agora,
    atualizado_em: opts.agora,
  };

  const versao: ReceitaFichaTecnicaVersao = {
    id,
    receita_id: id,
    numero_versao: "1.0.0",
    status: "publicada",
    rendimento_total: opts.porcoes,
    unidade_rendimento: UN_UN,
    configuracoes_porcionamento: [
      {
        id: `cfg-${id}`,
        nome: "Porção padrão",
        quantidade_por_porcao: 1,
        unidade: UN_UN,
        quantidade_porcoes_teorica: opts.porcoes,
        ativa: true,
      },
    ],
    ficha,
    criado_por: "import-italian",
    atualizado_por: "import-italian",
    publicado_por: "import-italian",
    publicada_em: opts.agora,
    criado_em: opts.agora,
    atualizado_em: opts.agora,
    historico: [
      {
        id: `hist-${id}`,
        versao_id: id,
        acao: "publicacao",
        responsavel: "import-italian",
        em: opts.agora,
        detalhes: "Importado das planilhas A Italian.",
      },
    ],
  };

  return { receita, versao };
}

export function fichasItalian(agora: string): {
  receitas: ReceitaFichaTecnica[];
  versoes: ReceitaFichaTecnicaVersao[];
} {
  const receitas: ReceitaFichaTecnica[] = [];
  const versoes: ReceitaFichaTecnicaVersao[] = [];

  for (const base of BASES) {
    const { receita, versao } = montarReceitaVersao({
      slug: base.slug,
      nome: base.nome,
      codigo: base.codigo,
      tipo: "sub_receita",
      porcoes: base.porcoes,
      pesoPorcaoKg: base.pesoPorcaoKg,
      ingredientes: base.ingredientes.map((ing, i) =>
        ingProduto(base.slug, ing.produto, ing.qtd, ing.un, i)
      ),
      agora,
    });
    receitas.push(receita);
    versoes.push(versao);
  }

  for (const massa of MASSAS) {
    for (const sabor of SABORES) {
      const slug = `${massa.slug}-${sabor.slug}`;
      const nome = `${massa.nome} ${sabor.nome}`;
      const codigo = `IT-${massa.slug}-${sabor.slug}`.toUpperCase().replace(/[^A-Z0-9-]/g, "");
      const ingredientes: FichaTecnicaIngrediente[] = [
        ingSub(slug, massa.base, 1, UN_UN, 0),
        ...sabor.itens.map((item, i) => ingSub(slug, item.sub, item.qtd, item.un, i + 1)),
      ];
      const { receita, versao } = montarReceitaVersao({
        slug,
        nome,
        codigo,
        tipo: "prato",
        porcoes: 1,
        ingredientes,
        agora,
      });
      receitas.push(receita);
      versoes.push(versao);
    }
  }

  return { receitas, versoes };
}

/** Injeta insumos + fichas Italian no DB (idempotente). */
export function aplicarCardapioItalian(db: DB): boolean {
  let mudou = false;
  const agora = new Date().toISOString();

  if (!db.fornecedores.some((f) => f.id === FORN_ITALIAN)) {
    db.fornecedores.push({
      id: FORN_ITALIAN,
      codigo_externo: "IT-INT",
      nome: "A Italian (custo interno)",
      forma_pagamento: "pix",
      ativo: true,
    });
    mudou = true;
  }

  for (const produto of produtosItalian()) {
    const existente = db.produtos.find((p) => p.id === produto.id);
    if (!existente) {
      db.produtos.push(produto);
      mudou = true;
    } else if (existente.custo_unitario == null || existente.custo_unitario <= 0) {
      existente.custo_unitario = produto.custo_unitario;
      mudou = true;
    }
  }

  if (!Array.isArray(db.precos_historico)) {
    db.precos_historico = [];
    mudou = true;
  }
  for (const preco of precosItalian(agora)) {
    if (!db.precos_historico.some((p) => p.id === preco.id)) {
      db.precos_historico.push(preco);
      mudou = true;
    }
  }

  if (!Array.isArray(db.fichas_tecnicas_receitas)) {
    db.fichas_tecnicas_receitas = [];
    mudou = true;
  }
  if (!Array.isArray(db.fichas_tecnicas_versoes)) {
    db.fichas_tecnicas_versoes = [];
    mudou = true;
  }

  const excluidas = new Set(db.fichas_tecnicas_excluidas_ids ?? []);
  const { receitas, versoes } = fichasItalian(agora);
  for (const receita of receitas) {
    if (excluidas.has(receita.id)) continue;
    if (!db.fichas_tecnicas_receitas.some((r) => r.id === receita.id)) {
      db.fichas_tecnicas_receitas.push(receita);
      mudou = true;
    }
  }
  for (const versao of versoes) {
    if (excluidas.has(versao.receita_id) || excluidas.has(versao.id)) continue;
    if (!db.fichas_tecnicas_versoes.some((v) => v.id === versao.id)) {
      db.fichas_tecnicas_versoes.push(versao);
      mudou = true;
    }
  }

  return mudou;
}
