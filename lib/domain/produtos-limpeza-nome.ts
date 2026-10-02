import type { DB, Produto } from "../types";

/** Nome só com letras maiúsculas (padrão típico da descrição da NF-e). */
export function nomeProdutoCaixaAlta(nome?: string): boolean {
  const texto = (nome ?? "").trim();
  if (!texto) return false;
  const temLetra = /\p{L}/u.test(texto);
  const temMinuscula = /\p{Ll}/u.test(texto);
  return temLetra && !temMinuscula;
}

/** Nome com alguma letra minúscula (catálogo / seed / porcionados). */
export function nomeProdutoComMinusculas(nome?: string): boolean {
  return /\p{Ll}/u.test((nome ?? "").trim());
}

/** Produtos ativos cujo nome não está em CAIXA ALTA (ex.: "4 Queijos G", "Base de risoto…"). */
export function listarProdutosNomeTitulo(db: DB): Produto[] {
  return db.produtos.filter((p) => p.ativo !== false && nomeProdutoComMinusculas(p.nome));
}

/**
 * Remove da lista (desativa) produtos com nome em título/minúsculas,
 * mantendo apenas os em CAIXA ALTA vindos da conferência de NF.
 */
export function desativarProdutosNomeTitulo(db: DB): { desativados: number; nomes: string[] } {
  const alvos = listarProdutosNomeTitulo(db);
  const nomes: string[] = [];
  for (const produto of alvos) {
    produto.ativo = false;
    nomes.push(produto.nome);
  }
  return { desativados: alvos.length, nomes };
}

/** Produtos inativos cujo nome tem minúsculas (candidatos da limpeza por caixa). */
export function listarProdutosNomeTituloInativos(db: DB): Produto[] {
  return db.produtos.filter((p) => p.ativo === false && nomeProdutoComMinusculas(p.nome));
}

/** Reativa produtos desativados pela limpeza de nomes em título/minúsculas. */
export function reativarProdutosNomeTitulo(db: DB): { reativados: number; nomes: string[] } {
  const alvos = listarProdutosNomeTituloInativos(db);
  const nomes: string[] = [];
  for (const produto of alvos) {
    produto.ativo = true;
    nomes.push(produto.nome);
  }
  return { reativados: alvos.length, nomes };
}
