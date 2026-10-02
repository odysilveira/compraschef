import * as XLSX from "xlsx";
import type { PrecoFranquiaLinha } from "./tabela-precos-venda";
import {
  CMV_DESEJADO_PADRAO_PERCENTUAL,
  TAXA_99_PADRAO_PERCENTUAL,
  TAXA_IFOOD_PADRAO_PERCENTUAL,
} from "../data/tabela-precos-franquia";

export const PRECOS_FRANQUIA_EXTENSAO = ".xlsx";
export const PRECOS_FRANQUIA_MAX_BYTES = 10 * 1024 * 1024;

/** Massas do cardápio ComprasChef — um preço de sabor G da planilha vale para todas. */
export const MASSAS_PRECO_FRANQUIA = ["Penne", "Penne integral", "Caracolino", "Talharim"] as const;

export type ResultadoImportacaoPrecosFranquia =
  | { ok: true; linhas: PrecoFranquiaLinha[]; avisos: string[] }
  | { ok: false; erro: string; avisos?: string[] };

type CampoColuna =
  | "codigo"
  | "nome"
  | "preco_loja"
  | "preco_ifood"
  | "preco_99"
  | "taxa_ifood"
  | "taxa_99"
  | "cmv_desejado";

const ALIASES: Record<CampoColuna, string[]> = {
  codigo: ["codigo", "código", "cod", "sku", "codigo_externo", "codigo prato", "código prato"],
  nome: ["nome", "prato", "produto", "item", "descricao", "descrição", "nome do prato"],
  preco_loja: [
    "loja",
    "saipos",
    "balcao",
    "balcão",
    "salao",
    "salão",
    "vendas diretas",
    "venda direta",
    "preco_loja",
    "preço loja",
    "preco loja",
    "preco saipos",
    "preço saipos",
    "preco balcao",
    "preço balcão",
    "venda loja",
  ],
  preco_ifood: ["ifood", "i food", "preco_ifood", "preço ifood", "preco ifood", "venda ifood"],
  preco_99: ["99", "99food", "delivery_99", "preco_99", "preço 99", "preco 99", "venda 99"],
  taxa_ifood: ["taxa_ifood", "taxa ifood", "taxa % ifood", "comissao ifood", "comissão ifood"],
  taxa_99: ["taxa_99", "taxa 99", "taxa % 99", "comissao 99", "comissão 99"],
  cmv_desejado: ["cmv", "cmv_desejado", "cmv desejado", "cmv %", "cmv desejado %", "meta cmv"],
};

/** Rótulo da planilha (sem tamanho) → nome do sabor nas fichas. */
const ALIAS_SABOR_MASSA: Record<string, string> = {
  pomodoro: "Pomodoro",
  bolonhesa: "Bolonhesa",
  broccoli: "Brócoli",
  brocoli: "Brócoli",
  "cheddar com bacon": "Cheddar",
  cheddar: "Cheddar",
  parisiense: "Parisiense",
  "quatro queijos": "4 queijos",
  "4 queijos": "4 queijos",
  camarao: "Camarão",
  funghi: "Funghi",
  "ragu de costela": "Ragu de costela",
};

function normalizarCabecalho(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_./\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePrecoReais(valorBruto: unknown): number {
  if (typeof valorBruto === "number" && Number.isFinite(valorBruto)) {
    return valorBruto >= 0 ? Number(valorBruto.toFixed(2)) : 0;
  }
  let limpo = String(valorBruto ?? "")
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s+/g, "")
    .replace(/[−–—]/g, "-");
  if (!limpo || limpo === "-") return 0;
  if (limpo.includes(",") && limpo.includes(".")) {
    limpo = limpo.replace(/\./g, "").replace(/,/g, ".");
  } else if (limpo.includes(",")) {
    limpo = limpo.replace(/,/g, ".");
  }
  const n = Number(limpo);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Number(n.toFixed(2));
}

