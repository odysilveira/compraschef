import type { Boleto, DB, HistoricoCorrecaoFornecedorNfe, NotaFiscal } from "../types";

export type CodigoPendenciaNfe =
  | "fornecedor_ausente"
  | "chave_ausente"
  | "cnpj_emitente_ausente"
  | "sem_duplicatas_sem_confirmacao"
  | "parcela_sem_valor"
  | "parcela_sem_vencimento";

export interface PendenciaCompletudeNfe {
  codigo: CodigoPendenciaNfe;
  mensagem: string;
  bloqueante: boolean;
}

export interface ResultadoCompletudeNfe {
  completa: boolean;
  pendencias: PendenciaCompletudeNfe[];
  alertas: string[];
  totalParcelas: number;
  somaParcelas: number;
}

export interface CorrecaoFornecedorNfeEntrada {
  notaId: string;
  fornecedorIdNovo: string;
  responsavel: string;
  corrigidoEm?: string;
  justificativa?: string;
  gerarIdRegistro?: () => string;
}

export interface CorrecaoFornecedorNfeResultado {
  sucesso: boolean;
  mensagem?: string;
  alterou: boolean;
  registro?: HistoricoCorrecaoFornecedorNfe;
}

export interface EntradaCompletudeNfe {
  nota_id?: string;
  fornecedor_id?: string;
  chave_acesso?: string;
  cnpj_emitente?: string;
  valor_total: number;
  parcelas: Array<{
    numero_parcela?: string;
    vencimento: string;
    valor: number;
  }>;
  sem_duplicatas_confirmado_em?: string;
  sem_duplicatas_confirmado_por?: string;
}

function textoPreenchido(valor?: string): boolean {
  return Boolean(valor && valor.trim());
}

function fornecedorValido(db: DB, fornecedorId?: string): boolean {
  if (!fornecedorId) return false;
  return db.fornecedores.some((fornecedor) => fornecedor.id === fornecedorId);
}

export function boletosDaNota(db: DB, notaId: string): Boleto[] {
  return db.boletos.filter((boleto) => boleto.nota_id === notaId);
}

export function boletosNaoConferidosDaNota(db: DB, notaId: string): Boleto[] {
  return boletosDaNota(db, notaId).filter((boleto) => boleto.status_conferencia !== "conferido");
}

export function avaliarCompletudeNotaFiscal(db: DB, nota: NotaFiscal): ResultadoCompletudeNfe {
  const pendencias: PendenciaCompletudeNfe[] = [];
  const alertas: string[] = [];
  const parcelas = boletosDaNota(db, nota.id);
  const totalParcelas = parcelas.length;
  const somaParcelas = parcelas.reduce((acumulado, parcela) => acumulado + (Number.isFinite(parcela.valor) ? parcela.valor : 0), 0);

  if (!fornecedorValido(db, nota.fornecedor_id)) {
    pendencias.push({
      codigo: "fornecedor_ausente",
      mensagem: "Fornecedor da NF-e ausente ou não encontrado no cadastro.",
      bloqueante: true,
    });
  }

  if (!textoPreenchido(nota.chave_acesso)) {
    pendencias.push({
      codigo: "chave_ausente",
      mensagem: "Chave de acesso da NF-e não informada.",
      bloqueante: true,
    });
  }

  if (!textoPreenchido(nota.cnpj_emitente)) {
    pendencias.push({
      codigo: "cnpj_emitente_ausente",
      mensagem: "CNPJ do emitente da NF-e não informado.",
      bloqueante: true,
    });
  }

  if (parcelas.length === 0) {
    if (!textoPreenchido(nota.sem_duplicatas_confirmado_em) || !textoPreenchido(nota.sem_duplicatas_confirmado_por)) {
      pendencias.push({
        codigo: "sem_duplicatas_sem_confirmacao",
        mensagem: "NF-e sem duplicatas exige confirmação explícita do operador.",
        bloqueante: true,
      });
    }
  }

  for (const parcela of parcelas) {
    if (!textoPreenchido(parcela.vencimento)) {
      pendencias.push({
        codigo: "parcela_sem_vencimento",
        mensagem: `Parcela ${parcela.numero_parcela ?? "(sem número)"} sem vencimento.`,
        bloqueante: true,
      });
    }

    if (!Number.isFinite(parcela.valor) || parcela.valor <= 0) {
      pendencias.push({
        codigo: "parcela_sem_valor",
        mensagem: `Parcela ${parcela.numero_parcela ?? "(sem número)"} sem valor válido.`,
        bloqueante: true,
      });
    }
  }

  if (parcelas.length > 0 && Number.isFinite(nota.valor_total) && Math.abs(somaParcelas - nota.valor_total) > 0.01) {
    alertas.push("A soma das parcelas diverge do valor total da NF-e.");
  }

  return {
    completa: pendencias.length === 0,
    pendencias,
    alertas,
    totalParcelas,
    somaParcelas,
  };
}

