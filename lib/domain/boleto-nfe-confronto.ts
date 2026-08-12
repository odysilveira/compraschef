import type { Boleto, DB, NotaFiscal } from "../types";
import { converterLinha47ParaCodigo44, normalizarLinhaBoleto, validarBoleto } from "./boletos";

export interface DadosBoletoExtraidos {
  codigo_canonico: string;
  valor_codificado?: number;
  vencimento_extraido?: string;
  datas_encontradas: string[];
  cnpj_beneficiario?: string;
  cnpj_pagador?: string;
  cnpjs_encontrados: string[];
  chave_nfe?: string;
  numero_nfe?: string;
  numero_parcela?: string;
}

export type ClassificacaoConfrontoBoletoNfe =
  | "exata"
  | "parcial"
  | "divergente"
  | "sem_correspondencia"
  | "duplicada"
  | "multiplas_possibilidades";

export interface CandidatoConfronto {
  nota_id: string;
  boleto_id: string;
}

export interface ResultadoConfrontoBoletoNfe {
  classificacao: ClassificacaoConfrontoBoletoNfe;
  nota_id?: string;
  parcela_id?: string;
  candidatos: CandidatoConfronto[];
  criterios_coincidentes: string[];
  divergencias: string[];
  avisos: string[];
  exige_confirmacao_humana: boolean;
}

const TOLERANCIA_MONETARIA = 0.01;

function somenteDigitos(valor?: string): string {
  return (valor ?? "").replace(/\D+/g, "");
}

function deduplicar(valores: string[]): string[] {
  const set = new Set<string>();
  for (const valor of valores) {
    if (valor) set.add(valor);
  }
  return Array.from(set);
}

function normalizarDataIso(valor: string): string {
  const limpo = valor.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpo)) return limpo;
  const br = limpo.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!br) return limpo;
  return `${br[3]}-${br[2]}-${br[1]}`;
}

function extrairDatasRotuladas(texto: string): string[] {
  const regex = /(vencimento|venc\.?|data\s*de\s*vencimento|vencto)[^\d]{0,20}(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/gim;
  const datas: string[] = [];
  for (const match of Array.from(texto.matchAll(regex))) {
    const data = match[2];
    if (data) datas.push(normalizarDataIso(data));
  }
  return deduplicar(datas);
}

function extrairValoresRotulados(texto: string): number[] {
  const regex = /(valor\s*(do\s*documento|cobrado|do\s*boleto|total|documento)?)[^\d]{0,20}(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/gim;
  const valores: number[] = [];
  for (const match of Array.from(texto.matchAll(regex))) {
    const bruto = match[3];
    if (!bruto) continue;
    const normalizado = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
    const numero = Number(normalizado);
    if (Number.isFinite(numero)) {
      valores.push(Number(numero.toFixed(2)));
    }
  }
  return Array.from(new Set(valores));
}

function extrairCnpjsRotulados(texto: string, regexRotulo: RegExp): string[] {
  const encontrados: string[] = [];
  for (const match of Array.from(texto.matchAll(regexRotulo))) {
    const bloco = match[0];
    const cnpjMatch = bloco.match(/\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}|\d{14}/g);
    if (!cnpjMatch) continue;
    for (const cnpj of cnpjMatch) {
      const digitos = somenteDigitos(cnpj);
      if (digitos.length === 14) encontrados.push(digitos);
    }
  }
  return deduplicar(encontrados);
}

function calcularDvNfe(base43: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i -= 1) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = 11 - resto;
  return dv >= 10 ? 0 : dv;
}

export function validarChaveAcessoNfe(chave: string): boolean {
  const digitos = somenteDigitos(chave);
  if (digitos.length !== 44) return false;
  const base = digitos.slice(0, 43);
  const dvInformado = Number(digitos[43]);
  return calcularDvNfe(base) === dvInformado;
}

