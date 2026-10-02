// DRE gerencial: plano de contas, depreciação e agregação do período.

import type {
  ContaDre,
  DB,
  Equipamento,
  GrupoContaDre,
  LinhaDrePeriodo,
  ResultadoDrePeriodo,
} from "@/lib/types";
import { calcularFechamentoDia } from "./fechamento-dia";
import { contaDreEhCmv, produtoEntraNoCmv } from "./produto-cmv";
import { sugerirContaDrePorNome } from "./sugerir-conta-dre-nome";

export const ORDEM_GRUPOS_DRE: GrupoContaDre[] = [
  "receitas",
  "deducoes",
  "custos_variaveis",
  "fixo_operacao",
  "fixo_ocupacao",
  "fixo_pessoal",
  "pessoal_variavel",
];

export const ROTULO_GRUPO_DRE: Record<GrupoContaDre, string> = {
  receitas: "Receitas",
  deducoes: "Deduções / despesas variáveis de canal",
  custos_variaveis: "Custos variáveis (CMV)",
  fixo_operacao: "Custo fixo da operação",
  fixo_ocupacao: "Custo fixo de ocupação",
  fixo_pessoal: "Custo fixo do pessoal",
  pessoal_variavel: "Pessoal variável",
};

function conta(
  id: string,
  grupo: GrupoContaDre,
  codigo: string,
  nome: string,
  ordem: number
): ContaDre {
  return { id, grupo, codigo, nome, ordem, ativo: true };
}

/** Plano de contas inicial do DRE gerencial. */
export const CONTAS_DRE_PADRAO: ContaDre[] = [
  conta("dre-rec-balcao", "receitas", "rec.balcao", "Vendas balcão", 10),
  conta("dre-rec-ifood", "receitas", "rec.ifood", "Vendas iFood", 20),
  conta("dre-rec-99", "receitas", "rec.99", "Vendas 99 Food", 30),
  conta("dre-rec-delivery", "receitas", "rec.delivery", "Delivery próprio", 40),

  conta("dre-ded-taxa-ifood", "deducoes", "ded.taxa_ifood", "Taxas iFood", 10),
  conta("dre-ded-taxa-99", "deducoes", "ded.taxa_99", "Taxas 99", 20),
  conta("dre-ded-taxa-cartao", "deducoes", "ded.taxa_cartao", "Taxas de cartão", 30),
  conta("dre-ded-cancelamentos", "deducoes", "ded.cancelamentos", "Cancelamentos", 40),
  conta("dre-ded-desperdicios", "deducoes", "ded.desperdicios", "Desperdícios", 50),
  conta("dre-ded-promocoes", "deducoes", "ded.promocoes", "Promoções", 60),
  conta("dre-ded-motoboy", "deducoes", "ded.motoboy", "Motoboy (diária + alimentação + km)", 70),

  conta("dre-cv-carnes-costela", "custos_variaveis", "cv.carnes.costela", "Carnes — costela", 10),
  conta("dre-cv-carnes-moida", "custos_variaveis", "cv.carnes.moida", "Carnes — carne moída", 20),
  conta("dre-cv-carnes-frango", "custos_variaveis", "cv.carnes.frango", "Carnes — frango", 30),
  conta("dre-cv-carnes-bacon", "custos_variaveis", "cv.carnes.bacon", "Carnes — bacon", 35),
  conta("dre-cv-molho-vermelho", "custos_variaveis", "cv.molho_vermelho", "Molho vermelho", 40),
  conta("dre-cv-molho-branco", "custos_variaveis", "cv.molho_branco", "Molho branco", 50),
  conta("dre-cv-massa", "custos_variaveis", "cv.massa", "Massa", 60),
  conta("dre-cv-risoto", "custos_variaveis", "cv.risoto", "Risoto", 70),
  conta("dre-cv-hortifruti", "custos_variaveis", "cv.hortifruti", "Hortifrútis", 80),
  conta("dre-cv-laticinios", "custos_variaveis", "cv.laticinios", "Laticínios / queijos", 90),
  conta("dre-cv-porcionamentos", "custos_variaveis", "cv.porcionamentos", "Porcionamentos", 100),
  conta("dre-cv-descartaveis", "custos_variaveis", "cv.descartaveis", "Descartáveis", 110),
  conta("dre-cv-outros", "custos_variaveis", "cv.outros", "Outros custos variáveis", 120),

  conta("dre-op-marketing", "fixo_operacao", "op.marketing", "Marketing", 10),
  conta("dre-op-manutencao", "fixo_operacao", "op.manutencao", "Manutenção", 20),
  conta("dre-op-reparos", "fixo_operacao", "op.reparos", "Reparos", 30),
  conta("dre-op-software", "fixo_operacao", "op.software", "Software", 40),
  conta("dre-op-limpeza", "fixo_operacao", "op.limpeza", "Material de limpeza", 50),
  conta("dre-op-contabilidade", "fixo_operacao", "op.contabilidade", "Contabilidade", 60),
  conta("dre-op-uniformes", "fixo_operacao", "op.uniformes", "Uniformes", 70),
  conta("dre-op-depreciacao", "fixo_operacao", "op.depreciacao", "Depreciação de equipamentos", 80),

  conta("dre-oc-aluguel", "fixo_ocupacao", "oc.aluguel", "Aluguel", 10),
  conta("dre-oc-condominio", "fixo_ocupacao", "oc.condominio", "Condomínio", 20),
  conta("dre-oc-iptu", "fixo_ocupacao", "oc.iptu", "IPTU", 30),
  conta("dre-oc-energia", "fixo_ocupacao", "oc.energia", "Energia elétrica", 40),
  conta("dre-oc-agua", "fixo_ocupacao", "oc.agua", "Água", 50),
  conta("dre-oc-gas", "fixo_ocupacao", "oc.gas", "Gás", 60),
  conta("dre-oc-internet", "fixo_ocupacao", "oc.internet", "Internet", 70),
  conta("dre-oc-telefone", "fixo_ocupacao", "oc.telefone", "Telefone", 80),

  conta("dre-pf-folha", "fixo_pessoal", "pf.folha", "Folha de pagamento", 10),
  conta("dre-pf-fgts", "fixo_pessoal", "pf.fgts", "FGTS", 20),
  conta("dre-pf-ferias", "fixo_pessoal", "pf.ferias", "Férias", 30),
  conta("dre-pf-ferias-prov", "fixo_pessoal", "pf.ferias_prov", "Férias provisionais", 40),
  conta("dre-pf-13", "fixo_pessoal", "pf.13", "13º salário", 50),
  conta("dre-pf-13-prov", "fixo_pessoal", "pf.13_prov", "13º provisional", 60),
  conta("dre-pf-vt", "fixo_pessoal", "pf.vt", "Vale transporte", 70),
  conta("dre-pf-vr", "fixo_pessoal", "pf.vr", "Vale refeição", 80),
  conta("dre-pf-prolabore", "fixo_pessoal", "pf.prolabore", "Pró-labore", 90),
  conta("dre-pf-gerente", "fixo_pessoal", "pf.gerente", "Gerente", 100),

  conta("dre-pv-freela", "pessoal_variavel", "pv.freela", "Freelas / intermitentes", 10),
  conta("dre-pv-entregador", "pessoal_variavel", "pv.entregador", "Entregadores (folha variável)", 20),
];

