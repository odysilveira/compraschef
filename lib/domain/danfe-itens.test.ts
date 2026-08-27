import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  extrairItensDanfeDeTexto,
  extrairItensDanfeDeXml,
  extrairItensDanfePipeline,
  validarTotalItensDanfe,
} from "./danfe-itens";

const XML_LAYOUT_A = `
<NFe>
  <infNFe>
    <det nItem="1"><prod><cProd>FORN-001</cProd><xProd>FILE MIGNON PORCIONADO 180G</xProd><NCM>02013000</NCM><CFOP>5102</CFOP><uCom>KG</uCom><qCom>2.5000</qCom><vUnCom>80.0000000000</vUnCom><vProd>200.00</vProd></prod></det>
    <det nItem="2"><prod><cProd>FORN-002</cProd><xProd>MOLHO TOMATE ARTESANAL</xProd><NCM>21032010</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>3.0000</qCom><vUnCom>15.5000000000</vUnCom><vProd>46.50</vProd></prod></det>
    <total><ICMSTot><vProd>246.50</vProd></ICMSTot></total>
  </infNFe>
</NFe>`;

const XML_LAYOUT_A_COM_NAMESPACE = `<?xml version="1.0" encoding="UTF-8"?>
<nfe:NFe xmlns:nfe="http://www.portalfiscal.inf.br/nfe">
  <nfe:infNFe>
    <nfe:det nItem="1"><nfe:prod>
      <nfe:cProd>FORN-NS-001</nfe:cProd><nfe:xProd>ARROZ TIPO 1</nfe:xProd><nfe:NCM>10063021</nfe:NCM><nfe:CFOP>5102</nfe:CFOP>
      <nfe:uCom>KG</nfe:uCom><nfe:qCom>5.0000</nfe:qCom><nfe:vUnCom>6.5000</nfe:vUnCom><nfe:vProd>32.50</nfe:vProd>
    </nfe:prod></nfe:det>
    <nfe:total><nfe:ICMSTot><nfe:vProd>32.50</nfe:vProd></nfe:ICMSTot></nfe:total>
  </nfe:infNFe>
</nfe:NFe>`;

const TEXTO_PDF_LAYOUT_B = `
DANFE DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRONICA
VALOR TOTAL DOS PRODUTOS R$ 328,54
CODIGO DESCRICAO NCM CFOP UN QTD V.UNIT V.TOTAL
1100 DETERGENTE GLASS 05 ML MULTIUSO 34029039 5102 UN 40,0000 7,5000 300,00
NF-03513476 DESENGRAXANTE H DE ALTA PERFORMANCE 34029039 5102 UN 1,0000 28,5400 28,54
`;

const TEXTO_OCR_LAYOUT_C = `
DANFE - texto reconhecido por OCR
TOTAL DOS PRODUTOS 99,90
COD DESCRICAO NCM CFOP UN QTD UNIT TOTAL
7891 QUEIJO MUSSARELA FATIADO
PACOTE 1KG 04061010 5405 KG 1,500 44,000 66,00
7892 TOMATE ITALIANO MADURO
CAIXA SELECIONADA 07020000 5405 KG 3,000 11,300 33,90
`;

