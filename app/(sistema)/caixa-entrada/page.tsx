"use client";

import { TituloPagina } from "@/components/ui";
import CaixaEntrada from "@/components/operacao/CaixaEntrada";

export default function CaixaEntradaPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <TituloPagina titulo="Caixa de entrada" />
      <CaixaEntrada />
    </div>
  );
}
