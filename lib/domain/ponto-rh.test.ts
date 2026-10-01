import { describe, expect, it } from "vitest";
import type { DB, PessoaRH } from "../types";
import {
  aprovarPendenciaPonto,
  aprovarPendenciasPonto,
  detectarPendenciasPonto,
  importarBatidasPonto,
  marcarAvisoPontoEnviado,
  marcarAvisosPontoEnviados,
  montarEspelhoPonto,
  montarTextoAvisoPontoWhatsApp,
  montarTextosWhatsAppAvisosPontoLote,
  registrarPropostaPonto,
  recusarPendenciasPonto,
  resumirEspelhoPonto,
  exportarEspelhoCsv,
  exportarPendenciasPontoCsv,
  filtrarEspelhoPonto,
  filtrarPendenciasPonto,
  resumirPendenciasPontoAbertas,
  duracaoMinutosEntreHoras,
  formatarDuracaoHoras,
  formatarSaldoHoras,
} from "./ponto-rh";

function pessoaClt(overrides: Partial<PessoaRH> = {}): PessoaRH {
  return {
    id: "pes-lider",
    nome: "João",
    tipo: "colaborador",
    funcao: "cozinha",
    telefone: "43999990003",
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
    pessoas: [pessoaClt()],
    escala_slots: [
      {
        id: "esc-1",
        pessoa_id: "pes-lider",
        data: "2026-07-30",
        hora_inicio: "11:00",
        hora_fim: "23:00",
        intervalo_min: 60,
        criado_em: "2026-07-29T12:00:00.000Z",
        atualizado_em: "2026-07-29T12:00:00.000Z",
      },
    ],
    batidas_ponto: [],
    pendencias_ponto: [],
    config_rh: {
      antecedencia_minima_dias: 3,
      aviso_ponto_horas: 24,
      tolerancia_atraso_minutos: 10,
      atualizado_em: "2026-08-01T12:00:00.000Z",
    },
  } as unknown as DB;
}

