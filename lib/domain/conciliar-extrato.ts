import type { Boleto, DB } from "../types";
import { debitosDoExtrato, type LinhaExtrato } from "./extrato-ofx";
import { conciliarBoleto } from "./pagar-boleto";

export interface SugestaoMatchExtrato {
  linha: LinhaExtrato;
  boleto_id: string | null;
  confianca: "exata" | "proxima" | "nenhuma";
  motivos: string[];
}

function diasEntre(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  return Math.abs(Math.round((da.getTime() - db.getTime()) / (24 * 60 * 60 * 1000)));
}

function valorRefBoleto(boleto: Boleto): number {
  return Number((boleto.pagamento_valor ?? boleto.valor).toFixed(2));
}

function dataRefBoleto(boleto: Boleto): string {
  return (boleto.pagamento_data || boleto.vencimento || "").slice(0, 10);
}

/**
 * Sugere vínculo débito OFX ↔ boleto em aguardando conciliação.
 * Prioridade: valor ±tolerância e data ±janelaDias em relação a pagamento_data.
 */
export function sugerirMatchesExtratoBoletos(
  db: Pick<DB, "boletos">,
  linhas: LinhaExtrato[],
  opcoes: { toleranciaValor?: number; janelaDias?: number } = {}
): SugestaoMatchExtrato[] {
  const tolerancia = opcoes.toleranciaValor ?? 0.02;
  const janela = opcoes.janelaDias ?? 2;
  const debitos = debitosDoExtrato(linhas);
  const candidatos = (db.boletos ?? []).filter((b) => b.status === "aguardando_conciliacao");
  const usados = new Set<string>();

  const pontuar = (linha: LinhaExtrato, boleto: Boleto): { pontos: number; confianca: "exata" | "proxima"; motivos: string[] } | null => {
    const valorLinha = Number(Math.abs(linha.valor).toFixed(2));
    const valorBol = valorRefBoleto(boleto);
    const diffValor = Math.abs(valorLinha - valorBol);
    if (diffValor > tolerancia) return null;
    const dataBol = dataRefBoleto(boleto);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataBol)) return null;
    const diffDias = diasEntre(linha.data, dataBol);
    if (diffDias > janela) return null;
    const motivos: string[] = [];
    if (diffValor <= 0.009) motivos.push("valor igual");
    else motivos.push(`valor próximo (Δ R$ ${diffValor.toFixed(2)})`);
    if (diffDias === 0) motivos.push("mesma data");
    else motivos.push(`data ±${diffDias} dia(s)`);
    const confianca: "exata" | "proxima" = diffValor <= 0.009 && diffDias === 0 ? "exata" : "proxima";
    const pontos = (diffValor <= 0.009 ? 100 : 80 - diffValor * 10) + (diffDias === 0 ? 50 : 40 - diffDias * 5);
    return { pontos, confianca, motivos };
  };

  // Ordena débitos maiores primeiro para casar títulos grandes com prioridade
  const ordenados = [...debitos].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
  const sugestoes: SugestaoMatchExtrato[] = [];

  for (const linha of ordenados) {
    let melhor: { boleto: Boleto; pontos: number; confianca: "exata" | "proxima"; motivos: string[] } | null = null;
    for (const boleto of candidatos) {
      if (usados.has(boleto.id)) continue;
      const score = pontuar(linha, boleto);
      if (!score) continue;
      if (!melhor || score.pontos > melhor.pontos) {
        melhor = { boleto, ...score };
      }
    }
    if (melhor) {
      usados.add(melhor.boleto.id);
      sugestoes.push({
        linha,
        boleto_id: melhor.boleto.id,
        confianca: melhor.confianca,
        motivos: melhor.motivos,
      });
    } else {
      sugestoes.push({
        linha,
        boleto_id: null,
        confianca: "nenhuma",
        motivos: ["Nenhum boleto aguardando conciliação com valor/data parecidos."],
      });
    }
  }

  return sugestoes.sort((a, b) => a.linha.data.localeCompare(b.linha.data));
}

export function aplicarMatchesExtratoBoletos(
  db: DB,
  matches: Array<{ boleto_id: string; dataLiquidacao: string; observacao?: string }>,
  opcoes: { responsavel?: string; agora?: string; idFactory?: () => string } = {}
): { sucesso: boolean; conciliados: number; erros: string[] } {
  let conciliados = 0;
  const erros: string[] = [];
  for (const m of matches) {
    const r = conciliarBoleto(
      db,
      m.boleto_id,
      {
        dataLiquidacao: m.dataLiquidacao,
        responsavel: opcoes.responsavel ?? "usuário local",
        observacao: m.observacao ?? "Conciliação via extrato OFX",
      },
      {
        agora: opcoes.agora,
        responsavelPadrao: opcoes.responsavel ?? "usuário local",
        gerarIdHistorico: opcoes.idFactory,
      }
    );
    if (r.sucesso) conciliados += 1;
    else erros.push(...r.erros);
  }
  return { sucesso: erros.length === 0, conciliados, erros };
}
