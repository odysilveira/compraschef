import type { LinhaExtrato } from "./extrato-ofx";

/**
 * Converte data BR (DD/MM/AAAA) ou ISO (AAAA-MM-DD) → YYYY-MM-DD.
 */
export function dataCsvParaIso(valor: string): string | null {
  const bruto = (valor || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return bruto;
  const m = bruto.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const d = m[1]!.padStart(2, "0");
  const mes = m[2]!.padStart(2, "0");
  const a = m[3]!;
  if (Number(mes) < 1 || Number(mes) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  return `${a}-${mes}-${d}`;
}

/** Aceita 150,00 / 150.00 / -150,00 / (150,00). */
export function valorCsvParaNumero(valor: string): number | null {
  let bruto = (valor || "").trim();
  if (!bruto) return null;
  let negativo = false;
  if (bruto.startsWith("(") && bruto.endsWith(")")) {
    negativo = true;
    bruto = bruto.slice(1, -1).trim();
  }
  if (bruto.startsWith("-")) {
    negativo = true;
    bruto = bruto.slice(1).trim();
  }
  bruto = bruto.replace(/R\$\s?/i, "").replace(/\s/g, "");
  if (bruto.includes(",") && bruto.includes(".")) {
    // 1.234,56
    bruto = bruto.replace(/\./g, "").replace(",", ".");
  } else if (bruto.includes(",")) {
    bruto = bruto.replace(",", ".");
  }
  const n = Number(bruto);
  if (!Number.isFinite(n) || n === 0) return null;
  const v = Number(Math.abs(n).toFixed(2));
  return negativo ? -v : v;
}

function detectarSeparador(cabecalho: string): ";" | "," {
  const pts = (cabecalho.match(/;/g) ?? []).length;
  const vgs = (cabecalho.match(/,/g) ?? []).length;
  return pts >= vgs ? ";" : ",";
}

function splitCsvLinha(linha: string, sep: ";" | ","): string[] {
  const out: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]!;
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else {
        aspas = !aspas;
      }
      continue;
    }
    if (c === sep && !aspas) {
      out.push(atual.trim());
      atual = "";
      continue;
    }
    atual += c;
  }
  out.push(atual.trim());
  return out;
}

function indiceColuna(headers: string[], candidatos: string[]): number {
  const norm = headers.map((h) =>
    h
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
  );
  for (const cand of candidatos) {
    const i = norm.findIndex((h) => h === cand || h.includes(cand));
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * CSV mínimo: data, valor, descrição (cabeçalho flexível).
 * Débitos devem vir negativos ou coluna tipo=D/débito.
 */
export function parseCsvExtrato(
  texto: string
): { ok: true; linhas: LinhaExtrato[] } | { ok: false; erro: string } {
  if (!texto || !texto.trim()) {
    return { ok: false, erro: "Arquivo vazio." };
  }
  const limpo = texto.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const linhasBrutas = limpo.split("\n").filter((l) => l.trim());
  if (linhasBrutas.length < 2) {
    return { ok: false, erro: "CSV precisa de cabeçalho e ao menos uma linha." };
  }
  const sep = detectarSeparador(linhasBrutas[0]!);
  const headers = splitCsvLinha(linhasBrutas[0]!, sep);
  const iData = indiceColuna(headers, ["data", "dt", "date", "data lancamento", "data_lancamento"]);
  const iValor = indiceColuna(headers, ["valor", "amount", "vlr", "quantia"]);
  const iDesc = indiceColuna(headers, [
    "descricao",
    "histórico",
    "historico",
    "memo",
    "lancamento",
    "detalhe",
  ]);
  const iTipo = indiceColuna(headers, ["tipo", "natureza", "d/c", "dc", "credito/debito"]);
  if (iData < 0 || iValor < 0 || iDesc < 0) {
    return {
      ok: false,
      erro: "Cabeçalho deve ter colunas de data, valor e descrição (nomes flexíveis).",
    };
  }

  const linhas: LinhaExtrato[] = [];
  for (let i = 1; i < linhasBrutas.length; i++) {
    const cols = splitCsvLinha(linhasBrutas[i]!, sep);
    const data = dataCsvParaIso(cols[iData] ?? "");
    let valor = valorCsvParaNumero(cols[iValor] ?? "");
    if (!data || valor === null) continue;
    const tipoRaw = (cols[iTipo] ?? "").toLowerCase();
    if (iTipo >= 0 && tipoRaw) {
      if (/^d|debito|debit|saida|pagamento/.test(tipoRaw) && valor > 0) valor = -valor;
      if (/^c|credito|credit|entrada/.test(tipoRaw) && valor < 0) valor = Math.abs(valor);
    }
    const descricao = (cols[iDesc] ?? "").trim() || "Movimentação";
    const tipo: LinhaExtrato["tipo"] =
      valor < 0 ? "debito" : valor > 0 ? "credito" : "outro";
    linhas.push({
      data,
      valor: Number(valor.toFixed(2)),
      tipo,
      descricao,
      fitid: `csv-${data}-${valor}-${i}`,
    });
  }

  if (linhas.length === 0) {
    return { ok: false, erro: "Nenhuma movimentação válida encontrada no CSV." };
  }
  linhas.sort((a, b) => a.data.localeCompare(b.data) || Math.abs(a.valor) - Math.abs(b.valor));
  return { ok: true, linhas };
}
