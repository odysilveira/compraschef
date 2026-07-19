"use client";

// Kit de componentes básicos do ComprasChef — usar em todas as telas
// para manter o visual consistente com o design system do Stitch.

import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function TituloPagina({
  titulo,
  subtitulo,
  acao,
}: {
  titulo: string;
  subtitulo?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1>{titulo}</h1>
        {subtitulo && <p className="mt-0.5 text-sm text-stone-500">{subtitulo}</p>}
      </div>
      {acao}
    </div>
  );
}

type CorStat = "verde" | "laranja" | "vermelho" | "cinza" | "amarelo";

const BORDA_STAT: Record<CorStat, string> = {
  verde: "border-l-emerald-500",
  laranja: "border-l-amber-500",
  vermelho: "border-l-red-500",
  cinza: "border-l-stone-300",
  amarelo: "border-l-yellow-400",
};

/** Cartão de resumo no topo das telas (estilo do ERP parceiro): rótulo, número grande e subtexto. */
export function StatCard({
  rotulo,
  valor,
  subtexto,
  cor = "cinza",
}: {
  rotulo: string;
  valor: ReactNode;
  subtexto?: string;
  cor?: CorStat;
}) {
  return (
    <div className={`card border-l-4 py-3 ${BORDA_STAT[cor]}`}>
      <p className="rotulo">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold leading-none">{valor}</p>
      {subtexto && <p className="mt-1 text-xs text-stone-500">{subtexto}</p>}
    </div>
  );
}

type CorBadge = "verde" | "laranja" | "vermelho" | "cinza" | "azul";

const CORES_BADGE: Record<CorBadge, string> = {
  verde: "bg-sucesso-clara text-primaria-escura",
  laranja: "bg-destaque-clara text-destaque",
  vermelho: "bg-erro-clara text-erro",
  cinza: "bg-slate-100 text-slate-600",
  azul: "bg-blue-100 text-blue-700",
};

export function Badge({ cor = "cinza", children }: { cor?: CorBadge; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${CORES_BADGE[cor]}`}>
      {children}
    </span>
  );
}

export function Campo({
  rotulo,
  children,
}: {
  rotulo: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="rotulo mb-1 block">{rotulo}</span>
      {children}
    </label>
  );
}

export function Vazio({ mensagem }: { mensagem: string }) {
  return (
    <div className="card py-10 text-center text-sm text-slate-500">{mensagem}</div>
  );
}

export function Modal({
  aberto,
  titulo,
  onFechar,
  children,
}: {
  aberto: boolean;
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
}) {
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onFechar}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-card bg-superficie p-5 shadow-xl sm:rounded-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2>{titulo}</h2>
          <button onClick={onFechar} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-texto" aria-label="Fechar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Tabela({ cabecalho, children }: { cabecalho: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            {cabecalho.map((c) => (
              <th key={c} className="rotulo whitespace-nowrap px-3 py-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}
