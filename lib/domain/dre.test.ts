import { describe, expect, it } from "vitest";
import { seedDB } from "../data/seed";
import type { DB, FechamentoDia } from "../types";
import {
  calcularDrePeriodo,
  depreciacaoMensalEquipamento,
  equipamentoAtivoNoMes,
  memorizarContaDre,
  sugerirContaDre,
} from "./dre";

describe("dre", () => {
  it("calcula depreciação linear mensal", () => {
    expect(
      depreciacaoMensalEquipamento({
        id: "e1",
        nome: "Forno",
        valor_aquisicao: 60000,
        data_inicio: "2025-01-01",
        vida_util_meses: 60,
        ativo: true,
      })
    ).toBe(1000);
  });

  it("respeita início e fim da vida útil", () => {
    const eq = {
      id: "e1",
      nome: "Forno",
      valor_aquisicao: 12000,
      data_inicio: "2025-01-15",
      vida_util_meses: 12,
      ativo: true,
    };
    expect(equipamentoAtivoNoMes(eq, "2024-12")).toBe(false);
    expect(equipamentoAtivoNoMes(eq, "2025-01")).toBe(true);
    expect(equipamentoAtivoNoMes(eq, "2025-12")).toBe(true);
    expect(equipamentoAtivoNoMes(eq, "2026-01")).toBe(false);
  });

  it("sugere e memoriza conta DRE no produto e vínculo", () => {
    const db = structuredClone(seedDB) as DB;
    const produto = db.produtos.find((p) => p.id === "prod-file")!;
    // Sem memória: sugere pelo nome (filé mignon → carnes).
    expect(sugerirContaDre(db, { produtoId: produto.id })).toBe("dre-cv-carnes-moida");
    memorizarContaDre(db, {
      produtoId: produto.id,
      fornecedorId: "forn-frigorifico",
      contaDreId: "dre-cv-carnes-costela",
    });
    expect(produto.conta_dre_id).toBe("dre-cv-carnes-costela");
    expect(
      sugerirContaDre(db, { produtoId: produto.id, fornecedorId: "forn-frigorifico" })
    ).toBe("dre-cv-carnes-costela");
  });

  it("agrega DRE do mês com fechamento e depreciação", () => {
    const db = structuredClone(seedDB) as DB;
    const fechamento: FechamentoDia = {
      id: "fd-1",
      data: "2026-03-10",
      vendas: [
        {
          id: "v1",
          receita_id: "r1",
          nome: "Penne",
          canal: "balcao",
          quantidade: 10,
          preco_unitario: 40,
          custo_unitario: 12,
          taxa_percentual: 0,
          taxa_fixa: 0,
        },
        {
          id: "v2",
          receita_id: "r1",
          nome: "Penne",
          canal: "ifood",
          quantidade: 5,
          preco_unitario: 45,
          custo_unitario: 12,
          taxa_percentual: 25,
          taxa_fixa: 0,
        },
      ],
      mao_obra: [
        { id: "m1", pessoa_id: "p1", nome: "Ana", tipo: "fixo_rateado", valor: 200 },
        { id: "m2", pessoa_id: "p2", nome: "Freela", tipo: "freela", valor: 150 },
      ],
      custo_motoboy: 80,
      dias_rateio_folha: 30,
      criado_em: "2026-03-10T12:00:00.000Z",
      atualizado_em: "2026-03-10T12:00:00.000Z",
    };
    db.fechamentos_dia = [fechamento];
    db.equipamentos = [
      {
        id: "eq-1",
        nome: "Forno",
        valor_aquisicao: 60000,
        data_inicio: "2025-01-01",
        vida_util_meses: 60,
        conta_dre_id: "dre-op-depreciacao",
        ativo: true,
      },
    ];

    const dre = calcularDrePeriodo(db, "2026-03");
    expect(dre.receita_bruta).toBe(625); // 400 + 225
    expect(dre.deducoes).toBeGreaterThan(0); // taxas ifood + motoboy
    expect(dre.depreciacao_mes).toBe(1000);
    expect(dre.fixo_operacao).toBeGreaterThanOrEqual(1000);
    expect(dre.pessoal_variavel).toBe(150);
    expect(dre.fixo_pessoal).toBe(200);
    expect(dre.cmv_fichas).toBe(180); // 10*12 + 5*12
  });

  it("separa CMV compras food de limpeza (entra_no_cmv)", () => {
    const db = structuredClone(seedDB) as DB;
    db.produtos.push(
      {
        id: "prod-acucar",
        nome: "ACUCAR REFINADO",
        tipo: "comprado",
        unidade_uso_id: "un-kg",
        fator_conversao: 1,
        estoque_minimo: 0,
        custo_unitario: 5,
        entra_no_cmv: true,
        ativo: true,
      },
      {
        id: "prod-sanitaria",
        nome: "AGUA SANITARIA",
        tipo: "comprado",
        unidade_uso_id: "un-l",
        fator_conversao: 1,
        estoque_minimo: 0,
        custo_unitario: 3,
        entra_no_cmv: false,
        ativo: true,
      }
    );
    db.recebimentos = [
      {
        id: "rec-1",
        fornecedor_id: "forn-distribuidora",
        recebido_em: "2026-03-05T10:00:00.000Z",
        status: "conferido",
      } as DB["recebimentos"][number],
    ];
    db.recebimento_itens = [
      {
        id: "ri-1",
        recebimento_id: "rec-1",
        produto_id: "prod-acucar",
        qtd_recebida: 10,
        conta_dre_id: "dre-cv-outros",
      } as DB["recebimento_itens"][number],
      {
        id: "ri-2",
        recebimento_id: "rec-1",
        produto_id: "prod-sanitaria",
        qtd_recebida: 4,
        conta_dre_id: "dre-cv-outros",
      } as DB["recebimento_itens"][number],
    ];

    const dre = calcularDrePeriodo(db, "2026-03");
    expect(dre.cmv_compras_food).toBe(50); // 10 * 5
    expect(dre.custos_variaveis).toBe(50);
    const limpeza = dre.linhas.find((l) => l.conta_id === "dre-op-limpeza");
    expect(limpeza?.valor).toBe(12); // 4 * 3 fora do CMV
    expect(dre.fixo_operacao).toBeGreaterThanOrEqual(12);
  });
});
