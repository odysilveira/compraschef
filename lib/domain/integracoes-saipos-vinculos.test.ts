import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ClassificacaoFuturaSaipos, RegistroSaiposPrevisto } from "./integracoes-saipos";
import { criarSaiposBindingsRepositoryLocal, type StorageLike } from "./integracoes-saipos-bindings-repository-local";
import {
  aplicarAcaoColetivaSaipos,
  calcularPainelMatchingSaipos,
  criarBindingManualSaipos,
  criarEstadoBindingsSaiposVazio,
  criarIdentidadeExternaSaipos,
  executarMatchingSaipos,
  exportarBackupBindingsSaipos,
  gerarChaveExternaSaipos,
  inferirTipoEntidadeExterna,
  parseEstadoBindingsSaipos,
  registrosCompativeisParaAcaoColetiva,
  salvarBindingSaipos,
  type EntidadeInternaSaipos,
  type RegistroSaiposVinculado,
  type SaiposBindingsState,
  SAIPOS_IMPORT_CONTEXT_DEFAULT,
} from "./integracoes-saipos-vinculos";

const entidades: EntidadeInternaSaipos[] = [
  { internal_uuid: "rec-1", internal_type: "PRATO", nome: "Lasanha G", status: "ATIVO" },
  { internal_uuid: "rec-2", internal_type: "PRATO", nome: "Lasanha P", status: "ATIVO" },
  { internal_uuid: "ins-1", internal_type: "INSUMO", nome: "Batata Frita", status: "ATIVO" },
  { internal_uuid: "ins-2", internal_type: "INSUMO", nome: "Batata Especial", status: "ATIVO" },
];

function registroBase(patch?: Partial<RegistroSaiposPrevisto>): RegistroSaiposPrevisto {
  return {
    linha_planilha: 2,
    tipo: "PRATO",
    codigo_completo: "SAI-1",
    codigo_prato: "SAI-1",
    codigo_prato_pai: "",
    codigo_opcao: "",
    descricao: "Lasanha G",
    descricao_prato: "Lasanha G",
    complemento: "",
    categoria: "Pratos",
    tamanho: "G",
    preco_texto: "12,00",
    preco_centavos: 1200,
    pesavel: "Não",
    ativo: true,
    inativo_texto: "Não",
    classificacao_futura: "NÃO CLASSIFICADO",
    nome_canonico: "Lasanha G",
    alertas: [],
    conflitos: [],
    indicador: "VALIDO",
    codigo_valido: true,
    ...patch,
  };
}

function classificar(
  registros: RegistroSaiposPrevisto[],
  estado: SaiposBindingsState = criarEstadoBindingsSaiposVazio()
): RegistroSaiposVinculado[] {
  return executarMatchingSaipos({
    registros,
    state: estado,
    entidades,
    contexto_importacao: SAIPOS_IMPORT_CONTEXT_DEFAULT,
    nowIso: "2026-08-02T12:00:00.000Z",
  });
}

