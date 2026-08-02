import type { ClassificacaoFuturaSaipos, RegistroSaiposPrevisto } from "./integracoes-saipos";

export const SAIPOS_SOURCE_SYSTEM = "saipos" as const;

export type SaiposEnvironment = "producao" | "homologacao" | "desconhecido";
export type SaiposIngestionSource = "excel" | "api" | "webhook";
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

export type SaiposMatchingOutcome = "AUTO_SEGURO" | "PROVAVEL_REVISAO" | "CONFLITO" | "NOVO";
export type SaiposWorkflowState =
  | "IMPORTADO_SEM_NECESSIDADE_DE_VINCULO"
  | "VINCULO_NECESSARIO"
  | "PROVAVEL_REVISAO"
  | "CONFLITO"
  | "CONFIRMADO"
  | "IGNORADO";

export type SaiposDecisionSource = "automatic" | "human";
export type SaiposHistoryAction = "CREATE" | "UPDATE" | "IGNORE" | "REMOVE" | "MIGRATE" | "REKEY";

export interface SaiposImportContext {
  source_system: typeof SAIPOS_SOURCE_SYSTEM;
  environment: SaiposEnvironment;
  ingestion_source: SaiposIngestionSource;
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
  outcome: SaiposMatchingOutcome;
  confidence_score: number;
  rule_id: string;
  reason: string;
  candidates_considered: number;
  matched_at: string;
  decision_source: SaiposDecisionSource;
  selected_candidate: EntidadeInternaSaipos | null;
  candidates: SaiposMatchingCandidate[];
}

export interface SaiposLinkRequirementPolicy {
  selected_for_binding: boolean;
  requires_costing: boolean;
  requires_cmv: boolean;
  requires_sales_consolidation: boolean;
  requires_operational_link: boolean;
}

export interface SaiposBindingRecord {
  external_key: string;
  external_identity: SaiposExternalIdentity;
  matched_internal_uuid: string | null;
  matched_internal_type: SaiposExternalEntityType | null;
  matched_internal_nome: string | null;
  workflow_state: Extract<SaiposWorkflowState, "CONFIRMADO" | "IGNORADO">;
  matching_outcome: SaiposMatchingOutcome;
  classificacao_futura: ClassificacaoFuturaSaipos;
  confidence_score: number;
  rule_id: string;
  reason: string;
  candidates_considered: number;
  matched_at: string;
  decision_source: SaiposDecisionSource;
  actor: string;
  link_requirement_policy: SaiposLinkRequirementPolicy;
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
  external_ref: string;
  reason: string;
}

export interface SaiposMigrationInfo {
  from_version: number | null;
  migrated_bindings: number;
  pending_legacy: SaiposLegacyPendingMigration[];
  legacy_backup: unknown | null;
}

