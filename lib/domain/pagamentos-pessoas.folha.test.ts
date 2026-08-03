import { describe, expect, it } from "vitest";
import type { DB, PessoaRH } from "../types";
import { gerarFolhaCltMes, vencimentoCompetencia } from "./pagamentos-pessoas";

function colaborador(overrides: Partial<PessoaRH> = {}): PessoaRH {
  return {
    id: "pes-g",
    nome: "Márcia",
    tipo: "colaborador",
    funcao: "gerente",
    salario: 4500,
    adiantamento_valor: 1800,
    tem_acesso_sistema: false,
    permissoes: {
      painel: false,
      recebimento: false,
      estoque: false,
      lista_compras: false,
      cotacoes: false,
      pedidos: false,
      financeiro: false,
      relatorios: false,
      cadastros: false,
      rh: false,
    },
    ativo: true,
    criado_em: "2026-08-01T12:00:00.000Z",
    atualizado_em: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

function dbBase(): DB {
  return {
    pessoas: [
      colaborador(),
      colaborador({ id: "pes-j", nome: "João", salario: 3200, adiantamento_valor: 1200 }),
      colaborador({ id: "pes-i", nome: "Carlos", tipo: "intermitente", salario: undefined, valor_hora: 12 }),
    ],
    pagamentos_pessoas: [
      {
        id: "pag-adi",
        pessoa_id: "pes-g",
        tipo: "adiantamento",
        competencia: "2026-08",
        vencimento: "2026-08-10",
        valor: 1800,
        status: "pago",
        criado_em: "2026-08-01T12:00:00.000Z",
        atualizado_em: "2026-08-01T12:00:00.000Z",
      },
    ],
    consumos_pessoas: [
      {
        id: "cons-1",
        pessoa_id: "pes-g",
        data: "2026-08-05",
        competencia: "2026-08",
        descricao: "Almoço",
        quantidade: 1,
        preco_unitario: 45,
        desconto_percentual: 20,
        valor_bruto: 45,
        valor_liquido: 36,
        status: "pendente",
        criado_em: "2026-08-05T12:00:00.000Z",
        atualizado_em: "2026-08-05T12:00:00.000Z",
      },
    ],
  } as unknown as DB;
}

describe("gerarFolhaCltMes", () => {
  it("calcula vencimento no último dia do mês", () => {
    expect(vencimentoCompetencia("2026-08")).toBe("2026-08-31");
    expect(vencimentoCompetencia("2026-02")).toBe("2026-02-28");
  });

  it("cria salário para CLT com descontos e não duplica", () => {
    const db = dbBase();
    const r = gerarFolhaCltMes(db, "2026-08", {
      agora: "2026-08-20T12:00:00.000Z",
      idFactory: () => `pag-${db.pagamentos_pessoas.length}`,
    });
    expect(r.sucesso).toBe(true);
    expect(r.criados).toBe(2);
    expect(r.pulados).toBe(0);

    const marcia = db.pagamentos_pessoas.find((p) => p.pessoa_id === "pes-g" && p.tipo === "salario")!;
    expect(marcia.competencia).toBe("2026-08");
    expect(marcia.valor_bruto).toBe(4500);
    expect(marcia.desconto_adiantamento).toBe(1800);
    expect(marcia.desconto_consumo).toBe(36);
    expect(marcia.valor).toBe(2664);
    expect(marcia.status).toBe("previsto");
    expect(db.consumos_pessoas[0]!.status).toBe("descontado");

    const deNovo = gerarFolhaCltMes(db, "2026-08");
    expect(deNovo.criados).toBe(0);
    expect(deNovo.pulados).toBe(2);
  });
});
