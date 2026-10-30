import type { Produto } from "@/lib/types";

function numeroPositivo(valor?: number): number | undefined {
  return valor !== undefined && Number.isFinite(valor) && valor > 0 ? valor : undefined;
}

function fatorValido(fator?: number): number {
  const f = Number(fator);
  return Number.isFinite(f) && f > 0 ? f : 1;
}

export type CamposMioloEmbalagem = Pick<
  Produto,
  | "fator_conversao"
  | "subunidade_id"
  | "quantidade_subunidade"
  | "conteudo_por_subunidade"
  | "unidade_uso_id"
>;

/**
 * Modo miolo ativo: informou quantas unidades há dentro da embalagem.
 * Total = qtd × (conteúdo de cada; padrão 1).
 */
export function modoMioloEmbalagemAtivo(
  produto: Pick<Produto, "quantidade_subunidade" | "conteudo_por_subunidade">
): boolean {
  return numeroPositivo(produto.quantidade_subunidade) !== undefined;
}

/**
 * Conteúdo total compra→uso.
 * Milho: 6 × 1,5 kg = 9. Canudo: 100 × 1 = 100. Bacon: só "5 kg na pacote" (sem qtd interna).
 */
export function conteudoTotalEmbalagem(produto: CamposMioloEmbalagem): number {
  const qtd = numeroPositivo(produto.quantidade_subunidade);
  const cada = numeroPositivo(produto.conteudo_por_subunidade);
  if (qtd !== undefined) {
    // Canudo: cada omitido → 1. Milho: cada = 1,5.
    return Math.round(qtd * (cada ?? 1) * 1e6) / 1e6;
  }
  if (cada !== undefined) {
    // Bacon: pergunta 2 vazia; pergunta 4 é o conteúdo total da embalagem.
    return cada;
  }
  return fatorValido(produto.fator_conversao);
}

/**
 * Atualiza fator_conversao a partir do miolo e recalcula CMV a partir da embalagem.
 */
export function sincronizarFatorDoMiolo(
  produto: Produto
): Pick<Produto, "fator_conversao" | "custo_unitario" | "preco_embalagem_compra"> {
  const fator = conteudoTotalEmbalagem(produto);
  const precos = aoAlterarConteudoEmbalagem(fator, {
    preco_embalagem_compra: produto.preco_embalagem_compra,
    custo_unitario: produto.custo_unitario,
  });
  return {
    fator_conversao: precos.fator_conversao,
    preco_embalagem_compra: precos.preco_embalagem_compra,
    custo_unitario: precos.custo_unitario,
  };
}

function quaseIgual(a: number, b: number, toleranciaRelativa = 0.02): boolean {
  const escala = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) <= escala * toleranciaRelativa;
}

/** Custo por unidade de uso a partir do preço da embalagem de compra. */
export function custoUsoDeEmbalagem(precoEmbalagem: number, fatorConversao?: number): number {
  const fator = fatorValido(fatorConversao);
  return Math.round((precoEmbalagem / fator) * 1e6) / 1e6;
}

/** Preço da embalagem a partir do custo por unidade de uso. */
export function precoEmbalagemDeCustoUso(custoUso: number, fatorConversao?: number): number {
  const fator = fatorValido(fatorConversao);
  return Math.round(custoUso * fator * 1e6) / 1e6;
}

/**
 * Preço de referência para cotação / pesquisa de mercado:
 * embalagem de compra, senão custo_uso × fator, senão custo_uso.
 */
export function precoReferenciaCotacao(
  produto: Pick<Produto, "preco_embalagem_compra" | "custo_unitario" | "fator_conversao">
): number | undefined {
  const embalagem = numeroPositivo(produto.preco_embalagem_compra);
  if (embalagem !== undefined) return embalagem;

  const custo = numeroPositivo(produto.custo_unitario);
  if (custo === undefined) return undefined;

  const fator = fatorValido(produto.fator_conversao);
  if (fator === 1) return custo;
  // Sem embalagem salva: o custo legado costuma ser o preço da embalagem de compra.
  return custo;
}

