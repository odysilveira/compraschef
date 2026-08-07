import { describe, expect, it } from "vitest";
import { seedDB } from "../data/seed";
import {
  adicionarAvaliacaoPessoa,
  listarAvaliacoesPessoa,
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
});
