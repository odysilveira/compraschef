import type { ConfigControlId } from "../types";

export const CONTROL_ID_LOGIN_PADRAO = "admin";
export const CONTROL_ID_SENHA_PADRAO = "admin";

export function configControlIdPadrao(): ConfigControlId {
  return {
    host: "",
    login: CONTROL_ID_LOGIN_PADRAO,
    password: CONTROL_ID_SENHA_PADRAO,
    mode_671: true,
  };
}

/** Só permite hosts privados / localhost (evita SSRF pela rota API). */
export function hostControlIdPermitido(hostBruto: string): boolean {
  const host = hostBruto.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0] ?? "";
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  const m172 = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (m172) {
    const segundo = Number(m172[1]);
    return segundo >= 16 && segundo <= 31;
  }
  return false;
}

export function normalizarHostControlId(hostBruto: string): string {
  return hostBruto.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function urlControlId(host: string, caminho: string, query: Record<string, string> = {}): string {
  const base = normalizarHostControlId(host);
  const path = caminho.startsWith("/") ? caminho : `/${caminho}`;
  const qs = new URLSearchParams(query).toString();
  return `https://${base}${path}${qs ? `?${qs}` : ""}`;
}

/** Extrai o maior NSR das linhas de marcação (para sync incremental). */
export function maiorNsrDoAfd(texto: string): number | undefined {
  let maior = 0;
  for (const linha of texto.split(/\r?\n/)) {
    if (linha.length < 10) continue;
    const tipo = linha[9];
    if (tipo !== "3" && tipo !== "7") continue;
    const nsr = Number(linha.slice(0, 9));
    if (Number.isFinite(nsr) && nsr > maior) maior = nsr;
  }
  return maior > 0 ? maior : undefined;
}
