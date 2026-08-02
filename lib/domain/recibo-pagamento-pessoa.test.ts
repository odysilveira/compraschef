import { describe, expect, it } from "vitest";
import {
  montarTextoConfirmacaoRecebimento,
  montarTextoReciboPagamentoPessoa,
} from "./recibo-pagamento-pessoa";
import type { PagamentoPessoa, PessoaRH } from "../types";

function pessoa(parcial: Partial<PessoaRH> = {}): PessoaRH {
  return {
    id: "pes-1",
    nome: "Carlos Extra",
    tipo: "intermitente",
    funcao: "salao",
    valor_hora: 12.5,
    chave_pix: "carlos.extra@pix",
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
    ...parcial,
  };
}

function pagamento(parcial: Partial<PagamentoPessoa> = {}): PagamentoPessoa {
  return {
    id: "pag-1",
    pessoa_id: "pes-1",
    tipo: "intermitente_periodo",
    descricao: "Período domingo — salão",
    competencia: "2026-08",
    vencimento: "2026-08-01",
    valor: 95.81,
    valor_bruto: 95.81,
    horas: 5,
    valor_hora: 12.5,
    status: "aguardando_conciliacao",
    pagamento_data: "2026-08-01",
    pagamento_valor: 95.81,
    pagamento_banco_conta: "Itaú — conta principal",
    criado_em: "2026-08-01T12:00:00.000Z",
    atualizado_em: "2026-08-01T12:00:00.000Z",
    ...parcial,
  };
}

describe("recibo-pagamento-pessoa", () => {
  it("monta recibo discriminado com horas, líquido e origem", () => {
    const texto = montarTextoReciboPagamentoPessoa({
      pessoa: pessoa(),
      pagamento: pagamento(),
    });
    expect(texto).toContain("RECIBO DISCRIMINADO");
    expect(texto).toContain("Carlos");
    expect(texto).toContain("5,00 h");
    expect(texto).toContain("Itaú — conta principal");
    expect(texto).toContain("carlos.extra@pix");
    expect(texto).toContain("aguardando conciliação");
    expect(texto).toContain("contrato de trabalho intermitente");
  });

  it("lista consumos quando houver desconto", () => {
    const texto = montarTextoReciboPagamentoPessoa({
      pessoa: pessoa(),
      pagamento: pagamento({
        desconto_consumo: 36,
        consumo_ids: ["cons-1"],
        valor: 59.81,
        pagamento_valor: 59.81,
      }),
      consumos: [
        {
          id: "cons-1",
          pessoa_id: "pes-1",
          data: "2026-07-30",
          competencia: "2026-07",
          descricao: "Almoço",
          quantidade: 1,
          preco_unitario: 45,
          desconto_percentual: 20,
          valor_bruto: 45,
          valor_liquido: 36,
          status: "descontado",
          criado_em: "2026-07-30T12:00:00.000Z",
          atualizado_em: "2026-07-30T12:00:00.000Z",
        },
      ],
    });
    expect(texto).toContain("Consumo no restaurante");
    expect(texto).toContain("Almoço");
  });

  it("monta confirmação de recebimento para o empregado", () => {
    const texto = montarTextoConfirmacaoRecebimento({
      pessoa: pessoa(),
      pagamento: pagamento(),
    });
    expect(texto).toContain("Confirmo o recebimento");
    expect(texto).toContain("via PIX");
    expect(texto).toContain("Carlos Extra");
  });
});
