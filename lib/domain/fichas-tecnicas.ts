import type {
  FichaTecnica,
  FichaTecnicaAlergenicos,
  FichaTecnicaCustoSnapshot,
  IngredienteCustoDetalhe,
  Produto,
  PresencaAlergenico,
  Unidade,
} from "../types";

export interface IngredientePendente {
  tipo: "PRODUTO" | "SUB_RECEITA";
  id: string;
  nome: string;
}

export interface ResultadoCalculoCusto {
  custo_total: number; // em centavos
  completo: boolean;
  ingredientes_sem_custo: IngredientePendente[];
}

export interface OpcoesConsolidacaoAlergenicos {
  alergenicos_produtos?: Record<string, FichaTecnicaAlergenicos>;
}

export interface SeletorConfiguracaoPorcionamento {
  id?: string;
  codigo?: string;
  nome?: string;
}

const RANK_ALERGENICO: Record<PresencaAlergenico, number> = {
  NAO_INFORMADO: 0,
  PODE_CONTER: 1,
  CONTEM: 2,
};

function cloneDefensivo<T>(valor: T): T {
  if (Array.isArray(valor)) {
    return valor.map((item) => cloneDefensivo(item)) as T;
  }

  if (valor && typeof valor === "object") {
    const entrada = valor as Record<string, unknown>;
    const saida: Record<string, unknown> = {};
    for (const chave of Object.keys(entrada)) {
      saida[chave] = cloneDefensivo(entrada[chave]);
    }
    return saida as T;
  }

  return valor;
}

function congelarProfundo<T>(valor: T): Readonly<T> {
  if (!valor || typeof valor !== "object") {
    return valor;
  }

  if (Array.isArray(valor)) {
    for (const item of valor) {
      congelarProfundo(item);
    }
  } else {
    const entrada = valor as Record<string, unknown>;
    for (const chave of Object.keys(entrada)) {
      congelarProfundo(entrada[chave]);
    }
  }

  return Object.freeze(valor);
}

function assertQuantidadePositiva(quantidade: number, contexto: string): void {
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    throw new Error(`${contexto} inválida: ${quantidade}. Deve ser maior que zero.`);
  }
}

function assertRendimentoPositivo(rendimento: number, contexto: string): void {
  if (!Number.isFinite(rendimento) || rendimento <= 0) {
    throw new Error(`${contexto} inválido: ${rendimento}. Deve ser maior que zero.`);
  }
}

function assertResponsavelInformado(responsavel: string | undefined, acao: string): void {
  if (responsavel === undefined) {
    return;
  }
  if (!responsavel.trim()) {
    throw new Error(`Responsável é obrigatório para ${acao}.`);
  }
}

function assertFatorConversaoValido(produto: Produto): void {
  if (!Number.isFinite(produto.fator_conversao) || produto.fator_conversao <= 0) {
    throw new Error(
      `Produto ${produto.nome} (${produto.id}) possui fator de conversão inválido: ${produto.fator_conversao}.`
    );
  }
}

function validarVersaoExiste(
  ficha: FichaTecnica,
  versaoEsperada: string | undefined,
  subReceitaId: string
): void {
  if (versaoEsperada && ficha.versao !== versaoEsperada) {
    throw new Error(
      `Sub-receita com id ${subReceitaId} e versão ${versaoEsperada} não encontrada.`
    );
  }
}

