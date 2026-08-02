import { describe, expect, it } from "vitest";
import type { FichaTecnica, FichaTecnicaAlergenicos, Produto, Unidade } from "../types";
import {
  atualizarFichaRascunho,
  calcularCustoFicha,
  consolidarAlergenicosFicha,
  converterUnidadeBasica,
  criarNovoRascunhoDeVersaoPublicada,
  criarSnapshotCusto,
  detectaCicloAoAdicionar,
  detectarCiclos,
  publicarFicha,
} from "./fichas-tecnicas";

function deepFreeze<T>(obj: T): T {
  if (!obj || typeof obj !== "object") {
    return obj;
  }

  Object.freeze(obj);
  if (Array.isArray(obj)) {
    for (const item of obj) {
      deepFreeze(item);
    }
  } else {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      deepFreeze((obj as Record<string, unknown>)[key]);
    }
  }

  return obj;
}

function alergenicos(
  valores?: Partial<FichaTecnicaAlergenicos>
): FichaTecnicaAlergenicos {
  return {
    gluten: "NAO_INFORMADO",
    lactose: "NAO_INFORMADO",
    ovos: "NAO_INFORMADO",
    peixes: "NAO_INFORMADO",
    crustaceos: "NAO_INFORMADO",
    soja: "NAO_INFORMADO",
    castanhas: "NAO_INFORMADO",
    amendoim: "NAO_INFORMADO",
    outros: [],
    ...valores,
  };
}

const unidades: Unidade[] = [
  { id: "u-kg", nome: "Quilograma", sigla: "kg" },
  { id: "u-g", nome: "Gramas", sigla: "g" },
  { id: "u-l", nome: "Litro", sigla: "L" },
  { id: "u-ml", nome: "Mililitro", sigla: "ml" },
  { id: "u-un", nome: "Unidade", sigla: "un" },
  { id: "u-cx", nome: "Caixa", sigla: "cx" },
];

const produtosBase: Produto[] = [
  {
    id: "p-cebola",
    nome: "Cebola",
    tipo: "comprado",
    unidade_uso_id: "u-kg",
    fator_conversao: 1,
    custo_unitario: 5.5,
    alergenicos: alergenicos({ outros: [{ nome: "sulfitos", presenca: "PODE_CONTER" }] }),
    estoque_minimo: 10,
    ativo: true,
  },
  {
    id: "p-tomate",
    nome: "Tomate",
    tipo: "comprado",
    unidade_uso_id: "u-kg",
    fator_conversao: 1,
    custo_unitario: 8,
    alergenicos: alergenicos({ gluten: "PODE_CONTER" }),
    estoque_minimo: 10,
    ativo: true,
  },
  {
    id: "p-azeite",
    nome: "Azeite",
    tipo: "comprado",
    unidade_uso_id: "u-l",
    fator_conversao: 1,
    custo_unitario: 40,
    alergenicos: alergenicos(),
    estoque_minimo: 2,
    ativo: true,
  },
  {
    id: "p-ovo",
    nome: "Ovo",
    tipo: "comprado",
    unidade_uso_id: "u-un",
    fator_conversao: 1,
    custo_unitario: 0.6,
    alergenicos: alergenicos({ ovos: "CONTEM" }),
    estoque_minimo: 30,
    ativo: true,
  },
  {
    id: "p-farinha",
    nome: "Farinha",
    tipo: "comprado",
    unidade_compra_id: "u-cx",
    unidade_uso_id: "u-kg",
    fator_conversao: 2,
    custo_unitario: 10,
    alergenicos: alergenicos({ gluten: "CONTEM" }),
    estoque_minimo: 2,
    ativo: true,
  },
];

function fichaBaseSobremesa(): FichaTecnica {
  return {
    id: "f-sobremesa",
    nome: "Sobremesa",
    status: "rascunho",
    versao: "1.0.0",
    rendimento_quantidade: 1,
    rendimento_unidade_id: "u-kg",
    ingredientes: [
      {
        id: "ing-1",
        tipo: "PRODUTO",
        produto_id: "p-tomate",
        quantidade: 500,
        unidade_id: "u-g",
      },
    ],
    passos: [{ ordem: 1, descricao: "Misturar" }],
    alergenicos: alergenicos(),
    criado_em: "2026-07-20T10:00:00Z",
    atualizado_em: "2026-07-20T10:00:00Z",
  };
}