export interface SaiposBindingsState {
  version: 3;
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

export interface SaiposBindingsStateV2 {
  version: 2;
  bindings: Record<
    string,
    {
      external_key: string;
      external_identity: {
        source_system: typeof SAIPOS_SOURCE_SYSTEM;
        environment: string;
        unidade_id: string;
        codigo_completo: string;
        external_entity_type: SaiposExternalEntityType;
        canal?: string | null;
      };
      matched_internal_uuid: string | null;
      matched_internal_type: SaiposExternalEntityType | null;
      matched_internal_nome: string | null;
      matching_state: "AUTO_SEGURO" | "PROVAVEL_REVISAO" | "CONFLITO" | "NOVO" | "CONFIRMADO_MANUALMENTE" | "IGNORADO";
      classificacao_futura: ClassificacaoFuturaSaipos;
      confidence_score: number;
      rule_id: string;
      reason: string;
      candidates_considered: number;
      matched_at: string;
      decision_source: SaiposDecisionSource;
      actor: string;
    }
  >;
  history: SaiposHistoryEntry[];
  migration: SaiposMigrationInfo;
}

export interface RegistroSaiposVinculado extends RegistroSaiposPrevisto {
  import_context: SaiposImportContext;
  external_identity: SaiposExternalIdentity;
  external_key: string;
  matching_result: SaiposMatchingResult;
  binding: SaiposBindingRecord | null;
  workflow_state: SaiposWorkflowState;
  link_requirement_policy: SaiposLinkRequirementPolicy;
}

export interface SaiposPainelMatching {
  total_importado: number;
  catalogo_externo_disponivel: number;
  itens_sem_necessidade_atual_de_vinculo: number;
  vinculos_necessarios: number;
  pendencias_humanas_reais: number;
  automaticos_seguros: number;
  provaveis: number;
  conflitos: number;
  novos: number;
  confirmados: number;
  ignorados: number;
}

export interface SaiposBulkApplyResult {
  state: SaiposBindingsState;
  applied_keys: string[];
  skipped_keys: string[];
}

export interface SaiposBulkPreviewItem {
  external_key: string;
  codigo_completo: string;
  nome_externo: string;
  entidade_interna_nome: string | null;
  consequence: string;
}

export const SAIPOS_IMPORT_CONTEXT_DEFAULT: SaiposImportContext = {
  source_system: SAIPOS_SOURCE_SYSTEM,
  environment: "desconhecido",
  ingestion_source: "excel",
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
  const partes = Array.from(
    new Set([registro.nome_canonico, registro.descricao, registro.complemento].map((item) => item.trim()).filter(Boolean))
  );
  return slugTexto(partes.join(" "));
}

function nomeBuscaEntidade(entidade: EntidadeInternaSaipos): string {
  return slugTexto(entidade.nome);
}

function isLegacyStateV1(payload: unknown): payload is SaiposLegacyStateV1 {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Partial<SaiposLegacyStateV1>;
  return value.versao === 1 && typeof value.decisoes === "object" && Array.isArray(value.historico);
}

function isLegacyStateV2(payload: unknown): payload is SaiposBindingsStateV2 {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Partial<SaiposBindingsStateV2>;
  return value.version === 2 && typeof value.bindings === "object" && Array.isArray(value.history);
}

function isStateV3(payload: unknown): payload is SaiposBindingsState {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Partial<SaiposBindingsState>;
  return value.version === 3 && typeof value.bindings === "object" && Array.isArray(value.history) && !!value.migration;
}

function mapLegacyEnvironment(environment: string | undefined): SaiposEnvironment {
  if (environment === "producao" || environment === "homologacao" || environment === "desconhecido") return environment;
  return "desconhecido";
}

function mapLegacyIngestionSource(environment: string | undefined): SaiposIngestionSource {
  if (environment === "importacao_excel") return "excel";
  if (environment === "api_publica") return "api";
  return "excel";
}

function compatibilidadeTiposEstrita(
  externalType: SaiposExternalEntityType,
  internalType: SaiposExternalEntityType
): boolean {
  const mapa: Record<SaiposExternalEntityType, SaiposExternalEntityType[]> = {
    PRATO: ["PRATO", "COMBO", "VARIACAO"],
    COMPLEMENTO: ["COMPLEMENTO", "ADICIONAL", "EMBALAGEM", "INSUMO"],
    ADICIONAL: ["ADICIONAL", "COMPLEMENTO", "INSUMO"],
    COMBO: ["COMBO", "PRATO"],
    VARIACAO: ["VARIACAO", "PRATO"],
    EMBALAGEM: ["EMBALAGEM", "INSUMO"],
    INSUMO: ["INSUMO"],
    OUTRO: [],
  };

  return mapa[externalType].includes(internalType);
}

function scoreCandidato(registro: RegistroSaiposPrevisto, entidade: EntidadeInternaSaipos): SaiposMatchingCandidate | null {
  if (entidade.status === "INATIVO") return null;

  const externalType = inferirTipoEntidadeExterna(registro);
  const allowOtherSuggestion = entidade.internal_type === "OUTRO";
  if (!allowOtherSuggestion && !compatibilidadeTiposEstrita(externalType, entidade.internal_type)) {
    return null;
  }

  const alvo = nomeBuscaRegistro(registro);
  const nome = nomeBuscaEntidade(entidade);
  if (!alvo || !nome) return null;

  let score = 0;
  let reason = "";

  if (nome === alvo) {
    score = allowOtherSuggestion ? 40 : 84;
    reason = allowOtherSuggestion
      ? "Nome exato com entidade classificada como OUTRO; apenas sugestão, sem confiança estrutural."
      : "Nome canônico exato com tipo compatível, porém ainda sem identificador externo determinístico.";
  } else if (nome.includes(alvo) || alvo.includes(nome)) {
    score = allowOtherSuggestion ? 32 : 68;
    reason = allowOtherSuggestion
      ? "Nome parcialmente contido em entidade OUTRO; apenas sugestão fraca."
      : "Nome parcialmente contido entre item externo e entidade interna.";
  } else {
    const palavrasAlvo = Array.from(new Set(alvo.split(" ").filter(Boolean)));
    const palavrasNome = new Set(nome.split(" ").filter(Boolean));
    let intersecao = 0;
    palavrasAlvo.forEach((palavra) => {
      if (palavrasNome.has(palavra)) intersecao += 1;
    });
    if (intersecao === 0) return null;
    score = Math.min(allowOtherSuggestion ? 28 : 60, intersecao * (allowOtherSuggestion ? 8 : 14));
    reason = allowOtherSuggestion
      ? `Há ${intersecao} tokens em comum com entidade OUTRO; apenas sugestão exploratória.`
      : `Há ${intersecao} tokens em comum entre item externo e entidade interna.`;
  }

  if (alertaNomeRepetido(registro)) {
    score = Math.min(score, allowOtherSuggestion ? 25 : 72);
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
    outcome: "NOVO",
    confidence_score: 0,
    rule_id: "no_candidate_found",
    reason: "Nenhum candidato interno foi encontrado para o item externo.",
    candidates_considered: 0,
    matched_at: nowIso,
    decision_source: "automatic",
    selected_candidate: null,
    candidates: [],
  };
}

function appendHistory(history: SaiposHistoryEntry[], entry: Omit<SaiposHistoryEntry, "id">): SaiposHistoryEntry[] {
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

function politicaConservadoraBase(selectedForBinding: boolean): SaiposLinkRequirementPolicy {
  return {
    selected_for_binding: selectedForBinding,
    requires_costing: false,
    requires_cmv: false,
    requires_sales_consolidation: false,
    requires_operational_link: false,
  };
}

function necessitaVinculo(policy: SaiposLinkRequirementPolicy): boolean {
  return (
    policy.selected_for_binding ||
    policy.requires_costing ||
    policy.requires_cmv ||
    policy.requires_sales_consolidation ||
    policy.requires_operational_link
  );
}

function workflowFromBinding(binding: SaiposBindingRecord): SaiposWorkflowState {
  return binding.workflow_state === "IGNORADO" ? "IGNORADO" : "CONFIRMADO";
}

function matchingFromBinding(binding: SaiposBindingRecord): SaiposMatchingResult {
  if (binding.workflow_state === "IGNORADO") {
    return {
      outcome: binding.matching_outcome,
      confidence_score: binding.confidence_score,
      rule_id: binding.rule_id,
      reason: binding.reason,
      candidates_considered: binding.candidates_considered,
      matched_at: binding.matched_at,
      decision_source: binding.decision_source,
      selected_candidate: null,
      candidates: [],
    };
  }

  return {
    outcome: "AUTO_SEGURO",
    confidence_score: 100,
    rule_id: "existing_confirmed_binding",
    reason: "Binding anterior confirmado para a mesma identidade externa composta.",
    candidates_considered: 1,
    matched_at: binding.matched_at,
    decision_source: "automatic",
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

function determinarWorkflowState(params: {
  binding: SaiposBindingRecord | null;
  matching_result: SaiposMatchingResult;
  policy: SaiposLinkRequirementPolicy;
}): SaiposWorkflowState {
  if (params.binding) return workflowFromBinding(params.binding);

  if (!necessitaVinculo(params.policy)) {
    return "IMPORTADO_SEM_NECESSIDADE_DE_VINCULO";
  }

  if (params.matching_result.outcome === "CONFLITO") return "CONFLITO";
  if (params.matching_result.outcome === "PROVAVEL_REVISAO") return "PROVAVEL_REVISAO";
  return "VINCULO_NECESSARIO";
}

function migrarBindingV2(binding: SaiposBindingsStateV2["bindings"][string]): SaiposBindingRecord {
  const environment = mapLegacyEnvironment(binding.external_identity.environment);
  return {
    external_key: gerarChaveExternaSaipos({
      source_system: binding.external_identity.source_system,
      environment,
      unidade_id: binding.external_identity.unidade_id,
      codigo_completo: binding.external_identity.codigo_completo,
      external_entity_type: binding.external_identity.external_entity_type,
      canal: binding.external_identity.canal ?? null,
    }),
    external_identity: {
      source_system: binding.external_identity.source_system,
      environment,
      unidade_id: binding.external_identity.unidade_id,
      codigo_completo: binding.external_identity.codigo_completo,
      external_entity_type: binding.external_identity.external_entity_type,
      canal: binding.external_identity.canal ?? null,
    },
    matched_internal_uuid: binding.matched_internal_uuid,
    matched_internal_type: binding.matched_internal_type,
    matched_internal_nome: binding.matched_internal_nome,
    workflow_state: binding.matching_state === "IGNORADO" ? "IGNORADO" : "CONFIRMADO",
    matching_outcome:
      binding.matching_state === "CONFLITO" || binding.matching_state === "PROVAVEL_REVISAO" || binding.matching_state === "NOVO"
        ? binding.matching_state
        : "PROVAVEL_REVISAO",
    classificacao_futura: binding.classificacao_futura,
    confidence_score: binding.confidence_score,
    rule_id: binding.rule_id,
    reason: binding.reason,
    candidates_considered: binding.candidates_considered,
    matched_at: binding.matched_at,
    decision_source: binding.decision_source,
    actor: binding.actor,
    link_requirement_policy: politicaConservadoraBase(false),
  };
}

function migrarEstadoV2(legado: SaiposBindingsStateV2): SaiposBindingsState {
  const state = criarEstadoBindingsSaiposVazio();
  state.migration.from_version = 2;
  state.migration.legacy_backup = legado;

  Object.values(legado.bindings).forEach((bindingLegado) => {
    const migrated = migrarBindingV2(bindingLegado);
    if (state.bindings[migrated.external_key]) {
      state.migration.pending_legacy.push({
        external_ref: migrated.external_key,
        reason: "Binding legado v2 colidiu após normalização de environment/ingestion_source e foi preservado apenas no backup de migração.",
      });
      return;
    }
    state.bindings[migrated.external_key] = migrated;
    state.history = appendHistory(state.history, {
      action: "MIGRATE",
      external_key: migrated.external_key,
      before: null,
      after: migrated,
      actor: "migracao_v2",
      decision_source: migrated.decision_source,
      rule_id: "legacy_v2_state_migration",
      reason: `Migração do formato v2 para v3 com environment=${migrated.external_identity.environment} e ingestion_source=${mapLegacyIngestionSource(bindingLegado.external_identity.environment)}.`,
      timestamp: migrated.matched_at,
    });
    state.migration.migrated_bindings += 1;
  });

  return state;
}

function migrarEstadoV1(
  legado: SaiposLegacyStateV1,
  params?: {
    registros?: RegistroSaiposPrevisto[];
    entidades?: EntidadeInternaSaipos[];
    contexto_importacao?: SaiposImportContext;
  }
): SaiposBindingsState {
  const contexto = params?.contexto_importacao ?? SAIPOS_IMPORT_CONTEXT_DEFAULT;
  const registros = params?.registros ?? [];
  const entidadesPorUuid = catalogoPorId(params?.entidades ?? []);
  const state = criarEstadoBindingsSaiposVazio();
  state.migration.from_version = 1;
  state.migration.legacy_backup = legado;

  Object.values(legado.decisoes ?? {}).forEach((decisao) => {
    const codigo = decisao.codigo_completo.trim();
    const registrosCodigo = registros.filter((registro) => registro.codigo_completo.trim() === codigo);
    if (registrosCodigo.length !== 1) {
      state.migration.pending_legacy.push({
        external_ref: codigo,
        reason:
          registrosCodigo.length === 0
            ? "Decisão legada preservada sem migração automática: código não encontrado na análise atual."
            : "Decisão legada preservada sem migração automática: código colide com mais de um registro na análise atual.",
      });
      return;
    }

    const registro = registrosCodigo[0];
    const externalIdentity = criarIdentidadeExternaSaipos(registro, contexto);
    const externalKey = gerarChaveExternaSaipos(externalIdentity);
    const entidade = decisao.entidade_interna_id ? entidadesPorUuid.get(decisao.entidade_interna_id) ?? null : null;
    if (decisao.entidade_interna_id && !entidade) {
      state.migration.pending_legacy.push({
        external_ref: codigo,
        reason: "Decisão legada preservada sem migração automática: entidade interna anterior não existe mais no catálogo atual.",
      });
      return;
    }

    const migrated: SaiposBindingRecord = {
      external_key: externalKey,
      external_identity: externalIdentity,
      matched_internal_uuid: entidade?.internal_uuid ?? null,
      matched_internal_type: entidade?.internal_type ?? null,
      matched_internal_nome: entidade?.nome ?? decisao.entidade_interna_nome ?? null,
      workflow_state: "CONFIRMADO",
      matching_outcome: "PROVAVEL_REVISAO",
      classificacao_futura: decisao.classificacao_futura,
      confidence_score: 100,
      rule_id: "legacy_v1_manual_migration",
      reason: "Migração segura de decisão manual legada para a chave externa composta v3.",
      candidates_considered: entidade ? 1 : 0,
      matched_at: decisao.confirmado_em,
      decision_source: "human",
      actor: "migracao_v1",
      link_requirement_policy: politicaConservadoraBase(true),
    };
    state.bindings[externalKey] = migrated;
    state.history = appendHistory(state.history, {
      action: "MIGRATE",
      external_key: externalKey,
      before: null,
      after: migrated,
      actor: "migracao_v1",
      decision_source: "human",
      rule_id: "legacy_v1_manual_migration",
      reason: migrated.reason,
      timestamp: decisao.atualizado_em,
    });
    state.migration.migrated_bindings += 1;
  });

  return state;
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
    version: 3,
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

export function parseEstadoBindingsSaipos(
  payload: unknown,
  params?: {
    registros?: RegistroSaiposPrevisto[];
    entidades?: EntidadeInternaSaipos[];
    contexto_importacao?: SaiposImportContext;
  }
): SaiposBindingsState {
  if (isStateV3(payload)) {
    return {
      version: 3,
      bindings: payload.bindings,
      history: payload.history.slice(0, HISTORY_LIMIT),
      migration: payload.migration,
    };
  }

  if (isLegacyStateV2(payload)) return migrarEstadoV2(payload);
  if (isLegacyStateV1(payload)) return migrarEstadoV1(payload, params);
  return criarEstadoBindingsSaiposVazio();
}

export function criarBindingManualSaipos(params: {
  registro: RegistroSaiposVinculado;
  classificacao_futura: ClassificacaoFuturaSaipos;
  entidade: EntidadeInternaSaipos | null;
  actor: string;
  workflow_state?: Extract<SaiposWorkflowState, "CONFIRMADO" | "IGNORADO">;
  reason?: string;
  timestamp?: string;
  link_requirement_policy?: SaiposLinkRequirementPolicy;
}): SaiposBindingRecord {
  const timestamp = params.timestamp ?? new Date().toISOString();
  const workflowState = params.workflow_state ?? "CONFIRMADO";
  const reason =
    params.reason ??
    (workflowState === "IGNORADO"
      ? "Item marcado manualmente para ignorar na fila de vínculos."
      : "Item confirmado manualmente por revisão humana.");

  return {
    external_key: params.registro.external_key,
    external_identity: params.registro.external_identity,
    matched_internal_uuid: workflowState === "IGNORADO" ? null : params.entidade?.internal_uuid ?? null,
    matched_internal_type: workflowState === "IGNORADO" ? null : params.entidade?.internal_type ?? null,
    matched_internal_nome: workflowState === "IGNORADO" ? null : params.entidade?.nome ?? null,
    workflow_state: workflowState,
    matching_outcome: params.registro.matching_result.outcome,
    classificacao_futura: params.classificacao_futura,
    confidence_score: workflowState === "IGNORADO" ? 0 : 100,
    rule_id: workflowState === "IGNORADO" ? "human_ignore" : "human_confirmation",
    reason,
    candidates_considered: params.registro.matching_result.candidates_considered,
    matched_at: timestamp,
    decision_source: "human",
    actor: params.actor,
    link_requirement_policy: params.link_requirement_policy ?? params.registro.link_requirement_policy,
  };
}

export function salvarBindingSaipos(state: SaiposBindingsState, binding: SaiposBindingRecord): SaiposBindingsState {
  const before = state.bindings[binding.external_key] ?? null;
  const bindings = {
    ...state.bindings,
    [binding.external_key]: binding,
  };
  const history = appendHistory(state.history, {
    action: before ? "UPDATE" : binding.workflow_state === "IGNORADO" ? "IGNORE" : "CREATE",
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

export function reidentificarBindingSaipos(params: {
  state: SaiposBindingsState;
  externalKey: string;
  next_identity: SaiposExternalIdentity;
  actor: string;
  reason?: string;
  timestamp?: string;
}): SaiposBindingsState {
  const before = params.state.bindings[params.externalKey] ?? null;
  if (!before) return params.state;
  const nextKey = gerarChaveExternaSaipos(params.next_identity);
  const migrated: SaiposBindingRecord = {
    ...before,
    external_key: nextKey,
    external_identity: params.next_identity,
  };
  const bindings = { ...params.state.bindings };
  delete bindings[params.externalKey];
  bindings[nextKey] = migrated;
  const when = params.timestamp ?? new Date().toISOString();
  const history = appendHistory(params.state.history, {
    action: "REKEY",
    external_key: nextKey,
    before,
    after: migrated,
    actor: params.actor,
    decision_source: "human",
    rule_id: "external_identity_rekey",
    reason:
      params.reason ??
      "Reidentificação segura do vínculo externo para migrar environment/unidade sem perder decisões ou duplicar bindings.",
    timestamp: when,
  });
  return {
    ...params.state,
    bindings,
    history,
  };
}

export function executarMatchingSaipos(params: {
  registros: RegistroSaiposPrevisto[];
  state: SaiposBindingsState;
  entidades: EntidadeInternaSaipos[];
  contexto_importacao?: SaiposImportContext;
  selected_external_keys?: string[];
  nowIso?: string;
}): RegistroSaiposVinculado[] {
  const contexto = params.contexto_importacao ?? SAIPOS_IMPORT_CONTEXT_DEFAULT;
  const nowIso = params.nowIso ?? new Date().toISOString();
  const selected = new Set(params.selected_external_keys ?? []);

  return params.registros.map((registro) => {
    const externalIdentity = criarIdentidadeExternaSaipos(registro, contexto);
    const externalKey = gerarChaveExternaSaipos(externalIdentity);
    const binding = params.state.bindings[externalKey] ?? null;
    const policy = politicaConservadoraBase(selected.has(externalKey));

    let matchingResult: SaiposMatchingResult;
    if (binding) {
      matchingResult = matchingFromBinding(binding);
    } else {
      const candidatos = ordenarCandidatos(
        params.entidades
          .map((entidade) => scoreCandidato(registro, entidade))
          .filter((item): item is SaiposMatchingCandidate => item !== null)
      );
      matchingResult = criarMatchingResultBase(nowIso);
      matchingResult.candidates_considered = candidatos.length;
      matchingResult.candidates = candidatos.slice(0, 10);

      if (candidatos.length === 0) {
        matchingResult.outcome = "NOVO";
        matchingResult.rule_id = "no_candidate_found";
        matchingResult.reason = "Nenhuma entidade interna compatível foi encontrada para o item externo.";
      } else if (candidatos.length > 1 && candidatos[0].confidence_score === candidatos[1].confidence_score) {
        matchingResult.outcome = "CONFLITO";
        matchingResult.confidence_score = candidatos[0].confidence_score;
        matchingResult.rule_id = "multiple_equal_top_candidates";
        matchingResult.reason = "Há múltiplos candidatos com a mesma prioridade; revisão humana é obrigatória.";
      } else if (candidatos.length > 1 && candidatos[0].confidence_score - candidatos[1].confidence_score <= 5) {
        matchingResult.outcome = "CONFLITO";
        matchingResult.confidence_score = candidatos[0].confidence_score;
        matchingResult.rule_id = "ambiguous_top_candidates";
        matchingResult.reason = "Os candidatos líderes são muito próximos entre si; revisão humana é obrigatória.";
        matchingResult.selected_candidate = candidatos[0].entidade;
      } else {
        matchingResult.outcome = "PROVAVEL_REVISAO";
        matchingResult.confidence_score = candidatos[0].confidence_score;
        matchingResult.rule_id = "name_similarity_review";
        matchingResult.reason = candidatos[0].reason;
        matchingResult.selected_candidate = candidatos[0].entidade;
      }
    }

    const workflowState = determinarWorkflowState({
      binding,
      matching_result: matchingResult,
      policy: binding?.link_requirement_policy ?? policy,
    });

    return {
      ...registro,
      import_context: contexto,
      external_identity: externalIdentity,
      external_key: externalKey,
      matching_result: matchingResult,
      binding,
      workflow_state: workflowState,
      link_requirement_policy: binding?.link_requirement_policy ?? policy,
    };
  });
}

export function calcularPainelMatchingSaipos(registros: RegistroSaiposVinculado[]): SaiposPainelMatching {
  const painel: SaiposPainelMatching = {
    total_importado: registros.length,
    catalogo_externo_disponivel: registros.length,
    itens_sem_necessidade_atual_de_vinculo: 0,
    vinculos_necessarios: 0,
    pendencias_humanas_reais: 0,
    automaticos_seguros: 0,
    provaveis: 0,
    conflitos: 0,
    novos: 0,
    confirmados: 0,
    ignorados: 0,
  };

  registros.forEach((registro) => {
    switch (registro.matching_result.outcome) {
      case "AUTO_SEGURO":
        painel.automaticos_seguros += 1;
        break;
      case "PROVAVEL_REVISAO":
        painel.provaveis += 1;
        break;
      case "CONFLITO":
        painel.conflitos += 1;
        break;
      case "NOVO":
        painel.novos += 1;
        break;
    }

    switch (registro.workflow_state) {
      case "IMPORTADO_SEM_NECESSIDADE_DE_VINCULO":
        painel.itens_sem_necessidade_atual_de_vinculo += 1;
        break;
      case "VINCULO_NECESSARIO":
        painel.vinculos_necessarios += 1;
        painel.pendencias_humanas_reais += 1;
        break;
      case "PROVAVEL_REVISAO":
        painel.pendencias_humanas_reais += 1;
        break;
      case "CONFLITO":
        painel.pendencias_humanas_reais += 1;
        break;
      case "CONFIRMADO":
        painel.confirmados += 1;
        break;
      case "IGNORADO":
        painel.ignorados += 1;
        break;
    }
  });

  return painel;
}

export function registrosCompativeisParaAcaoColetiva(registros: RegistroSaiposVinculado[]): boolean {
  if (registros.length === 0) return false;
  const tipo = registros[0].external_identity.external_entity_type;
  return registros.every((registro) => {
    return (
      registro.external_identity.external_entity_type === tipo &&
      (registro.workflow_state === "VINCULO_NECESSARIO" || registro.workflow_state === "PROVAVEL_REVISAO")
    );
  });
}

export function gerarPreviewAcaoColetivaSaipos(params: {
  registros: RegistroSaiposVinculado[];
  selected_keys: string[];
  entidade: EntidadeInternaSaipos | null;
}): SaiposBulkPreviewItem[] {
  return params.registros
    .filter((registro) => params.selected_keys.includes(registro.external_key))
    .map((registro) => ({
      external_key: registro.external_key,
      codigo_completo: registro.codigo_completo,
      nome_externo: registro.nome_canonico || registro.descricao,
      entidade_interna_nome: params.entidade?.nome ?? null,
      consequence: params.entidade
        ? `Vincular ${registro.codigo_completo} a ${params.entidade.nome}.`
        : `Aplicar classificação sem vínculo interno para ${registro.codigo_completo}.`,
    }));
}

export function aplicarAcaoColetivaSaipos(params: {
  registros: RegistroSaiposVinculado[];
  selected_keys: string[];
  state: SaiposBindingsState;
  classificacao_futura: ClassificacaoFuturaSaipos;
  entidade: EntidadeInternaSaipos | null;
  actor: string;
  reason: string;
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

  if (selecionados.length > 1 && !params.reason.trim()) {
    return {
      state: params.state,
      applied_keys: [],
      skipped_keys: params.selected_keys,
    };
  }

  let nextState = params.state;
  const appliedKeys: string[] = [];
  selecionados.forEach((registro) => {
    const binding = criarBindingManualSaipos({
      registro,
      classificacao_futura: params.classificacao_futura,
      entidade: params.entidade,
      actor: params.actor,
      timestamp: params.timestamp,
      reason: params.reason,
      link_requirement_policy: {
        ...registro.link_requirement_policy,
        selected_for_binding: true,
      },
    });
    nextState = salvarBindingSaipos(nextState, binding);
    appliedKeys.push(registro.external_key);
  });

  return {
    state: nextState,
    applied_keys: appliedKeys,
    skipped_keys: params.selected_keys.filter((key) => !appliedKeys.includes(key)),
  };
}

export function exportarBackupBindingsSaipos(state: SaiposBindingsState): string {
  return JSON.stringify(state, null, 2);
}