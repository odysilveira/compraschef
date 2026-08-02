import { describe, expect, it } from "vitest";
import { dataOfxParaIso, debitosDoExtrato, parseOfx } from "./extrato-ofx";
import { aplicarMatchesExtratoBoletos, sugerirMatchesExtratoBoletos } from "./conciliar-extrato";
import type { Boleto, DB } from "../types";

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
<MEMO>BOLETO FORNECEDOR X
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
    ...overrides,
  };
}

describe("extrato OFX", () => {
  it("parseia data e débitos", () => {
    expect(dataOfxParaIso("20260805120000")).toBe("2026-08-05");
    const r = parseOfx(OFX_MINIMO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linhas).toHaveLength(2);
    expect(debitosDoExtrato(r.linhas)).toHaveLength(1);
    expect(debitosDoExtrato(r.linhas)[0]?.valor).toBe(-150);
  });

  it("sugere match exato e concilia", () => {
    const db = {
      boletos: [boletoAguardando()],
      boleto_pagamentos_historico: [],
    } as unknown as DB;
    const parsed = parseOfx(OFX_MINIMO);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const sugestoes = sugerirMatchesExtratoBoletos(db, parsed.linhas);
    const comMatch = sugestoes.filter((s) => s.boleto_id);
    expect(comMatch).toHaveLength(1);
    expect(comMatch[0]?.confianca).toBe("exata");
    expect(comMatch[0]?.boleto_id).toBe("bol-4");

    const aplicado = aplicarMatchesExtratoBoletos(db, [
      { boleto_id: "bol-4", dataLiquidacao: "2026-08-05" },
    ]);
    expect(aplicado.conciliados).toBe(1);
    expect(db.boletos[0]?.status).toBe("pago");
  });
});
