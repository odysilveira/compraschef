import type { DB } from "../types";
import { alertaDocumentosPessoa } from "./documentos-pessoa";
import { pendenciasPontoAbertas } from "./ponto-rh";

export interface ResumoOperacionalRh {
  pessoas_ativas: number;
  docs_alerta: number;
  docs_vencido: number;
  docs_a_vencer: number;
  ponto_abertas: number;
  convocacoes_enviadas: number;
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
    "pessoas" | "pendencias_ponto" | "convocacoes" | "pagamentos_pessoas" | "consumos_pessoas"
  >
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
  return {
    pessoas_ativas: ativas.length,
    docs_alerta,
    docs_vencido,
    docs_a_vencer,
    ponto_abertas: pendenciasPontoAbertas(db).length,
    convocacoes_enviadas: (db.convocacoes ?? []).filter((c) => c.status === "enviada").length,
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

export function hrefPagamentosRh(filtro?: FiltroPagamentosRh): string {
  if (!filtro || filtro === "abertos") return "/rh/pagamentos";
  return `/rh/pagamentos?filtro=${filtro}`;
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

export function hrefConsumosRh(filtro?: FiltroConsumosRh): string {
  if (!filtro || filtro === "pendentes") return "/rh/consumos";
  return `/rh/consumos?filtro=${filtro}`;
}

export type AbaPontoRh = "pendencias" | "espelho";

export function parseAbaPontoRh(valor: string | null | undefined): AbaPontoRh {
  return valor === "espelho" ? "espelho" : "pendencias";
}

export function hrefPontoRh(aba?: AbaPontoRh): string {
  if (!aba || aba === "pendencias") return "/rh/ponto";
  return `/rh/ponto?aba=${aba}`;
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
