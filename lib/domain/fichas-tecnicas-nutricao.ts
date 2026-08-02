import type {
  CodigoLinhaNutricional,
  FichaTecnica,
  InformacaoNutricional,
  LinhaInformacaoNutricional,
  OrigemInformacaoNutricional,
  StatusInformacaoNutricional,
} from "../types";

export const REFERENCIA_IN75_2020 = {
  valor_energetico_kcal: 2000,
  carboidratos_g: 300,
  acucares_adicionados_g: 50,
  proteinas_g: 50,
  gorduras_totais_g: 65,
  gorduras_saturadas_g: 20,
  gorduras_trans_g: 2,
  fibra_alimentar_g: 25,
  sodio_mg: 2000,
} as const;

const FATOR_KJ_POR_KCAL = 4.184;

type DefinicaoLinhaNutricional = Readonly<{
  codigo: CodigoLinhaNutricional;
  rotulo: string;
  unidade: LinhaInformacaoNutricional["unidade"];
  referenciaVD?: number;
  codigoRelacionado?: CodigoLinhaNutricional;
  fatorRelacionado?: number;
}>;

export const LINHAS_NUTRICIONAIS_PADRAO: readonly DefinicaoLinhaNutricional[] = [
  {
    codigo: "valor_energetico_kcal",
    rotulo: "Valor energético (kcal)",
    unidade: "kcal",
    referenciaVD: REFERENCIA_IN75_2020.valor_energetico_kcal,
    codigoRelacionado: "valor_energetico_kj",
    fatorRelacionado: FATOR_KJ_POR_KCAL,
  },
  {
    codigo: "valor_energetico_kj",
    rotulo: "Valor energético (kJ)",
    unidade: "kJ",
    codigoRelacionado: "valor_energetico_kcal",
    fatorRelacionado: 1 / FATOR_KJ_POR_KCAL,
  },
  {
    codigo: "carboidratos_g",
    rotulo: "Carboidratos",
    unidade: "g",
    referenciaVD: REFERENCIA_IN75_2020.carboidratos_g,
  },
  {
    codigo: "acucares_totais_g",
    rotulo: "Açúcares totais",
    unidade: "g",
  },
  {
    codigo: "acucares_adicionados_g",
    rotulo: "Açúcares adicionados",
    unidade: "g",
    referenciaVD: REFERENCIA_IN75_2020.acucares_adicionados_g,
  },
  {
    codigo: "proteinas_g",
    rotulo: "Proteínas",
    unidade: "g",
    referenciaVD: REFERENCIA_IN75_2020.proteinas_g,
  },
  {
    codigo: "gorduras_totais_g",
    rotulo: "Gorduras totais",
    unidade: "g",
    referenciaVD: REFERENCIA_IN75_2020.gorduras_totais_g,
  },
  {
    codigo: "gorduras_saturadas_g",
    rotulo: "Gorduras saturadas",
    unidade: "g",
    referenciaVD: REFERENCIA_IN75_2020.gorduras_saturadas_g,
  },
  {
    codigo: "gorduras_trans_g",
    rotulo: "Gorduras trans",
    unidade: "g",
    referenciaVD: REFERENCIA_IN75_2020.gorduras_trans_g,
  },
  {
    codigo: "fibra_alimentar_g",
    rotulo: "Fibra alimentar",
    unidade: "g",
    referenciaVD: REFERENCIA_IN75_2020.fibra_alimentar_g,
  },
  {
    codigo: "sodio_mg",
    rotulo: "Sódio",
    unidade: "mg",
    referenciaVD: REFERENCIA_IN75_2020.sodio_mg,
  },
] as const;

export function criarLinhaNutricionalPadrao(codigo: CodigoLinhaNutricional): LinhaInformacaoNutricional {
  const def = obterDefinicaoLinhaNutricional(codigo);
  return {
    codigo: def.codigo,
    rotulo: def.rotulo,
    unidade: def.unidade,
    valor_por_100: null,
    valor_por_porcao: null,
    vd_por_100: null,
    vd_por_porcao: null,
    ajuste_manual_por_100: false,
    ajuste_manual_por_porcao: false,
  };
}

