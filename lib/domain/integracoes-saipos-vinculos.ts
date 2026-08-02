import type { ClassificacaoFuturaSaipos, RegistroSaiposPrevisto } from "./integracoes-saipos";

export const SAIPOS_SOURCE_SYSTEM = "saipos" as const;

export type SaiposEnvironment = "importacao_excel" | "api_publica" | string;
export type SaiposInternalStatus = "ATIVO" | "INATIVO" | "RASCUNHO" | "ARQUIVADO";
export type SaiposExternalEntityType =
  | "PRATO"
  | "COMPLEMENTO"
  | "ADICIONAL"
  | "COMBO"
  | "VARIACAO"
  | "EMBALAGEM"
  | "INSUMO"
  | "OUTRO";

export type SaiposMatchingState =
  | "AUTO_SEGURO"
  | "PROVAVEL_REVISAO"
  | "CONFLITO"
  | "NOVO"
  | "CONFIRMADO_MANUALMENTE"
  | "IGNORADO";

export type SaiposDecisionSource = "automatic" | "human";
export type SaiposHistoryAction = "CREATE" | "UPDATE" | "IGNORE" | "REMOVE" | "MIGRATE";

export interface SaiposImportContext {
  source_system: typeof SAIPOS_SOURCE_SYSTEM;
  environment: SaiposEnvironment;
  unidade_id: string;
  canal?: string | null;
}

export interface SaiposExternalIdentity {
  source_system: typeof SAIPOS_SOURCE_SYSTEM;
  environment: SaiposEnvironment;
  unidade_id: string;
  codigo_completo: string;
  external_entity_type: SaiposExternalEntityType;
  canal?: string | null;
}

export interface EntidadeInternaSaipos {
  internal_uuid: string;
  internal_type: SaiposExternalEntityType;
  nome: string;
  status: SaiposInternalStatus;
}

export interface SaiposMatchingCandidate {
  entidade: EntidadeInternaSaipos;
  confidence_score: number;
  reason: string;
}

export interface SaiposMatchingResult {
  state: SaiposMatchingState;
  confidence_score: number;
  rule_id: string;
  reason: string;
  candidates_considered: number;
  matched_at: string;
  decision_source: SaiposDecisionSource;
  selected_candidate: EntidadeInternaSaipos | null;
  candidates: SaiposMatchingCandidate[];
}

export interface SaiposBindingRecord {
  external_key: string;
  external_identity: SaiposExternalIdentity;
  matched_internal_uuid: string | null;
  matched_internal_type: SaiposExternalEntityType | null;
  matched_internal_nome: string | null;
  matching_state: SaiposMatchingState;
  classificacao_futura: ClassificacaoFuturaSaipos;
  confidence_score: number;
  rule_id: string;
  reason: string;
  candidates_considered: number;
  matched_at: string;
  decision_source: SaiposDecisionSource;
  actor: string;
}

export interface SaiposHistoryEntry {
  id: string;
  action: SaiposHistoryAction;
  external_key: string;
  before: SaiposBindingRecord | null;
  after: SaiposBindingRecord | null;
  actor: string;
  decision_source: SaiposDecisionSource;
  rule_id: string;
  reason: string;
  timestamp: string;
}

export interface SaiposLegacyPendingMigration {
  codigo_completo: string;
  reason: string;
}

export interface SaiposMigrationInfo {
  from_version: number | null;
  migrated_bindings: number;
  pending_legacy: SaiposLegacyPendingMigration[];
  legacy_backup: unknown | null;
}

export interface SaiposBindingsState {
  version: 2;
  bindings: Record<string, SaiposBindingRecord>;
  history: SaiposHistoryEntry[];
  migration: SaiposMigrationInfo;
}

export interface SaiposLegacyDecisionRecord {
  codigo_completo: string;
  classificacao_futura: ClassificacaoFuturaSaipos;
  entidade_interna_id: string | null;
  entidade_interna_nome: string | null;
  confirmado_em: string;
  atualizado_em: string;
  origem: string;
}

export interface SaiposLegacyStateV1 {
  versao: 1;
  decisoes: Record<string, SaiposLegacyDecisionRecord>;
  historico: unknown[];
}

export interface RegistroSaiposVinculado extends RegistroSaiposPrevisto {
  external_identity: SaiposExternalIdentity;
  external_key: string;
  matching_result: SaiposMatchingResult;
  binding: SaiposBindingRecord | null;
}

