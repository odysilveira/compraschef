"use client";

// RH — Escala: calendário de turnos (almoço/jantar) da equipe.

import { TituloPagina } from "@/components/ui";
import { EscalaCalendario } from "@/components/rh/EscalaCalendario";

export default function RHEscalaPage() {
  return (
    <div>
      <TituloPagina titulo="Escala" subtitulo="Calendário de turnos da equipe" />
      <EscalaCalendario />
    </div>
  );
}
