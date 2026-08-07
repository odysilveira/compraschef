import { describe, expect, it } from "vitest";
import { seedDB } from "../data/seed";
import { adicionarAnotacaoPessoa, listarAnotacoesPessoa } from "./anotacoes-pessoa";

describe("anotações de pessoa (RH)", () => {
  it("adiciona e lista por pessoa (mais recente primeiro)", () => {
    const db = structuredClone(seedDB);
    db.anotacoes_pessoas = [];
    const r1 = adicionarAnotacaoPessoa(
      db,
      {
        id: "anot-t1",
        pessoa_id: "pes-gerente",
        texto: "Elogio no salão",
        data: "2026-07-01",
        autor: "Ody",
      },
      { agora: "2026-07-01T12:00:00.000Z" }
    );
    expect(r1.sucesso).toBe(true);

    const r2 = adicionarAnotacaoPessoa(
      db,
      {
        id: "anot-t2",
        pessoa_id: "pes-gerente",
        texto: "Atraso justificado",
        data: "2026-08-01",
      },
      { agora: "2026-08-01T12:00:00.000Z" }
    );
    expect(r2.sucesso).toBe(true);

    const lista = listarAnotacoesPessoa(db, "pes-gerente");
    expect(lista.map((a) => a.id)).toEqual(["anot-t2", "anot-t1"]);
    expect(listarAnotacoesPessoa(db, "pes-inter-1")).toHaveLength(0);
  });

  it("rejeita texto vazio e pessoa inexistente", () => {
    const db = structuredClone(seedDB);
    expect(
      adicionarAnotacaoPessoa(db, { id: "x", pessoa_id: "pes-gerente", texto: "  " }).sucesso
    ).toBe(false);
    expect(
      adicionarAnotacaoPessoa(db, { id: "x", pessoa_id: "pes-nao", texto: "ok" }).sucesso
    ).toBe(false);
  });
});
