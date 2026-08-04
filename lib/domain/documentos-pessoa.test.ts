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
  diasRestantesValidade,
  formatarDiasRestantesDocumento,
  rotuloCurtoAlertaDocumentos,
  exportarDocumentosPessoasCsv,
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

  it("classifica status presente / ausente / vencido / a vencer", () => {
    expect(statusDocumento({ presente: false }, "2026-08-03")).toBe("ausente");
    expect(statusDocumento({ presente: true }, "2026-08-03")).toBe("presente");
    expect(statusDocumento({ presente: true, validade: "2026-08-03" }, "2026-08-03")).toBe("a_vencer");
    expect(statusDocumento({ presente: true, validade: "2026-08-20" }, "2026-08-03")).toBe("a_vencer");
    expect(statusDocumento({ presente: true, validade: "2026-09-15" }, "2026-08-03")).toBe("presente");
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

  it("alerta inclui documento a vencer nos próximos 30 dias", () => {
    const alerta = alertaDocumentosPessoa(
      pessoaBase({
        contrato_assinado: true,
        esocial_ok: true,
        documentos: [
          { id: "1", tipo: "contrato", rotulo: "C", presente: true },
          { id: "2", tipo: "esocial", rotulo: "E", presente: true },
          { id: "3", tipo: "rg", rotulo: "R", presente: true },
          { id: "4", tipo: "aso", rotulo: "ASO", presente: true, validade: "2026-08-20" },
        ],
      }),
      "2026-08-04"
    );
    expect(alerta.a_vencer).toBe(1);
    expect(alerta.tem_alerta).toBe(true);
    expect(alerta.rotulo).toContain("vence em 16 dias");
  });

  it("formata dias restantes da validade", () => {
    expect(diasRestantesValidade("2026-08-20", "2026-08-04")).toBe(16);
    expect(diasRestantesValidade("2026-08-04", "2026-08-04")).toBe(0);
    expect(diasRestantesValidade("2026-08-01", "2026-08-04")).toBe(-3);
    expect(formatarDiasRestantesDocumento(16)).toBe("vence em 16 dias");
    expect(formatarDiasRestantesDocumento(1)).toBe("vence amanhã");
    expect(formatarDiasRestantesDocumento(0)).toBe("vence hoje");
    expect(formatarDiasRestantesDocumento(-3)).toBe("venceu há 3 dias");
  });

  it("rotulo curto do badge de alerta", () => {
    expect(
      rotuloCurtoAlertaDocumentos({
        tem_alerta: false,
        ausente: 0,
        vencido: 0,
        a_vencer: 0,
        rotulo: "Docs OK",
      })
    ).toBe("Docs OK");
    expect(
      rotuloCurtoAlertaDocumentos({
        tem_alerta: true,
        ausente: 0,
        vencido: 1,
        a_vencer: 0,
        rotulo: "ASO vencido",
      })
    ).toBe("Doc. vencido");
    expect(
      rotuloCurtoAlertaDocumentos({
        tem_alerta: true,
        ausente: 0,
        vencido: 0,
        a_vencer: 1,
        rotulo: "ASO (vence em 15 dias)",
      })
    ).toBe("Doc. a vencer");
  });

  it("exporta CSV do checklist com BOM e status", () => {
    const csv = exportarDocumentosPessoasCsv(
      [
        pessoaBase({
          id: "pes-a",
          nome: "Ana",
          contrato_assinado: true,
          esocial_ok: true,
          documentos: [
            { id: "1", tipo: "contrato", rotulo: "Contrato assinado", presente: true },
            { id: "2", tipo: "esocial", rotulo: "eSocial OK", presente: true },
            { id: "3", tipo: "rg", rotulo: "RG / identidade", presente: false },
            {
              id: "4",
              tipo: "aso",
              rotulo: "ASO (exame admissional/periódico)",
              presente: true,
              validade: "2026-08-20",
            },
          ],
        }),
      ],
      "2026-08-04"
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Pessoa;Tipo vínculo;Documento;Status");
    expect(csv).toContain("Ana");
    expect(csv).toContain("A vencer");
    expect(csv).toContain("Ausente");
  });
});
