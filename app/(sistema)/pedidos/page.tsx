"use client";

// Pedidos (requisitos 19–22): acompanhamento visual do status, detalhe com itens
// e análise da IA (valores escondidos de líder/caixa) e ações por status.
// Aprovação é exclusiva do dono.

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Modal, Tabela, TituloPagina, Vazio } from "@/components/ui";
import { mutate, nomeFornecedor, nomePerfil, nomeProduto, siglaParaItem, useDB } from "@/lib/data";
import { podeAprovar, podeVerValores, usePapel } from "@/lib/roles";
import { dataHoraBR, moeda, qtd } from "@/lib/format";
import { EtapasPedido } from "@/components/compras/EtapasPedido";
import type { Pedido, StatusPedido } from "@/lib/types";

export default function PedidosPage() {
  const db = useDB();
  const { papel } = usePapel();
  const verValores = podeVerValores(papel);
  const donoAprova = podeAprovar(papel);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [avisoMock, setAvisoMock] = useState<string | null>(null);

  const pedidos = [...db.pedidos].sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  const pedido = db.pedidos.find((p) => p.id === selecionado);
  const itens = pedido ? db.pedido_itens.filter((i) => i.pedido_id === pedido.id) : [];

  function atualizarStatus(id: string, status: StatusPedido, extras?: Partial<Pedido>, aviso?: string) {
    mutate((d) => {
      const p = d.pedidos.find((x) => x.id === id);
      if (p) Object.assign(p, { status }, extras ?? {});
    });
    setAvisoMock(aviso ?? null);
  }

  function fechar() {
    setSelecionado(null);
    setAvisoMock(null);
  }

  return (
    <div>
      <TituloPagina titulo="Pedidos" />

      {pedidos.length === 0 ? (
        <Vazio mensagem="Nenhum pedido ainda. Gere um pedido a partir de uma cotação na tela de Cotações." />
      ) : (
        <div className="space-y-3">
          {pedidos.map((p) => (
            <button
              key={p.id}
              className="card w-full text-left transition-shadow hover:shadow-md"
              onClick={() => {
                setSelecionado(p.id);
                setAvisoMock(null);
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{nomeFornecedor(db, p.fornecedor_id)}</p>
                  <p className="text-xs text-slate-500">Criado em {dataHoraBR(p.criado_em)}</p>
                </div>
                {verValores && <p className="text-lg font-bold">{moeda(p.valor_total)}</p>}
              </div>
              <div className="mt-3">
                <EtapasPedido status={p.status} />
              </div>
            </button>
          ))}
        </div>
      )}

      {pedido && (
        <Modal aberto titulo={`Pedido — ${nomeFornecedor(db, pedido.fornecedor_id)}`} onFechar={fechar}>
          <div className="mb-4">
            <EtapasPedido status={pedido.status} />
          </div>

          <p className="mb-1 text-xs text-slate-500">Criado em {dataHoraBR(pedido.criado_em)}</p>
          {pedido.aprovado_por && (
            <p className="mb-1 text-xs text-slate-500">
              Aprovado por {nomePerfil(db, pedido.aprovado_por)} em {dataHoraBR(pedido.aprovado_em)}
            </p>
          )}

          {avisoMock && (
            <div className="my-3 rounded-card bg-sucesso-clara px-3 py-2 text-sm font-medium text-primaria-escura">
              {avisoMock}
            </div>
          )}

          <div className="mt-3">
            <Tabela cabecalho={verValores ? ["Produto", "Qtd", "Preço unit.", "Total"] : ["Produto", "Qtd"]}>
              {itens.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-2">{nomeProduto(db, i.produto_id)}</td>
                  <td className="px-3 py-2">{qtd(i.quantidade, siglaParaItem(db, i.produto_id, i.unidade_id))}</td>
                  {verValores && <td className="px-3 py-2">{moeda(i.preco_unitario)}</td>}
                  {verValores && (
                    <td className="px-3 py-2 font-semibold">{moeda(i.preco_unitario * i.quantidade)}</td>
                  )}
                </tr>
              ))}
              {verValores && (
                <tr className="border-t-2 border-slate-200">
                  <td className="px-3 py-2 font-bold" colSpan={3}>
                    Total do pedido
                  </td>
                  <td className="px-3 py-2 font-bold">{moeda(pedido.valor_total)}</td>
                </tr>
              )}
            </Tabela>
          </div>

          {verValores && pedido.analise_ia && (
            <div className="mt-4 rounded-card border-2 border-destaque bg-destaque-clara/40 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-destaque">
                <Sparkles className="h-4 w-4" /> Análise da IA
              </p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{pedido.analise_ia}</p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {pedido.status === "aguardando_aprovacao" && (
              <>
                {donoAprova ? (
                  <button
                    className="btn-primario"
                    onClick={() =>
                      atualizarStatus(
                        pedido.id,
                        "aprovado",
                        { aprovado_por: "perfil-dono", aprovado_em: new Date().toISOString() },
                        "Pedido aprovado!"
                      )
                    }
                  >
                    Aprovar pedido
                  </button>
                ) : (
                  <p className="text-sm text-slate-500">Aguardando aprovação do dono.</p>
                )}
                {verValores && (
                  <button
                    className="btn-perigo"
                    onClick={() => atualizarStatus(pedido.id, "cancelado", undefined, "Pedido cancelado.")}
                  >
                    Cancelar
                  </button>
                )}
              </>
            )}

            {pedido.status === "aprovado" && verValores && (
              <>
                <button
                  className="btn-primario"
                  onClick={() =>
                    atualizarStatus(
                      pedido.id,
                      "enviado",
                      undefined,
                      "Pedido enviado ao fornecedor por WhatsApp (simulado)."
                    )
                  }
                >
                  Marcar como enviado
                </button>
                <button
                  className="btn-perigo"
                  onClick={() => atualizarStatus(pedido.id, "cancelado", undefined, "Pedido cancelado.")}
                >
                  Cancelar
                </button>
              </>
            )}

            {pedido.status === "enviado" && verValores && (
              <button
                className="btn-primario"
                onClick={() =>
                  atualizarStatus(pedido.id, "confirmado", undefined, "Confirmação do fornecedor registrada.")
                }
              >
                Fornecedor confirmou
              </button>
            )}

            {pedido.status === "confirmado" && verValores && (
              <button
                className="btn-primario"
                onClick={() =>
                  atualizarStatus(pedido.id, "entregue", undefined, "Pedido marcado como entregue.")
                }
              >
                Marcar como entregue
              </button>
            )}

            <button className="btn-secundario ml-auto" onClick={fechar}>
              Fechar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
