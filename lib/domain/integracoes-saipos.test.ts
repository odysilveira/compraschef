import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  analisarPlanilhaSaipos,
  CLASSIFICACOES_FUTURAS_SAIPOS,
  criarAnaliseSaiposVazia,
} from "./integracoes-saipos";

function criarPlanilha(linhas: unknown[][]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(linhas);
  XLSX.utils.book_append_sheet(workbook, sheet, "Saipos");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

describe("integração Saipos", () => {
  it("preserva o código inteiro como texto e divide a hierarquia do complemento", () => {
    const buffer = criarPlanilha([
      ["Tipo", "Categoria", "Tamanho", "Descrição", "Complemento", "Preço", "Pesável", "Código Saipos", "Inativo"],
      ["PRATO", "Pratos", "P", "Pizza", "", "R$ 12,50", "Não", "00123", "Não"],
      ["COMPLEMENTO", "Extras", "U", "Pizza", "Borda", "R$ 2,00", "Sim", "11215965.10619429", "Não"],
    ]);

    const resultado = analisarPlanilhaSaipos(buffer);
    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) return;

    expect(resultado.registros[0].codigo_completo).toBe("00123");
    expect(resultado.registros[1].codigo_completo).toBe("11215965.10619429");
    expect(resultado.registros[1].codigo_prato_pai).toBe("11215965");
    expect(resultado.registros[1].codigo_opcao).toBe("10619429");
    expect(resultado.registros[1].classificacao_futura).toBe(CLASSIFICACOES_FUTURAS_SAIPOS[0]);
  });

  it("converte preço brasileiro para centavos e preserva zero à esquerda", () => {
    const buffer = criarPlanilha([
      ["Tipo", "Categoria", "Tamanho", "Descrição", "Complemento", "Preço", "Pesável", "Código Saipos", "Inativo"],
      ["PRATO", "Pratos", "P", "Sobremesa", "", "R$ 10,50", "Não", "000123", "Não"],
    ]);

    const resultado = analisarPlanilhaSaipos(buffer);
    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) return;

    expect(resultado.registros[0].preco_centavos).toBe(1050);
    expect(resultado.registros[0].codigo_completo).toBe("000123");
  });

  it("bloqueia análise quando falta coluna obrigatória", () => {
    const buffer = criarPlanilha([
      ["Tipo", "Categoria", "Tamanho", "Descrição", "Complemento", "Preço", "Pesável", "Código Saipos"],
      ["PRATO", "Pratos", "P", "Sobremesa", "", "R$ 10,50", "Não", "000123"],
    ]);

    const resultado = analisarPlanilhaSaipos(buffer);
    expect(resultado.sucesso).toBe(false);
    expect(resultado.faltando_colunas).toContain("Inativo");
    expect(resultado.registros).toHaveLength(0);
  });

  it("marca código vazio, duplicado e complemento sem prato-pai", () => {
    const buffer = criarPlanilha([
      ["Tipo", "Categoria", "Tamanho", "Descrição", "Complemento", "Preço", "Pesável", "Código Saipos", "Inativo"],
      ["PRATO", "Pratos", "P", "Hambúrguer", "", "R$ 10,00", "Não", "1001", "Não"],
      ["PRATO", "Pratos", "P", "Hambúrguer", "", "R$ 11,00", "Não", "1001", "Não"],
      ["COMPLEMENTO", "Extras", "U", "Hambúrguer", "Batata", "R$ 3,00", "Sim", "2000.1", "Não"],
      ["PRATO", "Pratos", "P", "Sem código", "", "R$ 1,00", "Não", "", "Não"],
    ]);

    const resultado = analisarPlanilhaSaipos(buffer);
    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) return;

    expect(resultado.resumo.codigos_vazios).toBe(1);
    expect(resultado.resumo.codigos_duplicados).toBe(2);
    expect(resultado.resumo.complementos_sem_pai_correspondente).toBe(1);
    expect(resultado.registros.some((registro) => registro.conflitos.includes("Código Saipos duplicado."))).toBe(true);
    expect(resultado.registros.some((registro) => registro.conflitos.includes("Complemento sem prato-pai correspondente."))).toBe(true);
  });

  it("identifica nomes iguais com códigos diferentes e limpa o estado descartado", () => {
    const buffer = criarPlanilha([
      ["Tipo", "Categoria", "Tamanho", "Descrição", "Complemento", "Preço", "Pesável", "Código Saipos", "Inativo"],
      ["PRATO", "Pratos", "P", "Lasanha", "", "R$ 18,00", "Não", "3001", "Não"],
      ["PRATO", "Pratos", "P", "Lasanha", "", "R$ 19,00", "Não", "3002", "Não"],
    ]);

    const resultado = analisarPlanilhaSaipos(buffer);
    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) return;

    expect(resultado.resumo.nomes_iguais_codigos_diferentes).toBe(2);
    expect(resultado.registros.some((registro) => registro.alertas.includes("Mesmo nome com código diferente."))).toBe(true);
    expect(criarAnaliseSaiposVazia()).toEqual({
      sucesso: false,
      faltando_colunas: [],
      registros: [],
      resumo: {
        total_registros: 0,
        pratos: 0,
        complementos: 0,
        ativos: 0,
        inativos: 0,
        codigos_vazios: 0,
        codigos_duplicados: 0,
        codigos_formato_invalido: 0,
        nomes_iguais_codigos_diferentes: 0,
        complementos_sem_pai_correspondente: 0,
        registros_validos: 0,
        registros_com_avisos: 0,
        registros_com_conflitos: 0,
      },
    });
  });
});