function mapearColunas(cabecalho: unknown[]): Map<CampoColuna, number> {
  const mapa = new Map<CampoColuna, number>();
  cabecalho.forEach((celula, indice) => {
    const normalizado = normalizarCabecalho(celula);
    if (!normalizado) return;
    for (const [campo, aliases] of Object.entries(ALIASES) as [CampoColuna, string[]][]) {
      if (mapa.has(campo)) continue;
      if (aliases.some((alias) => normalizarCabecalho(alias) === normalizado)) {
        mapa.set(campo, indice);
      }
    }
  });
  return mapa;
}

function celula(linha: unknown[], indice: number | undefined): unknown {
  if (indice === undefined) return "";
  return linha[indice];
}

function canalDaLinha(linha: unknown[]): "ifood" | "loja" | "99" | null {
  for (let i = 0; i < Math.min(linha.length, 4); i++) {
    const n = normalizarCabecalho(linha[i]);
    if (!n) continue;
    if (n === "ifood" || n === "i food") return "ifood";
    if (n === "vendas diretas" || n === "venda direta" || n === "loja" || n === "saipos" || n === "balcao") {
      return "loja";
    }
    if (n === "99" || n === "99food" || n === "delivery 99") return "99";
  }
  return null;
}

function pareceCabecalhoProdutos(linha: unknown[]): boolean {
  const textos = linha.map((c) => String(c ?? "").trim()).filter(Boolean);
  if (textos.length < 3) return false;
  const temCanal = textos.some((t) => normalizarCabecalho(t) === "canal");
  const produtos = textos.filter((t) => /\s+[gm]$/i.test(t));
  return temCanal || produtos.length >= 2;
}

function classificarProdutoPlanilha(rotulo: string): {
  tamanho: "G" | "M" | null;
  tipo: "massa" | "outro";
  saborFicha: string | null;
} {
  const bruto = rotulo.trim();
  const tamanhoMatch = bruto.match(/\s+([GgMm])$/);
  const tamanho = tamanhoMatch ? (tamanhoMatch[1].toUpperCase() as "G" | "M") : null;
  const semTamanho = normalizarCabecalho(bruto.replace(/\s+[GgMm]$/, ""));
  if (
    semTamanho.startsWith("nhoque ") ||
    semTamanho.startsWith("risoto ") ||
    semTamanho.startsWith("salada ") ||
    semTamanho.startsWith("polenta ")
  ) {
    return { tamanho, tipo: "outro", saborFicha: null };
  }
  const saborFicha = ALIAS_SABOR_MASSA[semTamanho] ?? null;
  return { tamanho, tipo: saborFicha ? "massa" : "outro", saborFicha };
}

function linhaFranquia(
  nome: string,
  precos: { loja: number; ifood: number; noventa: number }
): PrecoFranquiaLinha {
  return {
    nome,
    preco_loja: precos.loja,
    preco_ifood: precos.ifood || undefined,
    preco_99: precos.noventa || undefined,
    taxa_ifood_percentual: TAXA_IFOOD_PADRAO_PERCENTUAL,
    taxa_99_percentual: TAXA_99_PADRAO_PERCENTUAL,
    cmv_desejado_percentual: CMV_DESEJADO_PADRAO_PERCENTUAL,
  };
}

/**
 * Layout "Simulador de preços" (pratos em colunas; Ifood / Vendas diretas em linhas).
 * Usa só Box G (tamanho das fichas atuais) e expande sabor → 4 massas.
 */
