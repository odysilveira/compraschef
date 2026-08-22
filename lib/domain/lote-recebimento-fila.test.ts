import { describe, expect, it } from "vitest";
import {
  contarItensAbertos,
  filtrarItensAbertos,
  itemFilaAberto,
  type ItemFilaLote,
} from "./lote-recebimento-fila";

function item(parcial: Partial<ItemFilaLote> & Pick<ItemFilaLote, "id" | "status">): ItemFilaLote {
  return {
    nome: parcial.nome ?? "a.xml",
    tamanho: parcial.tamanho ?? 10,
    tipo: parcial.tipo ?? "xml_nfe",
    detalhe: parcial.detalhe,
    id: parcial.id,
    status: parcial.status,
  };
}

describe("lote-recebimento-fila", () => {
  it("considera pendente e em_andamento como abertos", () => {
    expect(itemFilaAberto("pendente")).toBe(true);
    expect(itemFilaAberto("em_andamento")).toBe(true);
    expect(itemFilaAberto("concluido")).toBe(false);
    expect(itemFilaAberto("descartado")).toBe(false);
  });

  it("filtra e conta só abertos", () => {
    const itens = [
      item({ id: "1", status: "pendente" }),
      item({ id: "2", status: "em_andamento" }),
      item({ id: "3", status: "concluido" }),
      item({ id: "4", status: "descartado" }),
    ];
    expect(filtrarItensAbertos(itens)).toHaveLength(2);
    expect(contarItensAbertos(itens)).toBe(2);
  });
});
