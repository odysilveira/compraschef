import { describe, expect, it } from "vitest";
import { seedDB } from "../data/seed";
import {
  adicionarAnotacaoPessoa,
  contarAnotacoesPorTipo,
  editarAnotacaoPessoa,
  excluirAnotacaoPessoa,
  filtrarAnotacoesPorTipo,
  listarAnotacoesPessoa,
  parseFiltroTipoAnotacaoPessoa,
  rotuloTipoAnotacaoPessoa,
} from "./anotacoes-pessoa";

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
        tipo: "elogio",
        data: "2026-07-01",
        autor: "Ody",
      },
      { agora: "2026-07-01T12:00:00.000Z" }
    );
    expect(r1.sucesso).toBe(true);
    expect(r1.anotacao?.tipo).toBe("elogio");

    const r2 = adicionarAnotacaoPessoa(
      db,
      {
        id: "anot-t2",
        pessoa_id: "pes-gerente",
        texto: "Atraso justificado",
        tipo: "aviso",
        data: "2026-08-01",
      },
      { agora: "2026-08-01T12:00:00.000Z" }
    );
    expect(r2.sucesso).toBe(true);

    const lista = listarAnotacoesPessoa(db, "pes-gerente");
    expect(lista.map((a) => a.id)).toEqual(["anot-t2", "anot-t1"]);
    expect(listarAnotacoesPessoa(db, "pes-inter-1")).toHaveLength(0);
  });

  it("rejeita texto vazio, pessoa inexistente e tipo inválido", () => {
    const db = structuredClone(seedDB);
    expect(
      adicionarAnotacaoPessoa(db, { id: "x", pessoa_id: "pes-gerente", texto: "  " }).sucesso
    ).toBe(false);
    expect(
      adicionarAnotacaoPessoa(db, { id: "x", pessoa_id: "pes-nao", texto: "ok" }).sucesso
    ).toBe(false);
    expect(
      adicionarAnotacaoPessoa(db, {
        id: "x",
        pessoa_id: "pes-gerente",
        texto: "ok",
        tipo: "foobar",
      }).sucesso
    ).toBe(false);
  });

  it("usa observação como tipo padrão ao omitir", () => {
    const db = structuredClone(seedDB);
    db.anotacoes_pessoas = [];
    const r = adicionarAnotacaoPessoa(db, {
      id: "anot-def",
      pessoa_id: "pes-gerente",
      texto: "Nota sem tipo",
    });
    expect(r.sucesso).toBe(true);
    expect(r.anotacao?.tipo).toBe("observacao");
    expect(rotuloTipoAnotacaoPessoa("observacao")).toBe("Observação");
  });

  it("edita e exclui anotação", () => {
    const db = structuredClone(seedDB);
    db.anotacoes_pessoas = [];
    adicionarAnotacaoPessoa(
      db,
      { id: "anot-e1", pessoa_id: "pes-gerente", texto: "Rascunho", tipo: "observacao", data: "2026-08-01" },
      { agora: "2026-08-01T10:00:00.000Z" }
    );
    const edit = editarAnotacaoPessoa(
      db,
      "anot-e1",
      { texto: "Texto corrigido", data: "2026-08-02", tipo: "elogio" },
      { agora: "2026-08-02T11:00:00.000Z" }
    );
    expect(edit.sucesso).toBe(true);
    expect(edit.anotacao?.texto).toBe("Texto corrigido");
    expect(edit.anotacao?.data).toBe("2026-08-02");
    expect(edit.anotacao?.tipo).toBe("elogio");
    expect(edit.anotacao?.atualizado_em).toBe("2026-08-02T11:00:00.000Z");
    expect(edit.anotacao?.criado_em).toBe("2026-08-01T10:00:00.000Z");

    expect(editarAnotacaoPessoa(db, "anot-e1", { texto: "  " }).sucesso).toBe(false);
    expect(editarAnotacaoPessoa(db, "anot-sumiu", { texto: "x" }).sucesso).toBe(false);
    expect(editarAnotacaoPessoa(db, "anot-e1", { texto: "x", tipo: "xyz" }).sucesso).toBe(false);

    const rem = excluirAnotacaoPessoa(db, "anot-e1");
    expect(rem.sucesso).toBe(true);
    expect(listarAnotacoesPessoa(db, "pes-gerente")).toHaveLength(0);
    expect(excluirAnotacaoPessoa(db, "anot-e1").sucesso).toBe(false);
  });

  it("filtra e conta por tipo", () => {
    const db = structuredClone(seedDB);
    db.anotacoes_pessoas = [];
    adicionarAnotacaoPessoa(db, {
      id: "a1",
      pessoa_id: "pes-gerente",
      texto: "e",
      tipo: "elogio",
      data: "2026-08-01",
    });
    adicionarAnotacaoPessoa(db, {
      id: "a2",
      pessoa_id: "pes-gerente",
      texto: "av",
      tipo: "aviso",
      data: "2026-08-02",
    });
    adicionarAnotacaoPessoa(db, {
      id: "a3",
      pessoa_id: "pes-gerente",
      texto: "o",
      tipo: "observacao",
      data: "2026-08-03",
    });
    const lista = listarAnotacoesPessoa(db, "pes-gerente");
    expect(parseFiltroTipoAnotacaoPessoa("aviso")).toBe("aviso");
    expect(parseFiltroTipoAnotacaoPessoa("xyz")).toBe("todas");
    expect(filtrarAnotacoesPorTipo(lista, "aviso").map((a) => a.id)).toEqual(["a2"]);
    expect(filtrarAnotacoesPorTipo(lista, "todas")).toHaveLength(3);
    expect(contarAnotacoesPorTipo(lista)).toEqual({ elogio: 1, aviso: 1, observacao: 1 });
  });
});
