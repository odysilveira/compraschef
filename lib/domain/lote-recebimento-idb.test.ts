import { describe, expect, it } from "vitest";
import {
  arquivoParaRegistroIdb,
  registroIdbParaArquivo,
  registroIdbParaItem,
} from "./lote-recebimento-idb";
import type { ItemFilaLote } from "./lote-recebimento-fila";

describe("lote-recebimento-idb helpers", () => {
  it("round-trip File ↔ registro", () => {
    const item: ItemFilaLote = {
      id: "lote-1",
      nome: "nota.xml",
      tamanho: 12,
      tipo: "xml_nfe",
      status: "pendente",
      detalhe: "NF-e",
    };
    const arquivo = new File(["<NFe/>"], "nota.xml", {
      type: "text/xml",
      lastModified: 1_700_000_000_000,
    });
    const registro = arquivoParaRegistroIdb(item, arquivo);
    expect(registro.id).toBe("lote-1");
    expect(registro.mimeType).toBe("text/xml");

    const deVolta = registroIdbParaArquivo(registro);
    expect(deVolta.name).toBe("nota.xml");
    expect(deVolta.type).toBe("text/xml");
    expect(registroIdbParaItem(registro)).toEqual(item);
  });
});