function obterSubReceitaIngrediente(
  ingrediente: FichaTecnica["ingredientes"][number],
  todasFichas: FichaTecnica[]
): FichaTecnica {
  if (!ingrediente.sub_receita_id) {
    throw new Error(`Ingrediente ${ingrediente.id} do tipo SUB_RECEITA sem sub_receita_id.`);
  }

  const candidatas = todasFichas.filter((f) => f.id === ingrediente.sub_receita_id);
  if (candidatas.length === 0) {
    throw new Error(`Sub-receita com id ${ingrediente.sub_receita_id} não encontrada.`);
  }

  if (!ingrediente.sub_receita_versao) {
    if (candidatas.length > 1) {
      throw new Error(
        `Sub-receita ${ingrediente.sub_receita_id} possui múltiplas versões. Informe sub_receita_versao.`
      );
    }
    return candidatas[0];
  }

  const porVersao = candidatas.find((f) => f.versao === ingrediente.sub_receita_versao);
  if (!porVersao) {
    throw new Error(
      `Sub-receita com id ${ingrediente.sub_receita_id} e versão ${ingrediente.sub_receita_versao} não encontrada.`
    );
  }

  validarVersaoExiste(porVersao, ingrediente.sub_receita_versao, ingrediente.sub_receita_id);
  return porVersao;
}

function obterQuantidadeProdutoNaUnidadeUso(
  quantidadeIngrediente: number,
  unidadeIngredienteId: string,
  produto: Produto,
  unidades: Unidade[]
): number {
  assertQuantidadePositiva(quantidadeIngrediente, "Quantidade do ingrediente");

  if (unidadeIngredienteId === produto.unidade_uso_id) {
    return quantidadeIngrediente;
  }

  if (produto.unidade_compra_id && unidadeIngredienteId === produto.unidade_compra_id) {
    assertFatorConversaoValido(produto);
    return quantidadeIngrediente * produto.fator_conversao;
  }

  const siglaIng = obterSiglaUnidade(unidadeIngredienteId, unidades);
  const siglaUso = obterSiglaUnidade(produto.unidade_uso_id, unidades);
  return converterUnidadeBasica(quantidadeIngrediente, siglaIng, siglaUso);
}

function combinarPresenca(
  atual: PresencaAlergenico,
  novo: PresencaAlergenico
): PresencaAlergenico {
  return RANK_ALERGENICO[novo] > RANK_ALERGENICO[atual] ? novo : atual;
}

function alergenicosVazios(): FichaTecnicaAlergenicos {
  return {
    gluten: "NAO_INFORMADO",
    lactose: "NAO_INFORMADO",
    ovos: "NAO_INFORMADO",
    peixes: "NAO_INFORMADO",
    crustaceos: "NAO_INFORMADO",
    soja: "NAO_INFORMADO",
    castanhas: "NAO_INFORMADO",
    amendoim: "NAO_INFORMADO",
    outros: [],
  };
}

function consolidarAlergenicosDois(
  base: FichaTecnicaAlergenicos,
  fonte: FichaTecnicaAlergenicos
): FichaTecnicaAlergenicos {
  const resultado: FichaTecnicaAlergenicos = {
    gluten: combinarPresenca(base.gluten, fonte.gluten),
    lactose: combinarPresenca(base.lactose, fonte.lactose),
    ovos: combinarPresenca(base.ovos, fonte.ovos),
    peixes: combinarPresenca(base.peixes, fonte.peixes),
    crustaceos: combinarPresenca(base.crustaceos, fonte.crustaceos),
    soja: combinarPresenca(base.soja, fonte.soja),
    castanhas: combinarPresenca(base.castanhas, fonte.castanhas),
    amendoim: combinarPresenca(base.amendoim, fonte.amendoim),
    outros: [],
  };

  const mapaOutros = new Map<string, PresencaAlergenico>();
  for (const item of base.outros ?? []) {
    mapaOutros.set(item.nome.toLowerCase(), item.presenca);
  }
  for (const item of fonte.outros ?? []) {
    const chave = item.nome.toLowerCase();
    const anterior = mapaOutros.get(chave) ?? "NAO_INFORMADO";
    mapaOutros.set(chave, combinarPresenca(anterior, item.presenca));
  }

  resultado.outros = Array.from(mapaOutros.entries()).map(([nome, presenca]) => ({
    nome,
    presenca,
  }));

  return resultado;
}

