"use client";

// Registro de referência de quem usa o sistema — NÃO controla o acesso de verdade.
// O acesso real é feito pelo compartilhamento do projeto (e, no futuro, pelo login
// do Supabase Auth). Isso é só uma lista de consulta.

import { useState, type FormEvent } from "react";
import { Info, Plus } from "lucide-react";
import { Badge, Campo, Modal, Tabela, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import type { NivelAcesso, PessoaAcesso } from "@/lib/types";
import { BarraBusca, contem, RodapeFormulario } from "@/components/cadastros/comum";

const NIVEIS: { id: NivelAcesso; rotulo: string; cor: "verde" | "azul" | "cinza" }[] = [
  { id: "administrador", rotulo: "Administrador", cor: "verde" },
  { id: "colaborador", rotulo: "Colaborador", cor: "azul" },
  { id: "consulta", rotulo: "Só consulta", cor: "cinza" },
];

function nivelInfo(nivel: NivelAcesso) {
  return NIVEIS.find((n) => n.id === nivel) ?? NIVEIS[1];
}

function pessoaVazia(): PessoaAcesso {
  return { id: "", nome: "", nivel: "colaborador" };
}

export function AbaPessoasAcesso() {
  const db = useDB();
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<PessoaAcesso | null>(null);

  const lista = db.pessoas_acesso
    .filter((p) => contem(busca, p.nome, p.email))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    mutate((banco) => {
      if (form.id) {
        const i = banco.pessoas_acesso.findIndex((p) => p.id === form.id);
        if (i >= 0) banco.pessoas_acesso[i] = form;
      } else {
        banco.pessoas_acesso.push({ ...form, id: uid("acesso") });
      }
    });
    setForm(null);
  }

  function excluir() {
    if (!form?.id) return;
    if (!window.confirm(`Remover "${form.nome}" desta lista?`)) return;
    mutate((banco) => {
      banco.pessoas_acesso = banco.pessoas_acesso.filter((p) => p.id !== form.id);
    });
    setForm(null);
  }

  return (
    <div>
      <div className="mb-4 flex items-start gap-2.5 rounded-card border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <Info size={18} className="mt-0.5 shrink-0" />
        <p>
          Isso é só um registro de referência — <strong>não controla o acesso de verdade</strong> ao sistema.
          Quem pode entrar aqui é decidido por quem você compartilha o projeto (e, mais adiante, pelo login real
          quando o Supabase for configurado).
        </p>
      </div>

      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <BarraBusca valor={busca} onMudar={setBusca} placeholder="Buscar por nome ou e-mail…" />
        <button className="btn-primario mb-4" onClick={() => setForm(pessoaVazia())}>
          <Plus size={16} /> Nova pessoa
        </button>
      </div>

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhuma pessoa registrada ainda." />
      ) : (
        <div className="card p-0 sm:p-2">
          <Tabela cabecalho={["Nome", "E-mail", "Nível", ""]}>
            {lista.map((p) => (
              <tr key={p.id} className="cursor-pointer transition-colors hover:bg-stone-50" onClick={() => setForm({ ...p })}>
                <td className="px-3 py-2.5 font-medium">{p.nome}</td>
                <td className="px-3 py-2.5 text-stone-600">{p.email ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <Badge cor={nivelInfo(p.nivel).cor}>{nivelInfo(p.nivel).rotulo}</Badge>
                </td>
                <td className="px-3 py-2.5" />
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      <Modal aberto={form !== null} titulo={form?.id ? "Editar pessoa" : "Nova pessoa"} onFechar={() => setForm(null)}>
        {form && (
          <form onSubmit={salvar} className="grid grid-cols-1 gap-3">
            <Campo rotulo="Nome *">
              <input className="campo" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </Campo>
            <Campo rotulo="E-mail (Google)">
              <input
                type="email"
                className="campo"
                placeholder="nome@gmail.com"
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value || undefined })}
              />
            </Campo>
            <Campo rotulo="Nível *">
              <select className="campo" value={form.nivel} onChange={(e) => setForm({ ...form, nivel: e.target.value as NivelAcesso })}>
                {NIVEIS.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.rotulo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Observação">
              <input
                className="campo"
                value={form.observacao ?? ""}
                onChange={(e) => setForm({ ...form, observacao: e.target.value || undefined })}
              />
            </Campo>
            <RodapeFormulario onExcluir={form.id ? excluir : undefined} rotuloExcluir="Remover" />
          </form>
        )}
      </Modal>
    </div>
  );
}