describe("ponto-rh", () => {
  it("detecta falta após 24h do fim do plantão", () => {
    const db = dbBase();
    // Ainda no dia do plantão (antes do fim) — sem pendência
    const cedo = detectarPendenciasPonto(db, { agora: "2026-07-30T12:00:00.000Z", idFactory: () => "p1" });
    expect(cedo.criadas).toHaveLength(0);

    // Bem depois do fim + 24h em qualquer fuso
    const tarde = detectarPendenciasPonto(db, { agora: "2026-08-03T15:00:00.000Z", idFactory: () => "p1" });
    expect(tarde.criadas).toHaveLength(1);
    expect(tarde.criadas[0]!.tipo_falta).toBe("ambos");
    expect(tarde.criadas[0]!.status).toBe("aguardando_aviso");

    const deNovo = detectarPendenciasPonto(db, { agora: "2026-08-03T16:00:00.000Z" });
    expect(deNovo.criadas).toHaveLength(0);
  });

  it("cancela pendência se batidas do relógio chegarem", () => {
    const db = dbBase();
    detectarPendenciasPonto(db, { agora: "2026-08-03T15:00:00.000Z", idFactory: () => "p1" });
    let n = 0;
    importarBatidasPonto(
      db,
      [
        { pessoa_id: "pes-lider", data: "2026-07-30", hora: "11:05", tipo: "entrada" },
        { pessoa_id: "pes-lider", data: "2026-07-30", hora: "23:02", tipo: "saida" },
      ],
      { idFactory: () => `b-${++n}` }
    );

    const r = detectarPendenciasPonto(db, { agora: "2026-08-03T16:00:00.000Z" });
    expect(r.canceladas).toHaveLength(1);
    expect(db.pendencias_ponto![0]!.status).toBe("cancelada");
  });

  it("fluxo aviso → proposta → aprovação grava batidas", () => {
    const db = dbBase();
    detectarPendenciasPonto(db, { agora: "2026-08-03T15:00:00.000Z", idFactory: () => "p1" });
    const texto = montarTextoAvisoPontoWhatsApp({
      pessoa: db.pessoas[0]!,
      pendencia: db.pendencias_ponto![0]!,
    });
    expect(texto).toContain("João");
    expect(texto).toContain("24h");

    marcarAvisoPontoEnviado(db, "p1", { texto, agora: "2026-08-03T16:00:00.000Z" });
    expect(db.pendencias_ponto![0]!.status).toBe("aguardando_funcionario");

    const prop = registrarPropostaPonto(
      db,
      "p1",
      { entrada: "11:10", saida: "23:05", motivo: "Esqueci de bater" },
      { agora: "2026-08-03T17:00:00.000Z" }
    );
    expect(prop.sucesso).toBe(true);
    expect(db.pendencias_ponto![0]!.status).toBe("proposta");

    let n = 0;
    const ok = aprovarPendenciaPonto(db, "p1", {
      revisado_por: "dono",
      agora: "2026-08-03T18:00:00.000Z",
      idFactory: () => `bat-${++n}`,
    });
    expect(ok.sucesso).toBe(true);
    expect(db.pendencias_ponto![0]!.status).toBe("aprovada");
    expect(db.batidas_ponto).toHaveLength(2);
    expect(db.batidas_ponto!.every((b) => b.origem === "aprovacao")).toBe(true);
  });

  it("marca vários avisos de ponto em lote", () => {
    const db = dbBase();
    db.escala_slots.push({
      id: "esc-2",
      pessoa_id: "pes-lider",
      data: "2026-07-31",
      hora_inicio: "11:00",
      hora_fim: "23:00",
      intervalo_min: 60,
      criado_em: "2026-07-01T00:00:00.000Z",
      atualizado_em: "2026-07-01T00:00:00.000Z",
    });
    let n = 0;
    detectarPendenciasPonto(db, {
      agora: "2026-08-03T15:00:00.000Z",
      idFactory: () => `p-${++n}`,
    });
    const aAvisar = (db.pendencias_ponto ?? []).filter((p) => p.status === "aguardando_aviso");
    expect(aAvisar.length).toBeGreaterThanOrEqual(2);
    const ids = aAvisar.map((p) => p.id);
    const r = marcarAvisosPontoEnviados(db, ids, { agora: "2026-08-03T16:00:00.000Z" });
    expect(r.atualizadas).toBe(ids.length);
    expect(r.sucesso).toBe(true);
    for (const id of ids) {
      expect(db.pendencias_ponto!.find((p) => p.id === id)!.status).toBe("aguardando_funcionario");
    }
  });

  it("monta textos de WhatsApp dos avisos em lote com cabeçalho por pessoa", () => {
    expect(
      montarTextosWhatsAppAvisosPontoLote([], {
        pessoaPorId: () => undefined,
      })
    ).toBe("");

    const db = dbBase();
    db.pessoas[0]!.telefone = "43999990001";
    detectarPendenciasPonto(db, { agora: "2026-08-03T15:00:00.000Z", idFactory: () => "p-lote" });
    const pendencia = db.pendencias_ponto!.find((p) => p.id === "p-lote")!;
    expect(pendencia.status).toBe("aguardando_aviso");

    const texto = montarTextosWhatsAppAvisosPontoLote(
      [
        pendencia,
        {
          ...pendencia,
          id: "p-vazio",
          texto_aviso: "   ",
          pessoa_id: "pes-x",
        },
        {
          ...pendencia,
          id: "p-2",
          pessoa_id: "pes-2",
          texto_aviso: "Aviso customizado da Bia.",
        },
      ],
      {
        pessoaPorId: (id) => {
          if (id === "pes-lider") return db.pessoas[0]!;
          if (id === "pes-2") return { nome: "Bia Extra", telefone: undefined };
          return undefined;
        },
        horasAviso: 24,
      }
    );

    expect(texto).toContain("—— João");
    expect(texto).toContain("43999990001");
    expect(texto).toContain("digital no relógio");
    expect(texto).toContain("—— Bia Extra ——");
    expect(texto).toContain("Aviso customizado da Bia.");
    expect(texto).toContain("==========");
    expect(texto).not.toContain("pes-x");
  });

  it("aprova várias propostas de ponto em lote", () => {
    const db = dbBase();
    db.escala_slots.push({
      id: "esc-2",
      pessoa_id: "pes-lider",
      data: "2026-07-31",
      hora_inicio: "11:00",
      hora_fim: "23:00",
      intervalo_min: 60,
      criado_em: "2026-07-01T00:00:00.000Z",
      atualizado_em: "2026-07-01T00:00:00.000Z",
    });
    let n = 0;
    detectarPendenciasPonto(db, {
      agora: "2026-08-03T15:00:00.000Z",
      idFactory: () => `p-${++n}`,
    });
    const ids = (db.pendencias_ponto ?? [])
      .filter((p) => p.status === "aguardando_aviso")
      .map((p) => p.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    marcarAvisosPontoEnviados(db, ids, { agora: "2026-08-03T16:00:00.000Z" });
    for (const id of ids) {
      const prop = registrarPropostaPonto(
        db,
        id,
        { entrada: "11:10", saida: "23:05", motivo: "Esqueci" },
        { agora: "2026-08-03T17:00:00.000Z" }
      );
      expect(prop.sucesso).toBe(true);
    }
    let bat = 0;
    const r = aprovarPendenciasPonto(db, ids, {
      agora: "2026-08-03T18:00:00.000Z",
      revisado_por: "dono",
      idFactory: () => `bat-${++bat}`,
    });
    expect(r.aprovadas).toBe(ids.length);
    expect(r.sucesso).toBe(true);
    expect(r.batidas).toBeGreaterThanOrEqual(ids.length * 2);
    for (const id of ids) {
      expect(db.pendencias_ponto!.find((p) => p.id === id)!.status).toBe("aprovada");
    }
  });

  it("recusa várias propostas de ponto em lote", () => {
    const db = dbBase();
    db.escala_slots.push({
      id: "esc-2",
      pessoa_id: "pes-lider",
      data: "2026-07-31",
      hora_inicio: "11:00",
      hora_fim: "23:00",
      intervalo_min: 60,
      criado_em: "2026-07-01T00:00:00.000Z",
      atualizado_em: "2026-07-01T00:00:00.000Z",
    });
    let n = 0;
    detectarPendenciasPonto(db, {
      agora: "2026-08-03T15:00:00.000Z",
      idFactory: () => `p-${++n}`,
    });
    const ids = (db.pendencias_ponto ?? [])
      .filter((p) => p.status === "aguardando_aviso")
      .map((p) => p.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    marcarAvisosPontoEnviados(db, ids, { agora: "2026-08-03T16:00:00.000Z" });
    for (const id of ids) {
      expect(
        registrarPropostaPonto(
          db,
          id,
          { entrada: "11:10", saida: "23:05" },
          { agora: "2026-08-03T17:00:00.000Z" }
        ).sucesso
      ).toBe(true);
    }
    const r = recusarPendenciasPonto(db, ids, {
      agora: "2026-08-03T18:00:00.000Z",
      revisado_por: "dono",
    });
    expect(r.recusadas).toBe(ids.length);
    expect(r.sucesso).toBe(true);
    for (const id of ids) {
      expect(db.pendencias_ponto!.find((p) => p.id === id)!.status).toBe("recusada");
    }
  });

  it("detecta só falta de saída", () => {
    const db = dbBase();
    importarBatidasPonto(
      db,
      [{ pessoa_id: "pes-lider", data: "2026-07-30", hora: "11:00", tipo: "entrada" }],
      { idFactory: () => "b-e" }
    );
    const r = detectarPendenciasPonto(db, { agora: "2026-08-03T15:00:00.000Z", idFactory: () => "p-s" });
    expect(r.criadas[0]!.tipo_falta).toBe("saida");
  });

  it("monta espelho cruzando escala × batidas", () => {
    const db = dbBase();
    importarBatidasPonto(
      db,
      [
        { pessoa_id: "pes-lider", data: "2026-07-30", hora: "11:05", tipo: "entrada" },
        { pessoa_id: "pes-lider", data: "2026-07-30", hora: "23:01", tipo: "saida" },
        { pessoa_id: "pes-lider", data: "2026-08-01", hora: "11:00", tipo: "entrada" },
      ],
      { idFactory: () => `b-${db.batidas_ponto!.length}` }
    );
    // 5 min dentro da tolerância padrão (10) → OK
    const julho = montarEspelhoPonto(db, { competencia: "2026-07" });
    expect(julho).toHaveLength(1);
    expect(julho[0]!.previsto_entrada).toBe("11:00");
    expect(julho[0]!.previsto_saida).toBe("23:00");
    expect(julho[0]!.entrada).toBe("11:05");
    expect(julho[0]!.saida).toBe("23:01");
    expect(julho[0]!.status).toBe("ok");

    // Sem tolerância → atraso
    const rigoroso = montarEspelhoPonto(db, { competencia: "2026-07", tolerancia_atraso_minutos: 0 });
    expect(rigoroso[0]!.status).toBe("atraso");
    expect(rigoroso[0]!.atraso_entrada_min).toBe(5);

    const agosto = montarEspelhoPonto(db, { competencia: "2026-08" });
    expect(agosto).toHaveLength(1);
    expect(agosto[0]!.status).toBe("sem_escala");
  });

  it("lista plantão sem digital no espelho", () => {
    const db = dbBase();
    const dias = montarEspelhoPonto(db, { competencia: "2026-07" });
    expect(dias).toHaveLength(1);
    expect(dias[0]!.status).toBe("sem_batida");
    expect(dias[0]!.previsto_entrada).toBe("11:00");
  });

  it("resume contagens do espelho", () => {
    const db = dbBase();
    importarBatidasPonto(
      db,
      [
        { pessoa_id: "pes-lider", data: "2026-07-30", hora: "11:00", tipo: "entrada" },
        { pessoa_id: "pes-lider", data: "2026-07-30", hora: "23:00", tipo: "saida" },
      ],
      { idFactory: () => `b-${db.batidas_ponto!.length}` }
    );
    const resumo = resumirEspelhoPonto(montarEspelhoPonto(db, { competencia: "2026-07" }));
    expect(resumo.total).toBe(1);
    expect(resumo.ok).toBe(1);
    expect(resumo.sem_batida).toBe(0);
  });

  it("exporta CSV do espelho com cabeçalho e status", () => {
    const db = dbBase();
    const dias = montarEspelhoPonto(db, { competencia: "2026-07" });
    const csv = exportarEspelhoCsv(dias, () => "João");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Data;Pessoa;");
    expect(csv).toContain("Horas previstas");
    expect(csv).toContain("Saldo (h)");
    expect(csv).toContain("João");
    expect(csv).toContain("Sem digital");
  });

  it("exporta CSV das pendências de ponto", () => {
    const db = dbBase();
    detectarPendenciasPonto(db, { agora: "2026-08-03T15:00:00.000Z", idFactory: () => "p-csv" });
    const csv = exportarPendenciasPontoCsv(db.pendencias_ponto ?? [], () => "João");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Pessoa;Data;Tipo falta;Status");
    expect(csv).toContain("João");
    expect(csv).toContain("Aguardando aviso");
  });

  it("calcula duração e formata horas (inclui virada de noite)", () => {
    expect(duracaoMinutosEntreHoras("11:00", "23:00")).toBe(12 * 60);
    expect(duracaoMinutosEntreHoras("22:00", "06:00")).toBe(8 * 60);
    expect(formatarDuracaoHoras(750)).toBe("12:30");
    expect(formatarDuracaoHoras(undefined)).toBe("—");
    expect(formatarSaldoHoras(30)).toBe("+0:30");
    expect(formatarSaldoHoras(-75)).toBe("−1:15");
    expect(formatarSaldoHoras(0)).toBe("0:00");

    const db = dbBase();
    importarBatidasPonto(
      db,
      [
        { pessoa_id: "pes-lider", data: "2026-07-30", hora: "11:00", tipo: "entrada" },
        { pessoa_id: "pes-lider", data: "2026-07-30", hora: "23:00", tipo: "saida" },
      ],
      { idFactory: () => `b-${db.batidas_ponto!.length}` }
    );
    const dia = montarEspelhoPonto(db, { competencia: "2026-07" })[0]!;
    expect(dia.previsto_minutos).toBe(12 * 60);
    expect(dia.realizado_minutos).toBe(12 * 60);
    expect(dia.saldo_minutos).toBe(0);
    const resumo = resumirEspelhoPonto([dia]);
    expect(resumo.previsto_minutos).toBe(12 * 60);
    expect(resumo.realizado_minutos).toBe(12 * 60);
    expect(resumo.saldo_minutos).toBe(0);
  });

  it("calcula saldo positivo e negativo no espelho", () => {
    const db = dbBase();
    importarBatidasPonto(
      db,
      [
        { pessoa_id: "pes-lider", data: "2026-07-30", hora: "11:00", tipo: "entrada" },
        { pessoa_id: "pes-lider", data: "2026-07-30", hora: "23:30", tipo: "saida" },
      ],
      { idFactory: () => `b-${db.batidas_ponto!.length}` }
    );
    const extra = montarEspelhoPonto(db, { competencia: "2026-07" })[0]!;
    expect(extra.saldo_minutos).toBe(30);

    const dbFalta = dbBase();
    importarBatidasPonto(
      dbFalta,
      [
        { pessoa_id: "pes-lider", data: "2026-07-30", hora: "11:00", tipo: "entrada" },
        { pessoa_id: "pes-lider", data: "2026-07-30", hora: "22:00", tipo: "saida" },
      ],
      { idFactory: () => `b-${dbFalta.batidas_ponto!.length}` }
    );
    const falta = montarEspelhoPonto(dbFalta, { competencia: "2026-07" })[0]!;
    expect(falta.saldo_minutos).toBe(-60);
    expect(exportarEspelhoCsv([extra], () => "João")).toContain("+0:30");
  });

  it("filtra espelho por saldo positivo, negativo e zero", () => {
    const zero = montarEspelhoPonto(
      (() => {
        const db = dbBase();
        importarBatidasPonto(
          db,
          [
            { pessoa_id: "pes-lider", data: "2026-07-30", hora: "11:00", tipo: "entrada" },
            { pessoa_id: "pes-lider", data: "2026-07-30", hora: "23:00", tipo: "saida" },
          ],
          { idFactory: () => `b-${db.batidas_ponto!.length}` }
        );
        return db;
      })(),
      { competencia: "2026-07" }
    )[0]!;
    const mais = { ...zero, realizado_minutos: 12 * 60 + 30, saldo_minutos: 30 };
    const menos = { ...zero, realizado_minutos: 11 * 60, saldo_minutos: -60 };
    const dias = [zero, mais, menos];
    const resumo = resumirEspelhoPonto(dias);
    expect(resumo.saldo_positivo).toBe(1);
    expect(resumo.saldo_negativo).toBe(1);
    expect(resumo.saldo_zero).toBe(1);
    expect(filtrarEspelhoPonto(dias, "saldo_positivo")).toEqual([mais]);
    expect(filtrarEspelhoPonto(dias, "saldo_negativo")).toEqual([menos]);
    expect(filtrarEspelhoPonto(dias, "saldo_zero")).toEqual([zero]);
    expect(filtrarEspelhoPonto(dias, "ok").length).toBe(3);
  });

  it("filtra e resume pendências por ação", () => {
    const pendencias = [
      { id: "1", status: "aguardando_aviso" as const, data: "2026-08-03", pessoa_id: "p" },
      { id: "2", status: "aguardando_funcionario" as const, data: "2026-08-02", pessoa_id: "p" },
      { id: "3", status: "proposta" as const, data: "2026-08-01", pessoa_id: "p" },
      { id: "4", status: "aprovada" as const, data: "2026-07-30", pessoa_id: "p" },
    ];
    expect(filtrarPendenciasPonto(pendencias as never, "aviso").map((p) => p.id)).toEqual(["1"]);
    expect(filtrarPendenciasPonto(pendencias as never, "aguardando").map((p) => p.id)).toEqual(["2"]);
    expect(filtrarPendenciasPonto(pendencias as never, "proposta").map((p) => p.id)).toEqual(["3"]);
    expect(filtrarPendenciasPonto(pendencias as never, "abertas").map((p) => p.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(filtrarPendenciasPonto(pendencias as never, "todas")).toHaveLength(4);
    expect(
      filtrarPendenciasPonto(
        [
          ...pendencias,
          { id: "5", status: "proposta" as const, data: "2026-08-04", pessoa_id: "outra" },
        ] as never,
        "proposta",
        { pessoa_id: "outra" }
      ).map((p) => p.id)
    ).toEqual(["5"]);

    const resumo = resumirPendenciasPontoAbertas({
      pendencias_ponto: pendencias as never,
    });
    expect(resumo).toEqual({ total: 3, aviso: 1, aguardando: 1, proposta: 1 });
  });
});
