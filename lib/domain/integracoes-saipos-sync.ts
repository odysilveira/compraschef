import type { SaiposBindingRecord, SaiposExternalIdentity } from "./integracoes-saipos-vinculos";

export interface IdempotencyKey {
  key: string;
  source_system: "saipos";
  generated_at: string;
}

export interface SyncCursor {
  mode: "excel_bootstrap" | "api_incremental" | "reprocess";
  page?: number;
  next_token?: string | null;
  last_seen_at?: string | null;
}

export interface SyncRun {
  id: string;
  source_system: "saipos";
  started_at: string;
  finished_at?: string;
  cursor_inicial?: SyncCursor;
  cursor_final?: SyncCursor;
  status: "running" | "success" | "partial" | "failed";
}

export interface SyncError {
  id: string;
  run_id: string;
  external_identity?: SaiposExternalIdentity;
  code: string;
  message: string;
  retryable: boolean;
  created_at: string;
}

export interface SyncResult {
  run: SyncRun;
  imported: number;
  matched_automaticamente: number;
  enviados_para_revisao: number;
  conflitos: number;
  novos: number;
  ignored: number;
  bindings: SaiposBindingRecord[];
  errors: SyncError[];
}

export interface WebhookEvent {
  event_id: string;
  source_system: "saipos";
  event_type: string;
  occurred_at: string;
  external_identity?: SaiposExternalIdentity;
  payload: unknown;
}

export interface ReprocessCommand {
  scope: "all" | "external_key" | "run";
  external_key?: string;
  run_id?: string;
  reason: string;
  requested_by: string;
}

export interface SaiposApiClient {
  listarItens(cursor?: SyncCursor): Promise<SyncResult>;
  listarAlteracoes(cursor?: SyncCursor): Promise<SyncResult>;
  reprocessar(command: ReprocessCommand): Promise<SyncResult>;
  receberWebhook(event: WebhookEvent): Promise<void>;
}