export type RefsPrecoProduto = {
  /** Média de precos_historico (em tese por unidade de uso; às vezes veio sem converter). */
  mediaHistorica?: number;
  /** Último preço de fornecedor (unidade de compra / embalagem). */
  precoCompraFornecedor?: number;
};

/**
 * Normaliza preços do cadastro:
 * - sem preço no cadastro → preenche com último preço do fornecedor / média histórica
 * - só custo + fator 1 → espelha na embalagem
 * - só custo + fator > 1 → custo legado = preço da embalagem; CMV = embalagem ÷ conteúdo
 * - embalagem ≈ custo com fator > 1 → recalcula CMV
 * - embalagem ≈ custo × fator indevido (ex.: 490/4,90 com pacote a 4,90) → corrige
 */
export function normalizarPrecosCadastroProduto(
  produto: Produto,
  refs: RefsPrecoProduto = {}
): boolean {
  let mudou = false;
  if (modoMioloEmbalagemAtivo(produto)) {
    const total = conteudoTotalEmbalagem(produto);
    if (!quaseIgual(fatorValido(produto.fator_conversao), total)) {
      produto.fator_conversao = total;
      mudou = true;
    }
  }
  const fator = fatorValido(produto.fator_conversao);
  let emb = numeroPositivo(produto.preco_embalagem_compra);
  let custo = numeroPositivo(produto.custo_unitario);

  // Cadastro vazio: NF/fornecedor já tem preço, mas o produto nunca foi preenchido.
  if (!emb && custo === undefined) {
    const compra = numeroPositivo(refs.precoCompraFornecedor);
    const media = numeroPositivo(refs.mediaHistorica);
    if (compra !== undefined) {
      produto.preco_embalagem_compra = compra;
      produto.custo_unitario = custoUsoDeEmbalagem(compra, fator);
      return true;
    }
    if (media !== undefined) {
      // precos_historico já vem em unidade de uso (precoPorUnidadeUso na NF).
      produto.custo_unitario = media;
      produto.preco_embalagem_compra = precoEmbalagemDeCustoUso(media, fator);
      return true;
    }
    return false;
  }

  if (!emb && custo !== undefined) {
    if (fator === 1) {
      produto.preco_embalagem_compra = custo;
    } else {
      // Legado: custo_unitario era o preço da embalagem (pacote R$ 4,90, não R$ 0,049/un).
      produto.preco_embalagem_compra = custo;
      produto.custo_unitario = custoUsoDeEmbalagem(custo, fator);
    }
    return true;
  }

  // Só embalagem preenchida → deriva CMV.
  if (emb !== undefined && custo === undefined) {
    produto.custo_unitario = custoUsoDeEmbalagem(emb, fator);
    return true;
  }

  if (emb !== undefined && custo !== undefined && fator > 1 && quaseIgual(emb, custo)) {
    produto.custo_unitario = custoUsoDeEmbalagem(emb, fator);
    return true;
  }

  if (emb !== undefined && custo !== undefined && fator > 1 && quaseIgual(emb, custo * fator)) {
    const candidatosCompra = [refs.precoCompraFornecedor, refs.mediaHistorica].filter(
      (v): v is number => v !== undefined && Number.isFinite(v) && v > 0
    );

    for (const refCompra of candidatosCompra) {
      // Ref parece preço de embalagem preservado no "custo", e embalagem foi multiplicada pelo fator.
      if (quaseIgual(custo, refCompra) && quaseIgual(emb, refCompra * fator) && !quaseIgual(emb, refCompra)) {
        // Evita falso positivo quando a média já é custo de uso correto (ex.: 0,049):
        // nesse caso emb ≈ ref*fator também, mas ref é pequeno. Só corrige se a ref
        // parece preço de pacote (>= R$ 1) e o conteúdo é grande (descartáveis etc.).
        const parecePacoteMultiplicado = refCompra >= 1 && fator >= 50;
        const refEhFornecedor = refs.precoCompraFornecedor !== undefined && quaseIgual(refCompra, refs.precoCompraFornecedor);
        if (refEhFornecedor || parecePacoteMultiplicado) {
          produto.preco_embalagem_compra = refCompra;
          produto.custo_unitario = custoUsoDeEmbalagem(refCompra, fator);
          mudou = true;
          break;
        }
      }
    }
  }

  return mudou;
}

