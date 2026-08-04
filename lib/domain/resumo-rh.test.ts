import { describe, expect, it } from "vitest";
import type { DB, PessoaRH } from "../types";
import { permissoesVazias } from "./rh";
import { resumirOperacionalRh } from "./resumo-rh";

function pessoa(overrides: Partial<PessoaRH> = {}): PessoaRH {
  return {
    id: "pes-1",
    nome: "A",
    tipo: "intermitente",
    funcao: "salao",
    tem_acesso_sistema: false,
    permissoes: permissoesVazias(),
    ativo: true,
    criado_em: "2026-01-01T00:00:00.000Z",
    atualizado_em: "2026-01-01T00:00:00.000Z",
    contrato_assinado: true,
    esocial_ok: true,
    ...overrides,
  };
}

describe("resumo-rh", () => {
  it("conta docs com alerta, ponto aberto e convocações enviadas", () => {
    const db = {
      pessoas: [
        pessoa({
          id: "ok",
          documentos: [
            { id: "1", tipo: "contrato", rotulo: "C", presente: true },
            { id: "2", tipo: "esocial", rotulo: "E", presente: true },
            { id: "3", tipo: "rg", rotulo: "R", presente: true },
            { id: "4", tipo: "aso", rotulo: "A", presente: true, validade: "2030-01-01" },
          ],
        }),
        pessoa({
          id: "alerta",
          documentos: [
            { id: "1", tipo: "contrato", rotulo: "C", presente: true },
            { id: "2", tipo: "esocial", rotulo: "E", presente: true },
            { id: "3", tipo: "rg", rotulo: "R", presente: false },
            { id: "4", tipo: "aso", rotulo: "A", presente: true, validade: "2020-01-01" },
          ],
        }),
        pessoa({ id: "inativo", ativo: false }),
      ],
      pendencias_ponto: [
        { id: "pp1", status: "aguardando_aviso" },
        { id: "pp2", status: "aprovada" },
      ],
      convocacoes: [
        { id: "c1", status: "enviada" },
        { id: "c2", status: "aceita" },
        { id: "c3", status: "enviada" },
      ],
    } as unknown as DB;

    const r = resumirOperacionalRh(db);
    expect(r.pessoas_ativas).toBe(2);
    expect(r.docs_alerta).toBe(1);
    expect(r.docs_vencido).toBe(1);
    expect(r.ponto_abertas).toBe(1);
    expect(r.convocacoes_enviadas).toBe(2);
  });
});
