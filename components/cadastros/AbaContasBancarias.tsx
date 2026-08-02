"use client";

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Badge, Campo, Modal, Tabela, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import {
  BANCOS_COMUNS,
  ROTULO_TIPO_CONTA,
  rotuloContaBancaria,
} from "@/lib/domain/contas-pagamento";
import type { ContaBancariaRestaurante, TipoContaBancaria } from "@/lib/types";
import { BarraBusca, contem, RodapeFormulario } from "./comum";

type FormConta = Omit<ContaBancariaRestaurante, "criado_em" | "atualizado_em"> & {
  criado_em?: string;
  atualizado_em?: string;
};

function formVazio(): FormConta {
  return {
    id: "",
    banco: "Itaú",
    tipo: "corrente",
    apelido: "",
    agencia: "",
    numero: "",
    ativa: true,
    padrao: false,
  };
}

export function AbaContasBancarias() {
  const db = useDB();
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<FormConta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const lista = (db.contas_bancarias ?? [])
    .filter((c) => contem(busca, c.banco, c.apelido ?? "", ROTULO_TIPO_CONTA[c.tipo], c.agencia ?? "", c.numero ?? ""))
    .sort((a, b) => {
      if (Boolean(a.padrao) !== Boolean(b.padrao)) return a.padrao ? -1 : 1;
      return a.banco.localeCompare(b.banco, "pt-BR");
    });

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const banco = form.banco.trim();
    if (!banco) {
      setErro("Informe o banco.");
      return;
    }
    const agora = new Date().toISOString();
    mutate((bancoDb) => {
      if (!Array.isArray(bancoDb.contas_bancarias)) bancoDb.contas_bancarias = [];
      const registro: ContaBancariaRestaurante = {
        id: form.id || uid("cbanc"),
        banco,
        tipo: form.tipo,
        apelido: form.apelido?.trim() || undefined,
        agencia: form.agencia?.trim() || undefined,
        numero: form.numero?.trim() || undefined,
        ativa: form.ativa,
        padrao: form.padrao,
        criado_em: form.criado_em || agora,
        atualizado_em: agora,
      };
      if (registro.padrao) {
        for (const c of bancoDb.contas_bancarias) {
          if (c.id !== registro.id) c.padrao = false;
        }
      }
      const i = bancoDb.contas_bancarias.findIndex((c) => c.id === registro.id);
      if (i >= 0) bancoDb.contas_bancarias[i] = registro;
      else bancoDb.contas_bancarias.push(registro);
    });
    setForm(null);
    setErro(null);
  }

  function excluir() {
    if (!form?.id) return;
    if (!window.confirm(`Excluir a conta "${rotuloContaBancaria(form as ContaBancariaRestaurante)}"?`)) return;
    mutate((bancoDb) => {
      bancoDb.contas_bancarias = (bancoDb.contas_bancarias ?? []).filter((c) => c.id !== form.id);
    });
    setForm(null);
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Contas de onde o restaurante paga fornecedores e pessoas. Aparecem na hora de informar pagamento e ajudam a
        conciliar o extrato OFX.
      </p>

      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <BarraBusca valor={busca} onMudar={setBusca} placeholder="Buscar por banco, apelido…" />
        <button className="btn-primario mb-4" onClick={() => setForm(formVazio())}>
          <Plus size={16} /> Nova conta
        </button>
      </div>

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhuma conta bancária cadastrada." />
      ) : (
        <div className="card p-0 sm:p-2">
          <Tabela cabecalho={["Conta", "Agência / número", "Status"]}>
            {lista.map((c) => (
              <tr
                key={c.id}
                className="cursor-pointer transition-colors hover:bg-slate-50"
                onClick={() => setForm({ ...c })}
              >
                <td className="px-3 py-2.5">
                  <span className="font-medium">{rotuloContaBancaria(c)}</span>
                </td>
                <td className="px-3 py-2.5 text-sm text-slate-600">
                  {[c.agencia ? `Ag ${c.agencia}` : null, c.numero ? `Cc ${c.numero}` : null]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {c.padrao && <Badge cor="azul">Padrão</Badge>}
                    <Badge cor={c.ativa ? "verde" : "cinza"}>{c.ativa ? "Ativa" : "Inativa"}</Badge>
                  </div>
                </td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      <Modal
        aberto={form !== null}
        titulo={form?.id ? "Editar conta" : "Nova conta"}
        onFechar={() => {
          setForm(null);
          setErro(null);
        }}
      >
        {form && (
          <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Banco *">
              <input
                className="campo"
                required
                list="bancos-comuns-cadastro"
                placeholder="Ex.: Itaú"
                value={form.banco}
                onChange={(e) => setForm({ ...form, banco: e.target.value })}
              />
              <datalist id="bancos-comuns-cadastro">
                {BANCOS_COMUNS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Campo>
            <Campo rotulo="Tipo *">
              <select
                className="campo"
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoContaBancaria })}
              >
                {(Object.keys(ROTULO_TIPO_CONTA) as TipoContaBancaria[]).map((t) => (
                  <option key={t} value={t}>
                    {ROTULO_TIPO_CONTA[t]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Apelido (opcional)">
              <input
                className="campo"
                placeholder="Ex.: conta principal"
                value={form.apelido ?? ""}
                onChange={(e) => setForm({ ...form, apelido: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Agência">
              <input
                className="campo"
                value={form.agencia ?? ""}
                onChange={(e) => setForm({ ...form, agencia: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Número da conta">
              <input
                className="campo"
                value={form.numero ?? ""}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
              />
            </Campo>
            <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.ativa}
                  onChange={(e) => setForm({ ...form, ativa: e.target.checked })}
                />
                Conta ativa
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(form.padrao)}
                  onChange={(e) => setForm({ ...form, padrao: e.target.checked })}
                />
                Usar como padrão ao informar pagamento
              </label>
            </div>
            {erro && (
              <p className="sm:col-span-2 rounded-card border border-erro bg-erro-clara px-3 py-2 text-sm font-medium text-erro">
                {erro}
              </p>
            )}
            <div className="sm:col-span-2">
              <RodapeFormulario onExcluir={form.id ? excluir : undefined} />
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
