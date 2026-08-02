import type { ClassificacaoFuturaSaipos, RegistroSaiposPrevisto } from "./integracoes-saipos";

export interface EntidadeInternaSaipos {
  id: string;
  nome: string;
}

export type OrigemDecisaoSaipos = "manual-individual" | "manual-coletiva" | "manual-ajuste";

export interface DecisaoSaipos {
  codigo_completo: string;
  classificacao_futura: ClassificacaoFuturaSaipos;
  entidade_interna_id: string | null;
  entidade_interna_nome: string | null;
  confirmado_em: string;
  atualizado_em: string;
  origem: OrigemDecisaoSaipos;
}

export interface HistoricoDecisaoSaipos {
  id: string;
  codigo_completo: string;
  evento: string;
  timestamp: string;
  origem: OrigemDecisaoSaipos;
}

export interface EstadoDecisoesSaipos {
  versao: 1;
  decisoes: Record<string, DecisaoSaipos>;
  historico: HistoricoDecisaoSaipos[];
}

export interface RegistroSaiposComDecisao extends RegistroSaiposPrevisto {
  decisao: DecisaoSaipos | null;
  sugestao_entidade: EntidadeInternaSaipos | null;
}

export interface ProgressoSaipos {
  total: number;
  com_decisao: number;
  confirmados: number;
  sem_decisao: number;
  com_vinculo: number;
  sem_vinculo: number;
}

const LIMITE_HISTORICO = 500;

function slugTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function registroNomeBusca(registro: RegistroSaiposPrevisto): string {
  return slugTexto([registro.nome_canonico, registro.descricao, registro.complemento].filter(Boolean).join(" "));
}

function gerarIdHistorico(codigo: string, evento: string, timestamp: string): string {
  return `${codigo}::${evento}::${timestamp}`;
}

export function criarEstadoDecisoesVazio(): EstadoDecisoesSaipos {
  return {
    versao: 1,
    decisoes: {},
    historico: [],
  };
}

export function parseEstadoDecisoesSaipos(payload: unknown): EstadoDecisoesSaipos {
  if (!payload || typeof payload !== "object") {
    return criarEstadoDecisoesVazio();
  }

  const base = payload as Partial<EstadoDecisoesSaipos>;
  if (base.versao !== 1 || !base.decisoes || typeof base.decisoes !== "object" || !Array.isArray(base.historico)) {
    return criarEstadoDecisoesVazio();
  }

  return {
    versao: 1,
    decisoes: base.decisoes,
    historico: base.historico.slice(0, LIMITE_HISTORICO),
  };
}

export function sugerirEntidadeInternaSaipos(
  registro: RegistroSaiposPrevisto,
  entidades: EntidadeInternaSaipos[]
): EntidadeInternaSaipos | null {
  const alvo = registroNomeBusca(registro);
  if (!alvo) return null;

  let melhor: { entidade: EntidadeInternaSaipos; score: number } | null = null;

  for (const entidade of entidades) {
    const nome = slugTexto(entidade.nome);
    if (!nome) continue;

    let score = 0;
    if (nome === alvo) score = 100;
    else if (nome.includes(alvo) || alvo.includes(nome)) score = 70;
    else {
      const palavrasAlvo = new Set(alvo.split(" ").filter(Boolean));
      const palavrasNome = new Set(nome.split(" ").filter(Boolean));
      let intersecao = 0;
      palavrasAlvo.forEach((palavra) => {
        if (palavrasNome.has(palavra)) intersecao += 1;
      });
      score = intersecao > 0 ? intersecao * 10 : 0;
    }

    if (score <= 0) continue;
    if (!melhor || score > melhor.score) {
      melhor = { entidade, score };
    }
  }

  return melhor?.score && melhor.score >= 20 ? melhor.entidade : null;
}

