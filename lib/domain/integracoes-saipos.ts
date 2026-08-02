import * as XLSX from "xlsx";

export const SAIPOS_EXTENSAO_PERMITIDA = ".xlsx";
export const SAIPOS_MAX_BYTES_ARQUIVO = 10 * 1024 * 1024;
export const SAIPOS_MAX_REGISTROS = 20_000;

export const COLUNAS_SAIPOS_OBRIGATORIAS = [
  "Tipo",
  "Categoria",
  "Tamanho",
  "Descrição",
  "Complemento",
  "Preço",
  "Pesável",
  "Código Saipos",
  "Inativo",
] as const;

export const CLASSIFICACOES_FUTURAS_SAIPOS = [
  "NÃO CLASSIFICADO",
  "ALTERA RECEITA/CUSTO",
  "VARIAÇÃO DO PRATO",
  "COMBO/OFERTA",
  "EMBALAGEM",
  "OPERACIONAL",
  "IGNORAR",
] as const;

export type ClassificacaoFuturaSaipos = (typeof CLASSIFICACOES_FUTURAS_SAIPOS)[number];
export type TipoSaiposRegistro = "PRATO" | "COMPLEMENTO";
export type IndicadorSaipos = "VALIDO" | "AVISO" | "CONFLITO";

export interface ArquivoSaiposEntrada {
  name: string;
  size: number;
}

export interface RegistroSaiposPrevisto {
  linha_planilha: number;
  tipo: TipoSaiposRegistro | "OUTRO";
  codigo_completo: string;
  codigo_prato: string;
  codigo_prato_pai: string;
  codigo_opcao: string;
  descricao: string;
  descricao_prato: string;
  complemento: string;
  categoria: string;
  tamanho: string;
  preco_texto: string;
  preco_centavos: number | null;
  pesavel: string;
  ativo: boolean;
  inativo_texto: string;
  classificacao_futura: ClassificacaoFuturaSaipos;
  nome_canonico: string;
  alertas: string[];
  conflitos: string[];
  indicador: IndicadorSaipos;
  codigo_valido: boolean;
}

export interface ResumoSaipos {
  total_registros: number;
  pratos: number;
  complementos: number;
  ativos: number;
  inativos: number;
  codigos_vazios: number;
  codigos_duplicados_distintos: number;
  codigos_duplicados_registros_afetados: number;
  codigos_formato_invalido: number;
  nomes_repetidos_grupos: number;
  nomes_repetidos_registros_afetados: number;
  complementos_sem_pai: number;
  registros_com_aviso: number;
  registros_com_conflito: number;
  registros_validos: number;
}

export interface AnaliseSaiposFalha {
  sucesso: false;
  erro: string;
  faltando_colunas: string[];
  registros: [];
  resumo: ResumoSaipos;
}

export interface AnaliseSaiposSucesso {
  sucesso: true;
  erro: null;
  faltando_colunas: [];
  registros: RegistroSaiposPrevisto[];
  resumo: ResumoSaipos;
}

export type AnaliseSaiposResultado = AnaliseSaiposFalha | AnaliseSaiposSucesso;

const RESUMO_VAZIO: ResumoSaipos = {
  total_registros: 0,
  pratos: 0,
  complementos: 0,
  ativos: 0,
  inativos: 0,
  codigos_vazios: 0,
  codigos_duplicados_distintos: 0,
  codigos_duplicados_registros_afetados: 0,
  codigos_formato_invalido: 0,
  nomes_repetidos_grupos: 0,
  nomes_repetidos_registros_afetados: 0,
  complementos_sem_pai: 0,
  registros_com_aviso: 0,
  registros_com_conflito: 0,
  registros_validos: 0,
};

function clonarResumoVazio(): ResumoSaipos {
  return structuredClone(RESUMO_VAZIO);
}

function normalizarTexto(valor: unknown): string {
  return valor === null || valor === undefined ? "" : String(valor);
}

