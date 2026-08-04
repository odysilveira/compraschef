import { describe, expect, it } from "vitest";
import type { PessoaRH } from "../types";
import {
  garantirChecklistDocumentos,
  statusDocumento,
  sincronizarFlagsDocumentos,
  atualizarDocumentoNaLista,
  resumirDocumentos,
  catalogoDocumentosPorTipo,
  alertaDocumentosPessoa,
} from "./documentos-pessoa";
import { permissoesVazias } from "./rh";

function pessoaBase(overrides: Partial<PessoaRH> = {}): PessoaRH {
  return {
    id: "pes-1",
    nome: "Teste",
    tipo: "intermitente",
    funcao: "salao",
    tem_acesso_sistema: false,
    permissoes: permissoesVazias(),
    ativo: true,
    criado_em: "2026-01-01T00:00:00.000Z",
    atualizado_em: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("documentos-pessoa", () => {
  it("monta catálogo com CNH para entregador e CTPS para colaborador", () => {
    expect(catalogoDocumentosPorTipo("entregador").some((c) => c.tipo === "cnh")).toBe(true);
    expect(catalogoDocumentosPorTipo("colaborador").some((c) => c.tipo === "ctps")).toBe(true);
    expect(catalogoDocumentosPorTipo("intermitente").some((c) => c.tipo === "cnh")).toBe(false);
  });

  it("classifica status presente / ausente / vencido", () => {
    expect(statusDocumento({ presente: false }, "2026-08-03")).toBe("ausente");
    expect(statusDocumento({ presente: true }, "2026-08-03")).toBe("presente");
    expect(statusDocumento({ presente: true, validade: "2026-08-03" }, "2026-08-03")).toBe("presente");
    expect(statusDocumento({ presente: true, validade: "2026-08-02" }, "2026-08-03")).toBe("vencido");
  });

  it("garante checklist a partir das flags e sincroniza de volta", () => {
    const pessoa = pessoaBase({
      contrato_assinado: true,
      esocial_ok: false,
      tipo: "entregador",
    });
    const docs = garantirChecklistDocumentos(pessoa, "2026-08-03T12:00:00.000Z");
    expect(docs.find((d) => d.tipo === "contrato")?.presente).toBe(true);
    expect(docs.find((d) => d.tipo === "esocial")?.presente).toBe(false);
    expect(docs.find((d) => d.tipo === "cnh")).toBeTruthy();

    const comCnh = atualizarDocumentoNaLista(
      docs,
      docs.find((d) => d.tipo === "cnh")!.id,
      { presente: true, validade: "2027-01-01" }
    );
    const flags = sincronizarFlagsDocumentos({ ...pessoa, documentos: comCnh });
    expect(flags.contrato_assinado).toBe(true);
    expect(flags.esocial_ok).toBe(false);

    const resumo = resumirDocumentos(comCnh, "2026-08-03");
    expect(resumo.presente).toBeGreaterThanOrEqual(2);
    expect(resumo.ausente).toBeGreaterThanOrEqual(1);
  });

  it("não duplica itens ao garantir de novo", () => {
    const pessoa = pessoaBase({ contrato_assinado: true, esocial_ok: true });
    const a = garantirChecklistDocumentos(pessoa);
    const b = garantirChecklistDocumentos({ ...pessoa, documentos: a });
    expect(b.length).toBe(a.length);
    expect(b.map((d) => d.tipo).sort()).toEqual(a.map((d) => d.tipo).sort());
  });

  it("monta alerta curto para a lista de pessoas", () => {
    const alerta = alertaDocumentosPessoa(
      pessoaBase({
        tipo: "entregador",
        contrato_assinado: true,
        esocial_ok: true,
        documentos: [
          {
            id: "1",
            tipo: "contrato",
            rotulo: "Contrato",
            presente: true,
          },
          {
            id: "2",
            tipo: "esocial",
            rotulo: "eSocial",
            presente: true,
          },
          {
            id: "3",
            tipo: "rg",
            rotulo: "RG",
            presente: false,
          },
          {
            id: "4",
            tipo: "aso",
            rotulo: "ASO",
            presente: true,
            validade: "2020-01-01",
          },
          {
            id: "5",
            tipo: "cnh",
            rotulo: "CNH",
            presente: false,
          },
        ],
      }),
      "2026-08-04"
    );
    expect(alerta.tem_alerta).toBe(true);
    expect(alerta.vencido).toBe(1);
    expect(alerta.ausente).toBeGreaterThanOrEqual(1);
    expect(alerta.rotulo).toContain("ASO vencido");
  });
});