function extrairChaveNfeRotulada(texto: string): string | undefined {
  const regex = /(chave\s*de\s*acesso(?:\s*da\s*nf-?e)?|chave\s*nf-?e)[^\d]{0,25}((?:\d[\s.-]*){44})/gim;
  const candidatas: string[] = [];
  for (const match of Array.from(texto.matchAll(regex))) {
    const chave = somenteDigitos(match[2]);
    if (validarChaveAcessoNfe(chave)) candidatas.push(chave);
  }
  const unicas = deduplicar(candidatas);
  return unicas.length === 1 ? unicas[0] : undefined;
}

function extrairNumeroNfeRotulado(texto: string): string | undefined {
  const regex = /(n[uú]mero\s*da\s*nf-?e|nf-?e\s*n[uú]mero|nota\s*fiscal\s*n[uú]mero|n[ºo]\s*nf-?e)\s*[:#\-]?\s*(\d{1,20})/gim;
  const encontrados = deduplicar(Array.from(texto.matchAll(regex)).map((match) => match[2] ?? "").filter(Boolean));
  return encontrados.length === 1 ? encontrados[0] : undefined;
}

function extrairNumeroParcelaRotulado(texto: string): string | undefined {
  const regex = /(parcela|duplicata|n[úu]mero\s*da\s*parcela|n[úu]mero\s*da\s*duplicata|nDup)\s*[:#\-]?\s*([a-zA-Z0-9._\/-]{1,20})/gim;
  const encontrados = deduplicar(Array.from(texto.matchAll(regex)).map((match) => (match[2] ?? "").trim()).filter(Boolean));
  return encontrados.length === 1 ? encontrados[0] : undefined;
}

function codigoBarrasBancario44(codigoOuLinha: string): string | undefined {
  const validacao = validarBoleto(codigoOuLinha);
  if (!validacao.valido) return undefined;

  const normalizado = normalizarLinhaBoleto(codigoOuLinha);
  if (validacao.formato === "codigo_barras_bancario_44") return normalizado;
  if (validacao.formato === "linha_digitavel_bancaria_47") {
    return validacao.codigoCanonico ?? converterLinha47ParaCodigo44(normalizado);
  }
  return undefined;
}

/**
 * Converte o fator de vencimento do boleto bancário (posições 6–9 do código de 44)
 * para data ISO. A partir de 22/02/2025 a Febraban usa base 1000 = 2025-02-22.
 */
export function dataDoFatorVencimentoBoleto(fator: number): string | undefined {
  if (!Number.isInteger(fator) || fator <= 0) return undefined;

  const base =
    fator >= 1000
      ? { iso: "2025-02-22", deslocamento: fator - 1000 }
      : { iso: "1997-10-07", deslocamento: fator };

  const data = new Date(`${base.iso}T12:00:00.000Z`);
  data.setUTCDate(data.getUTCDate() + base.deslocamento);
  return data.toISOString().slice(0, 10);
}

export function extrairVencimentoDoCodigoBoleto(codigoOuLinha: string): string | undefined {
  const codigo44 = codigoBarrasBancario44(codigoOuLinha);
  if (!codigo44) return undefined;
  const fator = Number(codigo44.slice(5, 9));
  if (!Number.isFinite(fator)) return undefined;
  return dataDoFatorVencimentoBoleto(fator);
}

export function extrairValorDoCodigoBoleto(codigoOuLinha: string): number | undefined {
  const validacao = validarBoleto(codigoOuLinha);
  if (!validacao.valido) return undefined;

  const normalizado = normalizarLinhaBoleto(codigoOuLinha);
  if (validacao.formato === "codigo_barras_bancario_44") {
    const campoValor = normalizado.slice(9, 19);
    const centavos = Number(campoValor);
    if (!Number.isFinite(centavos)) return undefined;
    return Number((centavos / 100).toFixed(2));
  }

  if (validacao.formato === "linha_digitavel_bancaria_47") {
    const canonico = validacao.codigoCanonico ?? converterLinha47ParaCodigo44(normalizado);
    const campoValor = canonico.slice(9, 19);
    const centavos = Number(campoValor);
    if (!Number.isFinite(centavos)) return undefined;
    return Number((centavos / 100).toFixed(2));
  }

  if (validacao.formato === "linha_digitavel_arrecadacao_48") {
    const referencia = normalizado[2];
    if (referencia !== "6" && referencia !== "8") return undefined;
    const codigo44 = `${normalizado.slice(0, 11)}${normalizado.slice(12, 23)}${normalizado.slice(24, 35)}${normalizado.slice(36, 47)}`;
    const campoValor = codigo44.slice(4, 15);
    const centavos = Number(campoValor);
    if (!Number.isFinite(centavos)) return undefined;
    return Number((centavos / 100).toFixed(2));
  }

  return undefined;
}

export function extrairDadosEstruturadosDoBoleto(codigoOuLinha: string, textoExtraido: string): DadosBoletoExtraidos {
  const validacao = validarBoleto(codigoOuLinha);
  if (!validacao.valido || !validacao.codigoCanonico) {
    throw new Error("Boleto inválido para extração de dados estruturados.");
  }

  const datas = extrairDatasRotuladas(textoExtraido);
  const vencimentoDoCodigo = extrairVencimentoDoCodigoBoleto(codigoOuLinha);
  const vencimento_extraido =
    datas.length === 1 ? datas[0] : vencimentoDoCodigo;
  const datas_encontradas = deduplicar([
    ...datas,
    ...(vencimentoDoCodigo ? [vencimentoDoCodigo] : []),
  ]);
  const valoresRotulados = extrairValoresRotulados(textoExtraido);
  const beneficiarios = extrairCnpjsRotulados(
    textoExtraido,
    /(benefici[aá]rio\s*final|benefici[aá]rio|cedente|sacado\s*favorecido)[^\n]{0,120}/gim
  );
  const pagadores = extrairCnpjsRotulados(textoExtraido, /(pagador|sacado)[^\n]{0,120}/gim);

  const todosCnpjs = deduplicar([...beneficiarios, ...pagadores]);
  const cnpjBeneficiario = beneficiarios.length === 1 ? beneficiarios[0] : undefined;
  const cnpjPagador = pagadores.length === 1 ? pagadores[0] : undefined;

  return {
    codigo_canonico: validacao.codigoCanonico,
    valor_codificado: extrairValorDoCodigoBoleto(codigoOuLinha),
    vencimento_extraido,
    datas_encontradas,
    cnpj_beneficiario: cnpjBeneficiario,
    cnpj_pagador: cnpjPagador,
    cnpjs_encontrados: todosCnpjs,
    chave_nfe: extrairChaveNfeRotulada(textoExtraido),
    numero_nfe: extrairNumeroNfeRotulado(textoExtraido),
    numero_parcela: extrairNumeroParcelaRotulado(textoExtraido),
  };
}

function diferencaMonetaria(a: number, b: number): number {
  return Math.abs(Number((a - b).toFixed(2)));
}

function coincideValor(esperado: number, informado?: number): boolean {
  if (informado === undefined) return false;
  return diferencaMonetaria(esperado, informado) <= TOLERANCIA_MONETARIA;
}

function localizarNotaPorChave(db: DB, chave?: string): NotaFiscal | undefined {
  if (!chave) return undefined;
  return db.notas_fiscais.find((nota) => nota.chave_acesso === chave);
}

function parcelaJaAssociadaDocumento(db: DB, boleto: Boleto): boolean {
  const linha = boleto.linha_digitavel;
  if (!linha) return false;
  const validacao = validarBoleto(linha);
  const canonico = validacao.valido ? validacao.codigoCanonico : undefined;
  if (!canonico) return false;
  return db.documentos_boleto.some((doc) => doc.codigo_canonico === canonico);
}

function obterCnpjFornecedorNota(db: DB, nota: NotaFiscal): string | undefined {
  const emitente = somenteDigitos(nota.cnpj_emitente);
  if (emitente.length === 14) return emitente;
  const fornecedor = db.fornecedores.find((f) => f.id === nota.fornecedor_id);
  const cnpjFornecedor = somenteDigitos(fornecedor?.cnpj);
  return cnpjFornecedor.length === 14 ? cnpjFornecedor : undefined;
}

function candidatosPorValorEVencimento(db: DB, dados: DadosBoletoExtraidos): CandidatoConfronto[] {
  if (dados.valor_codificado === undefined || !dados.vencimento_extraido) return [];

  return db.boletos
    .filter((boleto) => coincideValor(boleto.valor, dados.valor_codificado) && boleto.vencimento === dados.vencimento_extraido)
    .map((boleto) => ({ nota_id: boleto.nota_id, boleto_id: boleto.id }));
}

function filtrarPorCnpjBeneficiario(db: DB, candidatos: CandidatoConfronto[], cnpjBeneficiario?: string): CandidatoConfronto[] {
  if (!cnpjBeneficiario) return candidatos;
  const alvo = somenteDigitos(cnpjBeneficiario);
  if (alvo.length !== 14) return [];

  return candidatos.filter((candidato) => {
    const boleto = db.boletos.find((b) => b.id === candidato.boleto_id);
    if (!boleto) return false;
    const cnpjBoleto = somenteDigitos(boleto.cnpj_beneficiario);
    if (cnpjBoleto && cnpjBoleto === alvo) return true;

    const nota = db.notas_fiscais.find((n) => n.id === boleto.nota_id);
    if (!nota) return false;
    return obterCnpjFornecedorNota(db, nota) === alvo;
  });
}

function resultadoBase(classificacao: ClassificacaoConfrontoBoletoNfe): ResultadoConfrontoBoletoNfe {
  return {
    classificacao,
    candidatos: [],
    criterios_coincidentes: [],
    divergencias: [],
    avisos: [],
    exige_confirmacao_humana: classificacao !== "exata",
  };
}

export function confrontarBoletoComNfe(db: DB, dados: DadosBoletoExtraidos, hashSha256?: string): ResultadoConfrontoBoletoNfe {
  const duplicadoHash = hashSha256 ? db.documentos_boleto.find((doc) => doc.hash_sha256 === hashSha256) : undefined;
  if (duplicadoHash) {
    const resultado = resultadoBase("duplicada");
    resultado.avisos.push("Documento já registrado pelo mesmo hash SHA-256.");
    resultado.criterios_coincidentes.push("hash_sha256");
    return resultado;
  }

  const duplicadoCodigo = db.documentos_boleto.find((doc) => doc.codigo_canonico && doc.codigo_canonico === dados.codigo_canonico);
  if (duplicadoCodigo) {
    const resultado = resultadoBase("duplicada");
    resultado.avisos.push("Documento já registrado pelo mesmo código canônico.");
    resultado.criterios_coincidentes.push("codigo_canonico");
    return resultado;
  }

  const temChaveParcela = Boolean(dados.chave_nfe && dados.numero_parcela);
  if (temChaveParcela) {
    const nota = localizarNotaPorChave(db, dados.chave_nfe);
    if (!nota) {
      const sem = resultadoBase("sem_correspondencia");
      sem.avisos.push("Chave da NF-e não encontrada.");
      return sem;
    }

    const parcelasDaNota = db.boletos.filter((boleto) => boleto.nota_id === nota.id);
    const parcelaPorNumero = parcelasDaNota.filter((boleto) => (boleto.numero_parcela ?? "").trim() === (dados.numero_parcela ?? "").trim());
    let parcelasAlvo = parcelaPorNumero;

    if (parcelasAlvo.length === 0 && dados.valor_codificado !== undefined && dados.vencimento_extraido) {
      parcelasAlvo = parcelasDaNota.filter(
        (boleto) => !boleto.numero_parcela && coincideValor(boleto.valor, dados.valor_codificado) && boleto.vencimento === dados.vencimento_extraido
      );
    }

    if (parcelasAlvo.length === 0) {
      const sem = resultadoBase("sem_correspondencia");
      sem.criterios_coincidentes.push("chave_nfe");
      sem.avisos.push("NF-e encontrada, mas parcela não localizada.");
      return sem;
    }

    if (parcelasAlvo.length > 1) {
      const multi = resultadoBase("multiplas_possibilidades");
      multi.criterios_coincidentes.push("chave_nfe", "numero_parcela");
      multi.candidatos = parcelasAlvo.map((b) => ({ nota_id: b.nota_id, boleto_id: b.id }));
      multi.avisos.push("Mais de uma parcela atende à chave/parcela informadas.");
      return multi;
    }

    const alvo = parcelasAlvo[0];
    const resultado = resultadoBase("exata");
    resultado.nota_id = alvo.nota_id;
    resultado.parcela_id = alvo.id;
    resultado.criterios_coincidentes.push("chave_nfe", "numero_parcela");

    if (dados.valor_codificado !== undefined) {
      if (coincideValor(alvo.valor, dados.valor_codificado)) {
        resultado.criterios_coincidentes.push("valor");
      } else {
        resultado.divergencias.push("Valor divergente.");
      }
    }

    if (dados.vencimento_extraido) {
      if (alvo.vencimento === dados.vencimento_extraido) {
        resultado.criterios_coincidentes.push("vencimento");
      } else {
        resultado.divergencias.push("Vencimento divergente.");
      }
    }

    if (dados.cnpj_beneficiario) {
      const informado = somenteDigitos(dados.cnpj_beneficiario);
      const cnpjParcela = somenteDigitos(alvo.cnpj_beneficiario);
      if (cnpjParcela && cnpjParcela === informado) {
        resultado.criterios_coincidentes.push("cnpj_beneficiario");
      } else {
        const notaAlvo = db.notas_fiscais.find((n) => n.id === alvo.nota_id);
        const cnpjNota = notaAlvo ? obterCnpjFornecedorNota(db, notaAlvo) : undefined;
        if (cnpjNota && cnpjNota === informado) {
          resultado.criterios_coincidentes.push("cnpj_beneficiario");
        } else {
          resultado.divergencias.push("CNPJ do beneficiário divergente.");
        }
      }
    }

    if (parcelaJaAssociadaDocumento(db, alvo)) {
      resultado.divergencias.push("Parcela já associada a outro documento.");
    }

    if (resultado.divergencias.length > 0) {
      resultado.classificacao = "divergente";
      resultado.exige_confirmacao_humana = true;
      return resultado;
    }

    resultado.exige_confirmacao_humana = false;
    return resultado;
  }

  const candidatosBase = candidatosPorValorEVencimento(db, dados);
  if (candidatosBase.length === 0) {
    const sem = resultadoBase("sem_correspondencia");
    sem.avisos.push("Nenhuma parcela compatível por valor e vencimento.");
    return sem;
  }

  const candidatosCnpj = filtrarPorCnpjBeneficiario(db, candidatosBase, dados.cnpj_beneficiario);

  if (dados.cnpj_beneficiario && candidatosCnpj.length === 0) {
    const divergente = resultadoBase("divergente");
    divergente.candidatos = candidatosBase;
    divergente.divergencias.push("CNPJ do beneficiário não confere com os candidatos por valor e vencimento.");
    return divergente;
  }

  const candidatosEfetivos = candidatosCnpj.length > 0 ? candidatosCnpj : candidatosBase;
  if (candidatosEfetivos.length > 1) {
    const multi = resultadoBase("multiplas_possibilidades");
    multi.candidatos = candidatosEfetivos;
    multi.criterios_coincidentes.push("valor", "vencimento");
    if (dados.cnpj_beneficiario && candidatosCnpj.length > 1) {
      multi.criterios_coincidentes.push("cnpj_beneficiario");
    }
    return multi;
  }

  const unico = candidatosEfetivos[0];
  const parcial = resultadoBase("parcial");
  parcial.nota_id = unico.nota_id;
  parcial.parcela_id = unico.boleto_id;
  parcial.candidatos = [unico];
  parcial.criterios_coincidentes.push("valor", "vencimento");
  if (dados.cnpj_beneficiario && candidatosCnpj.length === 1) {
    parcial.criterios_coincidentes.push("cnpj_beneficiario");
  } else {
    parcial.avisos.push("Beneficiário não confirmado.");
  }
  parcial.exige_confirmacao_humana = true;
  return parcial;
}
