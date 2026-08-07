import { describe, expect, it } from "vitest";
import { qtd } from "../format";
import type { DB } from "../types";
import { resolverPreviaManualBox } from "./previa-qr-box";

function bancoPrevia(): DB {
  return {
    produtos: [
      {
        id: "prod-file-mignon",
        nome: "Filé mignon",
        categoria_id: "cat-carnes",
        unidade_compra_id: "un-kg",
        unidade_uso_id: "un-kg",
        fator_conversao: 1,
        estoque_minimo: 0,
        ativo: true,
      },
    ],
    unidades: [
      { id: "un-kg", nome: "Quilograma", sigla: "kg" },
    ],
    caixas: [
      {
        id: "cx-13",
        numero: 13,
        qr_code: "CXCHEF-013",
        tipo_box: "OPERACIONAL",
        posicao_fisica: "FRENTE",
        status: "vazia",
        quantidade: 0,
        produto_operacional_alvo_id: "prod-file-mignon",
        atualizado_em: "2026-08-04T15:00:00.000Z",
      },
    ],
    eventos_box_operacional: [],
  } as unknown as DB;
}

describe("prévia manual segura de QR de box", () => {
  it("localiza CXCHEF-013 e preserva ausência de confirmação física", () => {
    const db = bancoPrevia();
    const eventosAntes = db.eventos_box_operacional.length;

    const previa = resolverPreviaManualBox(db, {
      qrDigitadoParaPrevia: "CXCHEF-013",
      necessidadePrevista: 50,
      quantidadeContada: 0,
    });

    expect(previa.localizado).toBe(true);
    expect(previa.caixa?.qr_code).toBe("CXCHEF-013");
    expect(previa.caixa?.tipo_box).toBe("OPERACIONAL");
    expect(previa.caixa?.status).toBe("vazia");
    expect(previa.produtoEfetivoId).toBe("prod-file-mignon");
    expect(db.produtos.find((produto) => produto.id === previa.produtoEfetivoId)?.nome).toBe("Filé mignon");
    expect(previa.unidadeSigla).toBe("kg");
    expect(previa.qrConfirmadoPorLeituraFisica).toBeUndefined();
    expect(previa.operacaoLiberada).toBe(false);
    expect(previa.reposicaoSugerida).toBe(50);
    expect(db.eventos_box_operacional).toHaveLength(eventosAntes);
  });

  it("normaliza caixa baixa e espaços antes de localizar", () => {
    const previa = resolverPreviaManualBox(bancoPrevia(), {
      qrDigitadoParaPrevia: " cxchef-013 ",
      necessidadePrevista: 50,
      quantidadeContada: 3,
    });

    expect(previa.qrNormalizado).toBe("cxchef-013");
    expect(previa.caixa?.id).toBe("cx-13");
    expect(previa.produtoEfetivoId).toBe("prod-file-mignon");
    expect(previa.reposicaoSugerida).toBe(47);
    expect(previa.estadoVisual).toBe("QR digitado — não confirmado");
  });

  it("codigo inexistente nao calcula reposicao nem cria evento", () => {
    const db = bancoPrevia();
    const previa = resolverPreviaManualBox(db, {
      qrDigitadoParaPrevia: "CXCHEF-999",
      necessidadePrevista: 50,
      quantidadeContada: 0,
    });

    expect(previa.localizado).toBe(false);
    expect(previa.caixa).toBeUndefined();
    expect(previa.produtoEfetivoId).toBeUndefined();
    expect(previa.reposicaoSugerida).toBe(0);
    expect(previa.mensagem).toBe("QR não encontrado.");
    expect(previa.operacaoLiberada).toBe(false);
    expect(db.eventos_box_operacional).toHaveLength(0);
  });

  it("alimenta o fechamento manual com produto alvo e unidade de Operacional vazio", () => {
    const db = bancoPrevia();
    const eventosAntes = db.eventos_box_operacional.length;

    const previa = resolverPreviaManualBox(db, {
      qrDigitadoParaPrevia: "CXCHEF-013",
      quantidadeContada: 0,
    });

    expect(previa.localizado).toBe(true);
    expect(previa.caixa?.numero).toBe(13);
    expect(previa.caixa?.tipo_box).toBe("OPERACIONAL");
    expect(previa.caixa?.produto_id).toBeUndefined();
    expect(previa.caixa?.produto_operacional_alvo_id).toBe("prod-file-mignon");
    expect(db.produtos.find((produto) => produto.id === previa.produtoEfetivoId)?.nome).toBe("Filé mignon");
    expect(previa.unidadeSigla).toBe("kg");
    expect(qtd(0, previa.unidadeSigla)).toBe("0 kg");
    expect(previa.qrConfirmadoPorLeituraFisica).toBeUndefined();
    expect(previa.operacaoLiberada).toBe(false);
    expect(db.eventos_box_operacional).toHaveLength(eventosAntes);
  });

  it("mantem compatibilidade com Operacional antigo que possui somente produto_id", () => {
    const db = bancoPrevia();
    db.caixas[0] = {
      ...db.caixas[0],
      produto_id: "prod-file-mignon",
      produto_operacional_alvo_id: undefined,
    };

    const previa = resolverPreviaManualBox(db, {
      qrDigitadoParaPrevia: "CXCHEF-013",
      quantidadeContada: 0,
    });

    expect(previa.localizado).toBe(true);
    expect(previa.produtoEfetivoId).toBe("prod-file-mignon");
    expect(previa.unidadeSigla).toBe("kg");
    expect(previa.qrConfirmadoPorLeituraFisica).toBeUndefined();
    expect(previa.operacaoLiberada).toBe(false);
  });
});
