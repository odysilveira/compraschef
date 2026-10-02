"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Badge, Campo, Modal, Tabela, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import { ORDEM_GRUPOS_DRE, ROTULO_GRUPO_DRE } from "@/lib/domain/dre";
import type { ContaDre, GrupoContaDre } from "@/lib/types";
import { BarraBusca, contem, numOpcional, RodapeFormulario } from "./comum";

function slugCodigo(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function contaVazia(grupo: GrupoContaDre = "custos_variaveis"): ContaDre {
  return {
    id: "",
    grupo,
    codigo: "",
    nome: "",
    ordem: 100,
    ativo: true,
  };
}

export function AbaContasDre() {
  const db = useDB();
  const [busca, setBusca] = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState<GrupoContaDre | "">("");
  const [form, setForm] = useState<ContaDre | null>(null);

  const lista = useMemo(() => {
    return (db.contas_dre ?? [])
      .filter((c) => c.ativo)
      .filter((c) => !filtroGrupo || c.grupo === filtroGrupo)
      .filter((c) => contem(busca, c.nome, c.codigo, ROTULO_GRUPO_DRE[c.grupo]))
      .sort((a, b) => {
        const ga = ORDEM_GRUPOS_DRE.indexOf(a.grupo);
        const gb = ORDEM_GRUPOS_DRE.indexOf(b.grupo);
        if (ga !== gb) return ga - gb;
        return a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR");
      });
  }, [db.contas_dre, busca, filtroGrupo]);

  function abrirNovo() {
    const grupo: GrupoContaDre = filtroGrupo || "custos_variaveis";
    const maxOrdem = (db.contas_dre ?? [])
      .filter((c) => c.grupo === grupo)
      .reduce((m, c) => Math.max(m, c.ordem), 0);
    setForm({ ...contaVazia(grupo), ordem: maxOrdem + 10 });
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const nome = form.nome.trim();
    if (!nome) return;
    const codigo =
      slugCodigo(form.codigo || nome) ||
      `custom.${Date.now().toString(36)}`;

    const duplicado = (db.contas_dre ?? []).some(
      (c) => c.ativo && c.codigo === codigo && c.id !== form.id
    );
    if (duplicado) {
      window.alert(`Já existe uma conta com o código "${codigo}".`);
      return;
    }

    mutate((banco) => {
      if (!Array.isArray(banco.contas_dre)) banco.contas_dre = [];
      if (form.id) {
        const i = banco.contas_dre.findIndex((c) => c.id === form.id);
        if (i >= 0) {
          banco.contas_dre[i] = {
            ...banco.contas_dre[i],
            nome,
            codigo,
            grupo: form.grupo,
            ordem: Number.isFinite(form.ordem) ? form.ordem : 100,
          };
        }
      } else {
        banco.contas_dre.push({
          id: uid("dre"),
          nome,
          codigo,
          grupo: form.grupo,
          ordem: Number.isFinite(form.ordem) ? form.ordem : 100,
          ativo: true,
        });
      }
    });
    setForm(null);
  }

  function excluir() {
    if (!form?.id) return;
    if (
      !window.confirm(
        `Desativar a conta "${form.nome}"?\n\nEla some das listas; o histórico do DRE mantém o que já foi lançado.`
      )
    ) {
      return;
    }
    mutate((banco) => {
      const i = (banco.contas_dre ?? []).findIndex((c) => c.id === form.id);
      if (i >= 0) banco.contas_dre![i] = { ...banco.contas_dre![i], ativo: false };
    });
    setForm(null);
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <BarraBusca valor={busca} onMudar={setBusca} placeholder="Buscar conta DRE…" />
          <select
            className="campo mb-4 w-auto"
            value={filtroGrupo}
            onChange={(e) => setFiltroGrupo((e.target.value || "") as GrupoContaDre | "")}
          >
            <option value="">Todos os grupos</option>
            {ORDEM_GRUPOS_DRE.map((g) => (
              <option key={g} value={g}>
                {ROTULO_GRUPO_DRE[g]}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primario mb-4" onClick={abrirNovo}>
          <Plus size={16} /> Nova conta DRE
        </button>
      </div>

      <p className="mb-4 text-sm text-stone-600">
        Inclua linhas que faltam no plano (ex.: Carnes — bacon). Depois vincule o produto a essa conta
        para ver o gasto separado no DRE do mês.
      </p>

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhuma conta DRE encontrada." />
      ) : (
        <div className="card p-0 sm:p-2">
          <Tabela cabecalho={["Nome", "Grupo", "Código", "Ordem"]}>
            {lista.map((conta) => (
              <tr
                key={conta.id}
                className="cursor-pointer transition-colors hover:bg-slate-50"
                onClick={() => setForm({ ...conta })}
              >
                <td className="px-3 py-2.5 font-medium">{conta.nome}</td>
                <td className="px-3 py-2.5">
                  <Badge cor="azul">{ROTULO_GRUPO_DRE[conta.grupo]}</Badge>
                </td>
                <td className="px-3 py-2.5 text-stone-600">{conta.codigo}</td>
                <td className="px-3 py-2.5 tabular-nums">{conta.ordem}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      <Modal
        aberto={form !== null}
        titulo={form?.id ? "Editar conta DRE" : "Nova conta DRE"}
        onFechar={() => setForm(null)}
      >
        {form && (
          <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Campo rotulo="Nome *">
                <input
                  className="campo"
                  required
                  placeholder="ex.: Carnes — bacon"
                  value={form.nome}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </Campo>
            </div>
            <Campo rotulo="Grupo *">
              <select
                className="campo"
                required
                value={form.grupo}
                onChange={(e) =>
                  setForm({ ...form, grupo: e.target.value as GrupoContaDre })
                }
              >
                {ORDEM_GRUPOS_DRE.map((g) => (
                  <option key={g} value={g}>
                    {ROTULO_GRUPO_DRE[g]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Ordem">
              <input
                type="number"
                className="campo"
                value={form.ordem}
                onChange={(e) =>
                  setForm({ ...form, ordem: numOpcional(e.target.value) ?? 100 })
                }
              />
            </Campo>
            <div className="sm:col-span-2">
              <Campo rotulo="Código (opcional)">
                <input
                  className="campo"
                  placeholder="ex.: cv.carnes.bacon"
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                />
              </Campo>
              <p className="mt-1 text-xs text-slate-500">
                Se vazio, o sistema gera a partir do nome. Use no grupo Custos variáveis (CMV) para
                acompanhar gasto de food (bacon, costela…).
              </p>
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
