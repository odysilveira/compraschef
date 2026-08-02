import { describe, expect, it } from "vitest";
import type { DB, PessoaRH } from "../types";
import { moduloDaRota, permissoesEfetivasDoPapel, podeAcessarModulo } from "./acesso";
import { permissoesPorPapel, permissoesVazias } from "./rh";

function dbMini(pessoa?: PessoaRH): Pick<DB, "perfis" | "pessoas"> {
  return {
    perfis: [
      { id: "perfil-dono", nome: "Dono", papel: "dono", ativo: true },
      { id: "perfil-lider", nome: "Líder", papel: "lider", ativo: true },
    ],
    pessoas: pessoa ? [pessoa] : [],
  };
}

describe("acesso / permissões de menu", () => {
  it("mapeia rotas para módulos", () => {
    expect(moduloDaRota("/")).toBe("painel");
    expect(moduloDaRota("/rh")).toBe("rh");
    expect(moduloDaRota("/rh/escala")).toBe("rh");
    expect(moduloDaRota("/lista-compras")).toBe("lista_compras");
    expect(moduloDaRota("/financeiro")).toBe("financeiro");
  });

  it("usa padrão do papel quando não há pessoa ligada", () => {
    const perms = permissoesEfetivasDoPapel(dbMini(), "lider");
    expect(perms).toEqual(permissoesPorPapel("lider"));
    expect(podeAcessarModulo(perms, "rh")).toBe(false);
    expect(podeAcessarModulo(perms, "estoque")).toBe(true);
  });

  it("respeita toggles da pessoa ligada ao perfil", () => {
    const pessoa: PessoaRH = {
      id: "pes-lider",
      nome: "Ana Líder",
      tipo: "colaborador",
      funcao: "cozinha",
      tem_acesso_sistema: true,
      perfil_id: "perfil-lider",
      papel_sistema: "lider",
      permissoes: { ...permissoesVazias(), painel: true, estoque: true, rh: true },
      ativo: true,
      criado_em: "",
      atualizado_em: "",
    };
    const perms = permissoesEfetivasDoPapel(dbMini(pessoa), "lider");
    expect(podeAcessarModulo(perms, "rh")).toBe(true);
    expect(podeAcessarModulo(perms, "recebimento")).toBe(false);
    expect(podeAcessarModulo(perms, "estoque")).toBe(true);
  });
});
