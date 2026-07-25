import { describe, expect, it } from "vitest";
import { cnpjBR } from "./format";

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
