import type {
  CanalFechamentoDia,
  DB,
  FechamentoDia,
  MaoObraFechamentoDia,
  PessoaRH,
  VendaPratoFechamentoDia,
} from "../types";
import { calcularCustoFicha } from "./fichas-tecnicas";
import { normalizarCanaisPrecoFicha, rotuloCanalVenda } from "./fichas-tecnicas-comercial";

function numeroSeguro(valor?: number): number {
  if (valor === undefined || Number.isNaN(valor) || !Number.isFinite(valor)) return 0;
  return valor;
}

function arredondar2(valor: number): number {
  return Number(numeroSeguro(valor).toFixed(2));
}

function arredondar1(valor: number): number {
  return Number(numeroSeguro(valor).toFixed(1));
}

export function rotuloCanalFechamento(canal: CanalFechamentoDia): string {
  return rotuloCanalVenda(canal);
}

export function fechamentoDiaVazio(data: string, agora = new Date().toISOString()): FechamentoDia {
  return {
    id: `fech-${data}`,
    data,
    vendas: [],
    mao_obra: [],
    custo_motoboy: 0,
    dias_rateio_folha: 30,
    criado_em: agora,
    atualizado_em: agora,
  };
}

export function buscarFechamentoPorData(db: DB, data: string): FechamentoDia | undefined {
  return (db.fechamentos_dia ?? []).find((f) => f.data === data);
}

export function garantirFechamentoDoDia(db: DB, data: string): FechamentoDia {
  if (!Array.isArray(db.fechamentos_dia)) db.fechamentos_dia = [];
  const existente = db.fechamentos_dia.find((f) => f.data === data);
  if (existente) return existente;
  const novo = fechamentoDiaVazio(data);
  db.fechamentos_dia.push(novo);
  return novo;
}

export interface SnapshotPratoFechamento {
  receita_id: string;
  nome: string;
  preco_balcao: number;
  preco_ifood: number;
  preco_99: number;
  custo_unitario: number;
  taxa_ifood: number;
  taxa_99: number;
  taxa_fixa_ifood: number;
  taxa_fixa_99: number;
}

export function listarSnapshotsPratosFechamento(db: DB): SnapshotPratoFechamento[] {
  const receitas = (db.fichas_tecnicas_receitas ?? []).filter((r) => (r.tipo ?? "prato") === "prato");
  const versoes = db.fichas_tecnicas_versoes ?? [];
  const todasFichas = versoes.map((v) => v.ficha);

  return receitas
    .map((receita) => {
      const daReceita = versoes.filter((v) => v.receita_id === receita.id);
      const vigente = receita.versao_vigente_id
        ? daReceita.find((v) => v.id === receita.versao_vigente_id)
        : undefined;
      const versao =
        vigente ?? daReceita.sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em))[0];
      if (!versao) return null;

      let custoUnit = 0;
      try {
        const custo = calcularCustoFicha(versao.ficha, todasFichas, db.produtos, db.unidades);
        const rendimento = Math.max(1, numeroSeguro(versao.ficha.rendimento_quantidade) || 1);
        custoUnit = custo.custo_total / 100 / rendimento;
      } catch {
        custoUnit = 0;
      }

      const canais = normalizarCanaisPrecoFicha(versao.ficha.canais_preco);
      const balcao = canais.find((c) => c.canal === "balcao");
      const ifood = canais.find((c) => c.canal === "ifood");
      const noventa = canais.find((c) => c.canal === "delivery_99");

      return {
        receita_id: receita.id,
        nome: receita.nome,
        preco_balcao: numeroSeguro(balcao?.preco_praticado),
        preco_ifood: numeroSeguro(ifood?.preco_praticado),
        preco_99: numeroSeguro(noventa?.preco_praticado),
        custo_unitario: arredondar2(custoUnit),
        taxa_ifood: numeroSeguro(ifood?.taxa_percentual) || 12,
        taxa_99: numeroSeguro(noventa?.taxa_percentual) || 12,
        taxa_fixa_ifood: numeroSeguro(ifood?.taxa_fixa),
        taxa_fixa_99: numeroSeguro(noventa?.taxa_fixa),
      } satisfies SnapshotPratoFechamento;
    })
    .filter((item): item is SnapshotPratoFechamento => item !== null)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function precoETaxaDoCanal(
  snap: SnapshotPratoFechamento,
  canal: CanalFechamentoDia
): { preco: number; taxa_percentual: number; taxa_fixa: number } {
  if (canal === "ifood") {
    return {
      preco: snap.preco_ifood || snap.preco_balcao,
      taxa_percentual: snap.taxa_ifood,
      taxa_fixa: snap.taxa_fixa_ifood,
    };
  }
  if (canal === "delivery_99") {
    return {
      preco: snap.preco_99 || snap.preco_balcao,
      taxa_percentual: snap.taxa_99,
      taxa_fixa: snap.taxa_fixa_99,
    };
  }
  return { preco: snap.preco_balcao, taxa_percentual: 0, taxa_fixa: 0 };
}

