import type { Boleto, DB, Fornecedor, MeioPagamentoNota, NotaFiscal, StatusBoleto } from "../types";

export type MeioPagamentoNfse = MeioPagamentoNota;

export interface DadosNfseExtraidos {
  numero?: string;
  serie?: string;
  emitida_em?: string;
  cnpj_prestador?: string;
  razao_social_prestador?: string;
  cnpj_tomador?: string;
  razao_social_tomador?: string;
  valor_total?: number;
  descricao_servico?: string;
  chave_nfse?: string;
  municipio?: string;
  codigo_servico?: string;
}

export interface RegistroNfseEntrada {
  fornecedor_id: string;
  numero: string;
  chave_nfse: string;
  cnpj_emitente: string;
  razao_social_emitente: string;
  valor_total: number;
  emitida_em: string;
  importada_em: string;
  descricao_servico?: string;
  municipio_emissao?: string;
  arquivo_pdf_nome?: string;
  meio_pagamento: MeioPagamentoNfse;
  vencimento: string;
  observacao?: string;
}

export interface RegistroNfseResultado {
  sucesso: boolean;
  mensagem?: string;
  notaId?: string;
  boletoId?: string;
}

function somenteDigitos(valor?: string): string {
  return (valor ?? "").replace(/\D+/g, "");
}

function formatarCnpj(digitos: string): string {
  const n = somenteDigitos(digitos).slice(0, 14);
  if (n.length !== 14) return digitos;
  return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function normalizarDataIso(valor: string): string | undefined {
  const limpo = valor.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpo)) return limpo;
  const br = limpo.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!br) return undefined;
  return `${br[3]}-${br[2]}-${br[1]}`;
}

function parseValorBr(bruto: string): number | undefined {
  const limpo = bruto.trim();
  if (!limpo) return undefined;
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const n = Number(normalizado);
  if (!Number.isFinite(n)) return undefined;
  return Number(n.toFixed(2));
}

function primeiroMatch(texto: string, regex: RegExp): string | undefined {
  const m = texto.match(regex);
  return m?.[1]?.trim() || undefined;
}

function todosMatches(texto: string, regex: RegExp): string[] {
  const out: string[] = [];
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  for (const m of texto.matchAll(re)) {
    if (m[1]?.trim()) out.push(m[1].trim());
  }
  return out;
}

const RE_MOEDA_BR = String.raw`(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})`;
/** Só CNPJ formatado — evita pegar 14 dígitos do meio da chave de acesso. */
const RE_CNPJ_FMT = String.raw`(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})`;

/** CNPJ matriz iFood — fallback se o PDF não trouxer o formatado. */
const CNPJ_IFOOD_MATRIZ = "14380200000121";

function contextoSuspeitoValor(antes: string): boolean {
  return /desconto|imposto|aproximad|iss\b|al[ií]quota|base\s*de\s*c[aá]lculo|retid|pis|cofins|csll|inss|irrf/i.test(
    antes.slice(-40)
  );
}

/**
 * Procura valor total em layouts onde rótulo e cifra ficam em linhas diferentes (comum no PDF).
 */
