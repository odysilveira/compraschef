import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import type { DB, PessoaRH } from "../types";
import {
  competenciaPtParaIso,
  criarPagamentosDaFolha,
  normalizarNome,
  parseMoedaBr,
  parseRecibosFolhaTexto,
  vincularRecibosAPessoas,
} from "./folha-recibo-pdf";

const fixture = readFileSync(
  join(__dirname, "fixtures/folha-vera-bela-julho-2026.txt"),
  "utf8"
);

function pessoa(nome: string, id: string): PessoaRH {
  return {
    id,
    nome,
    tipo: "colaborador",
    funcao: "cozinha",
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
  };
}

describe("folha-recibo-pdf", () => {
  it("converte competência pt-BR", () => {
    expect(competenciaPtParaIso("Julho/2026")).toEqual({ iso: "2026-07", rotulo: "Julho/2026" });
    expect(parseMoedaBr("1.509,89")).toBe(1509.89);
    expect(normalizarNome("Evellyn Nathália")).toBe("EVELLYN NATHALIA");
  });

  it("extrai recibos únicos do PDF Vera Bela (deduplica vias)", () => {
    const recibos = parseRecibosFolhaTexto(fixture);
    expect(recibos.length).toBeGreaterThanOrEqual(5);
    // 5 páginas × 2 vias = 10 blocos brutos → 5 únicos (4 salário + 1 pró-labore tipicamente)
    const evellyn = recibos.find((r) => r.nome.includes("EVELLYN"));
    expect(evellyn).toMatchObject({
      codigo_funcionario: "1",
      competencia: "2026-07",
      liquido: 1509.89,
      salario_base: 2192.4,
      adiantamento: 700,
      consumo: 149.92,
      tipo_recibo: "salario",
    });
    const ody = recibos.find((r) => r.nome.includes("ODY"));
    expect(ody).toMatchObject({
      tipo_recibo: "pro_labore",
      liquido: 1442.69,
      salario_base: 1621,
    });
    // sem duplicata
    expect(recibos.filter((r) => r.codigo_funcionario === "1")).toHaveLength(1);
  });

  it("vincula por nome e cria pagamentos", () => {
    const recibos = parseRecibosFolhaTexto(fixture);
    const pessoas = [
      pessoa("Evellyn Nathalia de Abreu Vieira", "pes-e"),
      pessoa("Ody Silveira Junior", "pes-o"),
    ];
    const vinculados = vincularRecibosAPessoas(recibos, pessoas);
    const evellyn = vinculados.find((r) => r.codigo_funcionario === "1")!;
    expect(evellyn.pessoa_id).toBe("pes-e");
    expect(evellyn.selecionado).toBe(true);

    const db = { pagamentos_pessoas: [] } as unknown as DB;
    const r = criarPagamentosDaFolha(db, [evellyn], {
      agora: "2026-08-01T12:00:00.000Z",
      vencimento: "2026-08-05",
      idFactory: () => "pagp-test-1",
    });
    expect(r.criados).toBe(1);
    expect(db.pagamentos_pessoas[0]).toMatchObject({
      pessoa_id: "pes-e",
      tipo: "salario",
      valor: 1509.89,
      valor_bruto: 2192.4,
      desconto_adiantamento: 700,
      desconto_consumo: 149.92,
      competencia: "2026-07",
      status: "previsto",
    });
  });
});
