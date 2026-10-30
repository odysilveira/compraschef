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
import { exportarCopiaNavegador, importarCopiaNavegador, resumoCopia } from "@/lib/domain/copia-navegador";

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
  const [copiando, setCopiando] = useState(false);

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

  async function baixarCopia() {
    setCopiando(true);
    setMsgBackup(null);
    try {
      const copia = await exportarCopiaNavegador();
      const arquivo = new Blob([JSON.stringify(copia)], { type: "application/json" });
      const url = URL.createObjectURL(arquivo);
      const link = document.createElement("a");
      link.href = url;
      link.download = `compraschef-copia-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMsgBackup(`Cópia baixada: ${resumoCopia(copia)} No outro computador, use Juntar cópia.`);
    } catch (e) {
      setMsgBackup(e instanceof Error ? e.message : "Falha ao baixar a cópia.");
    } finally {
      setCopiando(false);
    }
  }

  async function restaurarCopia(arquivo: File | undefined) {
    if (!arquivo) return;
    if (
      !window.confirm(
        "Juntar esta cópia com o que já está neste navegador? Nada que só existe aqui será apagado."
      )
    ) {
      return;
    }
    setCopiando(true);
    setMsgBackup(null);
    try {
      const resumo = await importarCopiaNavegador(await arquivo.text());
      setMsgBackup(`Cópia restaurada: ${resumo} Recarregando…`);
      window.location.reload();
    } catch (e) {
      setMsgBackup(e instanceof Error ? e.message : "Falha ao restaurar a cópia.");
      setCopiando(false);
    }
  }

  return (
    <div>
      <TituloPagina
        titulo="Cadastros"
        subtitulo="Fornecedores, produtos, unidades, locais, caixas, equipamentos e contas DRE"
      />

      <div className="mb-4 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p>
          Notas e produtos ficam no navegador de cada computador. Quando baixar coisa nova no
          outro, baixe a cópia lá e use <strong>Juntar cópia</strong> aqui. O que só existe num
          lado entra. A mesma nota não duplica. O que os dois mudaram fica com a versão mais
          recente; se não houver data, fica o valor deste computador e os campos vazios são
          preenchidos.
        </p>
        {pareceDemo ? (
          <p className="mt-2">
            Este endereço ainda está na base de demonstração. Junte a cópia do outro computador
            para ver as notas e os produtos de verdade.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="btn-secundario" disabled={copiando} onClick={() => void baixarCopia()}>
            {copiando ? "Preparando…" : "Baixar cópia"}
          </button>
          <label className={`btn-primario ${copiando ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
            Juntar cópia
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              disabled={copiando}
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                e.target.value = "";
                void restaurarCopia(arquivo);
              }}
            />
          </label>
          {temBackup ? (
            <button type="button" className="btn-secundario" onClick={restaurarBackup}>
              Restaurar backup automático
            </button>
          ) : null}
        </div>
        {msgBackup ? <p className="mt-2 text-xs">{msgBackup}</p> : null}
      </div>

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