function extrairValorTotalNfse(texto: string): number | undefined {
  const candidatos: { valor: number; peso: number }[] = [];

  const rotulos: { re: RegExp; peso: number }[] = [
    { re: new RegExp(String.raw`Valor\s*Total\s*da\s*Nota[\s\S]{0,60}?${RE_MOEDA_BR}`, "i"), peso: 100 },
    {
      re: new RegExp(String.raw`Valor\s*total\s*da\s*NFS-?e(?:\s*Campinas)?[\s\S]{0,80}?R\$\s*${RE_MOEDA_BR}`, "i"),
      peso: 98,
    },
    { re: new RegExp(String.raw`Valor\s*Total\s*d[oa]s?\s*Servi[cç]os?[\s\S]{0,60}?${RE_MOEDA_BR}`, "i"), peso: 95 },
    { re: new RegExp(String.raw`Valor\s*d[oa]s?\s*Servi[cç]os?[\s\S]{0,40}?${RE_MOEDA_BR}`, "i"), peso: 90 },
    {
      re: new RegExp(String.raw`Valor\s*L[ií]quido(?:\s*da\s*(?:Nota|NFS-?e(?:\s*Campinas)?))?[\s\S]{0,40}?${RE_MOEDA_BR}`, "i"),
      peso: 80,
    },
    { re: new RegExp(String.raw`Total\s*(?:da\s*)?(?:NFS-?e|Nota)[\s\S]{0,40}?${RE_MOEDA_BR}`, "i"), peso: 70 },
  ];

  for (const { re, peso } of rotulos) {
    const reG = new RegExp(re.source, "gi");
    for (const m of texto.matchAll(reG)) {
      const valor = parseValorBr(m[1]);
      if (valor == null || valor <= 0) continue;
      const idx = m.index ?? 0;
      if (contextoSuspeitoValor(texto.slice(Math.max(0, idx - 40), idx))) continue;
      candidatos.push({ valor, peso });
    }
  }

  // Linha seguinte ao rótulo (tabela Paulistana / Campinas / iFood)
  const linhas = texto.split(/\r?\n/);
  for (let i = 0; i < linhas.length; i += 1) {
    const linha = linhas[i];
    if (/^VALOR\s*TOTAL\s*$/i.test(linha.trim())) {
      // Campinas: valores na linha ANTERIOR ao rótulo "VALOR TOTAL"
      const ant = linhas[i - 1] ?? "";
      const moedasAnt = [...ant.matchAll(new RegExp(String.raw`R\$\s*${RE_MOEDA_BR}`, "gi"))].map((m) =>
        parseValorBr(m[1])
      );
      const positivosAnt = moedasAnt.filter((v): v is number => v != null && v > 0);
      if (positivosAnt.length) candidatos.push({ valor: positivosAnt[0], peso: 97 });
    }
    if (!/Valor\s*(Total\s*)?(d[oa]s?\s*Servi[cç]os?|da\s*(?:Nota|NFS-?e)|L[ií]quido|total\s*da\s*NFS)/i.test(linha)) {
      continue;
    }
    if (/desconto|imposto|aproximad/i.test(linha)) continue;
    const naLinha = linha.match(new RegExp(RE_MOEDA_BR, "g"));
    if (naLinha?.length) {
      const ultimo = parseValorBr(naLinha[naLinha.length - 1]);
      if (ultimo != null && ultimo > 0) candidatos.push({ valor: ultimo, peso: 85 });
    }
    const prox = linhas[i + 1] ?? "";
    const moedasProx = [...prox.matchAll(new RegExp(String.raw`R\$\s*${RE_MOEDA_BR}|${RE_MOEDA_BR}`, "g"))].map((m) =>
      parseValorBr(m[1] ?? m[0])
    );
    const positivos = moedasProx.filter((v): v is number => v != null && v > 0);
    // Campinas: "… R$ 2,20 R$ 110,00 …" — pega o maior valor plausível da linha (não a alíquota)
    if (positivos.length === 1) candidatos.push({ valor: positivos[0], peso: 88 });
    if (positivos.length > 1) {
      const semAliquota = positivos.filter((v) => v >= 1);
      const escolhido = semAliquota.length ? Math.max(...semAliquota) : positivos[0];
      candidatos.push({ valor: escolhido, peso: 92 });
    }
  }

  if (!candidatos.length) return undefined;
  candidatos.sort((a, b) => b.peso - a.peso || b.valor - a.valor);
  return candidatos[0].valor;
}

function extrairCnpjPrestadorNfse(texto: string, _chaveAcesso?: string): string | undefined {
  // iFood: CNPJ na linha seguinte ao nome (Campinas) ou na linha anterior (Paulistana)
  const ifoodLinhaSeguinte = primeiroMatch(
    texto,
    new RegExp(String.raw`IFOOD\.?[^\n]*\n\s*${RE_CNPJ_FMT}`, "i")
  );
  const ifoodLinhaAnterior = primeiroMatch(
    texto,
    new RegExp(String.raw`${RE_CNPJ_FMT}\s*\n(?:[^\n]{0,80}\n){0,4}[^\n]*IFOOD`, "i")
  );
  for (const bruto of [ifoodLinhaSeguinte, ifoodLinhaAnterior]) {
    if (!bruto) continue;
    const d = somenteDigitos(bruto);
    if (d.length === 14) return d;
  }

  const noBlocoPrestador = primeiroMatch(
    texto,
    new RegExp(
      String.raw`(?:Prestador\s*(?:de\s*Servi[cç]os?|do\s*Servi[cç]o)?|PRESTADOR DE SERVI|EMITENTE)[\s\S]{0,500}?${RE_CNPJ_FMT}`,
      "i"
    )
  );
  if (noBlocoPrestador) {
    const d = somenteDigitos(noBlocoPrestador);
    if (d.length === 14) return d;
  }

  const formatados = todosMatches(texto, new RegExp(RE_CNPJ_FMT, "g"))
    .map((c) => somenteDigitos(c))
    .filter((d) => d.length === 14);

  const ifood = formatados.find((d) => d.startsWith("14380200"));
  if (ifood) return ifood;
  if (formatados.length) return formatados[0];
  if (/IFOOD/i.test(texto)) return CNPJ_IFOOD_MATRIZ;
  return undefined;
}

