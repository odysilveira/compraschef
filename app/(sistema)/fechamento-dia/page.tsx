"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, Campo, StatCard, TituloPagina } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import {
  calcularFechamentoDia,
  formatarPercentualIndice,
  garantirFechamentoDoDia,
  listarSnapshotsPratosFechamento,
  montarLinhaVenda,
  rateioSalarioDiario,
  rotuloCanalFechamento,
  sugerirFreelas,
  sugerirMaoObraFixa,
} from "@/lib/domain/fechamento-dia";
import { moeda } from "@/lib/format";
import type { CanalFechamentoDia, FechamentoDia } from "@/lib/types";

function hojeIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function FechamentoDiaPage() {
  const db = useDB();
  const [data, setData] = useState(hojeIso);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [receitaNova, setReceitaNova] = useState("");
  const [canalNovo, setCanalNovo] = useState<CanalFechamentoDia>("balcao");
  const [qtdNova, setQtdNova] = useState("1");
  const [freelaId, setFreelaId] = useState("");
  const [freelaHoras, setFreelaHoras] = useState("4");
  const [freelaValor, setFreelaValor] = useState("");

  const snapshots = useMemo(() => listarSnapshotsPratosFechamento(db), [db]);
  const fechamento = useMemo(() => {
    const existente = (db.fechamentos_dia ?? []).find((f) => f.data === data);
    return existente ?? {
      id: `fech-${data}`,
      data,
      vendas: [],
      mao_obra: [],
      custo_motoboy: 0,
      dias_rateio_folha: 30,
      criado_em: "",
      atualizado_em: "",
    } satisfies FechamentoDia;
  }, [db.fechamentos_dia, data]);

  const resultado = useMemo(() => calcularFechamentoDia(fechamento), [fechamento]);
  const freelasDisponiveis = useMemo(() => sugerirFreelas(db.pessoas ?? []), [db.pessoas]);
  const fixosSugeridos = useMemo(
    () => sugerirMaoObraFixa(db.pessoas ?? [], fechamento.dias_rateio_folha || 30),
    [db.pessoas, fechamento.dias_rateio_folha]
  );

  function atualizarFechamento(fn: (f: FechamentoDia) => void) {
    setMensagem(null);
    mutate((banco) => {
      const alvo = garantirFechamentoDoDia(banco, data);
      fn(alvo);
      alvo.atualizado_em = new Date().toISOString();
    });
  }

  function adicionarVenda() {
    if (!receitaNova) return;
    const snap = snapshots.find((s) => s.receita_id === receitaNova);
    if (!snap) return;
    const qtd = Number(qtdNova);
    if (!Number.isFinite(qtd) || qtd <= 0) return;
    atualizarFechamento((f) => {
      f.vendas.push(montarLinhaVenda(snap, canalNovo, qtd, uid("vdia")));
    });
    setQtdNova("1");
    setMensagem("Venda lançada.");
  }

  function removerVenda(id: string) {
    atualizarFechamento((f) => {
      f.vendas = f.vendas.filter((v) => v.id !== id);
    });
  }

  function alterarQtdVenda(id: string, quantidade: number) {
    atualizarFechamento((f) => {
      const linha = f.vendas.find((v) => v.id === id);
      if (linha) linha.quantidade = Math.max(0, quantidade);
    });
  }

  function toggleFixo(pessoaId: string, nome: string, marcado: boolean) {
    atualizarFechamento((f) => {
      if (marcado) {
        if (f.mao_obra.some((m) => m.pessoa_id === pessoaId && m.tipo === "fixo_rateado")) return;
        const sugestao = fixosSugeridos.find((s) => s.pessoa_id === pessoaId);
        f.mao_obra.push({
          id: uid("mob"),
          pessoa_id: pessoaId,
          nome,
          tipo: "fixo_rateado",
          valor: sugestao?.valor ?? rateioSalarioDiario(0, f.dias_rateio_folha),
        });
      } else {
        f.mao_obra = f.mao_obra.filter(
          (m) => !(m.pessoa_id === pessoaId && m.tipo === "fixo_rateado")
        );
      }
    });
  }

  function adicionarFreela() {
    if (!freelaId) return;
    const pessoa = freelasDisponiveis.find((p) => p.id === freelaId);
    if (!pessoa) return;
    const horas = Number(freelaHoras) || 0;
    let valor = Number(String(freelaValor).replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      valor = horas * (pessoa.valor_hora ?? 0);
    }
    if (valor <= 0) return;
    atualizarFechamento((f) => {
      f.mao_obra.push({
        id: uid("mob"),
        pessoa_id: pessoa.id,
        nome: pessoa.nome,
        tipo: "freela",
        valor: Number(valor.toFixed(2)),
        horas: horas || undefined,
      });
    });
    setFreelaValor("");
    setMensagem("Freela adicionado ao dia.");
  }

  function removerMaoObra(id: string) {
    atualizarFechamento((f) => {
      f.mao_obra = f.mao_obra.filter((m) => m.id !== id);
    });
  }

  const fixosMarcados = new Set(
    fechamento.mao_obra.filter((m) => m.tipo === "fixo_rateado").map((m) => m.pessoa_id)
  );

  return (
    <div className="space-y-4">
      <TituloPagina
        titulo="Fechamento do dia"
        subtitulo="CMV ponderado pelas vendas, Prime Cost (comida + mão de obra) e quanto sobrou no dia."
      />

      <Card className="flex flex-wrap items-end gap-3">
        <Campo rotulo="Data">
          <input
            type="date"
            className="campo"
            value={data}
            onChange={(e) => {
              setData(e.target.value);
              setMensagem(null);
            }}
          />
        </Campo>
        <Campo rotulo="Dias p/ ratear folha">
          <input
            type="number"
            min={1}
            className="campo w-28"
            value={fechamento.dias_rateio_folha}
            onChange={(e) =>
              atualizarFechamento((f) => {
                f.dias_rateio_folha = Math.max(1, Number(e.target.value) || 30);
                for (const item of f.mao_obra) {
                  if (item.tipo !== "fixo_rateado") continue;
                  const pessoa = (db.pessoas ?? []).find((p) => p.id === item.pessoa_id);
                  if (pessoa?.salario) {
                    item.valor = rateioSalarioDiario(pessoa.salario, f.dias_rateio_folha);
                  }
                }
              })
            }
          />
        </Campo>
        <Campo rotulo="Motoboy / delivery (R$)">
          <input
            type="number"
            min={0}
            step="0.01"
            className="campo w-36"
            value={fechamento.custo_motoboy || ""}
            placeholder="0"
            onChange={(e) =>
              atualizarFechamento((f) => {
                f.custo_motoboy = Number(e.target.value) || 0;
              })
            }
          />
        </Campo>
      </Card>

      {mensagem && (
        <p className="rounded-card bg-sucesso-clara px-3 py-2 text-sm text-primaria-escura">{mensagem}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard rotulo="Receita bruta" valor={moeda(resultado.receita_bruta)} cor="cinza" />
        <StatCard
          rotulo="CMV ponderado"
          valor={formatarPercentualIndice(resultado.cmv_ponderado_percentual)}
          cor="amarelo"
          subtexto={`Custo comida ${moeda(resultado.custo_food)}`}
        />
        <StatCard
          rotulo="Prime Cost"
          valor={formatarPercentualIndice(resultado.prime_cost_percentual)}
          cor="laranja"
          subtexto={`${moeda(resultado.prime_cost)} (comida + mão de obra)`}
        />
        <StatCard
          rotulo="Sobra do dia"
          valor={moeda(resultado.sobra_dia)}
          cor={resultado.sobra_dia >= 0 ? "verde" : "vermelho"}
          subtexto={formatarPercentualIndice(resultado.sobra_percentual)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard rotulo="Receita líquida" valor={moeda(resultado.receita_liquida)} cor="cinza" />
        <StatCard
          rotulo="Taxas iFood/99"
          valor={moeda(resultado.taxas_canais)}
          cor="cinza"
          subtexto={`+ motoboy ${moeda(resultado.custo_motoboy)}`}
        />
        <StatCard
          rotulo="Mão de obra"
          valor={moeda(resultado.mao_obra_total)}
          cor="cinza"
          subtexto={`Fixa ${moeda(resultado.mao_obra_fixa)} · Freela ${moeda(resultado.mao_obra_freela)}`}
        />
        <StatCard rotulo="Pratos vendidos" valor={String(resultado.qtd_pratos)} cor="cinza" />
      </div>

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold text-stone-800">Vendas do dia</h3>
        <p className="text-sm text-stone-600">
          Lance a quantidade por prato e canal. O custo vem da ficha; as taxas de iFood/99 vêm do cadastro do
          canal.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Campo rotulo="Prato">
            <select
              className="campo min-w-[220px]"
              value={receitaNova}
              onChange={(e) => setReceitaNova(e.target.value)}
            >
              <option value="">Selecione…</option>
              {snapshots.map((s) => (
                <option key={s.receita_id} value={s.receita_id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Canal">
            <select
              className="campo"
              value={canalNovo}
              onChange={(e) => setCanalNovo(e.target.value as CanalFechamentoDia)}
            >
              <option value="balcao">Loja / Saipos</option>
              <option value="ifood">iFood</option>
              <option value="delivery_99">99</option>
            </select>
          </Campo>
          <Campo rotulo="Qtd">
            <input
              type="number"
              min={1}
              step={1}
              className="campo w-24"
              value={qtdNova}
              onChange={(e) => setQtdNova(e.target.value)}
            />
          </Campo>
          <button type="button" className="btn-primario text-sm" onClick={adicionarVenda}>
            <Plus className="h-4 w-4" /> Lançar
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="rotulo px-2 py-2">Prato</th>
                <th className="rotulo px-2 py-2">Canal</th>
                <th className="rotulo px-2 py-2">Qtd</th>
                <th className="rotulo px-2 py-2">Preço</th>
                <th className="rotulo px-2 py-2">Custo</th>
                <th className="rotulo px-2 py-2">Receita</th>
                <th className="rotulo px-2 py-2">Taxa</th>
                <th className="rotulo px-2 py-2"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {fechamento.vendas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-2 py-4 text-stone-500">
                    Nenhuma venda lançada neste dia.
                  </td>
                </tr>
              ) : (
                fechamento.vendas.map((venda) => {
                  const receita = venda.quantidade * venda.preco_unitario;
                  const taxa =
                    receita * (venda.taxa_percentual / 100) + venda.quantidade * venda.taxa_fixa;
                  return (
                    <tr key={venda.id}>
                      <td className="px-2 py-2 font-medium">{venda.nome}</td>
                      <td className="px-2 py-2">{rotuloCanalFechamento(venda.canal)}</td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          className="campo w-20"
                          value={venda.quantidade}
                          onChange={(e) => alterarQtdVenda(venda.id, Number(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-2 py-2">{moeda(venda.preco_unitario)}</td>
                      <td className="px-2 py-2">{moeda(venda.custo_unitario)}</td>
                      <td className="px-2 py-2 font-semibold">{moeda(receita)}</td>
                      <td className="px-2 py-2 text-stone-600">
                        {venda.taxa_percentual > 0 || venda.taxa_fixa > 0
                          ? moeda(taxa)
                          : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="btn-secundario text-xs text-red-600"
                          onClick={() => removerVenda(venda.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <h3 className="text-sm font-semibold text-stone-800">Folha fixa (rateada no dia)</h3>
          <p className="text-sm text-stone-600">
            Marque quem trabalhou. Valor = salário ÷ {fechamento.dias_rateio_folha} dias.
          </p>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {fixosSugeridos.length === 0 ? (
              <p className="text-sm text-stone-500">Nenhum colaborador com salário cadastrado.</p>
            ) : (
              fixosSugeridos.map((pessoa) => (
                <label
                  key={pessoa.pessoa_id}
                  className="flex items-center justify-between gap-2 rounded-card border border-stone-200 px-3 py-2 text-sm"
                >
                  <span className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={fixosMarcados.has(pessoa.pessoa_id)}
                      onChange={(e) => toggleFixo(pessoa.pessoa_id, pessoa.nome, e.target.checked)}
                    />
                    {pessoa.nome}
                  </span>
                  <span className="font-semibold text-stone-700">{moeda(pessoa.valor)}</span>
                </label>
              ))
            )}
          </div>
        </Card>

        <Card className="space-y-3">
          <h3 className="text-sm font-semibold text-stone-800">Freelas do dia</h3>
          <div className="flex flex-wrap items-end gap-2">
            <Campo rotulo="Pessoa">
              <select
                className="campo min-w-[180px]"
                value={freelaId}
                onChange={(e) => {
                  setFreelaId(e.target.value);
                  const p = freelasDisponiveis.find((x) => x.id === e.target.value);
                  if (p?.valor_hora) {
                    const h = Number(freelaHoras) || 0;
                    setFreelaValor(h > 0 ? String(h * p.valor_hora) : "");
                  }
                }}
              >
                <option value="">Selecione…</option>
                {freelasDisponiveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                    {p.valor_hora ? ` (R$ ${p.valor_hora}/h)` : ""}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Horas">
              <input
                type="number"
                min={0}
                step="0.5"
                className="campo w-24"
                value={freelaHoras}
                onChange={(e) => {
                  setFreelaHoras(e.target.value);
                  const p = freelasDisponiveis.find((x) => x.id === freelaId);
                  if (p?.valor_hora) {
                    setFreelaValor(String((Number(e.target.value) || 0) * p.valor_hora));
                  }
                }}
              />
            </Campo>
            <Campo rotulo="Valor (R$)">
              <input
                type="number"
                min={0}
                step="0.01"
                className="campo w-28"
                value={freelaValor}
                onChange={(e) => setFreelaValor(e.target.value)}
              />
            </Campo>
            <button type="button" className="btn-primario text-sm" onClick={adicionarFreela}>
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          <ul className="space-y-2">
            {fechamento.mao_obra
              .filter((m) => m.tipo === "freela")
              .map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded-card border border-stone-200 px-3 py-2 text-sm"
                >
                  <span>
                    {item.nome}
                    {item.horas ? ` · ${item.horas} h` : ""}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <strong>{moeda(item.valor)}</strong>
                    <button
                      type="button"
                      className="btn-secundario text-xs text-red-600"
                      onClick={() => removerMaoObra(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      </div>

      <Card className="space-y-2">
        <h3 className="text-sm font-semibold text-stone-800">Como o índice é calculado</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600">
          <li>
            <strong>CMV ponderado</strong> = custo dos pratos vendidos ÷ receita bruta
          </li>
          <li>
            <strong>Receita líquida</strong> = receita bruta − taxas iFood/99 − motoboy
          </li>
          <li>
            <strong>Prime Cost</strong> = custo dos pratos + folha rateada + freelas
          </li>
          <li>
            <strong>Sobra do dia</strong> = receita líquida − custo dos pratos − mão de obra
          </li>
        </ul>
      </Card>
    </div>
  );
}
