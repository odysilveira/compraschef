import { describe, expect, it } from "vitest";
import type { DB, PessoaRH } from "../types";
import { permissoesVazias } from "./rh";
import {
  hrefConsumosRh,
  hrefEscalaRh,
  hrefPagamentosRh,
  hrefPessoasRh,
  hrefPontoRh,
  destaqueSlotFiltroConvocacao,
  parseAbaPontoRh,
  parseFiltroConsumosRh,
  parseFiltroConvocacaoEscalaRh,
  parseFiltroDocsRh,
  parseFiltroPagamentosRh,
  parseFiltroPendenciasPontoRh,
  parsePessoaPontoRh,
  resumirOperacionalRh,
} from "./resumo-rh";

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
  it("conta docs, ponto, convocações, pagamentos e consumos", () => {
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
        { id: "c1", status: "enviada", escala_slot_id: "esc-passado" },
        { id: "c2", status: "aceita", escala_slot_id: "esc-x" },
        { id: "c3", status: "enviada", escala_slot_id: "esc-futuro" },
      ],
      escala_slots: [
        { id: "esc-passado", data: "2026-08-01" },
        { id: "esc-futuro", data: "2026-08-20" },
      ],
      pagamentos_pessoas: [
        { id: "pg1", status: "aguardando_conciliacao" },
        { id: "pg2", status: "liberado" },
        { id: "pg3", status: "previsto" },
        { id: "pg4", status: "pago" },
      ],
      consumos_pessoas: [
        { id: "c1", status: "pendente" },
        { id: "c2", status: "descontado" },
        { id: "c3", status: "pendente" },
      ],
    } as unknown as DB;

    const r = resumirOperacionalRh(db, "2026-08-04");
    expect(r.pessoas_ativas).toBe(2);
    expect(r.docs_alerta).toBe(1);
    expect(r.docs_vencido).toBe(1);
    expect(r.docs_a_vencer).toBe(0);
    expect(r.ponto_abertas).toBe(1);
    expect(r.ponto_a_avisar).toBe(1);
    expect(r.ponto_propostas).toBe(0);
    expect(r.convocacoes_enviadas).toBe(2);
    expect(r.convocacoes_sem_resposta).toBe(1);
    expect(r.pagamentos_aguardando).toBe(1);
    expect(r.pagamentos_abertos).toBe(2);
    expect(r.consumos_pendentes).toBe(2);
  });

  it("monta hrefs e parseia filtros", () => {
    expect(parseFiltroPagamentosRh("aguardando")).toBe("aguardando");
    expect(parseFiltroPagamentosRh("x")).toBe("abertos");
    expect(hrefPagamentosRh()).toBe("/rh/pagamentos");
    expect(hrefPagamentosRh("aguardando")).toBe("/rh/pagamentos?filtro=aguardando");
    expect(hrefPagamentosRh({ filtro: "todos", pessoa: "pes-1" })).toBe(
      "/rh/pagamentos?filtro=todos&pessoa=pes-1"
    );
    expect(hrefPagamentosRh({ pessoa: "pes-1" })).toBe("/rh/pagamentos?pessoa=pes-1");
    expect(parseFiltroDocsRh("alerta")).toBe("alerta");
    expect(parseFiltroDocsRh(null)).toBe("todos");
    expect(hrefPessoasRh({ docs: "alerta" })).toBe("/rh?docs=alerta");
    expect(hrefPessoasRh()).toBe("/rh");
    expect(parseFiltroConsumosRh("descontados")).toBe("descontados");
    expect(hrefConsumosRh()).toBe("/rh/consumos");
    expect(hrefConsumosRh("todos")).toBe("/rh/consumos?filtro=todos");
    expect(hrefConsumosRh({ filtro: "todos", pessoa: "pes-1" })).toBe(
      "/rh/consumos?filtro=todos&pessoa=pes-1"
    );
    expect(hrefConsumosRh({ pessoa: "pes-1" })).toBe("/rh/consumos?pessoa=pes-1");
    expect(parseAbaPontoRh("espelho")).toBe("espelho");
    expect(parseAbaPontoRh(null)).toBe("pendencias");
    expect(hrefPontoRh()).toBe("/rh/ponto");
    expect(hrefPontoRh("espelho")).toBe("/rh/ponto?aba=espelho");
    expect(hrefPontoRh({ aba: "espelho" })).toBe("/rh/ponto?aba=espelho");
    expect(hrefPontoRh({ aba: "espelho", pessoa: "pes-1" })).toBe(
      "/rh/ponto?aba=espelho&pessoa=pes-1"
    );
    expect(hrefPontoRh({ pessoa: "pes-1" })).toBe("/rh/ponto?pessoa=pes-1");
    expect(hrefPontoRh({ filtro: "proposta" })).toBe("/rh/ponto?filtro=proposta");
    expect(parseFiltroPendenciasPontoRh("proposta")).toBe("proposta");
    expect(parseFiltroPendenciasPontoRh(null)).toBe("abertas");
    expect(parsePessoaPontoRh(" pes-1 ")).toBe("pes-1");
    expect(parsePessoaPontoRh(null)).toBe("");
    expect(parseFiltroConvocacaoEscalaRh("enviada")).toBe("enviada");
    expect(parseFiltroConvocacaoEscalaRh("rascunho")).toBe("rascunho");
    expect(parseFiltroConvocacaoEscalaRh(null)).toBe("todas");
    expect(hrefEscalaRh()).toBe("/rh/escala");
    expect(hrefEscalaRh({ convocacao: "enviada" })).toBe("/rh/escala?convocacao=enviada");
    expect(hrefEscalaRh({ convocacao: "rascunho" })).toBe("/rh/escala?convocacao=rascunho");
    expect(destaqueSlotFiltroConvocacao("todas", "enviada")).toBe("normal");
    expect(destaqueSlotFiltroConvocacao("enviada", "enviada")).toBe("destaque");
    expect(destaqueSlotFiltroConvocacao("enviada", "rascunho")).toBe("atenuado");
    expect(destaqueSlotFiltroConvocacao("enviada", undefined)).toBe("atenuado");
    expect(destaqueSlotFiltroConvocacao("rascunho", "rascunho")).toBe("destaque");
    expect(destaqueSlotFiltroConvocacao("rascunho", "enviada")).toBe("atenuado");
  });
});
