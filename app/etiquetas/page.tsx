"use client";

// Etiquetas de QR para as caixas físicas.
// Página fora da moldura do sistema para imprimir limpo (Ctrl+P / botão Imprimir).
// Fluxo: ajustar quantidades → "Gerar caixas e etiquetas" → as caixas são criadas
// no sistema (status vazia) e a folha de etiquetas aparece pronta para imprimir.

import { useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, ChefHat, Printer, Snowflake, Refrigerator } from "lucide-react";
import { mutate, uid, useDB } from "@/lib/data";

interface ItemCatalogo {
  nome: string;
  local: "Freezer" | "Geladeira";
  tamanho: "G" | "P" | "Único";
}

const SABORES_FREEZER = [
  "Camarão",
  "Bolonhesa",
  "4 Queijos",
  "Parisiense",
  "Presunto",
  "Cheddar e bacon",
  "Carne com cheddar e bacon",
  "Funghi",
  "Brócolis",
  "Ragu de costela",
  "Frango",
  "Frango com requeijão",
];

const SABORES_GELADEIRA = [
  "Caracolino",
  "Talharim",
  "Talharim integral",
  "Talharim proteico",
  "Penne",
  "Risotos",
];

const UNICOS_GELADEIRA = ["Creme culinário", "Molho de tomate"];

const CATALOGO: ItemCatalogo[] = [
  ...SABORES_FREEZER.flatMap((nome): ItemCatalogo[] => [
    { nome, local: "Freezer", tamanho: "G" },
    { nome, local: "Freezer", tamanho: "P" },
  ]),
  ...SABORES_GELADEIRA.flatMap((nome): ItemCatalogo[] => [
    { nome, local: "Geladeira", tamanho: "G" },
    { nome, local: "Geladeira", tamanho: "P" },
  ]),
  ...UNICOS_GELADEIRA.map((nome): ItemCatalogo => ({ nome, local: "Geladeira", tamanho: "Único" })),
];

interface EtiquetaGerada extends ItemCatalogo {
  numero: number;
  qr: string;
}

export default function EtiquetasPage() {
  const db = useDB();
  const [qtds, setQtds] = useState<Record<string, number>>({});
  const [geradas, setGeradas] = useState<EtiquetaGerada[] | null>(null);

  const chave = (i: ItemCatalogo) => `${i.nome}|${i.tamanho}`;
  const qtdDe = (i: ItemCatalogo) => qtds[chave(i)] ?? 1;

  const totalEtiquetas = useMemo(
    () => CATALOGO.reduce((soma, i) => soma + qtdDe(i), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qtds]
  );

  function gerar() {
    const maiorNumero = db.caixas.reduce((m, c) => Math.max(m, c.numero), 0);
    let proximo = maiorNumero + 1;
    const novas: EtiquetaGerada[] = [];

    for (const item of CATALOGO) {
      for (let n = 0; n < qtdDe(item); n++) {
        novas.push({
          ...item,
          numero: proximo,
          qr: `CXCHEF-${String(proximo).padStart(3, "0")}`,
        });
        proximo++;
      }
    }

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
              (papel adesivo ou fita larga transparente por cima).
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
                  {e.tamanho !== "Único" && ` — ${e.tamanho}`}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-stone-600">
                  {e.local === "Freezer" ? <Snowflake size={12} /> : <Refrigerator size={12} />}
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
  const secoes: { titulo: string; icone: React.ReactNode; itens: ItemCatalogo[] }[] = [
    {
      titulo: "Freezer — porções G e P",
      icone: <Snowflake size={18} className="text-blue-500" />,
      itens: CATALOGO.filter((i) => i.local === "Freezer"),
    },
    {
      titulo: "Geladeira — porções G e P",
      icone: <Refrigerator size={18} className="text-emerald-600" />,
      itens: CATALOGO.filter((i) => i.local === "Geladeira" && i.tamanho !== "Único"),
    },
    {
      titulo: "Geladeira — tamanho único",
      icone: <Refrigerator size={18} className="text-emerald-600" />,
      itens: CATALOGO.filter((i) => i.tamanho === "Único"),
    },
  ];

  return (
    <div className="min-h-screen bg-fundo">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-superficie px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primaria text-white">
          <ChefHat size={20} />
        </span>
        <div>
          <h1 className="text-lg font-bold leading-tight">Etiquetas das caixas</h1>
          <p className="text-xs text-stone-500">QR fixo por caixa — o conteúdo o sistema acompanha pelas leituras</p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl p-4">
        <div className="card mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-stone-600">
            Ajuste quantas caixas de cada tipo você tem. Total:{" "}
            <strong className="text-texto">{totalEtiquetas} etiquetas</strong>
          </p>
          <button className="btn-primario" onClick={gerar}>
            Gerar caixas e etiquetas
          </button>
        </div>

        {secoes.map((secao) => (
          <div key={secao.titulo} className="card mb-4">
            <h2 className="mb-3 flex items-center gap-2 text-base">
              {secao.icone}
              {secao.titulo}
            </h2>
            <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {secao.itens.map((item) => (
                <label key={chave(item)} className="flex items-center justify-between gap-2 py-1 text-sm">
                  <span>
                    {item.nome}
                    {item.tamanho !== "Único" && (
                      <span className="ml-1 rounded bg-stone-100 px-1.5 py-0.5 text-xs font-bold">{item.tamanho}</span>
                    )}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    className="w-16 rounded-lg border border-stone-300 px-2 py-1 text-center text-sm"
                    value={qtdDe(item)}
                    onChange={(e) =>
                      setQtds((atual) => ({
                        ...atual,
                        [chave(item)]: Math.max(0, Math.min(30, Number(e.target.value) || 0)),
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        ))}

        <Link href="/cadastros" className="text-sm text-stone-500 underline">
          ← Voltar aos cadastros
        </Link>
      </div>
    </div>
  );
}
