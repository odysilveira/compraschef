"use client";

// Cadastros — requisitos 1 a 6: fornecedores, produtos, unidades, locais e caixas.
// + contas bancárias do restaurante (origem dos pagamentos).

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TituloPagina } from "@/components/ui";
import { AbaCategorias } from "@/components/cadastros/AbaCategorias";
import { AbaContasBancarias } from "@/components/cadastros/AbaContasBancarias";
import { AbaFornecedores } from "@/components/cadastros/AbaFornecedores";
import { AbaProdutos } from "@/components/cadastros/AbaProdutos";
import { AbaUnidades } from "@/components/cadastros/AbaUnidades";
import { AbaLocais } from "@/components/cadastros/AbaLocais";
import { AbaCaixas } from "@/components/cadastros/AbaCaixas";

type Aba = "fornecedores" | "categorias" | "produtos" | "unidades" | "locais" | "caixas" | "contas";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "fornecedores", rotulo: "Fornecedores" },
  { id: "categorias", rotulo: "Categorias" },
  { id: "produtos", rotulo: "Produtos" },
  { id: "unidades", rotulo: "Unidades" },
  { id: "locais", rotulo: "Locais" },
  { id: "caixas", rotulo: "Caixas" },
  { id: "contas", rotulo: "Contas bancárias" },
];

function CadastrosConteudo() {
  const searchParams = useSearchParams();
  const abaParam = searchParams.get("aba");
  const produtoParaAbrirId = searchParams.get("produtoId") ?? undefined;
  const [aba, setAba] = useState<Aba>(
    ABAS.some((item) => item.id === (abaParam as Aba)) ? (abaParam as Aba) : "fornecedores"
  );

  useEffect(() => {
    if (abaParam && ABAS.some((item) => item.id === (abaParam as Aba))) {
      setAba(abaParam as Aba);
    }
  }, [abaParam]);

  return (
    <div>
      <TituloPagina
        titulo="Cadastros"
        subtitulo="Fornecedores, produtos, unidades, locais, caixas e contas bancárias"
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
      {aba === "categorias" && <AbaCategorias />}
      {aba === "produtos" && <AbaProdutos produtoParaAbrirId={produtoParaAbrirId} />}
      {aba === "unidades" && <AbaUnidades />}
      {aba === "locais" && <AbaLocais />}
      {aba === "caixas" && <AbaCaixas />}
      {aba === "contas" && <AbaContasBancarias />}
    </div>
  );
}

export default function CadastrosPage() {
  return (
    <Suspense
      fallback={
        <div>
          <TituloPagina
            titulo="Cadastros"
            subtitulo="Fornecedores, produtos, unidades, locais, caixas e contas bancárias"
          />
          <p className="text-sm text-slate-500">Carregando…</p>
        </div>
      }
    >
      <CadastrosConteudo />
    </Suspense>
  );
}
