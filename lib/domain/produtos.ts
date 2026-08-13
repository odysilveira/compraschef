import type { CategoriaProduto, DB, FornecedorProduto, Produto, Unidade } from "../types";

/** Normalização usada somente para comparar identificadores vindos de sistemas diferentes. */
export function normalizarIdentificador(valor?: string): string {
  return (valor ?? "").trim().toUpperCase();
}

export function normalizarTexto(valor?: string): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Aliases comuns de uCom da NF-e → chave canônica (sigla/código).
 * Ex.: UND/PC → UN, CXA → CX, LT → L.
 */
const ALIASES_UNIDADE_NFE: Record<string, string> = {
  UN: "UN",
  UND: "UN",
  UNID: "UN",
  UNIDADE: "UN",
  PC: "UN",
  PÇ: "UN",
  PECA: "UN",
  CX: "CX",
  CXA: "CX",
  CAIXA: "CX",
  FD: "FD",
  FAR: "FD",
  FARDO: "FD",
  KG: "KG",
  KGS: "KG",
  KILO: "KG",
  QUILO: "KG",
  G: "G",
  GR: "G",
  GRAM: "G",
  GRAMA: "G",
  L: "L",
  LT: "L",
  LIT: "L",
  LITRO: "L",
  ML: "ML",
  SC: "SC",
  SAC: "SC",
  SACO: "SC",
  PCT: "PCT",
  PCTE: "PCT",
  PCTO: "PCT",
  PAC: "PCT",
  PACOTE: "PCT",
  DZ: "DZ",
  DUZIA: "DZ",
  BD: "BD",
  BDJ: "BD",
  BANDEJA: "BD",
  CJ: "CJ",
  CONJ: "CJ",
  CONJUNTO: "CJ",
};

/** Normaliza uCom da NF-e para chave comparável (ex.: "und" → "UN"). */
export function chaveUnidadeDaNota(uCom?: string): string {
  const bruto = normalizarIdentificador(uCom)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
  if (!bruto) return "";
  return ALIASES_UNIDADE_NFE[bruto] ?? bruto;
}

function unidadeCasaComChave(unidade: Unidade, chave: string): boolean {
  if (!chave) return false;
  const sigla = chaveUnidadeDaNota(unidade.sigla);
  const codigo = chaveUnidadeDaNota(unidade.codigo_externo);
  return sigla === chave || codigo === chave;
}

/** Localiza unidade cadastrada a partir da sigla/uCom da NF-e (com aliases). */
export function unidadePorSigla(db: DB, sigla?: string): Unidade | undefined {
  const chave = chaveUnidadeDaNota(sigla);
  if (!chave) return undefined;
  return db.unidades.find((u) => unidadeCasaComChave(u, chave));
}

/**
 * Garante unidade para o uCom da NF-e: reutiliza cadastro ou cria a partir do XML.
 * Assim o cadastro de produto já abre com a unidade de compra correta.
 */
export function garantirUnidadeDaNota(db: DB, uCom?: string): Unidade {
  const existente = unidadePorSigla(db, uCom);
  if (existente) return existente;

  const chave = chaveUnidadeDaNota(uCom) || "UN";
  const sigla = chave.toLowerCase();
  let id = `un-${sigla}`;
  if (db.unidades.some((u) => u.id === id)) {
    id = `un-${sigla}-${db.unidades.length + 1}`;
  }

  const nova: Unidade = {
    id,
    codigo_externo: chave,
    nome: sigla,
    sigla,
  };
  db.unidades.push(nova);
  return nova;
}

