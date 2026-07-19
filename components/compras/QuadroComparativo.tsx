"use client";

// Quadro comparativo das cotações de uma lista: produtos nas linhas,
// fornecedores nas colunas, preços nas células. Melhor preço em verde,
// preço fora do padrão em laranja com aviso, indisponível com substituto.

import { AlertTriangle } from "lucide-react";
import type { CotacaoItem, DB } from "@/lib/types";
import { nomeFornecedor, nomeProduto, precoForaDoPadrao, siglaUnidadeUso } from "@/lib/data";
import { moeda, qtd } from "@/lib/format";

export function QuadroComparativo({ db, listaId }: { db: DB; listaId: string }) {
  const cotacoes = db.cotacoes.filter((c) => c.lista_id === listaId);
  const itensLista = db.lista_itens.filter((i) => i.lista_id === listaId);

  function itemDe(cotacaoId: string, produtoId: string): CotacaoItem | undefined {
    return db.cotacao_itens.find((x) => x.cotacao_id === cotacaoId && x.produto_id === produtoId);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <th className="rotulo whitespace-nowrap px-3 py-2">Produto</th>
            {cotacoes.map((c) => (
              <th key={c.id} className="rotulo whitespace-nowrap px-3 py-2">
                {nomeFornecedor(db, c.fornecedor_id)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {itensLista.map((il) => {
            const precosValidos = cotacoes
              .filter((c) => c.status === "respondida")
              .map((c) => itemDe(c.id, il.produto_id))
              .filter((ci): ci is CotacaoItem => !!ci && ci.disponivel && ci.preco_unitario !== undefined)
              .map((ci) => ci.preco_unitario as number);
            const melhorPreco = precosValidos.length > 0 ? Math.min(...precosValidos) : undefined;

            return (
              <tr key={il.id}>
                <td className="whitespace-nowrap px-3 py-2 font-medium">
                  {nomeProduto(db, il.produto_id)}
                  <span className="ml-1 text-xs font-normal text-slate-400">
                    {qtd(il.quantidade, siglaUnidadeUso(db, il.produto_id))}
                  </span>
                </td>
                {cotacoes.map((c) => {
                  const ci = itemDe(c.id, il.produto_id);
                  if (!ci) {
                    return (
                      <td key={c.id} className="px-3 py-2 text-slate-300" title="Fornecedor não vende este produto">
                        —
                      </td>
                    );
                  }
                  if (c.status !== "respondida") {
                    return (
                      <td key={c.id} className="px-3 py-2 text-xs italic text-slate-400">
                        aguardando
                      </td>
                    );
                  }
                  if (!ci.disponivel || ci.preco_unitario === undefined) {
                    return (
                      <td key={c.id} className="px-3 py-2">
                        <span className="text-slate-400">—</span>
                        {ci.substituto_descricao && (
                          <p className="mt-0.5 max-w-[180px] text-xs text-slate-500">
                            Substituto: {ci.substituto_descricao}
                            {ci.substituto_preco !== undefined && ` (${moeda(ci.substituto_preco)})`}
                          </p>
                        )}
                      </td>
                    );
                  }
                  const fora = precoForaDoPadrao(db, il.produto_id, ci.preco_unitario);
                  const ehMelhor = !fora && melhorPreco !== undefined && ci.preco_unitario === melhorPreco;
                  return (
                    <td
                      key={c.id}
                      title={
                        fora
                          ? "⚠ Preço fora do padrão: 15% ou mais acima da média histórica"
                          : ehMelhor
                            ? "Melhor preço da linha"
                            : undefined
                      }
                      className={`whitespace-nowrap px-3 py-2 font-semibold ${
                        fora ? "bg-destaque-clara text-destaque" : ehMelhor ? "bg-sucesso-clara text-primaria-escura" : ""
                      }`}
                    >
                      {fora && <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />}
                      {moeda(ci.preco_unitario)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr className="border-t-2 border-slate-200">
            <td className="px-3 py-2 font-bold">Total</td>
            {cotacoes.map((c) => {
              const total = db.cotacao_itens
                .filter((ci) => ci.cotacao_id === c.id && ci.disponivel && ci.preco_unitario !== undefined)
                .reduce((s, ci) => s + (ci.preco_unitario as number) * ci.quantidade, 0);
              return (
                <td key={c.id} className="px-3 py-2 font-bold">
                  {c.status === "respondida" && total > 0 ? moeda(total) : "—"}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
