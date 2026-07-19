"use client";

// Aba Locais de armazenagem — requisito 4.

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Badge, Campo, Modal, Tabela, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import type { Local, TipoLocal } from "@/lib/types";
import { BarraBusca, contem, RodapeFormulario } from "./comum";

const ROTULO_TIPO: Record<TipoLocal, string> = {
  freezer: "Freezer",
  geladeira: "Geladeira",
  prateleira: "Prateleira",
  despensa: "Despensa",
};

export function AbaLocais() {
  const db = useDB();
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Local | null>(null);

  const lista = db.locais
    .filter((l) => contem(busca, l.nome, ROTULO_TIPO[l.tipo]))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    mutate((banco) => {
      if (form.id) {
        const i = banco.locais.findIndex((l) => l.id === form.id);
        if (i >= 0) banco.locais[i] = form;
      } else {
        banco.locais.push({ ...form, id: uid("loc") });
      }
    });
    setForm(null);
  }

  function excluir() {
    if (!form?.id) return;
    const emUso = db.caixas.some((c) => c.local_id === form.id && c.status !== "vazia");
    const aviso = emUso
      ? `Há caixas com produto guardadas em "${form.nome}". Excluir mesmo assim?`
      : `Excluir o local "${form.nome}"? Esta ação não pode ser desfeita.`;
    if (!window.confirm(aviso)) return;
    mutate((banco) => {
      banco.locais = banco.locais.filter((l) => l.id !== form.id);
    });
    setForm(null);
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <BarraBusca valor={busca} onMudar={setBusca} placeholder="Buscar por nome ou tipo…" />
        <button
          className="btn-primario mb-4"
          onClick={() => setForm({ id: "", nome: "", tipo: "prateleira" })}
        >
          <Plus size={16} /> Novo local
        </button>
      </div>

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhum local encontrado." />
      ) : (
        <div className="card p-0 sm:p-2">
          <Tabela cabecalho={["Nome", "Tipo"]}>
            {lista.map((l) => (
              <tr
                key={l.id}
                className="cursor-pointer transition-colors hover:bg-slate-50"
                onClick={() => setForm({ ...l })}
              >
                <td className="px-3 py-2.5 font-medium">{l.nome}</td>
                <td className="px-3 py-2.5">
                  <Badge cor={l.tipo === "freezer" || l.tipo === "geladeira" ? "azul" : "cinza"}>
                    {ROTULO_TIPO[l.tipo]}
                  </Badge>
                </td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      <Modal
        aberto={form !== null}
        titulo={form?.id ? "Editar local" : "Novo local"}
        onFechar={() => setForm(null)}
      >
        {form && (
          <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome *">
              <input
                className="campo"
                required
                placeholder="ex.: Freezer 1"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Tipo *">
              <select
                className="campo"
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoLocal })}
              >
                {(Object.keys(ROTULO_TIPO) as TipoLocal[]).map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO[t]}
                  </option>
                ))}
              </select>
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
