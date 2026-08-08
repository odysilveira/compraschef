import { describe, expect, it } from "vitest";
import {
  aplicarMatchesLinhasPersistidas,
  contarDebitosExtratoAbertos,
  filtrarLinhasExtrato,
  ignorarLinhasExtrato,
  importarExtratoOfx,
  sugerirMatchesLinhasPersistidas,
} from "./extrato-persistido";
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

function dbBase(): DB {
  return {
    boletos: [boletoAguardando()],
    boleto_pagamentos_historico: [],
    pagamentos_pessoas: [pagRhAguardando()],
    pessoas: [{ id: "pes-1", nome: "Carlos Extra" }],
    fornecedores: [{ id: "forn-1", nome: "Fornecedor X" }],
    notas_fiscais: [{ id: "nota-1", fornecedor_id: "forn-1" }],
    extrato_importacoes: [],
    extrato_linhas: [],
  } as unknown as DB;
}

describe("extrato persistido", () => {
  it("importa OFX, deduplica FITID e sugere matches", () => {
    const db = dbBase();
    let n = 0;
    const idFactory = () => `id-${++n}`;

    const r1 = importarExtratoOfx(db, OFX_MINIMO, {
      arquivo_nome: "demo.ofx",
      conta_bancaria_id: "cbanc-itau",
      idFactory,
    });
    expect(r1.sucesso).toBe(true);
    expect(r1.criadas).toBe(3);
    expect(db.extrato_importacoes).toHaveLength(1);
    expect(contarDebitosExtratoAbertos(db)).toBe(2);

    const r2 = importarExtratoOfx(db, OFX_MINIMO, {
      arquivo_nome: "demo.ofx",
      conta_bancaria_id: "cbanc-itau",
      idFactory,
    });
    expect(r2.sucesso).toBe(false);
    expect(r2.ignoradas_duplicadas).toBe(3);

    const sugestoes = sugerirMatchesLinhasPersistidas(db);
    expect(sugestoes.filter((s) => s.alvo_id).length).toBeGreaterThanOrEqual(2);
  });

  it("aplica match persistido e marca linha conciliada", () => {
    const db = dbBase();
    let n = 0;
    importarExtratoOfx(db, OFX_MINIMO, {
      arquivo_nome: "demo.ofx",
      idFactory: () => `id-${++n}`,
    });
    const sugestoes = sugerirMatchesLinhasPersistidas(db);
    const matches = sugestoes
      .filter((s) => s.alvo && s.alvo_id)
      .map((s) => ({
        extrato_linha_id: s.linha.id,
        alvo: s.alvo!,
        alvo_id: s.alvo_id!,
      }));
    const aplicado = aplicarMatchesLinhasPersistidas(db, matches);
    expect(aplicado.conciliados).toBe(2);
    expect(db.boletos[0]?.status).toBe("pago");
    expect(db.pagamentos_pessoas[0]?.status).toBe("pago");
    expect(filtrarLinhasExtrato(db.extrato_linhas ?? [], "conciliadas")).toHaveLength(2);
    expect(contarDebitosExtratoAbertos(db)).toBe(0);
  });

  it("ignora linha aberta sem tocar no título", () => {
    const db = dbBase();
    let n = 0;
    importarExtratoOfx(db, OFX_MINIMO, {
      arquivo_nome: "demo.ofx",
      idFactory: () => `id-${++n}`,
    });
    const debito = (db.extrato_linhas ?? []).find((l) => l.fitid === "ABC123");
    expect(debito).toBeTruthy();
    const r = ignorarLinhasExtrato(db, [debito!.id]);
    expect(r.ignoradas).toBe(1);
    expect(debito!.status).toBe("ignorada");
    expect(db.boletos[0]?.status).toBe("aguardando_conciliacao");
  });
});
