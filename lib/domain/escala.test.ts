import { describe, expect, it } from "vitest";
import type { DB, PessoaRH } from "../types";
import {
  antecedenciaMinimaOk,
  calcularHorasPagas,
  criarSlot,
  janela28Dias,
  marcarConvocacaoEnviada,
  montarTextoConvocacaoWhatsApp,
  registrarRespostaConvocacao,
  validarPreRequisitosConvocacao,
} from "./escala";

function pessoaInter(overrides: Partial<PessoaRH> = {}): PessoaRH {
  return {
    id: "pes-inter-1",
    nome: "Carlos Extra",
    tipo: "intermitente",
    funcao: "salao",
    cargo: "Garçom",
    valor_hora: 12.5,
    telefone: "43988881000",
    contrato_assinado: true,
    esocial_ok: true,
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

function dbBase(): DB {
  return {
    pessoas: [pessoaInter(), pessoaInter({ id: "pes-clt", nome: "João", tipo: "colaborador", valor_hora: undefined })],
    escala_slots: [],
    convocacoes: [],
    pagamentos_pessoas: [],
    consumos_pessoas: [],
  } as unknown as DB;
}

describe("escala domain", () => {
  it("monta janela de 28 dias", () => {
    const dias = janela28Dias("2026-08-02");
    expect(dias).toHaveLength(28);
    expect(dias[0]).toBe("2026-08-02");
    expect(dias[27]).toBe("2026-08-29");
  });

  it("calcula horas brutas e pagas", () => {
    const r = calcularHorasPagas("18:00", "23:30", 30);
    expect(r).toEqual({ horas_brutas: 5.5, horas_pagas: 5 });
  });

  it("valida antecedência de 3 dias corridos", () => {
    expect(antecedenciaMinimaOk("2026-08-01", "2026-08-04")).toBe(true);
    expect(antecedenciaMinimaOk("2026-08-01", "2026-08-03")).toBe(false);
  });

  it("cria plantão CLT sem convocação e intermitente com convocação", () => {
    const db = dbBase();
    const clt = criarSlot(
      db,
      {
        pessoa_id: "pes-clt",
        data: "2026-08-10",
        hora_inicio: "09:00",
        hora_fim: "17:00",
        intervalo_min: 60,
      },
      { id: "esc-1", agora: "2026-08-02T12:00:00.000Z" }
    );
    expect(clt.sucesso).toBe(true);
    expect(clt.convocacao).toBeUndefined();
    expect(db.convocacoes).toHaveLength(0);

    const inter = criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-10",
        hora_inicio: "18:00",
        hora_fim: "23:30",
        intervalo_min: 30,
        funcao: "Garçom",
      },
      { id: "esc-2", convocacaoId: "conv-1", agora: "2026-08-02T12:00:00.000Z" }
    );
    expect(inter.sucesso).toBe(true);
    expect(inter.convocacao?.id).toBe("conv-1");
    expect(db.convocacoes).toHaveLength(1);
  });

  it("fluxo convocação: texto, enviar, aceitar cria pagamento", () => {
    const db = dbBase();
    const r = criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-10",
        hora_inicio: "18:00",
        hora_fim: "23:30",
        intervalo_min: 30,
        funcao: "Garçom",
      },
      { id: "esc-2", agora: "2026-08-02T12:00:00.000Z", convocacaoId: "conv-2" }
    );
    expect(r.sucesso).toBe(true);
    expect(r.convocacao?.status).toBe("rascunho");
    expect(r.convocacao?.antecedencia_ok).toBe(true);
    expect(r.convocacao?.horas_pagas).toBe(5);
    expect(r.convocacao?.valor_estimado).toBe(62.5);
    expect(r.convocacao?.texto_mensagem).toContain("ACEITO");
    expect(r.convocacao?.texto_mensagem).toContain("Carlos");

    const enviada = marcarConvocacaoEnviada(db, r.convocacao!.id, "2026-08-02T13:00:00.000Z");
    expect(enviada.sucesso).toBe(true);
    expect(db.convocacoes[0].status).toBe("enviada");

    const aceita = registrarRespostaConvocacao(db, r.convocacao!.id, "aceita", "2026-08-03T10:00:00.000Z");
    expect(aceita.sucesso).toBe(true);
    expect(db.convocacoes[0].status).toBe("aceita");
    expect(aceita.pagamento?.convocacao_id).toBe("conv-2");
    expect(aceita.pagamento?.tipo).toBe("intermitente_periodo");
    expect(aceita.pagamento?.valor).toBe(62.5);
    expect(aceita.pagamento?.status).toBe("previsto");
    expect(db.pagamentos_pessoas).toHaveLength(1);

    const deNovo = registrarRespostaConvocacao(db, r.convocacao!.id, "aceita", "2026-08-03T11:00:00.000Z");
    expect(deNovo.sucesso).toBe(true);
    expect(db.pagamentos_pessoas).toHaveLength(1);
  });

  it("recusa não cria pagamento", () => {
    const db = dbBase();
    const r = criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-12",
        hora_inicio: "18:00",
        hora_fim: "22:00",
        intervalo_min: 0,
      },
      { id: "esc-3", convocacaoId: "conv-3", agora: "2026-08-02T12:00:00.000Z" }
    );
    marcarConvocacaoEnviada(db, r.convocacao!.id);
    const recusa = registrarRespostaConvocacao(db, r.convocacao!.id, "recusada");
    expect(recusa.sucesso).toBe(true);
    expect(recusa.pagamento).toBeUndefined();
    expect(db.pagamentos_pessoas).toHaveLength(0);
  });

  it("monta texto no modelo WhatsApp", () => {
    const texto = montarTextoConvocacaoWhatsApp({
      pessoa: pessoaInter(),
      slot: {
        id: "esc-x",
        pessoa_id: "pes-inter-1",
        data: "2026-08-09",
        hora_inicio: "18:00",
        hora_fim: "23:30",
        intervalo_min: 30,
        funcao: "Garçom",
        local: "Vera Bela",
        criado_em: "",
        atualizado_em: "",
      },
      valor_hora: 12.5,
      horas_brutas: 5.5,
      horas_pagas: 5,
      valor_estimado: 62.5,
    });
    expect(texto).toContain("09/08/2026");
    expect(texto).toContain("contrato de trabalho intermitente");
  });

  it("bloqueia convocação sem contrato ou eSocial", () => {
    const semContrato = pessoaInter({
      id: "pes-sem",
      contrato_assinado: false,
      esocial_ok: false,
    });
    expect(validarPreRequisitosConvocacao(semContrato).ok).toBe(false);
    expect(validarPreRequisitosConvocacao(semContrato).erros.length).toBeGreaterThanOrEqual(2);

    const db = dbBase();
    db.pessoas.push(semContrato);
    const r = criarSlot(
      db,
      {
        pessoa_id: "pes-sem",
        data: "2026-08-20",
        hora_inicio: "18:00",
        hora_fim: "23:00",
        intervalo_min: 30,
      },
      { id: "esc-block", agora: "2026-08-10T12:00:00.000Z" }
    );
    expect(r.sucesso).toBe(false);
    expect(r.erros.some((e) => e.includes("Contrato"))).toBe(true);
    expect(db.escala_slots.find((s) => s.id === "esc-block")).toBeUndefined();
  });
});