function storageFake(initial?: Record<string, string>): StorageLike {
  const values = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key)! : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe("integracoes-saipos-vinculos api-ready", () => {
  it("gera chave composta sem colisão entre unidade, ambiente e tipo", () => {
    const registro = registroBase();
    const base = criarIdentidadeExternaSaipos(registro, SAIPOS_IMPORT_CONTEXT_DEFAULT);
    const keyBase = gerarChaveExternaSaipos(base);
    const keyOutraUnidade = gerarChaveExternaSaipos({ ...base, unidade_id: "loja-2" });
    const keyOutroAmbiente = gerarChaveExternaSaipos({ ...base, environment: "api_publica" });
    const keyOutroTipo = gerarChaveExternaSaipos({ ...base, external_entity_type: "COMPLEMENTO" });

    expect(keyBase).not.toBe(keyOutraUnidade);
    expect(keyBase).not.toBe(keyOutroAmbiente);
    expect(keyBase).not.toBe(keyOutroTipo);
  });

  it("AUTO_SEGURO só aparece por regra determinística inequívoca", () => {
    const classificados = classificar([registroBase()]);
    expect(classificados[0].matching_result.state).toBe("AUTO_SEGURO");
    expect(classificados[0].matching_result.rule_id).toBe("exact_unique_name_and_type");

    const binding = {
      external_key: classificados[0].external_key,
      external_identity: classificados[0].external_identity,
      matched_internal_uuid: "rec-1",
      matched_internal_type: "PRATO" as const,
      matched_internal_nome: "Lasanha G",
      matching_state: "AUTO_SEGURO" as const,
      classificacao_futura: "NÃO CLASSIFICADO" as ClassificacaoFuturaSaipos,
      confidence_score: 100,
      rule_id: "existing_binding_exact",
      reason: "Vínculo externo previamente conhecido para esta chave composta.",
      candidates_considered: 1,
      matched_at: "2026-08-02T12:00:00.000Z",
      decision_source: "automatic" as const,
      actor: "sync-engine",
    };
    const estado = salvarBindingSaipos(criarEstadoBindingsSaiposVazio(), binding);
    const rematch = classificar([registroBase()], estado);
    expect(rematch[0].matching_result.state).toBe("AUTO_SEGURO");
    expect(rematch[0].matching_result.rule_id).toBe("existing_binding_exact");
  });

  it("nome semelhante isoladamente não produz AUTO_SEGURO", () => {
    const resultado = classificar([registroBase({ descricao: "Batata", nome_canonico: "Batata" })]);
    expect(resultado[0].matching_result.state).not.toBe("AUTO_SEGURO");
  });

  it("nomes repetidos geram revisão ou conflito", () => {
    const repetido = registroBase({
      descricao: "Batata",
      nome_canonico: "Batata",
      tipo: "COMPLEMENTO",
      alertas: ["Mesmo nome canônico com código diferente."],
    });
    const resultado = classificar([repetido]);
    expect(["PROVAVEL_REVISAO", "CONFLITO"]).toContain(resultado[0].matching_result.state);
    expect(resultado[0].matching_result.state).not.toBe("AUTO_SEGURO");
  });

  it("sem candidato resulta em NOVO", () => {
    const resultado = classificar([registroBase({ descricao: "Item sem par", nome_canonico: "Item sem par" })]);
    expect(resultado[0].matching_result.state).toBe("NOVO");
  });

  it("múltiplos candidatos próximos resultam em CONFLITO", () => {
    const resultado = classificar([
      registroBase({
        tipo: "COMPLEMENTO",
        descricao: "Batata",
        nome_canonico: "Batata",
      }),
    ]);
    expect(resultado[0].matching_result.state).toBe("CONFLITO");
  });

  it("persiste através da interface de repositório", () => {
    const repo = criarSaiposBindingsRepositoryLocal(storageFake());
    const registro = classificar([registroBase()])[0];
    const binding = criarBindingManualSaipos({
      registro,
      classificacao_futura: "VARIAÇÃO DO PRATO",
      entidade: entidades[0],
      actor: "tester",
      timestamp: "2026-08-02T12:00:00.000Z",
    });

    repo.salvar(binding, { registros: [registro], entidades, contexto_importacao: SAIPOS_IMPORT_CONTEXT_DEFAULT });
    const recarregado = repo.buscarPorChaveExterna(binding.external_key, {
      registros: [registro],
      entidades,
      contexto_importacao: SAIPOS_IMPORT_CONTEXT_DEFAULT,
    });
    expect(recarregado?.matched_internal_uuid).toBe("rec-1");
  });

  it("migra o estado anterior quando seguro e preserva backup quando não seguro", () => {
    const legado = {
      versao: 1,
      decisoes: {
        "SAI-1": {
          codigo_completo: "SAI-1",
          classificacao_futura: "VARIAÇÃO DO PRATO",
          entidade_interna_id: "rec-1",
          entidade_interna_nome: "Lasanha G",
          confirmado_em: "2026-08-02T10:00:00.000Z",
          atualizado_em: "2026-08-02T10:00:00.000Z",
          origem: "manual-individual",
        },
        "SAI-X": {
          codigo_completo: "SAI-X",
          classificacao_futura: "OPERACIONAL",
          entidade_interna_id: null,
          entidade_interna_nome: null,
          confirmado_em: "2026-08-02T10:00:00.000Z",
          atualizado_em: "2026-08-02T10:00:00.000Z",
          origem: "manual-individual",
        },
      },
      historico: [],
    };

    const migrado = parseEstadoBindingsSaipos(legado, {
      registros: [registroBase()],
      entidades,
      contexto_importacao: SAIPOS_IMPORT_CONTEXT_DEFAULT,
    });

    expect(migrado.version).toBe(2);
    expect(migrado.migration.migrated_bindings).toBe(1);
    expect(migrado.migration.pending_legacy).toHaveLength(1);
    expect(migrado.migration.legacy_backup).not.toBeNull();
  });

  it("mantém histórico estruturado com before e after", () => {
    const registro = classificar([registroBase()])[0];
    const binding = criarBindingManualSaipos({
      registro,
      classificacao_futura: "VARIAÇÃO DO PRATO",
      entidade: entidades[0],
      actor: "tester",
      timestamp: "2026-08-02T12:00:00.000Z",
    });
    const estado = salvarBindingSaipos(criarEstadoBindingsSaiposVazio(), binding);

    expect(estado.history[0].action).toBe("CREATE");
    expect(estado.history[0].before).toBeNull();
    expect(estado.history[0].after?.external_key).toBe(binding.external_key);
    expect(estado.history[0].rule_id).toBe("human_confirmation");
  });

  it("ação coletiva opera somente nos selecionados e compatíveis", () => {
    const registros = classificar([
      registroBase({ codigo_completo: "A-1", descricao: "Sem match 1", nome_canonico: "Sem match 1" }),
      registroBase({ codigo_completo: "A-2", descricao: "Sem match 2", nome_canonico: "Sem match 2" }),
      registroBase({ codigo_completo: "A-3", descricao: "Sem match 3", nome_canonico: "Sem match 3" }),
    ]);
    expect(registrosCompativeisParaAcaoColetiva(registros.slice(0, 2))).toBe(true);

    const resultado = aplicarAcaoColetivaSaipos({
      registros,
      selected_keys: [registros[0].external_key, registros[1].external_key],
      state: criarEstadoBindingsSaiposVazio(),
      classificacao_futura: "VARIAÇÃO DO PRATO",
      entidade: entidades[0],
      actor: "tester",
      timestamp: "2026-08-02T12:00:00.000Z",
    });

    expect(Object.keys(resultado.state.bindings)).toHaveLength(2);
    expect(resultado.applied_keys).toHaveLength(2);
    expect(resultado.skipped_keys).toHaveLength(0);
  });

  it("não realiza chamadas externas durante matching e persistência local", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const repo = criarSaiposBindingsRepositoryLocal(storageFake());
    const registro = classificar([registroBase()])[0];
    const binding = criarBindingManualSaipos({
      registro,
      classificacao_futura: "VARIAÇÃO DO PRATO",
      entidade: entidades[0],
      actor: "tester",
    });
    repo.salvar(binding, { registros: [registro], entidades, contexto_importacao: SAIPOS_IMPORT_CONTEXT_DEFAULT });
    classificar([registroBase()]);

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("mantém o Excel real fora do Git quando o arquivo local existe", () => {
    const caminho = "Códigos de integração (1).xlsx";
    if (!existsSync(caminho)) return;

    const status = execSync('git status --porcelain -- "Códigos de integração (1).xlsx"', {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();

    expect(status.startsWith("??")).toBe(true);
  });

  it("gera painel organizado por automáticos e exceções", () => {
    const classificados = classificar([
      registroBase({ codigo_completo: "NEW-1", descricao: "Sem match", nome_canonico: "Sem match" }),
      registroBase({ codigo_completo: "CFL-1", tipo: "COMPLEMENTO", descricao: "Batata", nome_canonico: "Batata" }),
      registroBase(),
    ]);
    const registroManual = classificados[2];
    const binding = criarBindingManualSaipos({
      registro: registroManual,
      classificacao_futura: "VARIAÇÃO DO PRATO",
      entidade: entidades[0],
      actor: "tester",
      timestamp: "2026-08-02T12:00:00.000Z",
    });

    const reclassificados = executarMatchingSaipos({
      registros: classificados.map(({ external_identity, external_key, matching_result, binding: _, ...registro }) => registro),
      state: salvarBindingSaipos(criarEstadoBindingsSaiposVazio(), binding),
      entidades,
      contexto_importacao: SAIPOS_IMPORT_CONTEXT_DEFAULT,
      nowIso: "2026-08-02T12:00:00.000Z",
    });

    const painel = calcularPainelMatchingSaipos(reclassificados);
    expect(painel.total_analisado).toBe(3);
    expect(painel.confirmados).toBe(1);
    expect(painel.pendencias_humanas).toBe(2);
  });

  it("exporta backup versionado do novo estado", () => {
    const backup = exportarBackupBindingsSaipos(criarEstadoBindingsSaiposVazio());
    expect(backup).toContain('"version": 2');
  });

  it("infere o tipo externo atual do Excel sem inventar categorias", () => {
    expect(inferirTipoEntidadeExterna(registroBase({ tipo: "PRATO" }))).toBe("PRATO");
    expect(inferirTipoEntidadeExterna(registroBase({ tipo: "COMPLEMENTO" }))).toBe("COMPLEMENTO");
    expect(inferirTipoEntidadeExterna(registroBase({ tipo: "OUTRO" }))).toBe("OUTRO");
  });
});