export interface SaiposPainelMatching {
  total_analisado: number;
  automaticos_seguros: number;
  provaveis: number;
  conflitos: number;
  novos: number;
  confirmados: number;
  ignorados: number;
  pendencias_humanas: number;
}

export interface SaiposBulkApplyResult {
  state: SaiposBindingsState;
  applied_keys: string[];
  skipped_keys: string[];
}

export const SAIPOS_IMPORT_CONTEXT_DEFAULT: SaiposImportContext = {
  source_system: SAIPOS_SOURCE_SYSTEM,
  environment: "importacao_excel",
  unidade_id: "nao_informada",
  canal: null,
};

const HISTORY_LIMIT = 1000;

function slugTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizarSegmentoChave(valor: string | null | undefined): string {
  return (valor ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\|/g, "/")
    .replace(/\s+/g, "_")
    .toLowerCase();
}

function criarIdHistorico(externalKey: string, action: SaiposHistoryAction, timestamp: string): string {
  return `${externalKey}::${action}::${timestamp}`;
}

function alertaNomeRepetido(registro: RegistroSaiposPrevisto): boolean {
  return registro.alertas.some((item) => item.includes("Mesmo nome canônico"));
}

function nomeBuscaRegistro(registro: RegistroSaiposPrevisto): string {
  const partes = Array.from(new Set([registro.nome_canonico, registro.descricao, registro.complemento].map((item) => item.trim()).filter(Boolean)));
  return slugTexto(partes.join(" "));
}

function nomeBuscaEntidade(entidade: EntidadeInternaSaipos): string {
  return slugTexto(entidade.nome);
}

function candidatoExatoUnico(
  registro: RegistroSaiposPrevisto,
  candidatos: SaiposMatchingCandidate[]
): SaiposMatchingCandidate | null {
  if (alertaNomeRepetido(registro) || candidatos.length === 0) return null;

  const alvo = nomeBuscaRegistro(registro);
  const exatos = candidatos.filter((candidato) => nomeBuscaEntidade(candidato.entidade) === alvo);
  if (exatos.length !== 1) return null;
  if (candidatos.length > 1 && candidatos[1].confidence_score >= exatos[0].confidence_score) return null;
  return exatos[0];
}

function compatibilidadeTipos(
  externalType: SaiposExternalEntityType,
  internalType: SaiposExternalEntityType
): boolean {
  const mapa: Record<SaiposExternalEntityType, SaiposExternalEntityType[]> = {
    PRATO: ["PRATO", "COMBO", "VARIACAO", "OUTRO"],
    COMPLEMENTO: ["COMPLEMENTO", "ADICIONAL", "EMBALAGEM", "INSUMO", "OUTRO"],
    ADICIONAL: ["ADICIONAL", "COMPLEMENTO", "INSUMO", "OUTRO"],
    COMBO: ["COMBO", "PRATO", "OUTRO"],
    VARIACAO: ["VARIACAO", "PRATO", "OUTRO"],
    EMBALAGEM: ["EMBALAGEM", "INSUMO", "OUTRO"],
    INSUMO: ["INSUMO", "OUTRO"],
    OUTRO: ["OUTRO", "PRATO", "COMPLEMENTO", "ADICIONAL", "COMBO", "VARIACAO", "EMBALAGEM", "INSUMO"],
  };

  return mapa[externalType].includes(internalType);
}

function scoreCandidato(
  registro: RegistroSaiposPrevisto,
  entidade: EntidadeInternaSaipos
): SaiposMatchingCandidate | null {
  if (entidade.status === "INATIVO" || !compatibilidadeTipos(inferirTipoEntidadeExterna(registro), entidade.internal_type)) {
    return null;
  }

  const alvo = nomeBuscaRegistro(registro);
  const nome = nomeBuscaEntidade(entidade);
  if (!alvo || !nome) return null;

  let score = 0;
  let reason = "";

  if (nome === alvo) {
    score = 84;
    reason = "Nome canônico idêntico a entidade interna, mas sem prova determinística adicional.";
  } else if (nome.includes(alvo) || alvo.includes(nome)) {
    score = 68;
    reason = "Nome parcialmente contido entre item externo e entidade interna.";
  } else {
    const palavrasAlvo = Array.from(new Set(alvo.split(" ").filter(Boolean)));
    const palavrasNome = new Set(nome.split(" ").filter(Boolean));
    let intersecao = 0;
    for (const palavra of palavrasAlvo) {
      if (palavrasNome.has(palavra)) intersecao += 1;
    }
    if (intersecao === 0) return null;
    score = Math.min(60, intersecao * 14);
    reason = `Há ${intersecao} tokens em comum entre item externo e entidade interna.`;
  }

  if (alertaNomeRepetido(registro)) {
    score = Math.min(score, 72);
    reason = `${reason} Item externo participa de grupo de nomes repetidos; revisão humana é obrigatória.`;
  }

  return {
    entidade,
    confidence_score: score,
    reason,
  };
}

