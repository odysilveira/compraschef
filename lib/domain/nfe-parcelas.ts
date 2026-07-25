import type { Boleto, DB, DuplicataNotaTemporaria, NotaFiscal, StatusBoleto, StatusNota } from "../types";

export interface DuplicataLidaNFeBruta {
  numero_parcela?: string;
  vencimento: string;
  valor: number;
}

export interface RegistroNotaParcelasEntrada {
  fornecedor_id: string;
  pedido_id?: string;
  numero: string;
  chave_acesso: string;
  cnpj_emitente?: string;
  razao_social_emitente?: string;
  valor_total: number;
  emitida_em: string;
  importada_em: string;
  status: StatusNota;
  origem?: "manual" | "receita";
  itens_importados?: NotaFiscal["itens_importados"];
  parcelas: DuplicataNotaTemporaria[];
  status_boleto: StatusBoleto;
  cnpj_beneficiario?: string;
  observacao_boleto?: string;
  vencimento_padrao: string;
  sem_duplicatas_confirmado_em?: string;
  sem_duplicatas_confirmado_por?: string;
  sem_duplicatas_justificativa?: string;
}

export interface RegistroNotaParcelasOpcoes {
  notaId?: string;
  gerarIdNota?: () => string;
  gerarIdBoleto?: () => string;
}

export interface RegistroNotaParcelasResultado {
  sucesso: boolean;
  mensagem?: string;
  notaId?: string;
  boletosCriados: number;
}

function somenteDigitos(valor?: string): string {
  return (valor ?? "").replace(/\D+/g, "");
}

