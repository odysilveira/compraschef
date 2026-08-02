import type { RegistroSaiposPrevisto } from "./integracoes-saipos";
import type {
  EntidadeInternaSaipos,
  SaiposBindingRecord,
  SaiposBindingsState,
  SaiposHistoryEntry,
  SaiposImportContext,
} from "./integracoes-saipos-vinculos";

export interface SaiposBindingsLoadParams {
  registros?: RegistroSaiposPrevisto[];
  entidades?: EntidadeInternaSaipos[];
  contexto_importacao?: SaiposImportContext;
}

export interface SaiposBindingsRepository {
  carregar(params?: SaiposBindingsLoadParams): SaiposBindingsState;
  listarVinculos(params?: SaiposBindingsLoadParams): SaiposBindingRecord[];
  buscarPorChaveExterna(externalKey: string, params?: SaiposBindingsLoadParams): SaiposBindingRecord | undefined;
  salvar(binding: SaiposBindingRecord, params?: SaiposBindingsLoadParams): SaiposBindingsState;
  atualizar(binding: SaiposBindingRecord, params?: SaiposBindingsLoadParams): SaiposBindingsState;
  removerOuInativar(externalKey: string, actor: string, params?: SaiposBindingsLoadParams): SaiposBindingsState;
  listarHistorico(params?: SaiposBindingsLoadParams): SaiposHistoryEntry[];
  exportarBackup(params?: SaiposBindingsLoadParams): string;
}