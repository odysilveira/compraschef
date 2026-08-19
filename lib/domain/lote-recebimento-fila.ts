import type { TipoArquivoRecebimento } from "./classificar-arquivo-recebimento";

/** Status na fila de conciliação do lote (sessão). */
export type StatusItemFilaLote = "pendente" | "em_andamento" | "concluido" | "descartado";

export interface ItemFilaLote {
  id: string;
  nome: string;
  tamanho: number;
  tipo: TipoArquivoRecebimento;
  status: StatusItemFilaLote;
  detalhe?: string;
}

export function itemFilaAberto(status: StatusItemFilaLote): boolean {
  return status === "pendente" || status === "em_andamento";
}

export function filtrarItensAbertos(itens: ItemFilaLote[]): ItemFilaLote[] {
  return itens.filter((item) => itemFilaAberto(item.status));
}

export function contarItensAbertos(itens: ItemFilaLote[]): number {
  return filtrarItensAbertos(itens).length;
}

export function rotuloStatusFilaLote(status: StatusItemFilaLote): string {
  switch (status) {
    case "pendente":
      return "A conciliar";
    case "em_andamento":
      return "Em andamento";
    case "concluido":
      return "Concluído";
    case "descartado":
      return "Descartado";
  }
}
