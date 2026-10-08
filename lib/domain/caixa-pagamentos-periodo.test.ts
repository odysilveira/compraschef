import { describe, expect, it } from "vitest";
import type { Boleto } from "../types";
import {
  limitesMesCorrente,
  limitesProximosMeses,
  somarBoletosAPagarNoPeriodo,
} from "./caixa-pagamentos-periodo";

function bol(
  partial: Partial<Boleto> & Pick<Boleto, "id" | "valor" | "vencimento" | "status">
): Boleto {
  return {
    status_conferencia: "conferido",
    ...partial,
  };
}

describe("caixa-pagamentos-periodo", () => {
  it("limitesMesCorrente cobre o mês inteiro", () => {
    const { inicio, fim } = limitesMesCorrente(new Date(2026, 9, 7));
    expect(inicio).toBe("2026-10-01");
    expect(fim).toBe("2026-10-31");
  });

  it("limitesProximosMeses parte de hoje", () => {
    const { inicio, fim } = limitesProximosMeses(3, new Date(2026, 9, 7));
    expect(inicio).toBe("2026-10-07");
    expect(fim).toBe("2027-01-07");
  });

  it("só conta títulos da agenda (conferidos) no período", () => {
    const boletos: Boleto[] = [
      bol({ id: "1", valor: 100, vencimento: "2026-10-10", status: "liberado" }),
      bol({ id: "2", valor: 50, vencimento: "2026-10-20", status: "liberado" }),
      // travado sem conferência — aparece em "Travados", mas NÃO na agenda
      {
        id: "3",
        valor: 999,
        vencimento: "2026-10-12",
        status: "travado",
        status_conferencia: "aguardando_documento",
      },
      bol({ id: "4", valor: 80, vencimento: "2026-11-01", status: "liberado" }),
      bol({ id: "5", valor: 30, vencimento: "2026-10-03", status: "liberado" }),
      bol({ id: "6", valor: 20, vencimento: "2026-10-07", status: "liberado" }),
      bol({ id: "7", valor: 40, vencimento: "2026-10-15", status: "pago" }),
    ];
    const r = somarBoletosAPagarNoPeriodo(boletos, "2026-10-01", "2026-10-31", "2026-10-07");
    expect(r.quantidade).toBe(4);
    expect(r.total).toBe(200);
    expect(r.atrasados).toBe(1);
    expect(r.vencendoHoje).toBe(1);
    expect(r.aVencer).toBe(2);
  });

  it("inclui atrasado de mês anterior no caixa do mês corrente", () => {
    const boletos: Boleto[] = [
      bol({ id: "atr", valor: 120, vencimento: "2026-09-28", status: "liberado" }),
      bol({ id: "v1", valor: 10, vencimento: "2026-10-08", status: "liberado" }),
      bol({ id: "v2", valor: 20, vencimento: "2026-10-15", status: "liberado" }),
      bol({ id: "fut", valor: 500, vencimento: "2026-11-05", status: "liberado" }),
    ];
    const r = somarBoletosAPagarNoPeriodo(boletos, "2026-10-01", "2026-10-31", "2026-10-07");
    expect(r.quantidade).toBe(3);
    expect(r.total).toBe(150);
    expect(r.atrasados).toBe(1);
    expect(r.aVencer).toBe(2);
    expect(r.vencendoHoje).toBe(0);
  });

  it("período a partir de hoje também soma atrasados anteriores", () => {
    const boletos: Boleto[] = [
      bol({ id: "atr", valor: 120, vencimento: "2026-09-28", status: "liberado" }),
      bol({ id: "v1", valor: 10, vencimento: "2026-10-08", status: "liberado" }),
      bol({ id: "fut", valor: 500, vencimento: "2026-11-05", status: "liberado" }),
    ];
    const r = somarBoletosAPagarNoPeriodo(boletos, "2026-10-07", "2027-01-07", "2026-10-07");
    expect(r.quantidade).toBe(3);
    expect(r.total).toBe(630);
    expect(r.atrasados).toBe(1);
    expect(r.vencendoHoje).toBe(0);
    expect(r.aVencer).toBe(2);
  });

  it("período só no futuro não puxa atrasados de agora", () => {
    const boletos: Boleto[] = [
      bol({ id: "atr", valor: 120, vencimento: "2026-09-28", status: "liberado" }),
      bol({ id: "nov", valor: 50, vencimento: "2026-11-10", status: "liberado" }),
    ];
    const r = somarBoletosAPagarNoPeriodo(boletos, "2026-11-01", "2026-11-30", "2026-10-07");
    expect(r.quantidade).toBe(1);
    expect(r.total).toBe(50);
    expect(r.atrasados).toBe(0);
    expect(r.aVencer).toBe(1);
  });
});
