"use client";

// Aba Caixas físicas — requisito 5.
// Aqui só o cadastro físico (número + QR fixo). Encher/esvaziar acontece na tela Estoque.

import { useState, type FormEvent } from "react";
import { Plus, QrCode } from "lucide-react";
import { Badge, Campo, Modal, Tabela, Vazio } from "@/components/ui";
import { mutate, nomeLocal, nomeProduto, siglaUnidadeUso, uid, useDB } from "@/lib/data";
import {
  aplicarMetadadosBox,
  ativarDestinacaoOperacional,
  avisoIncompatibilidadeBox,
  encerrarDestinacaoOperacional,
  produtoOperacionalEfetivo,
  ROTULO_POSICAO_BOX,
  ROTULO_TIPO_BOX,
  type PosicaoFisicaBox,
  type TipoBox,
} from "@/lib/domain/estoque-boxes";
import { alocacaoAtivaDaCaixa } from "@/lib/domain/estoque";
import { dataHoraBR, qtd, rotuloValidade } from "@/lib/format";
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
      return "Boxes em Quarentena são excluídos da reposição e do FEFO. A classificação não altera o saldo por si só.";
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
  const [produtoAlvoId, setProdutoAlvoId] = useState("");
  const [responsavelDestinacaoId, setResponsavelDestinacaoId] = useState(() => db.perfis.find((perfil) => perfil.ativo)?.id ?? "");
  const [motivoDestinacao, setMotivoDestinacao] = useState("");
  const [higienizacaoConfirmada, setHigienizacaoConfirmada] = useState(false);
  const [confirmacaoEncerramento, setConfirmacaoEncerramento] = useState(false);
  const [erroDestinacao, setErroDestinacao] = useState<string | null>(null);

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

  function abrirFormulario(caixa: Caixa) {
    setForm({ ...caixa });
    setProdutoAlvoId(produtoOperacionalEfetivo(caixa) ?? "");
    setResponsavelDestinacaoId(caixa.destinacao_operacional_responsavel_id ?? db.perfis.find((perfil) => perfil.ativo)?.id ?? "");
    setMotivoDestinacao("");
    setHigienizacaoConfirmada(false);
    setConfirmacaoEncerramento(false);
    setErroDestinacao(null);
  }

  function ativarDestinacao() {
    if (!form) return;
    try {
      let caixaAtualizada: Caixa | undefined;
      mutate((banco) => {
        ativarDestinacaoOperacional(banco, {
          boxId: form.id,
          produtoId: produtoAlvoId,
          usuarioId: responsavelDestinacaoId,
          motivo: motivoDestinacao.trim() || undefined,
        });
        caixaAtualizada = banco.caixas.find((caixa) => caixa.id === form.id);
      });
      if (caixaAtualizada) abrirFormulario(caixaAtualizada);
    } catch (error) {
      setErroDestinacao(error instanceof Error ? error.message : "Não foi possível ativar a destinação.");
    }
  }

  function encerrarDestinacao() {
    if (!form) return;
    try {
      let caixaAtualizada: Caixa | undefined;
      mutate((banco) => {
        encerrarDestinacaoOperacional(banco, {
          boxId: form.id,
          usuarioId: responsavelDestinacaoId,
          higienizacaoConfirmada,
          motivo: motivoDestinacao.trim() || undefined,
        });
        caixaAtualizada = banco.caixas.find((caixa) => caixa.id === form.id);
      });
      if (caixaAtualizada) abrirFormulario(caixaAtualizada);
    } catch (error) {
      setErroDestinacao(error instanceof Error ? error.message : "Não foi possível encerrar a destinação.");
    }
  }

  const alocacaoAtivaForm = form?.id ? alocacaoAtivaDaCaixa(db, form.id) : undefined;
  const saldoFisicoForm = form?.quantidade ?? 0;
  const podeAlterarLocalFisico = Boolean(form) && saldoFisicoForm === 0 && !alocacaoAtivaForm;
  const operacionalVazioSemAlocacao =
    form?.tipo_box === "OPERACIONAL" && form.status === "vazia" && saldoFisicoForm === 0 && !alocacaoAtivaForm;
  const podeAtivarDestinacao =
    Boolean(form?.id) &&
    operacionalVazioSemAlocacao &&
    !form?.produto_operacional_alvo_id &&
    Boolean(form?.local_id) &&
    Boolean(produtoAlvoId) &&
    Boolean(responsavelDestinacaoId);
  const podeEncerrarDestinacao =
    Boolean(form?.id) &&
    Boolean(form?.produto_operacional_alvo_id) &&
    saldoFisicoForm === 0 &&
    !alocacaoAtivaForm &&
    Boolean(responsavelDestinacaoId) &&
    motivoDestinacao.trim().length > 0 &&
    higienizacaoConfirmada &&
    confirmacaoEncerramento;
  const bloqueioEncerramento =
    saldoFisicoForm > 0
      ? "Encerramento bloqueado: exige saldo físico zero."
      : alocacaoAtivaForm
        ? "Encerramento bloqueado: existe alocação ativa."
        : null;
  const bloqueioAtivacao =
    form?.tipo_box !== "OPERACIONAL"
      ? "Destinação operacional disponível apenas para Box Operacional."
      : form.produto_operacional_alvo_id
        ? null
        : saldoFisicoForm > 0
          ? "Ativação bloqueada: exige saldo físico zero."
          : form.status !== "vazia"
            ? "Ativação bloqueada: o box precisa estar vazio."
            : alocacaoAtivaForm
              ? "Ativação bloqueada: existe alocação ativa."
              : !form.local_id
                ? "Local físico não definido — configure o box antes da operação."
                : null;
  const produtoAlvo = produtoAlvoId ? db.produtos.find((produto) => produto.id === produtoAlvoId) : undefined;
  const responsavelDestinacao = form?.destinacao_operacional_responsavel_id
    ? db.perfis.find((perfil) => perfil.id === form.destinacao_operacional_responsavel_id)
    : undefined;

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const caixaOriginal = form.id ? db.caixas.find((caixa) => caixa.id === form.id) : undefined;
    if (caixaOriginal && caixaOriginal.local_id !== form.local_id && !podeAlterarLocalFisico) {
      window.alert("Alteração de local físico bloqueada: box com conteúdo ou alocação ativa deve ser movimentado por fluxo próprio.");
      return;
    }
    mutate((banco) => {
      if (form.id) {
        const i = banco.caixas.findIndex((c) => c.id === form.id);
        if (i >= 0) {
          banco.caixas[i] = aplicarMetadadosBox(banco.caixas[i], {
            numero: form.numero,
            qr_code: form.qr_code,
            tipo_box: form.tipo_box,
            posicao_fisica: form.posicao_fisica,
            local_id: form.local_id,
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
          <button className="btn-primario" onClick={() => abrirFormulario(novaCaixa())}>
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
            <p>Quarentena: boxes em Quarentena são excluídos da reposição e do FEFO. A classificação não altera o saldo por si só.</p>
            <p>Não classificado: caixa ainda não adaptada ao novo modelo.</p>
            <p className="mt-2 rounded-card border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
              A classificação organiza o fluxo físico. A destinação operacional define o produto alvo de um Box Operacional sem alterar saldo por si só.
            </p>
          </div>

          <div className="card p-0 sm:p-2">
            <Tabela cabecalho={["Nº", "QR code", "Tipo", "Posição", "Status", "Conteúdo", "Local"]}>
            {lista.map((c) => (
              <tr
                key={c.id}
                className="cursor-pointer transition-colors hover:bg-slate-50"
                onClick={() => abrirFormulario(c)}
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
                <td className="whitespace-nowrap px-3 py-2.5">{nomeLocal(db, c.local_id)}</td>
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
            <Campo rotulo="Local físico">
              <select
                className="campo"
                value={form.local_id ?? ""}
                disabled={!podeAlterarLocalFisico}
                onChange={(e) => setForm({ ...form, local_id: e.target.value || undefined })}
              >
                <option value="">Sem local</option>
                {db.locais.map((local) => (
                  <option key={local.id} value={local.id}>{local.nome}</option>
                ))}
              </select>
              {!podeAlterarLocalFisico && (
                <p className="mt-1 text-xs text-slate-500">Box com conteúdo ou alocação ativa deve mudar de local por fluxo próprio.</p>
              )}
            </Campo>

            {form.tipo_box === "OPERACIONAL" && (
              <div className="rounded-card border border-primaria/30 bg-white p-3 sm:col-span-2">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="rotulo">Destinação operacional</span>
                  <Badge cor={form.produto_operacional_alvo_id ? "verde" : "cinza"}>
                    {form.produto_operacional_alvo_id ? "Ativa" : "Sem destinação"}
                  </Badge>
                </div>
                <p className="mb-3 text-sm text-slate-600">
                  A destinação define o produto alvo do Box Operacional. Ela não adiciona saldo, lote ou conteúdo físico.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Campo rotulo="Produto/porcionamento alvo">
                    <input
                      className="campo mb-2"
                      list="produtos-destinacao-operacional"
                      placeholder="Pesquisar produto/porcionamento"
                      value={produtoAlvo?.nome ?? ""}
                      disabled={Boolean(form.produto_operacional_alvo_id)}
                      onChange={(e) => {
                        const produto = db.produtos.find((item) => item.nome === e.target.value);
                        setProdutoAlvoId(produto?.id ?? "");
                      }}
                    />
                    <datalist id="produtos-destinacao-operacional">
                      {db.produtos.filter((produto) => produto.ativo).map((produto) => (
                        <option key={produto.id} value={produto.nome} />
                      ))}
                    </datalist>
                    <select className="campo" value={produtoAlvoId} disabled={Boolean(form.produto_operacional_alvo_id)} onChange={(e) => setProdutoAlvoId(e.target.value)}>
                      <option value="">Selecione</option>
                      {db.produtos.filter((produto) => produto.ativo).map((produto) => (
                        <option key={produto.id} value={produto.id}>{produto.nome}</option>
                      ))}
                    </select>
                  </Campo>
                  <Campo rotulo="Unidade de uso">
                    <input className="campo" value={produtoAlvoId ? siglaUnidadeUso(db, produtoAlvoId) : "—"} readOnly />
                  </Campo>
                  <Campo rotulo="Início da destinação">
                    <input className="campo" value={dataHoraBR(form.destinacao_operacional_inicio_em)} readOnly />
                  </Campo>
                  <Campo rotulo="Responsável">
                    <select className="campo" value={responsavelDestinacaoId} onChange={(e) => setResponsavelDestinacaoId(e.target.value)}>
                      {db.perfis.filter((perfil) => perfil.ativo).map((perfil) => (
                        <option key={perfil.id} value={perfil.id}>{perfil.nome}</option>
                      ))}
                    </select>
                  </Campo>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Número permanente: {form.numero}. QR permanente: {form.qr_code}.
                </p>
                {form.produto_operacional_alvo_id && (
                  <p className="mt-2 text-sm text-slate-600">
                    Destinação ativa para {produtoAlvo ? produtoAlvo.nome : nomeProduto(db, form.produto_operacional_alvo_id)}
                    {" "}({siglaUnidadeUso(db, form.produto_operacional_alvo_id)}). Responsável pela ativação: {responsavelDestinacao?.nome ?? "não informado"}.
                    Fechar o box com saldo zero não encerra a destinação automaticamente.
                  </p>
                )}
                <Campo rotulo="Motivo">
                  <textarea className="campo min-h-20" value={motivoDestinacao} onChange={(e) => setMotivoDestinacao(e.target.value)} />
                </Campo>
                {form.produto_operacional_alvo_id && (
                  <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" className="h-4 w-4 accent-primaria" checked={higienizacaoConfirmada} onChange={(e) => setHigienizacaoConfirmada(e.target.checked)} />
                    Higienização confirmada para encerrar a destinação.
                  </label>
                )}
                {form.produto_operacional_alvo_id && (
                  <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" className="h-4 w-4 accent-primaria" checked={confirmacaoEncerramento} onChange={(e) => setConfirmacaoEncerramento(e.target.checked)} />
                    Confirmação final: encerrar a destinação ativa deste box.
                  </label>
                )}
                {bloqueioAtivacao && <p className="mt-2 rounded-card bg-destaque-clara px-3 py-2 text-sm text-destaque">{bloqueioAtivacao}</p>}
                {bloqueioEncerramento && <p className="mt-2 rounded-card bg-destaque-clara px-3 py-2 text-sm text-destaque">{bloqueioEncerramento}</p>}
                {erroDestinacao && <p className="mt-2 rounded-card bg-erro-clara px-3 py-2 text-sm text-erro">{erroDestinacao}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {!form.produto_operacional_alvo_id ? (
                    <button type="button" className="btn-primario" disabled={!podeAtivarDestinacao} onClick={ativarDestinacao}>
                      Ativar destinação
                    </button>
                  ) : (
                    <button type="button" className="btn-secundario" disabled={!podeEncerrarDestinacao} onClick={encerrarDestinacao}>
                      Encerrar destinação
                    </button>
                  )}
                </div>
                {!form.produto_operacional_alvo_id && <p className="mt-2 text-sm text-slate-500">Sem destinação — configure antes da operação.</p>}
              </div>
            )}

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
              {form.tipo_box === "QUARENTENA" && (
                <p className="mt-2 rounded-card border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                  Separe fisicamente este box. Boxes em Quarentena são excluídos da reposição e do FEFO; a classificação não altera saldo por si só.
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