function cnpjValido(cnpj: string): boolean {
  const digitos = somenteDigitos(cnpj);
  if (digitos.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  const calcularDigito = (base: string, pesos: number[]): number => {
    const soma = base
      .split("")
      .reduce((acumulado, item, indice) => acumulado + Number(item) * pesos[indice], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const base12 = digitos.slice(0, 12);
  const d1 = calcularDigito(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcularDigito(`${base12}${d1}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digitos === `${base12}${d1}${d2}`;
}

function digitoChaveNfeValido(chave: string): boolean {
  const digitos = somenteDigitos(chave);
  if (digitos.length !== 44) return false;
  const base = digitos.slice(0, 43);
  const dvInformado = Number(digitos[43]);

  let soma = 0;
  let peso = 2;
  for (let indice = base.length - 1; indice >= 0; indice -= 1) {
    soma += Number(base[indice]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dvCalculado = 11 - resto;
  const dvFinal = dvCalculado >= 10 ? 0 : dvCalculado;
  return dvFinal === dvInformado;
}

export function extrairCnpjEmitenteDaChaveAcesso(chaveAcesso?: string): string | undefined {
  const chave = somenteDigitos(chaveAcesso);
  if (!digitoChaveNfeValido(chave)) return undefined;
  const cnpj = chave.slice(6, 20);
  if (!cnpjValido(cnpj)) return undefined;
  return cnpj;
}

export function localizarNotaFiscalPorChave(db: DB, chaveAcesso: string): NotaFiscal | undefined {
  const chave = chaveAcesso.trim();
  if (!chave) return undefined;
  return db.notas_fiscais.find((nota) => nota.chave_acesso === chave);
}

export function gerarNumeroParcelaSequencial(numeroParcela: string | undefined, indice: number): string {
  const limpo = numeroParcela?.trim();
  return limpo && limpo.length > 0 ? limpo : String(indice + 1);
}

export function normalizarDuplicatasLidas(duplicatas: DuplicataLidaNFeBruta[]): DuplicataNotaTemporaria[] {
  return duplicatas.map((duplicata, indice) => ({
    numero_parcela: gerarNumeroParcelaSequencial(duplicata.numero_parcela, indice),
    vencimento: duplicata.vencimento,
    valor: duplicata.valor,
  }));
}

function boletoParcelaDuplicadaPorNumero(existing: Boleto, notaId: string, numeroParcela?: string): boolean {
  if (!numeroParcela) return false;
  return existing.nota_id === notaId && existing.numero_parcela === numeroParcela;
}

function boletoParcelaDuplicadaFallback(existing: Boleto, notaId: string, vencimento: string, valor: number): boolean {
  return existing.nota_id === notaId && existing.vencimento === vencimento && existing.valor === valor;
}

export function verificarParcelaDuplicada(
  db: DB,
  entrada: { nota_id: string; numero_parcela?: string; vencimento: string; valor: number }
): Boleto | undefined {
  return db.boletos.find((boleto) => {
    if (boletoParcelaDuplicadaPorNumero(boleto, entrada.nota_id, entrada.numero_parcela)) {
      return true;
    }

    if (!boleto.numero_parcela) {
      return boletoParcelaDuplicadaFallback(boleto, entrada.nota_id, entrada.vencimento, entrada.valor);
    }

    if (!entrada.numero_parcela) {
      return boletoParcelaDuplicadaFallback(boleto, entrada.nota_id, entrada.vencimento, entrada.valor);
    }

    return false;
  });
}

export function registrarNotaEParcelasIdempotente(
  db: DB,
  entrada: RegistroNotaParcelasEntrada,
  opcoes: RegistroNotaParcelasOpcoes = {}
): RegistroNotaParcelasResultado {
  const existente = localizarNotaFiscalPorChave(db, entrada.chave_acesso);
  if (existente) {
    return {
      sucesso: false,
      mensagem: "NF-e já importada",
      notaId: existente.id,
      boletosCriados: 0,
    };
  }

  const notaId = opcoes.notaId ?? (opcoes.gerarIdNota ? opcoes.gerarIdNota() : `nf-${Date.now().toString(36)}`);
  db.notas_fiscais.unshift({
    id: notaId,
    fornecedor_id: entrada.fornecedor_id,
    pedido_id: entrada.pedido_id,
    numero: entrada.numero,
    chave_acesso: entrada.chave_acesso,
    cnpj_emitente: entrada.cnpj_emitente,
    razao_social_emitente: entrada.razao_social_emitente,
    valor_total: entrada.valor_total,
    emitida_em: entrada.emitida_em,
    importada_em: entrada.importada_em,
    status: entrada.status,
    origem: entrada.origem,
    itens_importados: entrada.itens_importados,
    sem_duplicatas_confirmado_em: entrada.sem_duplicatas_confirmado_em,
    sem_duplicatas_confirmado_por: entrada.sem_duplicatas_confirmado_por,
    sem_duplicatas_justificativa: entrada.sem_duplicatas_justificativa,
    correcoes_fornecedor: [],
  });

  let boletosCriados = 0;
  const duplicatas = normalizarDuplicatasLidas(
    entrada.parcelas.map((parcela) => ({
      numero_parcela: parcela.numero_parcela,
      vencimento: parcela.vencimento,
      valor: parcela.valor,
    }))
  );

  for (const parcela of duplicatas) {
    const vencimento = parcela.vencimento || entrada.vencimento_padrao;
    const duplicada = verificarParcelaDuplicada(db, {
      nota_id: notaId,
      numero_parcela: parcela.numero_parcela,
      vencimento,
      valor: parcela.valor,
    });
    if (duplicada) continue;

    db.boletos.push({
      id: opcoes.gerarIdBoleto ? opcoes.gerarIdBoleto() : `bol-${Date.now().toString(36)}`,
      nota_id: notaId,
      numero_parcela: parcela.numero_parcela,
      valor: parcela.valor,
      vencimento,
      cnpj_beneficiario: entrada.cnpj_beneficiario,
      status: entrada.status_boleto,
      observacao: entrada.observacao_boleto,
    });
    boletosCriados += 1;
  }

  return {
    sucesso: true,
    notaId,
    boletosCriados,
  };
}
