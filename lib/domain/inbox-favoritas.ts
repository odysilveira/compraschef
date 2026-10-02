/**
 * Pastas favoritas da Caixa de entrada (atalhos OneDrive locais).
 * Limite baixo para o select não virar bagunça.
 */

export const LIMITE_FAVORITAS_INBOX = 10;

export interface FavoritaInbox {
  id: string;
  /** Nome exibido no select (editável). */
  nome: string;
  /** Nome da pasta no sistema no momento em que foi salva. */
  pastaNome: string;
  criadaEm: number;
}

export function podeAdicionarFavorita(qtdAtual: number): boolean {
  return qtdAtual < LIMITE_FAVORITAS_INBOX;
}

export function nomePadraoFavorita(pastaNome: string, existentes: FavoritaInbox[]): string {
  const base = (pastaNome || "Pasta").trim().slice(0, 60) || "Pasta";
  const nomes = new Set(existentes.map((f) => f.nome.toLowerCase()));
  if (!nomes.has(base.toLowerCase())) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidato = `${base} (${i})`;
    if (!nomes.has(candidato.toLowerCase())) return candidato;
  }
  return `${base} (${Date.now()})`;
}

export function idFavorita(prefixo = "fav"): string {
  return `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function chaveSelectFavorita(id: string): `fav:${string}` {
  return `fav:${id}`;
}

export function parseChaveSelectFavorita(valor: string): string | null {
  if (!valor.startsWith("fav:")) return null;
  const id = valor.slice(4);
  return id || null;
}

export function rotuloFavoritaNoSelect(fav: FavoritaInbox): string {
  return `★ ${fav.nome}`;
}