describe("danfe-itens", () => {
  it("prioriza XML da NF-e e extrai campos fiscais e valores", () => {
    const resultado = extrairItensDanfePipeline({
      xmlNfe: XML_LAYOUT_A,
      textoPdf: TEXTO_PDF_LAYOUT_B,
      textoOcr: TEXTO_OCR_LAYOUT_C,
    });

    expect(resultado.fonte).toBe("xml_nfe");
    expect(resultado.itens).toHaveLength(2);
    expect(resultado.itens[0]).toMatchObject({
      codigoFornecedor: "FORN-001",
      descricao: "FILE MIGNON PORCIONADO 180G",
      ncm: "02013000",
      cfop: "5102",
      unidade: "KG",
      quantidade: 2.5,
      valorUnitario: 80,
      valorTotal: 200,
      statusVinculo: "pendente",
    });
    expect(resultado.itens[0].confianca).toBeGreaterThan(0.9);
    expect(resultado.totalItensCalculado).toBe(246.5);
    expect(resultado.divergenciaTotal).toBe(0);
    expect(resultado.avisosGerais).toEqual([]);
  });

  it("extrai XML tradicional sem prefixo", () => {
    expect(extrairItensDanfeDeXml(XML_LAYOUT_A)).toHaveLength(2);
    expect(extrairItensDanfePipeline({ xmlNfe: XML_LAYOUT_A }).divergenciaTotal).toBe(0);
  });

  it("extrai XML com namespace/prefixo sem remover suporte atual", () => {
    const resultado = extrairItensDanfePipeline({ xmlNfe: XML_LAYOUT_A_COM_NAMESPACE });
    expect(resultado.fonte).toBe("xml_nfe");
    expect(resultado.itens).toHaveLength(1);
    expect(resultado.itens[0]).toMatchObject({
      codigoFornecedor: "FORN-NS-001",
      descricao: "ARROZ TIPO 1",
      ncm: "10063021",
      cfop: "5102",
      unidade: "KG",
      quantidade: 5,
      valorTotal: 32.5,
      statusVinculo: "pendente",
    });
    expect(resultado.divergenciaTotal).toBe(0);
  });

  it("extrai itens do texto interno do PDF com NCM, CFOP e soma conferida", () => {
    const resultado = extrairItensDanfePipeline({ textoPdf: TEXTO_PDF_LAYOUT_B });

    expect(resultado.fonte).toBe("pdf_texto");
    expect(resultado.itens).toHaveLength(2);
    expect(resultado.itens[1]).toMatchObject({
      codigoFornecedor: "NF-03513476",
      descricao: "DESENGRAXANTE H DE ALTA PERFORMANCE",
      ncm: "34029039",
      cfop: "5102",
      unidade: "UN",
      quantidade: 1,
      valorUnitario: 28.54,
      valorTotal: 28.54,
    });
    expect(resultado.totalProdutosNota).toBe(328.54);
    expect(resultado.divergenciaTotal).toBe(0);
  });

  it("trata descricoes quebradas em varias linhas vindas de OCR e marca menor confianca", () => {
    const resultado = extrairItensDanfePipeline({ textoOcr: TEXTO_OCR_LAYOUT_C });

    expect(resultado.fonte).toBe("ocr");
    expect(resultado.itens).toHaveLength(2);
    expect(resultado.itens[0].descricao).toBe("QUEIJO MUSSARELA FATIADO PACOTE 1KG");
    expect(resultado.itens[0]).toMatchObject({
      codigoFornecedor: "7891",
      ncm: "04061010",
      cfop: "5405",
      unidade: "KG",
      quantidade: 1.5,
      valorTotal: 66,
      statusVinculo: "pendente",
    });
    expect(resultado.itens[0].confianca).toBeLessThan(0.8);
    expect(resultado.avisosGerais.join(" ")).toMatch(/conferencia humana/i);
    expect(resultado.divergenciaTotal).toBe(0);
  });

  it("avisa quando campos estao duvidosos e quando soma nao bate", () => {
    const itens = extrairItensDanfeDeTexto("ABC PRODUTO SEM FISCAL UN 2 10,00 19,00", "pdf_texto");
    const validacao = validarTotalItensDanfe(itens, 20);

    expect(itens).toHaveLength(1);
    expect(itens[0].avisos).toEqual(expect.arrayContaining(["NCM ausente.", "CFOP ausente."]));
    expect(itens[0].avisos.join(" ")).toMatch(/diverge/i);
    expect(validacao.divergenciaTotal).toBe(-1);
    expect(validacao.avisosGerais.join(" ")).toMatch(/Soma dos itens diverge/i);
  });

  it("mantem itens extraidos pendentes e sem criacao automatica de estoque", () => {
    const resultado = extrairItensDanfePipeline({ xmlNfe: XML_LAYOUT_A });
    expect(resultado.itens.every((item) => item.statusVinculo === "pendente")).toBe(true);

    const codigoDominio = readFileSync("lib/domain/danfe-itens.ts", "utf8");
    expect(codigoDominio).not.toMatch(/mutate|criarLote|movimentos_estoque|recebimentos|recebimento_itens|notas_fiscais/);
  });

  it("nao contem mojibake nos arquivos tocados", () => {
    const arquivos = [
      "components/operacao/ReceberDanfe.tsx",
      "lib/domain/danfe-captura-browser.ts",
      "lib/domain/danfe-extracao.ts",
      "lib/domain/danfe-itens.ts",
      "lib/domain/danfe-itens.test.ts",
    ];
    const padraoMojibake = new RegExp(["\\u00c3", "\\u00c2", "\\u00e2\\u20ac", "\\ufffd"].join("|"));
    for (const arquivo of arquivos) {
      expect(readFileSync(arquivo, "utf8"), arquivo).not.toMatch(padraoMojibake);
    }
  });
});