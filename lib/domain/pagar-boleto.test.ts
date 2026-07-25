import { describe, expect, it } from "vitest";
import type { Boleto, DB, DocumentoBoleto } from "../types";
import { seedDB } from "../data/seed";
import {
  acoesPagamentoDisponiveisNoLayout,
  alternarCodigoAberto,
  avaliarElegibilidadePagamentoBoleto,
  criarSnapshotPagamentoBoleto,
  gerarPadraoInterleaved2of5,
  informarPagamentoBoleto,
  montarEstadoAgendaPagamentoBoleto,
  obterCodigoCanonicoConfirmadoDoDocumento,
} from "./pagar-boleto";

function dbTeste(): DB {
  const db = structuredClone(seedDB) as DB;
  db.boletos = [
    {
      id: "bol-ok",
      nota_id: "nf-1",
      numero_parcela: "001",
      valor: 318.4,
      vencimento: "2026-08-10",
      linha_digitavel: "34191234546789012345767890123457112340000001000",
      status: "liberado",
      documento_boleto_id: "doc-1",
      status_conferencia: "conferido",
    },
  ];
  db.boleto_pagamentos_historico = [];
  db.contas_pagar = [];
  return db;
}

function boletoBase(overrides: Partial<Boleto> = {}): Boleto {
  return {
    id: "bol-x",
    nota_id: "nf-1",
    valor: 100,
    vencimento: "2026-08-10",
    linha_digitavel: "34191234546789012345767890123457112340000001000",
    status: "liberado",
    documento_boleto_id: "doc-1",
    status_conferencia: "conferido",
    ...overrides,
  };
}

function documentoBase(overrides: Partial<DocumentoBoleto> = {}): DocumentoBoleto {
  return {
    id: "doc-1",
    nome_arquivo: "boleto.pdf",
    tipo_arquivo: "application/pdf",
    tamanho_bytes: 1024,
    hash_sha256: "abc123",
    codigo_canonico: "34191123400000010001234567890123456789012345",
    resultado_confronto: "exata",
    confirmado_em: "2026-08-01T10:00:00.000Z",
    confirmado_por: "Marina",
    criado_em: "2026-08-01T09:00:00.000Z",
    criado_por: "Marina",
    ...overrides,
  };
}

describe("elegibilidade de pagamento do boleto", () => {
  it("permite boleto liberado e conferido", () => {
    const resultado = avaliarElegibilidadePagamentoBoleto(boletoBase());
    expect(resultado.permitido).toBe(true);
  });

  it("bloqueia boleto já pago", () => {
    const resultado = avaliarElegibilidadePagamentoBoleto(boletoBase({ status: "pago" }));
    expect(resultado.permitido).toBe(false);
    expect(resultado.motivoBloqueio).toBe("ja_pago");
  });

  it("bloqueia boleto em aguardando conciliação", () => {
    const resultado = avaliarElegibilidadePagamentoBoleto(boletoBase({ status: "aguardando_conciliacao" }));
    expect(resultado.permitido).toBe(false);
    expect(resultado.motivoBloqueio).toBe("ja_informado");
  });

  it("bloqueia boleto travado", () => {
    const resultado = avaliarElegibilidadePagamentoBoleto(boletoBase({ status: "travado" }));
    expect(resultado.permitido).toBe(false);
    expect(resultado.motivoBloqueio).toBe("status_invalido");
  });

  it("bloqueia boleto sem linha digitável", () => {
    const resultado = avaliarElegibilidadePagamentoBoleto(boletoBase({ linha_digitavel: "" }));
    expect(resultado.permitido).toBe(false);
    expect(resultado.motivoBloqueio).toBe("sem_linha_digitavel");
  });

  it("bloqueia boleto sem documento", () => {
    const resultado = avaliarElegibilidadePagamentoBoleto(boletoBase({ documento_boleto_id: undefined }));
    expect(resultado.permitido).toBe(false);
    expect(resultado.motivoBloqueio).toBe("sem_documento_boleto");
  });

  it("bloqueia boleto sem status de conferido", () => {
    const resultado = avaliarElegibilidadePagamentoBoleto(boletoBase({ status_conferencia: "em_analise" }));
    expect(resultado.permitido).toBe(false);
    expect(resultado.motivoBloqueio).toBe("sem_conferencia");
  });
});

