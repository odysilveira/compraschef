"use client";

// Bloco 3 — Histórico de preços por produto.
// Gráfico de linha em SVG puro (sem biblioteca): pontos com valor em moeda,
// destaque laranja para preços 15%+ acima da média histórica.

import { useMemo, useState } from "react";
import { Badge, Campo, Card, Vazio } from "@/components/ui";
import { nomeFornecedor, precoForaDoPadrao, precoMedioHistorico, useDB } from "@/lib/data";
import { dataBR, moeda } from "@/lib/format";

// Cores do design system (tailwind.config.ts)
const COR_LINHA = "#15803D"; // primaria
const COR_DESTAQUE = "#EA580C"; // destaque (laranja)
const COR_TEXTO = "#0F172A";
const COR_APOIO = "#94A3B8"; // slate-400

const L = 680; // largura do viewBox
const A = 300; // altura do viewBox
const PAD = { esq: 24, dir: 24, topo: 40, base: 48 };

export function HistoricoPrecos() {
  const db = useDB();

  const produtosComHistorico = useMemo(() => {
    const ids = new Set(db.precos_historico.map((p) => p.produto_id));
    return db.produtos
      .filter((p) => ids.has(p.id))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [db]);

  const [produtoId, setProdutoId] = useState<string>("");
  const selecionadoId = produtoId || produtosComHistorico[0]?.id || "";

  const pontos = useMemo(
    () =>
      db.precos_historico
        .filter((p) => p.produto_id === selecionadoId)
        .slice()
        .sort((a, b) => a.data.localeCompare(b.data)),
    [db, selecionadoId]
  );

  const media = precoMedioHistorico(db, selecionadoId);

  if (produtosComHistorico.length === 0) {
    return (
      <Card>
        <h2 className="mb-1">Histórico de preços</h2>
        <Vazio mensagem="Ainda não há preços registrados. Eles nascem das cotações e das notas fiscais." />
      </Card>
    );
  }

  // Escalas
  const larguraUtil = L - PAD.esq - PAD.dir;
  const alturaUtil = A - PAD.topo - PAD.base;
  const precos = pontos.map((p) => p.preco);
  const min = Math.min(...precos);
  const max = Math.max(...precos);
  const folga = (max - min || max * 0.1 || 1) * 0.25;
  const yMin = Math.max(0, min - folga);
  const yMax = max + folga;

  const x = (i: number) =>
    pontos.length === 1 ? PAD.esq + larguraUtil / 2 : PAD.esq + (i * larguraUtil) / (pontos.length - 1);
  const y = (preco: number) => PAD.topo + alturaUtil - ((preco - yMin) / (yMax - yMin)) * alturaUtil;

  const caminho = pontos.map((p, i) => `${x(i).toFixed(1)},${y(p.preco).toFixed(1)}`).join(" ");

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="mb-1">Histórico de preços</h2>
          <p className="text-sm text-slate-500">Preços registrados em cotações e notas fiscais.</p>
        </div>
        <div className="w-full max-w-xs">
          <Campo rotulo="Produto">
            <select className="campo" value={selecionadoId} onChange={(e) => setProdutoId(e.target.value)}>
              {produtosComHistorico.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </div>

      {pontos.length === 0 ? (
        <Vazio mensagem="Sem preços registrados para este produto." />
      ) : (
        <>
          <svg viewBox={`0 0 ${L} ${A}`} className="w-full" role="img" aria-label="Gráfico de linha do histórico de preços">
            {/* Linha da média histórica */}
            {media !== undefined && (
              <>
                <line
                  x1={PAD.esq}
                  x2={L - PAD.dir}
                  y1={y(media)}
                  y2={y(media)}
                  stroke={COR_APOIO}
                  strokeWidth={1}
                  strokeDasharray="5 4"
                />
                <text x={L - PAD.dir} y={y(media) - 6} textAnchor="end" fontSize={11} fill={COR_APOIO}>
                  média {moeda(media)}
                </text>
              </>
            )}

            {/* Linha do preço */}
            {pontos.length > 1 && (
              <polyline points={caminho} fill="none" stroke={COR_LINHA} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            )}

            {/* Pontos + rótulos */}
            {pontos.map((p, i) => {
              const foraDoPadrao = precoForaDoPadrao(db, selecionadoId, p.preco);
              const cor = foraDoPadrao ? COR_DESTAQUE : COR_LINHA;
              return (
                <g key={p.id}>
                  <circle cx={x(i)} cy={y(p.preco)} r={5} fill={cor} stroke="#FFFFFF" strokeWidth={1.5} />
                  <text
                    x={x(i)}
                    y={y(p.preco) - 12}
                    textAnchor="middle"
                    fontSize={11.5}
                    fontWeight={foraDoPadrao ? 700 : 500}
                    fill={foraDoPadrao ? COR_DESTAQUE : COR_TEXTO}
                  >
                    {moeda(p.preco)}
                  </text>
                  <text x={x(i)} y={A - PAD.base + 20} textAnchor="middle" fontSize={10.5} fill={COR_APOIO}>
                    {dataBR(p.data)}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COR_LINHA }} />
              preço registrado
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COR_DESTAQUE }} />
              15%+ acima da média
            </span>
            {pontos.some((p) => precoForaDoPadrao(db, selecionadoId, p.preco)) && (
              <Badge cor="laranja">
                Atenção: há preços fora do padrão — último fornecedor com preço alto:{" "}
                {nomeFornecedor(
                  db,
                  pontos.filter((p) => precoForaDoPadrao(db, selecionadoId, p.preco)).slice(-1)[0]?.fornecedor_id
                )}
              </Badge>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
