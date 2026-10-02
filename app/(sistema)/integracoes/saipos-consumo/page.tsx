"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { Badge, Card, TituloPagina, Vazio } from "@/components/ui";
import { useDB } from "@/lib/data";
import {
  processarArquivoItensVendidos,
  type AbaRelatorioSaipos,
  type RelatorioItensVendidosSaipos,
} from "@/lib/domain/saipos-itens-vendidos";

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

export default function SaiposConsumoPage() {
  const db = useDB();
  const [relatorio, setRelatorio] = useState<RelatorioItensVendidosSaipos | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<string>("");

  async function aoArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setLendo(true);
    try {
      const buffer = await arquivo.arrayBuffer();
      const rel = processarArquivoItensVendidos(buffer, arquivo.name, db);
      setRelatorio(rel);
      setAbaAtiva(rel.abas[0]?.nome ?? "");
    } catch (e) {
      setRelatorio(null);
      setErro(e instanceof Error ? e.message : "Falha ao ler a planilha.");
    } finally {
      setLendo(false);
    }
  }

  const validacao = relatorio?.abas.find((a) => a.nome === "Validacao");
  const checagens = (validacao?.dados ?? []).filter((l) => l.Status === "OK" || l.Status === "REVISAR");
  const temRevisar = checagens.some((l) => l.Status === "REVISAR");

  const resumoNums = useMemo(() => {
    if (!relatorio) return null;
    const r = relatorio.resultado;
    const molho = Object.values(r.molhoTamanho).reduce((s, v) => s + v, 0);
    const massa = Object.values(r.massaTamanho).reduce((s, v) => s + v, 0);
    const risotos = Object.values(r.risotos).reduce((s, v) => s + v, 0);
    return { molho, massa, risotos, itens: relatorio.totalItens, opcoes: relatorio.totalOpcoes };
  }, [relatorio]);

  return (
    <div>
      <TituloPagina
        titulo="Consumo teórico (Saipos)"
        subtitulo="Lê Itens vendidos, remonta massa + molho + tamanho e estima o que saiu da cozinha"
      />

      <Card className="mb-5 space-y-3">
        <p className="text-sm text-stone-600">
          O Saipos separa molho, tamanho e massa. Esta tela junta de novo (como o Relatório de Pratos) e
          calcula consumo teórico — gramatura das <strong>fichas técnicas</strong> quando existir, senão
          catálogo Italian.
        </p>
        <div className="text-sm text-stone-600">
          <p className="font-medium text-stone-800">Como tirar a planilha certa:</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>Saipos → Itens vendidos</li>
            <li>Datas inicial e final</li>
            <li>
              Marque <strong>Agrupar opções por produto</strong>
            </li>
            <li>Buscar → Exportar Excel</li>
          </ol>
          <p className="mt-2 text-xs text-stone-500">
            Nada é enviado pela internet: a planilha é lida no seu computador.
          </p>
        </div>
      </Card>

      <label className="mb-6 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-stone-300 bg-stone-50 px-6 py-10 transition-colors hover:border-primaria hover:bg-white">
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

      {erro && (
        <div className="mb-4 flex items-start gap-2 rounded-card border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          {erro}
        </div>
      )}

      {!relatorio && !erro && (
        <Vazio mensagem="Importe a planilha para ver molho × massa, consumo de massa e validação." />
      )}

      {relatorio && (
        <div className="space-y-5">
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
            <span>
              · {relatorio.formato === "hierarquico" ? "hierárquico" : "plano"}
            </span>
          </div>

          {resumoNums && (
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
          )}

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
      )}
    </div>
  );
}