describe("Conversão de Unidades Básicas", () => {
  it("converte kg para g", () => {
    expect(converterUnidadeBasica(1.5, "kg", "g")).toBe(1500);
  });

  it("converte g para kg", () => {
    expect(converterUnidadeBasica(250, "g", "kg")).toBe(0.25);
  });

  it("converte L para ml e ml para L", () => {
    expect(converterUnidadeBasica(0.75, "L", "ml")).toBe(750);
    expect(converterUnidadeBasica(250, "ml", "L")).toBe(0.25);
  });

  it("rejeita conversões incompatíveis", () => {
    expect(() => converterUnidadeBasica(1, "kg", "L")).toThrow();
  });
});

describe("Detecção de Ciclos", () => {
  it("detecta ciclo A -> A", () => {
    const a: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "a",
      ingredientes: [
        {
          id: "ing-a",
          tipo: "SUB_RECEITA",
          sub_receita_id: "a",
          quantidade: 1,
          unidade_id: "u-kg",
        },
      ],
    };

    const res = detectarCiclos([a]);
    expect(res.temCiclo).toBe(true);
    expect(res.caminho).toEqual(["a", "a"]);
  });

  it("detecta ciclo A -> B -> A", () => {
    const b: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "b",
      ingredientes: [
        {
          id: "ing-b",
          tipo: "SUB_RECEITA",
          sub_receita_id: "a",
          quantidade: 1,
          unidade_id: "u-kg",
        },
      ],
    };
    const a: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "a",
      ingredientes: [
        {
          id: "ing-a",
          tipo: "SUB_RECEITA",
          sub_receita_id: "b",
          quantidade: 1,
          unidade_id: "u-kg",
        },
      ],
    };

    const res = detectarCiclos([a, b]);
    expect(res.temCiclo).toBe(true);
    expect(res.caminho).toEqual(["a", "b", "a"]);
  });

  it("detecta ciclo A -> B -> C -> A", () => {
    const c: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "c",
      ingredientes: [
        {
          id: "ing-c",
          tipo: "SUB_RECEITA",
          sub_receita_id: "a",
          quantidade: 1,
          unidade_id: "u-kg",
        },
      ],
    };
    const b: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "b",
      ingredientes: [
        {
          id: "ing-b",
          tipo: "SUB_RECEITA",
          sub_receita_id: "c",
          quantidade: 1,
          unidade_id: "u-kg",
        },
      ],
    };
    const a: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "a",
      ingredientes: [
        {
          id: "ing-a",
          tipo: "SUB_RECEITA",
          sub_receita_id: "b",
          quantidade: 1,
          unidade_id: "u-kg",
        },
      ],
    };

    const res = detectarCiclos([a, b, c]);
    expect(res.temCiclo).toBe(true);
    expect(res.caminho).toEqual(["a", "b", "c", "a"]);
  });

  it("prevê ciclo na adição de sub-receita", () => {
    const a: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "a",
      ingredientes: [
        {
          id: "ing-a",
          tipo: "SUB_RECEITA",
          sub_receita_id: "b",
          quantidade: 1,
          unidade_id: "u-kg",
        },
      ],
    };

    const b: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "b",
      ingredientes: [],
    };

    expect(detectaCicloAoAdicionar("b", "a", [a, b])).toBe(true);
  });
});