function obterAlergenicosProduto(
  produto: Produto,
  opcoes?: OpcoesConsolidacaoAlergenicos
): FichaTecnicaAlergenicos {
  const porMapa = opcoes?.alergenicos_produtos?.[produto.id];
  if (porMapa) {
    return cloneDefensivo(porMapa);
  }
  if (produto.alergenicos) {
    return cloneDefensivo(produto.alergenicos);
  }
  throw new Error(`Produto com id ${produto.id} sem alergênicos informados para consolidação.`);
}

function validarItensIngredientesDosPassos(ficha: FichaTecnica): void {
  const ingredientesDaFicha = new Set(ficha.ingredientes.map((ing) => ing.id));

  for (const passo of ficha.passos) {
    if (!passo.itens_ingredientes) {
      continue;
    }

    for (const item of passo.itens_ingredientes) {
      if (!ingredientesDaFicha.has(item.ingrediente_receita_id)) {
        throw new Error(
          `Passo ${passo.ordem} referencia ingrediente ${item.ingrediente_receita_id} inexistente na versão ${ficha.id}.`
        );
      }
    }
  }
}

function normalizarChaveComparacao(valor: string): string {
  return valor.trim().toLocaleLowerCase("pt-BR");
}

export function listarConfiguracoesPorcionamento(ficha: FichaTecnica): Array<{
  id: string;
  codigo?: string;
  nome: string;
  quantidade_por_porcao: number;
  unidade: string;
  quantidade_porcoes_teorica: number;
  ativa: boolean;
}> {
  const rendimentoTotal = ficha.rendimento_quantidade;
  const unidadeRendimento = ficha.rendimento_unidade_id;

  if (Array.isArray(ficha.configuracoes_porcionamento)) {
    const configs = ficha.configuracoes_porcionamento;
    const ids = new Set<string>();
    const nomes = new Set<string>();
    const codigos = new Set<string>();

    return configs.map((config) => {
      const idNormalizado = normalizarChaveComparacao(config.id);
      if (!idNormalizado) {
        throw new Error("Configuração de porcionamento com id vazio.");
      }
      if (ids.has(idNormalizado)) {
        throw new Error(`Configuração de porcionamento duplicada por id: ${config.id}.`);
      }
      ids.add(idNormalizado);

      const nomeNormalizado = normalizarChaveComparacao(config.nome);
      if (!nomeNormalizado) {
        throw new Error(`Configuração de porcionamento ${config.id} com nome vazio.`);
      }
      if (nomes.has(nomeNormalizado)) {
        throw new Error(`Configuração de porcionamento duplicada por nome: ${config.nome}.`);
      }
      nomes.add(nomeNormalizado);

      const codigoNormalizado = config.codigo ? normalizarChaveComparacao(config.codigo) : undefined;
      if (codigoNormalizado) {
        if (codigos.has(codigoNormalizado)) {
          throw new Error(`Configuração de porcionamento duplicada por código: ${config.codigo}.`);
        }
        codigos.add(codigoNormalizado);
      }

      assertQuantidadePositiva(config.quantidade_por_porcao, `Quantidade por porção da configuração ${config.id}`);
      return {
        ...config,
        id: config.id.trim(),
        codigo: config.codigo?.trim() || undefined,
        nome: config.nome.trim(),
        quantidade_porcoes_teorica: rendimentoTotal / config.quantidade_por_porcao,
      };
    });
  }

  if (ficha.porcoes_config?.quantidade_porcoes && ficha.porcoes_config.quantidade_porcoes > 0) {
    const quantidadePorPorcao = rendimentoTotal / ficha.porcoes_config.quantidade_porcoes;
    return [
      {
        id: "config-legado",
        nome: "Porção padrão",
        quantidade_por_porcao: quantidadePorPorcao,
        unidade: ficha.porcoes_config.unidade_porcao_id ?? unidadeRendimento,
        quantidade_porcoes_teorica: ficha.porcoes_config.quantidade_porcoes,
        ativa: true,
      },
    ];
  }

  return [];
}

