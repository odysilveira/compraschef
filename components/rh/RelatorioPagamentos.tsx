"use client";

// Relatório de pagamentos de RH — filtro por período, por pessoa (sempre por id,
// nunca por nome, pra não misturar duas pessoas com o mesmo nome) e por categoria.
// Exporta Excel (exceljs) e imprime (window.print() + classes print: do Tailwind).

import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Badge, Campo, StatCard, Tabela, Vazio } from "@/components/ui";
import { useDB } from "@/lib/data";
import { hojeISO } from "@/lib/rh";
import { moeda, dataBR } from "@/lib/format";
import type { Colaborador, OrigemPagamento } from "@/lib/types";

type Categoria = "todos" | "motoboy" | "freelancer" | "clt";

const ABAS_CATEGORIA: { id: Categoria; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "motoboy", rotulo: "Motoboys" },
  { id: "freelancer", rotulo: "Freelancers" },
  { id: "clt", rotulo: "CLT" },
];

const ORIGEM_LABEL: Record<OrigemPagamento, string> = {
  diaria: "Diária",
  uber: "Uber",
  adiantamento_salario: "Adiantamento de salário",
  pagamento_salario: "Pagamento de salário",
  outro: "Outro",
};

function categoriaDoColaborador(c?: Colaborador): Categoria {
  if (!c) return "todos";
  if (c.categoria === "motoboy") return "motoboy";
  return c.clt ? "clt" : "freelancer";
}

function nomeExibicao(c?: Colaborador): string {
  if (!c) return "(pessoa removida)";
  return c.nome_social || c.nome;
}

function contemTexto(busca: string, ...textos: (string | undefined)[]): boolean {
  const alvo = busca.trim().toLowerCase();
  if (!alvo) return true;
  return textos.some((t) => (t ?? "").toLowerCase().includes(alvo));
}

