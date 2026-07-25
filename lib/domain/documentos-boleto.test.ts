import { describe, expect, it } from "vitest";
import type { DB } from "../types";
import { seedDB } from "../data/seed";
import { atualizarComNovidades } from "../data/index";
import {
  registrarDocumentoBoleto,
  calcularHashSHA256,
  validarArquivoDocumentoBoleto,
  LIMITE_TAMANHO_BYTES,
  receberBoletoContaPagar,
} from "./documentos-boleto";
import { identificarBoletosValidosNoTexto } from "./identificacao-boleto";

function textoParaArrayBuffer(texto: string): ArrayBuffer {
  return new TextEncoder().encode(texto).buffer as ArrayBuffer;
}

function bytesParaArrayBuffer(bytes: number[]): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function arquivoBase(overrides: Partial<Parameters<typeof validarArquivoDocumentoBoleto>[0]> = {}) {
  return {
    nomeArquivo: overrides.nomeArquivo ?? "boleto.pdf",
    tipoArquivo: overrides.tipoArquivo ?? "application/pdf",
    tamanhoBytes: overrides.tamanhoBytes ?? 16,
    conteudo: overrides.conteudo ?? bytesParaArrayBuffer([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
  };
}

const CODIGO_BARRAS_44 = "34191123400000010001234567890123456789012345";
const LINHA_BANCARIA_47 = "34191.23454 67890.123457 67890.123457 1 12340000001000";

describe("documentos de boleto", () => {
  it("migra DB antigo sem documentos_boleto", () => {
    const dbAntigo = structuredClone(seedDB) as DB & { documentos_boleto?: unknown };
    delete (dbAntigo as { documentos_boleto?: unknown }).documentos_boleto;

    const mudou = atualizarComNovidades(dbAntigo as DB);

    expect(mudou).toBe(true);
    expect((dbAntigo as DB).documentos_boleto).toEqual([]);
  });

  it("aceita PDF com assinatura correta", () => {
    const resultado = validarArquivoDocumentoBoleto(arquivoBase());
    expect(resultado).toEqual({ valido: true, tipoDetectado: "application/pdf", erros: [] });
  });

  it("aceita PNG com assinatura correta", () => {
    const resultado = validarArquivoDocumentoBoleto(
      arquivoBase({
        nomeArquivo: "boleto.png",
        tipoArquivo: "image/png",
        conteudo: bytesParaArrayBuffer([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
      })
    );
    expect(resultado).toEqual({ valido: true, tipoDetectado: "image/png", erros: [] });
  });

  it("aceita JPEG com assinatura correta", () => {
    const resultado = validarArquivoDocumentoBoleto(
      arquivoBase({
        nomeArquivo: "boleto.jpg",
        tipoArquivo: "image/jpeg",
        conteudo: bytesParaArrayBuffer([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      })
    );
    expect(resultado).toEqual({ valido: true, tipoDetectado: "image/jpeg", erros: [] });
  });

  it("rejeita arquivo vazio", () => {
    const resultado = validarArquivoDocumentoBoleto(
      arquivoBase({ tamanhoBytes: 0, conteudo: new ArrayBuffer(0) })
    );
    expect(resultado.valido).toBe(false);
    expect(resultado.erros).toContain("Arquivo de boleto está vazio.");
  });

  it("rejeita arquivo maior que 10 MB", () => {
    const resultado = validarArquivoDocumentoBoleto(
      arquivoBase({ tamanhoBytes: LIMITE_TAMANHO_BYTES + 1 })
    );
    expect(resultado.valido).toBe(false);
    expect(resultado.erros).toContain("Arquivo de boleto excede o limite de 10 MB.");
  });

  it("rejeita extensão ou MIME incompatível", () => {
    const resultado = validarArquivoDocumentoBoleto(
      arquivoBase({ nomeArquivo: "boleto.pdf", tipoArquivo: "image/png" })
    );
    expect(resultado.valido).toBe(false);
    expect(resultado.erros).toContain("Extensão e MIME type do arquivo de boleto são incompatíveis.");
  });

  it("rejeita PDF falso", () => {
    const resultado = validarArquivoDocumentoBoleto(
      arquivoBase({ conteudo: textoParaArrayBuffer("texto comum renomeado") })
    );
    expect(resultado.valido).toBe(false);
    expect(resultado.erros).toContain("Assinatura inicial do arquivo é incompatível com o tipo informado.");
  });

  it("calcula o SHA-256 conhecido de abc", async () => {
    await expect(calcularHashSHA256(textoParaArrayBuffer("abc"))).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("registra somente metadados, sem conteúdo binário", async () => {
    const db = structuredClone(seedDB) as DB;
    const conteudo = bytesParaArrayBuffer([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

    const resultado = await registrarDocumentoBoleto(
      db,
      {
        contaPagarId: "cp-1",
        arquivo: arquivoBase({ conteudo, tamanhoBytes: conteudo.byteLength }),
        linhaInformada: LINHA_BANCARIA_47,
      },
      {
        agora: "2026-07-24T12:00:00.000Z",
        gerarId: () => "doc-1",
      }
    );

    expect(resultado.sucesso).toBe(true);
    expect(db.documentos_boleto).toHaveLength(1);
    expect(db.documentos_boleto[0]).toEqual({
      id: "doc-1",
      conta_pagar_id: "cp-1",
      nome_arquivo: "boleto.pdf",
      tipo_arquivo: "application/pdf",
      tamanho_bytes: conteudo.byteLength,
      hash_sha256: expect.any(String),
      linha_informada: LINHA_BANCARIA_47,
      codigo_canonico: CODIGO_BARRAS_44,
      formato_boleto: "linha_digitavel_bancaria_47",
      criado_em: "2026-07-24T12:00:00.000Z",
      criado_por: "usuário local",
    });
    expect(Object.keys(db.documentos_boleto[0]).some((chave) => /conteudo|blob|base64|arraybuffer/i.test(chave))).toBe(false);
  });

  it("rejeita linha digitável inválida", async () => {
    const db = structuredClone(seedDB) as DB;

    const resultado = await registrarDocumentoBoleto(db, {
      arquivo: arquivoBase(),
      linhaInformada: "34191.23455 67890.123457 67890.123457 1 12340000001000",
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erros).toContain("Campo 1 da linha digitável bancária é inválido.");
    expect(db.documentos_boleto).toHaveLength(0);
  });

  it("detecta duplicidade pelo hash", async () => {
    const db = structuredClone(seedDB) as DB;
    const arquivo = arquivoBase();

    const primeiro = await registrarDocumentoBoleto(
      db,
      { arquivo },
      { gerarId: () => "doc-1", agora: "2026-07-24T12:00:00.000Z" }
    );
    const segundo = await registrarDocumentoBoleto(
      db,
      { arquivo },
      { gerarId: () => "doc-2", agora: "2026-07-24T12:01:00.000Z" }
    );

    expect(primeiro.sucesso).toBe(true);
    expect(segundo.sucesso).toBe(false);
    expect(segundo.erros).toContain("Documento de boleto já registrado com o mesmo hash SHA-256.");
    expect(segundo.duplicadoPorHash?.id).toBe("doc-1");
  });

  it("detecta duplicidade pelo código canônico 44/47", async () => {
    const db = structuredClone(seedDB) as DB;

    const primeiro = await registrarDocumentoBoleto(
      db,
      {
        arquivo: arquivoBase({ nomeArquivo: "boleto1.pdf", conteudo: bytesParaArrayBuffer([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]) }),
        linhaInformada: CODIGO_BARRAS_44,
      },
      { gerarId: () => "doc-1", agora: "2026-07-24T12:00:00.000Z" }
    );

    const segundo = await registrarDocumentoBoleto(
      db,
      {
        arquivo: arquivoBase({ nomeArquivo: "boleto2.pdf", conteudo: bytesParaArrayBuffer([0x25, 0x50, 0x44, 0x46, 0x2d, 0x32]) }),
        linhaInformada: LINHA_BANCARIA_47,
      },
      { gerarId: () => "doc-2", agora: "2026-07-24T12:01:00.000Z" }
    );

    expect(primeiro.sucesso).toBe(true);
    expect(segundo.sucesso).toBe(false);
    expect(segundo.erros).toContain("Documento de boleto já registrado com o mesmo código canônico.");
    expect(segundo.duplicadoPorCodigoCanonico?.id).toBe("doc-1");
  });
});

describe("recebimento de boleto em conta a pagar", () => {
  function contaBase() {
    return {
      id: "cp-1",
      fornecedor_id: "forn-hortifruti",
      descricao: "Conta teste",
      origem: "manual" as const,
      documento_id: "DOC-1",
      categoria: "Compras",
      data_emissao: "2026-07-20",
      data_vencimento: "2026-07-25",
      valor_original: 100,
      valor_final: 100,
      status: "aguardando_boleto" as const,
      criado_em: "2026-07-20T12:00:00.000Z",
      atualizado_em: "2026-07-20T12:00:00.000Z",
    };
  }

  it("recebimento válido registra documento", async () => {
    const db = structuredClone(seedDB) as DB;
    db.contas_pagar.push(contaBase());

    const resultado = await receberBoletoContaPagar(
      db,
      { contaPagarId: "cp-1", arquivo: arquivoBase(), linhaInformada: LINHA_BANCARIA_47 },
      { gerarId: () => "doc-1", gerarIdHistorico: () => "cph-1", agora: "2026-07-24T12:00:00.000Z" }
    );

    expect(resultado.sucesso).toBe(true);
    expect(db.documentos_boleto).toHaveLength(1);
    expect(db.documentos_boleto[0].id).toBe("doc-1");
  });

  it("recebimento válido muda a conta para boleto_recebido", async () => {
    const db = structuredClone(seedDB) as DB;
    db.contas_pagar.push(contaBase());

    const resultado = await receberBoletoContaPagar(
      db,
      { contaPagarId: "cp-1", arquivo: arquivoBase(), linhaInformada: LINHA_BANCARIA_47 },
      { agora: "2026-07-24T12:00:00.000Z" }
    );

    expect(resultado.sucesso).toBe(true);
    expect(db.contas_pagar[0].status).toBe("boleto_recebido");
  });

  it("recebimento válido cria histórico", async () => {
    const db = structuredClone(seedDB) as DB;
    db.contas_pagar.push(contaBase());

    const resultado = await receberBoletoContaPagar(
      db,
      { contaPagarId: "cp-1", arquivo: arquivoBase(), linhaInformada: LINHA_BANCARIA_47 },
      { gerarIdHistorico: () => "cph-1", agora: "2026-07-24T12:00:00.000Z" }
    );

    expect(resultado.sucesso).toBe(true);
    expect(db.conta_pagar_historico).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "cph-1",
          conta_pagar_id: "cp-1",
          acao: "documento_boleto_registrado",
          status_anterior: "aguardando_boleto",
          status_novo: "boleto_recebido",
          responsavel: "usuário local",
        }),
      ])
    );
  });

  it("arquivo inválido não altera a conta", async () => {
    const db = structuredClone(seedDB) as DB;
    db.contas_pagar.push(contaBase());

    const resultado = await receberBoletoContaPagar(db, {
      contaPagarId: "cp-1",
      arquivo: arquivoBase({ conteudo: new ArrayBuffer(0), tamanhoBytes: 0 }),
      linhaInformada: LINHA_BANCARIA_47,
    });

    expect(resultado.sucesso).toBe(false);
    expect(db.contas_pagar[0].status).toBe("aguardando_boleto");
    expect(db.conta_pagar_historico).toHaveLength(0);
    expect(db.documentos_boleto).toHaveLength(0);
  });

  it("linha inválida não altera a conta", async () => {
    const db = structuredClone(seedDB) as DB;
    db.contas_pagar.push(contaBase());

    const resultado = await receberBoletoContaPagar(db, {
      contaPagarId: "cp-1",
      arquivo: arquivoBase(),
      linhaInformada: "34191.23455 67890.123457 67890.123457 1 12340000001000",
    });

    expect(resultado.sucesso).toBe(false);
    expect(db.contas_pagar[0].status).toBe("aguardando_boleto");
    expect(db.conta_pagar_historico).toHaveLength(0);
    expect(db.documentos_boleto).toHaveLength(0);
  });

  it("boleto duplicado não altera conta nem histórico", async () => {
    const db = structuredClone(seedDB) as DB;
    db.contas_pagar.push(contaBase(), { ...contaBase(), id: "cp-2", descricao: "Conta 2" });

    const primeiro = await receberBoletoContaPagar(
      db,
      { contaPagarId: "cp-1", arquivo: arquivoBase({ nomeArquivo: "boleto1.pdf" }), linhaInformada: LINHA_BANCARIA_47 },
      { gerarId: () => "doc-1", gerarIdHistorico: () => "cph-1", agora: "2026-07-24T12:00:00.000Z" }
    );

    const historicoAntes = db.conta_pagar_historico.length;
    const segundo = await receberBoletoContaPagar(
      db,
      {
        contaPagarId: "cp-2",
        arquivo: arquivoBase({ nomeArquivo: "boleto2.pdf", conteudo: bytesParaArrayBuffer([0x25, 0x50, 0x44, 0x46, 0x2d, 0x32]) }),
        linhaInformada: CODIGO_BARRAS_44,
      },
      { gerarId: () => "doc-2", gerarIdHistorico: () => "cph-2", agora: "2026-07-24T12:01:00.000Z" }
    );

    expect(primeiro.sucesso).toBe(true);
    expect(segundo.sucesso).toBe(false);
    expect(db.contas_pagar.find((conta) => conta.id === "cp-2")?.status).toBe("aguardando_boleto");
    expect(db.conta_pagar_historico).toHaveLength(historicoAntes);
  });

  it("conta inexistente retorna erro sem gravar documento", async () => {
    const db = structuredClone(seedDB) as DB;

    const resultado = await receberBoletoContaPagar(db, {
      contaPagarId: "cp-inexistente",
      arquivo: arquivoBase(),
      linhaInformada: LINHA_BANCARIA_47,
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erros).toContain("Conta a pagar não encontrada.");
    expect(db.documentos_boleto).toHaveLength(0);
    expect(db.conta_pagar_historico).toHaveLength(0);
  });

  it("não altera conta nem documento apenas pela identificação automática", () => {
    const db = structuredClone(seedDB) as DB;
    db.contas_pagar.push(contaBase());
    const snapshot = structuredClone(db);

    const resultado = identificarBoletosValidosNoTexto(`Documento contém ${LINHA_BANCARIA_47}`);

    expect(resultado.validos).toHaveLength(1);
    expect(db).toEqual(snapshot);
  });
});