export function calcularCustoPorConfiguracaoPorcionamento(
  snapshot: FichaTecnicaCustoSnapshot,
  seletor: SeletorConfiguracaoPorcionamento
): number {
  const custos = snapshot.custos_por_configuracao_porcionamento ?? [];
  if (custos.length === 0) {
    throw new Error("Snapshot sem configurações de porcionamento para cálculo por configuração.");
  }

  const temSeletor = Boolean(seletor.id?.trim() || seletor.codigo?.trim() || seletor.nome?.trim());
  if (!temSeletor) {
    throw new Error("Seleção ambígua: informe id, código ou nome da configuração de porcionamento.");
  }

  const id = seletor.id ? normalizarChaveComparacao(seletor.id) : undefined;
  const codigo = seletor.codigo ? normalizarChaveComparacao(seletor.codigo) : undefined;
  const nome = seletor.nome ? normalizarChaveComparacao(seletor.nome) : undefined;

  const candidatas = custos.filter((item) => {
    if (id && normalizarChaveComparacao(item.configuracao_id) !== id) return false;
    if (codigo && normalizarChaveComparacao(item.configuracao_codigo ?? "") !== codigo) return false;
    if (nome && normalizarChaveComparacao(item.nome) !== nome) return false;
    return true;
  });

  if (candidatas.length === 0) {
    throw new Error("Configuração de porcionamento não encontrada para o seletor informado.");
  }
  if (candidatas.length > 1) {
    throw new Error("Seleção ambígua: mais de uma configuração atende ao seletor informado.");
  }

  return candidatas[0].custo_por_porcao;
}

/**
 * Obtém a sigla de uma unidade a partir do seu ID.
 */
export function obterSiglaUnidade(unidadeId: string, unidades: Unidade[]): string {
  const unidade = unidades.find((u) => u.id === unidadeId);
  if (!unidade) {
    throw new Error(`Unidade com id ${unidadeId} não encontrada.`);
  }
  return unidade.sigla;
}

/**
 * Converte uma quantidade entre unidades básicas (kg <=> g, L <=> ml).
 * Caso as siglas sejam iguais (após normalização), retorna a mesma quantidade.
 * Para conversões inválidas ou incompatíveis, lança um erro.
 */
export function converterUnidadeBasica(
  quantidade: number,
  siglaOrigem: string,
  siglaDestino: string
): number {
  const o = siglaOrigem.trim().toUpperCase();
  const d = siglaDestino.trim().toUpperCase();

  if (o === d) {
    return quantidade;
  }

  if (o === "KG" && d === "G") {
    return quantidade * 1000;
  }
  if (o === "G" && d === "KG") {
    return quantidade / 1000;
  }
  if (o === "L" && d === "ML") {
    return quantidade * 1000;
  }
  if (o === "ML" && d === "L") {
    return quantidade / 1000;
  }

  throw new Error(
    `Conversão de unidade incompatível ou não suportada: de ${siglaOrigem} para ${siglaDestino}`
  );
}

/**
 * Detecta ciclos diretos ou indiretos na rede de sub-receitas.
 * Retorna um objeto indicando se há ciclo e o caminho do ciclo (IDs das fichas) se houver.
 */
export function detectarCiclos(fichas: FichaTecnica[]): { temCiclo: boolean; caminho?: string[] } {
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const stack: string[] = [];
  const fichasMap = new Map<string, FichaTecnica>(fichas.map((f) => [f.id, f]));

  function dfs(id: string): string[] | null {
    visited.add(id);
    recStack.add(id);
    stack.push(id);

    const ficha = fichasMap.get(id);
    if (ficha) {
      for (const ing of ficha.ingredientes) {
        if (ing.tipo === "SUB_RECEITA" && ing.sub_receita_id) {
          const childId = ing.sub_receita_id;
          if (recStack.has(childId)) {
            const idx = stack.indexOf(childId);
            if (idx !== -1) {
              const cyclePath = stack.slice(idx);
              cyclePath.push(childId);
              return cyclePath;
            }
          }
          if (!visited.has(childId)) {
            const path = dfs(childId);
            if (path) return path;
          }
        }
      }
    }

    stack.pop();
    recStack.delete(id);
    return null;
  }

  for (const ficha of fichas) {
    if (!visited.has(ficha.id)) {
      const path = dfs(ficha.id);
      if (path) {
        return { temCiclo: true, caminho: path };
      }
    }
  }

  return { temCiclo: false };
}