describe("Custos e Validações", () => {
  it("calcula custo em centavos com conversão direta e inversa", () => {
    const ficha: FichaTecnica = {
      ...fichaBaseSobremesa(),
      ingredientes: [
        { id: "i1", tipo: "PRODUTO", produto_id: "p-tomate", quantidade: 500, unidade_id: "u-g" },
        { id: "i2", tipo: "PRODUTO", produto_id: "p-cebola", quantidade: 0.1, unidade_id: "u-kg" },
        { id: "i3", tipo: "PRODUTO", produto_id: "p-azeite", quantidade: 50, unidade_id: "u-ml" },
      ],
    };

    const res = calcularCustoFicha(ficha, [ficha], produtosBase, unidades);
    expect(res.custo_total).toBe(655);
    expect(res.completo).toBe(true);
  });

  it("aplica fator específico do produto para unidade de compra", () => {
    const ficha: FichaTecnica = {
      ...fichaBaseSobremesa(),
      ingredientes: [
        {
          id: "i-fator",
          tipo: "PRODUTO",
          produto_id: "p-farinha",
          quantidade: 1,
          unidade_id: "u-cx",
        },
      ],
    };

    const res = calcularCustoFicha(ficha, [ficha], produtosBase, unidades);
    // 1 caixa = 2kg, R$10/kg => 2 * 1000 = 2000 centavos
    expect(res.custo_total).toBe(2000);
  });

  it("rejeita fator de conversão zero ou negativo", () => {
    const produtosInvalidos: Produto[] = [
      {
        ...produtosBase.find((p) => p.id === "p-farinha")!,
        fator_conversao: 0,
      },
    ];

    const ficha: FichaTecnica = {
      ...fichaBaseSobremesa(),
      ingredientes: [
        {
          id: "i-fator",
          tipo: "PRODUTO",
          produto_id: "p-farinha",
          quantidade: 1,
          unidade_id: "u-cx",
        },
      ],
    };

    expect(() => calcularCustoFicha(ficha, [ficha], produtosInvalidos, unidades)).toThrow(
      /fator de conversão inválido/
    );
  });

  it("rejeita rendimento inválido para evitar divisão por zero", () => {
    const sub: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "f-sub",
      rendimento_quantidade: 0,
      ingredientes: [{ id: "i", tipo: "PRODUTO", produto_id: "p-tomate", quantidade: 100, unidade_id: "u-g" }],
    };

    const principal: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "f-principal",
      ingredientes: [
        {
          id: "i-sub",
          tipo: "SUB_RECEITA",
          sub_receita_id: "f-sub",
          quantidade: 100,
          unidade_id: "u-g",
        },
      ],
    };

    expect(() => calcularCustoFicha(principal, [principal, sub], produtosBase, unidades)).toThrow(
      /Rendimento da sub-receita f-sub inválido/
    );
  });

  it("rejeita quantidade inválida", () => {
    const ficha: FichaTecnica = {
      ...fichaBaseSobremesa(),
      ingredientes: [
        { id: "i", tipo: "PRODUTO", produto_id: "p-tomate", quantidade: 0, unidade_id: "u-g" },
      ],
    };

    expect(() => calcularCustoFicha(ficha, [ficha], produtosBase, unidades)).toThrow(
      /Quantidade do ingrediente i inválida/
    );
  });

  it("retorna erro claro para produto inexistente", () => {
    const ficha: FichaTecnica = {
      ...fichaBaseSobremesa(),
      ingredientes: [
        { id: "i", tipo: "PRODUTO", produto_id: "inexistente", quantidade: 1, unidade_id: "u-kg" },
      ],
    };

    expect(() => calcularCustoFicha(ficha, [ficha], produtosBase, unidades)).toThrow(
      /Produto com id inexistente não encontrado/
    );
  });

  it("retorna erro claro para unidade inexistente", () => {
    const ficha: FichaTecnica = {
      ...fichaBaseSobremesa(),
      ingredientes: [
        { id: "i", tipo: "PRODUTO", produto_id: "p-tomate", quantidade: 1, unidade_id: "u-x" },
      ],
    };

    expect(() => calcularCustoFicha(ficha, [ficha], produtosBase, unidades)).toThrow(
      /Unidade com id u-x não encontrada/
    );
  });

  it("retorna erro claro para sub-receita inexistente", () => {
    const ficha: FichaTecnica = {
      ...fichaBaseSobremesa(),
      ingredientes: [
        {
          id: "i",
          tipo: "SUB_RECEITA",
          sub_receita_id: "f-inexistente",
          quantidade: 1,
          unidade_id: "u-kg",
        },
      ],
    };

    expect(() => calcularCustoFicha(ficha, [ficha], produtosBase, unidades)).toThrow(
      /Sub-receita com id f-inexistente não encontrada/
    );
  });

  it("retorna erro claro para versão de sub-receita inexistente", () => {
    const sub: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "f-sub",
      versao: "1.0.0",
    };
    const principal: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "f-main",
      ingredientes: [
        {
          id: "i",
          tipo: "SUB_RECEITA",
          sub_receita_id: "f-sub",
          sub_receita_versao: "2.0.0",
          quantidade: 1,
          unidade_id: "u-kg",
        },
      ],
    };

    expect(() => calcularCustoFicha(principal, [principal, sub], produtosBase, unidades)).toThrow(
      /versão 2.0.0 não encontrada/
    );
  });
});

