import type { FormatoBoleto } from "../types";

export interface ResultadoValidacaoBoleto {
  valido: boolean;
  formato: FormatoBoleto;
  valorNormalizado: string;
  codigoCanonico?: string;
  erros: string[];
}

function calcularModulo10(valor: string): number {
  let soma = 0;
  let peso = 2;

  for (let indice = valor.length - 1; indice >= 0; indice -= 1) {
    const produto = Number(valor[indice]) * peso;
    soma += produto > 9 ? produto - 9 : produto;
    peso = peso === 2 ? 1 : 2;
  }

  return (10 - (soma % 10)) % 10;
}

function calcularModulo11Bancario(valor: string): number {
  let soma = 0;
  let peso = 2;

  for (let indice = valor.length - 1; indice >= 0; indice -= 1) {
    soma += Number(valor[indice]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }

  const dv = 11 - (soma % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

function calcularModulo11Arrecadacao(valor: string): number {
  let soma = 0;
  let peso = 2;

  for (let indice = valor.length - 1; indice >= 0; indice -= 1) {
    soma += Number(valor[indice]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }

  const dv = 11 - (soma % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 0 : dv;
}

function obterModuloArrecadacao(codigo: string): 10 | 11 | undefined {
  const referencia = codigo[2];
  if (referencia === "6" || referencia === "7") return 10;
  if (referencia === "8" || referencia === "9") return 11;
  return undefined;
}

function validarCampoComDv(valor: string, modulo: 10 | 11): boolean {
  const corpo = valor.slice(0, -1);
  const dvInformado = Number(valor.slice(-1));
  const dvCalculado = modulo === 10 ? calcularModulo10(corpo) : calcularModulo11Arrecadacao(corpo);
  return dvInformado === dvCalculado;
}

export function normalizarLinhaBoleto(valor: string): string {
  const entrada = valor.trim();
  if (!entrada) throw new Error("Linha de boleto vazia.");
  if (!/^[\d\s.-]+$/.test(entrada)) {
    throw new Error("Linha de boleto contém caracteres inválidos.");
  }

  const normalizado = entrada.replace(/[\s.-]+/g, "");
  if (!/^\d+$/.test(normalizado)) {
    throw new Error("Linha de boleto contém caracteres inválidos.");
  }

  return normalizado;
}

export function identificarFormatoBoleto(valor: string): FormatoBoleto {
  switch (valor.length) {
    case 44:
      return "codigo_barras_bancario_44";
    case 47:
      return "linha_digitavel_bancaria_47";
    case 48:
      return "linha_digitavel_arrecadacao_48";
    default:
      return "invalido";
  }
}

export function converterLinha47ParaCodigo44(valor: string): string {
  const linha = normalizarLinhaBoleto(valor);
  if (identificarFormatoBoleto(linha) !== "linha_digitavel_bancaria_47") {
    throw new Error("Linha digitável bancária deve ter 47 dígitos.");
  }

  const campo1 = linha.slice(0, 10);
  const campo2 = linha.slice(10, 21);
  const campo3 = linha.slice(21, 32);

  if (!validarCampoComDv(campo1, 10)) throw new Error("Campo 1 da linha digitável é inválido.");
  if (!validarCampoComDv(campo2, 10)) throw new Error("Campo 2 da linha digitável é inválido.");
  if (!validarCampoComDv(campo3, 10)) throw new Error("Campo 3 da linha digitável é inválido.");

  const codigo = `${linha.slice(0, 4)}${linha[32]}${linha.slice(33)}${linha.slice(4, 9)}${linha.slice(10, 20)}${linha.slice(21, 31)}`;
  const dvGeralInformado = Number(codigo[4]);
  const dvGeralCalculado = calcularModulo11Bancario(codigo.slice(0, 4) + codigo.slice(5));
  if (dvGeralInformado !== dvGeralCalculado) {
    throw new Error("Dígito verificador geral do boleto bancário é inválido.");
  }

  return codigo;
}

export function obterCodigoCanonico(valor: string): string | undefined {
  const normalizado = normalizarLinhaBoleto(valor);
  const formato = identificarFormatoBoleto(normalizado);

  if (formato === "codigo_barras_bancario_44") return normalizado;
  if (formato === "linha_digitavel_bancaria_47") return converterLinha47ParaCodigo44(normalizado);
  return undefined;
}

export function validarBoleto(valor: string): ResultadoValidacaoBoleto {
  let valorNormalizado = "";
  const erros: string[] = [];

  try {
    valorNormalizado = normalizarLinhaBoleto(valor);
  } catch (erro) {
    erros.push(erro instanceof Error ? erro.message : "Linha de boleto inválida.");
    return {
      valido: false,
      formato: "invalido",
      valorNormalizado,
      erros,
    };
  }

  const formato = identificarFormatoBoleto(valorNormalizado);
  if (formato === "invalido") {
    erros.push("Quantidade de dígitos inválida para boleto brasileiro.");
    return { valido: false, formato, valorNormalizado, erros };
  }

  if (formato === "codigo_barras_bancario_44") {
    const dvInformado = Number(valorNormalizado[4]);
    const dvCalculado = calcularModulo11Bancario(valorNormalizado.slice(0, 4) + valorNormalizado.slice(5));
    if (dvInformado !== dvCalculado) {
      erros.push("Dígito verificador geral do código de barras bancário é inválido.");
    }

    return {
      valido: erros.length === 0,
      formato,
      valorNormalizado,
      codigoCanonico: erros.length === 0 ? valorNormalizado : undefined,
      erros,
    };
  }

  if (formato === "linha_digitavel_bancaria_47") {
    const campo1 = valorNormalizado.slice(0, 10);
    const campo2 = valorNormalizado.slice(10, 21);
    const campo3 = valorNormalizado.slice(21, 32);

    if (!validarCampoComDv(campo1, 10)) erros.push("Campo 1 da linha digitável bancária é inválido.");
    if (!validarCampoComDv(campo2, 10)) erros.push("Campo 2 da linha digitável bancária é inválido.");
    if (!validarCampoComDv(campo3, 10)) erros.push("Campo 3 da linha digitável bancária é inválido.");

    let codigoCanonico: string | undefined;
    if (erros.length === 0) {
      try {
        codigoCanonico = converterLinha47ParaCodigo44(valorNormalizado);
      } catch (erro) {
        erros.push(erro instanceof Error ? erro.message : "Linha digitável bancária inválida.");
      }
    }

    return {
      valido: erros.length === 0,
      formato,
      valorNormalizado,
      codigoCanonico,
      erros,
    };
  }

  const moduloArrecadacao = obterModuloArrecadacao(valorNormalizado);
  if (!moduloArrecadacao) {
    erros.push("Dígito de referência da linha de arrecadação é inválido.");
    return { valido: false, formato, valorNormalizado, erros };
  }

  const campos = [
    valorNormalizado.slice(0, 12),
    valorNormalizado.slice(12, 24),
    valorNormalizado.slice(24, 36),
    valorNormalizado.slice(36, 48),
  ];

  campos.forEach((campo, indice) => {
    if (!validarCampoComDv(campo, moduloArrecadacao)) {
      erros.push(`Campo ${indice + 1} da linha digitável de arrecadação é inválido.`);
    }
  });

  return {
    valido: erros.length === 0,
    formato,
    valorNormalizado,
    erros,
  };
}