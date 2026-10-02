import { obterCodigoCanonico, validarBoleto } from "./boletos";
import {
  extrairValorDoCodigoBoleto,
  extrairVencimentoDoCodigoBoleto,
} from "./boleto-nfe-confronto";

export interface BoletoValidoIdentificado {
  valorNormalizado: string;
  formato: "codigo_barras_bancario_44" | "linha_digitavel_bancaria_47" | "linha_digitavel_arrecadacao_48";
  codigoCanonico?: string;
}

export interface ResultadoIdentificacaoTextoBoleto {
  quantidadeCandidatos: number;
  validos: BoletoValidoIdentificado[];
}

function normalizarCandidatoBruto(bruto: string): string {
  return bruto.replace(/[\s.\-/_]+/g, "");
}

/** OCR e PDFs do eGestor confundem O/I com 0/1. */
function sanitizarConfusoesOcrBoleto(texto: string): string {
  return texto.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1");
}

function deduplicarStrings(valores: string[]): string[] {
  const vistos = new Set<string>();
  const resultado: string[] = [];

  for (const valor of valores) {
    if (vistos.has(valor)) continue;
    vistos.add(valor);
    resultado.push(valor);
  }

  return resultado;
}

export function extrairCandidatosNumericosBoleto(texto: string): string[] {
  if (!texto.trim()) return [];

  const candidatos: string[] = [];
  const padroes = [48, 47, 44].map(
    (quantidade) => new RegExp(`(?<!\\d)(?:\\d[\\s.\\-/_]*){${quantidade}}(?!\\d)`, "g")
  );

  const fontes = [texto, sanitizarConfusoesOcrBoleto(texto)];
  for (const fonte of fontes) {
    for (const padrao of padroes) {
      padrao.lastIndex = 0;
      const encontrados = fonte.match(padrao) ?? [];
      for (const encontrado of encontrados) {
        const normalizado = normalizarCandidatoBruto(encontrado);
        if (normalizado.length === 44 || normalizado.length === 47 || normalizado.length === 48) {
          candidatos.push(normalizado);
        }
      }
    }
  }

  return deduplicarStrings(candidatos);
}

export function validarCandidatosBoletos(candidatos: string[]): BoletoValidoIdentificado[] {
  const validos: BoletoValidoIdentificado[] = [];

  for (const candidato of candidatos) {
    const resultado = validarBoleto(candidato);
    if (!resultado.valido) continue;
    if (resultado.formato === "invalido") continue;

    validos.push({
      valorNormalizado: resultado.valorNormalizado,
      formato: resultado.formato,
      codigoCanonico: resultado.codigoCanonico,
    });
  }

  return validos;
}

export function eliminarDuplicidadeRepresentacaoBoletos(
  validos: BoletoValidoIdentificado[]
): BoletoValidoIdentificado[] {
  const vistosCanonicos = new Set<string>();
  const vistosSemCanonico = new Set<string>();
  const resultado: BoletoValidoIdentificado[] = [];

  for (const boleto of validos) {
    const canonico = boleto.codigoCanonico ?? obterCodigoCanonico(boleto.valorNormalizado);

    if (canonico) {
      if (vistosCanonicos.has(canonico)) continue;
      vistosCanonicos.add(canonico);
      resultado.push({ ...boleto, codigoCanonico: canonico });
      continue;
    }

    if (vistosSemCanonico.has(boleto.valorNormalizado)) continue;
    vistosSemCanonico.add(boleto.valorNormalizado);
    resultado.push(boleto);
  }

  return resultado;
}

export function identificarBoletosValidosNoTexto(texto: string): ResultadoIdentificacaoTextoBoleto {
  const candidatos = extrairCandidatosNumericosBoleto(texto);
  const validos = validarCandidatosBoletos(candidatos);
  const semDuplicidade = eliminarDuplicidadeRepresentacaoBoletos(validos);

  return {
    quantidadeCandidatos: candidatos.length,
    validos: ordenarCandidatosBoletoPorPlausibilidade(semDuplicidade),
  };
}

/** Valor típico de boleto de fornecedor (acima disso quase sempre leitura errada). */
const VALOR_BOLETO_MAX_PLAUSIVEL = 500_000;
const VALOR_BOLETO_MIN_PLAUSIVEL = 0.01;

function valorEVencimentoDoCandidato(boleto: BoletoValidoIdentificado): {
  valor?: number;
  vencimento?: string;
} {
  const codigo = boleto.codigoCanonico || boleto.valorNormalizado;
  return {
    valor: extrairValorDoCodigoBoleto(codigo),
    vencimento: extrairVencimentoDoCodigoBoleto(codigo),
  };
}

/**
 * Filtra leituras absurdas (ex.: R$ 8 milhões / venc. 1898 em PDF DANFE+boleto).
 * Preferível deixar “não leu” a gravar valor errado.
 */
export function candidatoBoletoPlausivel(
  boleto: BoletoValidoIdentificado,
  agora: Date = new Date()
): boolean {
  return pontuarPlausibilidadeBoleto(boleto, agora) >= 0;
}

export function pontuarPlausibilidadeBoleto(
  boleto: BoletoValidoIdentificado,
  agora: Date = new Date()
): number {
  const { valor, vencimento } = valorEVencimentoDoCandidato(boleto);
  let pontos = 0;

  if (valor === undefined || !Number.isFinite(valor)) {
    pontos -= 30;
  } else if (valor < VALOR_BOLETO_MIN_PLAUSIVEL || valor > VALOR_BOLETO_MAX_PLAUSIVEL) {
    return -1000;
  } else if (valor > 50_000) {
    pontos -= 10;
  } else {
    pontos += 40;
  }

  if (!vencimento) {
    pontos -= 20;
  } else {
    const ano = Number(vencimento.slice(0, 4));
    const anoAgora = agora.getFullYear();
    if (!Number.isFinite(ano) || ano < anoAgora - 2 || ano > anoAgora + 4) {
      return -1000;
    }
    const dias = Math.abs(
      (Date.parse(`${vencimento}T12:00:00`) - agora.getTime()) / 86_400_000
    );
    if (dias <= 400) pontos += 40;
    else if (dias <= 800) pontos += 10;
    else pontos -= 15;
  }

  if (boleto.formato === "linha_digitavel_bancaria_47") pontos += 15;
  if (boleto.formato === "codigo_barras_bancario_44") pontos += 10;

  const banco = (boleto.codigoCanonico || boleto.valorNormalizado).slice(0, 3);
  if (/^(001|033|104|237|341|756|748|422|077)$/.test(banco)) pontos += 5;

  return pontos;
}

export function ordenarCandidatosBoletoPorPlausibilidade(
  validos: BoletoValidoIdentificado[],
  agora: Date = new Date()
): BoletoValidoIdentificado[] {
  return [...validos]
    .map((boleto) => ({ boleto, pontos: pontuarPlausibilidadeBoleto(boleto, agora) }))
    .filter((item) => item.pontos >= 0)
    .sort((a, b) => b.pontos - a.pontos)
    .map((item) => item.boleto);
}
