"use client";

// Aba Caixas físicas — requisito 5.
// Aqui só o cadastro físico (número + QR fixo). Encher/esvaziar acontece na tela Estoque.

import { useState, type FormEvent } from "react";
import { Plus, QrCode } from "lucide-react";
import { Badge, Campo, Modal, Tabela, Vazio } from "@/components/ui";
import { mutate, nomeLocal, nomeProduto, siglaUnidadeUso, uid, useDB } from "@/lib/data";
import { qtd, rotuloValidade } from "@/lib/format";
import type { Caixa, StatusCaixa } from "@/lib/types";
import { BarraBusca, contem, numOpcional, RodapeFormulario } from "./comum";

const ROTULO_STATUS: Record<StatusCaixa, string> = {
  vazia: "Vazia",
  cheia: "Cheia",
  em_uso: "Em uso",
};

function BadgeStatus({ status }: { status: StatusCaixa }) {
  const cor = status === "vazia" ? "cinza" : status === "cheia" ? "verde" : "azul";
  return <Badge cor={cor}>{ROTULO_STATUS[status]}</Badge>;
}

export function AbaCaixas() {
  const db = useDB();
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Caixa | null>(null);

  const lista = db.caixas
    .filter((c) => contem(busca, c.numero, c.qr_code, nomeProduto(db, c.produto_id), ROTULO_STATUS[c.status]))
    .sort((a, b) => a.numero - b.numero);

  function novaCaixa(): Caixa {
    const proximoNumero = db.caixas.reduce((max, c) => Math.max(max, c.numero), 0) + 1;
    return {
      id: "",
      numero: proximoNumero,
      qr_code: `CXCHEF-${String(proximoNumero).padStart(3, "0")}`,
      status: "vazia",
      atualizado_em: new Date().toISOString(),
    };
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    mutate((banco) => {
      if (form.id) {
        const i = banco.caixas.findIndex((c) => c.id === form.id);
        // Só número e QR são editáveis aqui; status/conteúdo ficam como estão.
        if (i >= 0) banco.caixas[i] = { ...banco.caixas[i], numero: form.numero, qr_code: form.qr_code };
      } else {
        banco.caixas.push({ ...form, id: uid("cx"), atualizado_em: new Date().toISOString() });
      }
    });
    setForm(null);
  }

  function excluir() {
    if (!form?.id) return;
    if (form.status !== "vazia") {
      window.alert("Esta caixa está com produto dentro. Esvazie-a na tela Estoque antes de excluir.");
      return;
    }
    if (!window.confirm(`Excluir a caixa nº ${form.numero} (${form.qr_code})? Esta ação não pode ser desfeita.`)) return;
    mutate((banco) => {
      banco.caixas = banco.caixas.filter((c) => c.id !== form.id);
    });
    setForm(null);
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <BarraBusca valor={busca} onMudar={setBusca} placeholder="Buscar por número, QR, produto…" />
        <button className="btn-primario mb-4" onClick={() => setForm(novaCaixa())}>
          <Plus size={16} /> Nova caixa
        </button>
      </div>

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhuma caixa encontrada." />
      ) : (
        <div className="card p-0 sm:p-2">
          <Tabela cabecalho={["Nº", "QR code", "Status", "Conteúdo", "Local"]}>
            {lista.map((c) => (
              <tr
                key={c.id}
                className="cursor-pointer transition-colors hover:bg-slate-50"
                onClick={() => setForm({ ...c })}
              >
                <td className="px-3 py-2.5 font-semibold">{c.numero}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-slate-600">
                    <QrCode size={14} /> {c.qr_code}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <BadgeStatus status={c.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {c.produto_id
                    ? `${nomeProduto(db, c.produto_id)} · ${qtd(c.quantidade, siglaUnidadeUso(db, c.produto_id))}`
                    : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">{c.produto_id ? nomeLocal(db, c.local_id) : "—"}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      <Modal
        aberto={form !== null}
        titulo={form?.id ? `Caixa nº ${form.numero}` : "Nova caixa"}
        onFechar={() => setForm(null)}
      >
        {form && (
          <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo rotulo="Número *">
              <input
                type="number"
                min={1}
                required
                className="campo"
                value={form.numero}
                onChange={(e) => setForm({ ...form, numero: numOpcional(e.target.value) ?? 0 })}
              />
            </Campo>
            <Campo rotulo="QR code (fixo, colado na caixa) *">
              <input
                className="campo"
                required
                placeholder="ex.: CXCHEF-015"
                value={form.qr_code}
                onChange={(e) => setForm({ ...form, qr_code: e.target.value })}
              />
            </Campo>

            <div className="rounded-card border border-slate-200 bg-fundo p-3 sm:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="rotulo">Situação atual (somente leitura)</span>
                <BadgeStatus status={form.status} />
              </div>
              {form.produto_id ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-slate-500">Produto</dt>
                  <dd className="font-medium">{nomeProduto(db, form.produto_id)}</dd>
                  <dt className="text-slate-500">Quantidade</dt>
                  <dd>{qtd(form.quantidade, siglaUnidadeUso(db, form.produto_id))}</dd>
                  <dt className="text-slate-500">Validade</dt>
                  <dd>{rotuloValidade(form.validade)}</dd>
                  <dt className="text-slate-500">Local</dt>
                  <dd>{nomeLocal(db, form.local_id)}</dd>
                </dl>
              ) : (
                <p className="text-sm text-slate-500">Caixa vazia, pronta para uso.</p>
              )}
              <p className="mt-2 text-xs text-slate-400">
                Para encher ou esvaziar a caixa, use a tela Estoque.
              </p>
            </div>

            <div className="sm:col-span-2">
              <RodapeFormulario onExcluir={form.id ? excluir : undefined} />
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
