/**
 * Lote de pagamentos PIX para motoboys / freelas / intermitentes.
 */

import type { DB, PagamentoPessoa, PessoaRH, TipoPagamentoPessoa, TipoPessoaRH } from "../types";
import { montarPixBrCode, podeGerarPixBrCode } from "./pix-brcode";
import {
  conciliarPagamentoPessoa,
  informarPagamentoPessoa,
  liberarPagamentoPessoa,
} from "./pagamentos-pessoas";
import { hojeIsoLocal } from "./pix-copia-cola";

const TIPOS_EQUIPE: TipoPagamentoPessoa[] = [
  "freela_hora",
  "freela_servico",
  "intermitente_periodo",
  "outro",
];

const TIPOS_PESSOA_EQUIPE: TipoPessoaRH[] = ["entregador", "intermitente", "prestador_eventual"];

export interface ItemLotePagarEquipe {
  pagamento: PagamentoPessoa;
  pessoa: PessoaRH;
  valor: number;
  chave_pix?: string;
  pode_gerar_pix: boolean;
  payload_pix?: string;
  erro_pix?: string;
  rotulo_tipo: string;
}

export function pessoaEhEquipeVariavel(pessoa: PessoaRH): boolean {
  return TIPOS_PESSOA_EQUIPE.includes(pessoa.tipo) || pessoa.funcao === "entregador";
}

export function pagamentoEhEquipeVariavel(pagamento: PagamentoPessoa, pessoa?: PessoaRH): boolean {
  if (TIPOS_EQUIPE.includes(pagamento.tipo)) return true;
  if (pessoa && pessoaEhEquipeVariavel(pessoa)) return true;
  return false;
}

function rotuloTipoEquipe(pessoa: PessoaRH, tipo: TipoPagamentoPessoa): string {
  if (pessoa.tipo === "entregador" || pessoa.funcao === "entregador") return "Motoboy";
  if (pessoa.tipo === "intermitente") return "Intermitente";
  if (pessoa.tipo === "prestador_eventual") return "Freela";
  if (tipo === "freela_hora" || tipo === "freela_servico") return "Freela";
  return tipo;
}

export interface FiltroLotePagarEquipe {
  /** YYYY-MM — filtra competência ou vencimento. */
  competencia?: string;
  /** Inclui previstos além de liberados. Default true. */
  incluirPrevistos?: boolean;
  /** Só quem tem chave PIX. Default false (mostra todos, com alerta). */
  soComChave?: boolean;
  cidadePadrao?: string;
}

/**
 * Monta o lote a partir de pagamentos liberados (e opcionalmente previstos)
 * de motoboy / freela / intermitente.
 */
export function listarLotePagarEquipe(
  db: Pick<DB, "pagamentos_pessoas" | "pessoas">,
  filtro: FiltroLotePagarEquipe = {}
): ItemLotePagarEquipe[] {
  const incluirPrevistos = filtro.incluirPrevistos !== false;
  const cidade = filtro.cidadePadrao || "LONDRINA";
  const itens: ItemLotePagarEquipe[] = [];

  for (const pagamento of db.pagamentos_pessoas ?? []) {
    if (pagamento.status === "pago" || pagamento.status === "aguardando_conciliacao") continue;
    if (pagamento.status === "previsto" && !incluirPrevistos) continue;
    if (pagamento.status !== "liberado" && pagamento.status !== "previsto") continue;

    const pessoa = (db.pessoas ?? []).find((p) => p.id === pagamento.pessoa_id);
    if (!pessoa || !pessoa.ativo) continue;
    if (!pagamentoEhEquipeVariavel(pagamento, pessoa)) continue;

    if (filtro.competencia) {
      const comp = (pagamento.competencia || pagamento.vencimento || "").slice(0, 7);
      if (comp !== filtro.competencia) continue;
    }

    const chave = (pessoa.chave_pix || "").trim() || undefined;
    if (filtro.soComChave && !chave) continue;

    const valor = Number(pagamento.pagamento_valor ?? pagamento.valor) || 0;
    let payload_pix: string | undefined;
    let erro_pix: string | undefined;
    const pode = podeGerarPixBrCode(chave, valor);
    if (pode && chave) {
      try {
        payload_pix = montarPixBrCode({
          chave,
          nomeRecebedor: pessoa.nome,
          cidade,
          valor,
          descricao: truncDesc(pagamento.descricao || `${rotuloTipoEquipe(pessoa, pagamento.tipo)} ${pagamento.vencimento}`),
          txid: truncTxid(pagamento.id),
        });
      } catch (e) {
        erro_pix = e instanceof Error ? e.message : "Falha ao gerar PIX.";
      }
    } else if (!chave) {
      erro_pix = "Cadastre a chave PIX na pessoa.";
    }

    itens.push({
      pagamento,
      pessoa,
      valor,
      chave_pix: chave,
      pode_gerar_pix: Boolean(payload_pix),
      payload_pix,
      erro_pix,
      rotulo_tipo: rotuloTipoEquipe(pessoa, pagamento.tipo),
    });
  }

  return itens.sort((a, b) => {
    const ta = a.pagamento.vencimento.localeCompare(b.pagamento.vencimento);
    if (ta !== 0) return ta;
    return a.pessoa.nome.localeCompare(b.pessoa.nome, "pt-BR");
  });
}

function truncDesc(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 72);
}

function truncTxid(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "").slice(0, 25) || "***";
}

/**
 * Após pagar pelo QR: libera (se previsto), informa e concilia → status pago.
 */
export function marcarPagamentoEquipePago(
  db: DB,
  pagamentoId: string,
  opcoes: {
    dataPagamento?: string;
    bancoConta: string;
    responsavel?: string;
    observacao?: string;
    agora?: string;
  }
): { sucesso: boolean; erros: string[] } {
  const pagamento = db.pagamentos_pessoas.find((p) => p.id === pagamentoId);
  if (!pagamento) return { sucesso: false, erros: ["Pagamento não encontrado."] };

  if (pagamento.status === "previsto") {
    const lib = liberarPagamentoPessoa(db, pagamentoId);
    if (!lib.sucesso) return { sucesso: false, erros: lib.erros };
  }

  const data = opcoes.dataPagamento || hojeIsoLocal();
  const info = informarPagamentoPessoa(
    db,
    pagamentoId,
    {
      dataPagamento: data,
      valorPago: pagamento.pagamento_valor ?? pagamento.valor,
      bancoConta: opcoes.bancoConta,
      responsavel: opcoes.responsavel,
      observacao: opcoes.observacao || "Pago via PIX (Pagar equipe).",
    },
    { agora: opcoes.agora, responsavelPadrao: opcoes.responsavel }
  );
  if (!info.sucesso) return { sucesso: false, erros: info.erros };

  const conc = conciliarPagamentoPessoa(
    db,
    pagamentoId,
    { dataLiquidacao: data, responsavel: opcoes.responsavel, observacao: "Conciliação automática após PIX." },
    { agora: opcoes.agora, responsavelPadrao: opcoes.responsavel }
  );
  return { sucesso: conc.sucesso, erros: conc.erros };
}
