"use client";

// Escala da equipe (motoboys e freelancers/CLT) — calendário de 2 meses.
// Arrastar um nome pro turno do dia, ou tocar no nome e depois no turno — os dois
// jeitos funcionam com Pointer Events (mouse e toque), sem depender de drag-and-drop
// nativo do HTML5 (que não funciona bem em celular).

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Link2, Search, X } from "lucide-react";
import { getDB, mutate, uid, useDB } from "@/lib/data";
import { copiarLinkVaga, hojeISO } from "@/lib/rh";
import type { Colaborador, Turno } from "@/lib/types";

const VAGA_ID = "__vaga__";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

interface Selecionado {
  colaboradorId: string;
  nome: string;
}

function nomeExibicao(c: Colaborador): string {
  return c.nome_social || c.nome;
}

function corCategoria(c: Colaborador): string {
  if (c.categoria === "motoboy") return "bg-amber-100 text-amber-700";
  if (c.clt) return "bg-orange-100 text-orange-700";
  return "bg-emerald-100 text-emerald-700";
}

const COR_TURNO_CHIP: Record<Turno, string> = {
  almoco: "bg-amber-500 text-white",
  jantar: "bg-blue-500 text-white",
};

const COR_TURNO_SLOT: Record<Turno, string> = {
  almoco: "bg-amber-50",
  jantar: "bg-blue-50",
};

/** Atribui um colaborador (ou a vaga em aberto) a um turno de um dia — mesma regra do PixMoto original. */
function atribuir(colaboradorId: string, nome: string, data: string, turno: Turno) {
  const atual = getDB();
  const doSlot = atual.escala_atribuicoes.filter((x) => x.data === data && x.turno === turno);

  if (colaboradorId === VAGA_ID) {
    if (doSlot.some((x) => !x.vaga_aberta)) {
      window.alert("Esse turno já tem alguém escalado.");
      return;
    }
    if (doSlot.some((x) => x.vaga_aberta)) {
      window.alert("Essa vaga já está marcada.");
      return;
    }
    mutate((banco) => {
      banco.escala_atribuicoes.push({
        id: uid("esc"),
        data,
        turno,
        vaga_aberta: true,
        token_vaga: uid("vaga"),
        criado_em: new Date().toISOString(),
      });
    });
    return;
  }

  if (doSlot.some((x) => x.colaborador_id === colaboradorId)) {
    window.alert(`${nome} já está escalado(a) nesse ${turno === "jantar" ? "jantar" : "almoço"}.`);
    return;
  }
  mutate((banco) => {
    banco.escala_atribuicoes.push({
      id: uid("esc"),
      data,
      turno,
      colaborador_id: colaboradorId,
      nome,
      vaga_aberta: false,
      criado_em: new Date().toISOString(),
    });
    const vaga = doSlot.find((x) => x.vaga_aberta);
    if (vaga) banco.escala_atribuicoes = banco.escala_atribuicoes.filter((x) => x.id !== vaga.id);
  });
}

function removerAtribuicao(id: string) {
  mutate((banco) => {
    banco.escala_atribuicoes = banco.escala_atribuicoes.filter((x) => x.id !== id);
  });
}

