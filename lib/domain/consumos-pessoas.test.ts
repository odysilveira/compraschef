import { describe, expect, it } from "vitest";
import type { DB, PagamentoPessoa, PessoaRH } from "../types";
import {
  aplicarDescontosNoPagamento,
  calcularLinhaConsumo,
  criarConsumoPessoa,
  previewFechamentoIntermitente,
  previewFechamentoSalario,
  totalAdiantamentoNaCompetencia,
  validarAdiantamento,
} from "./consumos-pessoas";

function pessoaBase(overrides: Partial<PessoaRH> = {}): PessoaRH {
  return {
    id: "pes-1",
    nome: "Márcia",
    tipo: "colaborador",
    funcao: "gerente",
    salario: 4000,
    adiantamento_valor: 1500,
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

function dbVazio(pessoa: PessoaRH = pessoaBase()): DB {
  return {
    perfis: [],
    pessoas: [pessoa],
    pagamentos_pessoas: [],
    consumos_pessoas: [],
    unidades: [],
    fornecedores: [],
    categorias_produtos: [],
    produtos: [],
    produto_codigos_barras: [],
    fornecedor_produtos: [],
    locais: [],
    caixas: [],
    lotes_estoque: [],
    alocacoes_caixa: [],
    listas_compras: [],
    lista_itens: [],
    cotacoes: [],
    cotacao_itens: [],
    pedidos: [],
    pedido_itens: [],
    notas_fiscais: [],
    boletos: [],
    boleto_pagamentos_historico: [],
    contas_pagar: [],
    conta_pagar_historico: [],
    documentos_boleto: [],
    recebimentos: [],
  } as unknown as DB;
}

describe("validarAdiantamento", () => {
  it("bloqueia acima de 50% do salário", () => {
    const r = validarAdiantamento(4000, 2000.01);
    expect(r.ok).toBe(false);
    expect(r.teto).toBe(2000);
  });

  it("aceita até 50%", () => {
    expect(validarAdiantamento(4000, 2000).ok).toBe(true);
  });
});

describe("calcularLinhaConsumo", () => {
  it("aplica 20% de desconto", () => {
    const r = calcularLinhaConsumo(2, 50);
    expect(r.valor_bruto).toBe(100);
    expect(r.valor_liquido).toBe(80);
  });
});

describe("fechamento salário e intermitente", () => {
  it("desconta adiantamento e consumo no salário", () => {
    const db = dbVazio();
    criarConsumoPessoa(db, {
      pessoa_id: "pes-1",
      data: "2026-08-10",
      descricao: "Almoço",
      quantidade: 1,
      preco_unitario: 50,
    }, { id: "cons-1" });
    db.pagamentos_pessoas.push({
      id: "pag-adi",
      pessoa_id: "pes-1",
      tipo: "adiantamento",
      competencia: "2026-08",
      vencimento: "2026-08-15",
      valor: 1500,
      status: "pago",
      criado_em: "2026-08-01T12:00:00.000Z",
      atualizado_em: "2026-08-01T12:00:00.000Z",
    });
    expect(totalAdiantamentoNaCompetencia(db, "pes-1", "2026-08")).toBe(1500);
    const preview = previewFechamentoSalario(db, "pes-1", "2026-08", 4000);
    expect(preview.desconto_consumo).toBe(40);
    expect(preview.desconto_adiantamento).toBe(1500);
    expect(preview.valor_liquido).toBe(2460);
  });

  it("desconta consumo no pagamento diário do intermitente", () => {
    const db = dbVazio(pessoaBase({ id: "pes-i", tipo: "intermitente", salario: undefined }));
    criarConsumoPessoa(db, {
      pessoa_id: "pes-i",
      data: "2026-08-02",
      descricao: "Refeição",
      quantidade: 1,
      preco_unitario: 40,
    }, { id: "cons-i" });
    const preview = previewFechamentoIntermitente(db, "pes-i", 100);
    expect(preview.desconto_consumo).toBe(32);
    expect(preview.valor_liquido).toBe(68);
  });

  it("aplica descontos e marca consumos", () => {
    const db = dbVazio();
    criarConsumoPessoa(db, {
      pessoa_id: "pes-1",
      data: "2026-08-10",
      descricao: "Jantar",
      quantidade: 1,
      preco_unitario: 50,
    }, { id: "cons-2" });
    const pag: PagamentoPessoa = {
      id: "pag-sal",
      pessoa_id: "pes-1",
      tipo: "salario",
      competencia: "2026-08",
      vencimento: "2026-08-30",
      valor: 4000,
      valor_bruto: 4000,
      status: "previsto",
      criado_em: "2026-08-01T12:00:00.000Z",
      atualizado_em: "2026-08-01T12:00:00.000Z",
    };
    db.pagamentos_pessoas.push(pag);
    const r = aplicarDescontosNoPagamento(db, "pag-sal");
    expect(r.sucesso).toBe(true);
    expect(db.pagamentos_pessoas[0].valor).toBe(3960);
    expect(db.pagamentos_pessoas[0].desconto_consumo).toBe(40);
    expect(db.consumos_pessoas[0].status).toBe("descontado");
    expect(db.consumos_pessoas[0].pagamento_id).toBe("pag-sal");
  });
});
