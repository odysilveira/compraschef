import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import {
  analisarPlanilhaSaipos,
  CLASSIFICACOES_FUTURAS_SAIPOS,
  criarAnaliseSaiposVazia,
  nomeCanonicoRegistro,
  SAIPOS_MAX_BYTES_ARQUIVO,
  SAIPOS_MAX_REGISTROS,
  validarArquivoSaiposLocal,
} from "./integracoes-saipos";

function cabecalho() {
  return ["Tipo", "Categoria", "Tamanho", "Descrição", "Complemento", "Preço", "Pesável", "Código Saipos", "Inativo"];
}

function criarPlanilha(linhas: unknown[][]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(linhas);
  XLSX.utils.book_append_sheet(workbook, sheet, "Saipos");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

describe("integração Saipos", () => {
  it("rejeita arquivo acima de 10 MB", () => {
    const erro = validarArquivoSaiposLocal({ name: "saipos.xlsx", size: SAIPOS_MAX_BYTES_ARQUIVO + 1 });
    expect(erro).toContain("10 MB");
  });

  it("rejeita arquivo vazio e extensão inválida", () => {
    expect(validarArquivoSaiposLocal({ name: "saipos.csv", size: 10 })).toContain(".xlsx");
    expect(validarArquivoSaiposLocal({ name: "saipos.xlsx", size: 0 })).toContain("vazio");
  });

  it("rejeita planilha acima de 20.000 registros", () => {
    const linhas: unknown[][] = [cabecalho()];
    for (let i = 0; i < SAIPOS_MAX_REGISTROS + 1; i += 1) {
      linhas.push(["PRATO", "Cat", "U", `Item ${i}`, "", "10,00", "Não", `P${i}`, "Não"]);
    }
    const resultado = analisarPlanilhaSaipos(criarPlanilha(linhas));
    expect(resultado.sucesso).toBe(false);
    if (resultado.sucesso) return;
    expect(resultado.erro).toContain("20");
  });

  it("rejeita arquivo corrompido com mensagem compreensível", () => {
    const corrompido = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    const resultado = analisarPlanilhaSaipos(corrompido);
    expect(resultado.sucesso).toBe(false);
    if (resultado.sucesso) return;
    expect(resultado.erro.toLowerCase()).toContain("corrompido");
  });

  it("preserva código como texto e divide hierarquia corretamente", () => {
    const buffer = criarPlanilha([
      cabecalho(),
      ["PRATO", "Pratos", "P", "Pizza", "", "12,50", "Não", "00123", "Não"],
      ["COMPLEMENTO", "Extras", "U", "Pizza", "Borda", "2,00", "Sim", "11215965.10619429", "Não"],
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

  it("corrige leitura de preços em múltiplos formatos", () => {
    const buffer = criarPlanilha([
      cabecalho(),
      ["PRATO", "Cat", "U", "A", "", "R$ 1.234,56", "Não", "A1", "Não"],
      ["PRATO", "Cat", "U", "B", "", "1234,56", "Não", "A2", "Não"],
      ["PRATO", "Cat", "U", "C", "", "1234.56", "Não", "A3", "Não"],
      ["PRATO", "Cat", "U", "D", "", 1234.56, "Não", "A4", "Não"],
      ["PRATO", "Cat", "U", "E", "", "0", "Não", "A5", "Não"],
      ["PRATO", "Cat", "U", "F", "", "", "Não", "A6", "Não"],
      ["PRATO", "Cat", "U", "G", "", "abc", "Não", "A7", "Não"],
      ["PRATO", "Cat", "U", "H", "", "64.90", "Não", "A8", "Não"],
    ]);

    const resultado = analisarPlanilhaSaipos(buffer);
    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) return;

    const porCodigo = new Map(resultado.registros.map((registro) => [registro.codigo_completo, registro]));
    expect(porCodigo.get("A1")?.preco_centavos).toBe(123456);
    expect(porCodigo.get("A2")?.preco_centavos).toBe(123456);
    expect(porCodigo.get("A3")?.preco_centavos).toBe(123456);
    expect(porCodigo.get("A4")?.preco_centavos).toBe(123456);
    expect(porCodigo.get("A5")?.preco_centavos).toBe(0);
    expect(porCodigo.get("A6")?.preco_centavos).toBeNull();
    expect(porCodigo.get("A7")?.alertas.some((item) => item.toLowerCase().includes("preço inválido"))).toBe(true);
    expect(porCodigo.get("A8")?.preco_centavos).toBe(6490);
  });

  it("bloqueia análise com coluna ausente e marca código vazio", () => {
    const ausente = criarPlanilha([
      ["Tipo", "Categoria", "Tamanho", "Descrição", "Complemento", "Preço", "Pesável", "Código Saipos"],
      ["PRATO", "Pratos", "P", "Sobremesa", "", "10,50", "Não", "000123"],
    ]);
    const resultadoAusente = analisarPlanilhaSaipos(ausente);
    expect(resultadoAusente.sucesso).toBe(false);

    const vazio = criarPlanilha([
      cabecalho(),
      ["PRATO", "Pratos", "P", "Sem código", "", "1,00", "Não", "", "Não"],
    ]);
    const resultadoVazio = analisarPlanilhaSaipos(vazio);
    expect(resultadoVazio.sucesso).toBe(true);
    if (!resultadoVazio.sucesso) return;
    expect(resultadoVazio.resumo.codigos_vazios).toBe(1);
    expect(resultadoVazio.registros[0].conflitos).toContain("Código Saipos vazio.");
  });

  it("usa nome canônico de prato e de complemento", () => {
    expect(nomeCanonicoRegistro("PRATO", "Risoto de Camarão", "Complemento X")).toBe("Risoto de Camarão");
    expect(nomeCanonicoRegistro("COMPLEMENTO", "Risoto de Camarão", "Extra Bacon")).toBe("Extra Bacon");
    expect(nomeCanonicoRegistro("COMPLEMENTO", "Risoto de Camarão", "-")).toBe("Risoto de Camarão");
  });

  it("distingue grupos repetidos e registros afetados em vários pratos", () => {
    const buffer = criarPlanilha([
      cabecalho(),
      ["PRATO", "Pratos", "U", "Lasanha", "", "30,00", "Não", "P1", "Não"],
      ["PRATO", "Pratos", "U", "Lasanha", "", "30,00", "Não", "P2", "Não"],
      ["PRATO", "Pratos", "U", "Lasanha", "", "30,00", "Não", "P3", "Não"],
      ["PRATO", "Pratos", "U", "Nhoque", "", "31,00", "Não", "N1", "Não"],
      ["PRATO", "Pratos", "U", "Nhoque", "", "31,00", "Não", "N2", "Não"],
      ["COMPLEMENTO", "Extras", "U", "Lasanha", "Queijo extra", "4,00", "Não", "P1.C1", "Não"],
      ["COMPLEMENTO", "Extras", "U", "Lasanha", "Queijo extra", "4,00", "Não", "P2.C1", "Não"],
    ]);

    const resultado = analisarPlanilhaSaipos(buffer);
    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) return;

    expect(resultado.resumo.nomes_repetidos_grupos).toBe(3);
    expect(resultado.resumo.nomes_repetidos_registros_afetados).toBe(7);
  });

  it("identifica duplicidade de códigos e complemento sem prato-pai", () => {
    const buffer = criarPlanilha([
      cabecalho(),
      ["PRATO", "Pratos", "P", "Hambúrguer", "", "10,00", "Não", "1001", "Não"],
      ["PRATO", "Pratos", "P", "Hambúrguer 2", "", "11,00", "Não", "1001", "Não"],
      ["COMPLEMENTO", "Extras", "U", "Hambúrguer", "Batata", "3,00", "Sim", "2000.1", "Não"],
    ]);

    const resultado = analisarPlanilhaSaipos(buffer);
    expect(resultado.sucesso).toBe(true);
    if (!resultado.sucesso) return;

    expect(resultado.resumo.codigos_duplicados_distintos).toBe(1);
    expect(resultado.resumo.codigos_duplicados_registros_afetados).toBe(2);
    expect(resultado.resumo.complementos_sem_pai).toBe(1);
  });

  it("não grava nada em localStorage ou banco e descarte zera memória", () => {
    const setItem = vi.fn();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: { setItem },
    });

    const buffer = criarPlanilha([
      cabecalho(),
      ["PRATO", "Pratos", "P", "Lasanha", "", "18,00", "Não", "3001", "Não"],
    ]);

    const resultado = analisarPlanilhaSaipos(buffer);
    expect(resultado.sucesso).toBe(true);
    expect(setItem).not.toHaveBeenCalled();

    const vazio = criarAnaliseSaiposVazia();
    expect(vazio.registros).toHaveLength(0);
    expect(vazio.resumo.total_registros).toBe(0);
  });
});
