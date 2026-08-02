"use client";

// Aba Unidades de medida — requisito 4.

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Campo, Modal, Tabela, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import type { Unidade } from "@/lib/types";
import { BarraBusca, contem, RodapeFormulario } from "./comum";

export function AbaUnidades() {
  const db = useDB();
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Unidade | null>(null);

  const lista = db.unidades
    .filter((u) => contem(busca, u.nome, u.sigla, u.codigo_externo))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    mutate((banco) => {
      if (form.id) {
        const i = banco.unidades.findIndex((u) => u.id === form.id);
        if (i >= 0) banco.unidades[i] = form;
      } else {
        banco.unidades.push({ ...form, id: uid("un") });
      }
    });
    setForm(null);
  }

  function excluir() {
    if (!form?.id) return;
    const emUso = db.produtos.some(
      (p) => p.ativo && (p.unidade_uso_id === form.id || p.unidade_compra_id === form.id)
    );
    const aviso = emUso
      ? `A unidade "${form.nome}" está em uso por produtos ativos. Excluir mesmo assim?`
      : `Excluir a unidade "${form.nome}"? Esta ação não pode ser desfeita.`;
    if (!window.confirm(aviso)) return;
    mutate((banco) => {
      banco.unidades = banco.unidades.filter((u) => u.id !== form.id);
    });
    setForm(null);
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <BarraBusca valor={busca} onMudar={setBusca} placeholder="Buscar por nome ou sigla…" />
        <button className="btn-primario mb-4" onClick={() => setForm({ id: "", nome: "", sigla: "" })}>
          <Plus size={16} /> Nova unidade
        </button>
      </div>

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhuma unidade encontrada." />
      ) : (
        <div className="card p-0 sm:p-2">
          <Tabela cabecalho={["Nome", "Sigla", "Código EaseEat"]}>
            {lista.map((u) => (
              <tr
                key={u.id}
                className="cursor-pointer transition-colors hover:bg-slate-50"
                onClick={() => setForm({ ...u })}
              >
                <td className="px-3 py-2.5 font-medium">{u.nome}</td>
                <td className="px-3 py-2.5">{u.sigla}</td>
                <td className="px-3 py-2.5 text-stone-600">{u.codigo_externo ?? "—"}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      <Modal
        aberto={form !== null}
        titulo={form?.id ? "Editar unidade" : "Nova unidade"}
        onFechar={() => setForm(null)}
      >
        {form && (
          <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome *">
              <input
                className="campo"
                required
                placeholder="ex.: quilograma"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Sigla *">
              <input
                className="campo"
                required
                placeholder="ex.: kg"
                value={form.sigla}
                onChange={(e) => setForm({ ...form, sigla: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Código no EaseEat">
              <input
                className="campo"
                placeholder="ex.: KG"
                value={form.codigo_externo ?? ""}
                onChange={(e) => setForm({ ...form, codigo_externo: e.target.value || undefined })}
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
