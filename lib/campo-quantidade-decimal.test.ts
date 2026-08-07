import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const fonte = readFileSync(path.join(process.cwd(), "components", "operacao", "CampoQuantidade.tsx"), "utf8");

describe("CampoQuantidade decimal", () => {
  it("mantem digitacao direta decimal e permite configurar casas dos botoes", () => {
    expect(fonte).toContain('step="any"');
    expect(fonte).toContain("casasDecimais");
    expect(fonte).toContain("10 ** casasDecimais");
    expect(fonte).toContain("Number(e.target.value)");
  });
});
