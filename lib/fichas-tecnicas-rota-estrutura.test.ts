import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("estrutura de rota de fichas técnicas", () => {
  it("garante que o catálogo está em app/(sistema)/fichas-tecnicas/page.tsx como arquivo", () => {
    const caminhoCatalogo = path.resolve(process.cwd(), "app/(sistema)/fichas-tecnicas/page.tsx");

    expect(existsSync(caminhoCatalogo)).toBe(true);
    expect(statSync(caminhoCatalogo).isFile()).toBe(true);
  });
});