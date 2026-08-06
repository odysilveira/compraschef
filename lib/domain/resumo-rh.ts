import type { DB, StatusConsumoPessoa, StatusPagamentoPessoa, TipoPagamentoPessoa } from "../types";
import { alertaDocumentosPessoa, hojeIsoLocal } from "./documentos-pessoa";
import {
  convocacaoEnviadaSemRespostaVencida,
  janelaCalendarioEscala,
  listarCltSemPlantaoNaJanela,
} from "./escala";
import { normasPendentes } from "./normas-rh";
import { TIPOS_PAGAMENTO_PESSOA } from "./pagamentos-pessoas";
import { resumirPendenciasPontoAbertas, competenciaDeData, type FiltroEspelhoPonto } from "./ponto-rh";

export interface ResumoOperacionalRh {
  pessoas_ativas: number;
  docs_alerta: number;
  docs_vencido: number;
  docs_a_vencer: number;
  ponto_abertas: number;
  /** Pendências aguardando aviso WhatsApp. */
  ponto_a_avisar: number;
  /** Propostas do funcionário para o gestor confirmar. */
  ponto_propostas: number;
  convocacoes_enviadas: number;
  /** Enviadas com plantão já passado — triagem de silêncio na escala. */
  convocacoes_sem_resposta: number;
  /** Rascunhos ainda não enviados no WhatsApp. */
  convocacoes_rascunho: number;
  /** CLT ativos sem nenhum plantão na janela do calendário da escala. */
  clt_sem_plantao: number;
  /** Títulos informados, aguardando conciliação bancária. */
  pagamentos_aguardando: number;
  /** Previstos + liberados (ainda não pagos / fora de aguardando). */
  pagamentos_abertos: number;
  /** Ainda precisam ser liberados para pagamento. */
  pagamentos_previstos: number;
  /** Liberados — prontos para informar pagamento. */
  pagamentos_liberados: number;
  /** Consumos ainda não descontados em pagamento. */
  consumos_pendentes: number;
  /** Normas detectadas aguardando confirmação / ignorar. */
  normas_pendentes: number;
}

/** Números rápidos para o topo do RH (dono/gerente). */
export function resumirOperacionalRh(
  db: Pick<
    DB,
    | "pessoas"
    | "pendencias_ponto"
    | "convocacoes"
    | "escala_slots"
    | "pagamentos_pessoas"
    | "consumos_pessoas"
    | "normas_rh"
  >,
  hoje: string = hojeIsoLocal()
): ResumoOperacionalRh {
  const ativas = (db.pessoas ?? []).filter((p) => p.ativo);
  let docs_alerta = 0;
  let docs_vencido = 0;
  let docs_a_vencer = 0;
  for (const p of ativas) {
    const alerta = alertaDocumentosPessoa(p);
    if (alerta.tem_alerta) docs_alerta += 1;
    if (alerta.vencido > 0) docs_vencido += 1;
    if (alerta.a_vencer > 0) docs_a_vencer += 1;
  }
  const pags = db.pagamentos_pessoas ?? [];
  const slots = db.escala_slots ?? [];
  const convocacoes = db.convocacoes ?? [];
  const enviadas = convocacoes.filter((c) => c.status === "enviada");
  const convocacoes_rascunho = convocacoes.filter((c) => c.status === "rascunho").length;
  let convocacoes_sem_resposta = 0;
  for (const c of enviadas) {
    const slot = slots.find((s) => s.id === c.escala_slot_id);
    if (convocacaoEnviadaSemRespostaVencida(c.status, slot?.data, hoje)) {
      convocacoes_sem_resposta += 1;
    }
  }
  const ponto = resumirPendenciasPontoAbertas(db);
  const clt_sem_plantao = listarCltSemPlantaoNaJanela(db, janelaCalendarioEscala(hoje)).length;
  return {
    pessoas_ativas: ativas.length,
    docs_alerta,
    docs_vencido,
    docs_a_vencer,
    ponto_abertas: ponto.total,
    ponto_a_avisar: ponto.aviso,
    ponto_propostas: ponto.proposta,
    convocacoes_enviadas: enviadas.length,
    convocacoes_sem_resposta,
    convocacoes_rascunho,
    clt_sem_plantao,
    pagamentos_aguardando: pags.filter((p) => p.status === "aguardando_conciliacao").length,
    pagamentos_abertos: pags.filter(
      (p) => p.status === "previsto" || p.status === "liberado"
    ).length,
    pagamentos_previstos: pags.filter((p) => p.status === "previsto").length,
    pagamentos_liberados: pags.filter((p) => p.status === "liberado").length,
    consumos_pendentes: (db.consumos_pessoas ?? []).filter((c) => c.status === "pendente").length,
    normas_pendentes: normasPendentes(db).length,
  };
}

