import { describe, expect, it } from "vitest";
import {
  TAMANHO_MAX_CONTRATO_BYTES,
  formatarTamanhoArquivo,
  tipoArquivoContratoAceito,
  validarArquivoContrato,
} from "./contrato-pessoa";

describe("contrato-pessoa", () => {
  it("aceita PDF e imagens por mime ou extensão", () => {
    expect(tipoArquivoContratoAceito("application/pdf", "c.pdf")).toBe(true);
    expect(tipoArquivoContratoAceito("image/jpeg", "foto.jpg")).toBe(true);
    expect(tipoArquivoContratoAceito("", "scan.PNG")).toBe(true);
    expect(tipoArquivoContratoAceito("text/plain", "x.txt")).toBe(false);
  });

  it("valida tamanho e tipo", () => {
    expect(validarArquivoContrato({ name: "ok.pdf", type: "application/pdf", size: 100 }).ok).toBe(true);
    expect(validarArquivoContrato({ name: "x.doc", type: "application/msword", size: 100 }).ok).toBe(false);
    expect(
      validarArquivoContrato({
        name: "grande.pdf",
        type: "application/pdf",
        size: TAMANHO_MAX_CONTRATO_BYTES + 1,
      }).ok
    ).toBe(false);
  });

  it("formata tamanho legível", () => {
    expect(formatarTamanhoArquivo(500)).toBe("500 B");
    expect(formatarTamanhoArquivo(2048)).toBe("2 KB");
    expect(formatarTamanhoArquivo(TAMANHO_MAX_CONTRATO_BYTES)).toContain("MB");
  });
});