function normalizarChaveComparacao(valor: string): string {
  return valor
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizarTipo(valor: string): TipoSaiposRegistro | "OUTRO" {
  const tipo = normalizarChaveComparacao(valor);
  if (tipo.includes("COMPLEMENT")) return "COMPLEMENTO";
  if (tipo.includes("PRATO")) return "PRATO";
  return "OUTRO";
}

function inativoParaBooleano(valor: string): boolean {
  const chave = normalizarChaveComparacao(valor);
  if (!chave) return false;
  if (["SIM", "S", "TRUE", "1", "X", "INATIVO", "INATIVA", "DESATIVADO"].includes(chave)) return true;
  if (["NAO", "NÃO", "N", "FALSE", "0", "ATIVO"].includes(chave)) return false;
  return chave !== "";
}

function textoDaCelula(linha: unknown[], indice: number): string {
  return normalizarTexto(linha[indice]);
}

function linhaVazia(linha: unknown[]): boolean {
  return linha.every((valor) => normalizarTexto(valor).trim() === "");
}

function extrairCabecalhos(linha: unknown[]): string[] {
  return linha.map((item) => normalizarTexto(item).trim());
}

function obterIndiceColunas(cabecalhos: string[]): Map<string, number> {
  return new Map(cabecalhos.map((cabecalho, indice) => [cabecalho, indice] as const));
}

export function validarArquivoSaiposLocal(arquivo: ArquivoSaiposEntrada): string | null {
  const nome = arquivo.name.trim().toLowerCase();
  if (!nome.endsWith(SAIPOS_EXTENSAO_PERMITIDA)) {
    return "Formato inválido. Selecione um arquivo .xlsx.";
  }
  if (!Number.isFinite(arquivo.size) || arquivo.size <= 0) {
    return "Arquivo vazio. Selecione um arquivo .xlsx com conteúdo.";
  }
  if (arquivo.size > SAIPOS_MAX_BYTES_ARQUIVO) {
    return "Arquivo excede 10 MB. Envie um .xlsx menor.";
  }
  return null;
}

export function nomeCanonicoRegistro(tipo: TipoSaiposRegistro | "OUTRO", descricao: string, complemento: string): string {
  const complementoPreenchido = complemento.trim();
  if (tipo === "PRATO") {
    return descricao;
  }
  if (tipo === "COMPLEMENTO" && complementoPreenchido && complementoPreenchido !== "-") {
    return complemento;
  }
  return descricao;
}

function parsePrecoCentavos(valorBruto: unknown): { centavos: number | null; erro?: string } {
  if (valorBruto === null || valorBruto === undefined) {
    return { centavos: null };
  }

  if (typeof valorBruto === "number") {
    if (!Number.isFinite(valorBruto)) {
      return { centavos: null, erro: "Preço inválido." };
    }
    return { centavos: Math.round(valorBruto * 100) };
  }

  const textoOriginal = String(valorBruto).trim();
  if (!textoOriginal) {
    return { centavos: null };
  }

  let limpo = textoOriginal
    .replace(/^R\$\s*/i, "")
    .replace(/\s+/g, "")
    .replace(/[−–—]/g, "-");

  const temVirgula = limpo.includes(",");
  const temPonto = limpo.includes(".");

  if (temVirgula && temPonto) {
    const ultimaVirgula = limpo.lastIndexOf(",");
    const ultimoPonto = limpo.lastIndexOf(".");
    if (ultimaVirgula > ultimoPonto) {
      limpo = limpo.replace(/\./g, "").replace(/,/g, ".");
    } else {
      limpo = limpo.replace(/,/g, "");
    }
  } else if (temVirgula) {
    limpo = limpo.replace(/,/g, ".");
  }

  if (!/^-?\d+(\.\d+)?$/.test(limpo)) {
    return { centavos: null, erro: `Preço inválido: ${textoOriginal}.` };
  }

  const numero = Number(limpo);
  if (!Number.isFinite(numero)) {
    return { centavos: null, erro: `Preço inválido: ${textoOriginal}.` };
  }

  return { centavos: Math.round(numero * 100) };
}

function criarRegistro(
  linha: unknown[],
  mapaColunas: Map<string, number>,
  numeroLinhaPlanilha: number
): RegistroSaiposPrevisto {
  const tipoTexto = textoDaCelula(linha, mapaColunas.get("Tipo") ?? -1);
  const categoria = textoDaCelula(linha, mapaColunas.get("Categoria") ?? -1);
  const tamanho = textoDaCelula(linha, mapaColunas.get("Tamanho") ?? -1);
  const descricao = textoDaCelula(linha, mapaColunas.get("Descrição") ?? -1);
  const complemento = textoDaCelula(linha, mapaColunas.get("Complemento") ?? -1);
  const precoTexto = textoDaCelula(linha, mapaColunas.get("Preço") ?? -1);
  const pesavel = textoDaCelula(linha, mapaColunas.get("Pesável") ?? -1);
  const codigoCompleto = textoDaCelula(linha, mapaColunas.get("Código Saipos") ?? -1);
  const inativoTexto = textoDaCelula(linha, mapaColunas.get("Inativo") ?? -1);

  const tipo = normalizarTipo(tipoTexto);
  const codigoNormalizado = codigoCompleto.trim();
  const { centavos: precoCentavos, erro: erroPreco } = parsePrecoCentavos(precoTexto);
  const ativo = !inativoParaBooleano(inativoTexto);
  const alertas: string[] = [];
  const conflitos: string[] = [];
  let codigoPrato = codigoNormalizado;
  let codigoPratoPai = "";
  let codigoOpcao = "";
  let codigoValido = codigoNormalizado !== "";

  if (codigoNormalizado === "") {
    conflitos.push("Código Saipos vazio.");
  }

  if (tipo === "COMPLEMENTO") {
    const separador = codigoNormalizado.indexOf(".");
    if (separador <= 0 || separador === codigoNormalizado.length - 1) {
      conflitos.push("Código Saipos de complemento sem estrutura hierárquica válida.");
      codigoValido = false;
    } else {
      codigoPratoPai = codigoNormalizado.slice(0, separador);
      codigoOpcao = codigoNormalizado.slice(separador + 1);
      codigoPrato = codigoPratoPai;
    }
  }

  if (tipo === "OUTRO") {
    conflitos.push("Tipo não reconhecido.");
    codigoValido = false;
  }

  if (erroPreco) {
    alertas.push(erroPreco);
  }

  const nomeCanonico = nomeCanonicoRegistro(tipo, descricao, complemento);

  return {
    linha_planilha: numeroLinhaPlanilha,
    tipo,
    codigo_completo: codigoCompleto,
    codigo_prato: codigoPrato,
    codigo_prato_pai: codigoPratoPai,
    codigo_opcao: codigoOpcao,
    descricao,
    descricao_prato: descricao,
    complemento,
    categoria,
    tamanho,
    preco_texto: precoTexto,
    preco_centavos: precoCentavos,
    pesavel,
    ativo,
    inativo_texto: inativoTexto,
    classificacao_futura: "NÃO CLASSIFICADO",
    nome_canonico: nomeCanonico,
    alertas,
    conflitos,
    indicador: conflitos.length > 0 ? "CONFLITO" : alertas.length > 0 ? "AVISO" : "VALIDO",
    codigo_valido: codigoValido,
  };
}

function marcarCodigosDuplicados(registros: RegistroSaiposPrevisto[]): { distintos: number; afetados: number } {
  const grupos = new Map<string, RegistroSaiposPrevisto[]>();
  for (const registro of registros) {
    const chave = registro.codigo_completo.trim();
    if (!chave) continue;
    const lista = grupos.get(chave) ?? [];
    lista.push(registro);
    grupos.set(chave, lista);
  }

  let distintos = 0;
  let afetados = 0;

  for (const grupo of Array.from(grupos.values())) {
    if (grupo.length <= 1) continue;
    distintos += 1;
    afetados += grupo.length;
    for (const registro of grupo) {
      registro.conflitos.push("Código Saipos duplicado.");
      registro.indicador = "CONFLITO";
    }
  }

  return { distintos, afetados };
}

function marcarNomesIguaisComCodigosDiferentes(registros: RegistroSaiposPrevisto[]): { grupos: number; afetados: number } {
  const grupos = new Map<string, Map<string, RegistroSaiposPrevisto[]>>();

  for (const registro of registros) {
    const chaveNome = normalizarChaveComparacao(registro.nome_canonico);
    if (!chaveNome) continue;

    const codigos = grupos.get(chaveNome) ?? new Map<string, RegistroSaiposPrevisto[]>();
    const chaveCodigo = registro.codigo_completo.trim();
    const lista = codigos.get(chaveCodigo) ?? [];
    lista.push(registro);
    codigos.set(chaveCodigo, lista);
    grupos.set(chaveNome, codigos);
  }

  let gruposRepetidos = 0;
  let registrosAfetados = 0;

  for (const codigos of Array.from(grupos.values())) {
    const codigosDistintosNaoVazios = Array.from(codigos.keys()).filter((codigo) => codigo !== "");
    if (codigosDistintosNaoVazios.length <= 1) continue;

    gruposRepetidos += 1;

    for (const registrosDoNome of Array.from(codigos.values())) {
      for (const registro of registrosDoNome) {
        registrosAfetados += 1;
        registro.alertas.push("Mesmo nome canônico com código diferente.");
        if (registro.indicador === "VALIDO") {
          registro.indicador = "AVISO";
        }
      }
    }
  }

  return {
    grupos: gruposRepetidos,
    afetados: registrosAfetados,
  };
}

function marcarComplementosSemPai(registros: RegistroSaiposPrevisto[]): number {
  const pratos = new Set(
    registros.filter((registro) => registro.tipo === "PRATO").map((registro) => registro.codigo_completo.trim())
  );

  let afetados = 0;
  for (const registro of registros) {
    if (registro.tipo !== "COMPLEMENTO") continue;
    if (registro.codigo_prato_pai && !pratos.has(registro.codigo_prato_pai.trim())) {
      afetados += 1;
      registro.conflitos.push("Complemento sem prato-pai correspondente.");
      registro.indicador = "CONFLITO";
    }
  }

  return afetados;
}

function resumir(
  registros: RegistroSaiposPrevisto[],
  duplicados: { distintos: number; afetados: number },
  nomesRepetidos: { grupos: number; afetados: number },
  semPai: number
): ResumoSaipos {
  const resumo = clonarResumoVazio();
  resumo.total_registros = registros.length;
  resumo.codigos_duplicados_distintos = duplicados.distintos;
  resumo.codigos_duplicados_registros_afetados = duplicados.afetados;
  resumo.nomes_repetidos_grupos = nomesRepetidos.grupos;
  resumo.nomes_repetidos_registros_afetados = nomesRepetidos.afetados;
  resumo.complementos_sem_pai = semPai;

  for (const registro of registros) {
    if (registro.tipo === "PRATO") resumo.pratos += 1;
    if (registro.tipo === "COMPLEMENTO") resumo.complementos += 1;
    if (registro.ativo) resumo.ativos += 1;
    if (!registro.ativo) resumo.inativos += 1;
    if (registro.codigo_completo.trim() === "") resumo.codigos_vazios += 1;
    if (registro.conflitos.some((item) => item.includes("estrutura hierárquica") || item === "Tipo não reconhecido.")) {
      resumo.codigos_formato_invalido += 1;
    }
    if (registro.indicador === "VALIDO") resumo.registros_validos += 1;
    if (registro.indicador === "AVISO") resumo.registros_com_aviso += 1;
    if (registro.indicador === "CONFLITO") resumo.registros_com_conflito += 1;
  }

  return resumo;
}

export function criarAnaliseSaiposVazia(): AnaliseSaiposFalha {
  return {
    sucesso: false,
    erro: "",
    faltando_colunas: [],
    registros: [],
    resumo: clonarResumoVazio(),
  };
}

function falha(erro: string, faltando_colunas: string[] = []): AnaliseSaiposFalha {
  return {
    sucesso: false,
    erro,
    faltando_colunas,
    registros: [],
    resumo: clonarResumoVazio(),
  };
}

export function analisarPlanilhaSaipos(input: ArrayBuffer | Uint8Array | string): AnaliseSaiposResultado {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(input, {
      type: typeof input === "string" ? "binary" : "array",
      cellText: true,
      raw: false,
    });
  } catch {
    return falha("Arquivo corrompido ou inválido. Verifique o .xlsx e tente novamente.");
  }

  const nomeAba = workbook.SheetNames[0];
  const planilha = nomeAba ? workbook.Sheets[nomeAba] : undefined;

  if (!planilha) {
    return falha("A planilha está vazia ou sem abas legíveis.", [...COLUNAS_SAIPOS_OBRIGATORIAS]);
  }

  const linhas = XLSX.utils.sheet_to_json(planilha, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  }) as unknown[][];

  if (linhas.length === 0) {
    return falha("A planilha está vazia.");
  }

  const [cabecalho = [], ...dados] = linhas;
  const colunas = extrairCabecalhos(cabecalho);
  const mapaColunas = obterIndiceColunas(colunas);
  const faltando = COLUNAS_SAIPOS_OBRIGATORIAS.filter((coluna) => !mapaColunas.has(coluna));

  if (faltando.length > 0) {
    if (faltando.length === COLUNAS_SAIPOS_OBRIGATORIAS.length) {
      return falha("Arquivo corrompido ou inválido. Verifique o .xlsx e tente novamente.");
    }
    return falha(`Colunas obrigatórias ausentes: ${faltando.join(", ")}.`, faltando);
  }

  const linhasComConteudo = dados.filter((linha) => !linhaVazia(linha));
  if (linhasComConteudo.length === 0) {
    return falha("A planilha não possui registros para análise.");
  }

  if (linhasComConteudo.length > SAIPOS_MAX_REGISTROS) {
    return falha(`A planilha excede o limite de ${SAIPOS_MAX_REGISTROS} registros.`);
  }

  const registros = linhasComConteudo.map((linha, indice) => criarRegistro(linha, mapaColunas, indice + 2));
  const duplicados = marcarCodigosDuplicados(registros);
  const nomesRepetidos = marcarNomesIguaisComCodigosDiferentes(registros);
  const semPai = marcarComplementosSemPai(registros);

  return {
    sucesso: true,
    erro: null,
    faltando_colunas: [],
    registros,
    resumo: resumir(registros, duplicados, nomesRepetidos, semPai),
  };
}