export function indicadorCompletudeNota(db: DB, nota: NotaFiscal): "completa" | "pendente" {
  return avaliarCompletudeNotaFiscal(db, nota).completa ? "completa" : "pendente";
}

export function avaliarCompletudeNfeEntrada(db: DB, entrada: EntradaCompletudeNfe): ResultadoCompletudeNfe {
  const notaTemporariaId = entrada.nota_id || "nota-temporaria-completude";
  const notaTemporaria: NotaFiscal = {
    id: notaTemporariaId,
    fornecedor_id: entrada.fornecedor_id ?? "",
    numero: "s/n",
    chave_acesso: entrada.chave_acesso ?? "",
    cnpj_emitente: entrada.cnpj_emitente,
    valor_total: entrada.valor_total,
    emitida_em: "",
    importada_em: "",
    status: "aguardando_conferencia",
    sem_duplicatas_confirmado_em: entrada.sem_duplicatas_confirmado_em,
    sem_duplicatas_confirmado_por: entrada.sem_duplicatas_confirmado_por,
    correcoes_fornecedor: [],
  };

  const boletosTemporarios: Boleto[] = entrada.parcelas.map((parcela, indice) => ({
    id: `boleto-temporario-${indice + 1}`,
    nota_id: notaTemporariaId,
    numero_parcela: parcela.numero_parcela,
    valor: parcela.valor,
    vencimento: parcela.vencimento,
    status: "travado",
  }));

  const dbTemporario: DB = {
    ...db,
    notas_fiscais: [...db.notas_fiscais, notaTemporaria],
    boletos: [...db.boletos, ...boletosTemporarios],
  };

  return avaliarCompletudeNotaFiscal(dbTemporario, notaTemporaria);
}

export function corrigirFornecedorNotaFiscal(db: DB, entrada: CorrecaoFornecedorNfeEntrada): CorrecaoFornecedorNfeResultado {
  const nota = db.notas_fiscais.find((item) => item.id === entrada.notaId);
  if (!nota) {
    return { sucesso: false, alterou: false, mensagem: "NF-e não encontrada." };
  }

  const fornecedorNovo = db.fornecedores.find((fornecedor) => fornecedor.id === entrada.fornecedorIdNovo);
  if (!fornecedorNovo) {
    return { sucesso: false, alterou: false, mensagem: "Fornecedor informado não existe." };
  }

  if (nota.fornecedor_id === entrada.fornecedorIdNovo) {
    return { sucesso: true, alterou: false, mensagem: "NF-e já está vinculada ao fornecedor informado." };
  }

  const registro: HistoricoCorrecaoFornecedorNfe = {
    id: entrada.gerarIdRegistro ? entrada.gerarIdRegistro() : `nfe-corr-${Date.now().toString(36)}`,
    nota_id: nota.id,
    fornecedor_anterior_id: nota.fornecedor_id || undefined,
    fornecedor_novo_id: entrada.fornecedorIdNovo,
    corrigido_em: entrada.corrigidoEm ?? new Date().toISOString(),
    corrigido_por: entrada.responsavel,
    justificativa: entrada.justificativa?.trim() || undefined,
  };

  nota.fornecedor_id = entrada.fornecedorIdNovo;
  if (!Array.isArray(nota.correcoes_fornecedor)) {
    nota.correcoes_fornecedor = [];
  }
  nota.correcoes_fornecedor.unshift(registro);

  return {
    sucesso: true,
    alterou: true,
    registro,
  };
}
