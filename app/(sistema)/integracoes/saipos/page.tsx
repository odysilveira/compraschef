"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Download, FileSpreadsheet, RotateCcw, Save, Search, Upload } from "lucide-react";
import { Badge, Card, Campo, StatCard, TituloPagina, Vazio } from "@/components/ui";
import { produtosReais } from "@/lib/data/catalogo";
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
import {
  aplicarDecisoesNosRegistros,
  calcularProgressoSaipos,
  criarEstadoDecisoesVazio,
  exportarBackupDecisoesSaipos,
  parseEstadoDecisoesSaipos,
  removerDecisaoSaipos,
  salvarDecisaoSaipos,
  type EntidadeInternaSaipos,
  type EstadoDecisoesSaipos,
  type RegistroSaiposComDecisao,
} from "@/lib/domain/integracoes-saipos-vinculos";

const TAMANHO_PAGINA = 20;
const STORAGE_DECISOES = "integracao-saipos:decisoes:v1";

type StatusDecisaoLinha = "sem-decisao" | "pendente" | "confirmado";

interface RascunhoLinha {
  classificacao_futura: ClassificacaoFuturaSaipos;
  entidade_interna_id: string | null;
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

function statusCorLinha(status: StatusDecisaoLinha): "cinza" | "laranja" | "verde" {
  if (status === "confirmado") return "verde";
  if (status === "pendente") return "laranja";
  return "cinza";
}

function statusRotuloLinha(status: StatusDecisaoLinha): string {
  if (status === "confirmado") return "Confirmado";
  if (status === "pendente") return "Pendente";
  return "Sem decisão";
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

export default function IntegracaoSaiposPage() {
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
  const [filtroDecisao, setFiltroDecisao] = useState<"todos" | "sem-decisao" | "pendente" | "confirmado">("todos");
  const [pagina, setPagina] = useState(1);

  const [estadoDecisoes, setEstadoDecisoes] = useState<EstadoDecisoesSaipos>(criarEstadoDecisoesVazio());
  const [rascunhos, setRascunhos] = useState<Record<string, RascunhoLinha>>({});

  const [classificacaoLote, setClassificacaoLote] = useState<ClassificacaoFuturaSaipos>("NÃO CLASSIFICADO");
  const [entidadeLoteId, setEntidadeLoteId] = useState<string>("");

  useEffect(() => {
    try {
      const bruto = localStorage.getItem(STORAGE_DECISOES);
      if (!bruto) return;
      const parsed = JSON.parse(bruto) as unknown;
      setEstadoDecisoes(parseEstadoDecisoesSaipos(parsed));
    } catch {
      setEstadoDecisoes(criarEstadoDecisoesVazio());
    }
  }, []);

  const entidadesInternas = useMemo<EntidadeInternaSaipos[]>(() => {
    return produtosReais()
      .map((produto) => ({ id: produto.id, nome: produto.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, []);

  const entidadesPorId = useMemo(() => {
    return new Map(entidadesInternas.map((item) => [item.id, item]));
  }, [entidadesInternas]);

  const registros = useMemo<RegistroSaiposComDecisao[]>(() => {
    const base = resultado.sucesso ? resultado.registros : [];
    return aplicarDecisoesNosRegistros(base, estadoDecisoes, entidadesInternas);
  }, [resultado, estadoDecisoes, entidadesInternas]);

  const categorias = useMemo(() => {
    return Array.from(new Set(registros.map((registro) => registro.categoria).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [registros]);

  function classificacaoEfetiva(registro: RegistroSaiposComDecisao): ClassificacaoFuturaSaipos {
    const codigo = registro.codigo_completo.trim();
    const rascunho = codigo ? rascunhos[codigo] : undefined;
    if (rascunho) return rascunho.classificacao_futura;
    return registro.decisao?.classificacao_futura ?? registro.classificacao_futura;
  }

  function entidadeEfetivaId(registro: RegistroSaiposComDecisao): string {
    const codigo = registro.codigo_completo.trim();
    const rascunho = codigo ? rascunhos[codigo] : undefined;
    if (rascunho) return rascunho.entidade_interna_id ?? "";
    return registro.decisao?.entidade_interna_id ?? "";
  }

  function statusDecisaoLinha(registro: RegistroSaiposComDecisao): StatusDecisaoLinha {
    const codigo = registro.codigo_completo.trim();
    if (!codigo) return "sem-decisao";

    const rascunho = rascunhos[codigo];
    if (!rascunho) {
      return registro.decisao ? "confirmado" : "sem-decisao";
    }

    if (!registro.decisao) return "pendente";

    const mudouClassificacao = registro.decisao.classificacao_futura !== rascunho.classificacao_futura;
    const mudouEntidade = (registro.decisao.entidade_interna_id ?? "") !== (rascunho.entidade_interna_id ?? "");
    if (mudouClassificacao || mudouEntidade) return "pendente";
    return "confirmado";
  }

  const filtrados = useMemo(() => {
    const buscaNormalizada = busca.trim().toLowerCase();
    return registros.filter((registro) => {
      if (filtroTipo !== "todos" && registro.tipo !== filtroTipo) return false;
      if (filtroCategoria !== "todas" && registro.categoria !== filtroCategoria) return false;
      if (filtroStatus === "ativo" && !registro.ativo) return false;
      if (filtroStatus === "inativo" && registro.ativo) return false;

      const statusDecisao = statusDecisaoLinha(registro);
      if (filtroDecisao !== "todos" && statusDecisao !== filtroDecisao) return false;

      if (!buscaNormalizada) return true;
      const entidadeId = entidadeEfetivaId(registro);
      const entidadeNome = entidadeId ? entidadesPorId.get(entidadeId)?.nome ?? "" : "";
      const alvo = `${registro.codigo_completo} ${registro.descricao} ${registro.complemento} ${registro.nome_canonico} ${entidadeNome}`.toLowerCase();
      return alvo.includes(buscaNormalizada);
    });
  }, [busca, entidadesPorId, filtroCategoria, filtroDecisao, filtroStatus, filtroTipo, registros]);

  const progresso = useMemo(() => calcularProgressoSaipos(registros), [registros]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / TAMANHO_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const registrosPagina = filtrados.slice((paginaAtual - 1) * TAMANHO_PAGINA, paginaAtual * TAMANHO_PAGINA);

  function resetarPagina() {
    setPagina(1);
  }

  function persistirEstado(novo: EstadoDecisoesSaipos) {
    setEstadoDecisoes(novo);
    localStorage.setItem(STORAGE_DECISOES, JSON.stringify(novo));
  }

  function atualizarRascunho(codigo: string, patch: Partial<RascunhoLinha>, fallback: RascunhoLinha) {
    if (!codigo) return;
    setRascunhos((atual) => {
      const anterior = atual[codigo] ?? fallback;
      return {
        ...atual,
        [codigo]: {
          ...anterior,
          ...patch,
        },
      };
    });
  }

  function limparRascunho(codigo: string) {
    setRascunhos((atual) => {
      if (!atual[codigo]) return atual;
      const novo = { ...atual };
      delete novo[codigo];
      return novo;
    });
  }

  function selecionarArquivoSelecionado(selecionado?: File | null) {
    if (!selecionado) return;
    const erroValidacao = validarArquivoSaiposLocal({ name: selecionado.name, size: selecionado.size });
    if (erroValidacao) {
      setErro(erroValidacao);
      setArquivo(null);
      setResultado(criarAnaliseSaiposVazia());
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      return;
    }
    setArquivo(selecionado);
    setErro(null);
    setResultado(criarAnaliseSaiposVazia());
    setRascunhos({});
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
      resetarPagina();
      if (!analise.sucesso) {
        setErro(analise.erro);
      }
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível analisar o arquivo. Verifique se o Excel não está corrompido.");
      setResultado(criarAnaliseSaiposVazia());
      setRascunhos({});
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
    setFiltroDecisao("todos");
    setPagina(1);
    setArrastando(false);
    setRascunhos({});
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function confirmarDecisaoIndividual(registro: RegistroSaiposComDecisao) {
    const codigo = registro.codigo_completo.trim();
    if (!codigo) return;

    const draft = rascunhos[codigo];
    const classificacao = draft?.classificacao_futura ?? registro.decisao?.classificacao_futura ?? registro.classificacao_futura;
    const entidadeId = draft?.entidade_interna_id ?? registro.decisao?.entidade_interna_id ?? null;
    const entidade = entidadeId ? entidadesPorId.get(entidadeId) ?? null : null;

    const ok = window.confirm(`Confirmar decisão manual para ${codigo}?`);
    if (!ok) return;

    const proximo = salvarDecisaoSaipos(estadoDecisoes, {
      codigo_completo: codigo,
      classificacao_futura: classificacao,
      entidade_interna: entidade,
      origem: "manual-individual",
    });

    persistirEstado(proximo);
    limparRascunho(codigo);
  }

  function removerDecisaoIndividual(registro: RegistroSaiposComDecisao) {
    const codigo = registro.codigo_completo.trim();
    if (!codigo) return;
    const ok = window.confirm(`Remover decisão confirmada para ${codigo}?`);
    if (!ok) return;

    const proximo = removerDecisaoSaipos(estadoDecisoes, codigo, "manual-ajuste");
    persistirEstado(proximo);
    limparRascunho(codigo);
  }

  function aplicarSugestao(registro: RegistroSaiposComDecisao) {
    if (!registro.sugestao_entidade) return;
    const codigo = registro.codigo_completo.trim();
    if (!codigo) return;

    atualizarRascunho(
      codigo,
      { entidade_interna_id: registro.sugestao_entidade.id },
      {
        classificacao_futura: classificacaoEfetiva(registro),
        entidade_interna_id: entidadeEfetivaId(registro) || null,
      }
    );
  }

  function confirmarLoteFiltrado() {
    if (!resultado.sucesso) return;
    const codigos = filtrados.map((item) => item.codigo_completo.trim()).filter(Boolean);
    if (codigos.length === 0) {
      setErro("Nenhum registro filtrado com código completo para confirmação coletiva.");
      return;
    }

    const entidade = entidadeLoteId ? entidadesPorId.get(entidadeLoteId) ?? null : null;

    const ok = window.confirm(`Confirmar classificação coletiva em ${codigos.length} registros filtrados?`);
    if (!ok) return;

    let proximo = estadoDecisoes;
    for (const codigo of codigos) {
      proximo = salvarDecisaoSaipos(proximo, {
        codigo_completo: codigo,
        classificacao_futura: classificacaoLote,
        entidade_interna: entidade,
        origem: "manual-coletiva",
      });
    }

    persistirEstado(proximo);
    setRascunhos({});
  }

  function exportarBackup() {
    const nome = `backup-decisoes-saipos-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    baixarTexto(nome, exportarBackupDecisoesSaipos(estadoDecisoes));
  }

  const resumo = resultado.resumo;

  return (
    <div className="space-y-5">
      <TituloPagina
        titulo="Integração Saipos"
        subtitulo="ETAPA 2: classificação e vinculação manual com confirmação humana, recuperação por código completo e persistência somente das decisões."
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
            const selecionado = event.dataTransfer.files?.[0];
            if (selecionado) {
              selecionarArquivoSelecionado(selecionado);
            }
          }}
        >
          <FileSpreadsheet className="mx-auto h-10 w-10 text-primaria-escura" />
          <p className="mt-3 text-base font-semibold text-stone-900">Arraste e solte o arquivo Excel aqui</p>
          <p className="mt-1 text-sm text-stone-600">A leitura dos dados é local. Somente decisões confirmadas são persistidas no navegador.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <label className="btn-secundario cursor-pointer">
              <Upload className="h-4 w-4" /> Selecionar arquivo
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(event) => selecionarArquivoSelecionado(event.target.files?.[0] ?? null)}
              />
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
            <p className="rotulo">Leitura</p>
            <p className="font-semibold text-stone-900">Somente no navegador</p>
          </div>
          <div>
            <p className="rotulo">Persistência</p>
            <p className="font-semibold text-stone-900">Somente decisões confirmadas</p>
          </div>
        </div>

        <p className="text-sm text-stone-600">
          Colunas obrigatórias: {COLUNAS_SAIPOS_OBRIGATORIAS.join(", ")}. Limites: somente .xlsx, até {Math.round(SAIPOS_MAX_BYTES_ARQUIVO / (1024 * 1024))} MB e {SAIPOS_MAX_REGISTROS} registros.
        </p>
      </Card>

      {erro && (
        <div className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mr-2 inline h-4 w-4" />
          {erro}
        </div>
      )}

      {resultado.sucesso ? (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <StatCard rotulo="Total de registros" valor={resumo.total_registros} cor="cinza" />
            <StatCard rotulo="Pratos" valor={resumo.pratos} cor="verde" />
            <StatCard rotulo="Complementos" valor={resumo.complementos} cor="amarelo" />
            <StatCard rotulo="Ativos / Inativos" valor={`${resumo.ativos} / ${resumo.inativos}`} cor="amarelo" />
            <StatCard rotulo="Conflitos" valor={resumo.registros_com_conflito} cor="vermelho" />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <StatCard rotulo="Com decisão" valor={progresso.com_decisao} cor="verde" />
            <StatCard rotulo="Sem decisão" valor={progresso.sem_decisao} cor="laranja" />
            <StatCard rotulo="Com vínculo" valor={progresso.com_vinculo} cor="verde" />
            <StatCard rotulo="Sem vínculo" valor={progresso.sem_vinculo} cor="laranja" />
            <StatCard rotulo="Códigos duplicados (distintos)" valor={resumo.codigos_duplicados_distintos} cor="laranja" />
            <StatCard rotulo="Nomes repetidos (grupos)" valor={resumo.nomes_repetidos_grupos} cor="amarelo" />
          </div>

          <Card className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <Campo rotulo="Classificação coletiva">
                <select className="campo min-w-[260px]" value={classificacaoLote} onChange={(event) => setClassificacaoLote(event.target.value as ClassificacaoFuturaSaipos)}>
                  {CLASSIFICACOES_FUTURAS_SAIPOS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </Campo>

              <Campo rotulo="Vínculo coletivo (opcional)">
                <select className="campo min-w-[320px]" value={entidadeLoteId} onChange={(event) => setEntidadeLoteId(event.target.value)}>
                  <option value="">Sem vínculo</option>
                  {entidadesInternas.map((entidade) => (
                    <option key={entidade.id} value={entidade.id}>{entidade.nome}</option>
                  ))}
                </select>
              </Campo>

              <button className="btn-primario" onClick={confirmarLoteFiltrado}>
                Confirmar classificação coletiva
              </button>
            </div>

            <p className="text-sm text-stone-600">A classificação coletiva atua nos registros atualmente filtrados e só é persistida após confirmação humana.</p>
          </Card>

          <Card className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_220px_220px_220px_220px]">
              <label className="block">
                <span className="rotulo mb-1 block">Busca por código, nome ou vínculo</span>
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input className="campo pl-9" value={busca} onChange={(event) => { setBusca(event.target.value); resetarPagina(); }} placeholder="Ex.: 11215965, lasanha, batata" />
                </div>
              </label>

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

              <Campo rotulo="Decisão">
                <select className="campo" value={filtroDecisao} onChange={(event) => { setFiltroDecisao(event.target.value as typeof filtroDecisao); resetarPagina(); }}>
                  <option value="todos">Todos</option>
                  <option value="sem-decisao">Sem decisão</option>
                  <option value="pendente">Pendente</option>
                  <option value="confirmado">Confirmado</option>
                </select>
              </Campo>
            </div>
          </Card>

          <Card className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-stone-900">Classificação e vinculação manual</h2>
                <p className="text-sm text-stone-600">Sugestões são apenas sugestivas. Nenhum vínculo é confirmado automaticamente.</p>
              </div>
              <Badge cor={progresso.sem_decisao > 0 ? "laranja" : "verde"}>
                {progresso.sem_decisao > 0 ? "Ainda há decisões pendentes" : "Todas as decisões confirmadas"}
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1780px] w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="rotulo px-2 py-2">Status registro</th>
                    <th className="rotulo px-2 py-2">Status decisão</th>
                    <th className="rotulo px-2 py-2">Código completo</th>
                    <th className="rotulo px-2 py-2">Tipo</th>
                    <th className="rotulo px-2 py-2">Descrição</th>
                    <th className="rotulo px-2 py-2">Preço</th>
                    <th className="rotulo px-2 py-2">Classificação</th>
                    <th className="rotulo px-2 py-2">Vínculo interno</th>
                    <th className="rotulo px-2 py-2">Sugestão</th>
                    <th className="rotulo px-2 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {registrosPagina.map((registro) => {
                    const codigo = registro.codigo_completo.trim();
                    const statusDecisao = statusDecisaoLinha(registro);
                    const classificacaoAtual = classificacaoEfetiva(registro);
                    const entidadeAtualId = entidadeEfetivaId(registro);

                    return (
                      <tr key={`${registro.linha_planilha}-${registro.codigo_completo}-${registro.descricao}`}>
                        <td className="px-2 py-2">
                          <Badge cor={statusRegistro(registro)}>
                            {registro.indicador === "CONFLITO" ? "Conflito" : registro.indicador === "AVISO" ? "Aviso" : "Válido"}
                          </Badge>
                        </td>
                        <td className="px-2 py-2">
                          <Badge cor={statusCorLinha(statusDecisao)}>{statusRotuloLinha(statusDecisao)}</Badge>
                        </td>
                        <td className="px-2 py-2 font-mono text-xs break-all">{codigo || "—"}</td>
                        <td className="px-2 py-2 font-semibold">{registro.tipo}</td>
                        <td className="px-2 py-2">
                          <p className="font-medium text-stone-900">{registro.nome_canonico || registro.descricao || "—"}</p>
                          <p className="text-xs text-stone-600">{registro.complemento || "—"}</p>
                        </td>
                        <td className="px-2 py-2">{moedaCentavos(registro.preco_centavos)}</td>
                        <td className="px-2 py-2">
                          <select
                            className="campo min-w-[220px]"
                            value={classificacaoAtual}
                            onChange={(event) => {
                              atualizarRascunho(
                                codigo,
                                { classificacao_futura: event.target.value as ClassificacaoFuturaSaipos },
                                {
                                  classificacao_futura: registro.decisao?.classificacao_futura ?? registro.classificacao_futura,
                                  entidade_interna_id: registro.decisao?.entidade_interna_id ?? null,
                                }
                              );
                            }}
                            disabled={!codigo}
                          >
                            {CLASSIFICACOES_FUTURAS_SAIPOS.map((item) => (
                              <option key={item} value={item}>{item}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <select
                            className="campo min-w-[260px]"
                            value={entidadeAtualId}
                            onChange={(event) => {
                              atualizarRascunho(
                                codigo,
                                { entidade_interna_id: event.target.value || null },
                                {
                                  classificacao_futura: registro.decisao?.classificacao_futura ?? registro.classificacao_futura,
                                  entidade_interna_id: registro.decisao?.entidade_interna_id ?? null,
                                }
                              );
                            }}
                            disabled={!codigo}
                          >
                            <option value="">Sem vínculo</option>
                            {entidadesInternas.map((entidade) => (
                              <option key={entidade.id} value={entidade.id}>{entidade.nome}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          {registro.sugestao_entidade ? (
                            <div className="space-y-1">
                              <p className="text-xs text-stone-700">{registro.sugestao_entidade.nome}</p>
                              <button className="btn-secundario text-xs" onClick={() => aplicarSugestao(registro)} disabled={!codigo}>
                                Usar sugestão
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-stone-500">Sem sugestão</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-2">
                            <button className="btn-primario" onClick={() => confirmarDecisaoIndividual(registro)} disabled={!codigo}>
                              Confirmar
                            </button>
                            <button className="btn-secundario" onClick={() => removerDecisaoIndividual(registro)} disabled={!codigo || !registro.decisao}>
                              Limpar
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {registrosPagina.length === 0 && <Vazio mensagem="Nenhum registro encontrado com os filtros atuais." />}

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
              <h2 className="text-base font-semibold text-stone-900">Histórico das decisões confirmadas</h2>
              <Badge cor="cinza">{estadoDecisoes.historico.length} eventos</Badge>
            </div>

            {estadoDecisoes.historico.length === 0 ? (
              <Vazio mensagem="Nenhuma decisão confirmada ainda." />
            ) : (
              <ul className="space-y-2">
                {estadoDecisoes.historico.slice(0, 25).map((evento) => (
                  <li key={evento.id} className="rounded-card border border-stone-200 px-3 py-2 text-sm">
                    <p className="font-semibold text-stone-900">{evento.codigo_completo}</p>
                    <p className="text-stone-700">{evento.evento}</p>
                    <p className="text-xs text-stone-500">{new Date(evento.timestamp).toLocaleString("pt-BR")} • {evento.origem}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : (
        <Vazio mensagem="Selecione um arquivo .xlsx para gerar a prévia segura e iniciar a classificação/vinculação manual." />
      )}
    </div>
  );
}
