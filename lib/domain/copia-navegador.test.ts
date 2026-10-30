import { describe, expect, it } from "vitest";
import { chaveEntraNaCopia, desserializarValor, serializarValor } from "./copia-navegador";

describe("cópia do navegador", () => {
  it("guarda as chaves do cadastro e do Saipos", () => {
    expect(chaveEntraNaCopia("compraschef-db-v1")).toBe(true);
    expect(chaveEntraNaCopia("compraschef-papel")).toBe(true);
    expect(chaveEntraNaCopia("integracao-saipos:consumo-arquivo:v1")).toBe(true);
    expect(chaveEntraNaCopia("outro-app")).toBe(false);
  });

  it("leva e devolve um PDF pequeno", async () => {
    const original = new Blob(["nota"], { type: "application/pdf" });
    const serial = await serializarValor({ arquivo: original, nome: "nf.pdf" });
    const volta = desserializarValor(serial) as { arquivo: Blob; nome: string };
    expect(volta.nome).toBe("nf.pdf");
    expect(volta.arquivo.type).toBe("application/pdf");
    expect(await volta.arquivo.text()).toBe("nota");
  });
});
