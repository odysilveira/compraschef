"use client";

// Bloco 2 — Gasto por fornecedor no mês corrente.
// Barras horizontais feitas só com CSS (sem biblioteca de gráficos).

import { Card, Vazio } from "@/components/ui";
import { nomeFornecedor, useDB } from "@/lib/data";
import { moeda } from "@/lib/format";
import type { StatusPedido } from "@/lib/types";

// Pedidos que contam como gasto (excluímos cancelados e os ainda não aprovados).
const STATUS_CONTAM: StatusPedido[] = ["aprovado", "enviado", "confirmado", "entregue"];

export function GastoFornecedor() {
  const db = useDB();

  const agora = new Date();
  const mesPrefixo = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`; // "2026-07"
  const rotuloMes = agora.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const somaPorFornecedor = new Map<string, number>();
  for (const pedido of db.pedidos) {
    if (!STATUS_CONTAM.includes(pedido.status)) continue;
    if (!pedido.criado_em.startsWith(mesPrefixo)) continue;
    somaPorFornecedor.set(
      pedido.fornecedor_id,
      (somaPorFornecedor.get(pedido.fornecedor_id) ?? 0) + pedido.valor_total
    );
  }

  const linhas = Array.from(somaPorFornecedor.entries())
    .map(([fornecedorId, total]) => ({ fornecedorId, nome: nomeFornecedor(db, fornecedorId), total }))
    .sort((a, b) => b.total - a.total);

  const maior = linhas.length > 0 ? linhas[0].total : 0;
  const totalGeral = linhas.reduce((s, l) => s + l.total, 0);

  return (
    <Card>
      <h2 className="mb-1">Gasto por fornecedor</h2>
      <p className="mb-4 text-sm capitalize text-slate-500">{rotuloMes}</p>

      {linhas.length === 0 ? (
        <Vazio mensagem="Nenhum pedido aprovado, enviado, confirmado ou entregue neste mês." />
      ) : (
        <>
          <div className="space-y-3">
            {linhas.map((l) => {
              const pct = maior > 0 ? Math.max((l.total / maior) * 100, 2) : 0;
              return (
                <div key={l.fornecedorId}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{l.nome}</span>
                    <span className="whitespace-nowrap text-slate-600">{moeda(l.total)}</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-primaria transition-all"
                      style={{ width: `${pct}%` }}
                      role="img"
                      aria-label={`${l.nome}: ${moeda(l.total)}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
            <span className="rotulo">Total geral do mês</span>
            <span className="text-lg font-bold text-primaria-escura">{moeda(totalGeral)}</span>
          </div>
        </>
      )}
    </Card>
  );
}
