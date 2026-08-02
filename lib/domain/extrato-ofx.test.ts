import { describe, expect, it } from "vitest";
import { dataOfxParaIso, debitosDoExtrato, parseOfx } from "./extrato-ofx";
import { aplicarMatchesExtrato, sugerirMatchesExtrato } from "./conciliar-extrato";
import type { Boleto, DB, PagamentoPessoa } from "../types";

const OFX_MINIMO = `
OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260805120000
<TRNAMT>-150.00
<FITID>ABC123
<MEMO>BOLETO FORNECEDOR X ITAU
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260806120000
<TRNAMT>-320.00
<FITID>RH1
<MEMO>PIX SALARIO BRADESCO
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260806120000
<TRNAMT>500.00
<FITID>CRED1
<MEMO>PIX RECEBIDO
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

function boletoAguardando(overrides: Partial<Boleto> = {}): Boleto {
  return {
    id: "bol-4",
    nota_id: "nota-1",
    valor: 150,
    vencimento: "2026-08-05",
    status: "aguardando_conciliacao",
    pagamento_data: "2026-08-05",
    pagamento_valor: 150,
    pagamento_banco_conta: "Itaú — conta corrente",
    ...overrides,
  };
}

function pagRhAguardando(overrides: Partial<PagamentoPessoa> = {}): PagamentoPessoa {
  return {
    id: "pagp-2",
    pessoa_id: "pes-1",
    tipo: "intermitente_periodo",
    valor: 320,
    vencimento: "2026-08-06",
    status: "aguardando_conciliacao",
    pagamento_data: "2026-08-06",
    pagamento_valor: 320,
    pagamento_banco_conta: "Bradesco — conta corrente",
    criado_em: "",
    atualizado_em: "",
    ...overrides,
  };
}

describe("extrato OFX", () => {
  it("parseia data e débitos", () => {
    expect(dataOfxParaIso("20260805120000")).toBe("2026-08-05");
    const r = parseOfx(OFX_MINIMO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linhas).toHaveLength(3);
    expect(debitosDoExtrato(r.linhas)).toHaveLength(2);
  });

  it("casa boleto e pagamento RH e concilia", () => {
    const db = {
      boletos: [boletoAguardando()],
      boleto_pagamentos_historico: [],
      pagamentos_pessoas: [pagRhAguardando()],
      pessoas: [{ id: "pes-1", nome: "Carlos Extra" }],
      fornecedores: [{ id: "forn-1", nome: "Fornecedor X" }],
      notas_fiscais: [{ id: "nota-1", fornecedor_id: "forn-1" }],
    } as unknown as DB;

    const parsed = parseOfx(OFX_MINIMO);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const sugestoes = sugerirMatchesExtrato(db, parsed.linhas);
    const comMatch = sugestoes.filter((s) => s.alvo_id);
    expect(comMatch.length).toBeGreaterThanOrEqual(2);
    expect(comMatch.some((s) => s.alvo === "boleto" && s.alvo_id === "bol-4")).toBe(true);
    expect(comMatch.some((s) => s.alvo === "rh" && s.alvo_id === "pagp-2")).toBe(true);

    const aplicado = aplicarMatchesExtrato(db, [
      { alvo: "boleto", alvo_id: "bol-4", dataLiquidacao: "2026-08-05" },
      { alvo: "rh", alvo_id: "pagp-2", dataLiquidacao: "2026-08-06" },
    ]);
    expect(aplicado.conciliados).toBe(2);
    expect(db.boletos[0]?.status).toBe("pago");
    expect(db.pagamentos_pessoas[0]?.status).toBe("pago");
  });
});
