import { describe, expect, it } from "vitest";
import { seedDB } from "../data/seed";
import {
  adicionarAvaliacaoPessoa,
  contarAvaliacoesPorNota,
  corBadgeMediaAvaliacao,
  editarAvaliacaoPessoa,
  excluirAvaliacaoPessoa,
  filtrarAvaliacoesPorNota,
  formatarMediaAvaliacao,
  listarAvaliacoesPessoa,
  parseFiltroNotaAvaliacaoPessoa,
  resumirAvaliacoesPessoa,
  rotuloCompetenciaAvaliacao,
} from "./avaliacoes-pessoa";

describe("avaliações de pessoa (RH)", () => {
  it("adiciona e lista por pessoa (competência mais recente primeiro)", () => {
    const db = structuredClone(seedDB);
    db.avaliacoes_pessoas = [];
    const r1 = adicionarAvaliacaoPessoa(
      db,
      {
        id: "aval-t1",
        pessoa_id: "pes-gerente",
        competencia: "2026-06",
        nota: 4,
        comentario: "Bom ritmo",
        avaliador: "Ody",
      },
      { agora: "2026-07-01T12:00:00.000Z" }
    );
    expect(r1.sucesso).toBe(true);
    expect(r1.avaliacao?.nota).toBe(4);

    const r2 = adicionarAvaliacaoPessoa(
      db,
      {
        id: "aval-t2",
        pessoa_id: "pes-gerente",
        competencia: "2026-07",
        nota: 5,
      },
      { agora: "2026-08-01T12:00:00.000Z" }
    );
    expect(r2.sucesso).toBe(true);

    const lista = listarAvaliacoesPessoa(db, "pes-gerente");
    expect(lista.map((a) => a.id)).toEqual(["aval-t2", "aval-t1"]);
    expect(listarAvaliacoesPessoa(db, "pes-inter-1")).toHaveLength(0);
  });

  it("rejeita pessoa inexistente, competência e nota inválidas", () => {
    const db = structuredClone(seedDB);
    expect(
      adicionarAvaliacaoPessoa(db, {
        id: "x",
        pessoa_id: "pes-nao",
        competencia: "2026-08",
        nota: 3,
      }).sucesso
    ).toBe(false);
    expect(
      adicionarAvaliacaoPessoa(db, {
        id: "x",
        pessoa_id: "pes-gerente",
        competencia: "2026-13",
        nota: 3,
      }).sucesso
    ).toBe(false);
    expect(
      adicionarAvaliacaoPessoa(db, {
        id: "x",
        pessoa_id: "pes-gerente",
        competencia: "2026-08",
        nota: 0,
      }).sucesso
    ).toBe(false);
    expect(
      adicionarAvaliacaoPessoa(db, {
        id: "x",
        pessoa_id: "pes-gerente",
        competencia: "2026-08",
        nota: 6,
      }).sucesso
    ).toBe(false);
  });

  it("formata competência", () => {
    expect(rotuloCompetenciaAvaliacao("2026-08")).toMatch(/ago\/2026/i);
    expect(rotuloCompetenciaAvaliacao("")).toBe("—");
  });

  it("edita e exclui avaliação", () => {
    const db = structuredClone(seedDB);
    db.avaliacoes_pessoas = [];
    adicionarAvaliacaoPessoa(
      db,
      {
        id: "aval-e1",
        pessoa_id: "pes-gerente",
        competencia: "2026-07",
        nota: 3,
        comentario: "Rascunho",
        avaliador: "Ody",
      },
      { agora: "2026-07-10T10:00:00.000Z" }
    );
    const edit = editarAvaliacaoPessoa(
      db,
      "aval-e1",
      { competencia: "2026-08", nota: 5, comentario: "Excelente mês" },
      { agora: "2026-08-02T11:00:00.000Z" }
    );
    expect(edit.sucesso).toBe(true);
    expect(edit.avaliacao?.competencia).toBe("2026-08");
    expect(edit.avaliacao?.nota).toBe(5);
    expect(edit.avaliacao?.comentario).toBe("Excelente mês");
    expect(edit.avaliacao?.avaliador).toBe("Ody");
    expect(edit.avaliacao?.criado_em).toBe("2026-07-10T10:00:00.000Z");
    expect(edit.avaliacao?.atualizado_em).toBe("2026-08-02T11:00:00.000Z");

    expect(editarAvaliacaoPessoa(db, "aval-e1", { competencia: "2026-13", nota: 4 }).sucesso).toBe(
      false
    );
    expect(editarAvaliacaoPessoa(db, "aval-sumiu", { competencia: "2026-08", nota: 4 }).sucesso).toBe(
      false
    );

    const rem = excluirAvaliacaoPessoa(db, "aval-e1");
    expect(rem.sucesso).toBe(true);
    expect(listarAvaliacoesPessoa(db, "pes-gerente")).toHaveLength(0);
    expect(excluirAvaliacaoPessoa(db, "aval-e1").sucesso).toBe(false);
  });

  it("resume média, quantidade e última nota", () => {
    expect(resumirAvaliacoesPessoa([])).toEqual({
      quantidade: 0,
      media: null,
      ultimaNota: null,
      ultimaCompetencia: null,
    });
    expect(formatarMediaAvaliacao(null)).toBe("—");

    const db = structuredClone(seedDB);
    db.avaliacoes_pessoas = [];
    adicionarAvaliacaoPessoa(db, {
      id: "r1",
      pessoa_id: "pes-gerente",
      competencia: "2026-06",
      nota: 4,
    });
    adicionarAvaliacaoPessoa(db, {
      id: "r2",
      pessoa_id: "pes-gerente",
      competencia: "2026-08",
      nota: 5,
    });
    const resumo = resumirAvaliacoesPessoa(listarAvaliacoesPessoa(db, "pes-gerente"));
    expect(resumo.quantidade).toBe(2);
    expect(resumo.media).toBe(4.5);
    expect(resumo.ultimaNota).toBe(5);
    expect(resumo.ultimaCompetencia).toBe("2026-08");
    expect(formatarMediaAvaliacao(4.5)).toBe("4,5");
  });

  it("filtra e conta por nota", () => {
    const db = structuredClone(seedDB);
    db.avaliacoes_pessoas = [];
    adicionarAvaliacaoPessoa(db, {
      id: "n1",
      pessoa_id: "pes-gerente",
      competencia: "2026-06",
      nota: 5,
    });
    adicionarAvaliacaoPessoa(db, {
      id: "n2",
      pessoa_id: "pes-gerente",
      competencia: "2026-07",
      nota: 3,
    });
    adicionarAvaliacaoPessoa(db, {
      id: "n3",
      pessoa_id: "pes-gerente",
      competencia: "2026-08",
      nota: 5,
    });
    const lista = listarAvaliacoesPessoa(db, "pes-gerente");
    expect(parseFiltroNotaAvaliacaoPessoa("5")).toBe(5);
    expect(parseFiltroNotaAvaliacaoPessoa("9")).toBe("todas");
    expect(filtrarAvaliacoesPorNota(lista, 5).map((a) => a.id)).toEqual(["n3", "n1"]);
    expect(filtrarAvaliacoesPorNota(lista, "todas")).toHaveLength(3);
    expect(contarAvaliacoesPorNota(lista)).toEqual({ 1: 0, 2: 0, 3: 1, 4: 0, 5: 2 });
  });

  it("escolhe cor do badge pela média arredondada", () => {
    expect(corBadgeMediaAvaliacao(4.5)).toBe("verde");
    expect(corBadgeMediaAvaliacao(3.2)).toBe("azul");
    expect(corBadgeMediaAvaliacao(1.4)).toBe("laranja");
  });
});