export function garantirContasDre(db: DB): boolean {
  let mudou = false;
  if (!Array.isArray(db.contas_dre)) {
    db.contas_dre = CONTAS_DRE_PADRAO.map((c) => ({ ...c }));
    return true;
  }
  const ids = new Set(db.contas_dre.map((c) => c.id));
  for (const padrao of CONTAS_DRE_PADRAO) {
    if (!ids.has(padrao.id)) {
      db.contas_dre.push({ ...padrao });
      mudou = true;
    }
  }
  return mudou;
}

export function garantirEquipamentos(db: DB): boolean {
  if (!Array.isArray(db.equipamentos)) {
    db.equipamentos = [];
    return true;
  }
  return false;
}

export function contasDreAtivas(db: Pick<DB, "contas_dre">): ContaDre[] {
  return (db.contas_dre ?? [])
    .filter((c) => c.ativo)
    .sort((a, b) => {
      const ga = ORDEM_GRUPOS_DRE.indexOf(a.grupo);
      const gb = ORDEM_GRUPOS_DRE.indexOf(b.grupo);
      if (ga !== gb) return ga - gb;
      return a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR");
    });
}

export function nomeContaDre(db: Pick<DB, "contas_dre">, contaId?: string): string {
  if (!contaId) return "—";
  return (db.contas_dre ?? []).find((c) => c.id === contaId)?.nome ?? contaId;
}

/** Depreciação linear mensal: valor ÷ vida útil em meses. */
export function depreciacaoMensalEquipamento(eq: Equipamento): number {
  const valor = Number(eq.valor_aquisicao) || 0;
  const meses = Number(eq.vida_util_meses) || 0;
  if (valor <= 0 || meses <= 0) return 0;
  return Math.round((valor / meses) * 100) / 100;
}

/** True se o equipamento já estava em uso no mês (YYYY-MM). */
export function equipamentoAtivoNoMes(eq: Equipamento, anoMes: string): boolean {
  if (!eq.ativo) return false;
  const inicio = (eq.data_inicio || "").slice(0, 7);
  if (!inicio || inicio > anoMes) return false;
  const meses = Number(eq.vida_util_meses) || 0;
  if (meses <= 0) return false;
  const [y, m] = inicio.split("-").map(Number);
  const fim = new Date(y, m - 1 + meses, 1);
  const fimMes = `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, "0")}`;
  return anoMes < fimMes;
}