export function criarInformacaoNutricionalPadrao(): InformacaoNutricional {
  return {
    origem: "MANUAL",
    fonte_descricao: "",
    status_validacao: "estimado",
    observacoes: "",
    unidade_porcao: "g",
    unidade_peso_volume_final: "g",
    linhas: LINHAS_NUTRICIONAIS_PADRAO.map((linha) => criarLinhaNutricionalPadrao(linha.codigo)),
  };
}

export function obterDefinicaoLinhaNutricional(codigo: CodigoLinhaNutricional): DefinicaoLinhaNutricional {
  const linha = LINHAS_NUTRICIONAIS_PADRAO.find((item) => item.codigo === codigo);
  if (!linha) {
    throw new Error(`Linha nutricional desconhecida: ${codigo}.`);
  }
  return linha;
}

function clonarDefensivo<T>(valor: T): T {
  return structuredClone(valor);
}

function normalizarNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") {
    return null;
  }

  const numero = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(numero)) {
    return null;
  }
  if (numero < 0) {
    throw new Error("Valores nutricionais não podem ser negativos.");
  }

  return numero;
}

function normalizarTexto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function calcularValorPorPorcao(valorPor100: number | null, porcao: number | null): number | null {
  if (valorPor100 === null || porcao === null || porcao <= 0) {
    return null;
  }
  return (valorPor100 * porcao) / 100;
}

function calcularValorPor100(valorPorPorcao: number | null, porcao: number | null): number | null {
  if (valorPorPorcao === null || porcao === null || porcao <= 0) {
    return null;
  }
  return (valorPorPorcao * 100) / porcao;
}

function calcularPercentualVD(codigo: CodigoLinhaNutricional, valor: number | null): number | null {
  const referencia = obterDefinicaoLinhaNutricional(codigo).referenciaVD;
  if (!referencia || valor === null) {
    return null;
  }
  return (valor / referencia) * 100;
}

function normalizarLinhaBase(
  linha: Partial<LinhaInformacaoNutricional> | undefined,
  def: DefinicaoLinhaNutricional,
  porcao: number | null
): LinhaInformacaoNutricional {
  const valorPor100Original = normalizarNumero(linha?.valor_por_100);
  const valorPorPorcaoOriginal = normalizarNumero(linha?.valor_por_porcao);
  const ajusteManualPor100 = Boolean(linha?.ajuste_manual_por_100);
  const ajusteManualPorPorcao = Boolean(linha?.ajuste_manual_por_porcao);

  const valorPor100 = (() => {
    if (ajusteManualPor100) {
      return valorPor100Original;
    }
    if (ajusteManualPorPorcao) {
      return calcularValorPor100(valorPorPorcaoOriginal, porcao);
    }
    return valorPor100Original ?? calcularValorPor100(valorPorPorcaoOriginal, porcao);
  })();

  const valorPorPorcao = (() => {
    if (ajusteManualPorPorcao) {
      return valorPorPorcaoOriginal;
    }
    if (valorPor100 !== null) {
      const recalculado = calcularValorPorPorcao(valorPor100, porcao);
      if (recalculado !== null || porcao !== null) {
        return recalculado;
      }
    }
    if (ajusteManualPor100) {
      return calcularValorPorPorcao(valorPor100Original, porcao);
    }
    return valorPorPorcaoOriginal;
  })();

  const linhaNormalizada: LinhaInformacaoNutricional = {
    codigo: def.codigo,
    rotulo: normalizarTexto(linha?.rotulo) || def.rotulo,
    unidade: def.unidade,
    valor_por_100: valorPor100,
    valor_por_porcao: valorPorPorcao,
    vd_por_100: null,
    vd_por_porcao: null,
    ajuste_manual_por_100: ajusteManualPor100,
    ajuste_manual_por_porcao: ajusteManualPorPorcao,
  };

  linhaNormalizada.vd_por_100 = calcularPercentualVD(def.codigo, linhaNormalizada.valor_por_100);
  linhaNormalizada.vd_por_porcao = calcularPercentualVD(def.codigo, linhaNormalizada.valor_por_porcao);

  return linhaNormalizada;
}

