"use client";

// RH — Relatórios de pagamentos: período, pessoa e categoria.

import { TituloPagina } from "@/components/ui";
import { RelatorioPagamentos } from "@/components/rh/RelatorioPagamentos";

export default function RHRelatoriosPage() {
  return (
    <div>
      <TituloPagina titulo="Relatórios de RH" subtitulo="Pagamentos por período, pessoa e categoria" />
      <RelatorioPagamentos />
    </div>
  );
}