function ordenarCandidatos(candidatos: SaiposMatchingCandidate[]): SaiposMatchingCandidate[] {
  return [...candidatos].sort((a, b) => {
    if (b.confidence_score !== a.confidence_score) return b.confidence_score - a.confidence_score;
    return a.entidade.nome.localeCompare(b.entidade.nome, "pt-BR");
  });
}

function criarMatchingResultBase(nowIso: string): SaiposMatchingResult {
  return {
    state: "NOVO",
    confidence_score: 0,
    rule_id: "sem_candidato",
    reason: "Nenhum candidato interno foi encontrado para o item externo.",
    candidates_considered: 0,
    matched_at: nowIso,
    decision_source: "automatic",
    selected_candidate: null,
    candidates: [],
  };
}

function fromBinding(binding: SaiposBindingRecord): SaiposMatchingResult {
  return {
    state: binding.matching_state,
    confidence_score: binding.confidence_score,
    rule_id: binding.rule_id,
    reason: binding.reason,
    candidates_considered: binding.candidates_considered,
    matched_at: binding.matched_at,
    decision_source: binding.decision_source,
    selected_candidate: binding.matched_internal_uuid
      ? {
          internal_uuid: binding.matched_internal_uuid,
          internal_type: binding.matched_internal_type ?? "OUTRO",
          nome: binding.matched_internal_nome ?? binding.matched_internal_uuid,
          status: "ATIVO",
        }
      : null,
    candidates: [],
  };
}

function appendHistory(
  history: SaiposHistoryEntry[],
  entry: Omit<SaiposHistoryEntry, "id">
): SaiposHistoryEntry[] {
  return [
    {
      ...entry,
      id: criarIdHistorico(entry.external_key, entry.action, entry.timestamp),
    },
    ...history,
  ].slice(0, HISTORY_LIMIT);
}

function catalogoPorId(entidades: EntidadeInternaSaipos[]): Map<string, EntidadeInternaSaipos> {
  return new Map(entidades.map((entidade) => [entidade.internal_uuid, entidade]));
}

export function inferirTipoEntidadeExterna(registro: RegistroSaiposPrevisto): SaiposExternalEntityType {
  if (registro.tipo === "PRATO") return "PRATO";
  if (registro.tipo === "COMPLEMENTO") return "COMPLEMENTO";
  return "OUTRO";
}

export function criarIdentidadeExternaSaipos(
  registro: RegistroSaiposPrevisto,
  contexto: SaiposImportContext
): SaiposExternalIdentity {
  return {
    source_system: SAIPOS_SOURCE_SYSTEM,
    environment: contexto.environment,
    unidade_id: contexto.unidade_id,
    codigo_completo: registro.codigo_completo.trim(),
    external_entity_type: inferirTipoEntidadeExterna(registro),
    canal: contexto.canal ?? null,
  };
}

export function gerarChaveExternaSaipos(identidade: SaiposExternalIdentity): string {
  return [
    normalizarSegmentoChave(identidade.source_system),
    normalizarSegmentoChave(identidade.environment),
    normalizarSegmentoChave(identidade.unidade_id),
    normalizarSegmentoChave(identidade.external_entity_type),
    normalizarSegmentoChave(identidade.canal ?? "sem_canal"),
    normalizarSegmentoChave(identidade.codigo_completo),
  ].join("|");
}

export function criarEstadoBindingsSaiposVazio(): SaiposBindingsState {
  return {
    version: 2,
    bindings: {},
    history: [],
    migration: {
      from_version: null,
      migrated_bindings: 0,
      pending_legacy: [],
      legacy_backup: null,
    },
  };
}

function isLegacyState(payload: unknown): payload is SaiposLegacyStateV1 {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Partial<SaiposLegacyStateV1>;
  return value.versao === 1 && typeof value.decisoes === "object" && Array.isArray(value.historico);
}

