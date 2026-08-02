import { describe, expect, it } from "vitest";
import {
  contaPadraoOrigem,
  opcoesOrigemPagamento,
  rotuloContaBancaria,
  temContasCadastradas,
} from "./contas-pagamento";
import type { ContaBancariaRestaurante, DB } from "../types";

function conta(parcial: Partial<ContaBancariaRestaurante> & Pick<ContaBancariaRestaurante, "id" | "banco">): ContaBancariaRestaurante {
  return {
    tipo: "corrente",
    ativa: true,
    criado_em: "2026-08-01T12:00:00.000Z",
    atualizado_em: "2026-08-01T12:00:00.000Z",
    ...parcial,
  };
}

describe("contas-pagamento", () => {
  it("monta rótulo com tipo ou apelido", () => {
    expect(rotuloContaBancaria(conta({ id: "1", banco: "Itaú" }))).toBe("Itaú — conta corrente");
    expect(rotuloContaBancaria(conta({ id: "2", banco: "Bradesco", apelido: "conta principal" }))).toBe(
      "Bradesco — conta principal"
    );
  });

  it("usa contas cadastradas antes dos atalhos genéricos", () => {
    const db = {
      contas_bancarias: [
        conta({ id: "c2", banco: "Nubank", tipo: "pagamento", padrao: false }),
        conta({ id: "c1", banco: "Itaú", padrao: true }),
        conta({ id: "c3", banco: "Caixa", ativa: false }),
      ],
    } as Pick<DB, "contas_bancarias">;

    expect(temContasCadastradas(db)).toBe(true);
    expect(opcoesOrigemPagamento(db)).toEqual(["Itaú — conta corrente", "Nubank — conta pagamento"]);
    expect(contaPadraoOrigem(db)).toBe("Itaú — conta corrente");
  });

  it("cai nos atalhos quando não há conta ativa", () => {
    const db = { contas_bancarias: [] } as Pick<DB, "contas_bancarias">;
    expect(temContasCadastradas(db)).toBe(false);
    expect(opcoesOrigemPagamento(db)[0]).toBe("Itaú — conta corrente");
  });
});
