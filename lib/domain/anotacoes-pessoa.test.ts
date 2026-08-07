import { describe, expect, it } from "vitest";
import { seedDB } from "../data/seed";
import { adicionarAnotacaoPessoa, editarAnotacaoPessoa, excluirAnotacaoPessoa, listarAnotacoesPessoa } from "./anotacoes-pessoa";

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

  it("edita e exclui anotação", () => {
    const db = structuredClone(seedDB);
    db.anotacoes_pessoas = [];
    adicionarAnotacaoPessoa(
      db,
      { id: "anot-e1", pessoa_id: "pes-gerente", texto: "Rascunho", data: "2026-08-01" },
      { agora: "2026-08-01T10:00:00.000Z" }
    );
    const edit = editarAnotacaoPessoa(
      db,
      "anot-e1",
      { texto: "Texto corrigido", data: "2026-08-02" },
      { agora: "2026-08-02T11:00:00.000Z" }
    );
    expect(edit.sucesso).toBe(true);
    expect(edit.anotacao?.texto).toBe("Texto corrigido");
    expect(edit.anotacao?.data).toBe("2026-08-02");
    expect(edit.anotacao?.atualizado_em).toBe("2026-08-02T11:00:00.000Z");
    expect(edit.anotacao?.criado_em).toBe("2026-08-01T10:00:00.000Z");

    expect(editarAnotacaoPessoa(db, "anot-e1", { texto: "  " }).sucesso).toBe(false);
    expect(editarAnotacaoPessoa(db, "anot-sumiu", { texto: "x" }).sucesso).toBe(false);

    const rem = excluirAnotacaoPessoa(db, "anot-e1");
    expect(rem.sucesso).toBe(true);
    expect(listarAnotacoesPessoa(db, "pes-gerente")).toHaveLength(0);
    expect(excluirAnotacaoPessoa(db, "anot-e1").sucesso).toBe(false);
  });
});
