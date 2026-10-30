import { describe, expect, it } from "vitest";
import {
  chaveEntraNaCopia,
  desserializarValor,
  juntarDados,
  serializarValor,
  unirNotasPelaChave,
} from "./copia-navegador";

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

  it("junta produtos dos dois computadores e não duplica o mesmo id", () => {
    const junto = juntarDados(
      {
        produtos: [{ id: "p1", nome: "BACON", preco_embalagem_compra: 90 }],
        notas_fiscais: [{ id: "n1", numero: "1", chave_acesso: "1".repeat(44), importada_em: "2026-10-01" }],
      },
      {
        produtos: [
          { id: "p1", nome: "BACON", codigo_barras: "789" },
          { id: "p2", nome: "CARNE SUINA", preco_embalagem_compra: 119.95 },
        ],
        notas_fiscais: [{ id: "n2", numero: "21582", chave_acesso: "2".repeat(44), importada_em: "2026-10-30" }],
      },
      true
    ) as { produtos: { id: string; codigo_barras?: string; preco_embalagem_compra?: number }[]; notas_fiscais: { id: string }[] };

    expect(junto.produtos.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
    expect(junto.produtos.find((p) => p.id === "p1")).toMatchObject({
      preco_embalagem_compra: 90,
      codigo_barras: "789",
    });
    expect(junto.notas_fiscais).toHaveLength(2);
  });

  it("a mesma NF baixada nos dois computadores vira uma nota", () => {
    const chave = "3".repeat(44);
    const banco = juntarDados(
      {
        notas_fiscais: [{ id: "local", numero: "10", chave_acesso: chave, importada_em: "2026-10-02" }],
        boletos: [{ id: "b1", nota_id: "local", valor: 10 }],
      },
      {
        notas_fiscais: [
          { id: "outro", numero: "10", chave_acesso: chave, importada_em: "2026-10-30", valor_total: 479.8 },
        ],
        boletos: [{ id: "b2", nota_id: "outro", valor: 479.8 }],
      },
      true
    ) as Record<string, unknown>;
    unirNotasPelaChave(banco, new Set(["local"]));
    const notas = banco.notas_fiscais as { id: string; valor_total?: number }[];
    expect(notas).toHaveLength(1);
    expect(notas[0].id).toBe("local");
    expect(notas[0].valor_total).toBe(479.8);
    expect(banco.boletos).toEqual([
      { id: "b1", nota_id: "local", valor: 10 },
      { id: "b2", nota_id: "local", valor: 479.8 },
    ]);
  });
});
