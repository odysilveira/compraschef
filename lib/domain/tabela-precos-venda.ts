import type { CanalVendaFichaTecnica, DB, FichaTecnica, FichaTecnicaCanalPreco } from "../types";
import {
  canaisPadraoSemPremissa,
  normalizarCanaisPrecoFicha,
  rotuloCanalVenda,
} from "./fichas-tecnicas-comercial";
import { calcularCustoFicha } from "./fichas-tecnicas";

/** Linha da tabela oficial da franquia (Loja/Saipos, iFood, 99). */
export interface PrecoFranquiaLinha {
  codigo?: string;
  nome: string;
  preco_loja: number;
  preco_ifood?: number;
  preco_99?: number;
  /** Taxa % iFood (opcional; aplica ao canal ifood). */
  taxa_ifood_percentual?: number;
  /** Taxa % 99 (opcional). */
  taxa_99_percentual?: number;
  cmv_desejado_percentual?: number;
}

export interface LinhaTabelaPrecosCatalogo {
  receita_id: string;
  versao_id: string;
  codigo: string;
  nome: string;
  preco_loja: number;
  preco_ifood: number;
  preco_99: number;
  /** Custo da porção em R$ (ingredientes). */
  custo_porcao: number;
  /** CMV atual % = custo ÷ preço Saipos. Null se não der para calcular. */
  cmv_atual: number | null;
}

function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function numeroSeguro(valor?: number): number {
  if (valor === undefined || Number.isNaN(valor) || !Number.isFinite(valor)) return 0;
  return valor;
}

export function precoDoCanal(
  canais: FichaTecnicaCanalPreco[] | undefined,
  canal: CanalVendaFichaTecnica
): number {
  const normalizados = normalizarCanaisPrecoFicha(canais);
  return numeroSeguro(normalizados.find((c) => c.canal === canal)?.preco_praticado);
}

/**
 * CMV atual % em relação ao preço Saipos/Loja.
 * Ex.: custo R$ 11,67 e Saipos R$ 38,90 → 30,0.
 */
export function calcularCmvAtualVsSaipos(custoPorcaoReais: number, precoSaipos: number): number | null {
  const custo = numeroSeguro(custoPorcaoReais);
  const saipos = numeroSeguro(precoSaipos);
  if (saipos <= 0 || custo < 0) return null;
  const pct = (custo / saipos) * 100;
  if (!Number.isFinite(pct)) return null;
  return Number(pct.toFixed(1));
}

export function formatarCmvAtual(cmv: number | null): string {
  if (cmv === null) return "—";
  return `${cmv.toFixed(1).replace(".", ",")}%`;
}

/** Média dos CMV atuais (ignora pratos sem CMV calculável). */
export function mediaCmvAtual(linhas: Array<{ cmv_atual: number | null }>): number | null {
  const valores = linhas
    .map((l) => l.cmv_atual)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  if (valores.length === 0) return null;
  const soma = valores.reduce((acc, v) => acc + v, 0);
  return Number((soma / valores.length).toFixed(1));
}

function custoPorcaoReaisDaVersao(
  versaoFicha: FichaTecnica,
  todasFichas: FichaTecnica[],
  db: DB
): number {
  try {
    const resultado = calcularCustoFicha(versaoFicha, todasFichas, db.produtos, db.unidades);
    const rendimento = Math.max(1, numeroSeguro(versaoFicha.rendimento_quantidade) || 1);
    return Number((resultado.custo_total / 100 / rendimento).toFixed(4));
  } catch {
    return 0;
  }
}

