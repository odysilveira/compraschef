"use client";

// RH — Pagamentos: motoboys (lote semanal) e freelancers/CLT (por instância).

import { useState } from "react";
import { TituloPagina } from "@/components/ui";
import { AbaPagamentosMotoboy } from "@/components/rh/AbaPagamentosMotoboy";
import { AbaPagamentosFreelancer } from "@/components/rh/AbaPagamentosFreelancer";

type Aba = "motoboys" | "freelancers";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "motoboys", rotulo: "Motoboys" },
  { id: "freelancers", rotulo: "Freelancers / CLT" },
];

export default function RHPagamentosPage() {
  const [aba, setAba] = useState<Aba>("motoboys");

  return (
    <div>
      <TituloPagina titulo="Pagamentos" subtitulo="Motoboys, freelancers e colaboradores CLT" />

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

      {aba === "motoboys" && <AbaPagamentosMotoboy />}
      {aba === "freelancers" && <AbaPagamentosFreelancer />}
    </div>
  );
}
