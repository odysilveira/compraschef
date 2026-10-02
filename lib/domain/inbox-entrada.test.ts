import { describe, expect, it } from "vitest";
import {
  mapearTipoRecebimentoParaInbox,
  montarSugestaoInbox,
  ordenarFilaInboxPorData,
  sugerirAcaoInboxDeClassificacao,
  taxonomiaPastasInbox,
  tipoRecebimentoDaCompra,
} from "./inbox-entrada";
import {
  faseFilaInbox,
  itemInboxAberto,
  rotuloStatusItemInbox,
} from "./inbox-entrada-idb";
import { NOME_PASTA_INBOX, PASTAS_INBOX, nomeArquivoSeguro } from "./onedrive-pasta-local";

describe("status da fila na caixa", () => {
  it("pendente = a classificar; a_conferir fica aberto até concluir", () => {
    expect(itemInboxAberto("pendente")).toBe(true);
    expect(itemInboxAberto("a_conferir")).toBe(true);
    expect(itemInboxAberto("em_andamento")).toBe(true);
    expect(itemInboxAberto("concluido")).toBe(false);
    expect(faseFilaInbox("pendente")).toBe("a_classificar");
    expect(faseFilaInbox("a_conferir")).toBe("a_conferir");
    expect(rotuloStatusItemInbox("pendente")).toBe("A classificar");
    expect(rotuloStatusItemInbox("a_conferir")).toBe("A conferir");
  });
});

describe("taxonomia OneDrive inbox", () => {
  it("expõe pastas padrão sob ComprasChef-Inbox", () => {
    expect(NOME_PASTA_INBOX).toBe("ComprasChef-Inbox");
    expect(taxonomiaPastasInbox()).toEqual([...PASTAS_INBOX]);
    expect(PASTAS_INBOX).toContain("_a-identificar");
    expect(PASTAS_INBOX).toContain("restaurante/fotos");
    expect(PASTAS_INBOX).toContain("restaurante/documentos");
    expect(PASTAS_INBOX).toContain("pessoal");
  });

  it("sanitiza nomes de arquivo", () => {
    expect(nomeArquivoSeguro('foto<>:"/x.png')).toBe("foto_____x.png");
    expect(nomeArquivoSeguro("")).toBe("arquivo");
  });
});

describe("sugestão caixa de entrada", () => {
  it("mapeia compra para fluxos certos", () => {
    expect(montarSugestaoInbox("pdf_boleto")).toMatchObject({
      canal: "compra",
      fluxoCompra: "financeiro",
    });
    expect(montarSugestaoInbox("pdf_boleto").rotulo).toMatch(/Conferência/i);
    expect(montarSugestaoInbox("xml_nfe")).toMatchObject({
      canal: "compra",
      fluxoCompra: "recebimento",
    });
    expect(montarSugestaoInbox("pdf_danfe").canal).toBe("compra");
    expect(montarSugestaoInbox("pdf_nfse").canal).toBe("compra");
  });

  it("mapeia foto/doc/pessoal/indefinido para OneDrive", () => {
    expect(montarSugestaoInbox("foto_restaurante")).toMatchObject({
      canal: "onedrive",
      pastaOneDrive: "restaurante/fotos",
    });
    expect(montarSugestaoInbox("documento_restaurante")).toMatchObject({
      canal: "onedrive",
      pastaOneDrive: "restaurante/documentos",
    });
    expect(montarSugestaoInbox("pessoal")).toMatchObject({
      canal: "onedrive",
      pastaOneDrive: "pessoal",
    });
    expect(montarSugestaoInbox("desconhecido")).toMatchObject({
      canal: "onedrive",
      pastaOneDrive: "_a-identificar",
    });
  });

  it("converte tipos do lote para destino inbox", () => {
    expect(mapearTipoRecebimentoParaInbox("imagem")).toBe("foto_restaurante");
    expect(
      mapearTipoRecebimentoParaInbox("desconhecido", {
        mimeType: "application/pdf",
        nomeArquivo: "contrato.pdf",
      })
    ).toBe("documento_restaurante");
    expect(
      mapearTipoRecebimentoParaInbox("desconhecido", {
        mimeType: "application/octet-stream",
        nomeArquivo: "arquivo.bin",
      })
    ).toBe("desconhecido");
    expect(mapearTipoRecebimentoParaInbox("pdf_boleto")).toBe("pdf_boleto");
    expect(
      mapearTipoRecebimentoParaInbox("pdf_danfe", {
        nomeArquivo: "CNH-e.pdf.pdf",
      })
    ).toBe("pessoal");
    expect(
      mapearTipoRecebimentoParaInbox("desconhecido", {
        nomeArquivo: "Producao_diaria.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
    ).toBe("documento_restaurante");
  });

  it("sugerirAcaoInboxDeClassificacao amarra classificação → ação", () => {
    const foto = sugerirAcaoInboxDeClassificacao("imagem");
    expect(foto.tipo).toBe("foto_restaurante");
    expect(foto.canal).toBe("onedrive");

    const boleto = sugerirAcaoInboxDeClassificacao("pdf_boleto");
    expect(boleto.fluxoCompra).toBe("financeiro");
  });

  it("tipoRecebimentoDaCompra só para tipos de compra", () => {
    expect(tipoRecebimentoDaCompra("xml_nfe")).toBe("xml_nfe");
    expect(tipoRecebimentoDaCompra("foto_restaurante")).toBeNull();
  });

  it("pastaPadraoEnvioOneDrive usa a identificar para compra", async () => {
    const { pastaPadraoEnvioOneDrive } = await import("./inbox-entrada");
    expect(pastaPadraoEnvioOneDrive("pdf_boleto")).toBe("_a-identificar");
    expect(pastaPadraoEnvioOneDrive("foto_restaurante")).toBe("restaurante/fotos");
  });

  it("ordenarFilaInboxPorData respeita recentes/antigos", () => {
    const itens = [
      { id: "a", adicionadoEm: 100 },
      { id: "b", adicionadoEm: 300 },
      { id: "c", adicionadoEm: 200 },
    ];
    expect(ordenarFilaInboxPorData(itens, true).map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(ordenarFilaInboxPorData(itens, false).map((i) => i.id)).toEqual(["a", "c", "b"]);
  });
});