export function montarLinhaVenda(
  snap: SnapshotPratoFechamento,
  canal: CanalFechamentoDia,
  quantidade: number,
  id: string
): VendaPratoFechamentoDia {
  const { preco, taxa_percentual, taxa_fixa } = precoETaxaDoCanal(snap, canal);
  return {
    id,
    receita_id: snap.receita_id,
    nome: snap.nome,
    canal,
    quantidade: Math.max(0, numeroSeguro(quantidade)),
    preco_unitario: arredondar2(preco),
    custo_unitario: arredondar2(snap.custo_unitario),
    taxa_percentual,
    taxa_fixa,
  };
}

/** Rateio diário do salário mensal. */
export function rateioSalarioDiario(salarioMensal: number, diasRateio: number): number {
  const dias = Math.max(1, numeroSeguro(diasRateio) || 30);
  return arredondar2(numeroSeguro(salarioMensal) / dias);
}

export function sugerirMaoObraFixa(
  pessoas: PessoaRH[],
  diasRateio: number
): Omit<MaoObraFechamentoDia, "id">[] {
  return pessoas
    .filter((p) => p.ativo && numeroSeguro(p.salario) > 0)
    .map((p) => ({
      pessoa_id: p.id,
      nome: p.nome,
      tipo: "fixo_rateado" as const,
      valor: rateioSalarioDiario(p.salario ?? 0, diasRateio),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function sugerirFreelas(pessoas: PessoaRH[]): PessoaRH[] {
  return pessoas
    .filter((p) => {
      if (!p.ativo || numeroSeguro(p.salario) > 0) return false;
      return (
        p.tipo === "intermitente" ||
        p.tipo === "entregador" ||
        p.tipo === "prestador_eventual" ||
        numeroSeguro(p.valor_hora) > 0
      );
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export interface ResultadoFechamentoDia {
  receita_bruta: number;
  custo_food: number;
  cmv_ponderado_percentual: number | null;
  taxas_canais: number;
  custo_motoboy: number;
  receita_liquida: number;
  mao_obra_total: number;
  mao_obra_fixa: number;
  mao_obra_freela: number;
  prime_cost: number;
  prime_cost_percentual: number | null;
  sobra_dia: number;
  sobra_percentual: number | null;
  qtd_pratos: number;
}

export function calcularFechamentoDia(fechamento: FechamentoDia): ResultadoFechamentoDia {
  let receita_bruta = 0;
  let custo_food = 0;
  let taxas_canais = 0;
  let qtd_pratos = 0;

  for (const venda of fechamento.vendas ?? []) {
    const qtd = numeroSeguro(venda.quantidade);
    if (qtd <= 0) continue;
    const receitaLinha = qtd * numeroSeguro(venda.preco_unitario);
    const custoLinha = qtd * numeroSeguro(venda.custo_unitario);
    const taxaLinha =
      receitaLinha * (numeroSeguro(venda.taxa_percentual) / 100) + qtd * numeroSeguro(venda.taxa_fixa);
    receita_bruta += receitaLinha;
    custo_food += custoLinha;
    taxas_canais += taxaLinha;
    qtd_pratos += qtd;
  }

  receita_bruta = arredondar2(receita_bruta);
  custo_food = arredondar2(custo_food);
  taxas_canais = arredondar2(taxas_canais);
  const custo_motoboy = arredondar2(fechamento.custo_motoboy);
  const receita_liquida = arredondar2(receita_bruta - taxas_canais - custo_motoboy);

  let mao_obra_fixa = 0;
  let mao_obra_freela = 0;
  for (const item of fechamento.mao_obra ?? []) {
    const valor = numeroSeguro(item.valor);
    if (item.tipo === "fixo_rateado") mao_obra_fixa += valor;
    else mao_obra_freela += valor;
  }
  mao_obra_fixa = arredondar2(mao_obra_fixa);
  mao_obra_freela = arredondar2(mao_obra_freela);
  const mao_obra_total = arredondar2(mao_obra_fixa + mao_obra_freela);

  const prime_cost = arredondar2(custo_food + mao_obra_total);
  const sobra_dia = arredondar2(receita_liquida - custo_food - mao_obra_total);

  return {
    receita_bruta,
    custo_food,
    cmv_ponderado_percentual:
      receita_bruta > 0 ? arredondar1((custo_food / receita_bruta) * 100) : null,
    taxas_canais,
    custo_motoboy,
    receita_liquida,
    mao_obra_total,
    mao_obra_fixa,
    mao_obra_freela,
    prime_cost,
    prime_cost_percentual:
      receita_bruta > 0 ? arredondar1((prime_cost / receita_bruta) * 100) : null,
    sobra_dia,
    sobra_percentual:
      receita_bruta > 0 ? arredondar1((sobra_dia / receita_bruta) * 100) : null,
    qtd_pratos,
  };
}

export function formatarPercentualIndice(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return "—";
  return `${valor.toFixed(1).replace(".", ",")}%`;
}