/** Lista pratos finalizados com preços dos 3 canais (versão vigente ou última). */
export function listarTabelaPrecosPratos(db: DB): LinhaTabelaPrecosCatalogo[] {
  const receitas = (db.fichas_tecnicas_receitas ?? []).filter((r) => (r.tipo ?? "prato") === "prato");
  const versoes = db.fichas_tecnicas_versoes ?? [];
  const todasFichas = versoes.map((v) => v.ficha);

  return receitas
    .map((receita) => {
      const daReceita = versoes.filter((v) => v.receita_id === receita.id);
      const vigente = receita.versao_vigente_id
        ? daReceita.find((v) => v.id === receita.versao_vigente_id)
        : undefined;
      const versao = vigente ?? daReceita.sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em))[0];
      if (!versao) return null;
      const canais = normalizarCanaisPrecoFicha(versao.ficha.canais_preco);
      const preco_loja = precoDoCanal(canais, "balcao");
      const custo_porcao = custoPorcaoReaisDaVersao(versao.ficha, todasFichas, db);
      return {
        receita_id: receita.id,
        versao_id: versao.id,
        codigo: receita.codigo,
        nome: receita.nome,
        preco_loja,
        preco_ifood: precoDoCanal(canais, "ifood"),
        preco_99: precoDoCanal(canais, "delivery_99"),
        custo_porcao,
        cmv_atual: calcularCmvAtualVsSaipos(custo_porcao, preco_loja),
      } satisfies LinhaTabelaPrecosCatalogo;
    })
    .filter((item): item is LinhaTabelaPrecosCatalogo => item !== null)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function localizarReceita(db: DB, linha: PrecoFranquiaLinha) {
  const receitas = db.fichas_tecnicas_receitas ?? [];
  const codigo = linha.codigo?.trim();
  if (codigo) {
    const porCodigo = receitas.find(
      (r) => normalizarTexto(r.codigo) === normalizarTexto(codigo) && (r.tipo ?? "prato") === "prato"
    );
    if (porCodigo) return porCodigo;
  }
  const nome = normalizarTexto(linha.nome);
  return receitas.find(
    (r) => normalizarTexto(r.nome) === nome && (r.tipo ?? "prato") === "prato"
  );
}

function montarCanaisDaLinhaFranquia(
  atuais: FichaTecnicaCanalPreco[] | undefined,
  linha: PrecoFranquiaLinha
): FichaTecnicaCanalPreco[] {
  const base = normalizarCanaisPrecoFicha(atuais ?? canaisPadraoSemPremissa());
  const cmv = numeroSeguro(linha.cmv_desejado_percentual) || 30;

  return base.map((canal) => {
    if (canal.canal === "balcao") {
      return {
        ...canal,
        preco_praticado: numeroSeguro(linha.preco_loja),
        cmv_desejado_percentual: cmv,
      };
    }
    if (canal.canal === "ifood") {
      return {
        ...canal,
        preco_praticado: numeroSeguro(linha.preco_ifood ?? linha.preco_loja),
        taxa_percentual: numeroSeguro(linha.taxa_ifood_percentual) || canal.taxa_percentual,
        cmv_desejado_percentual: cmv,
      };
    }
    return {
      ...canal,
      preco_praticado: numeroSeguro(linha.preco_99),
      taxa_percentual: numeroSeguro(linha.taxa_99_percentual) || canal.taxa_percentual,
      cmv_desejado_percentual: cmv,
    };
  });
}

function versaoVigenteDaReceita(db: DB, receitaId: string, versaoVigenteId?: string) {
  const daReceita = (db.fichas_tecnicas_versoes ?? []).filter((v) => v.receita_id === receitaId);
  const vigente = versaoVigenteId ? daReceita.find((v) => v.id === versaoVigenteId) : undefined;
  return vigente ?? daReceita.sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em))[0];
}

function canalSemPrecoDeVenda(canais: FichaTecnicaCanalPreco[] | undefined): boolean {
  const normalizados = normalizarCanaisPrecoFicha(canais);
  return (
    numeroSeguro(normalizados.find((c) => c.canal === "balcao")?.preco_praticado) <= 0 &&
    numeroSeguro(normalizados.find((c) => c.canal === "ifood")?.preco_praticado) <= 0
  );
}

/**
 * Aplica a tabela da franquia nas fichas de prato (versão vigente/última).
 * Retorna quantas fichas foram atualizadas.
 * @param somenteVazios quando true, não sobrescreve pratos que já têm preço Loja ou iFood.
 */
