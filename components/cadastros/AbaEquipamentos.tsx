"use client";

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Campo, Modal, Tabela, Vazio } from "@/components/ui";
import { SelectContaDre } from "@/components/cadastros/SelectContaDre";
import { mutate, uid, useDB } from "@/lib/data";
import { depreciacaoMensalEquipamento } from "@/lib/domain/dre";
import { moeda } from "@/lib/format";
import type { Equipamento } from "@/lib/types";
import { BarraBusca, contem, numOpcional, RodapeFormulario } from "./comum";

function equipamentoVazio(): Equipamento {
  return {
    id: "",
    nome: "",
    valor_aquisicao: 0,
    data_inicio: new Date().toISOString().slice(0, 10),
    vida_util_meses: 60,
    conta_dre_id: "dre-op-depreciacao",
    ativo: true,
  };
}

export function AbaEquipamentos() {
  const db = useDB();
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Equipamento | null>(null);

  const lista = (db.equipamentos ?? [])
    .filter((e) => e.ativo)
    .filter((e) => contem(busca, e.nome, e.observacao ?? ""))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.nome.trim() || form.valor_aquisicao <= 0 || form.vida_util_meses <= 0) {
      window.alert("Informe nome, valor de aquisição e vida útil em meses.");
      return;
    }
    mutate((banco) => {
      if (!Array.isArray(banco.equipamentos)) banco.equipamentos = [];
      if (form.id) {
        const i = banco.equipamentos.findIndex((x) => x.id === form.id);
        if (i >= 0) banco.equipamentos[i] = { ...form, nome: form.nome.trim() };
      } else {
        banco.equipamentos.push({ ...form, id: uid("eq"), nome: form.nome.trim() });
      }
    });
    setForm(null);
  }

  function excluir() {
    if (!form?.id) return;
    if (!window.confirm(`Desativar o equipamento "${form.nome}"?`)) return;
    mutate((banco) => {
      const i = (banco.equipamentos ?? []).findIndex((x) => x.id === form.id);
      if (i >= 0) banco.equipamentos![i] = { ...banco.equipamentos![i], ativo: false };
    });
    setForm(null);
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <BarraBusca valor={busca} onMudar={setBusca} placeholder="Buscar equipamento…" />
        <button className="btn-primario mb-4" onClick={() => setForm(equipamentoVazio())}>
          <Plus size={16} /> Novo equipamento
        </button>
      </div>

      <p className="mb-4 text-sm text-stone-600">
        Cadastre o imobilizado com valor e vida útil em meses. No DRE entra só a depreciação mensal
        (valor ÷ meses), não a compra inteira.
      </p>

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhum equipamento cadastrado." />
      ) : (
        <div className="card p-0 sm:p-2">
          <Tabela cabecalho={["Nome", "Aquisição", "Vida útil", "Depreciação/mês"]}>
            {lista.map((eq) => (
              <tr
                key={eq.id}
                className="cursor-pointer transition-colors hover:bg-slate-50"
                onClick={() => setForm({ ...eq })}
              >
                <td className="px-3 py-2.5 font-medium">{eq.nome}</td>
                <td className="px-3 py-2.5">{moeda(eq.valor_aquisicao)}</td>
                <td className="px-3 py-2.5">{eq.vida_util_meses} meses</td>
                <td className="px-3 py-2.5">{moeda(depreciacaoMensalEquipamento(eq))}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      <Modal
        aberto={form !== null}
        titulo={form?.id ? "Editar equipamento" : "Novo equipamento"}
        onFechar={() => setForm(null)}
      >
        {form && (
          <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome *">
              <input
                className="campo"
                required
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Data de início *">
              <input
                type="date"
                className="campo"
                required
                value={form.data_inicio}
                onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Valor de aquisição *">
              <input
                type="number"
                min={0}
                step="any"
                required
                className="campo"
                value={form.valor_aquisicao || ""}
                onChange={(e) =>
                  setForm({ ...form, valor_aquisicao: numOpcional(e.target.value) ?? 0 })
                }
              />
            </Campo>
            <Campo rotulo="Vida útil (meses) *">
              <input
                type="number"
                min={1}
                step={1}
                required
                className="campo"
                value={form.vida_util_meses || ""}
                onChange={(e) =>
                  setForm({ ...form, vida_util_meses: numOpcional(e.target.value) ?? 1 })
                }
              />
            </Campo>
            <Campo rotulo="Conta DRE (depreciação)">
              <SelectContaDre
                db={db}
                value={form.conta_dre_id}
                grupos={["fixo_operacao"]}
                onChange={(id) => setForm({ ...form, conta_dre_id: id })}
              />
            </Campo>
            <Campo rotulo="Depreciação mensal">
              <div className="campo h-11 leading-11 text-slate-700">
                {moeda(depreciacaoMensalEquipamento(form))}
              </div>
            </Campo>
            <Campo rotulo="Observação">
              <input
                className="campo"
                value={form.observacao ?? ""}
                onChange={(e) => setForm({ ...form, observacao: e.target.value || undefined })}
              />
            </Campo>
            <div className="sm:col-span-2">
              <RodapeFormulario onExcluir={form.id ? excluir : undefined} />
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
