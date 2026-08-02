import * as XLSX from "xlsx";

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
  codigos_duplicados: number;
  codigos_formato_invalido: number;
  nomes_iguais_codigos_diferentes: number;
  complementos_sem_pai_correspondente: number;
  registros_validos: number;
  registros_com_avisos: number;
  registros_com_conflitos: number;
}

export interface AnaliseSaiposFalha {
  sucesso: false;
  faltando_colunas: string[];
  registros: [];
  resumo: ResumoSaipos;
}

export interface AnaliseSaiposSucesso {
  sucesso: true;
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
  codigos_duplicados: 0,
  codigos_formato_invalido: 0,
  nomes_iguais_codigos_diferentes: 0,
  complementos_sem_pai_correspondente: 0,
  registros_validos: 0,
  registros_com_avisos: 0,
  registros_com_conflitos: 0,
};

function clonarResumoVazio(): ResumoSaipos {
  return structuredClone(RESUMO_VAZIO);
}

function normalizarTexto(valor: unknown): string {
  return valor === null || valor === undefined ? "" : String(valor);
}

function normalizarChave(valor: string): string {
  return valor
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizarTipo(valor: string): TipoSaiposRegistro | "OUTRO" {
  const tipo = normalizarChave(valor);
  if (tipo.includes("COMPLEMENT")) return "COMPLEMENTO";
  if (tipo.includes("PRATO")) return "PRATO";
  return "OUTRO";
}

function inativoParaBooleano(valor: string): boolean {
  const chave = normalizarChave(valor);
  if (!chave) return false;
  if (["SIM", "S", "TRUE", "1", "X", "INATIVO", "INATIVA", "DESATIVADO"].includes(chave)) return true;
  if (["NAO", "NÃO", "N", "FALSE", "0", "ATIVO"].includes(chave)) return false;
  return chave !== "";
}

function parsePrecoCentavos(valor: string): number | null {
  const limpo = valor.trim();
  if (!limpo) return null;
  const convertido = limpo
    .replace(/^R\$\s*/i, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const numero = Number(convertido);
  if (!Number.isFinite(numero)) return null;
  return Math.round(numero * 100);
}

function extrairCabecalhos(linha: unknown[]): string[] {
  return linha.map((item) => normalizarTexto(item).trim());
}

function obterIndiceColunas(cabecalhos: string[]): Map<string, number> {
  return new Map(cabecalhos.map((cabecalho, indice) => [cabecalho, indice] as const));
}

function textoDaCelula(linha: unknown[], indice: number): string {
  return normalizarTexto(linha[indice]);
}

function linhaVazia(linha: unknown[]): boolean {
  return linha.every((valor) => normalizarTexto(valor).trim() === "");
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
  const precoCentavos = parsePrecoCentavos(precoTexto);
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

  if (precoTexto.trim() && precoCentavos === null) {
    alertas.push("Preço não pôde ser convertido para centavos.");
  }

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
    alertas,
    conflitos,
    indicador: conflitos.length > 0 ? "CONFLITO" : alertas.length > 0 ? "AVISO" : "VALIDO",
    codigo_valido: codigoValido,
  };
}

function marcarConflitosDeDuplicidade(registros: RegistroSaiposPrevisto[]): void {
  const grupos = new Map<string, RegistroSaiposPrevisto[]>();
  for (const registro of registros) {
    const chave = registro.codigo_completo.trim();
    if (!chave) continue;
    const lista = grupos.get(chave) ?? [];
    lista.push(registro);
    grupos.set(chave, lista);
  }

  for (const grupo of Array.from(grupos.values())) {
    if (grupo.length <= 1) continue;
    for (const registro of grupo) {
      registro.conflitos.push("Código Saipos duplicado.");
      registro.indicador = "CONFLITO";
    }
  }
}

function marcarNomesIguaisComCodigosDiferentes(registros: RegistroSaiposPrevisto[]): void {
  const grupos = new Map<string, Map<string, RegistroSaiposPrevisto[]>>();
  for (const registro of registros) {
    const nome = normalizarChave(`${registro.descricao} ${registro.complemento}`.trim());
    if (!nome) continue;
    const codigos = grupos.get(nome) ?? new Map<string, RegistroSaiposPrevisto[]>();
    const chaveCodigo = registro.codigo_completo.trim();
    const lista = codigos.get(chaveCodigo) ?? [];
    lista.push(registro);
    codigos.set(chaveCodigo, lista);
    grupos.set(nome, codigos);
  }

  for (const codigos of Array.from(grupos.values())) {
    if (codigos.size <= 1) continue;
    for (const registrosDoNome of Array.from(codigos.values())) {
      for (const registro of registrosDoNome) {
        registro.alertas.push("Mesmo nome com código diferente.");
        if (registro.indicador === "VALIDO") {
          registro.indicador = "AVISO";
        }
      }
    }
  }
}

function marcarComplementosSemPai(registros: RegistroSaiposPrevisto[]): void {
  const pratos = new Set(
    registros.filter((registro) => registro.tipo === "PRATO").map((registro) => registro.codigo_completo.trim())
  );

  for (const registro of registros) {
    if (registro.tipo !== "COMPLEMENTO") continue;
    if (registro.codigo_prato_pai && !pratos.has(registro.codigo_prato_pai.trim())) {
      registro.conflitos.push("Complemento sem prato-pai correspondente.");
      registro.indicador = "CONFLITO";
    }
  }
}

function resumir(registros: RegistroSaiposPrevisto[]): ResumoSaipos {
  const resumo = clonarResumoVazio();
  resumo.total_registros = registros.length;
  for (const registro of registros) {
    if (registro.tipo === "PRATO") resumo.pratos += 1;
    if (registro.tipo === "COMPLEMENTO") resumo.complementos += 1;
    if (registro.ativo) resumo.ativos += 1;
    if (!registro.ativo) resumo.inativos += 1;
    if (registro.codigo_completo.trim() === "") resumo.codigos_vazios += 1;
    if (registro.conflitos.some((item) => item === "Código Saipos duplicado.")) resumo.codigos_duplicados += 1;
    if (registro.conflitos.some((item) => item.includes("estrutura hierárquica") || item === "Tipo não reconhecido.")) {
      resumo.codigos_formato_invalido += 1;
    }
    if (registro.conflitos.some((item) => item === "Complemento sem prato-pai correspondente.")) {
      resumo.complementos_sem_pai_correspondente += 1;
    }
    if (registro.indicador === "VALIDO") resumo.registros_validos += 1;
    if (registro.indicador === "AVISO") resumo.registros_com_avisos += 1;
    if (registro.indicador === "CONFLITO") resumo.registros_com_conflitos += 1;
  }
  resumo.nomes_iguais_codigos_diferentes = registros.filter((registro) =>
    registro.alertas.some((item) => item === "Mesmo nome com código diferente.")
  ).length;
  return resumo;
}

export function criarAnaliseSaiposVazia(): AnaliseSaiposFalha {
  return {
    sucesso: false,
    faltando_colunas: [],
    registros: [],
    resumo: clonarResumoVazio(),
  };
}

export function analisarPlanilhaSaipos(input: ArrayBuffer | Uint8Array | string): AnaliseSaiposResultado {
  const workbook = XLSX.read(input, { type: typeof input === "string" ? "binary" : "array", cellText: true, raw: false });
  const nomeAba = workbook.SheetNames[0];
  const planilha = nomeAba ? workbook.Sheets[nomeAba] : undefined;
  if (!planilha) {
    return {
      sucesso: false,
      faltando_colunas: [...COLUNAS_SAIPOS_OBRIGATORIAS],
      registros: [],
      resumo: clonarResumoVazio(),
    };
  }

  const linhas = XLSX.utils.sheet_to_json(planilha, { header: 1, raw: false, defval: "", blankrows: false }) as unknown[][];
  const [cabecalho = [], ...dados] = linhas;
  const colunas = extrairCabecalhos(cabecalho);
  const mapaColunas = obterIndiceColunas(colunas);
  const faltando = COLUNAS_SAIPOS_OBRIGATORIAS.filter((coluna) => !mapaColunas.has(coluna));

  if (faltando.length > 0) {
    return {
      sucesso: false,
      faltando_colunas: faltando,
      registros: [],
      resumo: clonarResumoVazio(),
    };
  }

  const registros = dados
    .filter((linha) => !linhaVazia(linha))
    .map((linha, indice) => criarRegistro(linha, mapaColunas, indice + 2));

  marcarConflitosDeDuplicidade(registros);
  marcarNomesIguaisComCodigosDiferentes(registros);
  marcarComplementosSemPai(registros);

  return {
    sucesso: true,
    faltando_colunas: [],
    registros,
    resumo: resumir(registros),
  };
}
