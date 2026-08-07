/** Deep links do Estoque a partir do Painel (`?alerta=` + `dias` para validade). */

export type AlertaEstoque = "minimo" | "validade";

export type DiasVencimentoEstoque = 0 | 3 | 7 | 15;

export const DIAS_VENCIMENTO_ESTOQUE: DiasVencimentoEstoque[] = [0, 3, 7, 15];

export function parseAlertaEstoque(valor: string | null | undefined): AlertaEstoque | null {
  if (valor === "minimo" || valor === "validade") return valor;
  return null;
}

/** Janela de validade; default 3 dias (atalho do Painel). */
export function parseDiasVencimentoEstoque(
  valor: string | null | undefined
): DiasVencimentoEstoque {
  const bruto = (valor ?? "").trim();
  if (!bruto) return 3;
  const n = Number(bruto);
  if (n === 0 || n === 3 || n === 7 || n === 15) return n;
  return 3;
}

/**
 * Monta URL do Estoque.
 * Defaults omitidos: sem alerta → `/estoque`; validade com 3 dias → só `alerta=validade`.
 */
export function hrefEstoque(opts?: {
  alerta?: AlertaEstoque;
  dias?: DiasVencimentoEstoque;
}): string {
  const params = new URLSearchParams();
  if (opts?.alerta) params.set("alerta", opts.alerta);
  if (opts?.alerta === "validade" && opts.dias !== undefined && opts.dias !== 3) {
    params.set("dias", String(opts.dias));
  }
  const q = params.toString();
  return q ? `/estoque?${q}` : "/estoque";
}