export function aplicarTabelaFranquiaNasFichas(
  db: DB,
  tabela: PrecoFranquiaLinha[],
  opcoes?: { somenteVazios?: boolean; em?: string }
): number {
  if (!Array.isArray(db.fichas_tecnicas_versoes)) db.fichas_tecnicas_versoes = [];
  let aplicados = 0;

  for (const linha of tabela) {
    if (!linha.nome?.trim() && !linha.codigo?.trim()) continue;
    if (
      numeroSeguro(linha.preco_loja) <= 0 &&
      numeroSeguro(linha.preco_ifood) <= 0 &&
      numeroSeguro(linha.preco_99) <= 0
    ) {
      continue;
    }

    const receita = localizarReceita(db, linha);
    if (!receita) continue;

    const versao = versaoVigenteDaReceita(db, receita.id, receita.versao_vigente_id);
    if (!versao) continue;

    if (opcoes?.somenteVazios && !canalSemPrecoDeVenda(versao.ficha.canais_preco)) {
      continue;
    }

    const agora = opcoes?.em ?? new Date().toISOString();
    versao.ficha.canais_preco = montarCanaisDaLinhaFranquia(versao.ficha.canais_preco, linha);
    versao.atualizado_em = agora;
    versao.ficha.atualizado_em = agora;
    aplicados += 1;
  }

  return aplicados;
}

/** Atualiza preços de um prato diretamente na versão (edição rápida no catálogo). */
export function atualizarPrecosCanaisDaVersao(
  db: DB,
  versaoId: string,
  precos: { loja?: number; ifood?: number; noventa?: number; cmvDesejado?: number }
): boolean {
  const versao = (db.fichas_tecnicas_versoes ?? []).find((v) => v.id === versaoId);
  if (!versao) return false;

  const canais = normalizarCanaisPrecoFicha(versao.ficha.canais_preco);
  const cmv = numeroSeguro(precos.cmvDesejado);
  versao.ficha.canais_preco = canais.map((canal) => {
    const proximo = { ...canal };
    if (cmv > 0) proximo.cmv_desejado_percentual = cmv;
    if (canal.canal === "balcao" && precos.loja !== undefined) {
      proximo.preco_praticado = numeroSeguro(precos.loja);
    }
    if (canal.canal === "ifood" && precos.ifood !== undefined) {
      proximo.preco_praticado = numeroSeguro(precos.ifood);
    }
    if (canal.canal === "delivery_99" && precos.noventa !== undefined) {
      proximo.preco_praticado = numeroSeguro(precos.noventa);
    }
    return proximo;
  });
  const agora = new Date().toISOString();
  versao.atualizado_em = agora;
  versao.ficha.atualizado_em = agora;
  return true;
}

export function rotulosColunasTabelaPrecos(): string[] {
  return [
    rotuloCanalVenda("balcao"),
    rotuloCanalVenda("ifood"),
    rotuloCanalVenda("delivery_99"),
  ];
}

/**
 * % a mais (ou a menos) do canal em relação ao preço Saipos/Loja.
 * Ex.: Saipos 38,90 e iFood 42,90 → +10,3.
 * Retorna null se não der para calcular.
 */
export function percentualAcimaDoSaipos(precoCanal: number, precoSaipos: number): number | null {
  const canal = numeroSeguro(precoCanal);
  const saipos = numeroSeguro(precoSaipos);
  if (saipos <= 0 || canal <= 0) return null;
  const pct = ((canal - saipos) / saipos) * 100;
  if (!Number.isFinite(pct)) return null;
  return Number(pct.toFixed(1));
}

export function formatarPercentualAcimaDoSaipos(precoCanal: number, precoSaipos: number): string {
  const pct = percentualAcimaDoSaipos(precoCanal, precoSaipos);
  if (pct === null) return "—";
  const sinal = pct > 0 ? "+" : "";
  return `${sinal}${pct.toFixed(1).replace(".", ",")}%`;
}

export type ModoReajustePreco = "reais" | "percentual";

export interface OpcoesReajustePrecosLote {
  modo: ModoReajustePreco;
  /** Valor em R$ (modo reais) ou % (modo percentual). Pode ser negativo para reduzir. */
  valor: number;
  canais: { loja?: boolean; ifood?: boolean; noventa?: boolean };
  /** Se informado, só esses pratos; senão, todos os pratos da tabela. */
  receitaIds?: string[];
}

function arredondarPrecoReais(valor: number): number {
  return Math.max(0, Number(numeroSeguro(valor).toFixed(2)));
}

function aplicarDeltaPreco(atual: number, modo: ModoReajustePreco, valor: number): number {
  const base = numeroSeguro(atual);
  if (base <= 0) return base;
  if (modo === "reais") return arredondarPrecoReais(base + valor);
  return arredondarPrecoReais(base * (1 + valor / 100));
}

