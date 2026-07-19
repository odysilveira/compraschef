"use client";

// Peças compartilhadas entre as abas de Cadastros.

import { Search } from "lucide-react";

/** Campo de busca com ícone, usado no topo de cada aba. */
export function BarraBusca({
  valor,
  onMudar,
  placeholder = "Buscar…",
}: {
  valor: string;
  onMudar: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative mb-4 w-full max-w-sm">
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        type="search"
        className="campo pl-9"
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

/** Busca simples, sem diferenciar maiúsculas/minúsculas. */
export function contem(busca: string, ...textos: (string | number | undefined)[]): boolean {
  const alvo = busca.trim().toLowerCase();
  if (!alvo) return true;
  return textos.some((t) => String(t ?? "").toLowerCase().includes(alvo));
}

/** Converte texto de input numérico em número (ou undefined se vazio/inválido). */
export function numOpcional(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v.replace(",", "."));
  return Number.isNaN(n) ? undefined : n;
}

/** Rodapé padrão dos formulários: excluir à esquerda, salvar à direita. */
export function RodapeFormulario({
  onExcluir,
  rotuloExcluir = "Excluir",
}: {
  onExcluir?: () => void;
  rotuloExcluir?: string;
}) {
  return (
    <div className="mt-5 flex items-center justify-between gap-3">
      {onExcluir ? (
        <button type="button" className="btn-perigo" onClick={onExcluir}>
          {rotuloExcluir}
        </button>
      ) : (
        <span />
      )}
      <button type="submit" className="btn-primario">
        Salvar
      </button>
    </div>
  );
}