describe("informar pagamento do boleto", () => {
  it("transiciona para aguardando_conciliacao e registra histórico", () => {
    const db = dbTeste();
    const snapshot = criarSnapshotPagamentoBoleto(db.boletos[0]);

    const resultado = informarPagamentoBoleto(
      db,
      "bol-ok",
      snapshot,
      {
        dataPagamento: "2026-08-08",
        valorPago: 318.4,
        bancoConta: "Banco X / Conta Operacional",
        responsavel: "Marina",
        observacao: "Pago no app do banco.",
        confirmouAviso: true,
      },
      {
        agora: "2026-08-08T10:00:00.000Z",
        gerarIdHistorico: () => "bph-1",
      }
    );

    expect(resultado.sucesso).toBe(true);
    expect(db.boletos[0].status).toBe("aguardando_conciliacao");
    expect(db.boletos[0].pagamento_data).toBe("2026-08-08");
    expect(db.boletos[0].pagamento_valor).toBe(318.4);
    expect(db.boletos[0].pagamento_banco_conta).toBe("Banco X / Conta Operacional");
    expect(db.boletos[0].pagamento_responsavel).toBe("Marina");
    expect(db.boletos[0].pagamento_observacao).toBe("Pago no app do banco.");
    expect(db.boletos[0].pagamento_informado_em).toBe("2026-08-08T10:00:00.000Z");

    expect(db.boleto_pagamentos_historico).toHaveLength(1);
    expect(db.boleto_pagamentos_historico[0]).toMatchObject({
      id: "bph-1",
      boleto_id: "bol-ok",
      nota_id: "nf-1",
      acao: "pagamento_informado",
      status_anterior: "liberado",
      status_novo: "aguardando_conciliacao",
      data_pagamento: "2026-08-08",
      valor_pago: 318.4,
      banco_conta: "Banco X / Conta Operacional",
      responsavel: "Marina",
      observado_em: "2026-08-08T10:00:00.000Z",
      observacao: "Pago no app do banco.",
    });
  });

  it("não muda para pago diretamente", () => {
    const db = dbTeste();
    const snapshot = criarSnapshotPagamentoBoleto(db.boletos[0]);

    informarPagamentoBoleto(db, "bol-ok", snapshot, {
      dataPagamento: "2026-08-08",
      valorPago: 318.4,
      bancoConta: "Banco Y",
      confirmouAviso: true,
    });

    expect(db.boletos[0].status).not.toBe("pago");
    expect(db.boletos[0].status).toBe("aguardando_conciliacao");
  });

  it("não cria conta a pagar durante informar pagamento", () => {
    const db = dbTeste();
    const snapshot = criarSnapshotPagamentoBoleto(db.boletos[0]);

    informarPagamentoBoleto(db, "bol-ok", snapshot, {
      dataPagamento: "2026-08-08",
      valorPago: 318.4,
      bancoConta: "Banco Z",
      confirmouAviso: true,
    });

    expect(db.contas_pagar).toHaveLength(0);
  });

  it("exige confirmação do aviso", () => {
    const db = dbTeste();
    const snapshot = criarSnapshotPagamentoBoleto(db.boletos[0]);

    const resultado = informarPagamentoBoleto(db, "bol-ok", snapshot, {
      dataPagamento: "2026-08-08",
      valorPago: 318.4,
      bancoConta: "Banco Z",
      confirmouAviso: false,
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erros).toContain("Confirme o aviso de responsabilidade antes de continuar.");
  });

  it("bloqueia quando boleto mudou desde snapshot", () => {
    const db = dbTeste();
    const snapshot = criarSnapshotPagamentoBoleto(db.boletos[0]);
    db.boletos[0].valor = 319;

    const resultado = informarPagamentoBoleto(db, "bol-ok", snapshot, {
      dataPagamento: "2026-08-08",
      valorPago: 318.4,
      bancoConta: "Banco Z",
      confirmouAviso: true,
    });

    expect(resultado.sucesso).toBe(false);
    expect(resultado.erros).toContain("O boleto mudou desde a abertura da tela. Reabra o pagamento e confirme novamente.");
    expect(db.boleto_pagamentos_historico).toHaveLength(0);
  });

  it("bloqueia segunda tentativa após pagamento informado", () => {
    const db = dbTeste();
    const snapshot1 = criarSnapshotPagamentoBoleto(db.boletos[0]);
    const primeiro = informarPagamentoBoleto(db, "bol-ok", snapshot1, {
      dataPagamento: "2026-08-08",
      valorPago: 318.4,
      bancoConta: "Banco A",
      confirmouAviso: true,
    });

    expect(primeiro.sucesso).toBe(true);

    const snapshot2 = criarSnapshotPagamentoBoleto(db.boletos[0]);
    const segundo = informarPagamentoBoleto(db, "bol-ok", snapshot2, {
      dataPagamento: "2026-08-09",
      valorPago: 318.4,
      bancoConta: "Banco A",
      confirmouAviso: true,
    });

    expect(segundo.sucesso).toBe(false);
    expect(segundo.erros[0]).toContain("Pagamento já informado");
    expect(db.boleto_pagamentos_historico).toHaveLength(1);
  });

  it("usa usuário local como responsável padrão", () => {
    const db = dbTeste();
    const snapshot = criarSnapshotPagamentoBoleto(db.boletos[0]);

    const resultado = informarPagamentoBoleto(db, "bol-ok", snapshot, {
      dataPagamento: "2026-08-08",
      valorPago: 318.4,
      bancoConta: "Banco A",
      confirmouAviso: true,
    });

    expect(resultado.sucesso).toBe(true);
    expect(db.boletos[0].pagamento_responsavel).toBe("usuário local");
    expect(db.boleto_pagamentos_historico[0].responsavel).toBe("usuário local");
  });
});

describe("Interleaved 2 of 5", () => {
  it("gera padrão estável para código canônico de 44 dígitos", () => {
    const codigo = "34191123400000010001234567890123456789012345";
    const padrao = gerarPadraoInterleaved2of5(codigo);

    expect(padrao.length).toBe(227);
    expect(padrao.slice(0, 4)).toEqual([
      { tipo: "bar", largo: false },
      { tipo: "space", largo: false },
      { tipo: "bar", largo: false },
      { tipo: "space", largo: false },
    ]);
    expect(padrao.slice(-3)).toEqual([
      { tipo: "bar", largo: true },
      { tipo: "space", largo: false },
      { tipo: "bar", largo: false },
    ]);
  });

  it("rejeita código com quantidade ímpar de dígitos", () => {
    expect(() => gerarPadraoInterleaved2of5("123")).toThrow("quantidade par");
  });
});

describe("estado da agenda de pagamento", () => {
  it("bloqueia pagamento e mostra importar quando não há código canônico confirmado", () => {
    const estado = montarEstadoAgendaPagamentoBoleto(boletoBase(), undefined);

    expect(estado.podeExibirCodigo).toBe(false);
    expect(estado.podeInformarPagamento).toBe(false);
    expect(estado.mostrarImportarBoleto).toBe(true);
    expect(estado.rotuloImportarBoleto).toBe("Reimportar boleto");
    expect(estado.motivoBloqueio).toBe("Código não preservado na importação anterior.");
  });

  it("libera ações quando boleto está elegível e documento confirmado com código canônico válido", () => {
    const documento = documentoBase();
    const estado = montarEstadoAgendaPagamentoBoleto(boletoBase(), documento);

    expect(estado.podeExibirCodigo).toBe(true);
    expect(estado.podeCopiarLinha).toBe(true);
    expect(estado.podeInformarPagamento).toBe(true);
    expect(estado.mostrarImportarBoleto).toBe(false);
    expect(estado.codigoCanonico).toBe(documento.codigo_canonico);
  });

  it("não considera código canônico sem confirmação explícita do documento", () => {
    const documento = documentoBase({ confirmado_em: undefined, confirmado_por: undefined });
    const codigo = obterCodigoCanonicoConfirmadoDoDocumento(documento);

    expect(codigo).toBeUndefined();
  });

  it("bloqueia ações para confronto divergente", () => {
    const estado = montarEstadoAgendaPagamentoBoleto(boletoBase(), documentoBase({ resultado_confronto: "divergente" }));

    expect(estado.podeExibirCodigo).toBe(false);
    expect(estado.podeCopiarLinha).toBe(false);
    expect(estado.podeInformarPagamento).toBe(false);
    expect(estado.mostrarImportarBoleto).toBe(false);
    expect(estado.motivoBloqueio).toContain("divergências");
  });

  it("bloqueia ações para boleto suspeito", () => {
    const estado = montarEstadoAgendaPagamentoBoleto(boletoBase({ status: "suspeito" }), documentoBase());

    expect(estado.podeExibirCodigo).toBe(false);
    expect(estado.podeCopiarLinha).toBe(false);
    expect(estado.podeInformarPagamento).toBe(false);
    expect(estado.motivoBloqueio).toContain("suspeito");
  });

  it("alterna abertura exclusiva de código por boleto", () => {
    expect(alternarCodigoAberto(null, "bol-1")).toBe("bol-1");
    expect(alternarCodigoAberto("bol-1", "bol-2")).toBe("bol-2");
    expect(alternarCodigoAberto("bol-2", "bol-2")).toBeNull();
  });

  it("mantém paridade de ações entre desktop e mobile", () => {
    const estado = montarEstadoAgendaPagamentoBoleto(boletoBase(), documentoBase());
    const desktop = acoesPagamentoDisponiveisNoLayout("desktop", estado);
    const mobile = acoesPagamentoDisponiveisNoLayout("mobile", estado);

    expect(desktop).toEqual(["exibir_codigo", "copiar_linha", "informar_pagamento"]);
    expect(mobile).toEqual(desktop);
  });
});
