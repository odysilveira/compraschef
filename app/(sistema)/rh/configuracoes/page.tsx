"use client";

// RH — Configurações: bancos usados pra pagar e pessoas com acesso ao sistema.

import { useState } from "react";
import { TituloPagina } from "@/components/ui";
import { AbaBancos } from "@/components/rh/AbaBancos";
import { AbaPessoasAcesso } from "@/components/rh/AbaPessoasAcesso";

type Aba = "bancos" | "pessoas";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "bancos", rotulo: "Bancos" },
  { id: "pessoas", rotulo: "Pessoas com acesso" },
];

export default function RHConfiguracoesPage() {
  const [aba, setAba] = useState<Aba>("bancos");

  return (
    <div>
      <TituloPagina titulo="Configurações de RH" subtitulo="Bancos e pessoas com acesso" />

      <div className="mb-5 flex gap-1 overflow-x-auto rounded-card bg-stone-100 p-1">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`whitespace-nowrap rounded-card px-4 py-2 text-sm font-semibold transition-colors ${
              aba === a.id ? "bg-superficie text-primaria-escura shadow-card" : "text-stone-600 hover:bg-white"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === "bancos" && <AbaBancos />}
      {aba === "pessoas" && <AbaPessoasAcesso />}
    </div>
  );
}
