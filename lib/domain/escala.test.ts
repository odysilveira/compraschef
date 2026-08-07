import { describe, expect, it } from "vitest";
import type { DB, PessoaRH } from "../types";
import { hojeIsoLocal, somarDiasIso } from "./documentos-pessoa";
import {
  antecedenciaMinimaOk,
  calcularHorasPagas,
  convocacaoEnviadaSemRespostaVencida,
  criarSlot,
  datasTrabalhoPadraoClt,
  excluirSlot,
  gerarEscalaPadraoClt,
  janela28Dias,
  janelaCalendarioEscala,
  linkWhatsAppConvocacao,
  listarCltSemPlantaoNaJanela,
  listarConvocacoesRascunhoNaJanela,
  marcarConvocacaoEnviada,
  marcarConvocacoesEnviadas,
  montarGradeCalendario,
  montarTextoConvocacaoWhatsApp,
  montarTextosWhatsAppConvocacoesLote,
  moverSlotParaData,
  exportarEscalaCsv,
  registrarRespostaConvocacao,
  registrarRespostasConvocacoes,
  registrarSilencioConvocacoesVencidas,
  resumoSetoresDoDia,
  rotuloPeriodoJanela,
  rotulosCabecalhoSemana,
  setorDoPlantao,
  setorPorTextoFuncao,
  slotsDaPessoaNaJanela,
  textoResumoSetores,
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

  it("gera datas 6x1 e seg–sex", () => {
    const d61 = datasTrabalhoPadraoClt("6x1", "2026-08-03", "2026-08-03", 14);
    // 3–8 trab, 9 folga, 10–15 trab → 12 dias em 14
    expect(d61).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
    ]);
    const segSex = datasTrabalhoPadraoClt("seg_sex", "2026-08-01", "2026-08-01", 7);
    // 1=sáb,2=dom,3=seg...7=sex → seg a sex = 3,4,5,6,7
    expect(segSex).toEqual(["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]);
  });

  it("gera escala padrão CLT sem duplicar", () => {
    const db = dbBase();
    const r = gerarEscalaPadraoClt(
      db,
      {
        pessoa_id: "pes-clt",
        padrao: "5x2",
        hora_inicio: "09:00",
        hora_fim: "17:00",
        intervalo_min: 60,
        inicio_janela: "2026-08-03",
        referencia_ciclo: "2026-08-03",
      },
      { agora: "2026-08-02T12:00:00.000Z", idFactory: () => `esc-${db.escala_slots.length + 1}` }
    );
    expect(r.sucesso).toBe(true);
    expect(r.criados).toBeGreaterThan(0);
    const antes = r.criados;
    const deNovo = gerarEscalaPadraoClt(
      db,
      {
        pessoa_id: "pes-clt",
        padrao: "5x2",
        hora_inicio: "09:00",
        hora_fim: "17:00",
        intervalo_min: 60,
        inicio_janela: "2026-08-03",
        referencia_ciclo: "2026-08-03",
      },
      { agora: "2026-08-02T12:00:00.000Z" }
    );
    expect(deNovo.sucesso).toBe(true);
    expect(deNovo.criados).toBe(0);
    expect(deNovo.pulados).toBe(antes);
  });

  it("monta grade de calendário começando na segunda", () => {
    // 2026-08-03 é segunda → sem padding
    const semanas = montarGradeCalendario(janela28Dias("2026-08-03"), 1);
    expect(rotulosCabecalhoSemana(1)[0]).toBe("Seg");
    expect(semanas[0]?.[0]).toBe("2026-08-03");
    expect(semanas[0]?.[6]).toBe("2026-08-09");
    // 28 dias → 4 semanas cheias
    expect(semanas).toHaveLength(4);
    expect(semanas.every((s) => s.length === 7)).toBe(true);
  });

  it("janela do calendário vai até o fim do mês seguinte", () => {
    // 2/ago → 31/ago + 1–30/set
    const dias = janelaCalendarioEscala("2026-08-02");
    expect(dias[0]).toBe("2026-08-02");
    expect(dias[dias.length - 1]).toBe("2026-09-30");
    expect(dias).toContain("2026-08-31");
    expect(dias).toContain("2026-09-01");
    expect(rotuloPeriodoJanela(dias)).toContain("02/08/2026");
    expect(rotuloPeriodoJanela(dias)).toContain("30/09/2026");
  });

  it("preenche células vazias antes da primeira data", () => {
    // 2026-08-05 é quarta → Seg e Ter vazios
    const semanas = montarGradeCalendario(["2026-08-05", "2026-08-06"], 1);
    expect(semanas[0]?.slice(0, 2)).toEqual([null, null]);
    expect(semanas[0]?.[2]).toBe("2026-08-05");
  });

  it("move plantão para outro dia e atualiza convocação", () => {
    const db = dbBase();
    const criado = criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-20",
        hora_inicio: "18:00",
        hora_fim: "23:00",
        intervalo_min: 30,
      },
      { id: "esc-move", agora: "2026-08-10T12:00:00.000Z", convocacaoId: "conv-move" }
    );
    expect(criado.sucesso).toBe(true);
    const r = moverSlotParaData(db, "esc-move", "2026-08-22", { agora: "2026-08-10T12:00:00.000Z" });
    expect(r.sucesso).toBe(true);
    expect(db.escala_slots.find((s) => s.id === "esc-move")?.data).toBe("2026-08-22");
    expect(db.convocacoes.find((c) => c.id === "conv-move")?.texto_mensagem).toContain("22/08/2026");
  });

  it("não move se já existir plantão da pessoa no dia destino", () => {
    const db = dbBase();
    criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-20",
        hora_inicio: "18:00",
        hora_fim: "23:00",
        intervalo_min: 30,
      },
      { id: "esc-a", agora: "2026-08-10T12:00:00.000Z" }
    );
    criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-21",
        hora_inicio: "18:00",
        hora_fim: "23:00",
        intervalo_min: 30,
      },
      { id: "esc-b", agora: "2026-08-10T12:00:00.000Z" }
    );
    const r = moverSlotParaData(db, "esc-a", "2026-08-21");
    expect(r.sucesso).toBe(false);
    expect(r.erros[0]).toMatch(/Já existe/);
  });

  it("classifica setores e resume o dia", () => {
    const slots = [
      { id: "1", pessoa_id: "i1", data: "2026-08-10", hora_inicio: "18:00", hora_fim: "23:00", intervalo_min: 30, funcao: "Cozinha", criado_em: "", atualizado_em: "" },
      { id: "2", pessoa_id: "i2", data: "2026-08-10", hora_inicio: "18:00", hora_fim: "23:00", intervalo_min: 30, funcao: "Balcão / Caixa", criado_em: "", atualizado_em: "" },
      { id: "3", pessoa_id: "e1", data: "2026-08-10", hora_inicio: "18:00", hora_fim: "23:00", intervalo_min: 30, funcao: "Entregador", criado_em: "", atualizado_em: "" },
    ];
    const pessoas = [
      { id: "i1", tipo: "intermitente" as const },
      { id: "i2", tipo: "intermitente" as const },
      { id: "e1", tipo: "entregador" as const },
    ];
    expect(setorDoPlantao(slots[0]!, pessoas[0])).toBe("cozinha");
    expect(setorDoPlantao(slots[1]!, pessoas[1])).toBe("balcao");
    expect(setorDoPlantao(slots[2]!, pessoas[2])).toBe("motoboy");
    expect(resumoSetoresDoDia(slots, pessoas)).toEqual({
      motoboys: 1,
      cozinha: 1,
      balcao: 1,
      salao: 0,
      clt_cozinha: 0,
      clt_balcao: 0,
      clt_salao: 0,
      clt_outros: 0,
    });
    expect(
      resumoSetoresDoDia(
        [
          ...slots,
          {
            id: "4",
            pessoa_id: "c1",
            data: "2026-08-10",
            hora_inicio: "11:00",
            hora_fim: "23:00",
            intervalo_min: 60,
            funcao: "Cozinha",
            criado_em: "",
            atualizado_em: "",
          },
          {
            id: "5",
            pessoa_id: "c2",
            data: "2026-08-10",
            hora_inicio: "11:00",
            hora_fim: "23:00",
            intervalo_min: 60,
            funcao: "Balcão",
            criado_em: "",
            atualizado_em: "",
          },
          {
            id: "6",
            pessoa_id: "c3",
            data: "2026-08-10",
            hora_inicio: "11:00",
            hora_fim: "23:00",
            intervalo_min: 60,
            funcao: "Salão",
            criado_em: "",
            atualizado_em: "",
          },
          {
            id: "7",
            pessoa_id: "i3",
            data: "2026-08-10",
            hora_inicio: "18:00",
            hora_fim: "23:00",
            intervalo_min: 30,
            funcao: "Salão",
            criado_em: "",
            atualizado_em: "",
          },
        ],
        [
          ...pessoas,
          { id: "c1", tipo: "colaborador" as const, funcao: "cozinha" as const },
          { id: "c2", tipo: "colaborador" as const, funcao: "balcao" as const },
          { id: "c3", tipo: "colaborador" as const, funcao: "salao" as const },
          { id: "i3", tipo: "intermitente" as const, funcao: "salao" as const },
        ]
      )
    ).toEqual({
      motoboys: 1,
      cozinha: 1,
      balcao: 1,
      salao: 1,
      clt_cozinha: 1,
      clt_balcao: 1,
      clt_salao: 1,
      clt_outros: 0,
    });
    expect(setorDoPlantao({ funcao: "Cozinha" }, { tipo: "colaborador", funcao: "cozinha" })).toBe("cozinha");
    expect(setorDoPlantao({ funcao: "" }, { tipo: "colaborador", funcao: "balcao" })).toBe("balcao");
    expect(setorPorTextoFuncao("Salão")).toBe("salao");
    expect(setorPorTextoFuncao("Garçom")).toBe("salao");
    expect(
      textoResumoSetores({
        motoboys: 1,
        cozinha: 2,
        balcao: 0,
        salao: 1,
        clt_cozinha: 2,
        clt_balcao: 1,
        clt_salao: 1,
        clt_outros: 0,
      })
    ).toBe("CLT coz 2 · CLT balc 1 · CLT salão 1 · 1 moto · 2 coz · 1 salão");
  });

  it("exclui plantão com convocação rascunho e pagamento previsto", () => {
    const db = dbBase();
    const criado = criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-20",
        hora_inicio: "18:00",
        hora_fim: "23:30",
        intervalo_min: 30,
        funcao: "Salão",
      },
      { id: "esc-del", convocacaoId: "conv-del", agora: "2026-08-10T12:00:00.000Z" }
    );
    expect(criado.sucesso).toBe(true);
    marcarConvocacaoEnviada(db, "conv-del", "2026-08-10T13:00:00.000Z");
    const aceita = registrarRespostaConvocacao(db, "conv-del", "aceita", "2026-08-11T12:00:00.000Z");
    expect(aceita.sucesso).toBe(true);
    expect(db.pagamentos_pessoas.some((p) => p.convocacao_id === "conv-del" && p.status === "previsto")).toBe(true);

    const r = excluirSlot(db, "esc-del");
    expect(r.sucesso).toBe(true);
    expect(db.escala_slots.find((s) => s.id === "esc-del")).toBeUndefined();
    expect(db.convocacoes.find((c) => c.id === "conv-del")).toBeUndefined();
    expect(db.pagamentos_pessoas.find((p) => p.convocacao_id === "conv-del")).toBeUndefined();
  });

  it("bloqueia excluir plantão com pagamento informado", () => {
    const db = dbBase();
    criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-20",
        hora_inicio: "18:00",
        hora_fim: "23:30",
        intervalo_min: 30,
      },
      { id: "esc-lock", convocacaoId: "conv-lock", agora: "2026-08-10T12:00:00.000Z" }
    );
    marcarConvocacaoEnviada(db, "conv-lock", "2026-08-10T13:00:00.000Z");
    registrarRespostaConvocacao(db, "conv-lock", "aceita", "2026-08-11T12:00:00.000Z");
    const pag = db.pagamentos_pessoas.find((p) => p.convocacao_id === "conv-lock")!;
    pag.status = "aguardando_conciliacao";
    pag.pagamento_data = "2026-08-12";
    pag.pagamento_valor = pag.valor;

    const r = excluirSlot(db, "esc-lock");
    expect(r.sucesso).toBe(false);
    expect(r.erros[0]).toMatch(/pagamento/i);
    expect(db.escala_slots.find((s) => s.id === "esc-lock")).toBeDefined();
  });

  it("monta link wa.me com DDI 55", () => {
    const url = linkWhatsAppConvocacao("(43) 98888-1000", "Olá");
    expect(url).toBe("https://wa.me/5543988881000?text=Ol%C3%A1");
    expect(linkWhatsAppConvocacao("", "x")).toBeNull();
  });

  it("filtra plantões da pessoa na janela", () => {
    const db = dbBase();
    const dias = janela28Dias("2026-08-03");
    criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-05",
        hora_inicio: "18:00",
        hora_fim: "23:00",
        intervalo_min: 30,
      },
      { id: "esc-p1", agora: "2026-08-01T12:00:00.000Z" }
    );
    criarSlot(
      db,
      {
        pessoa_id: "pes-clt",
        data: "2026-08-05",
        hora_inicio: "09:00",
        hora_fim: "17:00",
        intervalo_min: 60,
      },
      { id: "esc-p2", agora: "2026-08-01T12:00:00.000Z" }
    );
    const daPessoa = slotsDaPessoaNaJanela(db, "pes-inter-1", dias);
    expect(daPessoa.map((s) => s.id)).toEqual(["esc-p1"]);
  });

  it("bloqueia convocação sem contrato ou eSocial", () => {
    const semContrato = pessoaInter({
      id: "pes-sem",
      contrato_assinado: false,
      esocial_ok: false,
    });
    expect(validarPreRequisitosConvocacao(semContrato).ok).toBe(false);
    expect(validarPreRequisitosConvocacao(semContrato).erros.length).toBeGreaterThanOrEqual(2);

    const entregSemCnh = pessoaInter({
      id: "pes-moto",
      tipo: "entregador",
      funcao: "entregador",
      contrato_assinado: true,
      esocial_ok: true,
      documentos: [
        { id: "d1", tipo: "contrato", rotulo: "Contrato", presente: true },
        { id: "d2", tipo: "esocial", rotulo: "eSocial", presente: true },
        { id: "d3", tipo: "rg", rotulo: "RG", presente: true },
        { id: "d4", tipo: "aso", rotulo: "ASO", presente: true, validade: "2027-01-01" },
        { id: "d5", tipo: "cnh", rotulo: "CNH", presente: false },
      ],
    });
    expect(validarPreRequisitosConvocacao(entregSemCnh).ok).toBe(false);
    expect(validarPreRequisitosConvocacao(entregSemCnh).erros.some((e) => /CNH/i.test(e))).toBe(true);

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

  it("avisa (não bloqueia) quando ASO ou CNH estão a vencer", () => {
    const hoje = hojeIsoLocal();
    const validadeProxima = somarDiasIso(hoje, 15);
    const validadeLonge = somarDiasIso(hoje, 120);

    const comAsoAVencer = pessoaInter({
      id: "pes-aso-av",
      documentos: [
        { id: "d1", tipo: "contrato", rotulo: "Contrato", presente: true },
        { id: "d2", tipo: "esocial", rotulo: "eSocial", presente: true },
        { id: "d3", tipo: "rg", rotulo: "RG", presente: true },
        { id: "d4", tipo: "aso", rotulo: "ASO", presente: true, validade: validadeProxima },
      ],
    });
    const gateAso = validarPreRequisitosConvocacao(comAsoAVencer);
    expect(gateAso.ok).toBe(true);
    expect(gateAso.avisos.some((a) => /ASO/i.test(a))).toBe(true);

    const entregCnhAVencer = pessoaInter({
      id: "pes-cnh-av",
      tipo: "entregador",
      funcao: "entregador",
      documentos: [
        { id: "d1", tipo: "contrato", rotulo: "Contrato", presente: true },
        { id: "d2", tipo: "esocial", rotulo: "eSocial", presente: true },
        { id: "d3", tipo: "rg", rotulo: "RG", presente: true },
        { id: "d4", tipo: "aso", rotulo: "ASO", presente: true, validade: validadeLonge },
        { id: "d5", tipo: "cnh", rotulo: "CNH", presente: true, validade: validadeProxima },
      ],
    });
    const gateCnh = validarPreRequisitosConvocacao(entregCnhAVencer);
    expect(gateCnh.ok).toBe(true);
    expect(gateCnh.avisos.some((a) => /CNH/i.test(a))).toBe(true);

    const db = dbBase();
    db.pessoas.push(comAsoAVencer);
    const dataPlantao = somarDiasIso(hoje, 10);
    const r = criarSlot(
      db,
      {
        pessoa_id: "pes-aso-av",
        data: dataPlantao,
        hora_inicio: "18:00",
        hora_fim: "23:00",
        intervalo_min: 30,
      },
      { id: "esc-aviso", agora: `${hoje}T12:00:00.000Z` }
    );
    expect(r.sucesso).toBe(true);
    expect(r.avisos.some((a) => /ASO/i.test(a))).toBe(true);
    expect(db.escala_slots.find((s) => s.id === "esc-aviso")).toBeDefined();
  });

  it("detecta e registra silêncio em convocações enviadas com plantão vencido", () => {
    expect(convocacaoEnviadaSemRespostaVencida("enviada", "2026-08-01", "2026-08-04")).toBe(true);
    expect(convocacaoEnviadaSemRespostaVencida("enviada", "2026-08-04", "2026-08-04")).toBe(false);
    expect(convocacaoEnviadaSemRespostaVencida("enviada", "2026-08-10", "2026-08-04")).toBe(false);
    expect(convocacaoEnviadaSemRespostaVencida("aceita", "2026-08-01", "2026-08-04")).toBe(false);

    const db = dbBase();
    const vencida = criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-01",
        hora_inicio: "18:00",
        hora_fim: "23:00",
        intervalo_min: 30,
      },
      { id: "esc-venc", convocacaoId: "conv-venc", agora: "2026-07-28T12:00:00.000Z" }
    );
    expect(vencida.sucesso).toBe(true);
    marcarConvocacaoEnviada(db, "conv-venc", "2026-07-28T13:00:00.000Z");

    const futura = criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-10",
        hora_inicio: "18:00",
        hora_fim: "23:00",
        intervalo_min: 30,
      },
      { id: "esc-fut", convocacaoId: "conv-fut", agora: "2026-08-01T12:00:00.000Z" }
    );
    expect(futura.sucesso).toBe(true);
    marcarConvocacaoEnviada(db, "conv-fut", "2026-08-01T13:00:00.000Z");

    const r = registrarSilencioConvocacoesVencidas(db, "2026-08-04", "2026-08-04T15:00:00.000Z");
    expect(r.sucesso).toBe(true);
    expect(r.atualizadas).toBe(1);
    expect(db.convocacoes.find((c) => c.id === "conv-venc")?.status).toBe("silencio");
    expect(db.convocacoes.find((c) => c.id === "conv-fut")?.status).toBe("enviada");
  });

  it("marca convocações rascunho como enviadas em lote", () => {
    const db = dbBase();
    const a = criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-05",
        hora_inicio: "18:00",
        hora_fim: "23:00",
        intervalo_min: 30,
      },
      { id: "esc-r1", convocacaoId: "conv-r1", agora: "2026-08-01T12:00:00.000Z" }
    );
    const b = criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-06",
        hora_inicio: "18:00",
        hora_fim: "23:00",
        intervalo_min: 30,
      },
      { id: "esc-r2", convocacaoId: "conv-r2", agora: "2026-08-01T12:00:00.000Z" }
    );
    const c = criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-07",
        hora_inicio: "18:00",
        hora_fim: "23:00",
        intervalo_min: 30,
      },
      { id: "esc-r3", convocacaoId: "conv-r3", agora: "2026-08-01T12:00:00.000Z" }
    );
    expect(a.sucesso && b.sucesso && c.sucesso).toBe(true);
    marcarConvocacaoEnviada(db, "conv-r3", "2026-08-01T13:00:00.000Z");

    const r = marcarConvocacoesEnviadas(db, ["conv-r1", "conv-r2", "conv-r3"], "2026-08-02T10:00:00.000Z");
    expect(r.enviadas).toBe(2);
    expect(r.sucesso).toBe(false);
    expect(r.erros.some((e) => e.includes("conv-r3"))).toBe(true);
    expect(db.convocacoes.find((x) => x.id === "conv-r1")?.status).toBe("enviada");
    expect(db.convocacoes.find((x) => x.id === "conv-r2")?.status).toBe("enviada");
    expect(db.convocacoes.find((x) => x.id === "conv-r3")?.status).toBe("enviada");

    const todas = marcarConvocacoesEnviadas(db, undefined, "2026-08-02T11:00:00.000Z");
    expect(todas.enviadas).toBe(0);
    expect(todas.sucesso).toBe(true);
  });

  it("aceita e recusa convocações enviadas em lote", () => {
    const db = dbBase();
    const a = criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-05",
        hora_inicio: "18:00",
        hora_fim: "23:00",
        intervalo_min: 30,
      },
      { id: "esc-a1", convocacaoId: "conv-a1", agora: "2026-08-01T12:00:00.000Z" }
    );
    const b = criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-06",
        hora_inicio: "18:00",
        hora_fim: "23:00",
        intervalo_min: 30,
      },
      { id: "esc-a2", convocacaoId: "conv-a2", agora: "2026-08-01T12:00:00.000Z" }
    );
    const c = criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-07",
        hora_inicio: "18:00",
        hora_fim: "23:00",
        intervalo_min: 30,
      },
      { id: "esc-a3", convocacaoId: "conv-a3", agora: "2026-08-01T12:00:00.000Z" }
    );
    expect(a.sucesso && b.sucesso && c.sucesso).toBe(true);
    marcarConvocacaoEnviada(db, "conv-a1", "2026-08-02T10:00:00.000Z");
    marcarConvocacaoEnviada(db, "conv-a2", "2026-08-02T10:00:00.000Z");
    marcarConvocacaoEnviada(db, "conv-a3", "2026-08-02T10:00:00.000Z");
    registrarRespostaConvocacao(db, "conv-a3", "aceita", "2026-08-02T11:00:00.000Z");

    const aceites = registrarRespostasConvocacoes(
      db,
      ["conv-a1", "conv-a3"],
      "aceita",
      "2026-08-03T10:00:00.000Z"
    );
    expect(aceites.atualizadas).toBe(1);
    expect(aceites.pagamentosCriados).toBe(1);
    expect(aceites.sucesso).toBe(false);
    expect(aceites.erros.some((e) => e.includes("conv-a3"))).toBe(true);
    expect(db.convocacoes.find((x) => x.id === "conv-a1")?.status).toBe("aceita");
    expect(db.pagamentos_pessoas.some((p) => p.convocacao_id === "conv-a1")).toBe(true);

    const recusas = registrarRespostasConvocacoes(
      db,
      ["conv-a2"],
      "recusada",
      "2026-08-03T11:00:00.000Z"
    );
    expect(recusas.sucesso).toBe(true);
    expect(recusas.atualizadas).toBe(1);
    expect(recusas.pagamentosCriados).toBe(0);
    expect(db.convocacoes.find((x) => x.id === "conv-a2")?.status).toBe("recusada");
  });

  it("lista CLT ativos sem plantão na janela", () => {
    const db = dbBase();
    db.pessoas.push(
      pessoaInter({
        id: "pes-clt-2",
        nome: "Ana CLT",
        tipo: "colaborador",
        valor_hora: undefined,
      })
    );
    db.escala_slots.push({
      id: "esc-clt",
      pessoa_id: "pes-clt",
      data: "2026-08-05",
      hora_inicio: "11:00",
      hora_fim: "23:00",
      intervalo_min: 60,
      criado_em: "2026-08-01T12:00:00.000Z",
      atualizado_em: "2026-08-01T12:00:00.000Z",
    });
    const sem = listarCltSemPlantaoNaJanela(db, ["2026-08-05", "2026-08-06"]);
    expect(sem.map((p) => p.id)).toEqual(["pes-clt-2"]);
  });

  it("lista convocações em rascunho na janela", () => {
    const db = dbBase();
    const r = criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-10",
        hora_inicio: "18:00",
        hora_fim: "23:00",
        intervalo_min: 30,
      },
      { id: "esc-rasc", convocacaoId: "conv-rasc", agora: "2026-08-01T12:00:00.000Z" }
    );
    expect(r.sucesso).toBe(true);
    expect(r.convocacao?.status).toBe("rascunho");
    const lista = listarConvocacoesRascunhoNaJanela(db, ["2026-08-10", "2026-08-11"]);
    expect(lista.map((c) => c.id)).toEqual(["conv-rasc"]);
    expect(listarConvocacoesRascunhoNaJanela(db, ["2026-08-20"])).toHaveLength(0);
  });

  it("monta textos de WhatsApp do lote com cabeçalho por pessoa", () => {
    expect(
      montarTextosWhatsAppConvocacoesLote([], {
        nomePorId: () => "X",
      })
    ).toBe("");

    const texto = montarTextosWhatsAppConvocacoesLote(
      [
        {
          id: "c1",
          escala_slot_id: "s1",
          pessoa_id: "p1",
          status: "rascunho",
          texto_mensagem: "Oi Ana, plantão amanhã.",
          criado_em: "2026-08-01T12:00:00.000Z",
          atualizado_em: "2026-08-01T12:00:00.000Z",
        },
        {
          id: "c2",
          escala_slot_id: "s2",
          pessoa_id: "p2",
          status: "rascunho",
          texto_mensagem: "  ",
          criado_em: "2026-08-01T12:00:00.000Z",
          atualizado_em: "2026-08-01T12:00:00.000Z",
        },
        {
          id: "c3",
          escala_slot_id: "s3",
          pessoa_id: "p3",
          status: "rascunho",
          texto_mensagem: "Oi Bia, plantão sexta.",
          criado_em: "2026-08-01T12:00:00.000Z",
          atualizado_em: "2026-08-01T12:00:00.000Z",
        },
      ],
      {
        nomePorId: (id) => (id === "p1" ? "Ana" : id === "p3" ? "Bia" : "X"),
        telefonePorId: (id) => (id === "p1" ? "43999990001" : undefined),
      }
    );

    expect(texto).toContain("—— Ana · 43999990001 ——");
    expect(texto).toContain("Oi Ana, plantão amanhã.");
    expect(texto).toContain("—— Bia ——");
    expect(texto).toContain("Oi Bia, plantão sexta.");
    expect(texto).toContain("==========");
    expect(texto).not.toContain("p2");
  });

  it("exporta CSV da escala com BOM e status de convocação", () => {
    const db = dbBase();
    const r = criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-10",
        hora_inicio: "18:00",
        hora_fim: "23:00",
        intervalo_min: 30,
        funcao: "Salão",
        local: "Vera Bela",
      },
      { id: "esc-csv", convocacaoId: "conv-csv", agora: "2026-08-01T12:00:00.000Z" }
    );
    expect(r.sucesso).toBe(true);
    const csv = exportarEscalaCsv([r.slot!], {
      nomePorId: () => "Carlos Extra",
      tipoPorId: () => "Intermitente",
      statusConvocacaoPorSlotId: () => "Rascunho",
    });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Data;Pessoa;Tipo vínculo");
    expect(csv).toContain("2026-08-10;Carlos Extra;Intermitente;Salão;Vera Bela;18:00;23:00;30;Rascunho;");
  });
});
