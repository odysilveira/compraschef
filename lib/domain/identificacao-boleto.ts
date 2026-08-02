import { obterCodigoCanonico, validarBoleto } from "./boletos";

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
  return bruto.replace(/[\s.-]+/g, "");
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
    (quantidade) => new RegExp(`(?<!\\d)(?:\\d[\\s.\\-]*){${quantidade}}(?!\\d)`, "g")
  );

  for (const padrao of padroes) {
    const encontrados = texto.match(padrao) ?? [];
    for (const encontrado of encontrados) {
      const normalizado = normalizarCandidatoBruto(encontrado);
      if (normalizado.length === 44 || normalizado.length === 47 || normalizado.length === 48) {
        candidatos.push(normalizado);
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
    validos: semDuplicidade,
  };
}
