import { describe, expect, it } from "vitest";
import type { DB, Produto } from "../types";
import {
  desativarProdutosNomeTitulo,
  listarProdutosNomeTitulo,
  nomeProdutoCaixaAlta,
  nomeProdutoComMinusculas,
  reativarProdutosNomeTitulo,
} from "./produtos-limpeza-nome";

function produto(parcial: Partial<Produto> & Pick<Produto, "id" | "nome">): Produto {
  return {
    tipo: "comprado",
    unidade_uso_id: "un-kg",
    fator_conversao: 1,
    estoque_minimo: 0,
    ativo: true,
    ...parcial,
  };
}

describe("nomeProdutoCaixaAlta", () => {
  it("reconhece nomes da NF em maiúsculas", () => {
    expect(nomeProdutoCaixaAlta("ACUCAR REFINADO 1KG CARAVELAS")).toBe(true);
    expect(nomeProdutoCaixaAlta("AÇÚCAR CRISTAL 1KG")).toBe(true);
  });

  it("rejeita título e porcionados com minúsculas", () => {
    expect(nomeProdutoCaixaAlta("4 Queijos G")).toBe(false);
    expect(nomeProdutoCaixaAlta("Base de risoto de funghi")).toBe(false);
    expect(nomeProdutoCaixaAlta("Bolonhesa P")).toBe(false);
  });
});

describe("desativarProdutosNomeTitulo", () => {
  it("desativa título/minúsculas (comprado e produzido) e mantém CAIXA ALTA", () => {
    const db = {
      produtos: [
        produto({ id: "1", nome: "ACUCAR REFINADO 1KG CARAVELAS" }),
        produto({ id: "2", nome: "Base de risoto de funghi" }),
        produto({ id: "3", nome: "4 Queijos G", tipo: "produzido" }),
        produto({ id: "4", nome: "Bolonhesa P", tipo: "produzido" }),
        produto({ id: "5", nome: "Cebola", ativo: false }),
      ],
    } as DB;

    expect(listarProdutosNomeTitulo(db).map((p) => p.id)).toEqual(["2", "3", "4"]);
    const r = desativarProdutosNomeTitulo(db);
    expect(r.desativados).toBe(3);
    expect(db.produtos.find((p) => p.id === "1")?.ativo).toBe(true);
    expect(db.produtos.find((p) => p.id === "2")?.ativo).toBe(false);
    expect(db.produtos.find((p) => p.id === "3")?.ativo).toBe(false);
    expect(db.produtos.find((p) => p.id === "4")?.ativo).toBe(false);
    expect(nomeProdutoComMinusculas("4 Queijos G")).toBe(true);
  });

  it("reativa os que a limpeza tinha desativado", () => {
    const db = {
      produtos: [
        produto({ id: "1", nome: "ACUCAR REFINADO", ativo: true }),
        produto({ id: "2", nome: "Base de risoto de funghi", ativo: false }),
        produto({ id: "3", nome: "4 Queijos G", tipo: "produzido", ativo: false }),
      ],
    } as DB;
    const r = reativarProdutosNomeTitulo(db);
    expect(r.reativados).toBe(2);
    expect(db.produtos.find((p) => p.id === "2")?.ativo).toBe(true);
    expect(db.produtos.find((p) => p.id === "3")?.ativo).toBe(true);
  });
});
