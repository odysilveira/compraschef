/** Linha normalizada de extrato bancário (OFX ou similar). */
export interface LinhaExtrato {
  /** YYYY-MM-DD */
  data: string;
  /** Valor com sinal: negativo = débito (saída). */
  valor: number;
  tipo: "debito" | "credito" | "outro";
  descricao: string;
  fitid?: string;
}

/**
 * Converte DTPOSTED OFX (YYYYMMDD ou YYYYMMDDHHMMSS[+/-TZ]) → YYYY-MM-DD.
 */
export function dataOfxParaIso(dtposted: string): string | null {
  const digitos = (dtposted || "").replace(/\D/g, "");
  if (digitos.length < 8) return null;
  const y = digitos.slice(0, 4);
  const m = digitos.slice(4, 6);
  const d = digitos.slice(6, 8);
  if (!/^\d{4}$/.test(y) || Number(m) < 1 || Number(m) > 12 || Number(d) < 1 || Number(d) > 31) {
    return null;
  }
  return `${y}-${m}-${d}`;
}

function limparTagsSgml(bloco: string): Record<string, string> {
  const campos: Record<string, string> = {};
  // OFX 1.x: <TAG>valor (sem fechamento) ou <TAG>valor</TAG>
  const re = /<([A-Z0-9.]+)>([^<\r\n]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bloco)) !== null) {
    const chave = m[1]!.toUpperCase();
    const valor = m[2]!.trim();
    if (valor) campos[chave] = valor;
  }
  return campos;
}

function classificarTipo(trntype: string | undefined, valor: number): LinhaExtrato["tipo"] {
  const t = (trntype || "").toUpperCase();
  if (t.includes("CREDIT") || t === "DEP" || t === "DIRECTDEP") return "credito";
  if (t.includes("DEBIT") || t === "POS" || t === "ATM" || t === "XFER" || t === "PAYMENT" || t === "CHECK") {
    return "debito";
  }
  if (valor < 0) return "debito";
  if (valor > 0) return "credito";
  return "outro";
}

/**
 * Extrai STMTTRN de texto OFX (SGML 1.x ou XML 2.x simplificado).
 */
export function parseOfx(texto: string): { ok: true; linhas: LinhaExtrato[] } | { ok: false; erro: string } {
  if (!texto || !texto.trim()) {
    return { ok: false, erro: "Arquivo vazio." };
  }
  const bruto = texto.replace(/\u0000/g, "");
  if (!/<OFX[\s>]/i.test(bruto) && !/<STMTTRN[\s>]/i.test(bruto)) {
    return { ok: false, erro: "Não parece um arquivo OFX. Exporte o extrato em OFX no internet banking." };
  }

  const blocos = bruto.match(/<STMTTRN[\s>][\s\S]*?<\/STMTTRN>/gi) ?? [];
  // OFX 1.x às vezes não fecha STMTTRN — fallback por <STMTTRN> ... próximo <STMTTRN> ou </BANKTRANLIST>
  let candidatos: string[] = [...blocos];
  if (candidatos.length === 0) {
    const partes = bruto.split(/<STMTTRN>/i).slice(1);
    candidatos = partes.map((p) => {
      const fim = p.search(/<\/STMTTRN>|<STMTTRN>|<BANKTRANLIST>|<\/BANKTRANLIST>/i);
      return fim >= 0 ? p.slice(0, fim) : p;
    });
  }

  const linhas: LinhaExtrato[] = [];
  for (const bloco of candidatos) {
    const c = limparTagsSgml(bloco);
    const valorRaw = (c.TRNAMT || "").replace(",", ".");
    const valor = Number(valorRaw);
    if (!Number.isFinite(valor) || valor === 0) continue;
    const data = dataOfxParaIso(c.DTPOSTED || "");
    if (!data) continue;
    const descricao = (c.MEMO || c.NAME || c.PAYEEID || "Movimentação").trim();
    linhas.push({
      data,
      valor: Number(valor.toFixed(2)),
      tipo: classificarTipo(c.TRNTYPE, valor),
      descricao,
      fitid: c.FITID?.trim() || undefined,
    });
  }

  if (linhas.length === 0) {
    return { ok: false, erro: "Nenhuma movimentação encontrada no OFX." };
  }

  linhas.sort((a, b) => a.data.localeCompare(b.data) || Math.abs(a.valor) - Math.abs(b.valor));
  return { ok: true, linhas };
}

/** Só saídas (débitos) — o que interessa para conciliar boletos pagos. */
export function debitosDoExtrato(linhas: LinhaExtrato[]): LinhaExtrato[] {
  return linhas.filter((l) => l.tipo === "debito" || l.valor < 0);
}