/**
 * Reajusta preços de venda em lote ( + R$ ou + % ) nos canais escolhidos.
 * Só altera canais que já têm preço > 0.
 */
export function reajustarPrecosPratosEmLote(db: DB, opcoes: OpcoesReajustePrecosLote): number {
  if (!Number.isFinite(opcoes.valor) || opcoes.valor === 0) return 0;
  const alvoCanais = opcoes.canais ?? {};
  if (!alvoCanais.loja && !alvoCanais.ifood && !alvoCanais.noventa) return 0;

  const idsFiltro = opcoes.receitaIds?.length ? new Set(opcoes.receitaIds) : null;
  let atualizados = 0;

  for (const linha of listarTabelaPrecosPratos(db)) {
    if (idsFiltro && !idsFiltro.has(linha.receita_id)) continue;
    const versao = (db.fichas_tecnicas_versoes ?? []).find((v) => v.id === linha.versao_id);
    if (!versao) continue;

    const canais = normalizarCanaisPrecoFicha(versao.ficha.canais_preco);
    let mudou = false;
    const proximos = canais.map((canal) => {
      const proximo = { ...canal };
      if (canal.canal === "balcao" && alvoCanais.loja) {
        const novo = aplicarDeltaPreco(canal.preco_praticado, opcoes.modo, opcoes.valor);
        if (novo !== numeroSeguro(canal.preco_praticado)) {
          proximo.preco_praticado = novo;
          mudou = true;
        }
      }
      if (canal.canal === "ifood" && alvoCanais.ifood) {
        const novo = aplicarDeltaPreco(canal.preco_praticado, opcoes.modo, opcoes.valor);
        if (novo !== numeroSeguro(canal.preco_praticado)) {
          proximo.preco_praticado = novo;
          mudou = true;
        }
      }
      if (canal.canal === "delivery_99" && alvoCanais.noventa) {
        const novo = aplicarDeltaPreco(canal.preco_praticado, opcoes.modo, opcoes.valor);
        if (novo !== numeroSeguro(canal.preco_praticado)) {
          proximo.preco_praticado = novo;
          mudou = true;
        }
      }
      return proximo;
    });

    if (!mudou) continue;
    versao.ficha.canais_preco = proximos;
    const agora = new Date().toISOString();
    versao.atualizado_em = agora;
    versao.ficha.atualizado_em = agora;
    atualizados += 1;
  }

  return atualizados;
}

/** Remove a receita e todas as versões/snapshots ligados (exclusão local definitiva). */
export function excluirReceitaFichaDoCatalogo(db: DB, receitaId: string): boolean {
  const receitas = db.fichas_tecnicas_receitas ?? [];
  const indice = receitas.findIndex((r) => r.id === receitaId);
  if (indice < 0) return false;

  const versaoIds = new Set(
    (db.fichas_tecnicas_versoes ?? []).filter((v) => v.receita_id === receitaId).map((v) => v.id)
  );

  receitas.splice(indice, 1);
  db.fichas_tecnicas_receitas = receitas;
  db.fichas_tecnicas_versoes = (db.fichas_tecnicas_versoes ?? []).filter((v) => v.receita_id !== receitaId);

  if (Array.isArray(db.ficha_tecnica_custo_snapshots)) {
    db.ficha_tecnica_custo_snapshots = db.ficha_tecnica_custo_snapshots.filter(
      (s) => s.ficha_tecnica_id !== receitaId && !versaoIds.has(s.ficha_tecnica_id)
    );
  }
  if (Array.isArray(db.fichas_tecnicas)) {
    db.fichas_tecnicas = db.fichas_tecnicas.filter((f) => f.id !== receitaId);
  }
  if (db.tour_londrina?.pratos_elegiveis_ids?.length) {
    db.tour_londrina.pratos_elegiveis_ids = db.tour_londrina.pratos_elegiveis_ids.filter(
      (id) => id !== receitaId
    );
  }
  if (!Array.isArray(db.fichas_tecnicas_excluidas_ids)) {
    db.fichas_tecnicas_excluidas_ids = [];
  }
  if (!db.fichas_tecnicas_excluidas_ids.includes(receitaId)) {
    db.fichas_tecnicas_excluidas_ids.push(receitaId);
  }
  return true;
}
