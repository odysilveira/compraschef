import { describe, expect, it } from "vitest";
import type { DB } from "../types";
import {
  CATALOGO_PUBLICACOES_RH,
  antecedenciaMinimaDoDb,
  confirmarNorma,
  ignorarNorma,
  normasPendentes,
  verificarAtualizacoesNormas,
} from "./normas-rh";
import { antecedenciaMinimaOk, criarSlot } from "./escala";

function dbVazio(): DB {
  return {
    pessoas: [
      {
        id: "pes-inter-1",
        nome: "Carlos Extra",
        tipo: "intermitente",
        funcao: "salao",
        valor_hora: 12.5,
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
      },
    ],
    escala_slots: [],
    convocacoes: [],
    pagamentos_pessoas: [],
    normas_rh: [],
    config_rh: { antecedencia_minima_dias: 3, atualizado_em: "2026-08-01T12:00:00.000Z" },
  } as unknown as DB;
}

describe("normas-rh", () => {
  it("verifica catálogo sem duplicar chave_fonte", () => {
    const db = dbVazio();
    const r1 = verificarAtualizacoesNormas(db, {
      agora: "2026-08-03T12:00:00.000Z",
      idFactory: () => `n-${db.normas_rh!.length}`,
    });
    expect(r1.sucesso).toBe(true);
    expect(r1.novas.length).toBe(CATALOGO_PUBLICACOES_RH.length);
    expect(normasPendentes(db)).toHaveLength(CATALOGO_PUBLICACOES_RH.length);

    const r2 = verificarAtualizacoesNormas(db);
    expect(r2.novas).toHaveLength(0);
    expect(db.normas_rh).toHaveLength(CATALOGO_PUBLICACOES_RH.length);
  });

  it("confirmar aplica antecedência e escala passa a usar o valor", () => {
    const db = dbVazio();
    verificarAtualizacoesNormas(db, {
      agora: "2026-08-03T12:00:00.000Z",
      catalogo: [
        {
          chave_fonte: "teste-4d",
          titulo: "Teste 4 dias",
          resumo: "sobe para 4",
          fonte: "demo",
          publicado_em: "2026-08-01",
          relevancia: "alta",
          parametro: "antecedencia_minima_dias",
          valor_proposto: 4,
        },
      ],
      idFactory: () => "norma-4d",
    });

    const conf = confirmarNorma(db, "norma-4d", { revisado_por: "dono" });
    expect(conf.sucesso).toBe(true);
    expect(antecedenciaMinimaDoDb(db)).toBe(4);

    expect(antecedenciaMinimaOk("2026-08-01", "2026-08-04", antecedenciaMinimaDoDb(db))).toBe(false);
    expect(antecedenciaMinimaOk("2026-08-01", "2026-08-05", antecedenciaMinimaDoDb(db))).toBe(true);

    const slot = criarSlot(
      db,
      {
        pessoa_id: "pes-inter-1",
        data: "2026-08-04",
        hora_inicio: "18:00",
        hora_fim: "23:00",
        intervalo_min: 30,
      },
      { id: "esc-1", convocacaoId: "conv-1", agora: "2026-08-01T12:00:00.000Z" }
    );
    expect(slot.sucesso).toBe(true);
    expect(slot.convocacao?.antecedencia_ok).toBe(false);
    expect(slot.avisos.some((a) => a.includes("4 dias"))).toBe(true);
  });

  it("ignorar não altera config", () => {
    const db = dbVazio();
    verificarAtualizacoesNormas(db, {
      catalogo: [
        {
          chave_fonte: "teste-ignorar",
          titulo: "Ignorar",
          resumo: "x",
          fonte: "demo",
          publicado_em: "2026-08-01",
          relevancia: "baixa",
          parametro: "antecedencia_minima_dias",
          valor_proposto: 10,
        },
      ],
      idFactory: () => "norma-ign",
    });
    const r = ignorarNorma(db, "norma-ign");
    expect(r.sucesso).toBe(true);
    expect(antecedenciaMinimaDoDb(db)).toBe(3);
    expect(db.normas_rh![0]!.status).toBe("ignorada");
  });
});
