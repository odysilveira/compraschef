import { describe, expect, it } from "vitest";
import { cnpjBR, dataHoraBR, diasAte, rotuloValidade } from "./format";

describe("formatação de CNPJ", () => {
  it("formata CNPJ com 14 dígitos para o padrão visual brasileiro", () => {
    expect(cnpjBR("12345678000195")).toBe("12.345.678/0001-95");
  });

  it("aceita entrada já pontuada e normaliza para o mesmo formato visual", () => {
    expect(cnpjBR("12.345.678/0001-95")).toBe("12.345.678/0001-95");
  });

  it("retorna traço quando o valor não possui 14 dígitos", () => {
    expect(cnpjBR("123")).toBe("—");
    expect(cnpjBR(undefined)).toBe("—");
  });
});

describe("formatação de data e hora", () => {
  it("formata timestamp ISO em padrão brasileiro amigável", () => {
    expect(dataHoraBR("2026-08-04T18:37:30.235Z")).toMatch(/04\/08\/2026 \d{2}:37/);
  });

  it("retorna traço para data ausente ou inválida", () => {
    expect(dataHoraBR(undefined)).toBe("—");
    expect(dataHoraBR("data-invalida")).toBe("—");
  });
});

describe("diasAte / rotuloValidade", () => {
  const ancora = new Date(2026, 9, 13, 15, 30, 0); // 13/10/2026 local

  it("conta dias civis sem depender do horário", () => {
    expect(diasAte("2026-10-13", ancora)).toBe(0);
    expect(diasAte("2026-10-14", ancora)).toBe(1);
    expect(diasAte("2026-10-12", ancora)).toBe(-1);
  });

  it("rótulos amigáveis", () => {
    expect(rotuloValidade("2026-10-14", ancora)).toBe("vence amanhã");
    expect(rotuloValidade("2026-10-12", ancora)).toBe("venceu ontem");
    expect(rotuloValidade("2026-10-11", ancora)).toBe("venceu há 2 dias");
  });
});