/**
 * Simula a inserção de uma sub-receita em uma ficha existente e verifica se gera ciclos.
 * Retorna true caso a adição crie um ciclo, false caso contrário.
 */
export function detectaCicloAoAdicionar(
  fichaId: string,
  subReceitaId: string,
  fichas: FichaTecnica[]
): boolean {
  const fichasSimuladas = fichas.map((f) => {
    if (f.id === fichaId) {
      return {
        ...f,
        ingredientes: [
          ...f.ingredientes,
          {
            id: `temp-ing-${Date.now()}-${Math.random()}`,
            tipo: "SUB_RECEITA" as const,
            sub_receita_id: subReceitaId,
            quantidade: 1,
            unidade_id: "temp-unidade",
          },
        ],
      };
    }
    return f;
  });

  const res = detectarCiclos(fichasSimuladas);
  return res.temCiclo;
}

/**
 * Calcula recursivamente o custo total da ficha técnica em centavos.
 * Lança erro caso encontre ciclos ou unidades incompatíveis.
 */
export function calcularCustoFicha(
  ficha: FichaTecnica,
  todasFichas: FichaTecnica[],
  produtos: Produto[],
  unidades: Unidade[]
): ResultadoCalculoCusto {
  assertRendimentoPositivo(ficha.rendimento_quantidade, `Rendimento da ficha ${ficha.id}`);
  validarItensIngredientesDosPassos(ficha);

  const cicloRes = detectarCiclos(todasFichas);
  if (cicloRes.temCiclo) {
    throw new Error(
      `Não é possível calcular custo: ciclo detectado em sub-receitas (${cicloRes.caminho?.join(
        " -> "
      )}).`
    );
  }

  return calcularCustoFichaRecursivo(ficha, todasFichas, produtos, unidades);
}

function calcularCustoFichaRecursivo(
  ficha: FichaTecnica,
  todasFichas: FichaTecnica[],
  produtos: Produto[],
  unidades: Unidade[]
): ResultadoCalculoCusto {
  let custoTotalCentavos = 0;
  let completo = true;
  const ingredientes_sem_custo: IngredientePendente[] = [];

  for (const ing of ficha.ingredientes) {
    assertQuantidadePositiva(ing.quantidade, `Quantidade do ingrediente ${ing.id}`);

    if (ing.tipo === "PRODUTO") {
      const prod = produtos.find((p) => p.id === ing.produto_id);
      if (!prod) {
        throw new Error(`Produto com id ${ing.produto_id} não encontrado.`);
      }

      assertFatorConversaoValido(prod);

      const temCusto =
        prod.custo_unitario !== undefined &&
        prod.custo_unitario !== null &&
        prod.custo_unitario > 0;

      if (!temCusto) {
        completo = false;
        ingredientes_sem_custo.push({
          tipo: "PRODUTO",
          id: prod.id,
          nome: prod.nome,
        });
      } else {
        const custoUnitCentavos = Math.round((prod.custo_unitario ?? 0) * 100);
        const qtdConvertida = obterQuantidadeProdutoNaUnidadeUso(
          ing.quantidade,
          ing.unidade_id,
          prod,
          unidades
        );
        const custoIngrediente = Math.round(qtdConvertida * custoUnitCentavos);
        custoTotalCentavos += custoIngrediente;
      }
    } else if (ing.tipo === "SUB_RECEITA") {
      const subFicha = obterSubReceitaIngrediente(ing, todasFichas);
      assertRendimentoPositivo(
        subFicha.rendimento_quantidade,
        `Rendimento da sub-receita ${subFicha.id}`
      );

      const subRes = calcularCustoFichaRecursivo(subFicha, todasFichas, produtos, unidades);

      if (!subRes.completo) {
        completo = false;
        ingredientes_sem_custo.push(...subRes.ingredientes_sem_custo);
      }

      const siglaIng = obterSiglaUnidade(ing.unidade_id, unidades);
      const siglaSub = obterSiglaUnidade(subFicha.rendimento_unidade_id, unidades);

      const qtdConvertida = converterUnidadeBasica(ing.quantidade, siglaIng, siglaSub);
      const custoIngrediente = Math.round(
        qtdConvertida * (subRes.custo_total / subFicha.rendimento_quantidade)
      );
      custoTotalCentavos += custoIngrediente;
    }
  }

  // Remove duplicados de ingredientes sem custo
  const idsVistos = new Set<string>();
  const ingredientesSemCustoUnicos = ingredientes_sem_custo.filter((item) => {
    if (idsVistos.has(item.id)) return false;
    idsVistos.add(item.id);
    return true;
  });

  return {
    custo_total: custoTotalCentavos,
    completo,
    ingredientes_sem_custo: ingredientesSemCustoUnicos,
  };
}

