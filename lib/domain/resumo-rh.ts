import type { DB } from "../types";
import { alertaDocumentosPessoa } from "./documentos-pessoa";
import { pendenciasPontoAbertas } from "./ponto-rh";

export interface ResumoOperacionalRh {
  pessoas_ativas: number;
  docs_alerta: number;
  docs_vencido: number;
  ponto_abertas: number;
  convocacoes_enviadas: number;
}

/** Números rápidos para o topo do RH (dono/gerente). */
export function resumirOperacionalRh(
  db: Pick<DB, "pessoas" | "pendencias_ponto" | "convocacoes">
): ResumoOperacionalRh {
  const ativas = (db.pessoas ?? []).filter((p) => p.ativo);
  let docs_alerta = 0;
  let docs_vencido = 0;
  for (const p of ativas) {
    const alerta = alertaDocumentosPessoa(p);
    if (alerta.tem_alerta) docs_alerta += 1;
    if (alerta.vencido > 0) docs_vencido += 1;
  }
  return {
    pessoas_ativas: ativas.length,
    docs_alerta,
    docs_vencido,
    ponto_abertas: pendenciasPontoAbertas(db).length,
    convocacoes_enviadas: (db.convocacoes ?? []).filter((c) => c.status === "enviada").length,
  };
}
