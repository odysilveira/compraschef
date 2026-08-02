"use client";

import { useState, type FormEvent } from "react";
import { Plus, Tags } from "lucide-react";
import { Campo, Modal, Tabela, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import type { CategoriaProduto } from "@/lib/types";
import { BarraBusca, contem } from "./comum";

function categoriaVazia(): CategoriaProduto {
  return { id: "", nome: "", codigo: "", ativo: true };
}

export function AbaCategorias() {
  const db = useDB();
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<CategoriaProduto | null>(null);

  const lista = (db.categorias_produtos ?? [])
    .filter((c) => c.ativo)
    .filter((c) => contem(busca, c.nome, c.codigo))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const codigo = (form.codigo || form.nome)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    mutate((banco) => {
      if (form.id) {
        const i = banco.categorias_produtos.findIndex((c) => c.id === form.id);
        if (i >= 0) banco.categorias_produtos[i] = { ...banco.categorias_produtos[i], nome: form.nome, codigo };
      } else {
        banco.categorias_produtos.push({ id: uid("cat"), nome: form.nome, codigo: codigo || "sem-categoria", ativo: true });
      }
    });
    setForm(null);
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <BarraBusca valor={busca} onMudar={setBusca} placeholder="Buscar por nome ou código" />
        <button className="btn-primario mb-4" onClick={() => setForm(categoriaVazia())}>
          <Plus size={16} /> Nova categoria
        </button>
      </div>

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhuma categoria cadastrada." />
      ) : (
        <div className="card p-0 sm:p-2">
          <Tabela cabecalho={["Nome", "Código"]}>
            {lista.map((categoria) => (
              <tr key={categoria.id} className="cursor-pointer transition-colors hover:bg-slate-50" onClick={() => setForm({ ...categoria })}>
                <td className="px-3 py-2.5 font-medium">{categoria.nome}</td>
                <td className="px-3 py-2.5">{categoria.codigo}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      <Modal aberto={form !== null} titulo={form?.id ? "Editar categoria" : "Nova categoria"} onFechar={() => setForm(null)}>
        {form && (
          <form onSubmit={salvar} className="space-y-3">
            <Campo rotulo="Nome *">
              <input className="campo" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </Campo>
            <Campo rotulo="Código (opcional)">
              <input className="campo" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </Campo>
            <p className="text-xs text-slate-500">Se o código ficar vazio, o sistema gera um identificador automaticamente.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secundario" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario">
                <Tags size={18} /> Salvar categoria
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