/**
 * Sugere conta DRE: memória fornecedor×produto → produto → nome do produto → vazia.
 */
export function sugerirContaDre(
  db: Pick<DB, "produtos" | "fornecedor_produtos" | "contas_dre">,
  opts: { produtoId?: string; fornecedorId?: string; nomeHint?: string }
): string {
  const produtoId = opts.produtoId || "";
  if (opts.fornecedorId && produtoId) {
    const vinculo = (db.fornecedor_produtos ?? []).find(
      (fp) => fp.fornecedor_id === opts.fornecedorId && fp.produto_id === produtoId
    );
    if (vinculo?.conta_dre_id) return vinculo.conta_dre_id;
  }
  const produto = produtoId
    ? (db.produtos ?? []).find((p) => p.id === produtoId)
    : undefined;
  if (produto?.conta_dre_id) return produto.conta_dre_id;
  const porNome = sugerirContaDrePorNome(opts.nomeHint || produto?.nome);
  return porNome || "";
}

/** Grava conta no produto e no vínculo fornecedor×produto (memória para a próxima NF). */
export function memorizarContaDre(
  db: DB,
  opts: { produtoId: string; fornecedorId?: string; contaDreId: string }
): void {
  const contaId = opts.contaDreId.trim();
  if (!opts.produtoId || !contaId) return;
  const produto = db.produtos.find((p) => p.id === opts.produtoId);
  if (produto) produto.conta_dre_id = contaId;
  if (opts.fornecedorId) {
    const vinculo = db.fornecedor_produtos.find(
      (fp) => fp.fornecedor_id === opts.fornecedorId && fp.produto_id === opts.produtoId
    );
    if (vinculo) vinculo.conta_dre_id = contaId;
  }
}

function arred2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addLinha(
  mapa: Map<string, number>,
  contaId: string,
  valor: number
): void {
  if (!contaId || !Number.isFinite(valor) || valor === 0) return;
  mapa.set(contaId, arred2((mapa.get(contaId) ?? 0) + valor));
}

/**
 * Monta o DRE do mês (YYYY-MM) a partir de fechamentos, recebimentos classificados,
 * contas a pagar, pagamentos RH e depreciação de equipamentos.
 */