function isStateV2(payload: unknown): payload is SaiposBindingsState {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Partial<SaiposBindingsState>;
  return value.version === 2 && typeof value.bindings === "object" && Array.isArray(value.history) && !!value.migration;
}

function migrarEstadoLegado(
  legado: SaiposLegacyStateV1,
  params?: {
    registros?: RegistroSaiposPrevisto[];
    entidades?: EntidadeInternaSaipos[];
    contexto_importacao?: SaiposImportContext;
  }
): SaiposBindingsState {
  const contexto = params?.contexto_importacao ?? SAIPOS_IMPORT_CONTEXT_DEFAULT;
  const registros = params?.registros ?? [];
  const entidades = params?.entidades ?? [];
  const entidadesPorUuid = catalogoPorId(entidades);

  const state = criarEstadoBindingsSaiposVazio();
  state.migration.from_version = 1;
  state.migration.legacy_backup = legado;

  for (const decisao of Object.values(legado.decisoes ?? {})) {
    const codigo = decisao.codigo_completo.trim();
    const registrosCodigo = registros.filter((registro) => registro.codigo_completo.trim() === codigo);

    if (registrosCodigo.length !== 1) {
      state.migration.pending_legacy.push({
        codigo_completo: codigo,
        reason:
          registrosCodigo.length === 0
            ? "Decisão legada preservada sem migração automática: código não encontrado na análise atual."
            : "Decisão legada preservada sem migração automática: código colide com mais de um registro na análise atual.",
      });
      continue;
    }

    const registro = registrosCodigo[0];
    const identidade = criarIdentidadeExternaSaipos(registro, contexto);
    const externalKey = gerarChaveExternaSaipos(identidade);
    const entidade = decisao.entidade_interna_id ? entidadesPorUuid.get(decisao.entidade_interna_id) ?? null : null;

    if (decisao.entidade_interna_id && !entidade) {
      state.migration.pending_legacy.push({
        codigo_completo: codigo,
        reason: "Decisão legada preservada sem migração automática: entidade interna anterior não existe mais no catálogo atual.",
      });
      continue;
    }

    const migrated: SaiposBindingRecord = {
      external_key: externalKey,
      external_identity: identidade,
      matched_internal_uuid: entidade?.internal_uuid ?? null,
      matched_internal_type: entidade?.internal_type ?? null,
      matched_internal_nome: entidade?.nome ?? decisao.entidade_interna_nome ?? null,
      matching_state: "CONFIRMADO_MANUALMENTE",
      classificacao_futura: decisao.classificacao_futura,
      confidence_score: 100,
      rule_id: "legacy_v1_manual_migration",
      reason: "Migração segura de decisão manual legada para a chave externa composta.",
      candidates_considered: entidade ? 1 : 0,
      matched_at: decisao.confirmado_em,
      decision_source: "human",
      actor: "migracao_local",
    };

    state.bindings[externalKey] = migrated;
    state.history = appendHistory(state.history, {
      action: "MIGRATE",
      external_key: externalKey,
      before: null,
      after: migrated,
      actor: "migracao_local",
      decision_source: "human",
      rule_id: "legacy_v1_manual_migration",
      reason: migrated.reason,
      timestamp: decisao.atualizado_em,
    });
    state.migration.migrated_bindings += 1;
  }

  return state;
}

export function parseEstadoBindingsSaipos(
  payload: unknown,
  params?: {
    registros?: RegistroSaiposPrevisto[];
    entidades?: EntidadeInternaSaipos[];
    contexto_importacao?: SaiposImportContext;
  }
): SaiposBindingsState {
  if (isStateV2(payload)) {
    return {
      version: 2,
      bindings: payload.bindings,
      history: payload.history.slice(0, HISTORY_LIMIT),
      migration: payload.migration,
    };
  }

  if (isLegacyState(payload)) {
    return migrarEstadoLegado(payload, params);
  }

  return criarEstadoBindingsSaiposVazio();
}

