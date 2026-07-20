"use client";

// Cotações (requisitos 10–18): acompanhamento por fornecedor, quadro comparativo
// em tempo real, recomendação da IA e geração de pedido. Só dono/gerente.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, Copy, Plus, Sparkles } from "lucide-react";
import { Badge, Card, TituloPagina, Vazio } from "@/components/ui";
import { mutate, nomeFornecedor, uid, useDB } from "@/lib/data";
import { podeVerValores, usePapel } from "@/lib/roles";
import { dataBR, dataHoraBR } from "@/lib/format";
import { QuadroComparativo } from "@/components/compras/QuadroComparativo";
import { gerarRecomendacao, type ItemRecomendado } from "@/components/compras/recomendacao";

export default function CotacoesPage() {
  const db = useDB();
  const { papel } = usePapel();
  const router = useRouter();
  const [copiado, setCopiado] = useState<string | null>(null);
  const [lembretes, setLembretes] = useState<string[]>([]);

  if (!podeVerValores(papel)) {
    return (
      <div>
        <TituloPagina titulo="Cotações" />
        <Vazio mensagem="Acesso restrito: cotações e valores são visíveis apenas para o dono e a gerente." />
      </div>
    );
  }

  const listas = db.listas_compras
    .filter((l) => l.status === "em_cotacao")
    .sort((a, b) => b.criada_em.localeCompare(a.criada_em));

  async function copiarLink(cotacaoId: string, token: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/cotacao/${token}`);
      setCopiado(cotacaoId);
      setTimeout(() => setCopiado((c) => (c === cotacaoId ? null : c)), 2500);
    } catch {
      // clipboard indisponível — sem feedback
    }
  }

  function gerarPedido(listaId: string) {
    const rec = gerarRecomendacao(db, listaId);
    if (rec.itens.length === 0) return;
    const agora = new Date().toISOString();
    const hoje = agora.slice(0, 10);

    mutate((d) => {
      const porFornecedor = new Map<string, ItemRecomendado[]>();
      for (const item of rec.itens) {
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
          valor_total: grupo.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0),
          analise_ia: rec.justificativa,
          criado_em: agora,
        });
        for (const item of grupo) {
          d.pedido_itens.push({
            id: uid("pi"),
            pedido_id: pedidoId,
            produto_id: item.produto_id,
            quantidade: item.quantidade,
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
        listas.map((lista) => {
          const cotacoes = db.cotacoes.filter((c) => c.lista_id === lista.id);
          const rec = gerarRecomendacao(db, lista.id);
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

              <Card>
                <h2 className="mb-3">Quadro comparativo</h2>
                <QuadroComparativo db={db} listaId={lista.id} />
              </Card>

              <Card className="border-2 border-destaque">
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-destaque" />
                  <h2>Recomendação da IA</h2>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                  {rec.justificativa || "Aguardando as primeiras respostas dos fornecedores."}
                </p>
                <div className="mt-4">
                  <button
                    className="btn-primario"
                    disabled={rec.itens.length === 0}
                    onClick={() => gerarPedido(lista.id)}
                  >
                    Gerar pedido
                  </button>
                  {rec.itens.length === 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      É preciso ao menos uma resposta com preço disponível para gerar o pedido.
                    </p>
                  )}
                </div>
              </Card>
            </div>
          );
        })
      )}
    </div>
  );
}