function extrairNumeroNfse(texto: string): { numero?: string; serie?: string } {
  // Campinas: Competência → "13358572 / E 08/2026"
  const comp = texto.match(/Compet[eê]ncia\s*\n?\s*0*(\d{4,12})\s*\/\s*([A-Z0-9]{1,6})/i);
  if (comp) return { numero: comp[1], serie: comp[2] };

  const numero =
    primeiroMatch(texto, /N[uú]mero\s*(?:da\s*)?(?:Nota|NFS-?e)\s*[:.]?\s*0*(\d{1,12})/i) ||
    primeiroMatch(texto, /Nota\s*(?:Fiscal)?\s*N[º°o\.]*\s*[:.]?\s*0*(\d{1,12})/i) ||
    primeiroMatch(texto, /N[º°o\.]\s*(?:da\s*)?(?:Nota|NFS-?e)\s*[:.]?\s*0*(\d{1,12})/i) ||
    primeiroMatch(texto, /NF(?:S-?e)?\s*[: nº°]*\s*0*(\d{4,12})\b/i);

  const serie = primeiroMatch(texto, /S[ée]rie\s*[:.=]\s*([A-Z0-9]{1,6})\b/i);
  return { numero, serie };
}

function extrairChaveNfse(texto: string): string | undefined {
  const nacional =
    primeiroMatch(
      texto,
      /Chave\s*de\s*Acesso\s*(?:da\s*)?NFS-?e(?:\s*Nacional)?\s*[:.]?\s*\n?\s*(\d{44,50})/i
    ) || primeiroMatch(texto, /\b(\d{44,50})\b/);

  if (nacional) return nacional;

  return (
    primeiroMatch(texto, /Chave\s*(?:de\s*Acesso\s*)?(?:da\s*)?NFS-?e\s*[:.]?\s*((?:NFS)?[A-Z0-9]{40,70})/i) ||
    primeiroMatch(texto, /\b(NFS\d{40,60})\b/i) ||
    primeiroMatch(texto, /C[oó]digo\s*de\s*Verifica[cç][aã]o\s*[:.]?\s*\n?\s*([A-Z0-9\-]{6,20})/i)
  );
}

