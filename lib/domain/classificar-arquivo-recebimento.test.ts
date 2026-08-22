import { describe, expect, it } from "vitest";
import {
  classificarArquivoRecebimento,
  contarPorTipo,
  pareceXmlNfe,
} from "./classificar-arquivo-recebimento";
import { TEXTO_NFSE_DEMO_ANOTA_AI } from "./nfse";

function gerarChaveNfeValida(base43: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i -= 1) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  return `${base43}${dv >= 10 ? 0 : dv}`;
}

const CHAVE_NFE = gerarChaveNfeValida("3526071234567800019055001000045231100045231");
const LINHA_BANCARIA_47 = "34191.23454 67890.123457 67890.123457 1 12340000001000";

const XML_NFE = `<?xml version="1.0"?>
<nfeProc><NFe><infNFe Id="NFe${CHAVE_NFE}">
</infNFe></NFe></nfeProc>`;

describe("pareceXmlNfe", () => {
  it("reconhece nfeProc", () => {
    expect(pareceXmlNfe(XML_NFE)).toBe(true);
  });

  it("rejeita HTML genérico", () => {
    expect(pareceXmlNfe("<html><body>nota</body></html>")).toBe(false);
  });
});

describe("classificarArquivoRecebimento", () => {
  it("classifica XML de NF-e", () => {
    const r = classificarArquivoRecebimento({
      nomeArquivo: "nfe-123.xml",
      mimeType: "text/xml",
      texto: XML_NFE,
    });
    expect(r.tipo).toBe("xml_nfe");
    expect(r.confianca).toBe("alta");
  });

  it("classifica PDF de NFS-e", () => {
    const r = classificarArquivoRecebimento({
      nomeArquivo: "anota-ai.pdf",
      mimeType: "application/pdf",
      texto: TEXTO_NFSE_DEMO_ANOTA_AI,
    });
    expect(r.tipo).toBe("pdf_nfse");
    expect(r.confianca).toBe("alta");
    expect(r.resumo?.chaveNfse).toMatch(/^NFS/);
  });

  it("classifica boleto por linha digitável", () => {
    const r = classificarArquivoRecebimento({
      nomeArquivo: "cobranca.pdf",
      mimeType: "application/pdf",
      texto: `Boleto do fornecedor\nLinha: ${LINHA_BANCARIA_47}`,
    });
    expect(r.tipo).toBe("pdf_boleto");
    expect(r.confianca).toBe("alta");
  });

  it("classifica DANFE pela chave de acesso", () => {
    const r = classificarArquivoRecebimento({
      nomeArquivo: "danfe.pdf",
      mimeType: "application/pdf",
      texto: `DANFE\nChave de Acesso\n${CHAVE_NFE}`,
    });
    expect(r.tipo).toBe("pdf_danfe");
    expect(r.resumo?.chaveNfe).toBe(CHAVE_NFE);
  });

  it("prioriza NFS-e mesmo se houver números longos no texto", () => {
    const r = classificarArquivoRecebimento({
      nomeArquivo: "servico.pdf",
      mimeType: "application/pdf",
      texto: TEXTO_NFSE_DEMO_ANOTA_AI,
    });
    expect(r.tipo).toBe("pdf_nfse");
  });

  it("marca imagem para revisão / OCR", () => {
    const r = classificarArquivoRecebimento({
      nomeArquivo: "foto-nota.jpg",
      mimeType: "image/jpeg",
    });
    expect(r.tipo).toBe("imagem");
  });

  it("PDF sem texto fica desconhecido", () => {
    const r = classificarArquivoRecebimento({
      nomeArquivo: "scan.pdf",
      mimeType: "application/pdf",
      texto: "",
    });
    expect(r.tipo).toBe("desconhecido");
    expect(r.confianca).toBe("baixa");
  });

  it("conta tipos na triagem", () => {
    const contagem = contarPorTipo([
      { tipo: "xml_nfe" },
      { tipo: "xml_nfe" },
      { tipo: "pdf_boleto" },
      { tipo: "desconhecido" },
    ]);
    expect(contagem.xml_nfe).toBe(2);
    expect(contagem.pdf_boleto).toBe(1);
    expect(contagem.desconhecido).toBe(1);
    expect(contagem.pdf_nfse).toBe(0);
  });
});
