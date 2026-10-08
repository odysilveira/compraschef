"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Archive, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { Badge, Card, TituloPagina, Vazio } from "@/components/ui";
import { useDB } from "@/lib/data";
import {
  agregarArquivosConsumoSaipos,
  arquivosNoIntervaloMes,
  arquivoParaRelatorio,
  criarSaiposConsumoArquivoRepository,
  listarArquivosAno,
  mesRefDoPeriodo,
  mesRefValido,
  parsePeriodoSaiposRotulo,
  relatorioParaArquivoMes,
  rotuloMesRef,
  type ArquivoConsumoSaipos,
  type SaiposConsumoArquivoState,
} from "@/lib/domain/saipos-consumo-arquivo";
import {
  processarArquivoItensVendidos,
  type AbaRelatorioSaipos,
  type RelatorioItensVendidosSaipos,
} from "@/lib/domain/saipos-itens-vendidos";

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function celula(v: string | number | undefined): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? String(v)
      : v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  }
  return String(v);
}

function TabelaAba({ aba }: { aba: AbaRelatorioSaipos }) {
  const cols = useMemo(() => {
    const set = new Set<string>();
    for (const linha of aba.dados) {
      for (const k of Object.keys(linha)) set.add(k);
    }
    return [...set];
  }, [aba.dados]);

  if (!aba.dados.length) return null;

  return (
    <div className="overflow-x-auto rounded-card border border-stone-200">
      <table className="min-w-full text-sm">
        <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
          <tr>
            {cols.map((c) => (
              <th key={c} className="px-3 py-2 font-semibold whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {aba.dados.map((linha, i) => (
            <tr key={i} className="hover:bg-stone-50/80">
              {cols.map((c) => (
                <td key={c} className="px-3 py-2 whitespace-nowrap tabular-nums">
                  {celula(linha[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResumoRelatorio({
  relatorio,
  tituloExtra,
}: {
  relatorio: RelatorioItensVendidosSaipos;
  tituloExtra?: string;
}) {
  const [abaAtiva, setAbaAtiva] = useState(relatorio.abas[0]?.nome ?? "");

  useEffect(() => {
    setAbaAtiva(relatorio.abas[0]?.nome ?? "");
  }, [relatorio]);

  const validacao = relatorio.abas.find((a) => a.nome === "Validacao");
  const checagens = (validacao?.dados ?? []).filter((l) => l.Status === "OK" || l.Status === "REVISAR");
  const temRevisar = checagens.some((l) => l.Status === "REVISAR");

  const resumoNums = useMemo(() => {
    const r = relatorio.resultado;
    const molho = Object.values(r.molhoTamanho).reduce((s, v) => s + v, 0);
    const massa = Object.values(r.massaTamanho).reduce((s, v) => s + v, 0);
    const risotos = Object.values(r.risotos).reduce((s, v) => s + v, 0);
    return { molho, massa, risotos, itens: relatorio.totalItens, opcoes: relatorio.totalOpcoes };
  }, [relatorio]);

  return (
    <div className="space-y-5">
      {tituloExtra ? <h2 className="text-lg font-bold text-primaria-escura">{tituloExtra}</h2> : null}

      <div
        className={`rounded-card border-l-4 px-4 py-3 ${
          temRevisar ? "border-l-red-500 bg-red-50" : "border-l-emerald-500 bg-emerald-50"
        }`}
      >
        <div className="mb-2 flex items-center gap-2 font-semibold">
          {temRevisar ? (
            <>
              <AlertCircle size={18} className="text-red-600" /> Conferir antes de usar
            </>
          ) : (
            <>
              <CheckCircle2 size={18} className="text-emerald-700" /> Validação OK
            </>
          )}
        </div>
        <ul className="space-y-1 text-sm">
          {checagens.map((c, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2">
              <span>{String(c.Verificacao)}</span>
              <Badge cor={c.Status === "OK" ? "verde" : "vermelho"}>{String(c.Status)}</Badge>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
        <FileSpreadsheet size={16} />
        <span>{relatorio.nomeArquivo}</span>
        {relatorio.periodo ? <span>· {relatorio.periodo}</span> : null}
        <span>· {relatorio.formato === "hierarquico" ? "hierárquico" : "plano"}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Itens", resumoNums.itens],
          ["Opções", resumoNums.opcoes],
          ["Porções molho", Math.round(resumoNums.molho)],
          ["Porções massa", Math.round(resumoNums.massa)],
          ["Risotos", Math.round(resumoNums.risotos)],
        ].map(([rotulo, valor]) => (
          <Card key={String(rotulo)} className="p-3">
            <p className="text-xs text-stone-500">{rotulo}</p>
            <p className="text-xl font-bold text-primaria-escura">{valor}</p>
          </Card>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-card bg-stone-100 p-1">
        {relatorio.abas.map((aba) => (
          <button
            key={aba.nome}
            type="button"
            onClick={() => setAbaAtiva(aba.nome)}
            className={`whitespace-nowrap rounded-card px-3 py-1.5 text-sm font-semibold ${
              abaAtiva === aba.nome
                ? "bg-superficie text-primaria-escura shadow-card"
                : "text-stone-600 hover:bg-white"
            }`}
          >
            {aba.nome}
          </button>
        ))}
      </div>

      {relatorio.abas
        .filter((a) => a.nome === abaAtiva)
        .map((aba) => (
          <div key={aba.nome}>
            <h2 className="mb-2 text-base font-bold">{aba.nome}</h2>
            <TabelaAba aba={aba} />
          </div>
        ))}
    </div>
  );
}

export default function SaiposConsumoPage() {
  const db = useDB();
  const repo = useMemo(() => criarSaiposConsumoArquivoRepository(), []);
  const [estado, setEstado] = useState<SaiposConsumoArquivoState>(() =>
    criarSaiposConsumoArquivoRepository().carregar()
  );
  const [anoGrade, setAnoGrade] = useState(() => new Date().getFullYear());
  const [relatorioPendente, setRelatorioPendente] = useState<RelatorioItensVendidosSaipos | null>(null);
  const [mesArquivar, setMesArquivar] = useState("");
  const [relatorioExibido, setRelatorioExibido] = useState<RelatorioItensVendidosSaipos | null>(null);
  const [tituloExibido, setTituloExibido] = useState<string | undefined>();
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [msgOk, setMsgOk] = useState<string | null>(null);

  const agora = new Date();
  const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
  const [aggDe, setAggDe] = useState(`${anoGrade}-01`);
  const [aggAte, setAggAte] = useState(mesAtual);

  const recarregar = useCallback(() => {
    setEstado(repo.carregar());
  }, [repo]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const arquivosAno = useMemo(() => listarArquivosAno(estado, anoGrade), [estado, anoGrade]);
  const enviadosNoAno = useMemo(() => new Set(arquivosAno.map((a) => a.mes_ref)), [arquivosAno]);

  async function aoArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setMsgOk(null);
    setLendo(true);
    try {
      const buffer = await arquivo.arrayBuffer();
      const rel = processarArquivoItensVendidos(buffer, arquivo.name, db);
      const periodo = parsePeriodoSaiposRotulo(rel.periodo);
      const mesSug = mesRefDoPeriodo(periodo);
      setRelatorioPendente(rel);
      setMesArquivar(mesSug);
      setRelatorioExibido(rel);
      setTituloExibido("Pré-visualização (ainda não arquivado)");
      setAnoGrade(Number(mesSug.slice(0, 4)));
    } catch (e) {
      setRelatorioPendente(null);
      setRelatorioExibido(null);
      setErro(e instanceof Error ? e.message : "Falha ao ler a planilha.");
    } finally {
      setLendo(false);
    }
  }

  function arquivarMes() {
    if (!relatorioPendente || !mesRefValido(mesArquivar)) {
      setErro("Escolha um mês válido (AAAA-MM) para arquivar.");
      return;
    }
    const existente = repo.obter(mesArquivar);
    if (existente) {
      const ok = window.confirm(
        `Já existe arquivo para ${rotuloMesRef(mesArquivar)} (${existente.nome_arquivo}). Substituir?`
      );
      if (!ok) return;
    }
    try {
      const arq = relatorioParaArquivoMes(relatorioPendente, mesArquivar);
      setEstado(repo.salvar(arq));
      setMsgOk(`Arquivado: ${rotuloMesRef(mesArquivar)}.`);
      setRelatorioPendente(null);
      setRelatorioExibido(arquivoParaRelatorio(arq, db));
      setTituloExibido(rotuloMesRef(mesArquivar));
      setAnoGrade(Number(mesArquivar.slice(0, 4)));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível arquivar.");
    }
  }

  function abrirMes(mesRef: string) {
    const arq = repo.obter(mesRef);
    if (!arq) return;
    setRelatorioPendente(null);
    setRelatorioExibido(arquivoParaRelatorio(arq, db));
    setTituloExibido(rotuloMesRef(mesRef));
    setMsgOk(null);
    setErro(null);
  }

  function removerMes(mesRef: string) {
    const ok = window.confirm(`Remover o arquivo de ${rotuloMesRef(mesRef)}?`);
    if (!ok) return;
    setEstado(repo.remover(mesRef));
    setMsgOk(`Removido: ${rotuloMesRef(mesRef)}.`);
    if (tituloExibido === rotuloMesRef(mesRef)) {
      setRelatorioExibido(null);
      setTituloExibido(undefined);
    }
  }

  function verAgregado() {
    if (!mesRefValido(aggDe) || !mesRefValido(aggAte)) {
      setErro("Informe De e Até no formato AAAA-MM.");
      return;
    }
    const lista = arquivosNoIntervaloMes(estado, aggDe, aggAte);
    if (lista.length === 0) {
      setErro("Nenhum mês arquivado nesse intervalo.");
      setRelatorioExibido(null);
      return;
    }
    const agg = agregarArquivosConsumoSaipos(lista, db);
    if (!agg) return;
    setRelatorioPendente(null);
    setRelatorioExibido(agg);
    setTituloExibido(
      lista.length === 1
        ? rotuloMesRef(lista[0].mes_ref)
        : `Soma ${rotuloMesRef(agg.mesesIncluidos[0])} → ${rotuloMesRef(agg.mesesIncluidos[agg.mesesIncluidos.length - 1])} (${lista.length} meses)`
    );
    setErro(null);
    setMsgOk(null);
  }

  function mesIso(ano: number, mes1a12: number): string {
    return `${ano}-${String(mes1a12).padStart(2, "0")}`;
  }

  return (
    <div>
      <TituloPagina
        titulo="Consumo teórico (Saipos)"
        subtitulo="Arquive o Excel mês a mês e some o consumo por período"
      />

      <Card className="mb-5 space-y-3">
        <p className="text-sm text-stone-600">
          O Saipos separa molho, tamanho e massa. Esta tela junta de novo e calcula consumo teórico —
          gramatura das <strong>fichas técnicas</strong> quando existir, senão catálogo Italian.
        </p>
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-card px-3 py-2">
          Arquivo teórico do mês — a baixa automática no estoque virá numa próxima etapa.
        </p>
        <div className="text-sm text-stone-600">
          <p className="font-medium text-stone-800">Como tirar a planilha certa:</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>Saipos → Itens vendidos</li>
            <li>Datas inicial e final (ideal: mês inteiro)</li>
            <li>
              Marque <strong>Agrupar opções por produto</strong>
            </li>
            <li>Buscar → Exportar Excel → arquivar aqui no mês correspondente</li>
          </ol>
          <p className="mt-2 text-xs text-stone-500">
            Nada é enviado pela internet: a planilha fica arquivada neste navegador.
          </p>
        </div>
      </Card>

      {/* Grade anual */}
      <Card className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="rotulo flex items-center gap-1">
            <Archive size={14} /> Meses arquivados
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secundario px-2 py-1 text-xs"
              onClick={() => setAnoGrade((y) => y - 1)}
            >
              ←
            </button>
            <span className="min-w-[4rem] text-center font-bold">{anoGrade}</span>
            <button
              type="button"
              className="btn-secundario px-2 py-1 text-xs"
              onClick={() => setAnoGrade((y) => y + 1)}
            >
              →
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {MESES_CURTOS.map((nome, idx) => {
            const mesRef = mesIso(anoGrade, idx + 1);
            const arq: ArquivoConsumoSaipos | undefined = enviadosNoAno.has(mesRef)
              ? arquivosAno.find((a) => a.mes_ref === mesRef)
              : undefined;
            const enviado = Boolean(arq);
            return (
              <button
                key={mesRef}
                type="button"
                disabled={!enviado}
                onClick={() => enviado && abrirMes(mesRef)}
                className={`rounded-card border px-2 py-3 text-left transition-colors ${
                  enviado
                    ? "border-emerald-300 bg-emerald-50 hover:border-emerald-500"
                    : "border-stone-200 bg-stone-50 opacity-70"
                }`}
                title={enviado ? `Abrir ${rotuloMesRef(mesRef)}` : "Ainda não enviado"}
              >
                <p className="text-sm font-bold text-stone-800">{nome}</p>
                <p className={`text-[11px] ${enviado ? "text-emerald-700" : "text-stone-400"}`}>
                  {enviado ? "Enviado" : "Faltando"}
                </p>
              </button>
            );
          })}
        </div>
        {arquivosAno.length > 0 && (
          <ul className="space-y-1 text-xs text-stone-600">
            {arquivosAno.map((a) => (
              <li key={a.mes_ref} className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => abrirMes(a.mes_ref)}>
                  {rotuloMesRef(a.mes_ref)} · {a.nome_arquivo}
                  {a.periodo_rotulo ? ` · ${a.periodo_rotulo}` : ""}
                </button>
                <button type="button" className="text-red-600 hover:underline" onClick={() => removerMes(a.mes_ref)}>
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Agregação */}
      <Card className="mb-5 space-y-3">
        <p className="rotulo">Somar consumo no intervalo</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="mb-0.5 block text-[11px] text-slate-500">De (mês)</span>
            <input
              type="month"
              className="campo"
              value={aggDe}
              onChange={(e) => setAggDe(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[11px] text-slate-500">Até (mês)</span>
            <input
              type="month"
              className="campo"
              value={aggAte}
              onChange={(e) => setAggAte(e.target.value)}
            />
          </label>
          <div className="flex items-end">
            <button type="button" className="btn-primario w-full" onClick={verAgregado}>
              Ver soma
            </button>
          </div>
        </div>
      </Card>

      <label className="mb-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-stone-300 bg-stone-50 px-6 py-10 transition-colors hover:border-primaria hover:bg-white">
        <Upload className="text-stone-400" size={28} />
        <span className="text-center font-semibold text-stone-800">
          {lendo ? "Lendo planilha…" : "Solte ou clique para escolher o Excel do Saipos"}
        </span>
        <span className="text-xs text-stone-500">.xlsx · Itens vendidos</span>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          disabled={lendo}
          onChange={(e) => void aoArquivo(e.target.files?.[0])}
        />
      </label>

      {relatorioPendente && (
        <Card className="mb-5 flex flex-wrap items-end gap-3">
          <label className="block min-w-[10rem] flex-1">
            <span className="mb-0.5 block text-[11px] text-slate-500">Arquivar no mês</span>
            <input
              type="month"
              className="campo"
              value={mesArquivar}
              onChange={(e) => setMesArquivar(e.target.value)}
            />
          </label>
          <button type="button" className="btn-primario" onClick={arquivarMes}>
            Confirmar e arquivar
          </button>
        </Card>
      )}

      {erro && (
        <div className="mb-4 flex items-start gap-2 rounded-card border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          {erro}
        </div>
      )}
      {msgOk && (
        <div className="mb-4 flex items-start gap-2 rounded-card border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          {msgOk}
        </div>
      )}

      {!relatorioExibido && !erro && (
        <Vazio mensagem="Importe a planilha ou abra um mês já arquivado para ver molho × massa, consumo de massa e validação." />
      )}

      {relatorioExibido && <ResumoRelatorio relatorio={relatorioExibido} tituloExtra={tituloExibido} />}
    </div>
  );
}
