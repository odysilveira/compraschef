import { describe, expect, it } from "vitest";
import type { DB, PessoaRH } from "../types";
import { inferirTiposBatidas, importarAfdNoDb, parseAfdTexto } from "./afd-ponto";

function pessoa(overrides: Partial<PessoaRH> = {}): PessoaRH {
  return {
    id: "pes-lider",
    nome: "João",
    tipo: "colaborador",
    funcao: "cozinha",
    cpf: "52998224725",
    tem_acesso_sistema: false,
    permissoes: {
      painel: false,
      recebimento: false,
      estoque: false,
      lista_compras: false,
      cotacoes: false,
      pedidos: false,
      financeiro: false,
      relatorios: false,
      cadastros: false,
      rh: false,
    },
    ativo: true,
    criado_em: "2026-08-01T12:00:00.000Z",
    atualizado_em: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

/** Linha tipo 3 Portaria 671 (CRC fictício). */
function linha671(nsr: string, dh: string, cpf12: string): string {
  return `${nsr.padStart(9, "0")}3${dh}${cpf12}ABCD`;
}

describe("afd-ponto", () => {
  it("parseia marcações AFD 671", () => {
    const dh1 = "2026-07-30T11:05:00-0300";
    const dh2 = "2026-07-30T23:02:00-0300";
    const cpf = "52998224725 "; // 12 posições
    const texto = [
      "0000000011HEADER................",
      linha671("2", dh1, cpf),
      linha671("3", dh2, cpf),
    ].join("\n");

    const r = parseAfdTexto(texto);
    expect(r.sucesso).toBe(true);
    expect(r.layoutDetectado).toBe("671");
    expect(r.marcacoes).toHaveLength(2);
    expect(r.marcacoes[0]).toMatchObject({
      cpf: "52998224725",
      data: "2026-07-30",
      hora: "11:05",
    });
  });

  it("infere entrada/saída pela ordem do dia", () => {
    const tipos = inferirTiposBatidas([
      { cpf: "1", data: "2026-07-30", hora: "23:00" },
      { cpf: "1", data: "2026-07-30", hora: "11:00" },
    ]);
    expect(tipos.map((t) => t.tipo)).toEqual(["entrada", "saida"]);
    expect(tipos[0]!.hora).toBe("11:00");
  });

  it("importa AFD casando CPF e é idempotente", () => {
    const db = {
      pessoas: [pessoa()],
      batidas_ponto: [],
    } as unknown as DB;
    const dh1 = "2026-07-30T11:05:00-0300";
    const dh2 = "2026-07-30T23:02:00-0300";
    const texto = [linha671("2", dh1, "52998224725 "), linha671("3", dh2, "52998224725 ")].join("\n");

    const r1 = importarAfdNoDb(db, texto, { idFactory: () => `bat-${db.batidas_ponto!.length}` });
    expect(r1.sucesso).toBe(true);
    expect(r1.importadas).toBe(2);
    expect(db.batidas_ponto).toHaveLength(2);
    expect(db.batidas_ponto![0]!.tipo).toBe("entrada");
    expect(db.batidas_ponto![1]!.tipo).toBe("saida");

    const r2 = importarAfdNoDb(db, texto);
    expect(r2.importadas).toBe(0);
  });

  it("avisa CPF sem cadastro", () => {
    const db = { pessoas: [pessoa()], batidas_ponto: [] } as unknown as DB;
    const texto = linha671("2", "2026-07-30T11:05:00-0300", "11144477735 ");
    const r = importarAfdNoDb(db, texto);
    expect(r.importadas).toBe(0);
    expect(r.semPessoa).toBe(1);
    expect(r.avisos.some((a) => a.includes("sem pessoa"))).toBe(true);
  });
});