export type FiltroPagamentosRh =
  | "abertos"
  | "previsto"
  | "liberado"
  | "aguardando"
  | "pagos"
  | "todos";

export function parseFiltroPagamentosRh(
  valor: string | null | undefined
): FiltroPagamentosRh {
  if (
    valor === "abertos" ||
    valor === "previsto" ||
    valor === "liberado" ||
    valor === "aguardando" ||
    valor === "pagos" ||
    valor === "todos"
  ) {
    return valor;
  }
  return "abertos";
}

/** Mapeia status do título para o filtro da lista de pagamentos. */
export function filtroPagamentosRhDeStatus(
  status: StatusPagamentoPessoa
): FiltroPagamentosRh {
  switch (status) {
    case "previsto":
      return "previsto";
    case "liberado":
      return "liberado";
    case "aguardando_conciliacao":
      return "aguardando";
    case "pago":
      return "pagos";
  }
}

export function hrefPagamentosRh(
  opts?:
    | FiltroPagamentosRh
    | {
        filtro?: FiltroPagamentosRh;
        pessoa?: string;
        competencia?: string;
        tipo?: TipoPagamentoPessoa | "todos";
      }
): string {
  const normalizado =
    typeof opts === "string" || opts === undefined ? { filtro: opts } : opts;
  const params = new URLSearchParams();
  if (normalizado.filtro && normalizado.filtro !== "abertos") {
    params.set("filtro", normalizado.filtro);
  }
  const pessoa = normalizado.pessoa?.trim();
  if (pessoa) params.set("pessoa", pessoa);
  const competencia = normalizado.competencia?.trim();
  if (competencia && /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) {
    params.set("competencia", competencia);
  }
  if (normalizado.tipo && normalizado.tipo !== "todos") {
    params.set("tipo", normalizado.tipo);
  }
  const q = params.toString();
  return q ? `/rh/pagamentos?${q}` : "/rh/pagamentos";
}

/** YYYY-MM válido; vazio = sem filtro de competência (diferente do espelho). */
export function parseCompetenciaPagamentosRh(valor: string | null | undefined): string {
  const v = valor?.trim() ?? "";
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return v;
  return "";
}

export type FiltroTipoPagamentosRh = TipoPagamentoPessoa | "todos";

export function parseTipoPagamentosRh(
  valor: string | null | undefined
): FiltroTipoPagamentosRh {
  if (TIPOS_PAGAMENTO_PESSOA.some((t) => t.id === valor)) {
    return valor as TipoPagamentoPessoa;
  }
  return "todos";
}

export type FiltroDocsRh = "todos" | "alerta" | "vencido" | "a_vencer";

export function parseFiltroDocsRh(valor: string | null | undefined): FiltroDocsRh {
  if (valor === "alerta" || valor === "vencido" || valor === "a_vencer") return valor;
  return "todos";
}

export function hrefPessoasRh(opts?: { docs?: FiltroDocsRh }): string {
  if (opts?.docs === "alerta") return "/rh?docs=alerta";
  if (opts?.docs === "vencido") return "/rh?docs=vencido";
  if (opts?.docs === "a_vencer") return "/rh?docs=a_vencer";
  return "/rh";
}