/**
 * Publica uma ficha técnica. Lança erro se houver ciclos ou custos incompletos.
 */
export function publicarFicha(
  ficha: FichaTecnica,
  todasFichas: FichaTecnica[],
  produtos: Produto[],
  unidades: Unidade[],
  responsavel?: string
): FichaTecnica {
  assertResponsavelInformado(responsavel, "publicação");

  if (ficha.status === "publicada") {
    throw new Error(`A versão ${ficha.versao} da ficha ${ficha.id} já está publicada e é imutável.`);
  }

  validarItensIngredientesDosPassos(ficha);

  const cicloRes = detectarCiclos(todasFichas);
  if (cicloRes.temCiclo) {
    throw new Error(
      `Não é possível publicar a ficha técnica: ciclo detectado em sub-receitas (${cicloRes.caminho?.join(
        " -> "
      )}).`
    );
  }

  const custoRes = calcularCustoFicha(ficha, todasFichas, produtos, unidades);
  if (!custoRes.completo) {
    const nomes = custoRes.ingredientes_sem_custo.map((i) => i.nome).join(", ");
    throw new Error(
      `Não é possível publicar a ficha técnica pois existem ingredientes sem custo cadastrado: ${nomes}.`
    );
  }

  const publicada: FichaTecnica = {
    ...ficha,
    status: "publicada",
    atualizado_em: new Date().toISOString(),
  };

  return congelarProfundo(cloneDefensivo(publicada)) as FichaTecnica;
}

/**
 * Bloqueia atualização de versão publicada.
 */
export function atualizarFichaRascunho(
  fichaAtual: FichaTecnica,
  atualizacoes: Partial<Omit<FichaTecnica, "id" | "versao" | "criado_em">>,
  responsavel?: string
): FichaTecnica {
  assertResponsavelInformado(responsavel, "alteração de rascunho");

  if (fichaAtual.status === "publicada") {
    throw new Error(`A versão ${fichaAtual.versao} da ficha ${fichaAtual.id} é imutável.`);
  }

  const proxima = {
    ...cloneDefensivo(fichaAtual),
    ...cloneDefensivo(atualizacoes),
    id: fichaAtual.id,
    versao: fichaAtual.versao,
    criado_em: fichaAtual.criado_em,
    atualizado_em: new Date().toISOString(),
  };

  validarItensIngredientesDosPassos(proxima);

  return proxima;
}

/**
 * Cria novo rascunho a partir de versão publicada sem compartilhar referências.
 */
