import type { Boleto, DB, PagamentoPessoa } from "../types";
import { debitosDoExtrato, type LinhaExtrato } from "./extrato-ofx";
import { conciliarBoleto } from "./pagar-boleto";
import { conciliarPagamentoPessoa } from "./pagamentos-pessoas";

export type AlvoMatchExtrato = "boleto" | "rh";

export interface SugestaoMatchExtrato {
  linha: LinhaExtrato;
  alvo: AlvoMatchExtrato | null;
  alvo_id: string | null;
  confianca: "exata" | "proxima" | "nenhuma";
  motivos: string[];
  /** Rótulo amigável do candidato (fornecedor / pessoa / banco informado). */
  rotulo_alvo?: string;
}

function diasEntre(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00`);
  const dbData = new Date(`${b}T12:00:00`);
  return Math.abs(Math.round((da.getTime() - dbData.getTime()) / (24 * 60 * 60 * 1000)));
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function pontuarValorDataBanco(
  linha: LinhaExtrato,
  valorRef: number,
  dataRef: string,
  bancoInformado: string | undefined,
  tolerancia: number,
  janela: number
): { pontos: number; confianca: "exata" | "proxima"; motivos: string[] } | null {
  const valorLinha = Number(Math.abs(linha.valor).toFixed(2));
  const diffValor = Math.abs(valorLinha - valorRef);
  if (diffValor > tolerancia) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRef)) return null;
  const diffDias = diasEntre(linha.data, dataRef);
  if (diffDias > janela) return null;

  const motivos: string[] = [];
  if (diffValor <= 0.009) motivos.push("valor igual");
  else motivos.push(`valor próximo (Δ R$ ${diffValor.toFixed(2)})`);
  if (diffDias === 0) motivos.push("mesma data");
  else motivos.push(`data ±${diffDias} dia(s)`);

  let pontos = (diffValor <= 0.009 ? 100 : 80 - diffValor * 10) + (diffDias === 0 ? 50 : 40 - diffDias * 5);

  const banco = normalizar(bancoInformado ?? "");
  const memo = normalizar(linha.descricao);
  if (banco) {
    const tokens = banco.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
    const hit = tokens.some((t) => memo.includes(t));
    if (hit) {
      pontos += 25;
      motivos.push("banco informado aparece no extrato");
    }
  }

  const confianca: "exata" | "proxima" =
    diffValor <= 0.009 && diffDias === 0 ? "exata" : "proxima";
  return { pontos, confianca, motivos };
}

/**
 * Sugere vínculo débito OFX ↔ boletos e pagamentos RH em aguardando conciliação.
 * Usa valor, data do pagamento informado e (bônus) nome do banco/conta.
 */
export function sugerirMatchesExtrato(
  db: Pick<DB, "boletos" | "pagamentos_pessoas" | "pessoas" | "fornecedores" | "notas_fiscais">,
  linhas: LinhaExtrato[],
  opcoes: { toleranciaValor?: number; janelaDias?: number } = {}
): SugestaoMatchExtrato[] {
  const tolerancia = opcoes.toleranciaValor ?? 0.02;
  const janela = opcoes.janelaDias ?? 2;
  const debitos = debitosDoExtrato(linhas);
  const boletos = (db.boletos ?? []).filter((b) => b.status === "aguardando_conciliacao");
  const rhs = (db.pagamentos_pessoas ?? []).filter((p) => p.status === "aguardando_conciliacao");
  const usadosBoleto = new Set<string>();
  const usadosRh = new Set<string>();

  type Cand = {
    alvo: AlvoMatchExtrato;
    id: string;
    rotulo: string;
    pontos: number;
    confianca: "exata" | "proxima";
    motivos: string[];
  };

  const rotuloBoleto = (boleto: Boleto): string => {
    const nota = (db.notas_fiscais ?? []).find((n) => n.id === boleto.nota_id);
    const forn = nota ? (db.fornecedores ?? []).find((f) => f.id === nota.fornecedor_id) : undefined;
    const banco = boleto.pagamento_banco_conta ? ` · ${boleto.pagamento_banco_conta}` : "";
    return `Boleto · ${forn?.nome ?? "fornecedor"}${banco}`;
  };

  const rotuloRh = (pag: PagamentoPessoa): string => {
    const pessoa = (db.pessoas ?? []).find((p) => p.id === pag.pessoa_id);
    const banco = pag.pagamento_banco_conta ? ` · ${pag.pagamento_banco_conta}` : "";
    return `RH · ${pessoa?.nome ?? "pessoa"}${banco}`;
  };

  const ordenados = [...debitos].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
  const sugestoes: SugestaoMatchExtrato[] = [];

  for (const linha of ordenados) {
    let melhor: Cand | null = null;

    for (const boleto of boletos) {
      if (usadosBoleto.has(boleto.id)) continue;
      const score = pontuarValorDataBanco(
        linha,
        Number((boleto.pagamento_valor ?? boleto.valor).toFixed(2)),
        (boleto.pagamento_data || boleto.vencimento || "").slice(0, 10),
        boleto.pagamento_banco_conta,
        tolerancia,
        janela
      );
      if (!score) continue;
      if (!melhor || score.pontos > melhor.pontos) {
        melhor = {
          alvo: "boleto",
          id: boleto.id,
          rotulo: rotuloBoleto(boleto),
          ...score,
        };
      }
    }

    for (const pag of rhs) {
      if (usadosRh.has(pag.id)) continue;
      const score = pontuarValorDataBanco(
        linha,
        Number((pag.pagamento_valor ?? pag.valor).toFixed(2)),
        (pag.pagamento_data || pag.vencimento || "").slice(0, 10),
        pag.pagamento_banco_conta,
        tolerancia,
        janela
      );
      if (!score) continue;
      if (!melhor || score.pontos > melhor.pontos) {
        melhor = {
          alvo: "rh",
          id: pag.id,
          rotulo: rotuloRh(pag),
          ...score,
        };
      }
    }

    if (melhor) {
      if (melhor.alvo === "boleto") usadosBoleto.add(melhor.id);
      else usadosRh.add(melhor.id);
      sugestoes.push({
        linha,
        alvo: melhor.alvo,
        alvo_id: melhor.id,
        confianca: melhor.confianca,
        motivos: melhor.motivos,
        rotulo_alvo: melhor.rotulo,
      });
    } else {
      sugestoes.push({
        linha,
        alvo: null,
        alvo_id: null,
        confianca: "nenhuma",
        motivos: ["Nenhum boleto ou pagamento RH aguardando com valor/data parecidos."],
      });
    }
  }

  return sugestoes.sort((a, b) => a.linha.data.localeCompare(b.linha.data));
}

/** @deprecated use sugerirMatchesExtrato */
export function sugerirMatchesExtratoBoletos(
  db: Pick<DB, "boletos" | "pagamentos_pessoas" | "pessoas" | "fornecedores" | "notas_fiscais">,
  linhas: LinhaExtrato[],
  opcoes?: { toleranciaValor?: number; janelaDias?: number }
): SugestaoMatchExtrato[] {
  return sugerirMatchesExtrato(db, linhas, opcoes);
}

export function aplicarMatchesExtrato(
  db: DB,
  matches: Array<{
    alvo: AlvoMatchExtrato;
    alvo_id: string;
    dataLiquidacao: string;
    observacao?: string;
  }>,
  opcoes: { responsavel?: string; agora?: string; idFactory?: () => string } = {}
): { sucesso: boolean; conciliados: number; erros: string[] } {
  let conciliados = 0;
  const erros: string[] = [];
  for (const m of matches) {
    if (m.alvo === "boleto") {
      const r = conciliarBoleto(
        db,
        m.alvo_id,
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
    } else {
      const r = conciliarPagamentoPessoa(
        db,
        m.alvo_id,
        {
          dataLiquidacao: m.dataLiquidacao,
          responsavel: opcoes.responsavel ?? "usuário local",
          observacao: m.observacao ?? "Conciliação via extrato OFX",
        },
        { agora: opcoes.agora, responsavelPadrao: opcoes.responsavel ?? "usuário local" }
      );
      if (r.sucesso) conciliados += 1;
      else erros.push(...r.erros);
    }
  }
  return { sucesso: erros.length === 0, conciliados, erros };
}

/** @deprecated use aplicarMatchesExtrato */
export function aplicarMatchesExtratoBoletos(
  db: DB,
  matches: Array<{ boleto_id: string; dataLiquidacao: string; observacao?: string }>,
  opcoes: { responsavel?: string; agora?: string; idFactory?: () => string } = {}
): { sucesso: boolean; conciliados: number; erros: string[] } {
  return aplicarMatchesExtrato(
    db,
    matches.map((m) => ({
      alvo: "boleto" as const,
      alvo_id: m.boleto_id,
      dataLiquidacao: m.dataLiquidacao,
      observacao: m.observacao,
    })),
    opcoes
  );
}
