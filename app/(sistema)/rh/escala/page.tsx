"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { CalendarDays, Check, Copy, Plus } from "lucide-react";
import { Badge, Campo, Card, Modal, TituloPagina, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import {
  LOCAL_PADRAO_ESCALA,
  convocacaoDoSlot,
  criarSlot,
  formatDataBrLonga,
  janela28Dias,
  marcarConvocacaoEnviada,
  nomeDiaSemana,
  pessoaPrecisaConvocacao,
  registrarRespostaConvocacao,
  rotuloStatusConvocacao,
  slotsNaJanela,
} from "@/lib/domain/escala";
import { rotuloFuncao, rotuloTipoPessoa } from "@/lib/domain/rh";
import { podeVerValores, usePapel } from "@/lib/roles";
import { moeda } from "@/lib/format";
import type { ConvocacaoIntermitente, EscalaSlot, StatusConvocacao } from "@/lib/types";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type FormPlantao = {
  pessoa_id: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  intervalo_min: string;
  funcao: string;
  local: string;
};

function formVazio(data = hojeISO(), pessoaId = ""): FormPlantao {
  return {
    pessoa_id: pessoaId,
    data,
    hora_inicio: "18:00",
    hora_fim: "23:30",
    intervalo_min: "30",
    funcao: "",
    local: LOCAL_PADRAO_ESCALA,
  };
}

function BadgeConvocacao({ status }: { status: StatusConvocacao }) {
  const cor =
    status === "aceita"
      ? "verde"
      : status === "enviada"
        ? "azul"
        : status === "recusada" || status === "silencio"
          ? "laranja"
          : "cinza";
  return <Badge cor={cor}>{rotuloStatusConvocacao(status)}</Badge>;
}

export default function RhEscalaPage() {
  const db = useDB();
  const { papel } = usePapel();
  const [form, setForm] = useState<FormPlantao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [detalheSlotId, setDetalheSlotId] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const dias = useMemo(() => janela28Dias(hojeISO()), []);
  const pessoasAtivas = useMemo(
    () => (db.pessoas ?? []).filter((p) => p.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [db.pessoas]
  );
  const slots = useMemo(() => slotsNaJanela(db, dias), [db, dias]);

  const porDia = useMemo(() => {
    const map = new Map<string, EscalaSlot[]>();
    for (const dia of dias) map.set(dia, []);
    for (const slot of slots) {
      const lista = map.get(slot.data);
      if (lista) lista.push(slot);
    }
    return map;
  }, [dias, slots]);

  const nomePessoa = (id: string) => db.pessoas.find((p) => p.id === id)?.nome ?? "—";

  if (!podeVerValores(papel)) {
    return (
      <div className="mx-auto max-w-lg">
        <TituloPagina titulo="Escala" />
        <Card className="py-10 text-center">
          <CalendarDays size={40} className="mx-auto text-slate-400" />
          <p className="mt-3 font-bold">Área restrita</p>
        </Card>
      </div>
    );
  }

  function abrirNovo(data?: string) {
    const pessoa = pessoasAtivas[0];
    const base = formVazio(data ?? hojeISO(), pessoa?.id ?? "");
    if (pessoa) {
      base.funcao = rotuloFuncao(pessoa);
      if (pessoa.tipo === "colaborador") {
        base.hora_inicio = "09:00";
        base.hora_fim = "17:00";
        base.intervalo_min = "60";
      }
    }
    setForm(base);
    setErro(null);
    setAviso(null);
  }

  function aoMudarPessoa(pessoaId: string) {
    if (!form) return;
    const pessoa = db.pessoas.find((p) => p.id === pessoaId);
    setForm({
      ...form,
      pessoa_id: pessoaId,
      funcao: pessoa ? rotuloFuncao(pessoa) : form.funcao,
      hora_inicio: pessoa && !pessoaPrecisaConvocacao(pessoa.tipo) ? "09:00" : form.hora_inicio,
      hora_fim: pessoa && !pessoaPrecisaConvocacao(pessoa.tipo) ? "17:00" : form.hora_fim,
      intervalo_min: pessoa && !pessoaPrecisaConvocacao(pessoa.tipo) ? "60" : form.intervalo_min,
    });
  }

  function salvarPlantao(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const proximo = structuredClone(db);
    const resultado = criarSlot(
      proximo,
      {
        pessoa_id: form.pessoa_id,
        data: form.data,
        hora_inicio: form.hora_inicio,
        hora_fim: form.hora_fim,
        intervalo_min: Number(form.intervalo_min) || 0,
        funcao: form.funcao,
        local: form.local,
      },
      { id: uid("esc"), convocacaoId: uid("conv") }
    );
    if (!resultado.sucesso) {
      setErro(resultado.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setForm(null);
    setMensagem(
      resultado.convocacao
        ? "Plantão criado com convocação em rascunho. Copie o WhatsApp e registre o aceite."
        : "Plantão lançado na escala."
    );
    if (resultado.avisos.length) setAviso(resultado.avisos.join(" "));
    if (resultado.slot) setDetalheSlotId(resultado.slot.id);
  }

  async function copiarTexto(texto: string, convocacaoId: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
      const proximo = structuredClone(db);
      const r = marcarConvocacaoEnviada(proximo, convocacaoId);
      if (r.sucesso) {
        mutate((atual) => Object.assign(atual, proximo));
        setMensagem("Texto copiado. Convocação marcada como enviada — cole no WhatsApp privado.");
      }
    } catch {
      setErro("Não foi possível copiar. Selecione o texto manualmente.");
    }
  }

  function responder(convocacaoId: string, status: Extract<StatusConvocacao, "aceita" | "recusada" | "silencio">) {
    const proximo = structuredClone(db);
    const r = registrarRespostaConvocacao(proximo, convocacaoId, status);
    if (!r.sucesso) {
      setErro(r.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    if (status === "aceita" && r.pagamento) {
      setMensagem(
        `Convocação aceita. Pagamento previsto de ${moeda(r.pagamento.valor)} criado — veja em Pagamentos.`
      );
    } else {
      setMensagem(`Resposta registrada: ${rotuloStatusConvocacao(status)}.`);
    }
  }

  const detalheSlot = detalheSlotId ? db.escala_slots.find((s) => s.id === detalheSlotId) : null;
  const detalheConv: ConvocacaoIntermitente | undefined = detalheSlot
    ? convocacaoDoSlot(db, detalheSlot.id)
    : undefined;

  return (
    <div>
      <TituloPagina
        titulo="Escala — 28 dias"
        subtitulo="Plantões dos colaboradores e convocações de intermitentes (WhatsApp + aceite)."
        acao={
          <button type="button" className="btn-primario" onClick={() => abrirNovo()}>
            <Plus size={16} /> Novo plantão
          </button>
        }
      />

      {mensagem && (
        <div className="mb-4 rounded-card border border-sucesso bg-sucesso-clara px-4 py-3 text-sm font-medium text-primaria-escura">
          {mensagem}{" "}
          {mensagem.includes("Pagamentos") && (
            <Link href="/rh/pagamentos" className="underline">
              Abrir pagamentos
            </Link>
          )}
        </div>
      )}
      {aviso && (
        <div className="mb-4 rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950">
          {aviso}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/rh" className="btn-secundario">
          Pessoas
        </Link>
        <Link href="/rh/pagamentos" className="btn-secundario">
          Pagamentos
        </Link>
      </div>

      {slots.length === 0 ? (
        <Vazio mensagem="Nenhum plantão nos próximos 28 dias. Lance o primeiro." />
      ) : null}

      <div className="space-y-3">
        {dias.map((dia) => {
          const lista = porDia.get(dia) ?? [];
          if (lista.length === 0) return null;
          return (
            <Card key={dia} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900">
                    {formatDataBrLonga(dia)}{" "}
                    <span className="font-normal text-slate-500">· {nomeDiaSemana(dia)}</span>
                  </p>
                </div>
                <button type="button" className="btn-secundario" onClick={() => abrirNovo(dia)}>
                  <Plus size={14} /> Neste dia
                </button>
              </div>
              <div className="space-y-2">
                {lista.map((slot) => {
                  const pessoa = db.pessoas.find((p) => p.id === slot.pessoa_id);
                  const conv = convocacaoDoSlot(db, slot.id);
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      className="flex w-full flex-wrap items-start justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-left hover:border-primaria/40"
                      onClick={() => {
                        setDetalheSlotId(slot.id);
                        setErro(null);
                        setCopiado(false);
                      }}
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{nomePessoa(slot.pessoa_id)}</p>
                        <p className="text-sm text-slate-600">
                          {slot.hora_inicio}–{slot.hora_fim}
                          {slot.funcao ? ` · ${slot.funcao}` : ""}
                          {pessoa ? ` · ${rotuloTipoPessoa(pessoa.tipo)}` : ""}
                        </p>
                      </div>
                      {conv && <BadgeConvocacao status={conv.status} />}
                    </button>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      {slots.length > 0 && (
        <p className="mt-4 text-center text-xs text-slate-500">
          Dias sem plantão ficam ocultos. Use “Novo plantão” para preencher a janela.
        </p>
      )}

      <Modal aberto={form !== null} titulo="Novo plantão" onFechar={() => setForm(null)} fecharAoClicarFundo={false}>
        {form && (
          <form onSubmit={salvarPlantao} className="space-y-3">
            <Campo rotulo="Pessoa *">
              <select
                className="campo"
                required
                value={form.pessoa_id}
                onChange={(e) => aoMudarPessoa(e.target.value)}
              >
                <option value="">Selecione</option>
                {pessoasAtivas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({rotuloTipoPessoa(p.tipo)})
                  </option>
                ))}
              </select>
            </Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Data *">
                <input
                  type="date"
                  className="campo"
                  required
                  value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Intervalo (min)">
                <input
                  className="campo"
                  inputMode="numeric"
                  value={form.intervalo_min}
                  onChange={(e) => setForm({ ...form, intervalo_min: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Início *">
                <input
                  type="time"
                  className="campo"
                  required
                  value={form.hora_inicio}
                  onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Término *">
                <input
                  type="time"
                  className="campo"
                  required
                  value={form.hora_fim}
                  onChange={(e) => setForm({ ...form, hora_fim: e.target.value })}
                />
              </Campo>
            </div>
            <Campo rotulo="Função">
              <input className="campo" value={form.funcao} onChange={(e) => setForm({ ...form, funcao: e.target.value })} />
            </Campo>
            <Campo rotulo="Local">
              <input className="campo" value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} />
            </Campo>
            {form.pessoa_id &&
              (() => {
                const p = db.pessoas.find((x) => x.id === form.pessoa_id);
                return p && pessoaPrecisaConvocacao(p.tipo) ? (
                  <p className="text-xs text-slate-600">
                    Intermitente/entregador: ao salvar, o sistema gera o texto de convocação WhatsApp (rascunho).
                  </p>
                ) : null;
              })()}
            {erro && <p className="text-sm font-medium text-destaque">{erro}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secundario" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario">
                Salvar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        aberto={Boolean(detalheSlot)}
        titulo="Detalhe do plantão"
        onFechar={() => setDetalheSlotId(null)}
        fecharAoClicarFundo={false}
      >
        {detalheSlot && (
          <div className="space-y-3">
            <div>
              <p className="text-lg font-bold">{nomePessoa(detalheSlot.pessoa_id)}</p>
              <p className="text-sm text-slate-600">
                {formatDataBrLonga(detalheSlot.data)} ({nomeDiaSemana(detalheSlot.data)}) · {detalheSlot.hora_inicio}–
                {detalheSlot.hora_fim}
              </p>
              <p className="text-sm text-slate-500">
                {detalheSlot.funcao ?? "—"} · {detalheSlot.local ?? LOCAL_PADRAO_ESCALA}
              </p>
              <Link href={`/rh/${detalheSlot.pessoa_id}`} className="text-sm text-primaria-escura underline">
                Ver perfil
              </Link>
            </div>

            {detalheConv ? (
              <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">Convocação</p>
                  <BadgeConvocacao status={detalheConv.status} />
                </div>
                {!detalheConv.antecedencia_ok && (
                  <p className="text-xs font-medium text-destaque">
                    Antecedência menor que 3 dias corridos — revise a data ou registre o risco.
                  </p>
                )}
                <p className="text-sm">
                  Valor-hora {moeda(detalheConv.valor_hora)} · {detalheConv.horas_pagas} h pagas · estimado{" "}
                  {moeda(detalheConv.valor_estimado)}
                </p>
                <textarea className="campo min-h-40 font-mono text-xs" readOnly value={detalheConv.texto_mensagem} />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primario"
                    onClick={() => void copiarTexto(detalheConv.texto_mensagem, detalheConv.id)}
                  >
                    {copiado ? <Check size={16} /> : <Copy size={16} />}{" "}
                    {copiado ? "Copiado" : "Copiar WhatsApp"}
                  </button>
                  {detalheConv.status === "enviada" && (
                    <>
                      <button type="button" className="btn-secundario" onClick={() => responder(detalheConv.id, "aceita")}>
                        Aceita
                      </button>
                      <button
                        type="button"
                        className="btn-secundario"
                        onClick={() => responder(detalheConv.id, "recusada")}
                      >
                        Recusada
                      </button>
                      <button
                        type="button"
                        className="btn-secundario"
                        onClick={() => responder(detalheConv.id, "silencio")}
                      >
                        Silêncio
                      </button>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-500">Envie sempre em conversa individual (nunca em grupo).</p>
              </div>
            ) : (
              <p className="text-sm text-slate-600">Colaborador: apenas agenda (sem convocação intermitente).</p>
            )}
            {erro && <p className="text-sm font-medium text-destaque">{erro}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