function extrairEmitidaEm(texto: string): string | undefined {
  const aposRotulo =
    primeiroMatch(texto, /Data\s*(?:e\s*Hora\s*)?(?:de\s*)?Emiss[aã]o\s*[:.]?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
    primeiroMatch(texto, /Emiss[aã]o\s*[:.]?\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (aposRotulo) return aposRotulo;

  // Campinas: data vem na linha ACIMA de "Data e hora de emissão"
  const antesRotulo = texto.match(/(\d{2}\/\d{2}\/\d{4})(?:\s+\d{2}:\d{2}:\d{2})?\s*\n\s*Data\s*e\s*hora\s*de\s*emiss/i);
  if (antesRotulo) return antesRotulo[1];

  return undefined;
}

/**
 * Extrai campos de NFS-e a partir de texto de PDF (layouts municipais variados).
 * Cobre Osasco, Campinas (NFSe nacional), Paulistana e PDFs fragmentados.
 */
export function extrairDadosNfseDoTexto(textoBruto: string): DadosNfseExtraidos {
  const texto = textoBruto.replace(/\u00a0/g, " ");

  const chave = extrairChaveNfse(texto);
  const { numero, serie } = extrairNumeroNfse(texto);
  const emitidaRaw = extrairEmitidaEm(texto);
  const valorTotal = extrairValorTotalNfse(texto);
  const cnpjPrestador = extrairCnpjPrestadorNfse(texto, chave);

  const razaoPrestador =
    primeiroMatch(texto, /\n\s*(IFOOD\.COM[^\n]+)/i) ||
    primeiroMatch(
      texto,
      /(?:Prestador\s*(?:de\s*Servi[cç]os?|do\s*Servi[cç]o)?|PRESTADOR)[\s\S]{0,200}?(?:Nome\s*\/\s*)?Raz[aã]o\s*Social\s*[:.]?\s*([^\n]+)/i
    ) ||
    primeiroMatch(texto, /(?:Nome\s*\/\s*Nome\s*Empresarial|Raz[aã]o\s*Social)\s*[:.]?\s*([^\n]*IFOOD[^\n]*)/i) ||
    primeiroMatch(texto, /Raz[aã]o\s*Social\s*[:.]?\s*([^\n]+)/i);

  const cnpjsFormatados = todosMatches(texto, new RegExp(RE_CNPJ_FMT, "g")).map((c) => somenteDigitos(c));
  const cnpjTomador =
    cnpjsFormatados.find((d) => d !== cnpjPrestador && d.length === 14) ||
    (() => {
      const bruto = primeiroMatch(
        texto,
        new RegExp(
          String.raw`(?:Tomador\s*(?:de\s*Servi[cç]os?|do\s*Servi[cç]o)?|TOMADOR)[\s\S]{0,500}?${RE_CNPJ_FMT}`,
          "i"
        )
      );
      return bruto ? somenteDigitos(bruto) : undefined;
    })();

  const razaoTomador =
    primeiroMatch(texto, /\n\s*((?:VERA|BELA)[^\n]*RESTAURANTE[^\n]*)/i) ||
    primeiroMatch(
      texto,
      /(?:Tomador\s*(?:de\s*Servi[cç]os?|do\s*Servi[cç]o)?|TOMADOR)[\s\S]{0,200}?(?:Nome\s*\/\s*)?Raz[aã]o\s*Social\s*[:.]?\s*([^\n]+)/i
    );

  const descricao =
    primeiroMatch(
      texto,
      /Discrimina[cç][aã]o\s*(?:d[oa]s?\s*)?Servi[cç]os?\s*[:.]?\s*([\s\S]{10,600}?)(?:\n\s*Valor\s*(?:Total|d[oa]s?\s*Servi)|Valor\s*L[ií]quido|\n\s*Tribut|ISS\b|Base\s*de\s*C[aá]lculo)/i
    ) ||
    primeiroMatch(
      texto,
      /((?:AGENCIAMENTO|LICENCIAMENTO|MENSALIDADE|INTERMEDIA[CÇ][AÃ]O)[^\n]{5,300})/i
    );

  const codigoServico =
    primeiroMatch(texto, /\b(\d{2}\.\d{2})\s*-\s*LICENCIAMENTO[^\n]*/i) ||
    primeiroMatch(texto, /C[oó]digo\s*(?:do\s*)?Servi[cç]o\s*[:.]?\s*([\d.]+(?:\s*-\s*[^\n]+)?)/i);

  const municipio =
    primeiroMatch(texto, /Prefeitura\s*(?:do\s*)?(?:Munic[ií]pio\s*)?(?:de\s*)?([A-Za-zÀ-ú ]{3,40})/i) ||
    (/Campinas/i.test(texto)
      ? "Campinas"
      : /Osasco/i.test(texto)
        ? "Osasco"
        : /S[aã]o\s*Paulo/i.test(texto)
          ? "São Paulo"
          : undefined);

  return {
    numero,
    serie,
    emitida_em: emitidaRaw ? normalizarDataIso(emitidaRaw) : undefined,
    cnpj_prestador: cnpjPrestador?.length === 14 ? cnpjPrestador : undefined,
    razao_social_prestador: razaoPrestador?.replace(/\s+/g, " ").trim(),
    cnpj_tomador: cnpjTomador?.length === 14 ? cnpjTomador : undefined,
    razao_social_tomador: razaoTomador?.replace(/\s+/g, " ").trim(),
    valor_total: valorTotal,
    descricao_servico: descricao?.replace(/\s+/g, " ").trim().slice(0, 500),
    chave_nfse: chave?.toUpperCase(),
    municipio: municipio?.replace(/\s+/g, " ").trim(),
    codigo_servico: codigoServico?.replace(/\s+/g, " ").trim(),
  };
}

export function chaveNfseValida(chave?: string): boolean {
  const limpa = (chave ?? "").trim().toUpperCase();
  if (!limpa) return false;
  if (limpa.startsWith("NFS") && limpa.length >= 40) return true;
  const digitos = somenteDigitos(limpa);
  // Chave de acesso nacional (44–50 dígitos) ou código municipal longo
  if (digitos.length >= 44 && digitos.length <= 50) return true;
  if (digitos.length >= 40) return true;
  // Nota Paulistana / Campinas: código de verificação (6–20 chars)
  if (/^[A-Z0-9\-]{6,20}$/.test(limpa)) return true;
  return false;
}

export function localizarNotaPorChaveNfse(db: DB, chave: string): NotaFiscal | undefined {
  const alvo = chave.trim().toUpperCase();
  if (!alvo) return undefined;
  return db.notas_fiscais.find(
    (n) =>
      (n.chave_nfse ?? "").toUpperCase() === alvo ||
      (n.tipo === "nfse" && n.chave_acesso.toUpperCase() === alvo)
  );
}

export function localizarFornecedorPorCnpj(db: DB, cnpj: string): Fornecedor | undefined {
  const digitos = somenteDigitos(cnpj);
  if (digitos.length !== 14) return undefined;
  return db.fornecedores.find((f) => somenteDigitos(f.cnpj) === digitos);
}

function formaPagamentoFornecedor(meio: MeioPagamentoNfse): Fornecedor["forma_pagamento"] {
  // Cadastro de fornecedor só tem boleto|pix; plataforma fica como pix.
  return meio === "boleto" ? "boleto" : "pix";
}

export function garantirFornecedorNfse(
  db: DB,
  entrada: {
    cnpj: string;
    razao_social: string;
    meio_pagamento: MeioPagamentoNfse;
    gerarId?: () => string;
  }
): Fornecedor {
  const forma = formaPagamentoFornecedor(entrada.meio_pagamento);
  const existente = localizarFornecedorPorCnpj(db, entrada.cnpj);
  if (existente) {
    if (existente.forma_pagamento !== forma) {
      existente.forma_pagamento = forma;
    }
    return existente;
  }

  const novo: Fornecedor = {
    id: entrada.gerarId ? entrada.gerarId() : `forn-${Date.now().toString(36)}`,
    nome: entrada.razao_social.trim() || `Fornecedor ${formatarCnpj(entrada.cnpj)}`,
    cnpj: formatarCnpj(entrada.cnpj),
    forma_pagamento: forma,
    prazo_boleto_dias: entrada.meio_pagamento === "boleto" ? 14 : undefined,
    ativo: true,
  };
  db.fornecedores.push(novo);
  return novo;
}

function observacaoTitulo(meio: MeioPagamentoNfse, extra?: string): string {
  const base =
    meio === "plataforma"
      ? "NFS-e · já debitado na plataforma (iFood etc.) — sem pendência de pagamento."
      : meio === "pix"
        ? "NFS-e · pagamento esperado via PIX (sem linha digitável)."
        : "NFS-e · aguardando boleto bancário ou importação da linha.";
  return extra ? `${base} ${extra}` : base;
}

/**
 * Registra NFS-e + título na agenda (boleto liberado — sem conferência de mercadoria).
 * Idempotente pela chave NFS-e.
 */
export function registrarNfseIdempotente(
  db: DB,
  entrada: RegistroNfseEntrada,
  opcoes: { notaId?: string; boletoId?: string; gerarIdNota?: () => string; gerarIdBoleto?: () => string } = {}
): RegistroNfseResultado {
  const chave = entrada.chave_nfse.trim().toUpperCase();
  if (!chaveNfseValida(chave)) {
    return { sucesso: false, mensagem: "Chave NFS-e inválida ou incompleta." };
  }

  const existente = localizarNotaPorChaveNfse(db, chave);
  if (existente) {
    return {
      sucesso: false,
      mensagem: "NFS-e já importada",
      notaId: existente.id,
    };
  }

  const notaId = opcoes.notaId ?? (opcoes.gerarIdNota ? opcoes.gerarIdNota() : `nfse-${Date.now().toString(36)}`);
  const boletoId =
    opcoes.boletoId ?? (opcoes.gerarIdBoleto ? opcoes.gerarIdBoleto() : `bol-${Date.now().toString(36)}`);

  const jaDebitado = entrada.meio_pagamento === "plataforma";
  const statusBoleto: StatusBoleto = jaDebitado ? "pago" : "liberado";
  const dataDebito = jaDebitado
    ? entrada.emitida_em || entrada.vencimento || entrada.importada_em.slice(0, 10)
    : undefined;

  db.notas_fiscais.unshift({
    id: notaId,
    fornecedor_id: entrada.fornecedor_id,
    numero: entrada.numero,
    chave_acesso: chave,
    chave_nfse: chave,
    tipo: "nfse",
    cnpj_emitente: formatarCnpj(entrada.cnpj_emitente),
    razao_social_emitente: entrada.razao_social_emitente,
    valor_total: entrada.valor_total,
    emitida_em: entrada.emitida_em,
    importada_em: entrada.importada_em,
    status: "conferida",
    origem: "manual",
    descricao_servico: entrada.descricao_servico,
    municipio_emissao: entrada.municipio_emissao,
    arquivo_pdf_nome: entrada.arquivo_pdf_nome,
    meio_pagamento_esperado: entrada.meio_pagamento,
    itens_importados: [],
    correcoes_fornecedor: [],
  });

  const boleto: Boleto = {
    id: boletoId,
    nota_id: notaId,
    numero_parcela: "001",
    valor: entrada.valor_total,
    vencimento: entrada.vencimento,
    cnpj_beneficiario: formatarCnpj(entrada.cnpj_emitente),
    status: statusBoleto,
    meio_pagamento_esperado: entrada.meio_pagamento,
    status_conferencia: "conferido",
    status_documento_fiscal: "vinculado",
    conferido_em: entrada.importada_em,
    observacao: observacaoTitulo(entrada.meio_pagamento, entrada.observacao),
    ...(jaDebitado && dataDebito
      ? {
          pagamento_data: dataDebito,
          pagamento_valor: entrada.valor_total,
          pagamento_banco_conta: "Plataforma (débito automático)",
          pagamento_responsavel: "sistema",
          pagamento_observacao: "Já debitado na plataforma (iFood etc.).",
          pagamento_informado_em: entrada.importada_em,
        }
      : {}),
  };
  db.boletos.push(boleto);

  return { sucesso: true, notaId, boletoId };
}

/** Texto de demonstração no layout Osasco (Anota AI). */
export const TEXTO_NFSE_DEMO_ANOTA_AI = `
PREFEITURA DO MUNICÍPIO DE OSASCO
Secretaria de Finanças
NOTA FISCAL DE SERVIÇOS ELETRÔNICA - NFS-e
Nota Nº: 0001449123
Data de Emissão: 31/07/2026
Série: E
Prestador do Serviço
Razão Social: ANOTA AI SOLUCOES DIGITAIS S/A
CNPJ: 27.864.392/0001-93
Inscrição Municipal: 174079
Tomador do Serviço
Razão Social: BELA VERA RESTAURANTE LTDA
CNPJ: 52.977.266/0001-92
Discriminação do Serviço
1.05 - Licenciamento ou cessão de direito de uso de programas de computação.
LICENCIAMENTO DE USO DE PROGRAMA/SOFTWARE. Mensalidade 65bc261c0f72db00126817e8 Regra Geral
Valor Total do Serviço: R$ 209,99
Valor Total da Nota: R$ 209,99
Chave NFS-e: NFS35344011227864392000193000000144912326076420365616
`.trim();

/**
 * Fixture: PDF fragmentado estilo Nota Paulistana / iFood
 * (rótulos numa linha, valores na seguinte — o que o extrator antigo não lia).
 */
export const TEXTO_NFSE_DEMO_IFOOD_SP = `
PREFEITURA DO MUNICÍPIO DE SÃO PAULO
Secretaria Municipal de Finanças
NOTA FISCAL DE SERVIÇOS ELETRÔNICA - NFS-e
Número da Nota
0000045678
Data e Hora de Emissão
06/09/2024 10:15:22
Código de Verificação
AB12CD34
PRESTADOR DE SERVIÇOS
CPF/CNPJ
14.380.200/0001-21
Inscrição Municipal
12345678
Nome/Razão Social
IFOOD.COM AGENCIA DE RESTAURANTES ONLINE S.A.
TOMADOR DE SERVIÇOS
CPF/CNPJ
52.977.266/0001-92
Nome/Razão Social
BELA VERA RESTAURANTE LTDA
DISCRIMINAÇÃO DOS SERVIÇOS
AGENCIAMENTO CORRETAGEM E INTERMEDIACAO. Desconto incondicional R$ -6.092,19 Valor aproximado dos impostos R$ 656,94 (11,25%) conforme lei da transparência 12.741/12
Valor dos Serviços
ISS Retido
Valor Líquido
5.839,33
0,00
5.839,33
`.trim();