/** Filtra pessoas da lista RH por status de documentos. */
export function pessoaCorrespondeFiltroDocsRh(
  pessoa: Parameters<typeof alertaDocumentosPessoa>[0],
  filtro: FiltroDocsRh
): boolean {
  if (filtro === "todos") return true;
  const alerta = alertaDocumentosPessoa(pessoa);
  if (filtro === "alerta") return alerta.tem_alerta;
  if (filtro === "vencido") return alerta.vencido > 0;
  if (filtro === "a_vencer") return alerta.a_vencer > 0;
  return true;
}

export type FiltroConsumosRh = "pendentes" | "descontados" | "todos";

export function parseFiltroConsumosRh(
  valor: string | null | undefined
): FiltroConsumosRh {
  if (valor === "pendentes" || valor === "descontados" || valor === "todos") return valor;
  return "pendentes";
}

/** Mapeia status do consumo para o filtro da lista. */
export function filtroConsumosRhDeStatus(status: StatusConsumoPessoa): FiltroConsumosRh {
  return status === "pendente" ? "pendentes" : "descontados";
}

export function hrefConsumosRh(
  opts?: FiltroConsumosRh | { filtro?: FiltroConsumosRh; pessoa?: string }
): string {
  const normalizado =
    typeof opts === "string" || opts === undefined ? { filtro: opts } : opts;
  const params = new URLSearchParams();
  if (normalizado.filtro && normalizado.filtro !== "pendentes") {
    params.set("filtro", normalizado.filtro);
  }
  const pessoa = normalizado.pessoa?.trim();
  if (pessoa) params.set("pessoa", pessoa);
  const q = params.toString();
  return q ? `/rh/consumos?${q}` : "/rh/consumos";
}

export type FiltroNormasRh = "pendente" | "todas";

export function parseFiltroNormasRh(valor: string | null | undefined): FiltroNormasRh {
  if (valor === "todas") return "todas";
  return "pendente";
}

/** Deep link do hub / filtros: padrão é pendente (sem query). */
export function hrefNormasRh(opts?: FiltroNormasRh | { filtro?: FiltroNormasRh }): string {
  const filtro =
    typeof opts === "string" || opts === undefined ? opts : opts.filtro;
  if (filtro === "todas") return "/rh/normas?filtro=todas";
  return "/rh/normas";
}

export type AbaPontoRh = "pendencias" | "espelho";

export function parseAbaPontoRh(valor: string | null | undefined): AbaPontoRh {
  return valor === "espelho" ? "espelho" : "pendencias";
}

/** ID de pessoa em `?pessoa=` (vazio se ausente). */
export function parsePessoaPontoRh(valor: string | null | undefined): string {
  return valor?.trim() || "";
}

export type FiltroPendenciasPontoRh = "abertas" | "aviso" | "aguardando" | "proposta" | "todas";

export function parseFiltroPendenciasPontoRh(
  valor: string | null | undefined
): FiltroPendenciasPontoRh {
  if (
    valor === "aviso" ||
    valor === "aguardando" ||
    valor === "proposta" ||
    valor === "todas" ||
    valor === "abertas"
  ) {
    return valor;
  }
  return "abertas";
}

export function parseFiltroEspelhoPontoRh(
  valor: string | null | undefined
): FiltroEspelhoPonto {
  if (
    valor === "ok" ||
    valor === "atraso" ||
    valor === "incompleto" ||
    valor === "sem_batida" ||
    valor === "sem_escala" ||
    valor === "saldo_positivo" ||
    valor === "saldo_negativo" ||
    valor === "saldo_zero"
  ) {
    return valor;
  }
  return "todos";
}

/** YYYY-MM válido; senão competência do mês atual. */
export function parseCompetenciaEspelhoPontoRh(
  valor: string | null | undefined,
  hoje = new Date()
): string {
  const v = valor?.trim() ?? "";
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return v;
  return competenciaDeData(hoje);
}

