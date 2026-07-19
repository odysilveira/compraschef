// "IA" de recomendação local — analisa as respostas das cotações de uma lista
// e escolhe, por produto, o fornecedor de menor preço disponível, penalizando
// preços fora do padrão histórico. Gera justificativa em português.
// Quando houver backend com IA real, esta função será substituída por uma chamada
// mantendo a mesma assinatura.

import type { DB } from "@/lib/types";
import {
  nomeFornecedor,
  nomeProduto,
  precoForaDoPadrao,
  precoMedioHistorico,
  siglaUnidadeUso,
} from "@/lib/data";
import { dataBR, moeda } from "@/lib/format";

export interface ItemRecomendado {
  produto_id: string;
  quantidade: number;
  fornecedor_id: string;
  cotacao_id: string;
  preco_unitario: number;
  prazo_entrega_dias?: number;
}

export interface Recomendacao {
  itens: ItemRecomendado[];
  justificativa: string;
}

/** Preço fora do padrão "pesa" 20% a mais na comparação. */
const PENALIDADE_FORA_DO_PADRAO = 1.2;

export function gerarRecomendacao(db: DB, listaId: string): Recomendacao {
  const cotacoes = db.cotacoes.filter((c) => c.lista_id === listaId);
  const respondidas = cotacoes.filter((c) => c.status === "respondida");
  const pendentes = cotacoes.filter((c) => c.status === "enviada");
  const itensLista = db.lista_itens.filter((i) => i.lista_id === listaId);

  const itens: ItemRecomendado[] = [];
  const linhas: string[] = [];

  for (const il of itensLista) {
    const nome = nomeProduto(db, il.produto_id);
    const sigla = siglaUnidadeUso(db, il.produto_id) || "un";
    const media = precoMedioHistorico(db, il.produto_id);

    interface Oferta {
      cotacaoId: string;
      fornecedorId: string;
      preco: number;
      prazo?: number;
      fora: boolean;
    }
    const ofertas: Oferta[] = [];
    const substitutos: { fornecedorId: string; descricao: string; preco?: number }[] = [];

    for (const cot of respondidas) {
      const ci = db.cotacao_itens.find(
        (x) => x.cotacao_id === cot.id && x.produto_id === il.produto_id
      );
      if (!ci) continue;
      if (ci.disponivel && ci.preco_unitario !== undefined) {
        ofertas.push({
          cotacaoId: cot.id,
          fornecedorId: cot.fornecedor_id,
          preco: ci.preco_unitario,
          prazo: ci.prazo_entrega_dias,
          fora: precoForaDoPadrao(db, il.produto_id, ci.preco_unitario),
        });
      } else if (!ci.disponivel && ci.substituto_descricao) {
        substitutos.push({
          fornecedorId: cot.fornecedor_id,
          descricao: ci.substituto_descricao,
          preco: ci.substituto_preco,
        });
      }
    }

    if (ofertas.length === 0) {
      let linha = `• ${nome}: nenhum fornecedor respondeu com preço até agora — o item ficará fora do pedido.`;
      for (const s of substitutos) {
        linha += ` ${nomeFornecedor(db, s.fornecedorId)} não tem o produto e ofereceu substituto (${s.descricao}${
          s.preco !== undefined ? ` por ${moeda(s.preco)}` : ""
        }) — avalie manualmente.`;
      }
      linhas.push(linha);
      continue;
    }

    const ordenadas = [...ofertas].sort(
      (a, b) =>
        a.preco * (a.fora ? PENALIDADE_FORA_DO_PADRAO : 1) -
        b.preco * (b.fora ? PENALIDADE_FORA_DO_PADRAO : 1)
    );
    const melhor = ordenadas[0];

    itens.push({
      produto_id: il.produto_id,
      quantidade: il.quantidade,
      fornecedor_id: melhor.fornecedorId,
      cotacao_id: melhor.cotacaoId,
      preco_unitario: melhor.preco,
      prazo_entrega_dias: melhor.prazo,
    });

    let linha = `• ${nome}: recomendo ${nomeFornecedor(db, melhor.fornecedorId)} a ${moeda(melhor.preco)}/${sigla}`;
    if (media !== undefined) {
      const dif = Math.round(Math.abs((melhor.preco - media) / media) * 100);
      linha +=
        melhor.preco <= media
          ? ` (${dif}% abaixo da média histórica de ${moeda(media)})`
          : ` (${dif}% acima da média histórica de ${moeda(media)})`;
    }
    if (melhor.prazo !== undefined) {
      linha += `, entrega em ${melhor.prazo} dia${melhor.prazo === 1 ? "" : "s"}`;
    }
    linha += ".";
    for (const outra of ordenadas.slice(1)) {
      linha += ` ${nomeFornecedor(db, outra.fornecedorId)} cotou ${moeda(outra.preco)}${
        outra.fora ? " — preço fora do padrão histórico ⚠" : ""
      }.`;
    }
    for (const s of substitutos) {
      linha += ` ${nomeFornecedor(db, s.fornecedorId)} não tem e ofereceu substituto (${s.descricao}${
        s.preco !== undefined ? ` por ${moeda(s.preco)}` : ""
      }).`;
    }
    linhas.push(linha);
  }

  // Total por fornecedor vencedor × pedido mínimo
  const totalPorFornecedor = new Map<string, number>();
  for (const item of itens) {
    totalPorFornecedor.set(
      item.fornecedor_id,
      (totalPorFornecedor.get(item.fornecedor_id) ?? 0) + item.preco_unitario * item.quantidade
    );
  }
  totalPorFornecedor.forEach((total, fornecedorId) => {
    const forn = db.fornecedores.find((f) => f.id === fornecedorId);
    let linha = `• Total com ${nomeFornecedor(db, fornecedorId)}: ${moeda(total)}`;
    if (forn?.pedido_minimo !== undefined) {
      linha +=
        total >= forn.pedido_minimo
          ? ` — acima do pedido mínimo de ${moeda(forn.pedido_minimo)} ✓`
          : ` — ATENÇÃO: abaixo do pedido mínimo de ${moeda(forn.pedido_minimo)}`;
    }
    linhas.push(linha + ".");
  });

  for (const cot of pendentes) {
    linhas.push(
      `• Ainda aguardando resposta de ${nomeFornecedor(db, cot.fornecedor_id)} (prazo até ${dataBR(cot.prazo_resposta)}).`
    );
  }

  return { itens, justificativa: linhas.join("\n") };
}