function ajustarPareadoEnergia(
  linhas: LinhaInformacaoNutricional[],
  porcao: number | null
): LinhaInformacaoNutricional[] {
  const kcal = linhas.find((linha) => linha.codigo === "valor_energetico_kcal");
  const kj = linhas.find((linha) => linha.codigo === "valor_energetico_kj");
  if (!kcal || !kj) {
    return linhas;
  }

  const kcal100 = kcal.valor_por_100;
  const kcalPorcao = kcal.valor_por_porcao;
  const kj100 = kj.valor_por_100;
  const kjPorcao = kj.valor_por_porcao;

  if (kcal100 !== null && (kj100 === null || !kj.ajuste_manual_por_100)) {
    kj.valor_por_100 = kcal100 * FATOR_KJ_POR_KCAL;
    kj.vd_por_100 = null;
  } else if (kj100 !== null && (kcal100 === null || !kcal.ajuste_manual_por_100)) {
    kcal.valor_por_100 = kj100 / FATOR_KJ_POR_KCAL;
  }

  if (kcalPorcao !== null && (kjPorcao === null || !kj.ajuste_manual_por_porcao)) {
    kj.valor_por_porcao = kcalPorcao * FATOR_KJ_POR_KCAL;
    kj.vd_por_porcao = null;
  } else if (kjPorcao !== null && (kcalPorcao === null || !kcal.ajuste_manual_por_porcao)) {
    kcal.valor_por_porcao = kjPorcao / FATOR_KJ_POR_KCAL;
  }

  if (porcao !== null && porcao > 0) {
    if (kcal.valor_por_100 !== null && !kcal.ajuste_manual_por_porcao) {
      kcal.valor_por_porcao = calcularValorPorPorcao(kcal.valor_por_100, porcao);
    }
    if (kcal.valor_por_porcao !== null && !kcal.ajuste_manual_por_100) {
      kcal.valor_por_100 = calcularValorPor100(kcal.valor_por_porcao, porcao);
    }
    if (kj.valor_por_100 !== null && !kj.ajuste_manual_por_porcao) {
      kj.valor_por_porcao = calcularValorPorPorcao(kj.valor_por_100, porcao);
    }
    if (kj.valor_por_porcao !== null && !kj.ajuste_manual_por_100) {
      kj.valor_por_100 = calcularValorPor100(kj.valor_por_porcao, porcao);
    }
  }

  return linhas;
}

export function normalizarInformacaoNutricional(
  informacao?: Partial<InformacaoNutricional> | null
): InformacaoNutricional {
  const base = criarInformacaoNutricionalPadrao();
  if (!informacao) {
    return base;
  }

  const porcao = normalizarNumero(informacao.tamanho_porcao);
  const linhasEntrada = new Map(
    (informacao.linhas ?? []).map((linha) => [linha.codigo, linha] as const)
  );

  const linhas = LINHAS_NUTRICIONAIS_PADRAO.map((def) =>
    normalizarLinhaBase(linhasEntrada.get(def.codigo), def, porcao)
  );

  ajustarPareadoEnergia(linhas, porcao);

  return {
    origem: (informacao.origem ?? base.origem) as OrigemInformacaoNutricional,
    fonte_descricao: normalizarTexto(informacao.fonte_descricao) || base.fonte_descricao,
    data_referencia: normalizarTexto(informacao.data_referencia) || undefined,
    responsavel: normalizarTexto(informacao.responsavel) || undefined,
    status_validacao: (informacao.status_validacao ?? base.status_validacao) as StatusInformacaoNutricional,
    ultima_alteracao_em: normalizarTexto(informacao.ultima_alteracao_em) || undefined,
    observacoes: normalizarTexto(informacao.observacoes) || undefined,
    tamanho_porcao: porcao ?? undefined,
    unidade_porcao: informacao.unidade_porcao ?? base.unidade_porcao,
    medida_caseira: normalizarTexto(informacao.medida_caseira) || undefined,
    quantidade_porcoes: normalizarNumero(informacao.quantidade_porcoes) ?? undefined,
    peso_volume_final: normalizarNumero(informacao.peso_volume_final) ?? undefined,
    unidade_peso_volume_final: informacao.unidade_peso_volume_final ?? base.unidade_peso_volume_final,
    linhas,
  };
}

