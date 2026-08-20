import { validarChaveAcessoNfe } from "./boleto-nfe-confronto";

export interface NotaIdentificadaDanfe {
  chave: string;
  numero: string;
  cnpj: string;
}

export interface OpcoesIdentificarNota {
  /** QR / digitação da chave: aceita 44 dígitos mesmo sem DV válido. */
  aceitarSemDv?: boolean;
}

/** Converte confusões comuns de OCR em dígitos e descarta o resto. */
export function digitosComCorrecaoOcr(texto: string): string {
  let out = "";
  for (const ch of texto) {
    if (/\d/.test(ch)) {
      out += ch;
      continue;
    }
    // Confusões frequentes em impressão/OCR de DANFE
    if ("OoDdQq".includes(ch)) out += "0";
    else if ("IiLl|!".includes(ch)) out += "1";
    else if ("Zz".includes(ch)) out += "2";
    else if ("Aa".includes(ch)) out += "4";
    else if ("Ss".includes(ch)) out += "5";
    else if ("Gg".includes(ch)) out += "6";
    else if ("Tt".includes(ch)) out += "7";
    else if ("Bb".includes(ch)) out += "8";
  }
  return out;
}

function montarNotaDaChave(chave: string): NotaIdentificadaDanfe {
  return {
    chave,
    cnpj: chave.slice(6, 20),
    numero: String(Number(chave.slice(25, 34)) || 0),
  };
}

/** Coleta candidatos de 44 dígitos (janela deslizante) a partir de um fluxo só de dígitos. */
export function candidatosChave44(digitos: string): string[] {
  const limpo = digitos.replace(/\D/g, "");
  if (limpo.length < 44) return [];
  const vistos = new Set<string>();
  const lista: string[] = [];
  for (let i = 0; i <= limpo.length - 44; i += 1) {
    const chave = limpo.slice(i, i + 44);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    lista.push(chave);
  }
  return lista;
}

/** Prefere chave rotulada no DANFE (“Chave de Acesso …”). */
export function extrairChavesRotuladasDanfe(texto: string): string[] {
  const regex =
    /(chave\s*de\s*acesso(?:\s*da\s*nf-?e)?|chave\s*nf-?e|chave\s*de\s*acesso)[^\d]{0,40}((?:\d[\s.\-]*){44})/gim;
  const candidatas: string[] = [];
  for (const match of Array.from(texto.matchAll(regex))) {
    const chave = (match[2] ?? "").replace(/\D/g, "");
    if (chave.length === 44) candidatas.push(chave);
  }
  return candidatas;
}

/**
 * Identifica NF-e/DANFE pela chave de acesso em texto de QR, PDF ou OCR.
 * Prefere rótulo “Chave de Acesso” e dígito verificador válido.
 * Sem DV só com `aceitarSemDv` (ex.: QR colado).
 */
export function identificarNotaPorTexto(
  codigoOuTexto: string,
  opcoes?: OpcoesIdentificarNota
): NotaIdentificadaDanfe | null {
  const bruto = codigoOuTexto ?? "";
  if (!bruto.trim()) return null;

  const prioridade: string[] = [];
  for (const chave of extrairChavesRotuladasDanfe(bruto)) {
    prioridade.push(chave);
  }
  for (const chave of extrairChavesRotuladasDanfe(digitosComCorrecaoOcr(bruto))) {
    prioridade.push(chave);
  }

  const fluxos = [bruto.replace(/\D/g, ""), digitosComCorrecaoOcr(bruto)];
  for (const fluxo of fluxos) {
    for (const chave of candidatosChave44(fluxo)) {
      prioridade.push(chave);
    }
  }

  const vistos = new Set<string>();
  for (const chave of prioridade) {
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    if (validarChaveAcessoNfe(chave)) {
      return montarNotaDaChave(chave);
    }
  }

  if (opcoes?.aceitarSemDv) {
    const limpo = bruto.replace(/\D/g, "");
    if (limpo.length === 44) return montarNotaDaChave(limpo);
    const match = bruto.match(/\d{44}/);
    if (match) return montarNotaDaChave(match[0]);
  }

  return null;
}
