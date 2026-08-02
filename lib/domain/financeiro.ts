import type { ContaPagar, StatusContaPagar } from "../types";

export type FiltroVencimentoConta = "todas" | "hoje" | "proximos_7_dias" | "atrasadas";

export interface FiltrosContaPagar {
  texto?: string;
  status?: StatusContaPagar | "todos";
  vencimento?: FiltroVencimentoConta;
  fornecedorPorId?: Record<string, string>;
}

export interface ResumoContaFaixa {
  quantidade: number;
  total: number;
}

export interface ResumoContasPagar {
  vencendoHoje: ResumoContaFaixa;
  proximos7Dias: ResumoContaFaixa;
  atrasadas: ResumoContaFaixa;
  aguardandoConciliacao: ResumoContaFaixa;
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function somenteData(valor?: string): string {
  return (valor ?? "").slice(0, 10);
}

function normalizarTexto(valor?: string): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function contaEncerrada(status: StatusContaPagar): boolean {
  return status === "conciliado" || status === "cancelado";
}

export function diferencaDias(data: string, hoje = hojeISO()): number {
  const base = new Date(`${somenteData(hoje)}T00:00:00`);
  const alvo = new Date(`${somenteData(data)}T00:00:00`);
  return Math.round((alvo.getTime() - base.getTime()) / 86400000);
}

export function contaEstaAtrasada(conta: ContaPagar, hoje = hojeISO()): boolean {
  return diferencaDias(conta.data_vencimento, hoje) < 0;
}

export function contaVenceHoje(conta: ContaPagar, hoje = hojeISO()): boolean {
  return diferencaDias(conta.data_vencimento, hoje) === 0;
}

export function contaVenceNosProximos7Dias(conta: ContaPagar, hoje = hojeISO()): boolean {
  const dias = diferencaDias(conta.data_vencimento, hoje);
  return dias > 0 && dias <= 7;
}

export function resumirContasPagar(contas: ContaPagar[], hoje = hojeISO()): ResumoContasPagar {
  return contas.reduce<ResumoContasPagar>(
    (resumo, conta) => {
      if (!contaEncerrada(conta.status)) {
        if (contaEstaAtrasada(conta, hoje)) {
          resumo.atrasadas.quantidade += 1;
          resumo.atrasadas.total += conta.valor_final;
        }
        if (contaVenceHoje(conta, hoje)) {
          resumo.vencendoHoje.quantidade += 1;
          resumo.vencendoHoje.total += conta.valor_final;
        }
        if (contaVenceNosProximos7Dias(conta, hoje)) {
          resumo.proximos7Dias.quantidade += 1;
          resumo.proximos7Dias.total += conta.valor_final;
        }
      }

      if (conta.status === "aguardando_conciliacao") {
        resumo.aguardandoConciliacao.quantidade += 1;
        resumo.aguardandoConciliacao.total += conta.valor_final;
      }

      return resumo;
    },
    {
      vencendoHoje: { quantidade: 0, total: 0 },
      proximos7Dias: { quantidade: 0, total: 0 },
      atrasadas: { quantidade: 0, total: 0 },
      aguardandoConciliacao: { quantidade: 0, total: 0 },
    }
  );
}

export function ordenarContasPagar(contas: ContaPagar[], hoje = hojeISO()): ContaPagar[] {
  return [...contas].sort((a, b) => {
    const aAtrasada = contaEstaAtrasada(a, hoje);
    const bAtrasada = contaEstaAtrasada(b, hoje);
    if (aAtrasada !== bAtrasada) return aAtrasada ? -1 : 1;

    const porVencimento = somenteData(a.data_vencimento).localeCompare(somenteData(b.data_vencimento));
    if (porVencimento !== 0) return porVencimento;

    return somenteData(a.criado_em).localeCompare(somenteData(b.criado_em));
  });
}

export function filtrarContasPagar(contas: ContaPagar[], filtros: FiltrosContaPagar, hoje = hojeISO()): ContaPagar[] {
  const texto = normalizarTexto(filtros.texto);
  const status = filtros.status ?? "todos";
  const vencimento = filtros.vencimento ?? "todas";
  const fornecedorPorId = filtros.fornecedorPorId ?? {};

  const filtradas = contas.filter((conta) => {
    if (status !== "todos" && conta.status !== status) return false;

    if (vencimento === "hoje" && !contaVenceHoje(conta, hoje)) return false;
    if (vencimento === "proximos_7_dias" && !contaVenceNosProximos7Dias(conta, hoje)) return false;
    if (vencimento === "atrasadas" && !contaEstaAtrasada(conta, hoje)) return false;

    if (!texto) return true;

    const fornecedor = normalizarTexto(fornecedorPorId[conta.fornecedor_id ?? ""]);
    const descricao = normalizarTexto(conta.descricao);
    const documento = normalizarTexto(conta.documento_id);

    return fornecedor.includes(texto) || descricao.includes(texto) || documento.includes(texto);
  });

  return ordenarContasPagar(filtradas, hoje);
}