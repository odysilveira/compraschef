import type { SaiposBindingsLoadParams, SaiposBindingsRepository } from "./integracoes-saipos-bindings-repository";
import {
  criarEstadoBindingsSaiposVazio,
  exportarBackupBindingsSaipos,
  parseEstadoBindingsSaipos,
  removerBindingSaipos,
  salvarBindingSaipos,
  type SaiposBindingsState,
} from "./integracoes-saipos-vinculos";

const STORAGE_CURRENT = "integracao-saipos:bindings:v2";
const STORAGE_LEGACY = "integracao-saipos:decisoes:v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storageBrowser(): StorageLike | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function lerRaw(storage: StorageLike | null): unknown {
  if (!storage) return null;

  const atual = storage.getItem(STORAGE_CURRENT);
  if (atual) {
    try {
      return JSON.parse(atual) as unknown;
    } catch {
      return null;
    }
  }

  const legado = storage.getItem(STORAGE_LEGACY);
  if (!legado) return null;
  try {
    return JSON.parse(legado) as unknown;
  } catch {
    return null;
  }
}

function persistir(storage: StorageLike | null, state: SaiposBindingsState) {
  if (!storage) return;
  storage.setItem(STORAGE_CURRENT, JSON.stringify(state));
}

export function criarSaiposBindingsRepositoryLocal(
  storage: StorageLike | null = storageBrowser()
): SaiposBindingsRepository {
  function carregar(params?: SaiposBindingsLoadParams): SaiposBindingsState {
    const raw = lerRaw(storage);
    const state = raw
      ? parseEstadoBindingsSaipos(raw, {
          registros: params?.registros,
          entidades: params?.entidades,
          contexto_importacao: params?.contexto_importacao,
        })
      : criarEstadoBindingsSaiposVazio();

    persistir(storage, state);
    return state;
  }

  return {
    carregar,
    listarVinculos(params) {
      return Object.values(carregar(params).bindings);
    },
    buscarPorChaveExterna(externalKey, params) {
      return carregar(params).bindings[externalKey];
    },
    salvar(binding, params) {
      const current = carregar(params);
      const next = salvarBindingSaipos(current, binding);
      persistir(storage, next);
      return next;
    },
    atualizar(binding, params) {
      const current = carregar(params);
      const next = salvarBindingSaipos(current, binding);
      persistir(storage, next);
      return next;
    },
    removerOuInativar(externalKey, actor, params) {
      const current = carregar(params);
      const next = removerBindingSaipos(current, externalKey, actor);
      persistir(storage, next);
      return next;
    },
    listarHistorico(params) {
      return carregar(params).history;
    },
    exportarBackup(params) {
      return exportarBackupBindingsSaipos(carregar(params));
    },
  };
}