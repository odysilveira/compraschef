"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Check, Copy, Download, Filter, GripVertical, Plus, RefreshCw } from "lucide-react";
import { Badge, Campo, Card, Modal, TituloPagina, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import {
  HORARIO_PADRAO_CLT_12X36,
  LOCAL_PADRAO_ESCALA,
  PADROES_ESCALA_CLT,
  abrevSetorConvocacao,
  convocacaoDoSlot,
  criarSlot,
  excluirSlot,
  exportarEscalaCsv,
  formatDataBrLonga,
  gerarEscalaPadraoClt,
  janelaCalendarioEscala,
  linkWhatsAppConvocacao,
  listarCltSemPlantaoNaJanela,
  listarConvocacoesRascunhoNaJanela,
  marcarConvocacaoEnviada,
  montarGradeCalendario,
  moverSlotParaData,
  nomeDiaSemana,
  nomeMesAno,
  pagamentoDaConvocacao,
  pessoaPrecisaConvocacao,
  registrarRespostaConvocacao,
  registrarSilencioConvocacoesVencidas,
  convocacaoEnviadaSemRespostaVencida,
  resumoSetoresDoDia,
  rotuloPeriodoJanela,
  rotuloSetorConvocacao,
  rotuloStatusConvocacao,
  rotulosCabecalhoSemana,
  setorDoPlantao,
  slotsNaJanela,
  textoResumoSetores,
  validarPreRequisitosConvocacao,
  setorOperacionalDaPessoa,
  type PadraoEscalaClt,
  type SetorArrastoEscala,
  type SetorConvocacaoEscala,
} from "@/lib/domain/escala";
import {
  destaqueSlotFiltroConvocacao,
  hrefEscalaRh,
  parseAlertaCltEscalaRh,
  parseFiltroConvocacaoEscalaRh,
  parsePessoaPontoRh,
  type FiltroConvocacaoEscalaRh,
} from "@/lib/domain/resumo-rh";
import { rotuloStatusPagamentoPessoa } from "@/lib/domain/pagamentos-pessoas";
import {
  montarTextoConfirmacaoRecebimento,
  montarTextoReciboPagamentoPessoa,
} from "@/lib/domain/recibo-pagamento-pessoa";
import { rotuloFuncao, rotuloTipoPessoa } from "@/lib/domain/rh";
import { usePodeAcessarModulo } from "@/lib/roles";
import { moeda } from "@/lib/format";
import type { ConvocacaoIntermitente, EscalaSlot, PessoaRH, StatusConvocacao } from "@/lib/types";

function setorArrastoIntermitente(pessoa: PessoaRH): Exclude<SetorConvocacaoEscala, "motoboy"> {
  const setor = setorOperacionalDaPessoa(pessoa);
  if (setor === "cozinha" || setor === "balcao" || setor === "salao") return setor;
  return "salao";
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type Arrasto =
  | { tipo: "slot"; id: string }
  | { tipo: "pessoa"; id: string; setor: SetorArrastoEscala };

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
    padrao: "12x36",
    hora_inicio: HORARIO_PADRAO_CLT_12X36.hora_inicio,
    hora_fim: HORARIO_PADRAO_CLT_12X36.hora_fim,
    intervalo_min: String(HORARIO_PADRAO_CLT_12X36.intervalo_min),
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
  setor,
  arrasto,
  onDragStart,
  onDragEnd,
  onGerarPadrao,
  resolverSetor,
  vazio,
  destaquePessoaId,
}: {
  titulo: string;
  pessoas: PessoaRH[];
  /** Setor fixo do banco (ex.: clt, motoboy) — ignorado se `resolverSetor` existir. */
  setor: SetorArrastoEscala;
  arrasto: Arrasto | null;
  onDragStart: (pessoaId: string, setor: SetorArrastoEscala) => void;
  onDragEnd: () => void;
  /** Só para CLT: abre o gerador de padrão (ex.: 12x36). */
  onGerarPadrao?: (pessoaId: string) => void;
  /** Intermitentes: setor vem da função de cada pessoa. */
  resolverSetor?: (pessoa: PessoaRH) => SetorArrastoEscala;
  /** Mensagem quando a lista está vazia (em vez de ocultar o bloco). */
  vazio?: ReactNode;
  /** Deep link `?pessoa=` — destaca na lista lateral. */
  destaquePessoaId?: string;
}) {
  const ehClt = setor === "clt";
  const destaqueRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!destaquePessoaId) return;
    if (!pessoas.some((p) => p.id === destaquePessoaId)) return;
    destaqueRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [destaquePessoaId, pessoas]);

  if (pessoas.length === 0) {
    if (!vazio) return null;
    return (
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
        <p className="text-xs text-slate-500">{vazio}</p>
      </div>
    );
  }

  const ordenadas = destaquePessoaId
    ? [...pessoas].sort((a, b) => {
        if (a.id === destaquePessoaId) return -1;
        if (b.id === destaquePessoaId) return 1;
        return a.nome.localeCompare(b.nome, "pt-BR");
      })
    : pessoas;

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</p>
      <ul className="space-y-1">
        {ordenadas.map((p) => {
          const setorPessoa = resolverSetor ? resolverSetor(p) : setor;
          const gate = ehClt
            ? { ok: true, erros: [] as string[], avisos: [] as string[] }
            : validarPreRequisitosConvocacao(p);
          const ativo =
            arrasto?.tipo === "pessoa" && arrasto.id === p.id && arrasto.setor === setorPessoa;
          const emDestaque = Boolean(destaquePessoaId && p.id === destaquePessoaId);
          const temAvisoDocs = gate.ok && gate.avisos.length > 0;
          const rotuloSetor =
            setorPessoa !== "clt" ? rotuloSetorConvocacao(setorPessoa as SetorConvocacaoEscala) : "";
          return (
            <li
              key={`${setorPessoa}-${p.id}`}
              ref={emDestaque ? destaqueRef : undefined}
              className={`space-y-1 ${emDestaque ? "scroll-mt-4 rounded-lg ring-2 ring-sky-500 ring-offset-1" : ""}`}
            >
              <button
                type="button"
                draggable
                className={`flex w-full cursor-grab items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-sm active:cursor-grabbing ${
                  ativo
                    ? "border-primaria bg-primaria/10 opacity-60"
                    : emDestaque
                      ? "border-sky-400 bg-sky-100 hover:border-sky-500"
                      : gate.ok
                        ? temAvisoDocs
                          ? "border-amber-200 bg-amber-50/50 hover:border-amber-400"
                          : ehClt
                            ? "border-sky-200 bg-sky-50 hover:border-sky-400"
                            : "border-stone-200 bg-white hover:border-primaria/40"
                        : "border-amber-200 bg-amber-50/80"
                }`}
                title={
                  ehClt
                    ? `Arraste ${p.nome} para um dia (CLT · sem convocação)`
                    : gate.ok
                      ? temAvisoDocs
                        ? `${gate.avisos[0]} — arraste ${p.nome} como ${rotuloSetor}`
                        : `Arraste ${p.nome} como ${rotuloSetor}`
                      : `Falta contrato/eSocial — ${gate.erros[0] ?? ""}`
                }
                onDragStart={(e) => {
                  onDragStart(p.id, setorPessoa);
                  e.dataTransfer.setData("text/escala-drag-tipo", "pessoa");
                  e.dataTransfer.setData("text/escala-pessoa-id", p.id);
                  e.dataTransfer.setData("text/escala-setor", setorPessoa);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onDragEnd={onDragEnd}
              >
                <GripVertical size={14} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate font-medium">{p.nome.split(/\s+/)[0]}</span>
                {ehClt && <span className="shrink-0 text-[10px] font-semibold text-sky-800">CLT</span>}
                {!ehClt && setorPessoa !== "motoboy" && (
                  <span className="shrink-0 text-[10px] font-semibold uppercase text-stone-600">
                    {abrevSetorConvocacao(setorPessoa as SetorConvocacaoEscala)}
                  </span>
                )}
              </button>
              {onFiltrarPessoa && (
                <button
                  type="button"
                  className={`flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-[11px] font-medium underline-offset-2 hover:underline ${
                    emDestaque ? "text-sky-900" : "text-slate-600"
                  }`}
                  title={
                    emDestaque
                      ? "Limpar filtro desta pessoa"
                      : `Ver só plantões de ${p.nome} no calendário`
                  }
                  onClick={() => onFiltrarPessoa(p.id)}
                >
                  <Filter size={12} className="shrink-0" />
                  {emDestaque ? "Limpar filtro" : "Só este no calendário"}
                </button>
              )}
              {ehClt && onGerarPadrao && (
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-1 text-left text-[11px] font-medium text-sky-900 underline-offset-2 hover:underline"
                  onClick={() => onGerarPadrao(p.id)}
                >
                  Gerar 12x36 no calendário…
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RhEscalaConteudo() {
  const db = useDB();
  const router = useRouter();
  const searchParams = useSearchParams();
  const podeRh = usePodeAcessarModulo("rh");
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
  const [filtroConvocacao, setFiltroConvocacao] = useState<FiltroConvocacaoEscalaRh>(() =>
    parseFiltroConvocacaoEscalaRh(searchParams.get("convocacao"))
  );
  const [destaqueCltSem, setDestaqueCltSem] = useState(() =>
    parseAlertaCltEscalaRh(searchParams.get("clt"))
  );
  const [filtroPessoa, setFiltroPessoa] = useState(() =>
    parsePessoaPontoRh(searchParams.get("pessoa"))
  );
  const cltSemRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFiltroConvocacao(parseFiltroConvocacaoEscalaRh(searchParams.get("convocacao")));
    setDestaqueCltSem(parseAlertaCltEscalaRh(searchParams.get("clt")));
    setFiltroPessoa(parsePessoaPontoRh(searchParams.get("pessoa")));
  }, [searchParams]);

  useEffect(() => {
    if (!destaqueCltSem || filtroConvocacao !== "todas") return;
    cltSemRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [destaqueCltSem, filtroConvocacao]);

  function irParaFiltroConvocacao(proximo: FiltroConvocacaoEscalaRh) {
    setFiltroConvocacao(proximo);
    setDestaqueCltSem(false);
    router.replace(
      hrefEscalaRh({
        convocacao: proximo,
        pessoa: filtroPessoa || undefined,
      }),
      { scroll: false }
    );
  }

  function limparDestaqueClt() {
    setDestaqueCltSem(false);
    router.replace(
      hrefEscalaRh({
        convocacao: filtroConvocacao,
        pessoa: filtroPessoa || undefined,
      }),
      { scroll: false }
    );
  }

  function limparFiltroPessoa() {
    setFiltroPessoa("");
    router.replace(
      hrefEscalaRh({
        convocacao: filtroConvocacao,
        clt: destaqueCltSem ? "sem" : undefined,
      }),
      { scroll: false }
    );
  }

  function alternarFiltroPessoa(pessoaId: string) {
    if (filtroPessoa === pessoaId) {
      limparFiltroPessoa();
      return;
    }
    setFiltroPessoa(pessoaId);
    router.replace(
      hrefEscalaRh({
        convocacao: filtroConvocacao,
        clt: destaqueCltSem ? "sem" : undefined,
        pessoa: pessoaId,
      }),
      { scroll: false }
    );
  }

  const dias = useMemo(() => janelaCalendarioEscala(hojeISO()), []);
  const hoje = hojeISO();
  const periodoRotulo = useMemo(() => rotuloPeriodoJanela(dias), [dias]);
  const pessoasAtivas = useMemo(
    () => (db.pessoas ?? []).filter((p) => p.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [db.pessoas]
  );
  const colaboradores = useMemo(
    () => pessoasAtivas.filter((p) => p.tipo === "colaborador"),
    [pessoasAtivas]
  );
  const cltSemPlantao = useMemo(
    () => listarCltSemPlantaoNaJanela(db, dias),
    [db, dias]
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
  const convocacoesEnviadasNaJanela = useMemo(() => {
    const idsSlotsJanela = new Set(slots.map((s) => s.id));
    return (db.convocacoes ?? [])
      .filter((c) => {
        if (c.status !== "enviada") return false;
        const slot = db.escala_slots.find((s) => s.id === c.escala_slot_id);
        if (!slot) return false;
        // Inclui enviadas da janela e também plantões já passados (fora do calendário).
        return idsSlotsJanela.has(slot.id) || slot.data < hoje;
      })
      .slice()
      .sort((a, b) => {
        const sa = db.escala_slots.find((s) => s.id === a.escala_slot_id);
        const sb = db.escala_slots.find((s) => s.id === b.escala_slot_id);
        const va = convocacaoEnviadaSemRespostaVencida(a.status, sa?.data, hoje) ? 0 : 1;
        const vb = convocacaoEnviadaSemRespostaVencida(b.status, sb?.data, hoje) ? 0 : 1;
        if (va !== vb) return va - vb;
        return (sa?.data ?? "").localeCompare(sb?.data ?? "") || a.id.localeCompare(b.id);
      });
  }, [db.convocacoes, db.escala_slots, hoje, slots]);

  const convocacoesEnviadasVencidas = useMemo(
    () =>
      convocacoesEnviadasNaJanela.filter((c) => {
        const slot = db.escala_slots.find((s) => s.id === c.escala_slot_id);
        return convocacaoEnviadaSemRespostaVencida(c.status, slot?.data, hoje);
      }),
    [convocacoesEnviadasNaJanela, db.escala_slots, hoje]
  );

  const convocacoesRascunhoNaJanela = useMemo(
    () => listarConvocacoesRascunhoNaJanela(db, dias),
    [db, dias]
  );

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

  const nomePessoa = (id: string) => db.pessoas.find((p) => p.id === id)?.nome ?? "—";
  const primeiroNome = (id: string) => {
    const nome = nomePessoa(id);
    return nome.split(/\s+/)[0] ?? nome;
  };

  if (!podeRh) {
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

  function abrirWhatsAppConvocacao(convocacaoId: string) {
    const convocacao = db.convocacoes.find((c) => c.id === convocacaoId);
    if (!convocacao) {
      setErro("Convocação não encontrada.");
      return;
    }
    const pessoa = db.pessoas.find((p) => p.id === convocacao.pessoa_id);
    const url = linkWhatsAppConvocacao(pessoa?.telefone, convocacao.texto_mensagem);
    if (!url) {
      setErro("Cadastre o telefone / WhatsApp no perfil para abrir a conversa.");
      return;
    }
    const proximo = structuredClone(db);
    const r = marcarConvocacaoEnviada(proximo, convocacaoId);
    if (r.sucesso) {
      mutate((atual) => Object.assign(atual, proximo));
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setMensagem("WhatsApp aberto. Convocação marcada como enviada.");
    setErro(null);
  }

  function excluirPlantao(slotId: string) {
    const proximo = structuredClone(db);
    const r = excluirSlot(proximo, slotId);
    if (!r.sucesso) {
      setErro(r.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setDetalheSlotId(null);
    setErro(null);
    setMensagem("Plantão excluído.");
    if (r.avisos.length) setAviso(r.avisos.join(" "));
  }

  async function copiarReciboDoPagamento(convocacaoId: string, variante: "recibo" | "confirmacao") {
    const pagamento = pagamentoDaConvocacao(db, convocacaoId);
    if (!pagamento) {
      setErro("Pagamento desta convocação não encontrado.");
      return;
    }
    const pessoa = db.pessoas.find((p) => p.id === pagamento.pessoa_id);
    if (!pessoa) {
      setErro("Pessoa do pagamento não encontrada.");
      return;
    }
    const texto =
      variante === "confirmacao"
        ? montarTextoConfirmacaoRecebimento({ pessoa, pagamento })
        : montarTextoReciboPagamentoPessoa({
            pessoa,
            pagamento,
            consumos: db.consumos_pessoas ?? [],
          });
    try {
      await navigator.clipboard.writeText(texto);
      setErro(null);
      setMensagem(
        variante === "confirmacao"
          ? "Confirmação do empregado copiada — envie para responder no WhatsApp."
          : "Recibo discriminado copiado — pode colar no WhatsApp ou arquivar."
      );
    } catch {
      setErro("Não foi possível copiar neste navegador.");
    }
  }

  function abrirPadrao(pessoaId?: string) {
    const pessoa = pessoaId
      ? db.pessoas.find((p) => p.id === pessoaId)
      : colaboradores[0];
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
      setErro(null);
    } else {
      setMensagem(`Resposta registrada: ${rotuloStatusConvocacao(status)}.`);
    }
  }

  function registrarSilencioVencidas() {
    const proximo = structuredClone(db);
    const r = registrarSilencioConvocacoesVencidas(proximo, hoje);
    if (!r.sucesso) {
      setErro(r.erros.join(" ") || "Não foi possível registrar o silêncio.");
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setErro(null);
    setMensagem(
      r.atualizadas === 0
        ? "Nenhuma convocação vencida para registrar silêncio."
        : `${r.atualizadas} convocação(ões) marcada(s) como silêncio (plantão já passou).`
    );
    if (r.avisos.length) setAviso(r.avisos.join(" "));
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

  function soltarPessoaNoDia(pessoaId: string, data: string, setor: SetorArrastoEscala) {
    const pessoa = db.pessoas.find((p) => p.id === pessoaId);
    setArrasto(null);
    setDiaDestinoHover(null);
    if (!pessoa) {
      setErro("Pessoa não encontrada.");
      return;
    }

    if (setor === "clt") {
      if (pessoa.tipo !== "colaborador") {
        setErro("Só colaboradores CLT entram por esta lista.");
        return;
      }
      const proximo = structuredClone(db);
      // A partir deste dia: preenche o resto do calendário em 12x36 (dia sim / dia não).
      const gerado = gerarEscalaPadraoClt(
        proximo,
        {
          pessoa_id: pessoaId,
          padrao: "12x36",
          hora_inicio: HORARIO_PADRAO_CLT_12X36.hora_inicio,
          hora_fim: HORARIO_PADRAO_CLT_12X36.hora_fim,
          intervalo_min: HORARIO_PADRAO_CLT_12X36.intervalo_min,
          funcao: rotuloFuncao(pessoa),
          local: LOCAL_PADRAO_ESCALA,
          inicio_janela: data,
          referencia_ciclo: data,
          pular_existentes: true,
        },
        { idFactory: () => uid("esc") }
      );
      if (!gerado.sucesso) {
        setErro(gerado.erros.join(" "));
        return;
      }
      mutate((atual) => Object.assign(atual, proximo));
      setErro(null);
      const nomeCurto = pessoa.nome.split(/\s+/)[0];
      const setorPessoa = setorOperacionalDaPessoa(pessoa);
      const setorTxt =
        setorPessoa === "cozinha"
          ? "cozinha"
          : setorPessoa === "balcao"
            ? "balcão"
            : setorPessoa === "salao"
              ? "salão"
              : rotuloFuncao(pessoa);
      setMensagem(
        `${nomeCurto} (CLT · ${setorTxt}): ${gerado.criados} dia(s) no 12x36 a partir de ${formatDataBrLonga(data)}` +
          (gerado.pulados ? ` (${gerado.pulados} já existiam)` : "") +
          " — dias alternados até o fim do período."
      );
      const slotDoDia = (proximo.escala_slots ?? []).find((s) => s.pessoa_id === pessoaId && s.data === data);
      if (slotDoDia) setDetalheSlotId(slotDoDia.id);
      return;
    }

    if (setor === "motoboy" && pessoa.tipo !== "entregador") {
      setErro("Só entregadores entram como motoboy.");
      return;
    }
    if (setor !== "motoboy" && pessoa.tipo === "entregador") {
      setErro("Entregador só pode ser lançado como motoboy.");
      return;
    }
    if (pessoa.tipo === "colaborador") {
      setErro("Colaborador CLT: use a lista CLT ou Gerar padrão 12x36.");
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
        funcao: rotuloSetorConvocacao(setor),
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
    const nomeCurto = pessoa.nome.split(/\s+/)[0];
    setMensagem(
      resultado.convocacao
        ? `${nomeCurto} em ${rotuloSetorConvocacao(setor)} · ${formatDataBrLonga(data)} (convocação em rascunho).`
        : `${nomeCurto} em ${rotuloSetorConvocacao(setor)} · ${formatDataBrLonga(data)}.`
    );
    if (resultado.avisos.length) setAviso(resultado.avisos.join(" "));
    if (resultado.slot) setDetalheSlotId(resultado.slot.id);
  }

  function aoSoltarNoDia(dia: string, dataTransfer: DataTransfer) {
    const tipo = dataTransfer.getData("text/escala-drag-tipo") || arrasto?.tipo;
    if (tipo === "pessoa") {
      const pessoaId = dataTransfer.getData("text/escala-pessoa-id") || (arrasto?.tipo === "pessoa" ? arrasto.id : "");
      const setorBruto =
        dataTransfer.getData("text/escala-setor") || (arrasto?.tipo === "pessoa" ? arrasto.setor : "");
      const setor = (["cozinha", "balcao", "salao", "motoboy", "clt"] as SetorArrastoEscala[]).includes(
        setorBruto as SetorArrastoEscala
      )
        ? (setorBruto as SetorArrastoEscala)
        : null;
      if (pessoaId && setor) soltarPessoaNoDia(pessoaId, dia, setor);
      return;
    }
    const slotId = dataTransfer.getData("text/escala-slot-id") || (arrasto?.tipo === "slot" ? arrasto.id : "");
    if (slotId) soltarPlantaoNoDia(slotId, dia);
  }

  const detalheSlot = detalheSlotId ? db.escala_slots.find((s) => s.id === detalheSlotId) : null;
  const detalheConv: ConvocacaoIntermitente | undefined = detalheSlot
    ? convocacaoDoSlot(db, detalheSlot.id)
    : undefined;
  const detalhePagamento = detalheConv ? pagamentoDaConvocacao(db, detalheConv.id) : undefined;
  const detalhePessoa = detalheSlot ? db.pessoas.find((p) => p.id === detalheSlot.pessoa_id) : undefined;
  const linkWaDetalhe =
    detalheConv && detalhePessoa
      ? linkWhatsAppConvocacao(detalhePessoa.telefone, detalheConv.texto_mensagem)
      : null;

  function baixarEscalaCsv() {
    let slotsCsv =
      filtroConvocacao === "todas"
        ? slots
        : slots.filter((s) => {
            const status = convocacaoDoSlot(db, s.id)?.status;
            return filtroConvocacao === "rascunho"
              ? status === "rascunho"
              : status === "enviada";
          });
    if (filtroPessoa) {
      slotsCsv = slotsCsv.filter((s) => s.pessoa_id === filtroPessoa);
    }
    if (slotsCsv.length === 0) {
      setMensagem("Nenhum plantão neste filtro para exportar.");
      return;
    }
    const csv = exportarEscalaCsv(slotsCsv, {
      nomePorId: nomePessoa,
      tipoPorId: (id) => {
        const p = db.pessoas.find((x) => x.id === id);
        return p ? rotuloTipoPessoa(p.tipo) : "";
      },
      statusConvocacaoPorSlotId: (slotId) => {
        const c = convocacaoDoSlot(db, slotId);
        return c ? rotuloStatusConvocacao(c.status) : "";
      },
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const partes = [
      filtroConvocacao === "todas" ? "janela" : filtroConvocacao,
      filtroPessoa || null,
    ].filter(Boolean);
    a.download = `rh-escala-${partes.join("-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMensagem(`CSV baixado (${slotsCsv.length} plantão(ões)).`);
    setErro(null);
  }

  return (
    <div>
      <TituloPagina
        titulo="Escala"
        subtitulo={`Resto do mês atual + mês seguinte (${periodoRotulo}). CLT (12x36) e intermitentes/motoboys no mesmo calendário — arraste da lista ou gere o padrão.`}
        acao={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secundario"
              onClick={baixarEscalaCsv}
              disabled={slots.length === 0}
              title={
                slots.length === 0
                  ? "Nenhum plantão na janela"
                  : "Exportar plantões do filtro atual (CSV)"
              }
            >
              <Download size={16} /> Exportar CSV
            </button>
            <button type="button" className="btn-secundario" onClick={() => abrirPadrao()}>
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
        <button
          type="button"
          className={filtroConvocacao === "rascunho" ? "btn-primario" : "btn-secundario"}
          onClick={() =>
            irParaFiltroConvocacao(filtroConvocacao === "rascunho" ? "todas" : "rascunho")
          }
        >
          A enviar ({convocacoesRascunhoNaJanela.length})
        </button>
        <button
          type="button"
          className={filtroConvocacao === "enviada" ? "btn-primario" : "btn-secundario"}
          onClick={() =>
            irParaFiltroConvocacao(filtroConvocacao === "enviada" ? "todas" : "enviada")
          }
        >
          Enviadas ({convocacoesEnviadasNaJanela.length}
          {convocacoesEnviadasVencidas.length > 0
            ? ` · ${convocacoesEnviadasVencidas.length} sem resposta`
            : ""}
          )
        </button>
      </div>

      {filtroPessoa && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-2 border-sky-200 bg-sky-50/70 p-3">
          <p className="text-sm text-sky-950">
            Mostrando plantões de <strong>{nomePessoa(filtroPessoa)}</strong> em destaque no calendário.
          </p>
          <button type="button" className="btn-secundario text-sm" onClick={limparFiltroPessoa}>
            Limpar pessoa
          </button>
        </Card>
      )}

      {cltSemPlantao.length > 0 && filtroConvocacao === "todas" && (
        <div
          ref={cltSemRef}
          id="clt-sem-plantao"
          className={destaqueCltSem ? "mb-4 scroll-mt-4 rounded-xl ring-2 ring-sky-500 ring-offset-2" : "mb-4"}
        >
          <Card className="space-y-3 border-sky-200 bg-sky-50/60">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-sky-950">
                CLT sem plantão neste período ({cltSemPlantao.length})
              </h2>
              <p className="text-sm text-sky-900/80">
                Sem escala no calendário, o ponto não detecta faltas. Gere o padrão 12x36 (ou outro) para
                preencher a janela.
              </p>
            </div>
            {destaqueCltSem && (
              <button type="button" className="btn-secundario text-sm" onClick={limparDestaqueClt}>
                Limpar destaque
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {cltSemPlantao.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-white px-3 py-2"
              >
                <div>
                  <p className="font-medium text-slate-900">{p.nome}</p>
                  <p className="text-sm text-slate-600">{rotuloFuncao(p)}</p>
                </div>
                <button
                  type="button"
                  className="btn-primario text-sm"
                  onClick={() => abrirPadrao(p.id)}
                >
                  Gerar 12x36…
                </button>
              </li>
            ))}
          </ul>
          </Card>
        </div>
      )}

      {filtroConvocacao === "rascunho" && (
        <Card className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold">Convocações a enviar (rascunho)</h2>
              <p className="text-sm text-slate-600">
                Plantões já criados — falta copiar/abrir o WhatsApp e marcar como enviada. No calendário,
                esses plantões ficam em destaque.
              </p>
            </div>
            <button
              type="button"
              className="btn-secundario text-sm"
              onClick={() => irParaFiltroConvocacao("todas")}
            >
              Limpar filtro
            </button>
          </div>
          {convocacoesRascunhoNaJanela.length === 0 ? (
            <Vazio mensagem="Nenhuma convocação em rascunho neste período." />
          ) : (
            <ul className="space-y-2">
              {convocacoesRascunhoNaJanela.map((conv) => {
                const slot = db.escala_slots.find((s) => s.id === conv.escala_slot_id);
                const pessoa = db.pessoas.find((p) => p.id === conv.pessoa_id);
                const linkWa = linkWhatsAppConvocacao(pessoa?.telefone, conv.texto_mensagem);
                return (
                  <li
                    key={conv.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-300 bg-stone-50 px-3 py-2"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{nomePessoa(conv.pessoa_id)}</p>
                      <p className="text-sm text-slate-600">
                        {slot
                          ? `${formatDataBrLonga(slot.data)} · ${slot.hora_inicio}–${slot.hora_fim}`
                          : "Plantão"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {linkWa && (
                        <button
                          type="button"
                          className="btn-primario text-sm"
                          onClick={() => abrirWhatsAppConvocacao(conv.id)}
                        >
                          WhatsApp
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-secundario text-sm"
                        onClick={() => void copiarTexto(conv.texto_mensagem, conv.id)}
                      >
                        Copiar
                      </button>
                      <button
                        type="button"
                        className="btn-secundario text-sm"
                        onClick={() => setDetalheSlotId(conv.escala_slot_id)}
                      >
                        Abrir
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {filtroConvocacao === "enviada" && (
        <Card className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold">Convocações enviadas (aguardando resposta)</h2>
              <p className="text-sm text-slate-600">
                No calendário, plantões enviados ficam em destaque âmbar; os demais ficam atenuados.
                {convocacoesEnviadasVencidas.length > 0
                  ? ` ${convocacoesEnviadasVencidas.length} com plantão já passado — registre silêncio para limpar a fila.`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {convocacoesEnviadasVencidas.length > 0 && (
                <button
                  type="button"
                  className="btn-secundario text-sm"
                  onClick={registrarSilencioVencidas}
                >
                  Silêncio nos vencidos ({convocacoesEnviadasVencidas.length})
                </button>
              )}
              <button
                type="button"
                className="btn-secundario text-sm"
                onClick={() => irParaFiltroConvocacao("todas")}
              >
                Limpar filtro
              </button>
            </div>
          </div>
          {convocacoesEnviadasNaJanela.length === 0 ? (
            <Vazio mensagem="Nenhuma convocação enviada neste período." />
          ) : (
            <ul className="space-y-2">
              {convocacoesEnviadasNaJanela.map((conv) => {
                const slot = db.escala_slots.find((s) => s.id === conv.escala_slot_id);
                const vencida = convocacaoEnviadaSemRespostaVencida(conv.status, slot?.data, hoje);
                return (
                  <li
                    key={conv.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                      vencida
                        ? "border-orange-400 bg-orange-50"
                        : "border-amber-300 bg-amber-50"
                    }`}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-900">{nomePessoa(conv.pessoa_id)}</p>
                        {vencida && <Badge cor="laranja">Sem resposta</Badge>}
                      </div>
                      <p className="text-sm text-slate-600">
                        {slot
                          ? `${formatDataBrLonga(slot.data)} · ${slot.hora_inicio}–${slot.hora_fim}`
                          : "Plantão"}
                        {vencida ? " · plantão já passou" : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {vencida && (
                        <button
                          type="button"
                          className="btn-secundario text-sm"
                          onClick={() => responder(conv.id, "silencio")}
                        >
                          Registrar silêncio
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-primario text-sm"
                        onClick={() => setDetalheSlotId(conv.escala_slot_id)}
                      >
                        Abrir
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {slots.length === 0 ? (
        <Vazio mensagem="Nenhum plantão no período. Arraste alguém da lista ao lado ou clique num dia." />
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 space-y-3 lg:sticky lg:top-20 lg:w-60">
          <Card className="space-y-3 p-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Quem entra na escala</p>
              <p className="text-xs text-slate-600">
                CLT: solte num dia e o sistema preenche o 12x36. Intermitentes: arraste para o dia — gera
                convocação em rascunho (WhatsApp). Motoboys entram na lista abaixo.
              </p>
            </div>
            <BancoPessoas
              titulo="CLT — mensalistas"
              pessoas={colaboradores}
              setor="clt"
              arrasto={arrasto}
              onDragStart={(pessoaId, setor) => setArrasto({ tipo: "pessoa", id: pessoaId, setor })}
              onDragEnd={() => {
                setArrasto(null);
                setDiaDestinoHover(null);
              }}
              onGerarPadrao={(pessoaId) => abrirPadrao(pessoaId)}
              vazio="Nenhum CLT ativo — cadastre em Pessoas."
              destaquePessoaId={filtroPessoa || undefined}
              onFiltrarPessoa={alternarFiltroPessoa}
            />
            <BancoPessoas
              titulo="Intermitentes"
              pessoas={intermitentes}
              setor="salao"
              resolverSetor={setorArrastoIntermitente}
              arrasto={arrasto}
              onDragStart={(pessoaId, setor) => setArrasto({ tipo: "pessoa", id: pessoaId, setor })}
              onDragEnd={() => {
                setArrasto(null);
                setDiaDestinoHover(null);
              }}
              vazio={
                <>
                  Nenhum intermitente ativo — cadastre em{" "}
                  <Link href="/rh" className="underline">
                    Pessoas
                  </Link>
                  .
                </>
              }
              destaquePessoaId={filtroPessoa || undefined}
              onFiltrarPessoa={alternarFiltroPessoa}
            />
            <BancoPessoas
              titulo="Motoboys / entregadores"
              pessoas={entregadores}
              setor="motoboy"
              arrasto={arrasto}
              onDragStart={(pessoaId, setor) => setArrasto({ tipo: "pessoa", id: pessoaId, setor })}
              onDragEnd={() => {
                setArrasto(null);
                setDiaDestinoHover(null);
              }}
              destaquePessoaId={filtroPessoa || undefined}
              onFiltrarPessoa={alternarFiltroPessoa}
            />
            {colaboradores.length === 0 && intermitentes.length === 0 && entregadores.length === 0 && (
              <p className="text-xs text-slate-500">
                Cadastre pessoas em{" "}
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
                          const diaComEnviada =
                            filtroConvocacao === "enviada" &&
                            lista.some((s) => convocacaoDoSlot(db, s.id)?.status === "enviada");
                          const diaComRascunho =
                            filtroConvocacao === "rascunho" &&
                            lista.some((s) => convocacaoDoSlot(db, s.id)?.status === "rascunho");
                          const resumo = resumoSetoresDoDia(lista, db.pessoas ?? []);
                          const resumoPreview =
                            ehDestino && arrasto?.tipo === "pessoa"
                              ? (() => {
                                  const pessoaArrasto = db.pessoas.find((p) => p.id === arrasto.id);
                                  const setorClt =
                                    arrasto.setor === "clt" && pessoaArrasto
                                      ? setorOperacionalDaPessoa(pessoaArrasto)
                                      : null;
                                  const setorEfetivo =
                                    arrasto.setor === "clt" ? setorClt : (arrasto.setor as SetorConvocacaoEscala);
                                  const ehClt = arrasto.setor === "clt";
                                  return {
                                    clt_cozinha:
                                      resumo.clt_cozinha + (ehClt && setorEfetivo === "cozinha" ? 1 : 0),
                                    clt_balcao: resumo.clt_balcao + (ehClt && setorEfetivo === "balcao" ? 1 : 0),
                                    clt_salao: resumo.clt_salao + (ehClt && setorEfetivo === "salao" ? 1 : 0),
                                    clt_outros:
                                      resumo.clt_outros +
                                      (ehClt &&
                                      setorEfetivo !== "cozinha" &&
                                      setorEfetivo !== "balcao" &&
                                      setorEfetivo !== "salao"
                                        ? 1
                                        : 0),
                                    motoboys: resumo.motoboys + (!ehClt && setorEfetivo === "motoboy" ? 1 : 0),
                                    cozinha: resumo.cozinha + (!ehClt && setorEfetivo === "cozinha" ? 1 : 0),
                                    balcao: resumo.balcao + (!ehClt && setorEfetivo === "balcao" ? 1 : 0),
                                    salao: resumo.salao + (!ehClt && setorEfetivo === "salao" ? 1 : 0),
                                  };
                                })()
                              : resumo;
                          const textoResumo = textoResumoSetores(resumoPreview);
                          return (
                            <div
                              key={dia}
                              className={`flex min-h-[7.5rem] flex-col rounded-lg border p-1.5 transition-colors ${
                                ehDestino
                                  ? "border-primaria bg-primaria/10 ring-2 ring-primaria/30"
                                  : diaComEnviada
                                    ? "border-amber-400 bg-amber-50/60 ring-1 ring-amber-300/60"
                                    : diaComRascunho
                                      ? "border-stone-400 bg-stone-100/80 ring-1 ring-stone-300/70"
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
                                    const pessoaSlot = db.pessoas.find((p) => p.id === slot.pessoa_id);
                                    const ehClt = pessoaSlot?.tipo === "colaborador";
                                    const setor = setorDoPlantao(slot, pessoaSlot);
                                    const destaque = destaqueSlotFiltroConvocacao(
                                      filtroConvocacao,
                                      conv?.status,
                                      { filtroPessoa, pessoaId: slot.pessoa_id }
                                    );
                                    return (
                                      <button
                                        key={slot.id}
                                        type="button"
                                        draggable
                                        className={`cursor-grab truncate rounded px-1 py-0.5 text-left text-[11px] font-medium active:cursor-grabbing ${
                                          destaque === "destaque"
                                            ? filtroConvocacao === "rascunho"
                                              ? "bg-stone-300 text-stone-950 ring-1 ring-stone-500 hover:bg-stone-400/90"
                                              : filtroPessoa
                                                ? "bg-sky-200 text-sky-950 ring-1 ring-sky-600 hover:bg-sky-300/90"
                                                : "bg-amber-200 text-amber-950 ring-1 ring-amber-500 hover:bg-amber-300/90"
                                            : destaque === "atenuado"
                                              ? "bg-stone-100/70 text-slate-400 opacity-45 hover:opacity-70"
                                              : ehClt
                                                ? "bg-sky-100 text-sky-950 hover:bg-sky-200/80"
                                                : "bg-stone-100 text-slate-800 hover:bg-primaria/15"
                                        } ${arrasto?.tipo === "slot" && arrasto.id === slot.id ? "opacity-50" : ""}`}
                                        title={`${nomePessoa(slot.pessoa_id)} · ${
                                          ehClt
                                            ? `CLT${setor ? ` · ${rotuloSetorConvocacao(setor)}` : ""}`
                                            : setor
                                              ? rotuloSetorConvocacao(setor)
                                              : slot.funcao ?? "—"
                                        } · ${slot.hora_inicio}–${slot.hora_fim}${
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
                                        {ehClt && <span className="font-normal text-sky-800"> · CLT</span>}
                                        {setor && (
                                          <span className={`font-normal ${ehClt ? "text-sky-800" : "text-slate-500"}`}>
                                            {" "}
                                            · {abrevSetorConvocacao(setor)}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                              {(textoResumo || ehDestino) && (
                                <p
                                  className={`mt-1 border-t border-stone-200/80 pt-1 text-[10px] leading-tight ${
                                    ehDestino ? "font-semibold text-primaria-escura" : "text-slate-500"
                                  }`}
                                  title="CLT coz · CLT balc · CLT salão · moto · coz · bal · salão"
                                >
                                  {textoResumo || "—"}
                                </p>
                              )}
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
            Saldo do dia: CLT coz · CLT balc · CLT salão · moto · coz · bal · salão. Soltar CLT num dia gera
            automaticamente os dias alternados (12x36) a partir daí.
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
                    {gate.ok && gate.avisos.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-950">
                        <p className="font-semibold">Documento a vencer</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4">
                          {gate.avisos.map((msg) => (
                            <li key={msg}>{msg}</li>
                          ))}
                        </ul>
                        <Link href={`/rh/${p.id}?aba=documentos`} className="mt-2 inline-block text-primaria-escura underline">
                          Ver documentos no perfil
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
              Preenche os dias de trabalho do colaborador no calendário. O padrão mais comum no restaurante é{" "}
              <span className="font-semibold">12x36</span> (trabalha um dia, folga o seguinte). Dias que já têm plantão
              são pulados.
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
                onChange={(e) => {
                  const padrao = e.target.value as PadraoEscalaClt;
                  setFormPadrao({
                    ...formPadrao,
                    padrao,
                    ...(padrao === "12x36"
                      ? {
                          hora_inicio: HORARIO_PADRAO_CLT_12X36.hora_inicio,
                          hora_fim: HORARIO_PADRAO_CLT_12X36.hora_fim,
                          intervalo_min: String(HORARIO_PADRAO_CLT_12X36.intervalo_min),
                        }
                      : {}),
                  });
                }}
              >
                {PADROES_ESCALA_CLT.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.rotulo} — {p.descricao}
                  </option>
                ))}
              </select>
            </Campo>
            {formPadrao.padrao !== "seg_sex" && (
              <Campo
                rotulo={
                  formPadrao.padrao === "12x36"
                    ? "Primeiro dia de trabalho (ciclo dia sim / dia não)"
                    : "Início do ciclo (dia 1 de trabalho)"
                }
              >
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
                Gerar no calendário
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
                  {linkWaDetalhe && (
                    <button
                      type="button"
                      className="btn-primario"
                      onClick={() => abrirWhatsAppConvocacao(detalheConv.id)}
                    >
                      Abrir WhatsApp
                    </button>
                  )}
                  <button
                    type="button"
                    className={linkWaDetalhe ? "btn-secundario" : "btn-primario"}
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

            {detalhePagamento && (
              <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-blue-950">Pagamento</p>
                  <Badge cor="azul">{rotuloStatusPagamentoPessoa(detalhePagamento.status)}</Badge>
                </div>
                <p className="text-sm text-blue-950">
                  {moeda(detalhePagamento.pagamento_valor ?? detalhePagamento.valor)}
                  {detalhePagamento.horas != null ? ` · ${detalhePagamento.horas} h` : ""}
                  {detalhePagamento.pagamento_banco_conta
                    ? ` · saiu de ${detalhePagamento.pagamento_banco_conta}`
                    : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/rh/pagamentos" className="btn-secundario">
                    Abrir pagamentos
                  </Link>
                  {(detalhePagamento.status === "aguardando_conciliacao" ||
                    detalhePagamento.status === "pago") &&
                    detalheConv && (
                      <>
                        <button
                          type="button"
                          className="btn-secundario"
                          onClick={() => void copiarReciboDoPagamento(detalheConv.id, "recibo")}
                        >
                          <Copy size={16} /> Copiar recibo
                        </button>
                        <button
                          type="button"
                          className="btn-secundario"
                          onClick={() => void copiarReciboDoPagamento(detalheConv.id, "confirmacao")}
                        >
                          <Copy size={16} /> Confirmação
                        </button>
                      </>
                    )}
                </div>
              </div>
            )}

            {erro && <p className="text-sm font-medium text-destaque">{erro}</p>}

            <div className="flex justify-end border-t border-stone-200 pt-3">
              <button
                type="button"
                className="btn-secundario text-destaque"
                onClick={() => excluirPlantao(detalheSlot.id)}
              >
                Excluir plantão
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function RhEscalaPage() {
  return (
    <Suspense
      fallback={
        <div>
          <TituloPagina titulo="Escala" subtitulo="Carregando…" />
          <p className="text-sm text-slate-500">Carregando escala…</p>
        </div>
      }
    >
      <RhEscalaConteudo />
    </Suspense>
  );
}
