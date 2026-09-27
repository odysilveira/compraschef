"use client";

// Cadastro da equipe de RH: motoboys e freelancers/CLT.
// Molde igual ao de components/cadastros/AbaFornecedores.tsx.

import { useState, type FormEvent } from "react";
import { Bike, ChefHat, Pencil, Plus } from "lucide-react";
import { Badge, Campo, Modal, StatCard, Tabela, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import type { Colaborador, DiaSemana, Funcao, Turno } from "@/lib/types";
import { BarraBusca, contem, RodapeFormulario } from "@/components/cadastros/comum";

const TURNOS: { id: Turno; rotulo: string }[] = [
  { id: "almoco", rotulo: "Almoço" },
  { id: "jantar", rotulo: "Jantar" },
];

const FUNCOES: { id: Funcao; rotulo: string }[] = [
  { id: "cozinha", rotulo: "Cozinha" },
  { id: "balcao", rotulo: "Balcão" },
  { id: "outros", rotulo: "Outros" },
];

const DIAS_SEMANA: { id: DiaSemana; rotulo: string }[] = [
  { id: "seg", rotulo: "Seg" },
  { id: "ter", rotulo: "Ter" },
  { id: "qua", rotulo: "Qua" },
  { id: "qui", rotulo: "Qui" },
  { id: "sex", rotulo: "Sex" },
  { id: "sab", rotulo: "Sáb" },
  { id: "dom", rotulo: "Dom" },
];

function colaboradorVazio(): Colaborador {
  return {
    id: "",
    nome: "",
    categoria: "motoboy",
    clt: false,
    tipo_chave: "celular",
    chave: "",
    turnos: [],
    ativo: true,
  };
}

export function AbaColaboradores() {
  const db = useDB();
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Colaborador | null>(null);

  const lista = db.colaboradores
    .filter((c) => c.ativo)
    .filter((c) => contem(busca, c.nome, c.nome_social, c.cpf, c.telefone))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  function alterar(mudanca: Partial<Colaborador>) {
    setForm((atual) => (atual ? { ...atual, ...mudanca } : atual));
  }

  function alternarTurno(t: Turno) {
    setForm((atual) => {
      if (!atual) return atual;
      const turnos = atual.turnos ?? [];
      return { ...atual, turnos: turnos.includes(t) ? turnos.filter((x) => x !== t) : [...turnos, t] };
    });
  }

  function alternarDia(d: DiaSemana) {
    setForm((atual) => {
      if (!atual) return atual;
      const dias = atual.dias_disponiveis ?? [];
      return { ...atual, dias_disponiveis: dias.includes(d) ? dias.filter((x) => x !== d) : [...dias, d] };
    });
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    mutate((banco) => {
      if (form.id) {
        const i = banco.colaboradores.findIndex((c) => c.id === form.id);
        if (i >= 0) banco.colaboradores[i] = form;
      } else {
        banco.colaboradores.push({ ...form, id: uid("colab") });
      }
    });
    setForm(null);
  }

  function excluir() {
    if (!form?.id) return;
    if (!window.confirm(`Desativar "${form.nome}"? Sai das listas, mas o histórico de pagamentos é mantido.`)) return;
    mutate((banco) => {
      const c = banco.colaboradores.find((x) => x.id === form.id);
      if (c) c.ativo = false;
    });
    setForm(null);
  }

  const total = db.colaboradores.filter((c) => c.ativo).length;
  const motoboys = db.colaboradores.filter((c) => c.ativo && c.categoria === "motoboy").length;
  const freelancers = db.colaboradores.filter((c) => c.ativo && c.categoria === "freelancer" && !c.clt).length;
  const clt = db.colaboradores.filter((c) => c.ativo && c.categoria === "freelancer" && c.clt).length;

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard rotulo="Total" valor={total} cor="cinza" />
        <StatCard rotulo="Motoboys" valor={motoboys} cor="amarelo" />
        <StatCard rotulo="Freelancers" valor={freelancers} cor="verde" />
        <StatCard rotulo="CLT" valor={clt} cor="laranja" />
      </div>

      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <BarraBusca valor={busca} onMudar={setBusca} placeholder="Buscar por nome, CPF, telefone…" />
        <button className="btn-primario mb-4" onClick={() => setForm(colaboradorVazio())}>
          <Plus size={16} /> Nova pessoa
        </button>
      </div>

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhuma pessoa encontrada." />
      ) : (
        <div className="card p-0 sm:p-2">
          <Tabela cabecalho={["Nome", "Categoria", "Contato", "Chave Pix", "Status", ""]}>
            {lista.map((c) => (
              <tr key={c.id} className="cursor-pointer transition-colors hover:bg-stone-50" onClick={() => setForm({ ...c })}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primaria-clara text-primaria-escura">
                      {c.categoria === "motoboy" ? <Bike size={15} /> : <ChefHat size={15} />}
                    </span>
                    <span>
                      <span className="block font-medium">{c.nome}</span>
                      {c.nome_social && <span className="block text-xs text-stone-500">{c.nome_social}</span>}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  {c.categoria === "motoboy" ? (
                    <Badge cor="azul">Motoboy</Badge>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      <Badge cor="verde">Freelancer</Badge>
                      {c.clt && <Badge cor="laranja">CLT</Badge>}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-stone-600">{c.telefone ?? c.cpf ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-stone-600">{c.chave || "—"}</td>
                <td className="px-3 py-2.5">
                  <Badge cor="verde">Ativo</Badge>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-texto"
                    aria-label={`Editar ${c.nome}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setForm({ ...c });
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      <Modal aberto={form !== null} titulo={form?.id ? "Editar pessoa" : "Nova pessoa"} onFechar={() => setForm(null)}>
        {form && (
          <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Campo rotulo="Nome *">
                <input className="campo" required value={form.nome} onChange={(e) => alterar({ nome: e.target.value })} />
              </Campo>
            </div>
            <Campo rotulo="Nome social">
              <input className="campo" value={form.nome_social ?? ""} onChange={(e) => alterar({ nome_social: e.target.value || undefined })} />
            </Campo>
            <Campo rotulo="Telefone">
              <input
                className="campo"
                placeholder="(11) 90000-0000"
                value={form.telefone ?? ""}
                onChange={(e) => alterar({ telefone: e.target.value || undefined })}
              />
            </Campo>
            <Campo rotulo="CPF">
              <input className="campo" placeholder="000.000.000-00" value={form.cpf ?? ""} onChange={(e) => alterar({ cpf: e.target.value || undefined })} />
            </Campo>
            <Campo rotulo="Categoria *">
              <select
                className="campo"
                value={form.categoria}
                onChange={(e) => {
                  const categoria = e.target.value as Colaborador["categoria"];
                  alterar({ categoria, ...(categoria === "motoboy" ? { clt: false, funcao: undefined } : {}) });
                }}
              >
                <option value="motoboy">Motoboy</option>
                <option value="freelancer">Freelancer / CLT</option>
              </select>
            </Campo>

            {form.categoria === "freelancer" && (
              <Campo rotulo="Vínculo">
                <button
                  type="button"
                  onClick={() => alterar({ clt: !form.clt })}
                  className={`campo flex items-center justify-between font-semibold transition-colors ${
                    form.clt ? "border-primaria bg-primaria-clara text-primaria-escura" : "text-stone-500"
                  }`}
                >
                  <span>CLT (registrado)</span>
                  <span>{form.clt ? "Sim" : "Não — freela avulso"}</span>
                </button>
              </Campo>
            )}

            <Campo rotulo="Tipo de chave Pix *">
              <select className="campo" value={form.tipo_chave} onChange={(e) => alterar({ tipo_chave: e.target.value as Colaborador["tipo_chave"] })}>
                <option value="celular">Celular</option>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="email">E-mail</option>
                <option value="aleatoria">Chave aleatória</option>
              </select>
            </Campo>
            <Campo rotulo="Chave Pix *">
              <input className="campo" required value={form.chave} onChange={(e) => alterar({ chave: e.target.value })} />
            </Campo>

            {form.categoria === "motoboy" ? (
              <div className="sm:col-span-2">
                <Campo rotulo="Turnos">
                  <div className="flex gap-2">
                    {TURNOS.map((t) => (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => alternarTurno(t.id)}
                        className={`campo w-auto px-3 py-1.5 text-sm font-semibold ${
                          form.turnos?.includes(t.id) ? "border-primaria bg-primaria-clara text-primaria-escura" : "text-stone-500"
                        }`}
                      >
                        {t.rotulo}
                      </button>
                    ))}
                  </div>
                </Campo>
              </div>
            ) : (
              <>
                <Campo rotulo="Função">
                  <select className="campo" value={form.funcao ?? ""} onChange={(e) => alterar({ funcao: (e.target.value || undefined) as Funcao | undefined })}>
                    <option value="">—</option>
                    {FUNCOES.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.rotulo}
                      </option>
                    ))}
                  </select>
                </Campo>
                <div className="sm:col-span-2">
                  <Campo rotulo="Dias disponíveis">
                    <div className="flex flex-wrap gap-2">
                      {DIAS_SEMANA.map((d) => (
                        <button
                          type="button"
                          key={d.id}
                          onClick={() => alternarDia(d.id)}
                          className={`campo w-auto px-3 py-1.5 text-sm font-semibold ${
                            form.dias_disponiveis?.includes(d.id) ? "border-primaria bg-primaria-clara text-primaria-escura" : "text-stone-500"
                          }`}
                        >
                          {d.rotulo}
                        </button>
                      ))}
                    </div>
                  </Campo>
                </div>
              </>
            )}

            <div className="sm:col-span-2">
              <Campo rotulo="Observação">
                <textarea className="campo" rows={2} value={form.observacao ?? ""} onChange={(e) => alterar({ observacao: e.target.value || undefined })} />
              </Campo>
            </div>

            <div className="sm:col-span-2">
              <RodapeFormulario onExcluir={form.id ? excluir : undefined} rotuloExcluir="Desativar" />
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