export function hrefPontoRh(
  opts?:
    | {
        aba?: AbaPontoRh;
        pessoa?: string;
        filtro?: FiltroPendenciasPontoRh;
        status?: FiltroEspelhoPonto;
        competencia?: string;
      }
    | AbaPontoRh
): string {
  const normalizado =
    typeof opts === "string" || opts === undefined
      ? { aba: opts }
      : opts;
  const params = new URLSearchParams();
  if (normalizado.aba === "espelho") {
    params.set("aba", "espelho");
    if (normalizado.status && normalizado.status !== "todos") {
      params.set("status", normalizado.status);
    }
    const competencia = normalizado.competencia?.trim();
    if (competencia && competencia !== competenciaDeData()) {
      params.set("competencia", competencia);
    }
  } else if (normalizado.filtro && normalizado.filtro !== "abertas") {
    params.set("filtro", normalizado.filtro);
  }
  const pessoa = normalizado.pessoa?.trim();
  if (pessoa) params.set("pessoa", pessoa);
  const q = params.toString();
  return q ? `/rh/ponto?${q}` : "/rh/ponto";
}

export type FiltroConvocacaoEscalaRh = "todas" | "enviada" | "rascunho" | "sem_resposta";

export function parseFiltroConvocacaoEscalaRh(
  valor: string | null | undefined
): FiltroConvocacaoEscalaRh {
  if (valor === "enviada" || valor === "rascunho" || valor === "sem_resposta") return valor;
  return "todas";
}

export function hrefEscalaRh(opts?: {
  convocacao?: FiltroConvocacaoEscalaRh;
  clt?: "sem";
  pessoa?: string;
}): string {
  const params = new URLSearchParams();
  if (
    opts?.convocacao === "enviada" ||
    opts?.convocacao === "rascunho" ||
    opts?.convocacao === "sem_resposta"
  ) {
    params.set("convocacao", opts.convocacao);
  }
  if (opts?.clt === "sem") {
    params.set("clt", "sem");
  }
  const pessoa = opts?.pessoa?.trim();
  if (pessoa) params.set("pessoa", pessoa);
  const q = params.toString();
  return q ? `/rh/escala?${q}` : "/rh/escala";
}

/** Deep link do hub: destacar CLT sem plantão na escala. */
export function parseAlertaCltEscalaRh(valor: string | null | undefined): boolean {
  return valor === "sem";
}

/**
 * Com filtro `enviada`/`rascunho`/`sem_resposta` ativo, destaca plantões daquele status e atenua os demais.
 * Sem filtro, todos ficam `normal`.
 * Com `filtroPessoa`, só os plantões dessa pessoa ficam em destaque (demais atenuados).
 * Para `sem_resposta`, informe `dataSlot` + `hoje` (plantão enviado com data anterior a hoje).
 */
export function destaqueSlotFiltroConvocacao(
  filtro: FiltroConvocacaoEscalaRh,
  statusConvocacao: string | undefined,
  opts?: { filtroPessoa?: string; pessoaId?: string; dataSlot?: string; hoje?: string }
): "destaque" | "atenuado" | "normal" {
  const filtroPessoa = opts?.filtroPessoa?.trim();
  const hojeRef = opts?.hoje;
  const ehSemResposta =
    statusConvocacao === "enviada" &&
    Boolean(hojeRef) &&
    convocacaoEnviadaSemRespostaVencida("enviada", opts?.dataSlot, hojeRef!);

  if (filtroPessoa) {
    if (opts?.pessoaId !== filtroPessoa) return "atenuado";
    if (filtro === "sem_resposta") {
      return ehSemResposta ? "destaque" : "atenuado";
    }
    if (filtro === "enviada") {
      return statusConvocacao === "enviada" ? "destaque" : "atenuado";
    }
    if (filtro === "rascunho") {
      return statusConvocacao === "rascunho" ? "destaque" : "atenuado";
    }
    return "destaque";
  }
  if (filtro === "sem_resposta") {
    return ehSemResposta ? "destaque" : "atenuado";
  }
  if (filtro === "enviada") {
    return statusConvocacao === "enviada" ? "destaque" : "atenuado";
  }
  if (filtro === "rascunho") {
    return statusConvocacao === "rascunho" ? "destaque" : "atenuado";
  }
  return "normal";
}