function appendHistorico(
  historico: HistoricoDecisaoSaipos[],
  codigo: string,
  evento: string,
  origem: OrigemDecisaoSaipos,
  timestamp: string
): HistoricoDecisaoSaipos[] {
  const item: HistoricoDecisaoSaipos = {
    id: gerarIdHistorico(codigo, evento, timestamp),
    codigo_completo: codigo,
    evento,
    timestamp,
    origem,
  };
  return [item, ...historico].slice(0, LIMITE_HISTORICO);
}

export function salvarDecisaoSaipos(
  estado: EstadoDecisoesSaipos,
  entrada: {
    codigo_completo: string;
    classificacao_futura: ClassificacaoFuturaSaipos;
    entidade_interna: EntidadeInternaSaipos | null;
    origem: OrigemDecisaoSaipos;
    timestamp?: string;
  }
): EstadoDecisoesSaipos {
  const codigo = entrada.codigo_completo.trim();
  if (!codigo) return estado;

  const timestamp = entrada.timestamp ?? new Date().toISOString();
  const decisao: DecisaoSaipos = {
    codigo_completo: codigo,
    classificacao_futura: entrada.classificacao_futura,
    entidade_interna_id: entrada.entidade_interna?.id ?? null,
    entidade_interna_nome: entrada.entidade_interna?.nome ?? null,
    confirmado_em: timestamp,
    atualizado_em: timestamp,
    origem: entrada.origem,
  };

  const decisoes = {
    ...estado.decisoes,
    [codigo]: decisao,
  };

  const eventoVinculo = decisao.entidade_interna_nome ? `Vínculo confirmado: ${decisao.entidade_interna_nome}` : "Vínculo removido";
  const eventoClassificacao = `Classificação confirmada: ${decisao.classificacao_futura}`;

  let historico = appendHistorico(estado.historico, codigo, eventoClassificacao, entrada.origem, timestamp);
  historico = appendHistorico(historico, codigo, eventoVinculo, entrada.origem, timestamp);

  return {
    versao: 1,
    decisoes,
    historico,
  };
}

export function removerDecisaoSaipos(
  estado: EstadoDecisoesSaipos,
  codigoCompleto: string,
  origem: OrigemDecisaoSaipos,
  timestamp?: string
): EstadoDecisoesSaipos {
  const codigo = codigoCompleto.trim();
  if (!codigo || !estado.decisoes[codigo]) return estado;

  const novasDecisoes = { ...estado.decisoes };
  delete novasDecisoes[codigo];
  const instante = timestamp ?? new Date().toISOString();

  return {
    versao: 1,
    decisoes: novasDecisoes,
    historico: appendHistorico(estado.historico, codigo, "Decisão removida", origem, instante),
  };
}

export function aplicarDecisoesNosRegistros(
  registros: RegistroSaiposPrevisto[],
  estado: EstadoDecisoesSaipos,
  entidades: EntidadeInternaSaipos[]
): RegistroSaiposComDecisao[] {
  return registros.map((registro) => {
    const codigo = registro.codigo_completo.trim();
    const decisao = codigo ? estado.decisoes[codigo] ?? null : null;
    const sugestao = sugerirEntidadeInternaSaipos(registro, entidades);
    return {
      ...registro,
      classificacao_futura: decisao?.classificacao_futura ?? registro.classificacao_futura,
      decisao,
      sugestao_entidade: sugestao,
    };
  });
}

export function calcularProgressoSaipos(registros: RegistroSaiposComDecisao[]): ProgressoSaipos {
  let comDecisao = 0;
  let comVinculo = 0;

  for (const registro of registros) {
    if (registro.decisao) {
      comDecisao += 1;
      if (registro.decisao.entidade_interna_id) {
        comVinculo += 1;
      }
    }
  }

  const total = registros.length;
  return {
    total,
    com_decisao: comDecisao,
    confirmados: comDecisao,
    sem_decisao: total - comDecisao,
    com_vinculo: comVinculo,
    sem_vinculo: total - comVinculo,
  };
}

export function exportarBackupDecisoesSaipos(estado: EstadoDecisoesSaipos): string {
  return JSON.stringify(estado, null, 2);
}
