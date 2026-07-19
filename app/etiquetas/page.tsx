"use client";

// Etiquetas de QR para as caixas físicas.
// Página fora da moldura do sistema para imprimir limpo (Ctrl+P / botão Imprimir).
// Fluxo: marcar o que imprimir → "Gerar caixas e etiquetas" → as caixas são criadas
// no sistema (status vazia) e a folha de etiquetas aparece pronta para imprimir.

import { useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Archive, ChefHat, Printer, Snowflake, Refrigerator } from "lucide-react";
import { mutate, uid, useDB } from "@/lib/data";
import { ITENS_ESTOQUE_SECO, MASSAS_GELADEIRA, SABORES_FREEZER } from "@/lib/data/catalogo";

type LocalEtiqueta = "Freezer" | "Geladeira" | "Estoque seco";

interface ItemCatalogo {
  nome: string;
  local: LocalEtiqueta;
  tamanho: "G" | "P" | "";
}

interface Secao {
  titulo: string;
  local: LocalEtiqueta;
  itens: ItemCatalogo[];
}

const SECOES: Secao[] = [
  {
    titulo: "Freezer — porção G",
    local: "Freezer",
    itens: SABORES_FREEZER.map((nome): ItemCatalogo => ({ nome, local: "Freezer", tamanho: "G" })),
  },
  {
    titulo: "Freezer — porção P",
    local: "Freezer",
    itens: SABORES_FREEZER.map((nome): ItemCatalogo => ({ nome, local: "Freezer", tamanho: "P" })),
  },
  {
    titulo: "Geladeira — porção G",
    local: "Geladeira",
    itens: MASSAS_GELADEIRA.map((nome): ItemCatalogo => ({ nome, local: "Geladeira", tamanho: "G" })),
  },
  {
    titulo: "Geladeira — porção P",
    local: "Geladeira",
    itens: MASSAS_GELADEIRA.map((nome): ItemCatalogo => ({ nome, local: "Geladeira", tamanho: "P" })),
  },
  {
    titulo: "Estoque seco",
    local: "Estoque seco",
    itens: ITENS_ESTOQUE_SECO.map((nome): ItemCatalogo => ({ nome, local: "Estoque seco", tamanho: "" })),
  },
];

const TODOS_ITENS: ItemCatalogo[] = SECOES.flatMap((s) => s.itens);

function IconeLocal({ local, size = 12 }: { local: LocalEtiqueta; size?: number }) {
  if (local === "Freezer") return <Snowflake size={size} className="text-blue-500" />;
  if (local === "Geladeira") return <Refrigerator size={size} className="text-emerald-600" />;
  return <Archive size={size} className="text-amber-600" />;
}

interface EtiquetaGerada extends ItemCatalogo {
  numero: number;
  qr: string;
}

