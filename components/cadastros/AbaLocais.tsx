"use client";

// Aba Locais de armazenagem — requisito 4.
// Tipos de local são cadastráveis (criar / excluir).

import { useState, type FormEvent } from "react";
import { Plus, Tags } from "lucide-react";
import { Badge, Campo, Modal, Tabela, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import type { Local, TipoLocalCadastro } from "@/lib/types";
import { BarraBusca, contem, RodapeFormulario } from "./comum";

function slugTipo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function rotuloTipo(tipos: TipoLocalCadastro[], codigo: string): string {
  return tipos.find((t) => t.codigo === codigo)?.nome ?? codigo;
}

function corBadgeTipo(codigo: string): "azul" | "cinza" {
  return codigo === "freezer" || codigo === "geladeira" ? "azul" : "cinza";
}

export function AbaLocais() {
  const db = useDB();
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Local | null>(null);
  const [gerenciarTipos, setGerenciarTipos] = useState(false);
  const [formTipo, setFormTipo] = useState<{ id: string; nome: string } | null>(null);

  const tipos = db.tipos_local ?? [];
  const tiposAtivos = tipos.filter((t) => t.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const lista = db.locais
    .filter((l) => contem(busca, l.nome, rotuloTipo(tipos, l.tipo), l.tipo))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  function tipoPadraoNovoLocal(): string {
    return tiposAtivos.find((t) => t.codigo === "prateleira")?.codigo ?? tiposAtivos[0]?.codigo ?? "";
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.tipo) {
      window.alert("Cadastre pelo menos um tipo de local antes de salvar.");
      return;
    }
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

  function salvarTipo(e: FormEvent) {
    e.preventDefault();
    if (!formTipo) return;
    const nome = formTipo.nome.trim();
    if (!nome) return;
    const codigoBase = slugTipo(nome) || "tipo";
    mutate((banco) => {
      if (!Array.isArray(banco.tipos_local)) banco.tipos_local = [];
      if (formTipo.id) {
        const i = banco.tipos_local.findIndex((t) => t.id === formTipo.id);
        if (i >= 0) {
          banco.tipos_local[i] = { ...banco.tipos_local[i], nome };
        }
      } else {
        let codigo = codigoBase;
        let n = 2;
        while (banco.tipos_local.some((t) => t.codigo === codigo)) {
          codigo = `${codigoBase}-${n++}`;
        }
        banco.tipos_local.push({ id: uid("tl"), nome, codigo, ativo: true });
      }
    });
    setFormTipo(null);
  }

  function excluirTipo(tipo: TipoLocalCadastro) {
    const emUso = db.locais.some((l) => l.tipo === tipo.codigo);
    if (emUso) {
      window.alert(
        `O tipo "${tipo.nome}" está em uso por um ou mais locais. Altere o tipo desses locais antes de excluir.`
      );
      return;
    }
    if (!window.confirm(`Excluir o tipo "${tipo.nome}"?`)) return;
    mutate((banco) => {
      banco.tipos_local = (banco.tipos_local ?? []).filter((t) => t.id !== tipo.id);
    });
    if (formTipo?.id === tipo.id) setFormTipo(null);
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <BarraBusca valor={busca} onMudar={setBusca} placeholder="Buscar por nome ou tipo…" />
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className="btn-secundario" onClick={() => setGerenciarTipos(true)}>
            <Tags size={16} /> Gerenciar tipos
          </button>
          <button
            className="btn-primario"
            onClick={() => setForm({ id: "", nome: "", tipo: tipoPadraoNovoLocal() })}
          >
            <Plus size={16} /> Novo local
          </button>
        </div>
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
                  <Badge cor={corBadgeTipo(l.tipo)}>{rotuloTipo(tipos, l.tipo)}</Badge>
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
              {tiposAtivos.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-stone-600">Nenhum tipo cadastrado.</p>
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() => {
                      setForm(null);
                      setGerenciarTipos(true);
                      setFormTipo({ id: "", nome: "" });
                    }}
                  >
                    Cadastrar tipo
                  </button>
                </div>
              ) : (
                <select
                  className="campo"
                  required
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                >
                  {!tiposAtivos.some((t) => t.codigo === form.tipo) && form.tipo ? (
                    <option value={form.tipo}>{rotuloTipo(tipos, form.tipo)} (inativo)</option>
                  ) : null}
                  {tiposAtivos.map((t) => (
                    <option key={t.id} value={t.codigo}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              )}
            </Campo>
            <div className="sm:col-span-2">
              <RodapeFormulario onExcluir={form.id ? excluir : undefined} />
            </div>
          </form>
        )}
      </Modal>

      <Modal aberto={gerenciarTipos} titulo="Tipos de local" onFechar={() => { setGerenciarTipos(false); setFormTipo(null); }}>
        <div className="space-y-4">
          <p className="text-sm text-stone-600">
            Cadastre os tipos usados nos locais (Freezer, Câmara fria, etc.). Só é possível excluir um tipo que não esteja em uso.
          </p>

          <div className="flex justify-end">
            <button type="button" className="btn-primario" onClick={() => setFormTipo({ id: "", nome: "" })}>
              <Plus size={16} /> Novo tipo
            </button>
          </div>

          {tiposAtivos.length === 0 ? (
            <Vazio mensagem="Nenhum tipo cadastrado." />
          ) : (
            <div className="card p-0 sm:p-2">
              <Tabela cabecalho={["Nome", ""]}>
                {tiposAtivos.map((t) => (
                  <tr key={t.id} className="transition-colors hover:bg-slate-50">
                    <td
                      className="cursor-pointer px-3 py-2.5 font-medium"
                      onClick={() => setFormTipo({ id: t.id, nome: t.nome })}
                    >
                      {t.nome}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        className="btn-secundario text-xs"
                        onClick={() => excluirTipo(t)}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </Tabela>
            </div>
          )}

          {formTipo && (
            <form onSubmit={salvarTipo} className="space-y-3 rounded-card border border-stone-200 p-3">
              <Campo rotulo={formTipo.id ? "Editar nome *" : "Nome do tipo *"}>
                <input
                  className="campo"
                  required
                  autoFocus
                  placeholder="ex.: Câmara fria"
                  value={formTipo.nome}
                  onChange={(e) => setFormTipo({ ...formTipo, nome: e.target.value })}
                />
              </Campo>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secundario" onClick={() => setFormTipo(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primario">
                  <Tags size={18} /> Salvar tipo
                </button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </div>
  );
}