export function analisarSimuladorPrecosFranquia(matriz: unknown[][]): ResultadoImportacaoPrecosFranquia {
  let headersAtuais: unknown[] | null = null;
  const precosPorRotulo = new Map<string, { loja: number; ifood: number; noventa: number }>();

  for (const linha of matriz) {
    if (!Array.isArray(linha)) continue;

    if (pareceCabecalhoProdutos(linha)) {
      const produtos = linha.filter((c) => /\s+[GgMm]$/i.test(String(c ?? "").trim()));
      if (produtos.length >= 2) headersAtuais = linha;
      continue;
    }

    if (!headersAtuais) continue;
    const canal = canalDaLinha(linha);
    if (!canal) continue;

    for (let c = 0; c < headersAtuais.length; c++) {
      const rotulo = String(headersAtuais[c] ?? "").trim();
      if (!/\s+[GgMm]$/i.test(rotulo)) continue;
      const preco = parsePrecoReais(linha[c]);
      if (preco <= 0) continue;
      const atual = precosPorRotulo.get(rotulo) ?? { loja: 0, ifood: 0, noventa: 0 };
      if (canal === "loja") atual.loja = preco;
      if (canal === "ifood") atual.ifood = preco;
      if (canal === "99") atual.noventa = preco;
      precosPorRotulo.set(rotulo, atual);
    }
  }

  if (precosPorRotulo.size === 0) {
    return { ok: false, erro: "Layout de simulador não reconhecido nesta planilha." };
  }

  const linhas: PrecoFranquiaLinha[] = [];
  const avisos: string[] = [];
  let ignoradosOutros = 0;
  let ignoradosM = 0;
  let saboresG = 0;

  for (const [rotulo, precos] of precosPorRotulo) {
    if (precos.loja <= 0 && precos.ifood <= 0 && precos.noventa <= 0) continue;

    const info = classificarProdutoPlanilha(rotulo);
    if (info.tamanho === "M") {
      ignoradosM += 1;
      continue;
    }
    if (info.tipo !== "massa" || !info.saborFicha) {
      ignoradosOutros += 1;
      continue;
    }
    if (info.tamanho !== "G" && info.tamanho !== null) continue;

    saboresG += 1;
    for (const massa of MASSAS_PRECO_FRANQUIA) {
      linhas.push(linhaFranquia(`${massa} ${info.saborFicha}`, precos));
    }
  }

  if (linhas.length === 0) {
    return {
      ok: false,
      erro:
        "Nenhum preço de Box G (massa) foi mapeado para as fichas. Nhoque/Risoto/Salada/Polenta/Box M ainda não têm ficha correspondente.",
      avisos,
    };
  }

  avisos.push(
    `Simulador Londrina: ${saboresG} sabor(es) Box G → ${linhas.length} ficha(s) de massa (Penne/Talharim/Caracolino/Integral).`
  );
  if (ignoradosOutros > 0) {
    avisos.push(
      `${ignoradosOutros} item(ns) sem ficha (Nhoque, Risoto, Salada, Polenta ou sabores novos) foram ignorados.`
    );
  }
  if (ignoradosM > 0) {
    avisos.push(`${ignoradosM} preço(s) Box M ignorados (fichas atuais são só o tamanho G).`);
  }
  if (!linhas.some((l) => (l.preco_99 ?? 0) > 0)) {
    avisos.push("Canal 99 ausente na planilha — deixe em branco ou preencha na mão.");
  }

  return { ok: true, linhas, avisos };
}

function pareceSimulador(matriz: unknown[][]): boolean {
  const amostra = matriz
    .slice(0, 40)
    .flat()
    .map((c) => normalizarCabecalho(c))
    .join(" ");
  return (
    amostra.includes("simulador") ||
    (amostra.includes("nova precificacao") && amostra.includes("ifood")) ||
    (amostra.includes("vendas diretas") && amostra.includes("ifood"))
  );
}