export function RelatorioPagamentos() {
  const db = useDB();
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [categoria, setCategoria] = useState<Categoria>("todos");
  const [buscaNome, setBuscaNome] = useState("");
  const [pessoaSelecionadaId, setPessoaSelecionadaId] = useState<string | null>(null);

  const colaboradorPorId = useMemo(() => {
    const mapa = new Map<string, Colaborador>();
    for (const c of db.colaboradores) mapa.set(c.id, c);
    return mapa;
  }, [db.colaboradores]);

  const bancoPorId = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const b of db.bancos) mapa.set(b.id, b.nome);
    return mapa;
  }, [db.bancos]);

  const candidatos = useMemo(() => {
    if (pessoaSelecionadaId || !buscaNome.trim()) return [];
    return db.colaboradores.filter((c) => contemTexto(buscaNome, c.nome, c.nome_social, c.cpf, c.telefone));
  }, [db.colaboradores, buscaNome, pessoaSelecionadaId]);

  const pessoaFiltroId = pessoaSelecionadaId ?? (candidatos.length === 1 ? candidatos[0].id : null);
  const pessoaSelecionada = pessoaFiltroId ? colaboradorPorId.get(pessoaFiltroId) : null;

  const linhas = useMemo(() => {
    return db.pagamentos_rh
      .filter((p) => (de ? p.data_pagamento >= de : true))
      .filter((p) => (ate ? p.data_pagamento <= ate : true))
      .filter((p) => (categoria === "todos" ? true : categoriaDoColaborador(colaboradorPorId.get(p.colaborador_id)) === categoria))
      .filter((p) => (pessoaFiltroId ? p.colaborador_id === pessoaFiltroId : true))
      .sort((a, b) => b.data_pagamento.localeCompare(a.data_pagamento))
      .map((p) => {
        const colaborador = colaboradorPorId.get(p.colaborador_id);
        return {
          id: p.id,
          data: p.data_pagamento,
          nome: nomeExibicao(colaborador),
          categoria: categoriaDoColaborador(colaborador),
          banco: bancoPorId.get(p.banco_id) ?? "—",
          origem: p.origem ? ORIGEM_LABEL[p.origem] : "—",
          dias: p.dias_trabalhados?.length ?? 1,
          valor: p.valor,
        };
      });
  }, [db.pagamentos_rh, de, ate, categoria, pessoaFiltroId, colaboradorPorId, bancoPorId]);

  const totalGeral = linhas.reduce((s, l) => s + l.valor, 0);
  const totalMotoboys = linhas.filter((l) => l.categoria === "motoboy").reduce((s, l) => s + l.valor, 0);
  const totalFreelancers = linhas.filter((l) => l.categoria === "freelancer").reduce((s, l) => s + l.valor, 0);
  const totalClt = linhas.filter((l) => l.categoria === "clt").reduce((s, l) => s + l.valor, 0);

  function limparSelecaoPessoa() {
    setPessoaSelecionadaId(null);
    setBuscaNome("");
  }

  async function exportarExcel() {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Pagamentos RH");
    sheet.columns = [
      { header: "Data do pagamento", key: "data", width: 16 },
      { header: "Nome", key: "nome", width: 26 },
      { header: "Categoria", key: "categoria", width: 14 },
      { header: "Banco", key: "banco", width: 16 },
      { header: "Origem", key: "origem", width: 22 },
      { header: "Dias cobertos", key: "dias", width: 12 },
      { header: "Valor (R$)", key: "valor", width: 14 },
    ];
    for (const l of linhas) {
      sheet.addRow({ ...l, data: dataBR(l.data), valor: l.valor });
    }
    sheet.getRow(1).font = { bold: true };
    sheet.getColumn("valor").numFmt = '"R$" #,##0.00';
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-rh-${hojeISO()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <p className="hidden print:mb-4 print:block print:text-lg print:font-bold">
        Relatório de RH{de || ate ? ` — ${de ? dataBR(de) : "início"} a ${ate ? dataBR(ate) : "hoje"}` : ""}
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard rotulo="Total geral" valor={moeda(totalGeral)} cor="cinza" />
        <StatCard rotulo="Motoboys" valor={moeda(totalMotoboys)} cor="amarelo" />
        <StatCard rotulo="Freelancers" valor={moeda(totalFreelancers)} cor="verde" />
        <StatCard rotulo="CLT" valor={moeda(totalClt)} cor="laranja" />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <div className="w-40">
          <Campo rotulo="De">
            <input type="date" className="campo" value={de} onChange={(e) => setDe(e.target.value)} />
          </Campo>
        </div>
        <div className="w-40">
          <Campo rotulo="Até">
            <input type="date" className="campo" value={ate} onChange={(e) => setAte(e.target.value)} />
          </Campo>
        </div>
        <div className="min-w-[200px] flex-1">
          <Campo rotulo="Buscar pessoa">
            <input
              className="campo"
              placeholder="Nome, CPF ou telefone…"
              value={buscaNome}
              onChange={(e) => {
                setBuscaNome(e.target.value);
                setPessoaSelecionadaId(null);
              }}
            />
          </Campo>
        </div>
        <button type="button" className="btn-secundario" onClick={exportarExcel}>
          <Download size={16} /> Excel
        </button>
        <button type="button" className="btn-secundario" onClick={() => window.print()}>
          <Printer size={16} /> Imprimir
        </button>
      </div>

      {candidatos.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-stone-200 bg-stone-50 p-3 print:hidden">
          <span className="text-xs font-semibold text-stone-500">Encontramos {candidatos.length} pessoas — toque em uma:</span>
          {candidatos.map((c) => (
            <button
              key={c.id}
              type="button"
              className="rounded-lg bg-primaria-clara px-3 py-1.5 text-sm font-semibold text-primaria-escura hover:bg-primaria hover:text-white"
              onClick={() => setPessoaSelecionadaId(c.id)}
            >
              {nomeExibicao(c)} {c.telefone ? `· ${c.telefone}` : c.cpf ? `· ${c.cpf}` : ""}
            </button>
          ))}
        </div>
      )}

      {pessoaSelecionada && (
        <div className="mb-4 flex items-center gap-2 print:hidden">
          <Badge cor="azul">Mostrando só: {nomeExibicao(pessoaSelecionada)}</Badge>
          <button type="button" className="text-xs font-semibold text-stone-500 underline" onClick={limparSelecaoPessoa}>
            limpar
          </button>
        </div>
      )}

      <div className="mb-2 flex gap-1 overflow-x-auto rounded-card bg-stone-100 p-1 print:hidden">
        {ABAS_CATEGORIA.map((a) => (
          <button
            key={a.id}
            onClick={() => setCategoria(a.id)}
            className={`whitespace-nowrap rounded-card px-4 py-2 text-sm font-semibold transition-colors ${
              categoria === a.id ? "bg-superficie text-primaria-escura shadow-card" : "text-stone-600 hover:bg-white"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {linhas.length === 0 ? (
        <Vazio mensagem="Nenhum pagamento encontrado para esse filtro." />
      ) : (
        <div className="card p-0 sm:p-2">
          <Tabela cabecalho={["Data", "Nome", "Categoria", "Banco", "Origem", "Dias", "Valor"]}>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap px-3 py-2.5 text-stone-600">{dataBR(l.data)}</td>
                <td className="px-3 py-2.5 font-medium">{l.nome}</td>
                <td className="px-3 py-2.5">
                  {l.categoria === "motoboy" && <Badge cor="azul">Motoboy</Badge>}
                  {l.categoria === "freelancer" && <Badge cor="verde">Freelancer</Badge>}
                  {l.categoria === "clt" && <Badge cor="laranja">CLT</Badge>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-stone-600">{l.banco}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-stone-600">{l.origem}</td>
                <td className="px-3 py-2.5 text-center text-stone-600">{l.dias}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">{moeda(l.valor)}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}
    </div>
  );
}
