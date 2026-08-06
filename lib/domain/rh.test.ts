import { describe, expect, it } from "vitest";
import {
  permissoesPorPapel,
  pessoaParaSeedDePerfil,
  rotuloFuncao,
  rotuloTipoPessoa,
  somenteDigitosCpf,
  somenteDigitosTelefone,
  validarCpf,
  hrefPerfilRh,
  parseAbaPerfilRh,
} from "./rh";

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

  it("aceita apenas digitos no telefone", () => {
    expect(somenteDigitosTelefone("(43) 99999-0000")).toBe("43999990000");
    expect(somenteDigitosTelefone("43 99999 00001")).toBe("43999990000");
  });

  it("valida autenticidade do CPF pelos digitos verificadores", () => {
    expect(somenteDigitosCpf("529.982.247-25")).toBe("52998224725");
    expect(validarCpf("52998224725").valido).toBe(true);
    expect(validarCpf("11111111111").valido).toBe(false);
    expect(validarCpf("12345678900").valido).toBe(false);
    expect(validarCpf("123").mensagem).toContain("incompleto");
    expect(validarCpf("").valido).toBe(true);
  });

  it("parseia aba do perfil e monta href com deep link de documentos", () => {
    expect(parseAbaPerfilRh("documentos")).toBe("documentos");
    expect(parseAbaPerfilRh("xyz")).toBe("dados");
    expect(hrefPerfilRh("pes-1")).toBe("/rh/pes-1");
    expect(hrefPerfilRh("pes-1", { temAlertaDocs: true })).toBe("/rh/pes-1?aba=documentos");
    expect(hrefPerfilRh("pes-1", { aba: "escala" })).toBe("/rh/pes-1?aba=escala");
    expect(hrefPerfilRh("pes-1", { aba: "pagamentos" })).toBe("/rh/pes-1?aba=pagamentos");
    expect(hrefPerfilRh("pes-1", { aba: "consumos" })).toBe("/rh/pes-1?aba=consumos");
  });
});