function slugCategoria(valor?: string): string {
  return normalizarTexto(valor ?? "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function nomeCategoria(valor?: string): string {
  const base = (valor ?? "").trim();
  if (!base) return "Sem categoria";
  return base
    .split(/\s+/)
    .map((palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase())
    .join(" ");
}

export function associarCategoriasProdutos(db: DB): { categorias: CategoriaProduto[]; categoriasMapeadas: Map<string, string> } {
  const categoriasExistentes = Array.isArray(db.categorias_produtos) ? db.categorias_produtos : [];
  const categorias = [...categoriasExistentes];
  const categoriasMapeadas = new Map<string, string>();

  for (const produto of db.produtos) {
    if (!produto.ativo) continue;

    const categoriaAntiga = produto.categoria?.trim();
    if (!categoriaAntiga) {
      if (!produto.categoria_id) {
        const semCategoria = categorias.find((c) => c.codigo === "sem-categoria");
        if (semCategoria) {
          produto.categoria_id = semCategoria.id;
          produto.categoria = undefined;
        }
      }
      continue;
    }

    const codigo = slugCategoria(categoriaAntiga) || "sem-categoria";
    if (!categorias.some((c) => c.codigo === codigo)) {
      categorias.push({
        id: `cat-${codigo}-${categorias.length + 1}`,
        nome: nomeCategoria(categoriaAntiga),
        codigo,
        ativo: true,
      });
    }

    const categoria = categorias.find((c) => c.codigo === codigo);
    if (categoria) {
      categoriasMapeadas.set(produto.id, categoria.id);
      produto.categoria_id = categoria.id;
      produto.categoria = undefined;
    }
  }

  db.categorias_produtos = categorias;
  return { categorias, categoriasMapeadas };
}

/** Ignora marcadores da NF-e que significam ausência de GTIN/EAN. */
export function codigoDeBarrasValido(valor?: string): string | undefined {
  const codigo = valor?.trim();
  if (!codigo || /^(SEM\s*GTIN|SEM\s*EAN)$/i.test(codigo)) return undefined;
  return codigo;
}

export interface DadosVinculoNota {
  idNovo: string;
  fornecedorId: string;
  produtoId: string;
  codigoFornecedor?: string;
  ean?: string;
  unidadeCompraId?: string;
  fatorConversao?: number;
  ultimoPreco?: number;
  atualizadoEm: string;
}

/**
 * Aprende a correspondência fornecedor × produto durante a conferência da NF-e.
 * Se o vínculo já existir, preserva conversões cadastradas e completa os códigos
 * que permitirão reconhecer automaticamente as próximas notas.
 */
export function registrarVinculoDaNota(db: DB, dados: DadosVinculoNota): FornecedorProduto {
  let vinculo = db.fornecedor_produtos.find(
    (fp) => fp.fornecedor_id === dados.fornecedorId && fp.produto_id === dados.produtoId
  );
  if (!vinculo) {
    vinculo = {
      id: dados.idNovo,
      fornecedor_id: dados.fornecedorId,
      produto_id: dados.produtoId,
    };
    db.fornecedor_produtos.push(vinculo);
  }

  const codigoFornecedor = dados.codigoFornecedor?.trim();
  const ean = codigoDeBarrasValido(dados.ean);
  if (codigoFornecedor) vinculo.codigo_produto_fornecedor = codigoFornecedor;
  if (ean) vinculo.codigo_barras_fornecedor = ean;
  if (dados.unidadeCompraId) vinculo.unidade_compra_id = dados.unidadeCompraId;
  if (dados.fatorConversao !== undefined && Number.isFinite(dados.fatorConversao) && dados.fatorConversao > 0) {
    vinculo.fator_conversao = dados.fatorConversao;
  }
  if (dados.ultimoPreco !== undefined && Number.isFinite(dados.ultimoPreco) && dados.ultimoPreco >= 0) {
    vinculo.ultimo_preco = dados.ultimoPreco;
    vinculo.ultimo_preco_unidade_id = dados.unidadeCompraId;
  }
  vinculo.atualizado_em = dados.atualizadoEm;
  return vinculo;
}

export function vinculoFornecedorProduto(
  db: DB,
  fornecedorId: string | undefined,
  produtoId: string
): FornecedorProduto | undefined {
  if (!fornecedorId) return undefined;
  return db.fornecedor_produtos.find(
    (fp) => fp.fornecedor_id === fornecedorId && fp.produto_id === produtoId
  );
}

export type OrigemConversao = "unidade_uso" | "cadastro_fornecedor" | "cadastro_produto" | "assumida";

export interface ResultadoConversao {
  quantidadeUso: number;
  fator: number;
  origem: OrigemConversao;
  reconhecida: boolean;
  unidadeOrigemId?: string;
}

/**
 * Converte uma quantidade comercial para a unidade de uso do estoque.
 *
 * Ordem de decisão:
 * 1. a própria unidade de uso;
 * 2. embalagem/unidade específica do fornecedor;
 * 3. unidade de compra padrão do produto;
 * 4. fator 1, marcado como não reconhecido, para nunca inventar uma conversão.
 */
export function converterParaUnidadeUso(
  db: DB,
  produtoId: string,
  quantidade: number,
  opcoes: { unidadeOrigemId?: string; fornecedorId?: string } = {}
): ResultadoConversao {
  const produto = db.produtos.find((p) => p.id === produtoId);
  const unidadeOrigemId = opcoes.unidadeOrigemId;
  if (!produto) {
    return { quantidadeUso: quantidade, fator: 1, origem: "assumida", reconhecida: false, unidadeOrigemId };
  }

  if (!unidadeOrigemId || unidadeOrigemId === produto.unidade_uso_id) {
    return {
      quantidadeUso: quantidade,
      fator: 1,
      origem: "unidade_uso",
      reconhecida: true,
      unidadeOrigemId: unidadeOrigemId ?? produto.unidade_uso_id,
    };
  }

  const vinculo = vinculoFornecedorProduto(db, opcoes.fornecedorId, produtoId);
  if (vinculo?.unidade_compra_id === unidadeOrigemId) {
    const fator = fatorValido(vinculo.fator_conversao) ?? fatorValido(produto.fator_conversao) ?? 1;
    return {
      quantidadeUso: quantidade * fator,
      fator,
      origem: "cadastro_fornecedor",
      reconhecida: true,
      unidadeOrigemId,
    };
  }

  if (produto.unidade_compra_id === unidadeOrigemId) {
    const fator = fatorValido(produto.fator_conversao) ?? 1;
    return {
      quantidadeUso: quantidade * fator,
      fator,
      origem: "cadastro_produto",
      reconhecida: true,
      unidadeOrigemId,
    };
  }

  return {
    quantidadeUso: quantidade,
    fator: 1,
    origem: "assumida",
    reconhecida: false,
    unidadeOrigemId,
  };
}

/** Converte preço por unidade comercial em preço comparável por unidade de uso. */
export function precoPorUnidadeUso(
  db: DB,
  produtoId: string,
  precoUnitario: number,
  opcoes: { unidadeOrigemId?: string; fornecedorId?: string } = {}
): number {
  const conversao = converterParaUnidadeUso(db, produtoId, 1, opcoes);
  return conversao.fator > 0 ? precoUnitario / conversao.fator : precoUnitario;
}

function fatorValido(valor?: number): number | undefined {
  return valor !== undefined && Number.isFinite(valor) && valor > 0 ? valor : undefined;
}

export type CriterioIdentificacaoProduto =
  | "codigo_fornecedor"
  | "ean_fornecedor"
  | "ean_produto"
  | "codigo_easeeat"
  | "nome"
  | "nao_encontrado";

export interface IdentificacaoProduto {
  produto?: Produto;
  criterio: CriterioIdentificacaoProduto;
}

/**
 * Identifica item de NF-e sem confundir o cProd do fornecedor com o código do EASE EAT.
 * O código EASE EAT permanece apenas como fallback explícito para fornecedores que o reutilizem.
 */
export function identificarProduto(
  db: DB,
  dados: { fornecedorId?: string; codigoFornecedor?: string; ean?: string; nome?: string }
): IdentificacaoProduto {
  const codigo = normalizarIdentificador(dados.codigoFornecedor);
  const ean = normalizarIdentificador(codigoDeBarrasValido(dados.ean));

  if (dados.fornecedorId && codigo) {
    const vinculo = db.fornecedor_produtos.find(
      (fp) =>
        fp.fornecedor_id === dados.fornecedorId &&
        normalizarIdentificador(fp.codigo_produto_fornecedor) === codigo
    );
    const produto = vinculo ? db.produtos.find((p) => p.ativo && p.id === vinculo.produto_id) : undefined;
    if (produto) return { produto, criterio: "codigo_fornecedor" };
  }

  if (dados.fornecedorId && ean) {
    const vinculo = db.fornecedor_produtos.find(
      (fp) =>
        fp.fornecedor_id === dados.fornecedorId &&
        normalizarIdentificador(fp.codigo_barras_fornecedor) === ean
    );
    const produto = vinculo ? db.produtos.find((p) => p.ativo && p.id === vinculo.produto_id) : undefined;
    if (produto) return { produto, criterio: "ean_fornecedor" };
  }

  if (ean) {
    const codigos = Array.isArray(db.produto_codigos_barras) ? db.produto_codigos_barras : [];
    const codigo = codigos.find((c) => normalizarIdentificador(c.codigo_barras) === ean);
    if (codigo) {
      const produto = db.produtos.find((p) => p.ativo && p.id === codigo.produto_id);
      if (produto) return { produto, criterio: "ean_produto" };
    }
    const produto = db.produtos.find(
      (p) => p.ativo && normalizarIdentificador(p.codigo_barras) === ean
    );
    if (produto) return { produto, criterio: "ean_produto" };
  }

  if (codigo) {
    const produto = db.produtos.find(
      (p) => p.ativo && normalizarIdentificador(p.codigo_externo) === codigo
    );
    if (produto) return { produto, criterio: "codigo_easeeat" };
  }

  const nomeNota = normalizarTexto(dados.nome);
  if (nomeNota) {
    const produto = db.produtos.find((p) => {
      if (!p.ativo) return false;
      const nomeProduto = normalizarTexto(p.nome);
      return nomeProduto === nomeNota || nomeNota.includes(nomeProduto) || nomeProduto.includes(nomeNota);
    });
    if (produto) return { produto, criterio: "nome" };
  }

  return { criterio: "nao_encontrado" };
}
