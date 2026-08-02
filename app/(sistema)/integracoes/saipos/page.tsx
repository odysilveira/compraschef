"use client";

import { useMemo, useRef, useState } from "react";
import { AlertCircle, Download, FileSpreadsheet, RotateCcw, Search, Upload } from "lucide-react";
import { Badge, Card, Campo, StatCard, TituloPagina, Vazio } from "@/components/ui";
import {
  analisarPlanilhaSaipos,
  COLUNAS_SAIPOS_OBRIGATORIAS,
  criarAnaliseSaiposVazia,
  SAIPOS_MAX_BYTES_ARQUIVO,
  SAIPOS_MAX_REGISTROS,
  validarArquivoSaiposLocal,
  type AnaliseSaiposResultado,
  type RegistroSaiposPrevisto,
} from "@/lib/domain/integracoes-saipos";

const TAMANHO_PAGINA = 20;

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
  const [pagina, setPagina] = useState(1);

  const registros = resultado.sucesso ? resultado.registros : [];

  const categorias = useMemo(() => {
    return Array.from(new Set(registros.map((registro) => registro.categoria).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [registros]);

  const filtrados = useMemo(() => {
    const buscaNormalizada = busca.trim().toLowerCase();
    return registros.filter((registro) => {
      if (filtroTipo !== "todos" && registro.tipo !== filtroTipo) return false;
      if (filtroCategoria !== "todas" && registro.categoria !== filtroCategoria) return false;
      if (filtroStatus === "ativo" && !registro.ativo) return false;
      if (filtroStatus === "inativo" && registro.ativo) return false;
      if (!buscaNormalizada) return true;
      const alvo = `${registro.codigo_completo} ${registro.descricao} ${registro.complemento}`.toLowerCase();
      return alvo.includes(buscaNormalizada);
    });
  }, [busca, filtroCategoria, filtroStatus, filtroTipo, registros]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / TAMANHO_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const registrosPagina = filtrados.slice((paginaAtual - 1) * TAMANHO_PAGINA, paginaAtual * TAMANHO_PAGINA);

  function resetarPagina() {
    setPagina(1);
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
      resetarPagina();
      if (!analise.sucesso) {
        setErro(analise.erro);
      }
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível analisar o arquivo. Verifique se o Excel não está corrompido.");
      setResultado(criarAnaliseSaiposVazia());
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
    setPagina(1);
    setArrastando(false);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  const resumo = resultado.resumo;

  return (
    <div className="space-y-5">
      <TituloPagina
        titulo="Integração Saipos"
        subtitulo="Leitura local do Excel, validação da estrutura e prévia segura em memória. Nenhum dado é enviado para servidor externo."
        acao={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secundario" onClick={descartarAnalise}>
              <RotateCcw className="h-4 w-4" /> Descartar análise
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
          <p className="mt-1 text-sm text-stone-600">ou selecione um .xlsx no computador. A leitura acontece somente no navegador.</p>
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
            <p className="font-semibold text-stone-900">Nenhum dado é gravado</p>
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
            <StatCard rotulo="Códigos vazios" valor={resumo.codigos_vazios} cor="vermelho" />
            <StatCard rotulo="Códigos duplicados (distintos)" valor={resumo.codigos_duplicados_distintos} cor="laranja" />
            <StatCard rotulo="Registros com código duplicado" valor={resumo.codigos_duplicados_registros_afetados} cor="laranja" />
            <StatCard rotulo="Formato inválido" valor={resumo.codigos_formato_invalido} cor="vermelho" />
            <StatCard rotulo="Grupos de nomes repetidos" valor={resumo.nomes_repetidos_grupos} cor="amarelo" />
            <StatCard rotulo="Registros com nome repetido" valor={resumo.nomes_repetidos_registros_afetados} cor="amarelo" />
            <StatCard rotulo="Complementos sem pai" valor={resumo.complementos_sem_pai} cor="vermelho" />
            <StatCard rotulo="Válidos / Avisos" valor={`${resumo.registros_validos} / ${resumo.registros_com_aviso}`} cor="verde" />
            <StatCard rotulo="Registros com conflito" valor={resumo.registros_com_conflito} cor="vermelho" />
          </div>

          <Card className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_220px_220px_220px]">
              <label className="block">
                <span className="rotulo mb-1 block">Busca por código ou nome</span>
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input className="campo pl-9" value={busca} onChange={(event) => { setBusca(event.target.value); resetarPagina(); }} placeholder="Ex.: 11215965, pizza" />
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
            </div>
          </Card>

          <Card className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-stone-900">Prévia dos registros</h2>
                <p className="text-sm text-stone-600">Registros válidos, avisos e conflitos são exibidos sem importar nada.</p>
              </div>
              <Badge cor={resumo.registros_com_conflito > 0 ? "vermelho" : resumo.registros_com_aviso > 0 ? "laranja" : "verde"}>
                {resumo.registros_com_conflito > 0 ? "Conflitos" : resumo.registros_com_aviso > 0 ? "Avisos" : "Tudo válido"}
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1380px] w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="rotulo px-2 py-2">Status</th>
                    <th className="rotulo px-2 py-2">Tipo</th>
                    <th className="rotulo px-2 py-2">Código completo</th>
                    <th className="rotulo px-2 py-2">Código prato</th>
                    <th className="rotulo px-2 py-2">Código pai</th>
                    <th className="rotulo px-2 py-2">Código opção</th>
                    <th className="rotulo px-2 py-2">Descrição</th>
                    <th className="rotulo px-2 py-2">Complemento</th>
                    <th className="rotulo px-2 py-2">Categoria</th>
                    <th className="rotulo px-2 py-2">Tamanho</th>
                    <th className="rotulo px-2 py-2">Preço</th>
                    <th className="rotulo px-2 py-2">Pesável</th>
                    <th className="rotulo px-2 py-2">Ativo</th>
                    <th className="rotulo px-2 py-2">Classificação futura</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {registrosPagina.map((registro) => (
                    <tr key={`${registro.linha_planilha}-${registro.codigo_completo}-${registro.descricao}`}>
                      <td className="px-2 py-2">
                        <Badge cor={statusRegistro(registro)}>
                          {registro.indicador === "CONFLITO" ? "Conflito" : registro.indicador === "AVISO" ? "Aviso" : "Válido"}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 font-semibold">{registro.tipo}</td>
                      <td className="px-2 py-2 font-mono text-xs break-all">{registro.codigo_completo || "—"}</td>
                      <td className="px-2 py-2 font-mono text-xs break-all">{registro.codigo_prato || "—"}</td>
                      <td className="px-2 py-2 font-mono text-xs break-all">{registro.codigo_prato_pai || "—"}</td>
                      <td className="px-2 py-2 font-mono text-xs break-all">{registro.codigo_opcao || "—"}</td>
                      <td className="px-2 py-2">{registro.descricao || "—"}</td>
                      <td className="px-2 py-2">{registro.complemento || "—"}</td>
                      <td className="px-2 py-2">{registro.categoria || "—"}</td>
                      <td className="px-2 py-2">{registro.tamanho || "—"}</td>
                      <td className="px-2 py-2">{moedaCentavos(registro.preco_centavos)}</td>
                      <td className="px-2 py-2">{registro.pesavel || "—"}</td>
                      <td className="px-2 py-2">{registro.ativo ? "Ativo" : "Inativo"}</td>
                      <td className="px-2 py-2 text-xs text-stone-600">{registro.classificacao_futura}</td>
                    </tr>
                  ))}
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
        </div>
      ) : (
        <Vazio mensagem="Selecione um arquivo .xlsx para gerar a prévia segura dos códigos do Saipos." />
      )}
    </div>
  );
}
