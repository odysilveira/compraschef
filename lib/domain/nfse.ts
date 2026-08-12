import type { Boleto, DB, Fornecedor, NotaFiscal, StatusBoleto } from "../types";

export type MeioPagamentoNfse = "boleto" | "pix";

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

/**
 * Extrai campos de NFS-e a partir de texto de PDF (layouts municipais variados).
 * Cobre padrões comuns de Osasco / ISS e rótulos genéricos.
 */
export function extrairDadosNfseDoTexto(textoBruto: string): DadosNfseExtraidos {
  const texto = textoBruto.replace(/\u00a0/g, " ");

  const chave =
    primeiroMatch(texto, /Chave\s*NFS-?e\s*[:.]?\s*(NFS[A-Z0-9]{20,80})/i) ||
    primeiroMatch(texto, /\b(NFS\d{40,60})\b/i);

  const numero =
    primeiroMatch(texto, /Nota\s*N[º°o]\.?\s*[:.]?\s*0*(\d{1,12})/i) ||
    primeiroMatch(texto, /N[úu]mero\s*(?:da\s*)?NFS-?e\s*[:.]?\s*0*(\d{1,12})/i);

  const serie = primeiroMatch(texto, /S[ée]rie\s*[:.]?\s*([A-Z0-9]{1,6})/i);

  const emitidaRaw =
    primeiroMatch(texto, /Data\s*de\s*Emiss[aã]o\s*[:.]?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
    primeiroMatch(texto, /Emiss[aã]o\s*[:.]?\s*(\d{2}\/\d{2}\/\d{4})/i);

  const valorRaw =
    primeiroMatch(texto, /Valor\s*Total\s*da\s*Nota\s*[:.]?\s*R\$?\s*([\d.]+,\d{2})/i) ||
    primeiroMatch(texto, /Valor\s*Total\s*do\s*Servi[cç]o\s*[:.]?\s*R\$?\s*([\d.]+,\d{2})/i) ||
    primeiroMatch(texto, /Valor\s*L[ií]quido\s*[:.]?\s*R\$?\s*([\d.]+,\d{2})/i);

  const cnpjPrestadorBruto =
    primeiroMatch(
      texto,
      /(?:Prestador\s*do\s*Servi[cç]o|PRESTADOR)[\s\S]{0,350}?CNPJ\s*[:.]?\s*(\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}|\d{14})/i
    ) ||
    primeiroMatch(texto, /CNPJ\s*[:.]?\s*(\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2})/i);

  const razaoPrestador =
    primeiroMatch(
      texto,
      /(?:Prestador\s*do\s*Servi[cç]o|PRESTADOR)[\s\S]{0,80}?Raz[aã]o\s*Social\s*[:.]?\s*([^\n]+)/i
    ) || primeiroMatch(texto, /Raz[aã]o\s*Social\s*[:.]?\s*([^\n]+)/i);

  const cnpjTomadorBruto = primeiroMatch(
    texto,
    /(?:Tomador\s*do\s*Servi[cç]o|TOMADOR)[\s\S]{0,350}?CNPJ\s*[:.]?\s*(\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}|\d{14})/i
  );

  const razaoTomador = primeiroMatch(
    texto,
    /(?:Tomador\s*do\s*Servi[cç]o|TOMADOR)[\s\S]{0,80}?Raz[aã]o\s*Social\s*[:.]?\s*([^\n]+)/i
  );

  const descricao =
    primeiroMatch(
      texto,
      /Discrimina[cç][aã]o\s*do\s*Servi[cç]o\s*[:.]?\s*([\s\S]{10,400}?)(?:\n\s*Valor\s*Total|\n\s*Tribut|ISS|Base\s*de\s*C[aá]lculo)/i
    ) || primeiroMatch(texto, /(?:LICENCIAMENTO|MENSALIDADE)[^\n]{5,200}/i);

  const codigoServico = primeiroMatch(
    texto,
    /C[oó]digo\s*(?:do\s*)?Servi[cç]o\s*[:.]?\s*([\d.]+(?:\s*-\s*[^\n]+)?)/i
  );

  const municipio =
    primeiroMatch(texto, /Prefeitura\s*(?:do\s*)?(?:Munic[ií]pio\s*)?(?:de\s*)?([A-Za-zÀ-ú]+)/i) ||
    (/Osasco/i.test(texto) ? "Osasco" : undefined);

  const cnpjPrestador = cnpjPrestadorBruto ? somenteDigitos(cnpjPrestadorBruto) : undefined;
  const cnpjTomador = cnpjTomadorBruto ? somenteDigitos(cnpjTomadorBruto) : undefined;

  return {
    numero,
    serie,
    emitida_em: emitidaRaw ? normalizarDataIso(emitidaRaw) : undefined,
    cnpj_prestador: cnpjPrestador?.length === 14 ? cnpjPrestador : undefined,
    razao_social_prestador: razaoPrestador?.replace(/\s+/g, " ").trim(),
    cnpj_tomador: cnpjTomador?.length === 14 ? cnpjTomador : undefined,
    razao_social_tomador: razaoTomador?.replace(/\s+/g, " ").trim(),
    valor_total: valorRaw ? parseValorBr(valorRaw) : undefined,
    descricao_servico: descricao?.replace(/\s+/g, " ").trim().slice(0, 500),
    chave_nfse: chave?.toUpperCase(),
    municipio: municipio?.replace(/\s+/g, " ").trim(),
    codigo_servico: codigoServico?.replace(/\s+/g, " ").trim(),
  };
}

export function chaveNfseValida(chave?: string): boolean {
  const limpa = (chave ?? "").trim().toUpperCase();
  if (limpa.startsWith("NFS") && limpa.length >= 40) return true;
  // alguns municípios usam só dígitos longos
  const digitos = somenteDigitos(limpa);
  return digitos.length >= 40;
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

export function garantirFornecedorNfse(
  db: DB,
  entrada: {
    cnpj: string;
    razao_social: string;
    meio_pagamento: MeioPagamentoNfse;
    gerarId?: () => string;
  }
): Fornecedor {
  const existente = localizarFornecedorPorCnpj(db, entrada.cnpj);
  if (existente) {
    if (existente.forma_pagamento !== entrada.meio_pagamento) {
      existente.forma_pagamento = entrada.meio_pagamento;
    }
    return existente;
  }

  const novo: Fornecedor = {
    id: entrada.gerarId ? entrada.gerarId() : `forn-${Date.now().toString(36)}`,
    nome: entrada.razao_social.trim() || `Fornecedor ${formatarCnpj(entrada.cnpj)}`,
    cnpj: formatarCnpj(entrada.cnpj),
    forma_pagamento: entrada.meio_pagamento,
    prazo_boleto_dias: entrada.meio_pagamento === "boleto" ? 14 : undefined,
    ativo: true,
  };
  db.fornecedores.push(novo);
  return novo;
}

function observacaoTitulo(meio: MeioPagamentoNfse, extra?: string): string {
  const base =
    meio === "pix"
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

  const statusBoleto: StatusBoleto = "liberado";

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
    observacao: observacaoTitulo(entrada.meio_pagamento, entrada.observacao),
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
