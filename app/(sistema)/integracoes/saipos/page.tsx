"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Download, FileSpreadsheet, RotateCcw, Save, Search, Upload } from "lucide-react";
import { Badge, Card, Campo, StatCard, TituloPagina, Vazio } from "@/components/ui";
import { useDB } from "@/lib/data/index";
import {
  analisarPlanilhaSaipos,
  CLASSIFICACOES_FUTURAS_SAIPOS,
  COLUNAS_SAIPOS_OBRIGATORIAS,
  criarAnaliseSaiposVazia,
  SAIPOS_MAX_BYTES_ARQUIVO,
  SAIPOS_MAX_REGISTROS,
  validarArquivoSaiposLocal,
  type AnaliseSaiposResultado,
  type ClassificacaoFuturaSaipos,
  type RegistroSaiposPrevisto,
} from "@/lib/domain/integracoes-saipos";
import { criarSaiposBindingsRepositoryLocal } from "@/lib/domain/integracoes-saipos-bindings-repository-local";
import {
  aplicarAcaoColetivaSaipos,
  calcularPainelMatchingSaipos,
  criarBindingManualSaipos,
  criarEstadoBindingsSaiposVazio,
  executarMatchingSaipos,
  gerarPreviewAcaoColetivaSaipos,
  inferirTipoEntidadeExterna,
  registrosCompativeisParaAcaoColetiva,
  SAIPOS_IMPORT_CONTEXT_DEFAULT,
  type EntidadeInternaSaipos,
  type RegistroSaiposVinculado,
  type SaiposBindingsState,
  type SaiposMatchingOutcome,
  type SaiposWorkflowState,
} from "@/lib/domain/integracoes-saipos-vinculos";

const TAMANHO_PAGINA = 20;
const ACTOR_LOCAL = "usuario-local";

type FiltroWorkflow = "todos" | SaiposWorkflowState;
type FiltroOutcome = "todos" | SaiposMatchingOutcome;

interface RascunhoLinha {
  classificacao_futura: ClassificacaoFuturaSaipos;
  entidade_interna_id: string;
}

function formatarTamanho(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

function moedaCentavos(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor / 100);
}

function statusRegistro(registro: RegistroSaiposPrevisto): "verde" | "laranja" | "vermelho" {
  if (registro.indicador === "CONFLITO") return "vermelho";
  if (registro.indicador === "AVISO") return "laranja";
  return "verde";
}

function corOutcome(outcome: SaiposMatchingOutcome): "verde" | "laranja" | "vermelho" {
  if (outcome === "AUTO_SEGURO") return "verde";
  if (outcome === "CONFLITO") return "vermelho";
  return "laranja";
}

function rotuloOutcome(outcome: SaiposMatchingOutcome): string {
  switch (outcome) {
    case "AUTO_SEGURO":
      return "Automático seguro";
    case "PROVAVEL_REVISAO":
      return "Provável revisão";
    case "CONFLITO":
      return "Conflito";
    case "NOVO":
      return "Novo";
  }
}

function corWorkflow(state: SaiposWorkflowState): "cinza" | "verde" | "laranja" | "vermelho" {
  switch (state) {
    case "IMPORTADO_SEM_NECESSIDADE_DE_VINCULO":
      return "cinza";
    case "VINCULO_NECESSARIO":
      return "laranja";
    case "PROVAVEL_REVISAO":
      return "laranja";
    case "CONFLITO":
      return "vermelho";
    case "CONFIRMADO":
      return "verde";
    case "IGNORADO":
      return "cinza";
  }
}

function rotuloWorkflow(state: SaiposWorkflowState): string {
  switch (state) {
    case "IMPORTADO_SEM_NECESSIDADE_DE_VINCULO":
      return "Importado sem necessidade atual de vínculo";
    case "VINCULO_NECESSARIO":
      return "Vínculo necessário";
    case "PROVAVEL_REVISAO":
      return "Provável para revisão";
    case "CONFLITO":
      return "Conflito";
    case "CONFIRMADO":
      return "Confirmado";
    case "IGNORADO":
      return "Ignorado";
  }
}

