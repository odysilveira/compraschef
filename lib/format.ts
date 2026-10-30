// Formatação pt-BR

export function moeda(valor?: number): string {
  if (valor === undefined || valor === null || Number.isNaN(valor)) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function qtd(valor?: number, sigla?: string): string {
  if (valor === undefined || valor === null) return "—";
  const num = valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return sigla ? `${num} ${sigla}` : num;
}

/** Data civil local YYYY-MM-DD (sem deslocar por fuso via toISOString). */
export function hojeISOLocal(agora = new Date()): string {
  const y = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, "0");
  const d = String(agora.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dataBR(iso?: string): string {
  if (!iso) return "—";
  // Meio-dia local evita virar o dia anterior/próximo em fusos negativos.
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString("pt-BR");
}

export function dataHoraBR(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function cnpjBR(valor?: string): string {
  const digitos = (valor ?? "").replace(/\D+/g, "");
  if (digitos.length !== 14) return "—";
  return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/**
 * Dias entre a data civil de hoje e a validade (negativo = já passou).
 * Usa só YYYY-MM-DD em UTC noon — estável no mesmo dia civil local.
 */
export function diasAte(isoData?: string, agora = new Date()): number | undefined {
  if (!isoData) return undefined;
  const alvo = isoData.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(alvo)) return undefined;
  const hoje = hojeISOLocal(agora);
  const tAlvo = Date.parse(`${alvo}T12:00:00Z`);
  const tHoje = Date.parse(`${hoje}T12:00:00Z`);
  if (Number.isNaN(tAlvo) || Number.isNaN(tHoje)) return undefined;
  return Math.round((tAlvo - tHoje) / 86400000);
}

/** Rótulo amigável de validade: "vence hoje", "vence em 3 dias", "venceu há 2 dias". */
export function rotuloValidade(isoData?: string, agora = new Date()): string {
  const dias = diasAte(isoData, agora);
  if (dias === undefined) return "sem validade";
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  if (dias > 1) return `vence em ${dias} dias`;
  if (dias === -1) return "venceu ontem";
  const abs = Math.abs(dias);
  return abs === 1 ? "venceu há 1 dia" : `venceu há ${abs} dias`;
}
