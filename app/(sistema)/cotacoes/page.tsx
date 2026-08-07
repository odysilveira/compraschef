"use client";

// Cotações (requisitos 10–18): acompanhamento por fornecedor, quadro comparativo
// em tempo real, recomendação da IA e geração de pedido. Só dono/gerente.

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, Check, Copy, Plus, Sparkles } from "lucide-react";
import { Badge, Card, TituloPagina, Vazio } from "@/components/ui";
import { mutate, nomeFornecedor, nomeProduto, siglaParaItem, uid, useDB } from "@/lib/data";
import {
  FILTROS_STATUS_COTACAO_UI,
  filtrarCotacoesPorStatus,
  hrefCotacoes,
  parseFiltroStatusCotacao,
  type FiltroStatusCotacao,
} from "@/lib/domain/cotacoes-navegacao";
import { podeVerValores, usePapel } from "@/lib/roles";
import { dataBR, dataHoraBR, moeda, qtd } from "@/lib/format";
import { QuadroComparativo } from "@/components/compras/QuadroComparativo";
import { gerarRecomendacao, type ItemRecomendado } from "@/components/compras/recomendacao";
import type { DB } from "@/lib/types";

// Bloco de fechamento (usado 2x: "Minha cotação" e "Sugestão da IA"):
// lista por fornecedor com itens, totais, aviso de pedido mínimo e botão de fechar.
function BlocoFechamento({
  db,
  titulo,
  icone,
  corBorda,
  itens,
  rotuloBotao,
  onFechar,
  mensagemVazio,
}: {
  db: DB;
  titulo: string;
  icone: React.ReactNode;
  corBorda: string;
  itens: ItemRecomendado[];
  rotuloBotao: string;
  onFechar: () => void;
  mensagemVazio: string;
}) {
  const grupos = new Map<string, ItemRecomendado[]>();
  for (const item of itens) {
    grupos.set(item.fornecedor_id, [...(grupos.get(item.fornecedor_id) ?? []), item]);
  }
  const totalGeral = itens.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0);

  return (
    <Card className={`border-2 ${corBorda}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2">
          {icone}
          {titulo}
        </h2>
        {itens.length > 0 && <p className="font-bold">{moeda(totalGeral)}</p>}
      </div>
      {itens.length === 0 ? (
        <p className="text-sm text-stone-500">{mensagemVazio}</p>
      ) : (
        <div className="space-y-3">
          {Array.from(grupos.entries()).map(([fornecedorId, itensGrupo]) => {
            const total = itensGrupo.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0);
            const forn = db.fornecedores.find((f) => f.id === fornecedorId);
            const abaixoMinimo = forn?.pedido_minimo !== undefined && total < forn.pedido_minimo;
            return (
              <div key={fornecedorId} className="rounded-card border border-stone-200 p-3">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{nomeFornecedor(db, fornecedorId)}</p>
                  <p className="font-bold">{moeda(total)}</p>
                </div>
                <ul className="space-y-0.5 text-sm text-slate-600">
                  {itensGrupo.map((i) => (
                    <li key={i.produto_id}>
                      {nomeProduto(db, i.produto_id)} —{" "}
                      {qtd(i.quantidade, siglaParaItem(db, i.produto_id, i.unidade_id))} × {moeda(i.preco_unitario)}
                    </li>
                  ))}
                </ul>
                {abaixoMinimo && (
                  <p className="mt-1.5 text-xs font-semibold text-destaque">
                    ⚠ Abaixo do pedido mínimo de {moeda(forn?.pedido_minimo)} deste fornecedor.
                  </p>
                )}
              </div>
            );
          })}
          <button className="btn-primario w-full" onClick={onFechar}>
            {rotuloBotao}
          </button>
        </div>
      )}
    </Card>
  );
}

function CotacoesConteudo() {
  const db = useDB();
  const { papel } = usePapel();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [copiado, setCopiado] = useState<string | null>(null);
  const [lembretes, setLembretes] = useState<string[]>([]);
  // Escolha manual por produto: listaId → (produtoId → cotacaoId)
  const [escolhas, setEscolhas] = useState<Record<string, Record<string, string>>>({});
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatusCotacao>(() =>
    parseFiltroStatusCotacao(searchParams.get("status"))
  );

  useEffect(() => {
    setFiltroStatus(parseFiltroStatusCotacao(searchParams.get("status")));
  }, [searchParams]);

  const listas = useMemo(
    () =>
      db.listas_compras
        .filter((l) => l.status === "em_cotacao")
        .sort((a, b) => b.criada_em.localeCompare(a.criada_em)),
    [db.listas_compras]
  );

  const contagemPorStatus = useMemo(() => {
    const idsListas = new Set(listas.map((l) => l.id));
    const cotacoesAtivas = db.cotacoes.filter((c) => idsListas.has(c.lista_id));
    return {
      todos: cotacoesAtivas.length,
      enviada: cotacoesAtivas.filter((c) => c.status === "enviada").length,
      respondida: cotacoesAtivas.filter((c) => c.status === "respondida").length,
      expirada: cotacoesAtivas.filter((c) => c.status === "expirada").length,
    };
  }, [db.cotacoes, listas]);

  const podeVer = podeVerValores(papel);
  const mostrarFechamento = filtroStatus === "todos" || filtroStatus === "respondida";

  function irParaFiltroStatus(proximo: FiltroStatusCotacao) {
    setFiltroStatus(proximo);
    router.replace(hrefCotacoes({ status: proximo }), { scroll: false });
  }

  if (!podeVer) {
    return (
      <div>
        <TituloPagina titulo="Cotações" />
        <Vazio mensagem="Acesso restrito: cotações e valores são visíveis apenas para o dono e a gerente." />
      </div>
    );
  }

  async function copiarLink(cotacaoId: string, token: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/cotacao/${token}`);
      setCopiado(cotacaoId);
      setTimeout(() => setCopiado((c) => (c === cotacaoId ? null : c)), 2500);
    } catch {
      // clipboard indisponível — sem feedback
    }
  }

  /** Monta os itens finais a partir da escolha do dono (produtoId → cotacaoId). */
  function itensEscolhidos(selecao: Record<string, string>): ItemRecomendado[] {
    const itens: ItemRecomendado[] = [];
    for (const [produtoId, cotacaoId] of Object.entries(selecao)) {
      const cot = db.cotacoes.find((c) => c.id === cotacaoId);
      const ci = db.cotacao_itens.find((x) => x.cotacao_id === cotacaoId && x.produto_id === produtoId);
      if (!cot || cot.status !== "respondida" || !ci || !ci.disponivel || ci.preco_unitario === undefined) continue;
      itens.push({
        produto_id: produtoId,
        quantidade: ci.quantidade,
        unidade_id: ci.unidade_id,
        fornecedor_id: cot.fornecedor_id,
        cotacao_id: cotacaoId,
        preco_unitario: ci.preco_unitario,
        prazo_entrega_dias: ci.prazo_entrega_dias,
      });
    }
    return itens;
  }

  function gerarPedido(listaId: string, selecao: Record<string, string>, justificativa: string) {
    const itens = itensEscolhidos(selecao);
    if (itens.length === 0) return;
    const agora = new Date().toISOString();
    const hoje = agora.slice(0, 10);

    mutate((d) => {
      const porFornecedor = new Map<string, ItemRecomendado[]>();
      for (const item of itens) {
        const grupo = porFornecedor.get(item.fornecedor_id) ?? [];
        grupo.push(item);
        porFornecedor.set(item.fornecedor_id, grupo);
      }
      porFornecedor.forEach((grupo, fornecedorId) => {
        const pedidoId = uid("ped");
        d.pedidos.push({
          id: pedidoId,
          cotacao_id: grupo[0].cotacao_id,
          fornecedor_id: fornecedorId,
          status: "aguardando_aprovacao",
          valor_total: Math.round(grupo.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0) * 100) / 100,
          analise_ia: justificativa,
          criado_em: agora,
        });
        for (const item of grupo) {
          d.pedido_itens.push({
            id: uid("pi"),
            pedido_id: pedidoId,
            produto_id: item.produto_id,
            quantidade: item.quantidade,
            unidade_id: item.unidade_id,
            preco_unitario: item.preco_unitario,
          });
        }
      });

      // Grava o histórico de preços de todas as respostas (origem "cotacao")
      for (const cot of d.cotacoes.filter((c) => c.lista_id === listaId && c.status === "respondida")) {
        for (const ci of d.cotacao_itens.filter(
          (x) => x.cotacao_id === cot.id && x.disponivel && x.preco_unitario !== undefined
        )) {
          d.precos_historico.push({
            id: uid("ph"),
            produto_id: ci.produto_id,
            fornecedor_id: cot.fornecedor_id,
            preco: ci.preco_unitario as number,
            origem: "cotacao",
            data: hoje,
          });
        }
      }

      const lista = d.listas_compras.find((l) => l.id === listaId);
      if (lista) lista.status = "finalizada";
    });

    router.push("/pedidos");
  }

  return (
    <div>
      <TituloPagina
        titulo="Cotações"
        subtitulo="Toda cotação nasce de uma lista de compras confirmada"
        acao={
          <Link href="/lista-compras" className="btn-primario">
            <Plus size={16} /> Nova cotação (criar lista)
          </Link>
        }
      />

      {listas.length === 0 ? (
        <Card className="py-8 text-center">
          <p className="font-semibold">Nenhuma cotação em andamento.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-stone-500">
            O caminho é: <strong>Lista de compras</strong> → gerar automática (ou montar a sua) → ajustar os itens
            → <strong>Confirmar</strong> → escolher os fornecedores. As cotações aparecem aqui.
          </p>
          <Link href="/lista-compras" className="btn-primario mt-4">
            Começar pela lista de compras
          </Link>
        </Card>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {FILTROS_STATUS_COTACAO_UI.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`btn-secundario text-sm ${
                  filtroStatus === f.id ? "border-primaria bg-primaria-clara text-primaria" : ""
                }`}
                onClick={() => irParaFiltroStatus(f.id)}
              >
                {f.rotulo} ({contagemPorStatus[f.id]})
              </button>
            ))}
          </div>
          {listas.every(
            (lista) =>
              filtrarCotacoesPorStatus(
                db.cotacoes.filter((c) => c.lista_id === lista.id),
                filtroStatus
              ).length === 0
          ) ? (
            <Vazio mensagem="Nenhuma cotação neste status." />
          ) : (
            listas.map((lista) => {
          const cotacoes = filtrarCotacoesPorStatus(
            db.cotacoes.filter((c) => c.lista_id === lista.id),
            filtroStatus
          );
          if (cotacoes.length === 0) return null;
          const rec = gerarRecomendacao(db, lista.id);
          // Duas seleções independentes: a sugestão da IA e as marcações do dono
          const sugestao = Object.fromEntries(rec.itens.map((i) => [i.produto_id, i.cotacao_id]));
          const minha = escolhas[lista.id] ?? {};
          const itensIA = rec.itens;
          const itensMinha = itensEscolhidos(minha);
          const diferentes = itensMinha.filter((i) => sugestao[i.produto_id] !== i.cotacao_id);

          const justificativaMinha =
            rec.justificativa +
            "\n• Fechamento: cotação marcada manualmente pelo dono." +
            (diferentes.length > 0
              ? "\n" +
                diferentes
                  .map(
                    (i) =>
                      `• ${nomeProduto(db, i.produto_id)} comprado de ${nomeFornecedor(db, i.fornecedor_id)} em vez da sugestão da IA.`
                  )
                  .join("\n")
              : "");
          return (
            <div key={lista.id} className="mb-8 space-y-4">
              <Card>
                <h2 className="mb-3">Cotações da lista de {dataBR(lista.criada_em)}</h2>
                <div className="space-y-3">
                  {cotacoes.map((cot) => (
                    <div
                      key={cot.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-slate-200 p-3"
                    >
                      <div>
                        <p className="font-semibold">{nomeFornecedor(db, cot.fornecedor_id)}</p>
                        <p className="text-xs text-slate-500">
                          {cot.canal === "whatsapp" ? "WhatsApp" : "E-mail"} · responder até{" "}
                          {dataHoraBR(cot.prazo_resposta)}
                        </p>
                        {lembretes.includes(cot.id) && (
                          <p className="mt-0.5 text-xs font-medium text-destaque">
                            Lembrete enviado por WhatsApp (simulado)
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {cot.status === "respondida" ? (
                          <Badge cor="verde">Respondeu ✓</Badge>
                        ) : cot.status === "expirada" ? (
                          <Badge cor="vermelho">Expirada</Badge>
                        ) : (
                          <Badge cor="laranja">Aguardando</Badge>
                        )}
                        <button
                          className="btn-secundario !px-3 !py-1.5 !text-xs"
                          onClick={() => copiarLink(cot.id, cot.token)}
                        >
                          {copiado === cot.id ? (
                            <>
                              <Check className="h-3.5 w-3.5" /> Copiado!
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" /> Copiar link
                            </>
                          )}
                        </button>
                        {cot.status === "enviada" && (
                          <button
                            className="btn-secundario !px-3 !py-1.5 !text-xs"
                            onClick={() => setLembretes((l) => (l.includes(cot.id) ? l : [...l, cot.id]))}
                          >
                            <Bell className="h-3.5 w-3.5" /> Reenviar lembrete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {mostrarFechamento && (
                <>
              <Card>
                <h2 className="mb-1">Quadro comparativo</h2>
                <p className="mb-3 text-xs text-stone-500">
                  <Sparkles className="mr-0.5 inline h-3.5 w-3.5 text-destaque" />
                  <span className="mr-3 font-semibold text-destaque">laranja = sugestão da IA</span>
                  <span className="mr-1 inline-block h-3 w-3 rounded-full border-2 border-emerald-600 align-middle" />
                  <span className="font-semibold text-emerald-700">verde = sua escolha</span> — toque num preço para
                  marcar a sua cotação (toque de novo para desmarcar).
                </p>
                <QuadroComparativo
                  db={db}
                  listaId={lista.id}
                  sugestao={sugestao}
                  minha={minha}
                  onEscolher={(produtoId, cotacaoId) =>
                    setEscolhas((atual) => {
                      const daLista = { ...(atual[lista.id] ?? {}) };
                      if (daLista[produtoId] === cotacaoId) {
                        delete daLista[produtoId];
                      } else {
                        daLista[produtoId] = cotacaoId;
                      }
                      return { ...atual, [lista.id]: daLista };
                    })
                  }
                />
              </Card>

              <Card className="border-2 border-destaque">
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-destaque" />
                  <h2>Recomendação da IA</h2>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                  {rec.justificativa || "Aguardando as primeiras respostas dos fornecedores."}
                </p>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <BlocoFechamento
                  db={db}
                  titulo="Minha cotação"
                  icone={<span className="inline-block h-4 w-4 rounded-full border-[3px] border-emerald-600" />}
                  corBorda="border-emerald-600"
                  itens={itensMinha}
                  rotuloBotao="Fechar com a MINHA cotação"
                  onFechar={() => gerarPedido(lista.id, minha, justificativaMinha)}
                  mensagemVazio="Você ainda não marcou nenhum preço — toque nos valores do quadro acima para montar a sua cotação."
                />
                <BlocoFechamento
                  db={db}
                  titulo="Sugestão da IA"
                  icone={<Sparkles className="h-5 w-5 text-destaque" />}
                  corBorda="border-destaque"
                  itens={itensIA}
                  rotuloBotao="Fechar com a sugestão da IA"
                  onFechar={() => gerarPedido(lista.id, sugestao, rec.justificativa)}
                  mensagemVazio="Aguardando as primeiras respostas com preço para montar a sugestão."
                />
              </div>
                </>
              )}
            </div>
          );
            })
          )}
        </>
      )}
    </div>
  );
}

export default function CotacoesPage() {
  return (
    <Suspense
      fallback={
        <div>
          <TituloPagina titulo="Cotações" subtitulo="Carregando…" />
          <p className="text-sm text-slate-500">Carregando cotações…</p>
        </div>
      }
    >
      <CotacoesConteudo />
    </Suspense>
  );
}
