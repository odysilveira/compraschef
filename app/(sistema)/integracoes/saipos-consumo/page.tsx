"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  FileSpreadsheet,
  MessageCircleQuestion,
  PackageMinus,
  Upload,
} from "lucide-react";
import { Badge, Card, TituloPagina, Vazio } from "@/components/ui";
import { estoqueAtual, mutate, uid, useDB } from "@/lib/data";
import { enviarEstoqueTotal } from "@/lib/integracao";
import { montarFatosVendas, responderFatosDeterministico } from "@/lib/domain/saipos-assistente-fatos";
import {
  aplicarBaixaSaiposMes,
  montarPreviaBaixaSaipos,
} from "@/lib/domain/saipos-baixa-estoque";
import {
  agregarArquivosConsumoSaipos,
  arquivosNoIntervaloMes,
  arquivoParaRelatorio,
  criarEstadoArquivoConsumoVazio,
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

const PERGUNTAS_PRONTAS = [
  "Qual mês vendeu mais tiramisu?",
  "Quantos Box G no período?",
  "Top 5 itens do período",
  "Como foram as bebidas?",
  "Qual prato montado mais saiu?",
];

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
    return Array.from(set);
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

function moedaBr(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ResumoRelatorio({
  relatorio,
  tituloExtra,
}: {
  relatorio: RelatorioItensVendidosSaipos;
  tituloExtra?: string;
}) {
  const [abaAtiva, setAbaAtiva] = useState(relatorio.abas[0]?.nome ?? "");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("");

  useEffect(() => {
    setAbaAtiva(relatorio.abas[0]?.nome ?? "");
    setFiltroCategoria("");
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

  const vendas = relatorio.vendas;
  const top5 = useMemo(() => (vendas?.itens ?? []).slice(0, 5), [vendas]);

  const abaExibida = useMemo(() => {
    const aba = relatorio.abas.find((a) => a.nome === abaAtiva);
    if (!aba) return null;
    if (aba.nome === "Vendas" && filtroCategoria) {
      return {
        ...aba,
        dados: aba.dados.filter((l) => String(l.Categoria) === filtroCategoria),
      };
    }
    return aba;
  }, [relatorio.abas, abaAtiva, filtroCategoria]);

  const categoriasVenda = useMemo(() => {
    const aba = relatorio.abas.find((a) => a.nome === "Vendas");
    if (!aba) return [] as string[];
    return Array.from(new Set(aba.dados.map((l) => String(l.Categoria)).filter(Boolean)));
  }, [relatorio.abas]);

  return (
    <div className="space-y-5">
      {tituloExtra ? <h2 className="text-lg font-bold text-primaria-escura">{tituloExtra}</h2> : null}

      <p className="text-xs text-stone-500">
        <strong>Vendas</strong> = o que o Saipos faturou (qtd + R$).{" "}
        <strong>Consumo teórico</strong> = o que a cozinha usou (molho × massa, kg).
      </p>

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

      {!vendas && (
        <div className="rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Este mês foi arquivado sem faturamento (versão antiga). Importe de novo o Excel do Saipos e
          clique em <strong>Confirmar e arquivar</strong> para gravar os valores em R$.
        </div>
      )}

      {vendas && vendas.totais.faturamento <= 0 && (
        <div className="rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Não achei valores em dinheiro na planilha. No Saipos, confira se a coluna{" "}
          <strong>Valor total</strong> veio preenchida no export (Itens vendidos). Depois importe e
          arquive de novo.
        </div>
      )}

      {vendas && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Card className="border-2 border-primaria/30 bg-primaria/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-primaria">Faturamento</p>
            <p className="text-2xl font-bold text-primaria-escura">{moedaBr(vendas.totais.faturamento)}</p>
            <p className="mt-0.5 text-[11px] text-stone-500">Soma da coluna Valor total do Excel</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-stone-500">Qtd. vendida (itens)</p>
            <p className="text-xl font-bold text-primaria-escura">
              {Math.round(vendas.totais.quantidade_itens)}
            </p>
          </Card>
          <Card className="p-3 sm:col-span-2">
            <p className="mb-1 text-xs text-stone-500">Top 5 por faturamento</p>
            <ul className="space-y-0.5 text-xs text-stone-700">
              {top5.map((i) => (
                <li key={i.item} className="flex justify-between gap-2">
                  <span className="truncate">{i.item}</span>
                  <span className="shrink-0 tabular-nums font-semibold">{moedaBr(i.valor)}</span>
                </li>
              ))}
              {top5.length === 0 ? <li>Sem itens de venda.</li> : null}
            </ul>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Linhas Saipos", resumoNums.itens],
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
            onClick={() => {
              setAbaAtiva(aba.nome);
              setFiltroCategoria("");
            }}
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

      {abaAtiva === "Vendas" && categoriasVenda.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={!filtroCategoria ? "btn-primario px-2 py-1 text-xs" : "btn-secundario px-2 py-1 text-xs"}
            onClick={() => setFiltroCategoria("")}
          >
            Todas
          </button>
          {categoriasVenda.map((c) => (
            <button
              key={c}
              type="button"
              className={
                filtroCategoria === c ? "btn-primario px-2 py-1 text-xs" : "btn-secundario px-2 py-1 text-xs"
              }
              onClick={() => setFiltroCategoria(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {abaExibida && (
        <div>
          <h2 className="mb-2 text-base font-bold">{abaExibida.nome}</h2>
          <TabelaAba aba={abaExibida} />
        </div>
      )}
    </div>
  );
}

export default function SaiposConsumoPage() {
  const db = useDB();
  const repo = useMemo(() => criarSaiposConsumoArquivoRepository(), []);
  // SSR e 1º paint: vazio. localStorage só depois do mount (evita Enviado vs Faltando).
  const [estado, setEstado] = useState<SaiposConsumoArquivoState>(criarEstadoArquivoConsumoVazio);
  const [arquivoPronto, setArquivoPronto] = useState(false);
  const [anoGrade, setAnoGrade] = useState(2026);
  const [relatorioPendente, setRelatorioPendente] = useState<RelatorioItensVendidosSaipos | null>(null);
  const [mesArquivar, setMesArquivar] = useState("");
  const [relatorioExibido, setRelatorioExibido] = useState<RelatorioItensVendidosSaipos | null>(null);
  const [tituloExibido, setTituloExibido] = useState<string | undefined>();
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [msgOk, setMsgOk] = useState<string | null>(null);

  const [aggDe, setAggDe] = useState("2026-01");
  const [aggAte, setAggAte] = useState("2026-10");
  const [perguntaIa, setPerguntaIa] = useState(PERGUNTAS_PRONTAS[0]);
  const [respostaIa, setRespostaIa] = useState<string | null>(null);
  const [fonteIa, setFonteIa] = useState<"local" | "ia" | null>(null);
  const [perguntando, setPerguntando] = useState(false);
  const [erroIa, setErroIa] = useState<string | null>(null);
  const [mesBaixa, setMesBaixa] = useState("");
  const [baixandoEstoque, setBaixandoEstoque] = useState(false);

  const usuarioId = db.perfis.find((p) => p.papel === "dono")?.id ?? db.perfis[0]?.id ?? "perfil-dono";

  const arquivoBaixa = useMemo(
    () => (mesRefValido(mesBaixa) ? estado.arquivos.find((a) => a.mes_ref === mesBaixa) : undefined),
    [estado.arquivos, mesBaixa]
  );
  const previaBaixa = useMemo(
    () => (arquivoBaixa ? montarPreviaBaixaSaipos(arquivoBaixa, db) : null),
    [arquivoBaixa, db]
  );

  const recarregar = useCallback(() => {
    setEstado(repo.carregar());
  }, [repo]);

  useEffect(() => {
    const agora = new Date();
    const y = agora.getFullYear();
    const m = String(agora.getMonth() + 1).padStart(2, "0");
    setAnoGrade(y);
    setAggDe(`${y}-01`);
    setAggAte(`${y}-${m}`);
    recarregar();
    setArquivoPronto(true);
  }, [recarregar]);

  function exportarBackupArquivo() {
    try {
      const json = repo.exportarJson();
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `saipos-arquivo-meses-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsgOk("Backup JSON baixado. Guarde esse arquivo para não perder os meses.");
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao exportar backup.");
    }
  }

  async function importarBackupArquivo(file: File | undefined) {
    if (!file) return;
    setErro(null);
    setMsgOk(null);
    try {
      const texto = await file.text();
      const atual = repo.carregar();
      const modo =
        atual.arquivos.length === 0
          ? "substituir"
          : window.confirm(
              `Já existem ${atual.arquivos.length} mês(es) neste navegador.\nOK = mesclar (mesmo mês do JSON substitui)\nCancelar = abortar`
            )
            ? "mesclar"
            : null;
      if (!modo) return;
      const next = repo.importarJson(texto, modo);
      setEstado(next);
      setMsgOk(`Backup importado: ${next.arquivos.length} mês(es) no arquivo.`);
      if (next.arquivos.length) {
        setAnoGrade(Number(next.arquivos[next.arquivos.length - 1].mes_ref.slice(0, 4)));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao importar backup JSON.");
    }
  }

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
      setMesBaixa(mesArquivar);
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
    setMesBaixa(mesRef);
    setMsgOk(null);
    setErro(null);
  }

  function aplicarBaixaDoMes() {
    if (!arquivoBaixa || !previaBaixa) return;
    if (!previaBaixa.pode_aplicar) {
      setErro(previaBaixa.bloqueios[0] || "Não é possível aplicar a baixa.");
      return;
    }
    const ok = window.confirm(
      `Baixar do estoque o consumo teórico de ${rotuloMesRef(arquivoBaixa.mes_ref)}?\n` +
        previaBaixa.agregadas.map((a) => `• ${a.nome}: ${a.quantidade_kg} kg`).join("\n") +
        "\n\nIsso debita produtos acabados (massa/molho), não insumos crus."
    );
    if (!ok) return;
    setBaixandoEstoque(true);
    setErro(null);
    try {
      const produtosAfetados = previaBaixa.agregadas.map((a) => a.produto_id);
      let arquivoAtualizado: ArquivoConsumoSaipos | null = null;
      const dbNovo = mutate((d) => {
        const r = aplicarBaixaSaiposMes(d, arquivoBaixa, usuarioId, () => uid("mov"));
        arquivoAtualizado = r.arquivo;
      });
      if (arquivoAtualizado) setEstado(repo.salvar(arquivoAtualizado));
      for (const pid of produtosAfetados) {
        const prod = dbNovo.produtos.find((p) => p.id === pid);
        enviarEstoqueTotal(prod?.codigo_externo, estoqueAtual(dbNovo, pid));
      }
      setMsgOk(`Baixa de estoque aplicada: ${rotuloMesRef(arquivoBaixa.mes_ref)}.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao baixar estoque.");
      setEstado(repo.carregar());
    } finally {
      setBaixandoEstoque(false);
    }
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

  async function perguntarAosNumeros(perguntaOverride?: string) {
    const pergunta = (perguntaOverride ?? perguntaIa).trim();
    if (!pergunta) {
      setErroIa("Digite uma pergunta.");
      return;
    }
    if (!mesRefValido(aggDe) || !mesRefValido(aggAte)) {
      setErroIa("Informe De e Até no formato AAAA-MM.");
      return;
    }
    setPerguntaIa(pergunta);
    setErroIa(null);
    setPerguntando(true);
    setRespostaIa(null);
    setFonteIa(null);
    try {
      const atual = repo.carregar();
      setEstado(atual);
      const fatos = montarFatosVendas(atual, aggDe, aggAte, pergunta);
      if (fatos.meses_cobertos.length === 0) {
        setErroIa("Nenhum mês arquivado nesse intervalo. Arquive o Excel primeiro.");
        setPerguntando(false);
        return;
      }

      // Resposta imediata com os números (não trava se a IA demorar)
      const local = responderFatosDeterministico(pergunta, fatos);
      setRespostaIa(local);
      setFonteIa("local");
      setPerguntando(false);

      // Opcional: redação via IA; se demorar/falhar, mantém a local
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetch("/api/assistente/saipos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pergunta, fatos }),
          signal: ctrl.signal,
        });
        const data = (await res.json()) as {
          ok?: boolean;
          erro?: string;
          texto?: string;
          fonte?: "local" | "ia";
        };
        if (res.ok && data.ok && data.texto && data.fonte === "ia") {
          setRespostaIa(data.texto);
          setFonteIa("ia");
        }
      } catch {
        // Mantém a resposta local
      } finally {
        window.clearTimeout(timer);
      }
    } catch (e) {
      setErroIa(e instanceof Error ? e.message : "Falha ao perguntar.");
      setPerguntando(false);
    }
  }

  return (
    <div>
      <TituloPagina
        titulo="Consumo teórico (Saipos)"
        subtitulo="Arquive o Excel mês a mês e some o consumo por período"
      />

      <Card className="mb-5 space-y-3">
        <p className="text-sm text-stone-600">
          Arquive o Excel do mês para ver <strong>vendas/faturamento</strong> (qtd + R$ por item) e o{" "}
          <strong>consumo teórico</strong> da cozinha (molho × massa, kg). Gramatura usa fichas técnicas
          quando existir, senão catálogo Italian.
        </p>
        <p className="text-xs text-stone-600 bg-stone-50 border border-stone-200 rounded-card px-3 py-2">
          Depois de arquivar o mês, use <strong>Baixa no estoque</strong> para debitar massa/molho acabados
          (não insumos crus). Produção com débito de ficha fica em Estoque → Registrar produção.
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
            Nada é enviado pela internet: a planilha fica arquivada neste navegador. Use sempre{" "}
            <strong>http://localhost:3002</strong> (outra porta = outro arquivo). Depois de arquivar, baixe
            um backup JSON.
          </p>
        </div>
      </Card>

      {/* Grade anual */}
      <Card className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="rotulo flex items-center gap-1">
            <Archive size={14} /> Meses arquivados
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secundario px-2 py-1 text-xs" onClick={exportarBackupArquivo}>
              Exportar backup
            </button>
            <label className="btn-secundario cursor-pointer px-2 py-1 text-xs">
              Importar backup
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  void importarBackupArquivo(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
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
        {arquivoPronto && estado.arquivos.length === 0 && (
          <p className="rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Nenhum mês neste navegador. Os Excels precisam ser arquivados de novo (solte o .xlsx abaixo) ou
            restaure um backup JSON se você tiver exportado antes.
          </p>
        )}
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
                  {!arquivoPronto ? "…" : enviado ? "Enviado" : "Faltando"}
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

      {/* Baixa no estoque */}
      <Card className="mb-5 space-y-3">
        <p className="rotulo flex items-center gap-1">
          <PackageMinus size={14} /> Baixa no estoque
        </p>
        <p className="text-sm text-stone-600">
          Debita produtos acabados (massa fresca, molhos vinculados) pelo consumo teórico do mês
          arquivado — FEFO nas caixas. Confirme só uma vez por mês.
        </p>
        <label className="block max-w-xs">
          <span className="mb-0.5 block text-[11px] text-slate-500">Mês arquivado</span>
          <select
            className="campo"
            value={mesBaixa}
            onChange={(e) => setMesBaixa(e.target.value)}
          >
            <option value="">Escolha o mês…</option>
            {estado.arquivos
              .slice()
              .sort((a, b) => b.mes_ref.localeCompare(a.mes_ref))
              .map((a) => (
                <option key={a.mes_ref} value={a.mes_ref}>
                  {rotuloMesRef(a.mes_ref)}
                  {a.baixa_estoque ? " · baixa ok" : ""}
                </option>
              ))}
          </select>
        </label>
        {previaBaixa && (
          <div className="space-y-2">
            {previaBaixa.ja_aplicada && (
              <p className="rounded-card border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Baixa já aplicada
                {previaBaixa.aplicada_em
                  ? ` em ${new Date(previaBaixa.aplicada_em).toLocaleString("pt-BR")}`
                  : ""}
                .
              </p>
            )}
            {previaBaixa.agregadas.length > 0 && (
              <div className="overflow-x-auto rounded-card border border-stone-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-stone-50 text-xs text-stone-500">
                    <tr>
                      <th className="px-2 py-1.5">Produto</th>
                      <th className="px-2 py-1.5">Necessidade (kg)</th>
                      <th className="px-2 py-1.5">Saldo caixas</th>
                      <th className="px-2 py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previaBaixa.agregadas.map((a) => (
                      <tr key={a.produto_id} className="border-t border-stone-100">
                        <td className="px-2 py-1.5">{a.nome}</td>
                        <td className="px-2 py-1.5">{celula(a.quantidade_kg)}</td>
                        <td className="px-2 py-1.5">{celula(a.saldo_caixas)}</td>
                        <td className="px-2 py-1.5">
                          {a.ok ? (
                            <Badge cor="verde">ok</Badge>
                          ) : (
                            <span className="text-xs text-red-700">{a.motivo}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {previaBaixa.avisos.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-800">
                {previaBaixa.avisos.map((a) => (
                  <li key={a}>{a} (não entra nesta baixa)</li>
                ))}
              </ul>
            )}
            {previaBaixa.bloqueios.length > 0 && !previaBaixa.ja_aplicada && (
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-red-700">
                {previaBaixa.bloqueios.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="btn-primario"
              disabled={!previaBaixa.pode_aplicar || baixandoEstoque}
              onClick={aplicarBaixaDoMes}
            >
              {baixandoEstoque ? "Aplicando…" : "Confirmar baixa do mês"}
            </button>
          </div>
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

      {/* Pergunte aos números */}
      <Card className="mb-5 space-y-3">
        <p className="rotulo flex items-center gap-1">
          <MessageCircleQuestion size={14} /> Pergunte aos números
        </p>
        <p className="text-sm text-stone-600">
          Usa os meses arquivados no intervalo De/Até acima (vendas e faturamento). A resposta só usa esses
          números — não inventa.
        </p>
        <div className="flex flex-wrap gap-1">
          {PERGUNTAS_PRONTAS.map((p) => (
            <button
              key={p}
              type="button"
              className={
                perguntaIa === p ? "btn-primario px-2 py-1 text-xs" : "btn-secundario px-2 py-1 text-xs"
              }
              disabled={perguntando}
              onClick={() => void perguntarAosNumeros(p)}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1">
            <span className="mb-0.5 block text-[11px] text-slate-500">Sua pergunta</span>
            <input
              className="campo"
              value={perguntaIa}
              onChange={(e) => setPerguntaIa(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void perguntarAosNumeros();
                }
              }}
              placeholder="Ex.: qual mês vendeu mais risoto de camarão?"
              disabled={perguntando}
            />
          </label>
          <button
            type="button"
            className="btn-primario shrink-0"
            disabled={perguntando}
            onClick={() => void perguntarAosNumeros()}
          >
            {perguntando ? "Consultando…" : "Perguntar"}
          </button>
        </div>
        {erroIa && (
          <div className="flex items-start gap-2 rounded-card border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {erroIa}
          </div>
        )}
        {respostaIa && (
          <div className="rounded-card border border-stone-200 bg-stone-50 px-3 py-3 text-sm text-stone-800 whitespace-pre-wrap">
            <div className="mb-2 flex items-center gap-2">
              <Badge cor={fonteIa === "ia" ? "verde" : "cinza"}>
                {fonteIa === "ia" ? "IA" : "Números locais"}
              </Badge>
            </div>
            {respostaIa}
          </div>
        )}
        <p className="text-[11px] text-stone-400">
          Com base nos meses arquivados neste navegador. Sem chave de API responde só com os números;
          com OPENAI_API_KEY ou AI_GATEWAY_API_KEY a redação fica a cargo da IA.
        </p>
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