export function limparInformacaoNutricional(): InformacaoNutricional {
  return criarInformacaoNutricionalPadrao();
}

export function atualizarLinhaNutricional(
  informacao: InformacaoNutricional,
  codigo: CodigoLinhaNutricional,
  campo: "valor_por_100" | "valor_por_porcao",
  valor: number | string | null | undefined
): InformacaoNutricional {
  const info = normalizarInformacaoNutricional(informacao);
  const porcao = info.tamanho_porcao ?? null;
  const numero = normalizarNumero(valor);
  const linhas = info.linhas.map((linha) => ({ ...linha }));
  const linha = linhas.find((item) => item.codigo === codigo);
  if (!linha) {
    throw new Error(`Linha nutricional não encontrada: ${codigo}.`);
  }

  if (campo === "valor_por_100") {
    linha.valor_por_100 = numero;
    linha.ajuste_manual_por_100 = true;
    if (porcao !== null) {
      linha.valor_por_porcao = calcularValorPorPorcao(numero, porcao);
    }
  } else {
    linha.valor_por_porcao = numero;
    linha.ajuste_manual_por_porcao = true;
    if (porcao !== null) {
      linha.valor_por_100 = calcularValorPor100(numero, porcao);
    }
  }

  if (codigo === "valor_energetico_kcal" || codigo === "valor_energetico_kj") {
    const kcal = linhas.find((item) => item.codigo === "valor_energetico_kcal");
    const kj = linhas.find((item) => item.codigo === "valor_energetico_kj");
    if (kcal && kj) {
      if (codigo === "valor_energetico_kcal") {
        kcal.ajuste_manual_por_100 = campo === "valor_por_100";
        kcal.ajuste_manual_por_porcao = campo === "valor_por_porcao";
        if (linha.valor_por_100 !== null) {
          kj.valor_por_100 = linha.valor_por_100 * FATOR_KJ_POR_KCAL;
          kj.valor_por_porcao = linha.valor_por_porcao === null || porcao === null ? null : linha.valor_por_porcao * FATOR_KJ_POR_KCAL;
        }
      } else {
        kj.ajuste_manual_por_100 = campo === "valor_por_100";
        kj.ajuste_manual_por_porcao = campo === "valor_por_porcao";
        if (linha.valor_por_100 !== null) {
          kcal.valor_por_100 = linha.valor_por_100 / FATOR_KJ_POR_KCAL;
          kcal.valor_por_porcao = linha.valor_por_porcao === null || porcao === null ? null : linha.valor_por_porcao / FATOR_KJ_POR_KCAL;
        }
      }
    }
  }

  return normalizarInformacaoNutricional({ ...info, linhas });
}

export function normalizarFichaTecnicaComNutricao(ficha: FichaTecnica): FichaTecnica {
  return {
    ...ficha,
    informacao_nutricional: normalizarInformacaoNutricional(ficha.informacao_nutricional),
  };
}

export function formatarValorNutricional(valor: number | null | undefined, unidade: LinhaInformacaoNutricional["unidade"]): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) {
    return "—";
  }

  if (unidade === "kcal" || unidade === "kJ") {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(valor);
  }

  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(valor);
}