describe("Versionamento e Imutabilidade de Publicação", () => {
  it("bloqueia atualização de versão publicada", () => {
    const publicada = publicarFicha(fichaBaseSobremesa(), [fichaBaseSobremesa()], produtosBase, unidades);

    expect(() => atualizarFichaRascunho(publicada, { nome: "novo" })).toThrow(/imutável/);
  });

  it("gera novo rascunho como cópia profunda", () => {
    const publicada = publicarFicha(fichaBaseSobremesa(), [fichaBaseSobremesa()], produtosBase, unidades);
    const rascunho2 = criarNovoRascunhoDeVersaoPublicada(publicada, "f-sobremesa-v2", "2.0.0");

    rascunho2.ingredientes[0].quantidade = 999;
    rascunho2.passos[0].descricao = "Alterado";
    rascunho2.alergenicos.gluten = "CONTEM";

    expect(publicada.id).toBe("f-sobremesa");
    expect(publicada.versao).toBe("1.0.0");
    expect(publicada.status).toBe("publicada");
    expect(publicada.ingredientes[0].quantidade).toBe(500);
    expect(publicada.passos[0].descricao).toBe("Misturar");
    expect(publicada.alergenicos.gluten).toBe("NAO_INFORMADO");
    expect(rascunho2.status).toBe("rascunho");
    expect(rascunho2.versao).toBe("2.0.0");
  });

  it("impede publicar versão já publicada", () => {
    const publicada = publicarFicha(fichaBaseSobremesa(), [fichaBaseSobremesa()], produtosBase, unidades);
    expect(() => publicarFicha(publicada, [publicada], produtosBase, unidades)).toThrow(/já está publicada/);
  });
});

describe("Snapshot Histórico Imutável", () => {
  it("permanece inalterado após mudanças em produto e ficha", () => {
    const ficha = fichaBaseSobremesa();
    const produtos = JSON.parse(JSON.stringify(produtosBase)) as Produto[];

    const snapshot = criarSnapshotCusto(ficha, [ficha], produtos, unidades);
    const snapshotSerializado = JSON.stringify(snapshot);

    produtos[1].custo_unitario = 999;
    produtos[1].nome = "Tomate Premium";
    ficha.ingredientes[0].quantidade = 999;
    ficha.nome = "Ficha Alterada";

    expect(JSON.stringify(snapshot)).toBe(snapshotSerializado);
  });

  it("retorna snapshot congelado em profundidade", () => {
    const ficha = fichaBaseSobremesa();
    const snapshot = criarSnapshotCusto(ficha, [ficha], produtosBase, unidades);

    expect(() => {
      (snapshot as { custo_total: number }).custo_total = 1;
    }).toThrow(TypeError);

    expect(() => {
      (snapshot.detalhes_ingredientes as Array<{ nome: string }>)[0].nome = "X";
    }).toThrow(TypeError);
  });
});

