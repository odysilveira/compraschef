import { describe, expect, it } from "vitest";
import {
  AVISO_REPASSE_INTEGRAL_PRESTADOR,
  LIMITE_SERVICOS_SEMANA_PRESTADOR_EVENTUAL,
  MARCA_LIMITE_SEMANA_OVERRIDE,
  anexarObservacaoOverride,
  avaliarLimiteSemanaPrestador,
  calcularValorHoraRepasseIntegral,
  contarSlotsPessoaNaSemana,
  ehPrestadorEventual,
  limitesSemanaIso,
  listarPrestadoresNoLimiteSemana,
  pagamentoEhRepasseIntegral,
  precisaDadosPagamentoHoraPrestador,
  textoOverrideLimiteSemana,
  tipoPagamentoPadraoPrestadorEventual,
} from "./prestador-eventual";

describe("prestador eventual", () => {
  it("reconhece tipo e repasse integral", () => {
    expect(ehPrestadorEventual("prestador_eventual")).toBe(true);
    expect(ehPrestadorEventual("intermitente")).toBe(false);
    expect(ehPrestadorEventual({ tipo: "prestador_eventual" })).toBe(true);
    expect(pagamentoEhRepasseIntegral({ tipo: "prestador_eventual" })).toBe(true);
    expect(pagamentoEhRepasseIntegral({ tipo: "entregador" })).toBe(false);
    expect(tipoPagamentoPadraoPrestadorEventual()).toBe("freela_hora");
    expect(precisaDadosPagamentoHoraPrestador("prestador_eventual")).toBe(true);
    expect(LIMITE_SERVICOS_SEMANA_PRESTADOR_EVENTUAL).toBe(2);
    expect(AVISO_REPASSE_INTEGRAL_PRESTADOR).toMatch(/repasse|integral|retenção/i);
  });

  it("calcula hora × quantidade sem desconto", () => {
    expect(calcularValorHoraRepasseIntegral(25, 4)).toEqual({ valor_bruto: 100, valor: 100 });
    expect(calcularValorHoraRepasseIntegral(12.5, 5)).toEqual({ valor_bruto: 62.5, valor: 62.5 });
    expect(calcularValorHoraRepasseIntegral(0, 4)).toBeNull();
    expect(calcularValorHoraRepasseIntegral(25, 0)).toBeNull();
  });

  it("semana operacional segunda–domingo e limite 2×", () => {
    // 2026-08-05 é quarta
    expect(limitesSemanaIso("2026-08-05")).toEqual({
      inicio: "2026-08-03",
      fim: "2026-08-09",
    });
    // domingo pertence à semana que começou na segunda anterior
    expect(limitesSemanaIso("2026-08-09")).toEqual({
      inicio: "2026-08-03",
      fim: "2026-08-09",
    });

    const slots = [
      { id: "a", pessoa_id: "pes-1", data: "2026-08-03" },
      { id: "b", pessoa_id: "pes-1", data: "2026-08-05" },
      { id: "c", pessoa_id: "pes-1", data: "2026-08-10" },
      { id: "d", pessoa_id: "pes-2", data: "2026-08-04" },
    ];
    expect(contarSlotsPessoaNaSemana(slots, "pes-1", "2026-08-05")).toBe(2);
    expect(contarSlotsPessoaNaSemana(slots, "pes-1", "2026-08-05", { excluirSlotId: "a" })).toBe(1);

    const ok = avaliarLimiteSemanaPrestador(
      { tipo: "prestador_eventual" },
      slots.slice(0, 1),
      "pes-1",
      "2026-08-05"
    );
    expect(ok.aplica).toBe(true);
    expect(ok.excede).toBe(false);
    expect(ok.count).toBe(1);

    const limite = avaliarLimiteSemanaPrestador(
      { tipo: "prestador_eventual" },
      slots,
      "pes-1",
      "2026-08-05"
    );
    expect(limite.excede).toBe(true);
    expect(limite.count).toBe(2);

    expect(
      avaliarLimiteSemanaPrestador({ tipo: "intermitente" }, slots, "pes-1", "2026-08-05").aplica
    ).toBe(false);

    const texto = textoOverrideLimiteSemana(limite);
    expect(texto).toContain(MARCA_LIMITE_SEMANA_OVERRIDE);
    expect(texto).toContain("3>2");
    expect(anexarObservacaoOverride("nota", texto)).toContain("nota");
    expect(anexarObservacaoOverride(texto, "outro")).toBe(texto);

    const lista = listarPrestadoresNoLimiteSemana(
      {
        pessoas: [
          {
            id: "pes-1",
            nome: "Diego",
            tipo: "prestador_eventual",
            ativo: true,
          },
          {
            id: "pes-2",
            nome: "Outro",
            tipo: "intermitente",
            ativo: true,
          },
        ],
        escala_slots: slots,
      } as never,
      "2026-08-05"
    );
    expect(lista).toHaveLength(1);
    expect(lista[0]?.pessoa_id).toBe("pes-1");
    expect(lista[0]?.count).toBe(2);
  });
});
