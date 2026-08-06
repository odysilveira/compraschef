import { describe, expect, it } from "vitest";
import type { DB, PessoaRH } from "../types";
import { permissoesVazias } from "./rh";
import {
  hrefConsumosRh,
  hrefEscalaRh,
  hrefNormasRh,
  hrefPagamentosRh,
  hrefPessoasRh,
  hrefPontoRh,
  destaqueSlotFiltroConvocacao,
  filtroPagamentosRhDeStatus,
  filtroConsumosRhDeStatus,
  parseAbaPontoRh,
  parseAlertaCltEscalaRh,
  parseFiltroConsumosRh,
  parseFiltroConvocacaoEscalaRh,
  parseFiltroDocsRh,
  parseFiltroEspelhoPontoRh,
  parseCompetenciaEspelhoPontoRh,
  parseCompetenciaPagamentosRh,
  parseTipoPagamentosRh,
  parseFiltroNormasRh,
  parseFiltroPagamentosRh,
  parseFiltroPendenciasPontoRh,
  parsePessoaPontoRh,
  pessoaCorrespondeFiltroDocsRh,
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
        pessoa({
          id: "clt-sem",
          nome: "CLT Sem",
          tipo: "colaborador",
          funcao: "cozinha",
          documentos: [
            { id: "1", tipo: "contrato", rotulo: "C", presente: true },
            { id: "2", tipo: "esocial", rotulo: "E", presente: true },
            { id: "3", tipo: "rg", rotulo: "R", presente: true },
            { id: "4", tipo: "aso", rotulo: "A", presente: true, validade: "2030-01-01" },
            { id: "5", tipo: "ctps", rotulo: "CTPS", presente: true },
          ],
        }),
      ],
      pendencias_ponto: [
        { id: "pp1", status: "aguardando_aviso" },
        { id: "pp2", status: "aprovada" },
      ],
      convocacoes: [
        { id: "c1", status: "enviada", escala_slot_id: "esc-passado" },
        { id: "c2", status: "aceita", escala_slot_id: "esc-x" },
        { id: "c3", status: "enviada", escala_slot_id: "esc-futuro" },
        { id: "c4", status: "rascunho", escala_slot_id: "esc-futuro" },
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
      normas_rh: [
        { id: "n1", status: "pendente" },
        { id: "n2", status: "aplicada" },
        { id: "n3", status: "pendente" },
      ],
    } as unknown as DB;

    const r = resumirOperacionalRh(db, "2026-08-04");
    expect(r.pessoas_ativas).toBe(3);
    expect(r.docs_alerta).toBe(1);
    expect(r.docs_vencido).toBe(1);
    expect(r.docs_a_vencer).toBe(0);
    expect(r.ponto_abertas).toBe(1);
    expect(r.ponto_a_avisar).toBe(1);
    expect(r.ponto_propostas).toBe(0);
    expect(r.convocacoes_enviadas).toBe(2);
    expect(r.convocacoes_sem_resposta).toBe(1);
    expect(r.convocacoes_rascunho).toBe(1);
    expect(r.clt_sem_plantao).toBe(1);
    expect(r.pagamentos_aguardando).toBe(1);
    expect(r.pagamentos_abertos).toBe(2);
    expect(r.pagamentos_previstos).toBe(1);
    expect(r.pagamentos_liberados).toBe(1);
    expect(r.consumos_pendentes).toBe(2);
    expect(r.normas_pendentes).toBe(2);
  });

  it("monta hrefs e parseia filtros", () => {
    expect(parseFiltroPagamentosRh("aguardando")).toBe("aguardando");
    expect(parseFiltroPagamentosRh("previsto")).toBe("previsto");
    expect(parseFiltroPagamentosRh("liberado")).toBe("liberado");
    expect(parseFiltroPagamentosRh("x")).toBe("abertos");
    expect(filtroPagamentosRhDeStatus("previsto")).toBe("previsto");
    expect(filtroPagamentosRhDeStatus("liberado")).toBe("liberado");
    expect(filtroPagamentosRhDeStatus("aguardando_conciliacao")).toBe("aguardando");
    expect(filtroPagamentosRhDeStatus("pago")).toBe("pagos");
    expect(hrefPagamentosRh()).toBe("/rh/pagamentos");
    expect(hrefPagamentosRh("aguardando")).toBe("/rh/pagamentos?filtro=aguardando");
    expect(hrefPagamentosRh("previsto")).toBe("/rh/pagamentos?filtro=previsto");
    expect(hrefPagamentosRh("liberado")).toBe("/rh/pagamentos?filtro=liberado");
    expect(hrefPagamentosRh({ filtro: "todos", pessoa: "pes-1" })).toBe(
      "/rh/pagamentos?filtro=todos&pessoa=pes-1"
    );
    expect(hrefPagamentosRh({ pessoa: "pes-1" })).toBe("/rh/pagamentos?pessoa=pes-1");
    expect(parseCompetenciaPagamentosRh("2026-06")).toBe("2026-06");
    expect(parseCompetenciaPagamentosRh("2026-13")).toBe("");
    expect(parseCompetenciaPagamentosRh(null)).toBe("");
    expect(hrefPagamentosRh({ competencia: "2026-06" })).toBe(
      "/rh/pagamentos?competencia=2026-06"
    );
    expect(
      hrefPagamentosRh({ filtro: "previsto", pessoa: "pes-1", competencia: "2026-06" })
    ).toBe("/rh/pagamentos?filtro=previsto&pessoa=pes-1&competencia=2026-06");
    expect(parseTipoPagamentosRh("salario")).toBe("salario");
    expect(parseTipoPagamentosRh("x")).toBe("todos");
    expect(parseTipoPagamentosRh(null)).toBe("todos");
    expect(hrefPagamentosRh({ tipo: "salario" })).toBe("/rh/pagamentos?tipo=salario");
    expect(
      hrefPagamentosRh({
        filtro: "abertos",
        pessoa: "pes-1",
        competencia: "2026-06",
        tipo: "salario",
      })
    ).toBe("/rh/pagamentos?pessoa=pes-1&competencia=2026-06&tipo=salario");
    expect(parseFiltroDocsRh("alerta")).toBe("alerta");
    expect(parseFiltroDocsRh("vencido")).toBe("vencido");
    expect(parseFiltroDocsRh("a_vencer")).toBe("a_vencer");
    expect(parseFiltroDocsRh(null)).toBe("todos");
    expect(hrefPessoasRh({ docs: "alerta" })).toBe("/rh?docs=alerta");
    expect(hrefPessoasRh({ docs: "vencido" })).toBe("/rh?docs=vencido");
    expect(hrefPessoasRh({ docs: "a_vencer" })).toBe("/rh?docs=a_vencer");
    expect(hrefPessoasRh()).toBe("/rh");
    expect(
      pessoaCorrespondeFiltroDocsRh(
        pessoa({
          id: "ok-docs",
          documentos: [
            { id: "1", tipo: "contrato", rotulo: "C", presente: true },
            { id: "2", tipo: "esocial", rotulo: "E", presente: true },
            { id: "3", tipo: "rg", rotulo: "R", presente: true },
            { id: "4", tipo: "aso", rotulo: "A", presente: true, validade: "2030-01-01" },
          ],
        }),
        "alerta"
      )
    ).toBe(false);
    expect(
      pessoaCorrespondeFiltroDocsRh(
        pessoa({
          id: "venc",
          documentos: [
            { id: "1", tipo: "contrato", rotulo: "C", presente: true },
            { id: "2", tipo: "esocial", rotulo: "E", presente: true },
            { id: "3", tipo: "rg", rotulo: "R", presente: true },
            { id: "4", tipo: "aso", rotulo: "A", presente: true, validade: "2020-01-01" },
          ],
        }),
        "vencido"
      )
    ).toBe(true);
    expect(parseFiltroConsumosRh("descontados")).toBe("descontados");
    expect(filtroConsumosRhDeStatus("pendente")).toBe("pendentes");
    expect(filtroConsumosRhDeStatus("descontado")).toBe("descontados");
    expect(hrefConsumosRh()).toBe("/rh/consumos");
    expect(hrefConsumosRh("todos")).toBe("/rh/consumos?filtro=todos");
    expect(hrefConsumosRh({ filtro: "todos", pessoa: "pes-1" })).toBe(
      "/rh/consumos?filtro=todos&pessoa=pes-1"
    );
    expect(hrefConsumosRh({ pessoa: "pes-1" })).toBe("/rh/consumos?pessoa=pes-1");
    expect(parseFiltroNormasRh("todas")).toBe("todas");
    expect(parseFiltroNormasRh(null)).toBe("pendente");
    expect(hrefNormasRh()).toBe("/rh/normas");
    expect(hrefNormasRh("pendente")).toBe("/rh/normas");
    expect(hrefNormasRh("todas")).toBe("/rh/normas?filtro=todas");
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
    expect(parseFiltroEspelhoPontoRh("atraso")).toBe("atraso");
    expect(parseFiltroEspelhoPontoRh("saldo_negativo")).toBe("saldo_negativo");
    expect(parseFiltroEspelhoPontoRh(null)).toBe("todos");
    expect(hrefPontoRh({ aba: "espelho", status: "sem_batida" })).toBe(
      "/rh/ponto?aba=espelho&status=sem_batida"
    );
    expect(hrefPontoRh({ aba: "espelho", status: "todos", pessoa: "pes-1" })).toBe(
      "/rh/ponto?aba=espelho&pessoa=pes-1"
    );
    expect(parseCompetenciaEspelhoPontoRh("2026-06")).toBe("2026-06");
    expect(parseCompetenciaEspelhoPontoRh("2026-13")).toMatch(/^\d{4}-\d{2}$/);
    expect(parseCompetenciaEspelhoPontoRh(null)).toMatch(/^\d{4}-\d{2}$/);
    expect(hrefPontoRh({ aba: "espelho", competencia: "2026-01" })).toBe(
      "/rh/ponto?aba=espelho&competencia=2026-01"
    );
    expect(
      hrefPontoRh({
        aba: "espelho",
        competencia: "2026-01",
        pessoa: "pes-1",
        status: "atraso",
      })
    ).toBe("/rh/ponto?aba=espelho&status=atraso&competencia=2026-01&pessoa=pes-1");
    expect(parseFiltroPendenciasPontoRh("proposta")).toBe("proposta");
    expect(parseFiltroPendenciasPontoRh(null)).toBe("abertas");
    expect(parsePessoaPontoRh(" pes-1 ")).toBe("pes-1");
    expect(parsePessoaPontoRh(null)).toBe("");
    expect(parseFiltroConvocacaoEscalaRh("enviada")).toBe("enviada");
    expect(parseFiltroConvocacaoEscalaRh("rascunho")).toBe("rascunho");
    expect(parseFiltroConvocacaoEscalaRh("sem_resposta")).toBe("sem_resposta");
    expect(parseFiltroConvocacaoEscalaRh(null)).toBe("todas");
    expect(hrefEscalaRh()).toBe("/rh/escala");
    expect(hrefEscalaRh({ convocacao: "enviada" })).toBe("/rh/escala?convocacao=enviada");
    expect(hrefEscalaRh({ convocacao: "rascunho" })).toBe("/rh/escala?convocacao=rascunho");
    expect(hrefEscalaRh({ convocacao: "sem_resposta" })).toBe(
      "/rh/escala?convocacao=sem_resposta"
    );
    expect(hrefEscalaRh({ clt: "sem" })).toBe("/rh/escala?clt=sem");
    expect(hrefEscalaRh({ pessoa: "pes-1" })).toBe("/rh/escala?pessoa=pes-1");
    expect(hrefEscalaRh({ convocacao: "enviada", pessoa: "pes-1" })).toBe(
      "/rh/escala?convocacao=enviada&pessoa=pes-1"
    );
    expect(hrefEscalaRh({ convocacao: "enviada", clt: "sem" })).toBe(
      "/rh/escala?convocacao=enviada&clt=sem"
    );
    expect(parseAlertaCltEscalaRh("sem")).toBe(true);
    expect(parseAlertaCltEscalaRh(null)).toBe(false);
    expect(destaqueSlotFiltroConvocacao("todas", "enviada")).toBe("normal");
    expect(destaqueSlotFiltroConvocacao("enviada", "enviada")).toBe("destaque");
    expect(destaqueSlotFiltroConvocacao("enviada", "rascunho")).toBe("atenuado");
    expect(destaqueSlotFiltroConvocacao("enviada", undefined)).toBe("atenuado");
    expect(destaqueSlotFiltroConvocacao("rascunho", "rascunho")).toBe("destaque");
    expect(destaqueSlotFiltroConvocacao("rascunho", "enviada")).toBe("atenuado");
    expect(
      destaqueSlotFiltroConvocacao("sem_resposta", "enviada", {
        dataSlot: "2026-07-01",
        hoje: "2026-08-01",
      })
    ).toBe("destaque");
    expect(
      destaqueSlotFiltroConvocacao("sem_resposta", "enviada", {
        dataSlot: "2026-08-10",
        hoje: "2026-08-01",
      })
    ).toBe("atenuado");
    expect(
      destaqueSlotFiltroConvocacao("sem_resposta", "rascunho", {
        dataSlot: "2026-07-01",
        hoje: "2026-08-01",
      })
    ).toBe("atenuado");
    expect(
      destaqueSlotFiltroConvocacao("todas", "enviada", {
        filtroPessoa: "pes-1",
        pessoaId: "pes-1",
      })
    ).toBe("destaque");
    expect(
      destaqueSlotFiltroConvocacao("todas", "enviada", {
        filtroPessoa: "pes-1",
        pessoaId: "pes-2",
      })
    ).toBe("atenuado");
  });
});
