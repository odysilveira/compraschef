import { describe, expect, it } from "vitest";
import { dataCsvParaIso, parseCsvExtrato, valorCsvParaNumero } from "./extrato-csv";
import { importarExtratoCsv } from "./extrato-persistido";
import type { DB } from "../types";

const CSV_MINIMO = `data;valor;descricao
05/08/2026;-150,00;BOLETO FORNECEDOR X
06/08/2026;-320,00;PIX SALARIO
06/08/2026;500,00;PIX RECEBIDO
`;

describe("extrato CSV", () => {
  it("parseia data e valor BR", () => {
    expect(dataCsvParaIso("05/08/2026")).toBe("2026-08-05");
    expect(valorCsvParaNumero("-150,00")).toBe(-150);
    expect(valorCsvParaNumero("(150,00)")).toBe(-150);
  });

  it("importa CSV no DB", () => {
    const parsed = parseCsvExtrato(CSV_MINIMO);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.linhas).toHaveLength(3);

    const db = { extrato_importacoes: [], extrato_linhas: [] } as unknown as DB;
    let n = 0;
    const r = importarExtratoCsv(db, CSV_MINIMO, {
      arquivo_nome: "demo.csv",
      idFactory: () => `c-${++n}`,
    });
    expect(r.sucesso).toBe(true);
    expect(r.criadas).toBe(3);
    expect(db.extrato_importacoes?.[0]?.origem).toBe("csv");
  });
});