describe("Consolidação de Alergênicos", () => {
  it("aplica precedência CONTEM > PODE_CONTER > NAO_INFORMADO", () => {
    const ficha: FichaTecnica = {
      ...fichaBaseSobremesa(),
      alergenicos: alergenicos({ gluten: "NAO_INFORMADO" }),
      ingredientes: [
        { id: "i1", tipo: "PRODUTO", produto_id: "p-tomate", quantidade: 10, unidade_id: "u-g" },
        { id: "i2", tipo: "PRODUTO", produto_id: "p-farinha", quantidade: 1, unidade_id: "u-cx" },
      ],
    };

    const res = consolidarAlergenicosFicha(ficha, [ficha], produtosBase);
    expect(res.gluten).toBe("CONTEM");
  });

  it("consolida sub-receitas aninhadas de forma recursiva", () => {
    const subNivel2: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "sub-2",
      alergenicos: alergenicos({ lactose: "PODE_CONTER" }),
      ingredientes: [
        { id: "p1", tipo: "PRODUTO", produto_id: "p-ovo", quantidade: 1, unidade_id: "u-un" },
      ],
    };

    const subNivel1: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "sub-1",
      ingredientes: [
        { id: "s2", tipo: "SUB_RECEITA", sub_receita_id: "sub-2", quantidade: 100, unidade_id: "u-g" },
      ],
    };

    const principal: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "principal",
      ingredientes: [
        { id: "s1", tipo: "SUB_RECEITA", sub_receita_id: "sub-1", quantidade: 100, unidade_id: "u-g" },
      ],
    };

    const res = consolidarAlergenicosFicha(principal, [principal, subNivel1, subNivel2], produtosBase);
    expect(res.ovos).toBe("CONTEM");
    expect(res.lactose).toBe("PODE_CONTER");
  });

  it("consolida outros sem duplicidade por nome", () => {
    const ficha: FichaTecnica = {
      ...fichaBaseSobremesa(),
      ingredientes: [
        { id: "i1", tipo: "PRODUTO", produto_id: "p-cebola", quantidade: 1, unidade_id: "u-kg" },
      ],
      alergenicos: alergenicos({
        outros: [
          { nome: "Sulfitos", presenca: "NAO_INFORMADO" },
          { nome: "sulfitos", presenca: "PODE_CONTER" },
        ],
      }),
    };

    const res = consolidarAlergenicosFicha(ficha, [ficha], produtosBase);
    const sulfitos = res.outros?.find((x) => x.nome === "sulfitos");

    expect(res.outros?.length).toBe(1);
    expect(sulfitos?.presenca).toBe("PODE_CONTER");
  });

  it("retorna erro explícito para produto inexistente", () => {
    const ficha: FichaTecnica = {
      ...fichaBaseSobremesa(),
      ingredientes: [
        { id: "i1", tipo: "PRODUTO", produto_id: "p-nao-existe", quantidade: 1, unidade_id: "u-kg" },
      ],
    };

    expect(() => consolidarAlergenicosFicha(ficha, [ficha], produtosBase)).toThrow(
      /Produto com id p-nao-existe não encontrado/
    );
  });

  it("retorna erro explícito para sub-receita inexistente", () => {
    const ficha: FichaTecnica = {
      ...fichaBaseSobremesa(),
      ingredientes: [
        { id: "i1", tipo: "SUB_RECEITA", sub_receita_id: "f-nao-existe", quantidade: 1, unidade_id: "u-kg" },
      ],
    };

    expect(() => consolidarAlergenicosFicha(ficha, [ficha], produtosBase)).toThrow(
      /Sub-receita com id f-nao-existe não encontrada/
    );
  });

  it("retorna erro explícito para versão inexistente", () => {
    const sub: FichaTecnica = { ...fichaBaseSobremesa(), id: "f-sub", versao: "1.0.0" };
    const principal: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "f-principal",
      ingredientes: [
        {
          id: "i1",
          tipo: "SUB_RECEITA",
          sub_receita_id: "f-sub",
          sub_receita_versao: "9.9.9",
          quantidade: 1,
          unidade_id: "u-kg",
        },
      ],
    };

    expect(() => consolidarAlergenicosFicha(principal, [principal, sub], produtosBase)).toThrow(
      /versão 9.9.9 não encontrada/
    );
  });

  it("impede recursão infinita quando há ciclo", () => {
    const a: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "a",
      ingredientes: [
        { id: "i-a", tipo: "SUB_RECEITA", sub_receita_id: "b", quantidade: 1, unidade_id: "u-kg" },
      ],
    };
    const b: FichaTecnica = {
      ...fichaBaseSobremesa(),
      id: "b",
      ingredientes: [
        { id: "i-b", tipo: "SUB_RECEITA", sub_receita_id: "a", quantidade: 1, unidade_id: "u-kg" },
      ],
    };

    expect(() => consolidarAlergenicosFicha(a, [a, b], produtosBase)).toThrow(
      /Ciclo detectado na consolidação de alergênicos/
    );
  });
});

describe("Pureza e Não Mutação de Entradas", () => {
  it("calcularCustoFicha não muta argumentos recebidos", () => {
    const ficha = deepFreeze(fichaBaseSobremesa());
    const fichas = deepFreeze([fichaBaseSobremesa()]);
    const produtos = deepFreeze(JSON.parse(JSON.stringify(produtosBase)) as Produto[]);
    const unidadesFreeze = deepFreeze(JSON.parse(JSON.stringify(unidades)) as Unidade[]);

    expect(() => calcularCustoFicha(ficha, fichas, produtos, unidadesFreeze)).not.toThrow();
  });

  it("criarSnapshotCusto não muta argumentos recebidos", () => {
    const ficha = deepFreeze(fichaBaseSobremesa());
    const fichas = deepFreeze([fichaBaseSobremesa()]);
    const produtos = deepFreeze(JSON.parse(JSON.stringify(produtosBase)) as Produto[]);
    const unidadesFreeze = deepFreeze(JSON.parse(JSON.stringify(unidades)) as Unidade[]);

    expect(() => criarSnapshotCusto(ficha, fichas, produtos, unidadesFreeze)).not.toThrow();
  });

  it("consolidarAlergenicosFicha não muta argumentos recebidos", () => {
    const ficha = deepFreeze(fichaBaseSobremesa());
    const fichas = deepFreeze([fichaBaseSobremesa()]);
    const produtos = deepFreeze(JSON.parse(JSON.stringify(produtosBase)) as Produto[]);

    expect(() => consolidarAlergenicosFicha(ficha, fichas, produtos)).not.toThrow();
  });
});
