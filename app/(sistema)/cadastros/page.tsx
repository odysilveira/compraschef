"use client";

// Cadastros — requisitos 1 a 6: fornecedores, produtos, unidades, locais e caixas.

import { useState } from "react";
import { TituloPagina } from "@/components/ui";
import { AbaFornecedores } from "@/components/cadastros/AbaFornecedores";
import { AbaProdutos } from "@/components/cadastros/AbaProdutos";
import { AbaUnidades } from "@/components/cadastros/AbaUnidades";
import { AbaLocais } from "@/components/cadastros/AbaLocais";
import { AbaCaixas } from "@/components/cadastros/AbaCaixas";

type Aba = "fornecedores" | "produtos" | "unidades" | "locais" | "caixas";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "fornecedores", rotulo: "Fornecedores" },
  { id: "produtos", rotulo: "Produtos" },
  { id: "unidades", rotulo: "Unidades" },
  { id: "locais", rotulo: "Locais" },
  { id: "caixas", rotulo: "Caixas" },
];

export default function CadastrosPage() {
  const [aba, setAba] = useState<Aba>("fornecedores");

  return (
    <div>
      <TituloPagina
        titulo="Cadastros"
        subtitulo="Fornecedores, produtos, unidades, locais e caixas — a base de tudo"
      />

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

      {aba === "fornecedores" && <AbaFornecedores />}
      {aba === "produtos" && <AbaProdutos />}
      {aba === "unidades" && <AbaUnidades />}
      {aba === "locais" && <AbaLocais />}
      {aba === "caixas" && <AbaCaixas />}
    </div>
  );
}
