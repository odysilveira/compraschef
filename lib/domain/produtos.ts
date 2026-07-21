import type { DB, FornecedorProduto, Produto, Unidade } from "../types";

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

export function unidadePorSigla(db: DB, sigla?: string): Unidade | undefined {
  const procurada = normalizarIdentificador(sigla);
  if (!procurada) return undefined;
  return db.unidades.find((u) => normalizarIdentificador(u.sigla) === procurada);
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
  const ean = normalizarIdentificador(dados.ean);

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