function analisarPlanilhaColunar(matriz: unknown[][]): ResultadoImportacaoPrecosFranquia {
  const [cabecalho, ...dados] = matriz;
  const colunas = mapearColunas(cabecalho);
  const temIdentificacao = colunas.has("nome") || colunas.has("codigo");
  const temPreco =
    colunas.has("preco_loja") || colunas.has("preco_ifood") || colunas.has("preco_99");

  if (!temIdentificacao) {
    return {
      ok: false,
      erro: "Coluna de identificação ausente. Use cabeçalhos como Nome, Prato ou Código.",
    };
  }
  if (!temPreco) {
    return {
      ok: false,
      erro: "Nenhuma coluna de preço encontrada. Use cabeçalhos como Loja/Saipos, iFood ou 99.",
    };
  }

  const avisos: string[] = [];
  if (!colunas.has("preco_loja")) {
    avisos.push("Sem coluna Loja/Saipos — pratos só com iFood/99 serão aplicados nesses canais.");
  }
  if (!colunas.has("preco_ifood")) {
    avisos.push("Sem coluna iFood — esse canal fica sem alteração de preço (ou 0 se for a única fonte).");
  }

  const linhas: PrecoFranquiaLinha[] = [];
  for (const linha of dados) {
    if (!Array.isArray(linha) || linha.every((c) => String(c ?? "").trim() === "")) continue;

    const nome = String(celula(linha, colunas.get("nome")) ?? "").trim();
    const codigo = String(celula(linha, colunas.get("codigo")) ?? "").trim();
    if (!nome && !codigo) continue;

    const preco_loja = parsePrecoReais(celula(linha, colunas.get("preco_loja")));
    const preco_ifood = parsePrecoReais(celula(linha, colunas.get("preco_ifood")));
    const preco_99 = parsePrecoReais(celula(linha, colunas.get("preco_99")));
    if (preco_loja <= 0 && preco_ifood <= 0 && preco_99 <= 0) continue;

    const taxaIfood = parsePrecoReais(celula(linha, colunas.get("taxa_ifood")));
    const taxa99 = parsePrecoReais(celula(linha, colunas.get("taxa_99")));
    const cmv = parsePrecoReais(celula(linha, colunas.get("cmv_desejado")));

    linhas.push({
      codigo: codigo || undefined,
      nome: nome || codigo,
      preco_loja,
      preco_ifood: preco_ifood || undefined,
      preco_99: preco_99 || undefined,
      taxa_ifood_percentual: taxaIfood || TAXA_IFOOD_PADRAO_PERCENTUAL,
      taxa_99_percentual: taxa99 || TAXA_99_PADRAO_PERCENTUAL,
      cmv_desejado_percentual: cmv || CMV_DESEJADO_PADRAO_PERCENTUAL,
    });
  }

  if (linhas.length === 0) {
    return {
      ok: false,
      erro: "Nenhuma linha com nome/código e preço válido foi encontrada.",
      avisos,
    };
  }

  return { ok: true, linhas, avisos };
}

export function validarArquivoPrecosFranquia(arquivo: { name: string; size: number }): string | null {
  const nome = arquivo.name.toLowerCase();
  if (!nome.endsWith(PRECOS_FRANQUIA_EXTENSAO) && !nome.endsWith(".xls")) {
    return "Formato inválido. Selecione um arquivo Excel (.xlsx).";
  }
  if (arquivo.size <= 0) return "Arquivo vazio.";
  if (arquivo.size > PRECOS_FRANQUIA_MAX_BYTES) {
    return "Arquivo excede 10 MB. Envie uma planilha menor.";
  }
  return null;
}

/**
 * Lê a planilha da franquia (1ª aba).
 * Suporta tabela coluna a coluna ou o simulador (pratos em colunas, canais em linhas).
 */
export function analisarPlanilhaPrecosFranquia(
  input: ArrayBuffer | Uint8Array
): ResultadoImportacaoPrecosFranquia {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(input, {
      type: "array",
      cellText: true,
      raw: false,
    });
  } catch {
    return { ok: false, erro: "Arquivo corrompido ou inválido. Verifique o .xlsx." };
  }

  const nomeAba = workbook.SheetNames[0];
  const planilha = nomeAba ? workbook.Sheets[nomeAba] : undefined;
  if (!planilha) {
    return { ok: false, erro: "A planilha está vazia ou sem abas legíveis." };
  }

  const matriz = XLSX.utils.sheet_to_json(planilha, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  }) as unknown[][];

  if (matriz.length < 2) {
    return { ok: false, erro: "A planilha precisa de cabeçalho e pelo menos uma linha de preço." };
  }

  if (pareceSimulador(matriz)) {
    const simulador = analisarSimuladorPrecosFranquia(matriz);
    if (simulador.ok) return simulador;
    const colunar = analisarPlanilhaColunar(matriz);
    if (colunar.ok) return colunar;
    return simulador;
  }

  return analisarPlanilhaColunar(matriz);
}
