"use client";

// Bancos usados pra pagar a equipe — molde igual ao de AbaUnidades.tsx.

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Campo, Modal, Tabela, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import type { Banco } from "@/lib/types";
import { BarraBusca, contem, RodapeFormulario } from "@/components/cadastros/comum";

export function AbaBancos() {
  const db = useDB();
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Banco | null>(null);

  const lista = db.bancos.filter((b) => contem(busca, b.nome)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    mutate((banco) => {
      if (form.id) {
        const i = banco.bancos.findIndex((b) => b.id === form.id);
        if (i >= 0) banco.bancos[i] = form;
      } else {
        banco.bancos.push({ ...form, id: uid("banco") });
      }
    });
    setForm(null);
  }

  function excluir() {
    if (!form?.id) return;
    const emUso = db.pagamentos_rh.some((p) => p.banco_id === form.id);
    const aviso = emUso
      ? `O banco "${form.nome}" está usado em pagamentos já registrados. Excluir mesmo assim?`
      : `Excluir o banco "${form.nome}"? Esta ação não pode ser desfeita.`;
    if (!window.confirm(aviso)) return;
    mutate((banco) => {
      banco.bancos = banco.bancos.filter((b) => b.id !== form.id);
    });
    setForm(null);
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <BarraBusca valor={busca} onMudar={setBusca} placeholder="Buscar banco…" />
        <button className="btn-primario mb-4" onClick={() => setForm({ id: "", nome: "" })}>
          <Plus size={16} /> Novo banco
        </button>
      </div>

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhum banco cadastrado." />
      ) : (
        <div className="card p-0 sm:p-2">
          <Tabela cabecalho={["Nome"]}>
            {lista.map((b) => (
              <tr key={b.id} className="cursor-pointer transition-colors hover:bg-stone-50" onClick={() => setForm({ ...b })}>
                <td className="px-3 py-2.5 font-medium">{b.nome}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      <Modal aberto={form !== null} titulo={form?.id ? "Editar banco" : "Novo banco"} onFechar={() => setForm(null)}>
        {form && (
          <form onSubmit={salvar} className="grid grid-cols-1 gap-3">
            <Campo rotulo="Nome *">
              <input
                className="campo"
                required
                placeholder="ex.: Sicoob"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </Campo>
            <RodapeFormulario onExcluir={form.id ? excluir : undefined} />
          </form>
        )}
      </Modal>
    </div>
  );
}
