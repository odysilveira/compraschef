"use client";

// Cadastros — requisitos 1 a 6: fornecedores, produtos, unidades, locais e caixas.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TituloPagina } from "@/components/ui";
import { AbaCategorias } from "@/components/cadastros/AbaCategorias";
import { AbaFornecedores } from "@/components/cadastros/AbaFornecedores";
import { AbaProdutos } from "@/components/cadastros/AbaProdutos";
import { AbaUnidades } from "@/components/cadastros/AbaUnidades";
import { AbaLocais } from "@/components/cadastros/AbaLocais";
import { AbaCaixas } from "@/components/cadastros/AbaCaixas";
import { AbaEquipamentos } from "@/components/cadastros/AbaEquipamentos";
import { AbaContasDre } from "@/components/cadastros/AbaContasDre";
import { recuperarBackupDB, temBackupDB, useDB } from "@/lib/data";

type Aba =
  | "fornecedores"
  | "categorias"
  | "produtos"
  | "unidades"
  | "locais"
  | "caixas"
  | "equipamentos"
  | "contas-dre";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "fornecedores", rotulo: "Fornecedores" },
  { id: "categorias", rotulo: "Categorias" },
  { id: "produtos", rotulo: "Produtos" },
  { id: "unidades", rotulo: "Unidades" },
  { id: "locais", rotulo: "Locais" },
  { id: "caixas", rotulo: "Caixas" },
  { id: "equipamentos", rotulo: "Equipamentos" },
  { id: "contas-dre", rotulo: "Contas DRE" },
];

function CadastrosConteudo() {
  const db = useDB();
  const searchParams = useSearchParams();
  const abaParam = searchParams.get("aba");
  const produtoParaAbrirId = searchParams.get("produtoId") ?? undefined;
  const [aba, setAba] = useState<Aba>(
    ABAS.some((item) => item.id === (abaParam as Aba)) ? (abaParam as Aba) : "fornecedores"
  );
  const [temBackup, setTemBackup] = useState(false);
  const [msgBackup, setMsgBackup] = useState<string | null>(null);

  useEffect(() => {
    if (abaParam && ABAS.some((item) => item.id === (abaParam as Aba))) {
      setAba(abaParam as Aba);
    }
  }, [abaParam]);

  useEffect(() => {
    setTemBackup(temBackupDB());
  }, [db]);

  const pareceDemo =
    (db.fornecedores?.length ?? 0) <= 8 &&
    !(db.produtos ?? []).some(
      (p) => p.ativo !== false && /\p{L}/u.test(p.nome) && !/\p{Ll}/u.test(p.nome)
    );

  function restaurarBackup() {
    if (!window.confirm("Restaurar o backup automático deste navegador? O estado atual será substituído.")) {
      return;
    }
    const r = recuperarBackupDB();
    setMsgBackup(r.mensagem);
    setTemBackup(temBackupDB());
  }

  return (
    <div>
      <TituloPagina
        titulo="Cadastros"
        subtitulo="Fornecedores, produtos, unidades, locais, caixas, equipamentos e contas DRE"
      />

      {pareceDemo || temBackup ? (
        <div className="mb-4 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {pareceDemo ? (
            <p className="mb-2">
              Este navegador está com a base de <strong>demonstração</strong> (poucos fornecedores e
              sem produtos em CAIXA ALTA da NF). Se você cadastrou notas noutro Chrome/Edge, abra
              o mesmo navegador de antes em{" "}
              <span className="font-mono">localhost:3000</span>.
            </p>
          ) : null}
          {temBackup ? (
            <button type="button" className="btn-secundario" onClick={restaurarBackup}>
              Restaurar backup automático
            </button>
          ) : null}
          {msgBackup ? <p className="mt-2 text-xs">{msgBackup}</p> : null}
        </div>
      ) : null}

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
      {aba === "equipamentos" && <AbaEquipamentos />}
      {aba === "contas-dre" && <AbaContasDre />}
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
            subtitulo="Fornecedores, produtos, unidades, locais e caixas — a base de tudo"
          />
          <p className="text-sm text-slate-500">Carregando…</p>
        </div>
      }
    >
      <CadastrosConteudo />
    </Suspense>
  );
}