export function criarNovoRascunhoDeVersaoPublicada(
  fichaPublicada: FichaTecnica,
  novoId: string,
  novaVersao: string
): FichaTecnica {
  if (fichaPublicada.status !== "publicada") {
    throw new Error(`Somente versões publicadas podem gerar novo rascunho.`);
  }

  if (!novoId.trim()) {
    throw new Error(`Novo id do rascunho é obrigatório.`);
  }

  if (!novaVersao.trim()) {
    throw new Error(`Nova versão do rascunho é obrigatória.`);
  }

  const baseClonada = cloneDefensivo(fichaPublicada);
  const agora = new Date().toISOString();

  return {
    ...baseClonada,
    id: novoId,
    versao: novaVersao,
    status: "rascunho",
    criado_em: agora,
    atualizado_em: agora,
  };
}

/**
 * Consolida alergênicos de produtos e sub-receitas com precedência
 * CONTEM > PODE_CONTER > NAO_INFORMADO.
 */
export function consolidarAlergenicosFicha(
  ficha: FichaTecnica,
  todasFichas: FichaTecnica[],
  produtos: Produto[],
  opcoes?: OpcoesConsolidacaoAlergenicos
): FichaTecnicaAlergenicos {
  const pilha = new Set<string>();

  const visitar = (atual: FichaTecnica): FichaTecnicaAlergenicos => {
    const chavePilha = `${atual.id}@${atual.versao}`;
    if (pilha.has(chavePilha)) {
      throw new Error(`Ciclo detectado na consolidação de alergênicos: ${chavePilha}.`);
    }

    pilha.add(chavePilha);
    let acumulado = cloneDefensivo(atual.alergenicos);

    for (const ing of atual.ingredientes) {
      if (ing.tipo === "PRODUTO") {
        const prod = produtos.find((p) => p.id === ing.produto_id);
        if (!prod) {
          throw new Error(`Produto com id ${ing.produto_id} não encontrado.`);
        }
        const alergenicosProd = obterAlergenicosProduto(prod, opcoes);
        acumulado = consolidarAlergenicosDois(acumulado, alergenicosProd);
      } else {
        const sub = obterSubReceitaIngrediente(ing, todasFichas);
        const alergenicosSub = visitar(sub);
        acumulado = consolidarAlergenicosDois(acumulado, alergenicosSub);
      }
    }

    pilha.delete(chavePilha);
    return acumulado;
  };

  const consolidado = visitar(ficha);
  return consolidarAlergenicosDois(alergenicosVazios(), consolidado);
}

/**
 * Cria um snapshot histórico imutável de custo associado a uma versão da ficha técnica.
 * Lança erro se houver custos incompletos.
 */
