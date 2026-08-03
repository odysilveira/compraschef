import { describe, expect, it } from "vitest";
import type { DB, PessoaRH } from "../types";
import {
  aprovarPendenciaPonto,
  detectarPendenciasPonto,
  importarBatidasPonto,
  marcarAvisoPontoEnviado,
  montarEspelhoPonto,
  montarTextoAvisoPontoWhatsApp,
  registrarPropostaPonto,
  resumirEspelhoPonto,
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
});
