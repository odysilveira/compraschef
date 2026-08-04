import type { DB } from "../types";
import { alertaDocumentosPessoa, hojeIsoLocal } from "./documentos-pessoa";
import { convocacaoEnviadaSemRespostaVencida } from "./escala";
import { pendenciasPontoAbertas } from "./ponto-rh";

export interface ResumoOperacionalRh {
  pessoas_ativas: number;
  docs_alerta: number;
  docs_vencido: number;
  docs_a_vencer: number;
  ponto_abertas: number;
  convocacoes_enviadas: number;
  /** Enviadas com plantão já passado — triagem de silêncio na escala. */
  convocacoes_sem_resposta: number;
  /** Títulos informados, aguardando conciliação bancária. */
  pagamentos_aguardando: number;
  /** Previstos + liberados (ainda não pagos). */
  pagamentos_abertos: number;
  /** Consumos ainda não descontados em pagamento. */
  consumos_pendentes: number;
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
  const enviadas = (db.convocacoes ?? []).filter((c) => c.status === "enviada");
  let convocacoes_sem_resposta = 0;
  for (const c of enviadas) {
    const slot = slots.find((s) => s.id === c.escala_slot_id);
    if (convocacaoEnviadaSemRespostaVencida(c.status, slot?.data, hoje)) {
      convocacoes_sem_resposta += 1;
    }
  }
  return {
    pessoas_ativas: ativas.length,
    docs_alerta,
    docs_vencido,
    docs_a_vencer,
    ponto_abertas: pendenciasPontoAbertas(db).length,
    convocacoes_enviadas: enviadas.length,
    convocacoes_sem_resposta,
    pagamentos_aguardando: pags.filter((p) => p.status === "aguardando_conciliacao").length,
    pagamentos_abertos: pags.filter(
      (p) => p.status === "previsto" || p.status === "liberado"
    ).length,
    consumos_pendentes: (db.consumos_pessoas ?? []).filter((c) => c.status === "pendente").length,
  };
}

export type FiltroPagamentosRh = "abertos" | "aguardando" | "pagos" | "todos";

export function parseFiltroPagamentosRh(
  valor: string | null | undefined
): FiltroPagamentosRh {
  if (valor === "abertos" || valor === "aguardando" || valor === "pagos" || valor === "todos") {
    return valor;
  }
  return "abertos";
}

export function hrefPagamentosRh(
  opts?: FiltroPagamentosRh | { filtro?: FiltroPagamentosRh; pessoa?: string }
): string {
  const normalizado =
    typeof opts === "string" || opts === undefined ? { filtro: opts } : opts;
  const params = new URLSearchParams();
  if (normalizado.filtro && normalizado.filtro !== "abertos") {
    params.set("filtro", normalizado.filtro);
  }
  const pessoa = normalizado.pessoa?.trim();
  if (pessoa) params.set("pessoa", pessoa);
  const q = params.toString();
  return q ? `/rh/pagamentos?${q}` : "/rh/pagamentos";
}

export type FiltroDocsRh = "todos" | "alerta";

export function parseFiltroDocsRh(valor: string | null | undefined): FiltroDocsRh {
  return valor === "alerta" ? "alerta" : "todos";
}

export function hrefPessoasRh(opts?: { docs?: FiltroDocsRh }): string {
  if (opts?.docs === "alerta") return "/rh?docs=alerta";
  return "/rh";
}

export type FiltroConsumosRh = "pendentes" | "descontados" | "todos";

export function parseFiltroConsumosRh(
  valor: string | null | undefined
): FiltroConsumosRh {
  if (valor === "pendentes" || valor === "descontados" || valor === "todos") return valor;
  return "pendentes";
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

export type AbaPontoRh = "pendencias" | "espelho";

export function parseAbaPontoRh(valor: string | null | undefined): AbaPontoRh {
  return valor === "espelho" ? "espelho" : "pendencias";
}

/** ID de pessoa em `?pessoa=` (vazio se ausente). */
export function parsePessoaPontoRh(valor: string | null | undefined): string {
  return valor?.trim() || "";
}

export function hrefPontoRh(opts?: { aba?: AbaPontoRh; pessoa?: string } | AbaPontoRh): string {
  const normalizado =
    typeof opts === "string" || opts === undefined
      ? { aba: opts }
      : opts;
  const params = new URLSearchParams();
  if (normalizado.aba === "espelho") params.set("aba", "espelho");
  const pessoa = normalizado.pessoa?.trim();
  if (pessoa) params.set("pessoa", pessoa);
  const q = params.toString();
  return q ? `/rh/ponto?${q}` : "/rh/ponto";
}

export type FiltroConvocacaoEscalaRh = "todas" | "enviada";

export function parseFiltroConvocacaoEscalaRh(
  valor: string | null | undefined
): FiltroConvocacaoEscalaRh {
  return valor === "enviada" ? "enviada" : "todas";
}

export function hrefEscalaRh(opts?: { convocacao?: FiltroConvocacaoEscalaRh }): string {
  if (opts?.convocacao === "enviada") return "/rh/escala?convocacao=enviada";
  return "/rh/escala";
}

/**
 * Com filtro `enviada` ativo, destaca plantões aguardando resposta e atenua os demais.
 * Sem filtro, todos ficam `normal`.
 */
export function destaqueSlotFiltroConvocacao(
  filtro: FiltroConvocacaoEscalaRh,
  statusConvocacao: string | undefined
): "destaque" | "atenuado" | "normal" {
  if (filtro !== "enviada") return "normal";
  return statusConvocacao === "enviada" ? "destaque" : "atenuado";
}
