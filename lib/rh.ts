// Helpers de datas do módulo RH (pagamentos e escala).

/** Data local de hoje em ISO (YYYY-MM-DD), sem deslocamento de fuso horário. */
export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoParaData(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

function dataParaIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lista de datas ISO entre `deISO` e `ateISO`, inclusive. [] se o intervalo for inválido (fim antes do início). */
export function intervaloDeDias(deISO: string, ateISO: string): string[] {
  const inicio = isoParaData(deISO);
  const fim = isoParaData(ateISO);
  if (fim < inicio) return [];
  const dias: string[] = [];
  for (const cursor = new Date(inicio); cursor <= fim; cursor.setDate(cursor.getDate() + 1)) {
    dias.push(dataParaIso(cursor));
  }
  return dias;
}

/** Copia o link público de autoatribuição de uma vaga em aberto (ver app/vaga-rh/[token]). */
export async function copiarLinkVaga(tokenVaga: string) {
  const link = `${window.location.origin}/vaga-rh/${tokenVaga}`;
  try {
    await navigator.clipboard.writeText(link);
    window.alert("Link copiado! Envie por WhatsApp pra quem puder cobrir esse turno.");
  } catch {
    window.prompt("Copie o link da vaga:", link);
  }
}