export function criarBindingManualSaipos(params: {
  registro: RegistroSaiposVinculado;
  classificacao_futura: ClassificacaoFuturaSaipos;
  entidade: EntidadeInternaSaipos | null;
  actor: string;
  state?: Extract<SaiposMatchingState, "CONFIRMADO_MANUALMENTE" | "IGNORADO">;
  reason?: string;
  timestamp?: string;
}): SaiposBindingRecord {
  const timestamp = params.timestamp ?? new Date().toISOString();
  const matchingState = params.state ?? "CONFIRMADO_MANUALMENTE";
  const reason =
    params.reason ??
    (matchingState === "IGNORADO"
      ? "Item marcado manualmente para ignorar na fila de exceções."
      : "Item confirmado manualmente por revisão humana.");

  return {
    external_key: params.registro.external_key,
    external_identity: params.registro.external_identity,
    matched_internal_uuid: matchingState === "IGNORADO" ? null : params.entidade?.internal_uuid ?? null,
    matched_internal_type: matchingState === "IGNORADO" ? null : params.entidade?.internal_type ?? null,
    matched_internal_nome: matchingState === "IGNORADO" ? null : params.entidade?.nome ?? null,
    matching_state: matchingState,
    classificacao_futura: params.classificacao_futura,
    confidence_score: matchingState === "IGNORADO" ? 0 : 100,
    rule_id: matchingState === "IGNORADO" ? "human_ignore" : "human_confirmation",
    reason,
    candidates_considered: params.registro.matching_result.candidates_considered,
    matched_at: timestamp,
    decision_source: "human",
    actor: params.actor,
  };
}

export function salvarBindingSaipos(
  state: SaiposBindingsState,
  binding: SaiposBindingRecord
): SaiposBindingsState {
  const before = state.bindings[binding.external_key] ?? null;
  const bindings = {
    ...state.bindings,
    [binding.external_key]: binding,
  };

  const history = appendHistory(state.history, {
    action: before ? "UPDATE" : binding.matching_state === "IGNORADO" ? "IGNORE" : "CREATE",
    external_key: binding.external_key,
    before,
    after: binding,
    actor: binding.actor,
    decision_source: binding.decision_source,
    rule_id: binding.rule_id,
    reason: binding.reason,
    timestamp: binding.matched_at,
  });

  return {
    ...state,
    bindings,
    history,
  };
}

export function removerBindingSaipos(
  state: SaiposBindingsState,
  externalKey: string,
  actor: string,
  timestamp?: string
): SaiposBindingsState {
  const before = state.bindings[externalKey] ?? null;
  if (!before) return state;

  const bindings = { ...state.bindings };
  delete bindings[externalKey];
  const when = timestamp ?? new Date().toISOString();

  const history = appendHistory(state.history, {
    action: "REMOVE",
    external_key: externalKey,
    before,
    after: null,
    actor,
    decision_source: "human",
    rule_id: "human_remove",
    reason: "Vínculo removido manualmente.",
    timestamp: when,
  });

  return {
    ...state,
    bindings,
    history,
  };
}

export function executarMatchingSaipos(params: {
  registros: RegistroSaiposPrevisto[];
  state: SaiposBindingsState;
  entidades: EntidadeInternaSaipos[];
  contexto_importacao?: SaiposImportContext;
  nowIso?: string;
}): RegistroSaiposVinculado[] {
  const contexto = params.contexto_importacao ?? SAIPOS_IMPORT_CONTEXT_DEFAULT;
  const nowIso = params.nowIso ?? new Date().toISOString();

  return params.registros.map((registro) => {
    const identidade = criarIdentidadeExternaSaipos(registro, contexto);
    const externalKey = gerarChaveExternaSaipos(identidade);
    const binding = params.state.bindings[externalKey] ?? null;

    if (binding) {
      return {
        ...registro,
        external_identity: identidade,
        external_key: externalKey,
        binding,
        matching_result: fromBinding(binding),
      };
    }

    const candidatos = ordenarCandidatos(
      params.entidades
        .map((entidade) => scoreCandidato(registro, entidade))
        .filter((item): item is SaiposMatchingCandidate => item !== null)
    );

    const result = criarMatchingResultBase(nowIso);
    result.candidates_considered = candidatos.length;
    result.candidates = candidatos.slice(0, 10);

    if (candidatos.length === 0) {
      result.state = "NOVO";
      result.rule_id = "no_candidate_found";
      result.reason = "Nenhuma entidade interna compatível foi encontrada para o item externo.";
    } else if (candidatoExatoUnico(registro, candidatos)) {
      const exato = candidatoExatoUnico(registro, candidatos)!;
      result.state = "AUTO_SEGURO";
      result.confidence_score = 100;
      result.rule_id = "exact_unique_name_and_type";
      result.reason = "Correspondência determinística por nome exato único, tipo compatível e ausência de ambiguidade conhecida.";
      result.selected_candidate = exato.entidade;
    } else if (candidatos.length > 1 && candidatos[0].confidence_score === candidatos[1].confidence_score) {
      result.state = "CONFLITO";
      result.confidence_score = candidatos[0].confidence_score;
      result.rule_id = "multiple_equal_top_candidates";
      result.reason = "Há múltiplos candidatos com a mesma prioridade; revisão humana é obrigatória.";
    } else if (candidatos.length > 1 && candidatos[0].confidence_score - candidatos[1].confidence_score <= 5) {
      result.state = "CONFLITO";
      result.confidence_score = candidatos[0].confidence_score;
      result.rule_id = "ambiguous_top_candidates";
      result.reason = "Os candidatos líderes são muito próximos entre si; revisão humana é obrigatória.";
      result.selected_candidate = candidatos[0].entidade;
    } else {
      result.selected_candidate = candidatos[0].entidade;
      result.confidence_score = candidatos[0].confidence_score;
      result.rule_id = "name_similarity_review";
      result.reason = candidatos[0].reason;
      result.state = "PROVAVEL_REVISAO";
    }

    return {
      ...registro,
      external_identity: identidade,
      external_key: externalKey,
      binding: null,
      matching_result: result,
    };
  });
}