/** Atualiza preço de cadastro a partir do preço da NF (unidade de compra). */
export function aplicarPrecoNotaNoProduto(
  produto: Produto,
  precoUnidadeCompra: number,
  fatorConversao = produto.fator_conversao
): boolean {
  const preco = numeroPositivo(precoUnidadeCompra);
  if (preco === undefined) return false;
  const fator = fatorValido(fatorConversao);
  produto.preco_embalagem_compra = preco;
  produto.custo_unitario = custoUsoDeEmbalagem(preco, fator);
  return true;
}

/**
 * Cadastro sem preço de compra nem CMV: mostra o valor desta NF
 * (unidade comercial, ex. o pacote) e deriva o custo de uso.
 * Não substitui um preço que o produto já tenha.
 */
export function preencherPrecoCompraDaNota(produto: Produto, precoUnidadeCompra?: number): boolean {
  if (numeroPositivo(produto.preco_embalagem_compra) !== undefined) return false;
  if (numeroPositivo(produto.custo_unitario) !== undefined) return false;
  if (precoUnidadeCompra === undefined) return false;
  return aplicarPrecoNotaNoProduto(produto, precoUnidadeCompra, produto.fator_conversao);
}

/**
 * Completa preço de embalagem ausente.
 * Com fator > 1, assume custo legado = preço da embalagem (não custo × fator).
 */
export function completarPrecoEmbalagemLegado(produto: Produto): boolean {
  return normalizarPrecosCadastroProduto(produto);
}

/**
 * Ao informar só o conteúdo (fator) sem embalagem: o valor em custo_unitario
 * costuma ser o preço do pacote — não multiplicar.
 */
export function aoAlterarConteudoEmbalagem(
  fatorNovo: number,
  atual: { preco_embalagem_compra?: number; custo_unitario?: number }
): { fator_conversao: number; preco_embalagem_compra?: number; custo_unitario?: number } {
  const fator = fatorValido(fatorNovo);
  const emb = numeroPositivo(atual.preco_embalagem_compra);
  const custo = numeroPositivo(atual.custo_unitario);

  if (emb !== undefined) {
    return {
      fator_conversao: fator,
      preco_embalagem_compra: emb,
      custo_unitario: custoUsoDeEmbalagem(emb, fator),
    };
  }

  // fator ≠ 1 (ex.: 5 kg ou 0,5 kg): custo legado costuma ser o preço da embalagem.
  if (custo !== undefined && fator !== 1) {
    return {
      fator_conversao: fator,
      preco_embalagem_compra: custo,
      custo_unitario: custoUsoDeEmbalagem(custo, fator),
    };
  }

  if (custo !== undefined) {
    return {
      fator_conversao: fator,
      preco_embalagem_compra: custo,
      custo_unitario: custo,
    };
  }

  return { fator_conversao: fator };
}

/**
 * Se a média histórica parece preço de embalagem (≈ embalagem), converte para CMV.
 * Caso contrário devolve a média como custo de uso.
 */
export function custoUsoApartirDaMediaHistorica(
  mediaHistorica: number,
  fatorConversao?: number,
  precoEmbalagem?: number
): number {
  const fator = fatorValido(fatorConversao);
  const emb = numeroPositivo(precoEmbalagem);
  if (fator > 1 && emb !== undefined && quaseIgual(mediaHistorica, emb)) {
    return custoUsoDeEmbalagem(mediaHistorica, fator);
  }
  return Math.round(mediaHistorica * 1e4) / 1e4;
}
