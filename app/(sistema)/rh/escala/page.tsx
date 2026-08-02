"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CalendarDays, Check, Copy, GripVertical, Plus, RefreshCw } from "lucide-react";
import { Badge, Campo, Card, Modal, TituloPagina, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import {
  LOCAL_PADRAO_ESCALA,
  PADROES_ESCALA_CLT,
  convocacaoDoSlot,
  criarSlot,
  formatDataBrLonga,
  gerarEscalaPadraoClt,
  janelaCalendarioEscala,
  marcarConvocacaoEnviada,
  montarGradeCalendario,
  moverSlotParaData,
  nomeDiaSemana,
  nomeMesAno,
  pessoaPrecisaConvocacao,
  registrarRespostaConvocacao,
  rotuloPeriodoJanela,
  rotuloStatusConvocacao,
  rotulosCabecalhoSemana,
  slotsNaJanela,
  validarPreRequisitosConvocacao,
  type PadraoEscalaClt,
} from "@/lib/domain/escala";
import { rotuloFuncao, rotuloTipoPessoa } from "@/lib/domain/rh";
import { podeVerValores, usePapel } from "@/lib/roles";
import { moeda } from "@/lib/format";
import type { ConvocacaoIntermitente, EscalaSlot, PessoaRH, StatusConvocacao } from "@/lib/types";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type Arrasto =
  | { tipo: "slot"; id: string }
  | { tipo: "pessoa"; id: string };

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

type FormPadrao = {
  pessoa_id: string;
  padrao: PadraoEscalaClt;
  hora_inicio: string;
  hora_fim: string;
  intervalo_min: string;
  funcao: string;
  local: string;
  referencia_ciclo: string;
};

function formPadraoVazio(pessoaId = ""): FormPadrao {
  return {
    pessoa_id: pessoaId,
    padrao: "6x1",
    hora_inicio: "09:00",
    hora_fim: "17:00",
    intervalo_min: "60",
    funcao: "",
    local: LOCAL_PADRAO_ESCALA,
    referencia_ciclo: hojeISO(),
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

function BancoPessoas({
  titulo,
  pessoas,
  arrasto,
  onDragStart,
  onDragEnd,
}: {
  titulo: string;
  pessoas: PessoaRH[];
  arrasto: Arrasto | null;
  onDragStart: (pessoaId: string) => void;
  onDragEnd: () => void;
}) {
  if (pessoas.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <ul className="space-y-1">
        {pessoas.map((p) => {
          const gate = validarPreRequisitosConvocacao(p);
          const ativo = arrasto?.tipo === "pessoa" && arrasto.id === p.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                draggable
                className={`flex w-full cursor-grab items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-sm active:cursor-grabbing ${
                  ativo
                    ? "border-primaria bg-primaria/10 opacity-60"
                    : gate.ok
                      ? "border-stone-200 bg-white hover:border-primaria/40"
                      : "border-amber-200 bg-amber-50/80"
                }`}
                title={
                  gate.ok
                    ? `Arraste ${p.nome} para um dia`
                    : `Falta contrato/eSocial — ${gate.erros[0] ?? ""}`
                }
                onDragStart={(e) => {
                  onDragStart(p.id);
                  e.dataTransfer.setData("text/escala-drag-tipo", "pessoa");
                  e.dataTransfer.setData("text/escala-pessoa-id", p.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onDragEnd={onDragEnd}
              >
                <GripVertical size={14} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{p.nome}</span>
                {!gate.ok && <Badge cor="laranja">pendente</Badge>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
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
  const [formPadrao, setFormPadrao] = useState<FormPadrao | null>(null);
  const [erroPadrao, setErroPadrao] = useState<string | null>(null);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const [diaDestinoHover, setDiaDestinoHover] = useState<string | null>(null);
  const arrastouRef = useRef(false);

  const dias = useMemo(() => janelaCalendarioEscala(hojeISO()), []);
  const periodoRotulo = useMemo(() => rotuloPeriodoJanela(dias), [dias]);
  const pessoasAtivas = useMemo(
    () => (db.pessoas ?? []).filter((p) => p.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [db.pessoas]
  );
  const colaboradores = useMemo(
    () => pessoasAtivas.filter((p) => p.tipo === "colaborador"),
    [pessoasAtivas]
  );
  const intermitentes = useMemo(
    () => pessoasAtivas.filter((p) => p.tipo === "intermitente"),
    [pessoasAtivas]
  );
  const entregadores = useMemo(
    () => pessoasAtivas.filter((p) => p.tipo === "entregador"),
    [pessoasAtivas]
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

  const semanas = useMemo(() => montarGradeCalendario(dias, 1), [dias]);
  const cabecalhoSemana = useMemo(() => rotulosCabecalhoSemana(1), []);
  const hoje = hojeISO();

  const nomePessoa = (id: string) => db.pessoas.find((p) => p.id === id)?.nome ?? "—";
  const primeiroNome = (id: string) => {
    const nome = nomePessoa(id);
    return nome.split(/\s+/)[0] ?? nome;
  };

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

  function abrirPadrao() {
    const pessoa = colaboradores[0];
    const base = formPadraoVazio(pessoa?.id ?? "");
    if (pessoa) base.funcao = rotuloFuncao(pessoa);
    setFormPadrao(base);
    setErroPadrao(null);
  }

  function salvarPadrao(e: FormEvent) {
    e.preventDefault();
    if (!formPadrao) return;
    const proximo = structuredClone(db);
    const resultado = gerarEscalaPadraoClt(
      proximo,
      {
        pessoa_id: formPadrao.pessoa_id,
        padrao: formPadrao.padrao,
        hora_inicio: formPadrao.hora_inicio,
        hora_fim: formPadrao.hora_fim,
        intervalo_min: Number(formPadrao.intervalo_min) || 0,
        funcao: formPadrao.funcao,
        local: formPadrao.local,
        inicio_janela: hojeISO(),
        referencia_ciclo: formPadrao.referencia_ciclo || hojeISO(),
      },
      { idFactory: () => uid("esc") }
    );
    if (!resultado.sucesso) {
      setErroPadrao(resultado.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setFormPadrao(null);
    setMensagem(
      `Padrão gerado: ${resultado.criados} plantão(ões) no período do calendário` +
        (resultado.pulados ? ` (${resultado.pulados} dia(s) já existiam)` : "") +
        "."
    );
    if (resultado.avisos.length) setAviso(resultado.avisos.join(" "));
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

  function soltarPlantaoNoDia(slotId: string, novaData: string) {
    const proximo = structuredClone(db);
    const r = moverSlotParaData(proximo, slotId, novaData);
    setArrasto(null);
    setDiaDestinoHover(null);
    if (!r.sucesso) {
      setErro(r.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setErro(null);
    setMensagem(`Plantão movido para ${formatDataBrLonga(novaData)}.`);
    if (r.avisos.length) setAviso(r.avisos.join(" "));
  }

  function soltarPessoaNoDia(pessoaId: string, data: string) {
    const pessoa = db.pessoas.find((p) => p.id === pessoaId);
    setArrasto(null);
    setDiaDestinoHover(null);
    if (!pessoa) {
      setErro("Pessoa não encontrada.");
      return;
    }
    const gate = validarPreRequisitosConvocacao(pessoa);
    if (!gate.ok) {
      setErro(gate.erros.join(" "));
      setAviso("Marque contrato e eSocial no perfil antes de convocar.");
      return;
    }
    const proximo = structuredClone(db);
    const resultado = criarSlot(
      proximo,
      {
        pessoa_id: pessoaId,
        data,
        hora_inicio: "18:00",
        hora_fim: "23:30",
        intervalo_min: 30,
        funcao: rotuloFuncao(pessoa),
        local: LOCAL_PADRAO_ESCALA,
      },
      { id: uid("esc"), convocacaoId: uid("conv") }
    );
    if (!resultado.sucesso) {
      setErro(resultado.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setErro(null);
    setMensagem(
      resultado.convocacao
        ? `${pessoa.nome.split(/\s+/)[0]} lançado em ${formatDataBrLonga(data)} com convocação em rascunho.`
        : `${pessoa.nome.split(/\s+/)[0]} lançado em ${formatDataBrLonga(data)}.`
    );
    if (resultado.avisos.length) setAviso(resultado.avisos.join(" "));
    if (resultado.slot) setDetalheSlotId(resultado.slot.id);
  }

  function aoSoltarNoDia(dia: string, dataTransfer: DataTransfer) {
    const tipo = dataTransfer.getData("text/escala-drag-tipo") || arrasto?.tipo;
    if (tipo === "pessoa") {
      const pessoaId = dataTransfer.getData("text/escala-pessoa-id") || (arrasto?.tipo === "pessoa" ? arrasto.id : "");
      if (pessoaId) soltarPessoaNoDia(pessoaId, dia);
      return;
    }
    const slotId = dataTransfer.getData("text/escala-slot-id") || (arrasto?.tipo === "slot" ? arrasto.id : "");
    if (slotId) soltarPlantaoNoDia(slotId, dia);
  }

  const detalheSlot = detalheSlotId ? db.escala_slots.find((s) => s.id === detalheSlotId) : null;
  const detalheConv: ConvocacaoIntermitente | undefined = detalheSlot
    ? convocacaoDoSlot(db, detalheSlot.id)
    : undefined;

  return (
    <div>
      <TituloPagina
        titulo="Escala"
        subtitulo={`Resto do mês atual + mês seguinte (${periodoRotulo}). Arraste intermitentes/motoboys da lista para o dia, ou remova plantões arrastando no calendário.`}
        acao={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secundario" onClick={abrirPadrao}>
              <RefreshCw size={16} /> Gerar padrão CLT
            </button>
            <button type="button" className="btn-primario" onClick={() => abrirNovo()}>
              <Plus size={16} /> Novo plantão
            </button>
          </div>
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
        <Vazio mensagem="Nenhum plantão no período. Arraste alguém da lista ao lado ou clique num dia." />
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 space-y-3 lg:sticky lg:top-20 lg:w-60">
          <Card className="space-y-3 p-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Banco para convocar</p>
              <p className="text-xs text-slate-600">Arraste o nome para um dia do calendário.</p>
            </div>
            <BancoPessoas
              titulo="Intermitentes"
              pessoas={intermitentes}
              arrasto={arrasto}
              onDragStart={(pessoaId) => setArrasto({ tipo: "pessoa", id: pessoaId })}
              onDragEnd={() => {
                setArrasto(null);
                setDiaDestinoHover(null);
              }}
            />
            <BancoPessoas
              titulo="Motoboys / entregadores"
              pessoas={entregadores}
              arrasto={arrasto}
              onDragStart={(pessoaId) => setArrasto({ tipo: "pessoa", id: pessoaId })}
              onDragEnd={() => {
                setArrasto(null);
                setDiaDestinoHover(null);
              }}
            />
            {intermitentes.length === 0 && entregadores.length === 0 && (
              <p className="text-xs text-slate-500">
                Cadastre intermitentes ou entregadores em{" "}
                <Link href="/rh" className="underline">
                  Pessoas
                </Link>
                .
              </p>
            )}
          </Card>
        </aside>

        <div className="min-w-0 flex-1">
          <Card className="overflow-x-auto p-3 sm:p-4">
            <p className="mb-3 text-sm text-slate-600">
              Calendário {periodoRotulo} — solte um nome da lista num dia para lançar; arraste no calendário para
              remarcar; clique no nome para o detalhe.
            </p>
            <div className="min-w-[640px]">
              <div className="mb-1 grid grid-cols-7 gap-1">
                {cabecalhoSemana.map((rotulo) => (
                  <div key={rotulo} className="px-1 py-1 text-center text-xs font-semibold uppercase text-slate-500">
                    {rotulo}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                {semanas.map((semana, idx) => {
                  const primeiroDiaMes = semana.find((d) => d && d.slice(8, 10) === "01") ?? null;
                  const inicioMesNaSemana =
                    idx === 0 || semana.some((d) => d && d.slice(8, 10) === "01")
                      ? primeiroDiaMes ?? (idx === 0 ? semana.find(Boolean) : null)
                      : null;
                  return (
                    <div key={idx}>
                      {inicioMesNaSemana && (
                        <p className="px-1 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                          {nomeMesAno(inicioMesNaSemana)}
                        </p>
                      )}
                      <div className="grid grid-cols-7 gap-1">
                        {semana.map((dia, col) => {
                          if (!dia) {
                            return <div key={`vazio-${idx}-${col}`} className="min-h-[7.5rem] rounded-lg bg-stone-50/80" />;
                          }
                          const lista = porDia.get(dia) ?? [];
                          const ehHoje = dia === hoje;
                          const ehDestino = Boolean(diaDestinoHover === dia && arrasto);
                          return (
                            <div
                              key={dia}
                              className={`flex min-h-[7.5rem] flex-col rounded-lg border p-1.5 transition-colors ${
                                ehDestino
                                  ? "border-primaria bg-primaria/10 ring-2 ring-primaria/30"
                                  : ehHoje
                                    ? "border-primaria bg-primaria/5"
                                    : lista.length > 0
                                      ? "border-stone-200 bg-white"
                                      : "border-dashed border-stone-200 bg-stone-50"
                              }`}
                              onDragOver={(e) => {
                                if (!arrasto) return;
                                e.preventDefault();
                                e.dataTransfer.dropEffect = arrasto.tipo === "pessoa" ? "copy" : "move";
                                setDiaDestinoHover(dia);
                              }}
                              onDragLeave={() => {
                                setDiaDestinoHover((atual) => (atual === dia ? null : atual));
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                aoSoltarNoDia(dia, e.dataTransfer);
                              }}
                            >
                              <div className="mb-1 flex items-center justify-between gap-1">
                                <button
                                  type="button"
                                  className="rounded px-0.5 text-left hover:bg-stone-100"
                                  onClick={() => abrirNovo(dia)}
                                  title="Adicionar plantão neste dia"
                                >
                                  <span className={`text-sm font-bold ${ehHoje ? "text-primaria-escura" : "text-slate-900"}`}>
                                    {dia.slice(8, 10)}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="rounded p-0.5 text-slate-400 hover:bg-stone-100 hover:text-primaria-escura"
                                  onClick={() => abrirNovo(dia)}
                                  aria-label={`Adicionar plantão em ${formatDataBrLonga(dia)}`}
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                              <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                                {lista.length === 0 ? (
                                  <p className="px-0.5 text-[10px] text-slate-400">Livre</p>
                                ) : (
                                  lista.map((slot) => {
                                    const conv = convocacaoDoSlot(db, slot.id);
                                    return (
                                      <button
                                        key={slot.id}
                                        type="button"
                                        draggable
                                        className={`cursor-grab truncate rounded bg-stone-100 px-1 py-0.5 text-left text-[11px] font-medium text-slate-800 hover:bg-primaria/15 active:cursor-grabbing ${
                                          arrasto?.tipo === "slot" && arrasto.id === slot.id ? "opacity-50" : ""
                                        }`}
                                        title={`${nomePessoa(slot.pessoa_id)} · ${slot.hora_inicio}–${slot.hora_fim}${
                                          conv ? ` · ${rotuloStatusConvocacao(conv.status)}` : ""
                                        } — arraste para outro dia`}
                                        onDragStart={(e) => {
                                          arrastouRef.current = false;
                                          setArrasto({ tipo: "slot", id: slot.id });
                                          e.dataTransfer.setData("text/escala-drag-tipo", "slot");
                                          e.dataTransfer.setData("text/escala-slot-id", slot.id);
                                          e.dataTransfer.effectAllowed = "move";
                                        }}
                                        onDragEnd={() => {
                                          setArrasto(null);
                                          setDiaDestinoHover(null);
                                          setTimeout(() => {
                                            arrastouRef.current = false;
                                          }, 0);
                                        }}
                                        onDrag={() => {
                                          arrastouRef.current = true;
                                        }}
                                        onClick={() => {
                                          if (arrastouRef.current) {
                                            arrastouRef.current = false;
                                            return;
                                          }
                                          setDetalheSlotId(slot.id);
                                          setErro(null);
                                          setCopiado(false);
                                        }}
                                      >
                                        {primeiroNome(slot.pessoa_id)}
                                        <span className="font-normal text-slate-500"> {slot.hora_inicio}</span>
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          <p className="mt-3 text-center text-xs text-slate-500">
            Horário padrão ao soltar da lista: 18:00–23:30. Ajuste no detalhe se precisar. No celular o arrastar pode
            falhar — use “Novo plantão”.
          </p>
        </div>
      </div>

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
                if (!p || !pessoaPrecisaConvocacao(p.tipo)) return null;
                const gate = validarPreRequisitosConvocacao(p);
                return (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-600">
                      Contrato e eSocial vêm antes; o WhatsApp só convoca o período (não substitui o contrato escrito).
                    </p>
                    {!gate.ok && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                        <p className="font-semibold">Não dá para convocar ainda</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4">
                          {gate.erros.map((msg) => (
                            <li key={msg}>{msg}</li>
                          ))}
                        </ul>
                        <Link href={`/rh/${p.id}`} className="mt-2 inline-block text-primaria-escura underline">
                          Abrir perfil e marcar contrato / eSocial
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })()}
            {erro && <p className="text-sm font-medium text-destaque">{erro}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secundario" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primario"
                disabled={Boolean(
                  form.pessoa_id &&
                    (() => {
                      const p = db.pessoas.find((x) => x.id === form.pessoa_id);
                      return p && pessoaPrecisaConvocacao(p.tipo) && !validarPreRequisitosConvocacao(p).ok;
                    })()
                )}
              >
                Salvar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        aberto={formPadrao !== null}
        titulo="Gerar padrão CLT (28 dias)"
        onFechar={() => setFormPadrao(null)}
        fecharAoClicarFundo={false}
      >
        {formPadrao && (
          <form onSubmit={salvarPadrao} className="space-y-3">
            <p className="text-sm text-slate-600">
              Preenche automaticamente os dias de trabalho do colaborador. Dias que já têm plantão são pulados.
            </p>
            <Campo rotulo="Colaborador *">
              <select
                className="campo"
                required
                value={formPadrao.pessoa_id}
                onChange={(e) => {
                  const pessoa = db.pessoas.find((p) => p.id === e.target.value);
                  setFormPadrao({
                    ...formPadrao,
                    pessoa_id: e.target.value,
                    funcao: pessoa ? rotuloFuncao(pessoa) : formPadrao.funcao,
                  });
                }}
              >
                <option value="">Selecione</option>
                {colaboradores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Padrão *">
              <select
                className="campo"
                value={formPadrao.padrao}
                onChange={(e) => setFormPadrao({ ...formPadrao, padrao: e.target.value as PadraoEscalaClt })}
              >
                {PADROES_ESCALA_CLT.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.rotulo} — {p.descricao}
                  </option>
                ))}
              </select>
            </Campo>
            {formPadrao.padrao !== "seg_sex" && (
              <Campo rotulo="Início do ciclo (dia 1 de trabalho)">
                <input
                  type="date"
                  className="campo"
                  value={formPadrao.referencia_ciclo}
                  onChange={(e) => setFormPadrao({ ...formPadrao, referencia_ciclo: e.target.value })}
                />
              </Campo>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Início *">
                <input
                  type="time"
                  className="campo"
                  required
                  value={formPadrao.hora_inicio}
                  onChange={(e) => setFormPadrao({ ...formPadrao, hora_inicio: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Término *">
                <input
                  type="time"
                  className="campo"
                  required
                  value={formPadrao.hora_fim}
                  onChange={(e) => setFormPadrao({ ...formPadrao, hora_fim: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Intervalo (min)">
                <input
                  className="campo"
                  inputMode="numeric"
                  value={formPadrao.intervalo_min}
                  onChange={(e) => setFormPadrao({ ...formPadrao, intervalo_min: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Função">
                <input
                  className="campo"
                  value={formPadrao.funcao}
                  onChange={(e) => setFormPadrao({ ...formPadrao, funcao: e.target.value })}
                />
              </Campo>
            </div>
            <Campo rotulo="Local">
              <input
                className="campo"
                value={formPadrao.local}
                onChange={(e) => setFormPadrao({ ...formPadrao, local: e.target.value })}
              />
            </Campo>
            {erroPadrao && <p className="text-sm font-medium text-destaque">{erroPadrao}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secundario" onClick={() => setFormPadrao(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario">
                Gerar 28 dias
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
