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

export function dataBR(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString("pt-BR");
}

export function dataHoraBR(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Dias entre hoje e a data (negativo = já passou). */
export function diasAte(isoData?: string): number | undefined {
  if (!isoData) return undefined;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${isoData.slice(0, 10)}T00:00:00`);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

/** Rótulo amigável de validade: "vence hoje", "vence em 3 dias", "venceu há 2 dias". */
export function rotuloValidade(isoData?: string): string {
  const dias = diasAte(isoData);
  if (dias === undefined) return "sem validade";
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  if (dias > 1) return `vence em ${dias} dias`;
  if (dias === -1) return "venceu ontem";
  return `venceu há ${Math.abs(dias)} dias`;
}
