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
  gerarPreviewAcaoColetivaSaipos,
  inferirTipoEntidadeExterna,
  parseEstadoBindingsSaipos,
  registrosCompativeisParaAcaoColetiva,
  reidentificarBindingSaipos,
  salvarBindingSaipos,
  type EntidadeInternaSaipos,
  type RegistroSaiposVinculado,
  type SaiposBindingsState,
  SAIPOS_IMPORT_CONTEXT_DEFAULT,
} from "./integracoes-saipos-vinculos";

const entidades: EntidadeInternaSaipos[] = [
  { internal_uuid: "rec-1", internal_type: "PRATO", nome: "Lasanha G", status: "ATIVO" },
  { internal_uuid: "rec-2", internal_type: "OUTRO", nome: "Molho bolonhesa", status: "ATIVO" },
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
  estado: SaiposBindingsState = criarEstadoBindingsSaiposVazio(),
  selectedKeys: string[] = [],
  contexto = SAIPOS_IMPORT_CONTEXT_DEFAULT
): RegistroSaiposVinculado[] {
  return executarMatchingSaipos({
    registros,
    state: estado,
    entidades,
    contexto_importacao: contexto,
    selected_external_keys: selectedKeys,
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

describe("integracoes-saipos-vinculos blocking fixes", () => {
  it("gera chave composta sem colisão entre unidade, ambiente e tipo", () => {
    const registro = registroBase();
    const base = criarIdentidadeExternaSaipos(registro, SAIPOS_IMPORT_CONTEXT_DEFAULT);
    const keyBase = gerarChaveExternaSaipos(base);
    const keyOutraUnidade = gerarChaveExternaSaipos({ ...base, unidade_id: "loja-2" });
    const keyOutroAmbiente = gerarChaveExternaSaipos({ ...base, environment: "producao" });
    const keyOutroTipo = gerarChaveExternaSaipos({ ...base, external_entity_type: "COMPLEMENTO" });

    expect(keyBase).not.toBe(keyOutraUnidade);
    expect(keyBase).not.toBe(keyOutroAmbiente);
    expect(keyBase).not.toBe(keyOutroTipo);
  });

  it("mesmo item vindo por excel e api recupera a mesma chave externa", () => {
    const registro = registroBase();
    const keyExcel = gerarChaveExternaSaipos(
      criarIdentidadeExternaSaipos(registro, {
        ...SAIPOS_IMPORT_CONTEXT_DEFAULT,
        ingestion_source: "excel",
      })
    );
    const keyApi = gerarChaveExternaSaipos(
      criarIdentidadeExternaSaipos(registro, {
        ...SAIPOS_IMPORT_CONTEXT_DEFAULT,
        ingestion_source: "api",
      })
    );
    expect(keyExcel).toBe(keyApi);
  });

  it("nome exato único e tipo compatível não produz AUTO_SEGURO sem identificador determinístico", () => {
    const classificados = classificar([registroBase()]);
    expect(classificados[0].matching_result.outcome).toBe("PROVAVEL_REVISAO");
    expect(classificados[0].matching_result.rule_id).toBe("name_similarity_review");
  });

  it("binding anterior confirmado para a mesma identidade externa produz AUTO_SEGURO", () => {
    const registro = classificar([registroBase()], criarEstadoBindingsSaiposVazio(), ["seed"]).map((item) => item)[0];
    const binding = criarBindingManualSaipos({
      registro,
      classificacao_futura: "VARIAÇÃO DO PRATO",
      entidade: entidades[0],
      actor: "tester",
      reason: "Binding oficial prévio",
    });
    const estado = salvarBindingSaipos(criarEstadoBindingsSaiposVazio(), binding);
    const reclassificado = classificar([registroBase()], estado);
    expect(reclassificado[0].matching_result.outcome).toBe("AUTO_SEGURO");
    expect(reclassificado[0].matching_result.rule_id).toBe("existing_confirmed_binding");
  });

  it("nome semelhante isoladamente não produz AUTO_SEGURO", () => {
    const resultado = classificar([registroBase({ descricao: "Batata", nome_canonico: "Batata" })]);
    expect(resultado[0].matching_result.outcome).not.toBe("AUTO_SEGURO");
  });

  it("nomes repetidos geram revisão ou conflito", () => {
    const repetido = registroBase({
      descricao: "Batata",
      nome_canonico: "Batata",
      tipo: "COMPLEMENTO",
      alertas: ["Mesmo nome canônico com código diferente."],
    });
    const resultado = classificar([repetido]);
    expect(["PROVAVEL_REVISAO", "CONFLITO"]).toContain(resultado[0].matching_result.outcome);
  });

  it("nenhum candidato resulta em NOVO e sem necessidade humana por padrão", () => {
    const resultado = classificar([registroBase({ descricao: "Item sem par", nome_canonico: "Item sem par" })]);
    expect(resultado[0].matching_result.outcome).toBe("NOVO");
    expect(resultado[0].workflow_state).toBe("IMPORTADO_SEM_NECESSIDADE_DE_VINCULO");
  });

  it("múltiplos candidatos próximos resultam em CONFLITO", () => {
    const resultado = classificar([
      registroBase({ tipo: "COMPLEMENTO", descricao: "Batata", nome_canonico: "Batata" }),
    ]);
    expect(resultado[0].matching_result.outcome).toBe("CONFLITO");
  });

  it("seleção explícita move item novo para vínculo necessário", () => {
    const primeiro = classificar([registroBase({ codigo_completo: "N-1", descricao: "Sem match", nome_canonico: "Sem match" })])[0];
    const reclassificado = classificar([registroBase({ codigo_completo: "N-1", descricao: "Sem match", nome_canonico: "Sem match" })], criarEstadoBindingsSaiposVazio(), [primeiro.external_key]);
    expect(reclassificado[0].workflow_state).toBe("VINCULO_NECESSARIO");
  });

  it("persistência ocorre através da interface de repositório", () => {
    const repo = criarSaiposBindingsRepositoryLocal(storageFake());
    const registro = classificar([registroBase()], criarEstadoBindingsSaiposVazio(), [classificar([registroBase()])[0].external_key])[0];
    const binding = criarBindingManualSaipos({
      registro,
      classificacao_futura: "VARIAÇÃO DO PRATO",
      entidade: entidades[0],
      actor: "tester",
    });
    repo.salvar(binding, { registros: [registro], entidades, contexto_importacao: SAIPOS_IMPORT_CONTEXT_DEFAULT });
    expect(repo.buscarPorChaveExterna(binding.external_key)?.matched_internal_uuid).toBe("rec-1");
  });

  it("migra estado v1 preservando backup e pendências inseguras", () => {
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
    expect(migrado.version).toBe(3);
    expect(migrado.migration.migrated_bindings).toBe(1);
    expect(migrado.migration.pending_legacy).toHaveLength(1);
    expect(migrado.migration.legacy_backup).not.toBeNull();
  });

  it("migra estado v2 para environment desconhecido sem perder binding", () => {
    const legacyV2 = {
      version: 2,
      bindings: {
        foo: {
          external_key: "foo",
          external_identity: {
            source_system: "saipos",
            environment: "api_publica",
            unidade_id: "nao_informada",
            codigo_completo: "SAI-1",
            external_entity_type: "PRATO",
            canal: null,
          },
          matched_internal_uuid: "rec-1",
          matched_internal_type: "PRATO",
          matched_internal_nome: "Lasanha G",
          matching_state: "CONFIRMADO_MANUALMENTE",
          classificacao_futura: "VARIAÇÃO DO PRATO",
          confidence_score: 100,
          rule_id: "legacy",
          reason: "legacy",
          candidates_considered: 1,
          matched_at: "2026-08-02T10:00:00.000Z",
          decision_source: "human",
          actor: "tester",
        },
      },
      history: [],
      migration: { from_version: null, migrated_bindings: 0, pending_legacy: [], legacy_backup: null },
    };
    const migrado = parseEstadoBindingsSaipos(legacyV2);
    const binding = Object.values(migrado.bindings)[0];
    expect(migrado.version).toBe(3);
    expect(binding.external_identity.environment).toBe("desconhecido");
  });

  it("reidentifica binding para ambiente ou unidade real sem duplicar decisões", () => {
    const registro = classificar([registroBase()], criarEstadoBindingsSaiposVazio(), [classificar([registroBase()])[0].external_key])[0];
    const binding = criarBindingManualSaipos({
      registro,
      classificacao_futura: "VARIAÇÃO DO PRATO",
      entidade: entidades[0],
      actor: "tester",
    });
    const estado = salvarBindingSaipos(criarEstadoBindingsSaiposVazio(), binding);
    const rekeyed = reidentificarBindingSaipos({
      state: estado,
      externalKey: binding.external_key,
      next_identity: { ...binding.external_identity, environment: "producao", unidade_id: "loja-1" },
      actor: "tester",
    });
    expect(Object.keys(rekeyed.bindings)).toHaveLength(1);
    expect(Object.values(rekeyed.bindings)[0].external_identity.environment).toBe("producao");
  });

  it("mantém histórico estruturado com before e after", () => {
    const registroSeed = classificar([registroBase()])[0];
    const registro = classificar([registroBase()], criarEstadoBindingsSaiposVazio(), [registroSeed.external_key])[0];
    const binding = criarBindingManualSaipos({
      registro,
      classificacao_futura: "VARIAÇÃO DO PRATO",
      entidade: entidades[0],
      actor: "tester",
    });
    const estado = salvarBindingSaipos(criarEstadoBindingsSaiposVazio(), binding);
    expect(estado.history[0].action).toBe("CREATE");
    expect(estado.history[0].before).toBeNull();
    expect(estado.history[0].after?.external_key).toBe(binding.external_key);
  });

  it("ação coletiva só opera sobre selecionados, com prévia e motivo", () => {
    const base = [
      registroBase({ codigo_completo: "A-1", descricao: "Sem match 1", nome_canonico: "Sem match 1" }),
      registroBase({ codigo_completo: "A-2", descricao: "Sem match 2", nome_canonico: "Sem match 2" }),
      registroBase({ codigo_completo: "A-3", descricao: "Sem match 3", nome_canonico: "Sem match 3" }),
    ];
    const preliminares = classificar(base);
    const selecionados = [preliminares[0].external_key, preliminares[1].external_key];
    const registros = classificar(base, criarEstadoBindingsSaiposVazio(), selecionados);

    expect(registrosCompativeisParaAcaoColetiva(registros.slice(0, 2))).toBe(true);
    expect(gerarPreviewAcaoColetivaSaipos({ registros, selected_keys: selecionados, entidade: entidades[0] })).toHaveLength(2);

    const semMotivo = aplicarAcaoColetivaSaipos({
      registros,
      selected_keys: selecionados,
      state: criarEstadoBindingsSaiposVazio(),
      classificacao_futura: "VARIAÇÃO DO PRATO",
      entidade: entidades[0],
      actor: "tester",
      reason: "",
    });
    expect(semMotivo.applied_keys).toHaveLength(0);

    const comMotivo = aplicarAcaoColetivaSaipos({
      registros,
      selected_keys: selecionados,
      state: criarEstadoBindingsSaiposVazio(),
      classificacao_futura: "VARIAÇÃO DO PRATO",
      entidade: entidades[0],
      actor: "tester",
      reason: "Consolidar temporariamente itens selecionados para análise manual de CMV.",
    });
    expect(comMotivo.applied_keys).toHaveLength(2);
    expect(comMotivo.skipped_keys).toHaveLength(0);
  });

  it("não realiza chamadas externas durante matching e persistência local", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const repo = criarSaiposBindingsRepositoryLocal(storageFake());
    const preliminar = classificar([registroBase()])[0];
    const registro = classificar([registroBase()], criarEstadoBindingsSaiposVazio(), [preliminar.external_key])[0];
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

  it("gera painel separando catálogo importado e pendência humana real", () => {
    const base = [
      registroBase({ codigo_completo: "NEW-1", descricao: "Sem match", nome_canonico: "Sem match" }),
      registroBase({ codigo_completo: "CFL-1", tipo: "COMPLEMENTO", descricao: "Batata", nome_canonico: "Batata" }),
      registroBase(),
    ];
    const registros = classificar(base);
    const painel = calcularPainelMatchingSaipos(registros);
    expect(painel.total_importado).toBe(3);
    expect(painel.catalogo_externo_disponivel).toBe(3);
    expect(painel.itens_sem_necessidade_atual_de_vinculo).toBe(3);
    expect(painel.pendencias_humanas_reais).toBe(0);
  });

  it("exporta backup versionado do novo estado", () => {
    const backup = exportarBackupBindingsSaipos(criarEstadoBindingsSaiposVazio());
    expect(backup).toContain('"version": 3');
  });

  it("infere o tipo externo atual do Excel sem inventar categorias", () => {
    expect(inferirTipoEntidadeExterna(registroBase({ tipo: "PRATO" }))).toBe("PRATO");
    expect(inferirTipoEntidadeExterna(registroBase({ tipo: "COMPLEMENTO" }))).toBe("COMPLEMENTO");
    expect(inferirTipoEntidadeExterna(registroBase({ tipo: "OUTRO" }))).toBe("OUTRO");
  });
});