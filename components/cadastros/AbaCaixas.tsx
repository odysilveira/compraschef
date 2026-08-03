"use client";

// Aba Caixas físicas — requisito 5.
// Aqui só o cadastro físico (número + QR fixo). Encher/esvaziar acontece na tela Estoque.

import { useState, type FormEvent } from "react";
import { Plus, QrCode } from "lucide-react";
import { Badge, Campo, Modal, Tabela, Vazio } from "@/components/ui";
import { mutate, nomeLocal, nomeProduto, siglaUnidadeUso, uid, useDB } from "@/lib/data";
import {
  aplicarMetadadosBox,
  avisoIncompatibilidadeBox,
  ROTULO_POSICAO_BOX,
  ROTULO_TIPO_BOX,
  type PosicaoFisicaBox,
  type TipoBox,
} from "@/lib/domain/estoque-boxes";
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

function corTipoBox(tipo: TipoBox): "cinza" | "azul" | "laranja" | "vermelho" {
  switch (tipo) {
    case "RESERVA":
      return "azul";
    case "OPERACIONAL":
      return "laranja";
    case "QUARENTENA":
      return "vermelho";
    default:
      return "cinza";
  }
}

function explicacaoTipoBox(tipo: TipoBox): string {
  switch (tipo) {
    case "RESERVA":
      return "Reserva: estoque armazenado.";
    case "OPERACIONAL":
      return "Operacional: saldo contínuo para consumo.";
    case "QUARENTENA":
      return "Quarentena: produto bloqueado para uso.";
    default:
      return "Não classificado: caixa ainda não adaptada ao novo modelo.";
  }
}

function BadgeTipoBox({ tipo }: { tipo: TipoBox }) {
  return <Badge cor={corTipoBox(tipo)}>{ROTULO_TIPO_BOX[tipo]}</Badge>;
}

export function AbaCaixas() {
  const db = useDB();
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<TipoBox | "">("");
  const [form, setForm] = useState<Caixa | null>(null);

  const lista = db.caixas
    .filter((c) => {
      if (filtroTipo && c.tipo_box !== filtroTipo) return false;
      return contem(
        busca,
        c.numero,
        c.qr_code,
        nomeProduto(db, c.produto_id),
        ROTULO_STATUS[c.status],
        ROTULO_TIPO_BOX[c.tipo_box],
        ROTULO_POSICAO_BOX[c.posicao_fisica]
      );
    })
    .sort((a, b) => a.numero - b.numero);

  function novaCaixa(): Caixa {
    const proximoNumero = db.caixas.reduce((max, c) => Math.max(max, c.numero), 0) + 1;
    return {
      id: "",
      numero: proximoNumero,
      qr_code: `CXCHEF-${String(proximoNumero).padStart(3, "0")}`,
      tipo_box: "NAO_CLASSIFICADO",
      posicao_fisica: "NAO_INFORMADA",
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
        if (i >= 0) {
          banco.caixas[i] = aplicarMetadadosBox(banco.caixas[i], {
            numero: form.numero,
            qr_code: form.qr_code,
            tipo_box: form.tipo_box,
            posicao_fisica: form.posicao_fisica,
          });
        }
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
        <select className="campo mb-4 min-w-[220px]" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value as TipoBox | "") }>
          <option value="">Todos os tipos de box</option>
          {(Object.keys(ROTULO_TIPO_BOX) as TipoBox[]).map((tipo) => (
            <option key={tipo} value={tipo}>{ROTULO_TIPO_BOX[tipo]}</option>
          ))}
        </select>
        <div className="mb-4 flex gap-2">
          <a href="/etiquetas" target="_blank" rel="noopener" className="btn-secundario">
            <QrCode size={16} /> Imprimir etiquetas
          </a>
          <button className="btn-primario" onClick={() => setForm(novaCaixa())}>
            <Plus size={16} /> Nova caixa
          </button>
        </div>
      </div>

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhuma caixa encontrada." />
      ) : (
        <>
          <div className="card mb-3 p-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-800">Classificação lógica dos boxes</p>
            <p>Reserva: estoque armazenado.</p>
            <p>Operacional: saldo contínuo para consumo.</p>
            <p>Quarentena: produto bloqueado para uso.</p>
            <p>Não classificado: caixa ainda não adaptada ao novo modelo.</p>
          </div>

          <div className="card p-0 sm:p-2">
            <Tabela cabecalho={["Nº", "QR code", "Tipo", "Posição", "Status", "Conteúdo", "Local"]}>
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
                  <BadgeTipoBox tipo={c.tipo_box} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sm text-slate-600">{ROTULO_POSICAO_BOX[c.posicao_fisica]}</td>
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
        </>
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

            <Campo rotulo="Tipo do box *">
              <select className="campo" value={form.tipo_box} onChange={(e) => setForm({ ...form, tipo_box: e.target.value as TipoBox })}>
                {(Object.keys(ROTULO_TIPO_BOX) as TipoBox[]).map((tipo) => (
                  <option key={tipo} value={tipo}>{ROTULO_TIPO_BOX[tipo]}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Posição física *">
              <select className="campo" value={form.posicao_fisica} onChange={(e) => setForm({ ...form, posicao_fisica: e.target.value as PosicaoFisicaBox })}>
                {(Object.keys(ROTULO_POSICAO_BOX) as PosicaoFisicaBox[]).map((posicao) => (
                  <option key={posicao} value={posicao}>{ROTULO_POSICAO_BOX[posicao]}</option>
                ))}
              </select>
            </Campo>

            <div className="rounded-card border border-slate-200 bg-fundo p-3 sm:col-span-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="rotulo">Classificação atual</span>
                <BadgeTipoBox tipo={form.tipo_box} />
              </div>
              <p className="text-sm text-slate-600">{explicacaoTipoBox(form.tipo_box)}</p>
              <p className="mt-2 text-sm text-slate-600">Posição: {ROTULO_POSICAO_BOX[form.posicao_fisica]}</p>
              {avisoIncompatibilidadeBox(form) && (
                <p className="mt-2 rounded-card bg-destaque-clara px-3 py-2 text-sm text-destaque">
                  {avisoIncompatibilidadeBox(form)}
                </p>
              )}
            </div>

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
                Alterar tipo ou posição não muda saldo, lote, validade nem QR code existente.
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