function baixarTexto(nomeArquivo: string, conteudo: string) {
  const blob = new Blob([conteudo], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const ancora = document.createElement("a");
  ancora.href = url;
  ancora.download = nomeArquivo;
  document.body.appendChild(ancora);
  ancora.click();
  document.body.removeChild(ancora);
  URL.revokeObjectURL(url);
}

function mensagemBulk(params: { registros: RegistroSaiposVinculado[]; motivo: string }): string {
  if (params.registros.length === 0) return "Selecione explicitamente os itens que devem entrar na fila de vínculo.";
  if (!registrosCompativeisParaAcaoColetiva(params.registros)) {
    return "A ação coletiva só aceita itens selecionados, compatíveis e com necessidade explícita de vínculo.";
  }
  if (params.registros.length > 1 && !params.motivo.trim()) {
    return "Informe um motivo explícito para o vínculo coletivo muitos-para-um.";
  }
  return "";
}

export default function IntegracaoSaiposPage() {
  const db = useDB();
  const repo = useMemo(() => criarSaiposBindingsRepositoryLocal(), []);
  const inputRef = useRef<HTMLInputElement>(null);

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [resultado, setResultado] = useState<AnaliseSaiposResultado>(criarAnaliseSaiposVazia());
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "PRATO" | "COMPLEMENTO">("todos");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativo" | "inativo">("todos");
  const [filtroWorkflow, setFiltroWorkflow] = useState<FiltroWorkflow>("todos");
  const [filtroOutcome, setFiltroOutcome] = useState<FiltroOutcome>("todos");
  const [pagina, setPagina] = useState(1);

  const [estadoBindings, setEstadoBindings] = useState<SaiposBindingsState>(criarEstadoBindingsSaiposVazio());
  const [rascunhos, setRascunhos] = useState<Record<string, RascunhoLinha>>({});
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});
  const [classificacaoLote, setClassificacaoLote] = useState<ClassificacaoFuturaSaipos>("NÃO CLASSIFICADO");
  const [entidadeLoteId, setEntidadeLoteId] = useState("");
  const [motivoLote, setMotivoLote] = useState("");

  useEffect(() => {
    setEstadoBindings(repo.carregar());
  }, [repo]);

  const entidadesInternas = useMemo<EntidadeInternaSaipos[]>(() => {
    const receitas = (db.fichas_tecnicas_receitas ?? []).map<EntidadeInternaSaipos>((receita) => ({
      internal_uuid: receita.id,
      internal_type: receita.tipo === "prato" ? "PRATO" : "OUTRO",
      nome: receita.nome,
      status: receita.versao_vigente_id ? "ATIVO" : "RASCUNHO",
    }));

    const produtos = db.produtos.map<EntidadeInternaSaipos>((produto) => ({
      internal_uuid: produto.id,
      internal_type: produto.tipo === "comprado" ? "INSUMO" : "OUTRO",
      nome: produto.nome,
      status: produto.ativo ? "ATIVO" : "INATIVO",
    }));

    return [...receitas, ...produtos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [db.fichas_tecnicas_receitas, db.produtos]);

  const entidadesPorId = useMemo(() => new Map(entidadesInternas.map((entidade) => [entidade.internal_uuid, entidade])), [entidadesInternas]);

  useEffect(() => {
    if (!resultado.sucesso) return;
    setEstadoBindings(
      repo.carregar({
        registros: resultado.registros,
        entidades: entidadesInternas,
        contexto_importacao: SAIPOS_IMPORT_CONTEXT_DEFAULT,
      })
    );
  }, [entidadesInternas, repo, resultado]);

  const selectedKeys = useMemo(() => Object.keys(selecionados).filter((key) => selecionados[key]), [selecionados]);

  const registros = useMemo<RegistroSaiposVinculado[]>(() => {
    const base = resultado.sucesso ? resultado.registros : [];
    return executarMatchingSaipos({
      registros: base,
      state: estadoBindings,
      entidades: entidadesInternas,
      contexto_importacao: SAIPOS_IMPORT_CONTEXT_DEFAULT,
      selected_external_keys: selectedKeys,
    });
  }, [resultado, estadoBindings, entidadesInternas, selectedKeys]);

  const painel = useMemo(() => calcularPainelMatchingSaipos(registros), [registros]);
  const categorias = useMemo(() => Array.from(new Set(registros.map((registro) => registro.categoria).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")), [registros]);

  function resetarPagina() {
    setPagina(1);
  }

  function classificacaoEfetiva(registro: RegistroSaiposVinculado): ClassificacaoFuturaSaipos {
    return rascunhos[registro.external_key]?.classificacao_futura ?? registro.binding?.classificacao_futura ?? registro.classificacao_futura;
  }

  function entidadeEfetivaId(registro: RegistroSaiposVinculado): string {
    return rascunhos[registro.external_key]?.entidade_interna_id ?? registro.binding?.matched_internal_uuid ?? registro.matching_result.selected_candidate?.internal_uuid ?? "";
  }

  function atualizarRascunho(registro: RegistroSaiposVinculado, patch: Partial<RascunhoLinha>) {
    setRascunhos((atual) => ({
      ...atual,
      [registro.external_key]: {
        ...atual[registro.external_key],
        classificacao_futura: classificacaoEfetiva(registro),
        entidade_interna_id: entidadeEfetivaId(registro),
        ...patch,
      },
    }));
  }

  function limparRascunho(externalKey: string) {
    setRascunhos((atual) => {
      if (!atual[externalKey]) return atual;
      const next = { ...atual };
      delete next[externalKey];
      return next;
    });
  }

  function toggleSelecionado(externalKey: string, ativo: boolean) {
    setSelecionados((atual) => ({ ...atual, [externalKey]: ativo }));
  }

  function selecionarArquivoSelecionado(selecionado?: File | null) {
    if (!selecionado) return;
    const erroValidacao = validarArquivoSaiposLocal({ name: selecionado.name, size: selecionado.size });
    if (erroValidacao) {
      setErro(erroValidacao);
      setArquivo(null);
      setResultado(criarAnaliseSaiposVazia());
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setArquivo(selecionado);
    setErro(null);
    setResultado(criarAnaliseSaiposVazia());
    setRascunhos({});
    setSelecionados({});
    setMotivoLote("");
    resetarPagina();
  }

  async function analisarArquivoSelecionado() {
    if (!arquivo) return;
    setAnalisando(true);
    setErro(null);
    try {
      const buffer = await arquivo.arrayBuffer();
      const analise = analisarPlanilhaSaipos(buffer);
      setResultado(analise);
      setRascunhos({});
      setSelecionados({});
      setMotivoLote("");
      resetarPagina();
      if (!analise.sucesso) setErro(analise.erro);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível analisar o arquivo. Verifique se o Excel não está corrompido.");
      setResultado(criarAnaliseSaiposVazia());
      setRascunhos({});
      setSelecionados({});
    } finally {
      setAnalisando(false);
    }
  }

  function descartarAnalise() {
    setArquivo(null);
    setResultado(criarAnaliseSaiposVazia());
    setErro(null);
    setBusca("");
    setFiltroTipo("todos");
    setFiltroCategoria("todas");
    setFiltroStatus("todos");
    setFiltroWorkflow("todos");
    setFiltroOutcome("todos");
    setPagina(1);
    setArrastando(false);
    setRascunhos({});
    setSelecionados({});
    setMotivoLote("");
    if (inputRef.current) inputRef.current.value = "";
  }

  const filtrados = useMemo(() => {
    const buscaNormalizada = busca.trim().toLowerCase();
    return registros.filter((registro) => {
      if (filtroTipo !== "todos" && registro.tipo !== filtroTipo) return false;
      if (filtroCategoria !== "todas" && registro.categoria !== filtroCategoria) return false;
      if (filtroStatus === "ativo" && !registro.ativo) return false;
      if (filtroStatus === "inativo" && registro.ativo) return false;
      if (filtroWorkflow !== "todos" && registro.workflow_state !== filtroWorkflow) return false;
      if (filtroOutcome !== "todos" && registro.matching_result.outcome !== filtroOutcome) return false;

      if (!buscaNormalizada) return true;
      const entidadeNome = entidadeEfetivaId(registro) ? entidadesPorId.get(entidadeEfetivaId(registro))?.nome ?? "" : "";
      const alvo = `${registro.codigo_completo} ${registro.descricao} ${registro.nome_canonico} ${registro.matching_result.reason} ${entidadeNome}`.toLowerCase();
      return alvo.includes(buscaNormalizada);
    });
  }, [busca, entidadesPorId, filtroCategoria, filtroOutcome, filtroStatus, filtroTipo, filtroWorkflow, registros]);

  const registrosSelecionados = useMemo(() => registros.filter((registro) => selectedKeys.includes(registro.external_key)), [registros, selectedKeys]);
  const entidadeLote = entidadeLoteId ? entidadesPorId.get(entidadeLoteId) ?? null : null;
  const previewColetivo = useMemo(
    () => gerarPreviewAcaoColetivaSaipos({ registros, selected_keys: selectedKeys, entidade: entidadeLote }),
    [entidadeLote, registros, selectedKeys]
  );
  const mensagemColetiva = mensagemBulk({ registros: registrosSelecionados, motivo: motivoLote });

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / TAMANHO_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const registrosPagina = filtrados.slice((paginaAtual - 1) * TAMANHO_PAGINA, paginaAtual * TAMANHO_PAGINA);

  function confirmarRegistro(registro: RegistroSaiposVinculado) {
    if (!registro.link_requirement_policy.selected_for_binding) {
      setErro("Selecione explicitamente o item antes de confirmá-lo para vínculo interno.");
      return;
    }
    const entidade = entidadesPorId.get(entidadeEfetivaId(registro)) ?? null;
    if (!entidade) {
      setErro("Selecione uma entidade interna real antes de confirmar manualmente o vínculo.");
      return;
    }
    if (!window.confirm(`Confirmar vínculo manual para ${registro.codigo_completo}?`)) return;

    const binding = criarBindingManualSaipos({
      registro,
      classificacao_futura: classificacaoEfetiva(registro),
      entidade,
      actor: ACTOR_LOCAL,
      reason: "Confirmação manual após seleção explícita para fila de vínculo.",
      link_requirement_policy: {
        ...registro.link_requirement_policy,
        selected_for_binding: true,
      },
    });
    setEstadoBindings(
      repo.salvar(binding, {
        registros: resultado.sucesso ? resultado.registros : [],
        entidades: entidadesInternas,
        contexto_importacao: SAIPOS_IMPORT_CONTEXT_DEFAULT,
      })
    );
    limparRascunho(registro.external_key);
    toggleSelecionado(registro.external_key, false);
  }

  function ignorarRegistro(registro: RegistroSaiposVinculado) {
    if (!window.confirm(`Ignorar ${registro.codigo_completo} na fila de vínculos?`)) return;
    const binding = criarBindingManualSaipos({
      registro,
      classificacao_futura: classificacaoEfetiva(registro),
      entidade: null,
      actor: ACTOR_LOCAL,
      workflow_state: "IGNORADO",
      reason: "Ignorado manualmente pelo operador.",
      link_requirement_policy: {
        ...registro.link_requirement_policy,
        selected_for_binding: false,
      },
    });
    setEstadoBindings(
      repo.salvar(binding, {
        registros: resultado.sucesso ? resultado.registros : [],
        entidades: entidadesInternas,
        contexto_importacao: SAIPOS_IMPORT_CONTEXT_DEFAULT,
      })
    );
    limparRascunho(registro.external_key);
    toggleSelecionado(registro.external_key, false);
  }

  function limparDecisao(registro: RegistroSaiposVinculado) {
    if (!window.confirm(`Remover decisão persistida para ${registro.codigo_completo}?`)) return;
    setEstadoBindings(
      repo.removerOuInativar(registro.external_key, ACTOR_LOCAL, {
        registros: resultado.sucesso ? resultado.registros : [],
        entidades: entidadesInternas,
        contexto_importacao: SAIPOS_IMPORT_CONTEXT_DEFAULT,
      })
    );
    limparRascunho(registro.external_key);
  }

  function confirmarSelecionados() {
    if (mensagemColetiva) {
      setErro(mensagemColetiva);
      return;
    }
    if (!entidadeLote) {
      setErro("Selecione uma entidade interna real para a ação coletiva.");
      return;
    }
    if (!window.confirm(`Confirmar ação coletiva em ${registrosSelecionados.length} item(ns) explicitamente selecionado(s)?`)) return;

    const resultadoBulk = aplicarAcaoColetivaSaipos({
      registros,
      selected_keys: selectedKeys,
      state: estadoBindings,
      classificacao_futura: classificacaoLote,
      entidade: entidadeLote,
      actor: ACTOR_LOCAL,
      reason: motivoLote,
    });
    setEstadoBindings(resultadoBulk.state);
    setSelecionados({});
    setRascunhos({});
    setMotivoLote("");
  }

  function exportarBackup() {
    const nome = `backup-saipos-bindings-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    baixarTexto(
      nome,
      repo.exportarBackup({
        registros: resultado.sucesso ? resultado.registros : [],
        entidades: entidadesInternas,
        contexto_importacao: SAIPOS_IMPORT_CONTEXT_DEFAULT,
      })
    );
  }

  return (
    <div className="space-y-5">
      <TituloPagina
        titulo="Integração Saipos"
        subtitulo="Catálogo externo bootstrapado por Excel, com correspondência conservadora e fila de vínculo apenas quando houver necessidade explícita ou exceção operacional."
        acao={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secundario" onClick={descartarAnalise}>
              <RotateCcw className="h-4 w-4" /> Descartar análise
            </button>
            <button className="btn-secundario" onClick={exportarBackup}>
              <Save className="h-4 w-4" /> Exportar backup
            </button>
            <button className="btn-primario" onClick={analisarArquivoSelecionado} disabled={!arquivo || analisando}>
              <Download className="h-4 w-4" /> {analisando ? "Analisando..." : "Analisar arquivo"}
            </button>
          </div>
        }
      />

      <Card className={`space-y-3 border-dashed ${arrastando ? "border-primaria bg-primaria-clara/30" : "border-stone-200 bg-stone-50/60"}`}>
        <div
          className="rounded-card border border-dashed border-stone-300 bg-white px-4 py-6 text-center"
          onDragEnter={(event) => {
            event.preventDefault();
            setArrastando(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setArrastando(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setArrastando(false);
            selecionarArquivoSelecionado(event.dataTransfer.files?.[0] ?? null);
          }}
        >
          <FileSpreadsheet className="mx-auto h-10 w-10 text-primaria-escura" />
          <p className="mt-3 text-base font-semibold text-stone-900">Arraste e solte o Excel do Saipos</p>
          <p className="mt-1 text-sm text-stone-600">O Excel apenas povoa o catálogo externo. Vínculos internos são exigidos somente por política explícita e conservadora.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <label className="btn-secundario cursor-pointer">
              <Upload className="h-4 w-4" /> Selecionar arquivo
              <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={(event) => selecionarArquivoSelecionado(event.target.files?.[0] ?? null)} />
            </label>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="rotulo">Arquivo</p>
            <p className="font-semibold text-stone-900">{arquivo?.name ?? "Nenhum arquivo selecionado"}</p>
          </div>
          <div>
            <p className="rotulo">Tamanho</p>
            <p className="font-semibold text-stone-900">{arquivo ? formatarTamanho(arquivo.size) : "—"}</p>
          </div>
          <div>
            <p className="rotulo">Contexto externo</p>
            <p className="font-semibold text-stone-900">{SAIPOS_IMPORT_CONTEXT_DEFAULT.environment} / {SAIPOS_IMPORT_CONTEXT_DEFAULT.ingestion_source} / {SAIPOS_IMPORT_CONTEXT_DEFAULT.unidade_id}</p>
          </div>
          <div>
            <p className="rotulo">Persistência atual</p>
            <p className="font-semibold text-stone-900">Adapter temporário versionado</p>
          </div>
        </div>

        <p className="text-sm text-stone-600">
          Colunas obrigatórias: {COLUNAS_SAIPOS_OBRIGATORIAS.join(", ")}. Limites: somente .xlsx, até {Math.round(SAIPOS_MAX_BYTES_ARQUIVO / (1024 * 1024))} MB e {SAIPOS_MAX_REGISTROS} registros.
        </p>
      </Card>

      {erro && (
        <div className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mr-2 inline h-4 w-4" /> {erro}
        </div>
      )}

      {estadoBindings.migration.from_version !== null && (
        <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Migração local detectada: {estadoBindings.migration.migrated_bindings} vínculo(s) migrado(s). Pendências preservadas: {estadoBindings.migration.pending_legacy.length}.
        </div>
      )}

      {resultado.sucesso ? (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <StatCard rotulo="Total importado" valor={painel.total_importado} cor="cinza" />
            <StatCard rotulo="Catálogo externo disponível" valor={painel.catalogo_externo_disponivel} cor="cinza" />
            <StatCard rotulo="Sem necessidade atual de vínculo" valor={painel.itens_sem_necessidade_atual_de_vinculo} cor="verde" />
            <StatCard rotulo="Vínculos necessários" valor={painel.vinculos_necessarios} cor="laranja" />
            <StatCard rotulo="Pendências humanas reais" valor={painel.pendencias_humanas_reais} cor="vermelho" />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <StatCard rotulo="Automáticos seguros" valor={painel.automaticos_seguros} cor="verde" />
            <StatCard rotulo="Prováveis" valor={painel.provaveis} cor="laranja" />
            <StatCard rotulo="Conflitos" valor={painel.conflitos} cor="vermelho" />
            <StatCard rotulo="Novos" valor={painel.novos} cor="amarelo" />
            <StatCard rotulo="Confirmados" valor={painel.confirmados} cor="verde" />
            <StatCard rotulo="Ignorados" valor={painel.ignorados} cor="cinza" />
          </div>

          <Card className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-stone-900">Catálogo externo e fila de vínculos</h2>
                <p className="text-sm text-stone-600">Os 1.000 itens podem existir no catálogo externo sem vínculo imediato. Só entram na fila humana quando houver necessidade explícita de operação interna.</p>
              </div>
              <Badge cor={painel.pendencias_humanas_reais > 0 ? "laranja" : "verde"}>
                {painel.pendencias_humanas_reais > 0 ? `${painel.pendencias_humanas_reais} pendências humanas reais` : "Sem pendências humanas reais"}
              </Badge>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_240px_240px_220px_220px_220px]">
              <label className="block">
                <span className="rotulo mb-1 block">Busca por código, nome, regra ou vínculo</span>
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input className="campo pl-9" value={busca} onChange={(event) => { setBusca(event.target.value); resetarPagina(); }} placeholder="Ex.: 11215965, risoto, conflito" />
                </div>
              </label>

              <Campo rotulo="Workflow">
                <select className="campo" value={filtroWorkflow} onChange={(event) => { setFiltroWorkflow(event.target.value as FiltroWorkflow); resetarPagina(); }}>
                  <option value="todos">Todos</option>
                  <option value="IMPORTADO_SEM_NECESSIDADE_DE_VINCULO">Sem necessidade atual</option>
                  <option value="VINCULO_NECESSARIO">Vínculo necessário</option>
                  <option value="PROVAVEL_REVISAO">Provável para revisão</option>
                  <option value="CONFLITO">Conflito</option>
                  <option value="CONFIRMADO">Confirmado</option>
                  <option value="IGNORADO">Ignorado</option>
                </select>
              </Campo>

              <Campo rotulo="Resultado de matching">
                <select className="campo" value={filtroOutcome} onChange={(event) => { setFiltroOutcome(event.target.value as FiltroOutcome); resetarPagina(); }}>
                  <option value="todos">Todos</option>
                  <option value="AUTO_SEGURO">Automático seguro</option>
                  <option value="PROVAVEL_REVISAO">Provável</option>
                  <option value="CONFLITO">Conflito</option>
                  <option value="NOVO">Novo</option>
                </select>
              </Campo>

              <Campo rotulo="Tipo">
                <select className="campo" value={filtroTipo} onChange={(event) => { setFiltroTipo(event.target.value as typeof filtroTipo); resetarPagina(); }}>
                  <option value="todos">Todos</option>
                  <option value="PRATO">PRATO</option>
                  <option value="COMPLEMENTO">COMPLEMENTO</option>
                </select>
              </Campo>

              <Campo rotulo="Categoria">
                <select className="campo" value={filtroCategoria} onChange={(event) => { setFiltroCategoria(event.target.value); resetarPagina(); }}>
                  <option value="todas">Todas</option>
                  {categorias.map((categoria) => (
                    <option key={categoria} value={categoria}>{categoria}</option>
                  ))}
                </select>
              </Campo>

              <Campo rotulo="Ativo/Inativo">
                <select className="campo" value={filtroStatus} onChange={(event) => { setFiltroStatus(event.target.value as typeof filtroStatus); resetarPagina(); }}>
                  <option value="todos">Todos</option>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </Campo>
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px_320px]">
              <Campo rotulo="Motivo do vínculo coletivo">
                <textarea className="campo min-h-[92px]" value={motivoLote} onChange={(event) => setMotivoLote(event.target.value)} placeholder="Explique por que estes itens devem apontar para a mesma entidade interna e qual a consequência operacional desse vínculo." />
              </Campo>

              <Campo rotulo="Classificação coletiva">
                <select className="campo" value={classificacaoLote} onChange={(event) => setClassificacaoLote(event.target.value as ClassificacaoFuturaSaipos)}>
                  {CLASSIFICACOES_FUTURAS_SAIPOS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </Campo>

              <Campo rotulo="Entidade interna escolhida">
                <select className="campo" value={entidadeLoteId} onChange={(event) => setEntidadeLoteId(event.target.value)}>
                  <option value="">Selecione uma entidade real</option>
                  {entidadesInternas.map((entidade) => (
                    <option key={entidade.internal_uuid} value={entidade.internal_uuid}>{entidade.nome} • {entidade.internal_type} • {entidade.status}</option>
                  ))}
                </select>
              </Campo>
            </div>

            <div>
              <p className="rotulo mb-2 block">Prévia da ação coletiva</p>
              {previewColetivo.length === 0 ? (
                <Vazio mensagem="Nenhum item selecionado para a ação coletiva." />
              ) : (
                <div className="space-y-2 rounded-card border border-stone-200 p-3">
                  {previewColetivo.map((item) => (
                    <div key={item.external_key} className="text-sm text-stone-700">
                      <strong>{item.codigo_completo}</strong> • {item.nome_externo} • {item.entidade_interna_nome ?? "sem entidade"}
                      <div className="text-xs text-stone-500">{item.consequence}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-stone-600">{mensagemColetiva || `${registrosSelecionados.length} item(ns) explicitamente selecionado(s) para eventual vínculo.`}</p>
              <button className="btn-primario" onClick={confirmarSelecionados} disabled={Boolean(mensagemColetiva)}>
                Confirmar selecionados
              </button>
            </div>
          </Card>

          <Card className="space-y-3">
            <div className="overflow-x-auto">
              <table className="min-w-[2180px] w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="rotulo px-2 py-2">Marcar vínculo</th>
                    <th className="rotulo px-2 py-2">Workflow</th>
                    <th className="rotulo px-2 py-2">Matching</th>
                    <th className="rotulo px-2 py-2">Status registro</th>
                    <th className="rotulo px-2 py-2">Código completo</th>
                    <th className="rotulo px-2 py-2">Tipo externo</th>
                    <th className="rotulo px-2 py-2">Nome</th>
                    <th className="rotulo px-2 py-2">Regra</th>
                    <th className="rotulo px-2 py-2">Confiança</th>
                    <th className="rotulo px-2 py-2">Preço</th>
                    <th className="rotulo px-2 py-2">Classificação</th>
                    <th className="rotulo px-2 py-2">Entidade interna</th>
                    <th className="rotulo px-2 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {registrosPagina.map((registro) => {
                    const entidadeAtualId = entidadeEfetivaId(registro);
                    const entidadeAtual = entidadeAtualId ? entidadesPorId.get(entidadeAtualId) ?? null : null;
                    const canConfirm = registro.workflow_state !== "IMPORTADO_SEM_NECESSIDADE_DE_VINCULO" && registro.workflow_state !== "IGNORADO" && !!entidadeAtual;
                    const canSelect = registro.workflow_state !== "CONFIRMADO" && registro.workflow_state !== "IGNORADO";

                    return (
                      <tr key={registro.external_key}>
                        <td className="px-2 py-2">
                          <input type="checkbox" checked={Boolean(selecionados[registro.external_key])} disabled={!canSelect} onChange={(event) => toggleSelecionado(registro.external_key, event.target.checked)} />
                        </td>
                        <td className="px-2 py-2"><Badge cor={corWorkflow(registro.workflow_state)}>{rotuloWorkflow(registro.workflow_state)}</Badge></td>
                        <td className="px-2 py-2"><Badge cor={corOutcome(registro.matching_result.outcome)}>{rotuloOutcome(registro.matching_result.outcome)}</Badge></td>
                        <td className="px-2 py-2"><Badge cor={statusRegistro(registro)}>{registro.indicador === "CONFLITO" ? "Conflito" : registro.indicador === "AVISO" ? "Aviso" : "Válido"}</Badge></td>
                        <td className="px-2 py-2 font-mono text-xs break-all">{registro.codigo_completo || "—"}</td>
                        <td className="px-2 py-2">{inferirTipoEntidadeExterna(registro)}</td>
                        <td className="px-2 py-2">
                          <p className="font-medium text-stone-900">{registro.nome_canonico || registro.descricao || "—"}</p>
                          <p className="text-xs text-stone-600">{registro.matching_result.reason}</p>
                        </td>
                        <td className="px-2 py-2 text-xs text-stone-700">{registro.matching_result.rule_id}</td>
                        <td className="px-2 py-2">{registro.matching_result.confidence_score}</td>
                        <td className="px-2 py-2">{moedaCentavos(registro.preco_centavos)}</td>
                        <td className="px-2 py-2">
                          <select className="campo min-w-[220px]" value={classificacaoEfetiva(registro)} onChange={(event) => atualizarRascunho(registro, { classificacao_futura: event.target.value as ClassificacaoFuturaSaipos })}>
                            {CLASSIFICACOES_FUTURAS_SAIPOS.map((item) => (
                              <option key={item} value={item}>{item}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <select className="campo min-w-[320px]" value={entidadeAtualId} onChange={(event) => atualizarRascunho(registro, { entidade_interna_id: event.target.value })}>
                            <option value="">Sem vínculo confirmado</option>
                            {entidadesInternas.map((entidade) => (
                              <option key={entidade.internal_uuid} value={entidade.internal_uuid}>{entidade.nome} • {entidade.internal_type} • {entidade.status}</option>
                            ))}
                          </select>
                          {registro.matching_result.candidates.length > 0 && (
                            <p className="mt-1 text-xs text-stone-500">Top candidato: {registro.matching_result.candidates[0].entidade.nome}</p>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-2">
                            <button className="btn-primario" onClick={() => confirmarRegistro(registro)} disabled={!canConfirm}>Confirmar</button>
                            <button className="btn-secundario" onClick={() => ignorarRegistro(registro)} disabled={registro.workflow_state === "CONFIRMADO"}>Ignorar</button>
                            <button className="btn-secundario" onClick={() => limparDecisao(registro)} disabled={!registro.binding}>Limpar</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {registrosPagina.length === 0 && <Vazio mensagem="Nenhum item encontrado com os filtros atuais." />}

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600">
              <p>
                Mostrando {registrosPagina.length === 0 ? 0 : (paginaAtual - 1) * TAMANHO_PAGINA + 1} a {Math.min(paginaAtual * TAMANHO_PAGINA, filtrados.length)} de {filtrados.length}
              </p>
              <div className="flex gap-2">
                <button className="btn-secundario" disabled={paginaAtual <= 1} onClick={() => setPagina((atual) => Math.max(1, atual - 1))}>Anterior</button>
                <button className="btn-secundario" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina((atual) => Math.min(totalPaginas, atual + 1))}>Próxima</button>
              </div>
            </div>
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-900">Histórico estruturado</h2>
              <Badge cor="cinza">{estadoBindings.history.length} eventos</Badge>
            </div>
            {estadoBindings.history.length === 0 ? (
              <Vazio mensagem="Nenhuma decisão persistida ainda." />
            ) : (
              <ul className="space-y-2">
                {estadoBindings.history.slice(0, 25).map((evento) => (
                  <li key={evento.id} className="rounded-card border border-stone-200 px-3 py-2 text-sm">
                    <p className="font-semibold text-stone-900">{evento.action} • {evento.external_key}</p>
                    <p className="text-stone-700">{evento.reason}</p>
                    <p className="text-xs text-stone-500">Regra: {evento.rule_id} • Origem: {evento.decision_source} • Autor: {evento.actor}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : (
        <Vazio mensagem="Selecione um arquivo .xlsx para carregar o catálogo externo do Saipos e revisar vínculos apenas quando necessário." />
      )}
    </div>
  );
}