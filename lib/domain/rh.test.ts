import { describe, expect, it } from "vitest";
import { permissoesPorPapel, pessoaParaSeedDePerfil, rotuloFuncao, rotuloTipoPessoa } from "./rh";

describe("rh helpers", () => {
  it("dono recebe módulos financeiros e RH", () => {
    const p = permissoesPorPapel("dono");
    expect(p.financeiro).toBe(true);
    expect(p.rh).toBe(true);
    expect(p.cotacoes).toBe(true);
  });

  it("lider nao recebe financeiro nem RH", () => {
    const p = permissoesPorPapel("lider");
    expect(p.estoque).toBe(true);
    expect(p.financeiro).toBe(false);
    expect(p.rh).toBe(false);
  });

  it("gera pessoa a partir de perfil", () => {
    const pessoa = pessoaParaSeedDePerfil({
      id: "perfil-dono",
      nome: "Ody",
      papel: "dono",
      agora: "2026-08-02T12:00:00.000Z",
    });
    expect(pessoa.id).toBe("pes-dono");
    expect(pessoa.perfil_id).toBe("perfil-dono");
    expect(pessoa.tem_acesso_sistema).toBe(true);
    expect(pessoa.permissoes.rh).toBe(true);
  });

  it("rotulos de tipo e funcao", () => {
    expect(rotuloTipoPessoa("intermitente")).toBe("Intermitente");
    expect(rotuloFuncao({ funcao: "custom", funcao_custom: "Sommelier" })).toBe("Sommelier");
  });
});