export default function EtiquetasPage() {
  const db = useDB();
  const chave = (i: ItemCatalogo) => `${i.nome}|${i.tamanho}|${i.local}`;
  const [marcados, setMarcados] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(TODOS_ITENS.map((i) => [`${i.nome}|${i.tamanho}|${i.local}`, true]))
  );
  const [geradas, setGeradas] = useState<EtiquetaGerada[] | null>(null);

  const marcado = (i: ItemCatalogo) => marcados[chave(i)] ?? false;
  const total = useMemo(() => TODOS_ITENS.filter((i) => marcados[chave(i)]).length, [marcados]); // eslint-disable-line react-hooks/exhaustive-deps

  function alternarSecao(secao: Secao, valor: boolean) {
    setMarcados((atual) => {
      const novo = { ...atual };
      for (const item of secao.itens) novo[chave(item)] = valor;
      return novo;
    });
  }

  function gerar() {
    const selecionados = TODOS_ITENS.filter((i) => marcado(i));
    if (selecionados.length === 0) return;

    const maiorNumero = db.caixas.reduce((m, c) => Math.max(m, c.numero), 0);
    const novas: EtiquetaGerada[] = selecionados.map((item, indice) => {
      const numero = maiorNumero + 1 + indice;
      return { ...item, numero, qr: `CXCHEF-${String(numero).padStart(3, "0")}` };
    });

    mutate((banco) => {
      const agora = new Date().toISOString();
      for (const nova of novas) {
        banco.caixas.push({
          id: uid("cx"),
          numero: nova.numero,
          qr_code: nova.qr,
          status: "vazia",
          atualizado_em: agora,
        });
      }
    });

    setGeradas(novas);
  }

  // ---------- Folha de etiquetas ----------
  if (geradas) {
    return (
      <div className="min-h-screen bg-white text-texto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-4 print:hidden">
          <div>
            <h1 className="text-xl font-bold">
              {geradas.length} etiquetas prontas — caixas nº {geradas[0].numero} a {geradas[geradas.length - 1].numero}
            </h1>
            <p className="text-sm text-stone-500">
              As caixas já foram criadas no sistema. Imprima, recorte nas linhas tracejadas e cole nas caixas
              (proteja com fita larga transparente por causa da umidade).
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secundario" onClick={() => setGeradas(null)}>
              <ArrowLeft size={16} /> Voltar
            </button>
            <button className="btn-primario" onClick={() => window.print()}>
              <Printer size={16} /> Imprimir
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-0 p-4 sm:grid-cols-3 print:grid-cols-3 print:p-0">
          {geradas.map((e) => (
            <div
              key={e.qr}
              className="flex items-center gap-3 border border-dashed border-stone-400 p-3 print:break-inside-avoid"
            >
              <QRCodeSVG value={e.qr} size={88} marginSize={0} />
              <div className="min-w-0">
                <p className="text-2xl font-black leading-none">Nº {e.numero}</p>
                <p className="mt-1 truncate text-sm font-semibold leading-tight">
                  {e.nome}
                  {e.tamanho && ` — ${e.tamanho}`}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-600">
                  <IconeLocal local={e.local} />
                  {e.local}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                  ComprasChef · {e.qr}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------- Tela de preparação ----------
  return (
    <div className="min-h-screen bg-fundo">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-superficie px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primaria text-white">
          <ChefHat size={20} />
        </span>
        <div>
          <h1 className="text-lg font-bold leading-tight">Etiquetas das caixas</h1>
          <p className="text-xs text-stone-500">
            Marque o que precisa imprimir — cada item marcado vira 1 caixa nova com QR
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl p-4">
        <div className="card mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-stone-600">
            Selecionadas: <strong className="text-texto">{total} etiquetas</strong>
          </p>
          <button className="btn-primario" onClick={gerar} disabled={total === 0}>
            Gerar caixas e etiquetas
          </button>
        </div>

        {SECOES.map((secao) => {
          const todosMarcados = secao.itens.every((i) => marcado(i));
          return (
            <div key={secao.titulo} className="card mb-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base">
                  <IconeLocal local={secao.local} size={18} />
                  {secao.titulo}
                </h2>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-stone-500">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primaria"
                    checked={todosMarcados}
                    onChange={(e) => alternarSecao(secao, e.target.checked)}
                  />
                  todos
                </label>
              </div>
              <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                {secao.itens.map((item) => (
                  <label
                    key={chave(item)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm hover:bg-stone-50"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primaria"
                      checked={marcado(item)}
                      onChange={(e) => setMarcados((atual) => ({ ...atual, [chave(item)]: e.target.checked }))}
                    />
                    <span>
                      {item.nome}
                      {item.tamanho && (
                        <span className="ml-1.5 rounded bg-stone-100 px-1.5 py-0.5 text-xs font-bold">
                          {item.tamanho}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}

        <Link href="/cadastros" className="text-sm text-stone-500 underline">
          ← Voltar aos cadastros
        </Link>
      </div>
    </div>
  );
}
