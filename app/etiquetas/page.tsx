"use client";

// Etiquetas de QR para as caixas físicas — códigos F1-R01 / G1-01 / ES-01.
// Página fora da moldura do sistema para imprimir limpo (Ctrl+P / botão Imprimir).

import { useMemo, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Archive, ChefHat, Printer, Snowflake, Refrigerator } from "lucide-react";
import { mutate, uid, useDB } from "@/lib/data";
import {
  LOCAL_ESTOQUE_SECO,
  LOCAL_GELADEIRA_2,
} from "@/lib/data/catalogo";
import {
  numeroInternoDoCodigo,
  sugerirProximoCodigoCaixa,
  validarCodigoCaixa,
  type PapelCaixaCodigo,
  type ZonaCaixaCodigo,
} from "@/lib/domain/caixa-codigo";

type ModeloEtiqueta = {
  id: string;
  titulo: string;
  zona: ZonaCaixaCodigo;
  equipamento: number | null;
  papel?: PapelCaixaCodigo;
  local_id: string;
  local_nome: string;
  quantidadePadrao: number;
};

const MODELOS: ModeloEtiqueta[] = [
  {
    id: "f1-r",
    titulo: "Freezer 1 — Reserva",
    zona: "F",
    equipamento: 1,
    papel: "R",
    local_id: "loc-freezer1",
    local_nome: "Freezer 1",
    quantidadePadrao: 4,
  },
  {
    id: "f1-o",
    titulo: "Freezer 1 — Operacional",
    zona: "F",
    equipamento: 1,
    papel: "O",
    local_id: "loc-freezer1",
    local_nome: "Freezer 1",
    quantidadePadrao: 2,
  },
  {
    id: "f2-r",
    titulo: "Freezer 2 — Reserva",
    zona: "F",
    equipamento: 2,
    papel: "R",
    local_id: "loc-freezer2",
    local_nome: "Freezer 2",
    quantidadePadrao: 4,
  },
  {
    id: "f2-o",
    titulo: "Freezer 2 — Operacional",
    zona: "F",
    equipamento: 2,
    papel: "O",
    local_id: "loc-freezer2",
    local_nome: "Freezer 2",
    quantidadePadrao: 2,
  },
  {
    id: "g1",
    titulo: "Geladeira 1",
    zona: "G",
    equipamento: 1,
    local_id: "loc-geladeira1",
    local_nome: "Geladeira 1",
    quantidadePadrao: 6,
  },
  {
    id: "g2",
    titulo: "Geladeira 2",
    zona: "G",
    equipamento: 2,
    local_id: LOCAL_GELADEIRA_2.id,
    local_nome: "Geladeira 2",
    quantidadePadrao: 4,
  },
  {
    id: "es",
    titulo: "Estoque seco",
    zona: "ES",
    equipamento: null,
    local_id: LOCAL_ESTOQUE_SECO.id,
    local_nome: "Estoque seco",
    quantidadePadrao: 6,
  },
];

function IconeZona({ zona }: { zona: ZonaCaixaCodigo }) {
  if (zona === "F") return <Snowflake size={16} className="text-blue-500" />;
  if (zona === "G") return <Refrigerator size={16} className="text-emerald-600" />;
  return <Archive size={16} className="text-amber-600" />;
}

type EtiquetaGerada = {
  codigo: string;
  numero: number;
  local_nome: string;
  zona: ZonaCaixaCodigo;
};

export default function EtiquetasPage() {
  const db = useDB();
  const [qtds, setQtds] = useState<Record<string, number>>(() =>
    Object.fromEntries(MODELOS.map((m) => [m.id, m.quantidadePadrao]))
  );
  const [geradas, setGeradas] = useState<EtiquetaGerada[] | null>(null);

  const total = useMemo(
    () => MODELOS.reduce((s, m) => s + Math.max(0, Math.floor(qtds[m.id] || 0)), 0),
    [qtds]
  );

  function gerar() {
    if (total <= 0) return;
    const usadas = db.caixas.map((c) => c.qr_code);
    const novas: EtiquetaGerada[] = [];

    mutate((banco) => {
      const agora = new Date().toISOString();
      const qrs = [...usadas];
      for (const modelo of MODELOS) {
        const n = Math.max(0, Math.floor(qtds[modelo.id] || 0));
        for (let i = 0; i < n; i++) {
          const codigo = sugerirProximoCodigoCaixa(qrs, {
            zona: modelo.zona,
            equipamento: modelo.equipamento ?? 1,
            papel: modelo.papel,
          });
          qrs.push(codigo);
          const v = validarCodigoCaixa(codigo);
          if (!v.ok) continue;
          const numero = numeroInternoDoCodigo(v.parseado);
          banco.caixas.push({
            id: uid("cx"),
            numero,
            qr_code: v.parseado.codigo,
            tipo_box: v.parseado.tipo_box,
            posicao_fisica: "NAO_INFORMADA",
            status: "vazia",
            local_id: modelo.local_id,
            atualizado_em: agora,
          });
          novas.push({
            codigo: v.parseado.codigo,
            numero,
            local_nome: modelo.local_nome,
            zona: modelo.zona,
          });
        }
      }
    });

    setGeradas(novas);
  }

  if (geradas) {
    return (
      <div className="min-h-screen bg-white text-texto">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-4 print:hidden">
          <div>
            <h1 className="text-xl font-bold">{geradas.length} etiquetas prontas</h1>
            <p className="text-sm text-stone-500">
              Caixas vazias criadas com local e tipo. Imprima, recorte e cole (proteja com fita transparente).
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
              key={e.codigo}
              className="flex items-center gap-3 border border-dashed border-stone-400 p-3 print:break-inside-avoid"
            >
              <QRCodeSVG value={e.codigo} size={88} marginSize={0} />
              <div className="min-w-0">
                <p className="text-2xl font-black leading-none tracking-tight">{e.codigo}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-stone-600">
                  <IconeZona zona={e.zona} />
                  {e.local_nome}
                </p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                  ComprasChef
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fundo">
      <header className="flex items-center gap-3 border-b border-stone-200 bg-superficie px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primaria text-white">
          <ChefHat size={20} />
        </span>
        <div>
          <h1 className="text-lg font-bold leading-tight">Etiquetas das caixas</h1>
          <p className="text-xs text-stone-500">
            Códigos por zona: F1-R01, F1-O01, G1-01, ES-01 — cada etiqueta vira caixa vazia com local
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl p-4">
        <div className="card mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-stone-600">
            A gerar: <strong className="text-texto">{total} etiquetas</strong>
          </p>
          <div className="flex gap-2">
            <Link href="/cadastros" className="btn-secundario">
              Cadastros
            </Link>
            <button className="btn-primario" onClick={gerar} disabled={total === 0}>
              Gerar caixas e etiquetas
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {MODELOS.map((m) => (
            <div key={m.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <IconeZona zona={m.zona} />
                <div>
                  <p className="font-semibold text-stone-800">{m.titulo}</p>
                  <p className="text-xs text-stone-500">{m.local_nome}</p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                Quantidade
                <input
                  type="number"
                  min={0}
                  max={40}
                  className="campo w-20"
                  value={qtds[m.id] ?? 0}
                  onChange={(e) =>
                    setQtds((prev) => ({ ...prev, [m.id]: Number(e.target.value) || 0 }))
                  }
                />
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
