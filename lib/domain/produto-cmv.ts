import type { ContaDre, Produto } from "@/lib/types";

/** Contas DRE do grupo CMV (custos variáveis). */
export function contaDreEhCmv(conta?: Pick<ContaDre, "grupo"> | null): boolean {
  return conta?.grupo === "custos_variaveis";
}

/**
 * Heurística para produtos da NF / catálogo:
 * limpeza, embalagem e descartáveis operacionais ficam fora do food CMV.
 */
export function inferirEntraNoCmv(opts: {
  nome?: string;
  contaDreId?: string;
  contasDre?: ContaDre[];
}): boolean {
  const contaId = (opts.contaDreId ?? "").trim();
  if (contaId && Array.isArray(opts.contasDre)) {
    const conta = opts.contasDre.find((c) => c.id === contaId);
    if (conta && !contaDreEhCmv(conta)) return false;
    if (contaId === "dre-op-limpeza") return false;
  }

  const nome = (opts.nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  if (!nome) return true;

  // Só limpeza/higiene operacional fica fora do CMV food.
  // Embalagem/descartáveis de venda entram no CMV (conta Descartáveis).
  const foraCmv = [
    /\bAGUA\s*SANIT/,
    /\bALCOOL\b/,
    /\bDETERGENTE\b/,
    /\bSABAO\b/,
    /\bSABONETE\b/,
    /\bDESINFETANTE\b/,
    /\bLIMPEZA\b/,
    /\bMULTIUSO\b/,
    /\bCLORO\b/,
    /\bPAPEL\s*TOALHA\b/,
    /\bPAPEL\s*HIGIEN/,
  ];

  return !foraCmv.some((re) => re.test(nome));
}

/** True se o produto entra no CMV food (compras). Ausente = true (legado). */
export function produtoEntraNoCmv(produto?: Pick<Produto, "entra_no_cmv" | "nome" | "conta_dre_id"> | null): boolean {
  if (!produto) return true;
  if (produto.entra_no_cmv === false) return false;
  if (produto.entra_no_cmv === true) return true;
  return inferirEntraNoCmv({ nome: produto.nome, contaDreId: produto.conta_dre_id });
}

/** Preenche `entra_no_cmv` onde ainda não foi definido. Retorna se alterou algo. */
export function garantirEntraNoCmvProdutos(
  produtos: Produto[],
  contasDre?: ContaDre[]
): boolean {
  let mudou = false;
  for (const produto of produtos) {
    if (produto.entra_no_cmv !== undefined) continue;
    produto.entra_no_cmv = inferirEntraNoCmv({
      nome: produto.nome,
      contaDreId: produto.conta_dre_id,
      contasDre,
    });
    mudou = true;
  }
  return mudou;
}
