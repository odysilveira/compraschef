import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const fonte = readFileSync(path.join(process.cwd(), "components", "scanner", "CodeScanner.tsx"), "utf8");

describe("CodeScanner com previa segura", () => {
  it("botao OK manual usa onManual e nao simula leitura fisica", () => {
    expect(fonte).toContain("onManual?: (codigo: string) => void");
    expect(fonte).toContain("(onManual ?? onLeitura)(codigo)");
  });

  it("aviso da camera explica que digitacao apenas localiza e aceita leitor QR USB ou Bluetooth", () => {
    expect(fonte).toContain("Este navegador não lê códigos pela câmera.");
    expect(fonte).toContain("Use o leitor QR USB ou Bluetooth.");
    expect(fonte).toContain("A digitação manual permite apenas localizar e conferir o box");
    expect(fonte).toContain("a confirmação da operação exige leitura física");
    expect(fonte).toContain("leitor QR USB ou Bluetooth aqui");
    expect(fonte).not.toContain("Use o leitor Bluetooth.");
  });
});
