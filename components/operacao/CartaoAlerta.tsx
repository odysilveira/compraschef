"use client";

// Cartão de alerta clicável do Painel: número grande + ícone + cor.

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type Cor = "verde" | "laranja" | "vermelho" | "azul";

const ESTILOS: Record<Cor, { fundo: string; texto: string; icone: string }> = {
  verde: { fundo: "bg-sucesso-clara", texto: "text-primaria-escura", icone: "text-primaria" },
  laranja: { fundo: "bg-destaque-clara", texto: "text-destaque", icone: "text-destaque" },
  vermelho: { fundo: "bg-erro-clara", texto: "text-erro", icone: "text-erro" },
  azul: { fundo: "bg-blue-100", texto: "text-blue-700", icone: "text-blue-600" },
};

interface Props {
  href: string;
  titulo: string;
  /** Linha auxiliar sob o título (ex.: último extrato). */
  subtitulo?: string;
  numero: number;
  icone: LucideIcon;
  cor: Cor;
}

export default function CartaoAlerta({ href, titulo, subtitulo, numero, icone: Icone, cor }: Props) {
  const zerado = numero === 0;
  const estilo = ESTILOS[cor];
  return (
    <Link
      href={href}
      className={`card flex items-center gap-4 transition-transform hover:-translate-y-0.5 ${
        zerado ? "opacity-60" : ""
      }`}
    >
      <span
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-card ${
          zerado ? "bg-slate-100" : estilo.fundo
        }`}
      >
        <Icone size={28} className={zerado ? "text-slate-400" : estilo.icone} />
      </span>
      <span className="min-w-0">
        <span className={`block text-3xl font-bold leading-none ${zerado ? "text-slate-400" : estilo.texto}`}>
          {numero}
        </span>
        <span className="mt-1 block text-sm font-medium text-slate-600">{titulo}</span>
        {subtitulo && (
          <span className="mt-0.5 block text-xs text-slate-500">{subtitulo}</span>
        )}
      </span>
    </Link>
  );
}
