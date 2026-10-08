import { normalizarDuplicatasLidas } from "@/lib/domain/nfe-parcelas";
import type { DuplicataNotaTemporaria, NotaFiscal } from "@/lib/types";

export type ItemNFeLido = {
  indice: number;
  cProd: string;
  cEAN: string;
  xProd: string;
  uCom: string;
  qCom: number;
  vUnCom: number;
};

export type NotaNFeLida = {
  emitCnpj: string;
  emitNome: string;
  numero: string;
  chave: string;
  valorTotal: number;
  duplicatas: DuplicataNotaTemporaria[];
  itens: ItemNFeLido[];
};

/** Lê o XML da NF-e no navegador (DOMParser) e extrai o essencial. */
export function lerNFe(xmlTexto: string): NotaNFeLida | null {
  try {
    const doc = new DOMParser().parseFromString(xmlTexto, "text/xml");
    if (doc.querySelector("parsererror")) return null;
    const texto = (seletor: string, base: Element | Document = doc) =>
      base.querySelector(seletor)?.textContent?.trim() ?? "";

    const emit = doc.querySelector("emit");
    if (!emit) return null;

    const infNFe = doc.querySelector("infNFe");
    const chave = (infNFe?.getAttribute("Id") ?? "").replace(/^NFe/, "");

    const itens: ItemNFeLido[] = Array.from(doc.querySelectorAll("det")).map((det, indice) => ({
      indice,
      cProd: texto("prod > cProd", det),
      cEAN: texto("prod > cEAN", det),
      xProd: texto("prod > xProd", det),
      uCom: texto("prod > uCom", det),
      qCom: Number(texto("prod > qCom", det)) || 0,
      vUnCom: Number(texto("prod > vUnCom", det)) || 0,
    }));
    if (itens.length === 0) return null;

    const duplicatas = normalizarDuplicatasLidas(
      Array.from(doc.querySelectorAll("dup")).map((dup) => ({
        numero_parcela: texto("nDup", dup) || undefined,
        vencimento: texto("dVenc", dup),
        valor: Number(texto("vDup", dup)) || 0,
      }))
    );

    return {
      emitCnpj: texto("CNPJ", emit),
      emitNome: texto("xNome", emit),
      numero: texto("ide > nNF"),
      chave,
      valorTotal: Number(texto("ICMSTot > vNF")) || 0,
      duplicatas,
      itens,
    };
  } catch {
    return null;
  }
}

/** Monta um NotaFiscal mínimo para reutilizar a vista legível (DANFE auxiliar). */
export function notaFiscalApartirDaNFeLida(lida: NotaNFeLida): NotaFiscal {
  return {
    id: "xml-preview",
    fornecedor_id: "",
    numero: lida.numero,
    chave_acesso: lida.chave,
    cnpj_emitente: lida.emitCnpj,
    razao_social_emitente: lida.emitNome,
    valor_total: lida.valorTotal,
    emitida_em: "",
    importada_em: "",
    status: "aguardando_conferencia",
    tipo: "nfe",
    itens_importados: lida.itens.map((item) => ({
      codigo: item.cProd || undefined,
      ean: item.cEAN || undefined,
      descricao: item.xProd,
      unidade: item.uCom,
      quantidade: item.qCom,
      preco_unitario: item.vUnCom,
    })),
  };
}