export function calcularDrePeriodo(db: DB, anoMes: string): ResultadoDrePeriodo {
  garantirContasDre(db);
  const valores = new Map<string, number>();
  const prefixo = `${anoMes}-`;

  let foodFechamentos = 0;
  let temFechamentoNoMes = false;

  for (const fechamento of db.fechamentos_dia ?? []) {
    if (!(fechamento.data || "").startsWith(prefixo)) continue;
    temFechamentoNoMes = true;
    const r = calcularFechamentoDia(fechamento);
    for (const venda of fechamento.vendas ?? []) {
      const qtd = Number(venda.quantidade) || 0;
      if (qtd <= 0) continue;
      const receita = qtd * (Number(venda.preco_unitario) || 0);
      const taxa =
        receita * ((Number(venda.taxa_percentual) || 0) / 100) +
        qtd * (Number(venda.taxa_fixa) || 0);
      const contaRec =
        venda.canal === "ifood"
          ? "dre-rec-ifood"
          : venda.canal === "delivery_99"
            ? "dre-rec-99"
            : "dre-rec-balcao";
      addLinha(valores, contaRec, receita);
      if (taxa > 0) {
        addLinha(
          valores,
          venda.canal === "ifood"
            ? "dre-ded-taxa-ifood"
            : venda.canal === "delivery_99"
              ? "dre-ded-taxa-99"
              : "dre-ded-taxa-cartao",
          taxa
        );
      }
    }
    addLinha(valores, "dre-ded-motoboy", r.custo_motoboy);
    foodFechamentos += r.custo_food;
    addLinha(valores, "dre-pf-folha", r.mao_obra_fixa);
    addLinha(valores, "dre-pv-freela", r.mao_obra_freela);
  }

  let cmvComprasFood = 0;
  const contasLookup = new Map((db.contas_dre ?? []).map((c) => [c.id, c]));
  for (const item of db.recebimento_itens ?? []) {
    const recebimento = db.recebimentos.find((r) => r.id === item.recebimento_id);
    if (!recebimento) continue;
    const data = (recebimento.recebido_em || "").slice(0, 7);
    if (data !== anoMes) continue;
    const produto = db.produtos.find((p) => p.id === item.produto_id);
    const entraCmv = produtoEntraNoCmv(produto);
    let contaId = item.conta_dre_id || produto?.conta_dre_id || (entraCmv ? "dre-cv-outros" : "dre-op-limpeza");
    if (!entraCmv) {
      const conta = contasLookup.get(contaId);
      if (!conta || contaDreEhCmv(conta)) {
        contaId = "dre-op-limpeza";
      }
    }
    const unit = Number(produto?.custo_unitario) || 0;
    const valor = unit * (Number(item.qtd_recebida) || 0);
    if (valor <= 0) continue;
    addLinha(valores, contaId, valor);
    if (entraCmv) cmvComprasFood += valor;
  }
  // Sem compras food no mês: usa CMV teórico dos fechamentos nas linhas do DRE.
  if (cmvComprasFood <= 0 && foodFechamentos > 0) {
    addLinha(valores, "dre-cv-outros", foodFechamentos);
  }

  for (const conta of db.contas_pagar ?? []) {
    if (!conta.conta_dre_id) continue;
    if (conta.status !== "conciliado" && conta.status !== "aguardando_conciliacao") continue;
    const data = (conta.data_vencimento || conta.data_emissao || "").slice(0, 7);
    if (data !== anoMes) continue;
    addLinha(valores, conta.conta_dre_id, Number(conta.valor_final) || 0);
  }

  // Pagamentos RH só entram se não houver fechamento do dia no mês (evita duplicar mão de obra).
  if (!temFechamentoNoMes) {
    for (const pag of db.pagamentos_pessoas ?? []) {
      if (pag.status !== "pago" && pag.status !== "aguardando_conciliacao") continue;
      const data = (pag.competencia || pag.pagamento_data || pag.vencimento || pag.criado_em || "").slice(
        0,
        7
      );
      if (data !== anoMes) continue;
      const pessoa = db.pessoas.find((p) => p.id === pag.pessoa_id);
      const valor = Number(pag.pagamento_valor ?? pag.valor) || 0;
      if (
        pessoa?.tipo === "intermitente" ||
        pessoa?.tipo === "prestador_eventual" ||
        pag.tipo === "intermitente_periodo" ||
        pag.tipo === "freela_hora" ||
        pag.tipo === "freela_servico"
      ) {
        addLinha(valores, "dre-pv-freela", valor);
      } else if (pessoa?.tipo === "entregador") {
        addLinha(valores, "dre-pv-entregador", valor);
      } else {
        addLinha(valores, "dre-pf-folha", valor);
      }
    }
  }

  let depreciacao = 0;
  for (const eq of db.equipamentos ?? []) {
    if (!equipamentoAtivoNoMes(eq, anoMes)) continue;
    const parcela = depreciacaoMensalEquipamento(eq);
    depreciacao += parcela;
    addLinha(valores, eq.conta_dre_id || "dre-op-depreciacao", parcela);
  }

  const contas = contasDreAtivas(db);
  const linhas: LinhaDrePeriodo[] = [];
  const totaisPorGrupo: Partial<Record<GrupoContaDre, number>> = {};

  for (const grupo of ORDEM_GRUPOS_DRE) {
    let totalGrupo = 0;
    for (const c of contas.filter((x) => x.grupo === grupo)) {
      const valor = valores.get(c.id) ?? 0;
      if (valor === 0) continue;
      linhas.push({
        conta_id: c.id,
        grupo: c.grupo,
        codigo: c.codigo,
        nome: c.nome,
        valor,
      });
      totalGrupo += valor;
    }
    totaisPorGrupo[grupo] = arred2(totalGrupo);
  }

  const receitas = totaisPorGrupo.receitas ?? 0;
  const deducoes = totaisPorGrupo.deducoes ?? 0;
  const custosVar = totaisPorGrupo.custos_variaveis ?? 0;
  const fixoOp = totaisPorGrupo.fixo_operacao ?? 0;
  const fixoOc = totaisPorGrupo.fixo_ocupacao ?? 0;
  const fixoPes = totaisPorGrupo.fixo_pessoal ?? 0;
  const pesVar = totaisPorGrupo.pessoal_variavel ?? 0;
  const receitaLiquida = arred2(receitas - deducoes);
  const resultado = arred2(receitaLiquida - custosVar - fixoOp - fixoOc - fixoPes - pesVar);

  return {
    ano_mes: anoMes,
    linhas,
    totais_por_grupo: totaisPorGrupo,
    receita_bruta: arred2(receitas),
    deducoes: arred2(deducoes),
    receita_liquida: receitaLiquida,
    custos_variaveis: arred2(custosVar),
    fixo_operacao: arred2(fixoOp),
    fixo_ocupacao: arred2(fixoOc),
    fixo_pessoal: arred2(fixoPes),
    pessoal_variavel: arred2(pesVar),
    depreciacao_mes: arred2(depreciacao),
    resultado,
    cmv_fichas: arred2(foodFechamentos),
    cmv_compras_food: arred2(cmvComprasFood),
  };
}
