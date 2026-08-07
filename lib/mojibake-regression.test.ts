import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const arquivosInterfaceFase2 = [
  "app/(sistema)/estoque/reposicao/page.tsx",
  "components/cadastros/AbaCaixas.tsx",
  "components/operacao/CampoQuantidade.tsx",
  "components/scanner/CodeScanner.tsx",
  "components/shell/AppShell.tsx",
  "lib/format.test.ts",
  "lib/reposicao-path-estrutura.test.ts",
];

const sequenciasMojibake = [
  "\u00c3\u00a7",
  "\u00c3\u00a3",
  "\u00c3\u00a1",
  "\u00c3\u00a9",
  "\u00c3\u00aa",
  "\u00c3\u00b3",
  "\u00c3\u00ba",
  "\u00c3\u00ad",
  "\u00c3\u00b5",
  "\u00e2\u20ac",
  "\ufffd",
];

describe("codificacao UTF-8 da interface da Fase 2", () => {
  it("nao contem sequencias tipicas de mojibake nos textos da interface", () => {
    const ocorrencias = arquivosInterfaceFase2.flatMap((arquivo) => {
      const fonte = readFileSync(arquivo, "utf8");
      return sequenciasMojibake
        .filter((sequencia) => fonte.includes(sequencia))
        .map((sequencia) => `${arquivo}: U+${sequencia.split("").map((char) => char.charCodeAt(0).toString(16).padStart(4, "0")).join(" U+")}`);
    });

    expect(ocorrencias).toEqual([]);
  });
});