export function criarSnapshotCusto(
  ficha: FichaTecnica,
  todasFichas: FichaTecnica[],
  produtos: Produto[],
  unidades: Unidade[]
): FichaTecnicaCustoSnapshot {
  assertRendimentoPositivo(ficha.rendimento_quantidade, `Rendimento da ficha ${ficha.id}`);
  validarItensIngredientesDosPassos(ficha);

  const cicloRes = detectarCiclos(todasFichas);
  if (cicloRes.temCiclo) {
    throw new Error(
      `Não é possível criar snapshot: ciclo detectado em sub-receitas (${cicloRes.caminho?.join(
        " -> "
      )}).`
    );
  }

  const custoRes = calcularCustoFicha(ficha, todasFichas, produtos, unidades);
  if (!custoRes.completo) {
    const nomes = custoRes.ingredientes_sem_custo.map((i) => i.nome).join(", ");
    throw new Error(
      `Não é possível criar snapshot de custo pois existem ingredientes sem custo cadastrado: ${nomes}.`
    );
  }

  const detalhes_ingredientes: IngredienteCustoDetalhe[] = [];
  let custoTotalCentavos = 0;

  for (const ing of ficha.ingredientes) {
    assertQuantidadePositiva(ing.quantidade, `Quantidade do ingrediente ${ing.id}`);

    if (ing.tipo === "PRODUTO") {
      const prod = produtos.find((p) => p.id === ing.produto_id)!;
      assertFatorConversaoValido(prod);
      const custoUnitCentavos = Math.round((prod.custo_unitario ?? 0) * 100);
      const siglaIng = obterSiglaUnidade(ing.unidade_id, unidades);
      const qtdConvertida = obterQuantidadeProdutoNaUnidadeUso(
        ing.quantidade,
        ing.unidade_id,
        prod,
        unidades
      );
      const custoIngrediente = Math.round(qtdConvertida * custoUnitCentavos);
      custoTotalCentavos += custoIngrediente;

      detalhes_ingredientes.push({
        tipo: "PRODUTO",
        id: prod.id,
        nome: prod.nome,
        quantidade: ing.quantidade,
        unidade_sigla: siglaIng,
        custo_unitario_periodo: custoUnitCentavos,
        custo_calculado: custoIngrediente,
      });
    } else if (ing.tipo === "SUB_RECEITA") {
      const subFicha = obterSubReceitaIngrediente(ing, todasFichas);
      assertRendimentoPositivo(
        subFicha.rendimento_quantidade,
        `Rendimento da sub-receita ${subFicha.id}`
      );
      const subCustoRes = calcularCustoFichaRecursivo(subFicha, todasFichas, produtos, unidades);
      const siglaIng = obterSiglaUnidade(ing.unidade_id, unidades);
      const siglaSub = obterSiglaUnidade(subFicha.rendimento_unidade_id, unidades);

      const qtdConvertida = converterUnidadeBasica(ing.quantidade, siglaIng, siglaSub);
      const custoSubUnitario = Math.round(subCustoRes.custo_total / subFicha.rendimento_quantidade);
      const custoIngrediente = Math.round(
        qtdConvertida * (subCustoRes.custo_total / subFicha.rendimento_quantidade)
      );
      custoTotalCentavos += custoIngrediente;

      detalhes_ingredientes.push({
        tipo: "SUB_RECEITA",
        id: subFicha.id,
        nome: subFicha.nome,
        quantidade: ing.quantidade,
        unidade_sigla: siglaIng,
        custo_unitario_periodo: custoSubUnitario,
        custo_calculado: custoIngrediente,
      });
    }
  }

  const custosPorConfiguracaoPorcionamento = listarConfiguracoesPorcionamento(ficha)
    .filter((config) => config.ativa)
    .map((config) => ({
      configuracao_id: config.id,
      configuracao_codigo: config.codigo,
      nome: config.nome,
      custo_por_porcao: Math.round(custoTotalCentavos / config.quantidade_porcoes_teorica),
      quantidade_porcoes_teorica: config.quantidade_porcoes_teorica,
      unidade: config.unidade,
    }));

  const custoPorPorcao =
    custosPorConfiguracaoPorcionamento.length === 1
      ? custosPorConfiguracaoPorcionamento[0].custo_por_porcao
      : 0;

  const custoPorUnidadeRendimento =
    ficha.rendimento_quantidade > 0
      ? Math.round(custoTotalCentavos / ficha.rendimento_quantidade)
      : 0;

  const snapshot: FichaTecnicaCustoSnapshot = {
    id: `snap-${ficha.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ficha_tecnica_id: ficha.id,
    versao: ficha.versao,
    custo_total: custoTotalCentavos,
    custo_por_porcao: custoPorPorcao,
    custos_por_configuracao_porcionamento: custosPorConfiguracaoPorcionamento,
    custo_por_unidade_rendimento: custoPorUnidadeRendimento,
    calculado_em: new Date().toISOString(),
    detalhes_ingredientes,
  };

  return congelarProfundo(cloneDefensivo(snapshot)) as FichaTecnicaCustoSnapshot;
}
