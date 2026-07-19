"use client";

// Bloco 1 — Consumo médio diário por produto (últimos 30 dias)
// e estimativa de quantos dias o estoque atual dura.

import { Badge, Card, Tabela, Vazio } from "@/components/ui";
import { consumoMedioDiario, estoqueAtual, siglaUnidadeUso, useDB } from "@/lib/data";
import { qtd } from "@/lib/format";

export function ConsumoMedio() {
  const db = useDB();

  const linhas = db.produtos
    .filter((p) => p.ativo)
    .map((p) => {
      const consumo = consumoMedioDiario(db, p.id);
      const estoque = estoqueAtual(db, p.id);
      return {
        produto: p,
        sigla: siglaUnidadeUso(db, p.id),
        consumo,
        estoque,
        diasDura: consumo > 0 ? estoque / consumo : undefined,
      };
    })
    .sort((a, b) => {
      // Quem dura menos aparece primeiro; sem consumo vai para o fim.
      if (a.diasDura === undefined && b.diasDura === undefined)
        return a.produto.nome.localeCompare(b.produto.nome, "pt-BR");
      if (a.diasDura === undefined) return 1;
      if (b.diasDura === undefined) return -1;
      return a.diasDura - b.diasDura;
    });

  return (
    <Card>
      <h2 className="mb-1">Consumo médio por produto</h2>
      <p className="mb-4 text-sm text-slate-500">
        Média diária dos últimos 30 dias e estimativa de quanto tempo o estoque atual dura.
      </p>
      {linhas.length === 0 ? (
        <Vazio mensagem="Nenhum produto cadastrado." />
      ) : (
        <Tabela cabecalho={["Produto", "Consumo médio/dia", "Estoque atual", "Estoque dura"]}>
          {linhas.map(({ produto, sigla, consumo, estoque, diasDura }) => (
            <tr key={produto.id}>
              <td className="px-3 py-2.5 font-medium">{produto.nome}</td>
              <td className="whitespace-nowrap px-3 py-2.5">
                {consumo > 0 ? qtd(consumo, sigla) : <span className="text-slate-400">sem consumo</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5">{qtd(estoque, sigla)}</td>
              <td className="whitespace-nowrap px-3 py-2.5">
                {diasDura === undefined ? (
                  <span className="text-slate-400">—</span>
                ) : diasDura <= 3 ? (
                  <Badge cor="laranja">~{Math.round(diasDura)} dia{Math.round(diasDura) === 1 ? "" : "s"}</Badge>
                ) : (
                  <>~{Math.round(diasDura)} dias</>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
      )}
    </Card>
  );
}