export function calcularPainelMatchingSaipos(registros: RegistroSaiposVinculado[]): SaiposPainelMatching {
  const painel: SaiposPainelMatching = {
    total_analisado: registros.length,
    automaticos_seguros: 0,
    provaveis: 0,
    conflitos: 0,
    novos: 0,
    confirmados: 0,
    ignorados: 0,
    pendencias_humanas: 0,
  };

  for (const registro of registros) {
    switch (registro.matching_result.state) {
      case "AUTO_SEGURO":
        painel.automaticos_seguros += 1;
        break;
      case "PROVAVEL_REVISAO":
        painel.provaveis += 1;
        painel.pendencias_humanas += 1;
        break;
      case "CONFLITO":
        painel.conflitos += 1;
        painel.pendencias_humanas += 1;
        break;
      case "NOVO":
        painel.novos += 1;
        painel.pendencias_humanas += 1;
        break;
      case "CONFIRMADO_MANUALMENTE":
        painel.confirmados += 1;
        break;
      case "IGNORADO":
        painel.ignorados += 1;
        break;
    }
  }

  return painel;
}

export function registrosCompativeisParaAcaoColetiva(registros: RegistroSaiposVinculado[]): boolean {
  if (registros.length === 0) return false;
  const tipo = registros[0].external_identity.external_entity_type;
  return registros.every(
    (registro) =>
      registro.external_identity.external_entity_type === tipo &&
      (registro.matching_result.state === "PROVAVEL_REVISAO" || registro.matching_result.state === "NOVO")
  );
}

export function aplicarAcaoColetivaSaipos(params: {
  registros: RegistroSaiposVinculado[];
  selected_keys: string[];
  state: SaiposBindingsState;
  classificacao_futura: ClassificacaoFuturaSaipos;
  entidade: EntidadeInternaSaipos | null;
  actor: string;
  timestamp?: string;
}): SaiposBulkApplyResult {
  const selecionados = params.registros.filter((registro) => params.selected_keys.includes(registro.external_key));
  if (!registrosCompativeisParaAcaoColetiva(selecionados)) {
    return {
      state: params.state,
      applied_keys: [],
      skipped_keys: params.selected_keys,
    };
  }

  let nextState = params.state;
  const appliedKeys: string[] = [];

  for (const registro of selecionados) {
    const binding = criarBindingManualSaipos({
      registro,
      classificacao_futura: params.classificacao_futura,
      entidade: params.entidade,
      actor: params.actor,
      timestamp: params.timestamp,
    });
    nextState = salvarBindingSaipos(nextState, binding);
    appliedKeys.push(registro.external_key);
  }

  return {
    state: nextState,
    applied_keys: appliedKeys,
    skipped_keys: params.selected_keys.filter((key) => !appliedKeys.includes(key)),
  };
}

export function exportarBackupBindingsSaipos(state: SaiposBindingsState): string {
  return JSON.stringify(state, null, 2);
}