export function EscalaCalendario() {
  const db = useDB();
  const [mesRef, setMesRef] = useState(() => {
    const hoje = new Date();
    return { ano: hoje.getFullYear(), mes: hoje.getMonth() };
  });
  const [selecionado, setSelecionado] = useState<Selecionado | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const ativos = useMemo(
    () => db.colaboradores.filter((c) => c.ativo).sort((a, b) => nomeExibicao(a).localeCompare(nomeExibicao(b), "pt-BR")),
    [db.colaboradores]
  );

  function mesAnterior() {
    setMesRef((atual) => (atual.mes === 0 ? { ano: atual.ano - 1, mes: 11 } : { ano: atual.ano, mes: atual.mes - 1 }));
  }
  function mesSeguinte() {
    setMesRef((atual) => (atual.mes === 11 ? { ano: atual.ano + 1, mes: 0 } : { ano: atual.ano, mes: atual.mes + 1 }));
  }

  function alternarSelecao(colaboradorId: string, nome: string) {
    setSelecionado((atual) => (atual && atual.colaboradorId === colaboradorId ? null : { colaboradorId, nome }));
  }

  function clicarSlot(data: string, turno: Turno) {
    if (!selecionado) return;
    atribuir(selecionado.colaboradorId, selecionado.nome, data, turno);
    setSelecionado(null);
  }

  // Pointer Events (mouse E toque) pra arrastar um nome até o turno do dia — sem usar
  // drag-and-drop nativo do HTML5, que é pouco confiável em celular.
  useEffect(() => {
    let pendingChip: { colaboradorId: string; nome: string; chipEl: HTMLElement; startX: number; startY: number; moved: boolean } | null = null;
    let activeDrag: { chipEl: HTMLElement; ghostEl: HTMLDivElement } | null = null;

    function moveDrag(clientX: number, clientY: number) {
      if (!activeDrag) return;
      activeDrag.ghostEl.style.left = `${clientX}px`;
      activeDrag.ghostEl.style.top = `${clientY}px`;
      document.querySelectorAll("[data-drop-hover]").forEach((el) => el.removeAttribute("data-drop-hover"));
      const under = document.elementFromPoint(clientX, clientY);
      const slotEl = under && (under as HTMLElement).closest("[data-cal-slot]");
      if (slotEl) slotEl.setAttribute("data-drop-hover", "true");
    }

    function startDrag(p: NonNullable<typeof pendingChip>) {
      const ghost = document.createElement("div");
      ghost.textContent = p.nome;
      ghost.style.cssText =
        "position:fixed;z-index:200;pointer-events:none;background:#F59E0B;color:#fff;padding:8px 14px;border-radius:10px;font-size:13px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.25);transform:translate(-50%,-50%);white-space:nowrap;";
      document.body.appendChild(ghost);
      p.chipEl.classList.add("opacity-30");
      activeDrag = { chipEl: p.chipEl, ghostEl: ghost };
      moveDrag(p.startX, p.startY);
    }

    function cleanup() {
      if (!activeDrag) return;
      activeDrag.ghostEl.remove();
      activeDrag.chipEl.classList.remove("opacity-30");
      document.querySelectorAll("[data-drop-hover]").forEach((el) => el.removeAttribute("data-drop-hover"));
      activeDrag = null;
    }

    function endDrag(clientX: number, clientY: number, colaboradorId: string, nome: string) {
      const under = document.elementFromPoint(clientX, clientY);
      const slotEl = under && (under as HTMLElement).closest("[data-cal-slot]");
      if (slotEl) {
        const [data, turno] = (slotEl as HTMLElement).dataset.calSlot!.split("|") as [string, Turno];
        atribuir(colaboradorId, nome, data, turno);
      }
      cleanup();
    }

    function onPointerDown(e: PointerEvent) {
      const chip = (e.target as HTMLElement).closest<HTMLElement>("[data-drag-chip]");
      if (!chip || !containerRef.current?.contains(chip)) return;
      e.preventDefault();
      pendingChip = {
        colaboradorId: chip.dataset.dragChip!,
        nome: chip.dataset.dragNome || "",
        chipEl: chip,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
    }
    function onPointerMove(e: PointerEvent) {
      if (!pendingChip) return;
      if (!pendingChip.moved) {
        const dist = Math.hypot(e.clientX - pendingChip.startX, e.clientY - pendingChip.startY);
        if (dist > 8) {
          pendingChip.moved = true;
          startDrag(pendingChip);
        }
      }
      if (pendingChip.moved) moveDrag(e.clientX, e.clientY);
    }
    function onPointerUp(e: PointerEvent) {
      if (!pendingChip) return;
      if (pendingChip.moved) {
        endDrag(e.clientX, e.clientY, pendingChip.colaboradorId, pendingChip.nome);
      } else {
        alternarSelecao(pendingChip.colaboradorId, pendingChip.nome);
      }
      pendingChip = null;
    }
    function onPointerCancel() {
      if (pendingChip?.moved) cleanup();
      pendingChip = null;
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function renderMes(ano: number, mes: number) {
    const primeiro = new Date(ano, mes, 1);
    const deslocamento = (primeiro.getDay() + 6) % 7; // semana começa na segunda
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const hojeStr = hojeISO();

    const celulas: ReactNode[] = [];
    for (let i = 0; i < deslocamento; i++) {
      celulas.push(<div key={`vazio-${i}`} className="invisible" />);
    }
    for (let d = 1; d <= diasNoMes; d++) {
      const dataStr = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const isHoje = dataStr === hojeStr;
      const atribuicoes = db.escala_atribuicoes.filter((x) => x.data === dataStr);
      const porTurno = (turno: Turno) => atribuicoes.filter((x) => x.turno === turno);

      celulas.push(
        <div
          key={dataStr}
          className={`flex min-h-[76px] flex-col gap-1 rounded-lg border bg-superficie p-1 ${isHoje ? "border-2 border-primaria" : "border-stone-200"}`}
        >
          <p className="px-0.5 font-mono text-[10px] font-bold text-stone-400">{d}</p>
          {(["almoco", "jantar"] as Turno[]).map((turno) => (
            <div
              key={turno}
              data-cal-slot={`${dataStr}|${turno}`}
              onClick={() => clicarSlot(dataStr, turno)}
              className={`flex min-h-[18px] flex-1 cursor-pointer flex-col gap-0.5 rounded p-0.5 ${COR_TURNO_SLOT[turno]} [&[data-drop-hover]]:outline [&[data-drop-hover]]:outline-2 [&[data-drop-hover]]:-outline-offset-2 [&[data-drop-hover]]:outline-texto`}
            >
              {porTurno(turno).map((a) => (
                <div
                  key={a.id}
                  title={a.vaga_aberta ? "Vaga em aberto" : a.nome}
                  className={`flex items-center justify-between gap-1 rounded px-1 py-0.5 text-[9px] font-bold leading-tight ${
                    a.vaga_aberta ? "border border-dashed border-erro bg-erro-clara text-erro" : COR_TURNO_CHIP[turno]
                  }`}
                >
                  <span className="truncate">{a.vaga_aberta ? "🔍 Vaga" : (a.nome || "").split(" ")[0]}</span>
                  <span className="flex shrink-0 items-center gap-0.5">
                    {a.vaga_aberta && a.token_vaga && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          copiarLinkVaga(a.token_vaga!);
                        }}
                        className="leading-none"
                        aria-label="Copiar link da vaga"
                        title="Copiar link pra compartilhar"
                      >
                        <Link2 size={10} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removerAtribuicao(a.id);
                      }}
                      className="leading-none"
                      aria-label="Remover"
                    >
                      <X size={10} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div key={`${ano}-${mes}`}>
        <p className="mb-1.5 mt-3 text-sm font-bold first:mt-0">
          {MESES[mes]} de {ano}
        </p>
        <div className="grid grid-cols-7 gap-1">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="rotulo pb-1 text-center">
              {d}
            </div>
          ))}
          {celulas}
        </div>
      </div>
    );
  }

  const proxMes = mesRef.mes === 11 ? 0 : mesRef.mes + 1;
  const proxAno = mesRef.mes === 11 ? mesRef.ano + 1 : mesRef.ano;

  return (
    <div ref={containerRef}>
      <div className="nav-row mb-4 flex items-center justify-between gap-3">
        <button type="button" className="btn-secundario" onClick={mesAnterior}>
          <ChevronLeft size={16} /> Anterior
        </button>
        <span className="text-sm font-semibold">
          {MESES[mesRef.mes]} de {mesRef.ano}
        </span>
        <button type="button" className="btn-secundario" onClick={mesSeguinte}>
          Próximo <ChevronRight size={16} />
        </button>
      </div>

      <p className="mb-3 rounded-card bg-stone-100 p-2.5 text-xs text-stone-600">
        {selecionado
          ? `Toque no almoço ou jantar do dia em que ${selecionado.nome} vai trabalhar (toque no nome de novo pra cancelar).`
          : "Arraste um nome (ou a “Vaga em aberto”) pro almoço ou jantar do dia, ou toque no nome e depois no quadradinho — funciona dos dois jeitos."}
      </p>

      <p className="mb-3 rounded-card bg-destaque-clara p-2.5 text-xs text-destaque">
        Marque uma “Vaga em aberto” e use o ícone de link 🔗 no quadradinho pra copiar um link e mandar por WhatsApp.
        Por enquanto esse link só confirma a vaga se for aberto neste mesmo navegador (o app ainda não está
        conectado a um banco de dados compartilhado) — funciona pra valer assim que o Supabase for configurado.
      </p>

      <div className="mb-4 flex items-center gap-4 text-xs font-semibold text-stone-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-amber-500" /> Almoço
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-blue-500" /> Jantar
        </span>
      </div>

      <div className="mb-5 flex flex-wrap gap-2 rounded-card border border-stone-200 bg-superficie p-3 shadow-card">
        <div
          data-drag-chip={VAGA_ID}
          data-drag-nome="Vaga em aberto"
          className={`flex cursor-grab select-none items-center gap-1.5 whitespace-nowrap rounded-lg border border-dashed border-erro bg-erro-clara px-3 py-2 text-sm font-semibold text-erro [touch-action:none] ${
            selecionado?.colaboradorId === VAGA_ID ? "ring-2 ring-texto ring-offset-2" : ""
          }`}
        >
          <Search size={14} /> Vaga em aberto
        </div>
        {ativos.length === 0 ? (
          <span className="text-sm text-stone-500">Nenhuma pessoa ativa cadastrada.</span>
        ) : (
          ativos.map((c) => (
            <div
              key={c.id}
              data-drag-chip={c.id}
              data-drag-nome={nomeExibicao(c)}
              className={`cursor-grab select-none whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold [touch-action:none] ${corCategoria(c)} ${
                selecionado?.colaboradorId === c.id ? "ring-2 ring-texto ring-offset-2" : ""
              }`}
            >
              {nomeExibicao(c)}
            </div>
          ))
        )}
      </div>

      <div>
        {renderMes(mesRef.ano, mesRef.mes)}
        {renderMes(proxAno, proxMes)}
      </div>
    </div>
  );
}
