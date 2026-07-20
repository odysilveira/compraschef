"use client";

// Lista de Compras (requisitos 7–9): geração automática pelo estoque mínimo,
// edição do rascunho e confirmação que dispara cotações por fornecedor.

import { useState } from "react";
import { FilePlus2, Plus, Sparkles, Store, Trash2 } from "lucide-react";
import { Badge, Card, Modal, Tabela, TituloPagina, Vazio } from "@/components/ui";
import {
  estoqueAtual,
  mutate,
  nomeFornecedor,
  nomePerfil,
  nomeProduto,
  produtosAbaixoDoMinimo,
  siglaParaItem,
  siglaUnidadeUso,
  uid,
  useDB,
} from "@/lib/data";
import { usePapel } from "@/lib/roles";
import { dataHoraBR, qtd } from "@/lib/format";
import type { ListaItem, StatusLista } from "@/lib/types";

const STATUS_LISTA: Record<StatusLista, { rotulo: string; cor: "verde" | "laranja" | "cinza" | "azul" }> = {
  rascunho: { rotulo: "Rascunho", cor: "cinza" },
  confirmada: { rotulo: "Confirmada", cor: "azul" },
  em_cotacao: { rotulo: "Em cotação", cor: "laranja" },
  finalizada: { rotulo: "Finalizada", cor: "verde" },
};

export default function ListaComprasPage() {
  const db = useDB();
  const { papel } = usePapel();
  const [aviso, setAviso] = useState<string | null>(null);
  const [escolhendoLista, setEscolhendoLista] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});

  const listas = [...db.listas_compras].sort((a, b) => b.criada_em.localeCompare(a.criada_em));

  function gerarListaAutomatica() {
    const abaixo = produtosAbaixoDoMinimo(db);
    if (abaixo.length === 0) {
      setAviso("Nenhum produto abaixo do estoque mínimo agora — tudo em ordem!");
      return;
    }
    mutate((d) => {
      const listaId = uid("lista");
      d.listas_compras.push({
        id: listaId,
        status: "rascunho",
        gerada_automaticamente: true,
        criada_por: `perfil-${papel}`,
        criada_em: new Date().toISOString(),
      });
      for (const { produto, estoque } of abaixo) {
        d.lista_itens.push({
          id: uid("li"),
          lista_id: listaId,
          produto_id: produto.id,
          quantidade: Math.max(1, Math.ceil(produto.estoque_minimo * 2 - estoque)),
        });
      }
    });
    setAviso(`Lista automática criada com ${abaixo.length} produto${abaixo.length === 1 ? "" : "s"} abaixo do mínimo.`);
  }

  function novaListaManual() {
    mutate((d) => {
      d.listas_compras.push({
        id: uid("lista"),
        status: "rascunho",
        gerada_automaticamente: false,
        criada_por: `perfil-${papel}`,
        criada_em: new Date().toISOString(),
      });
    });
    setAviso("Lista manual criada em branco — adicione os produtos conforme a necessidade.");
  }

  /** Fornecedores cadastrados como vendedores de um produto. */
  function quemVende(produtoId: string): string[] {
    return db.fornecedor_produtos
      .filter((fp) => fp.produto_id === produtoId)
      .map((fp) => nomeFornecedor(db, fp.fornecedor_id))
      .filter((n) => n !== "—")
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function atualizarItem(itemId: string, mudancas: Partial<ListaItem>) {
    mutate((d) => {
      const item = d.lista_itens.find((i) => i.id === itemId);
      if (item) Object.assign(item, mudancas);
    });
  }

  function removerItem(itemId: string) {
    mutate((d) => {
      d.lista_itens = d.lista_itens.filter((i) => i.id !== itemId);
    });
  }

  function adicionarItem(listaId: string, produtoId: string) {
    if (!produtoId) return;
    mutate((d) => {
      d.lista_itens.push({ id: uid("li"), lista_id: listaId, produto_id: produtoId, quantidade: 1 });
    });
  }

  // Quantos itens da lista cada fornecedor vende (pelo cadastro "quem vende o quê")
  function itensQueVende(fornecedorId: string, itens: ListaItem[]): number {
    return itens.filter((i) =>
      db.fornecedor_produtos.some((fp) => fp.fornecedor_id === fornecedorId && fp.produto_id === i.produto_id)
    ).length;
  }

  function abrirEscolhaFornecedores(listaId: string) {
    const itens = db.lista_itens.filter((i) => i.lista_id === listaId);
    const iniciais: Record<string, boolean> = {};
    for (const f of db.fornecedores.filter((x) => x.ativo)) {
      iniciais[f.id] = itensQueVende(f.id, itens) > 0; // sugeridos já vêm marcados
    }
    setSelecionados(iniciais);
    setEscolhendoLista(listaId);
  }

  function confirmarLista(listaId: string, fornecedorIds: string[]) {
    const itens = db.lista_itens.filter((i) => i.lista_id === listaId);
    const agora = new Date().toISOString();
    const prazo = new Date();
    prazo.setDate(prazo.getDate() + 2);
    const prazoISO = prazo.toISOString();

    mutate((d) => {
      const lista = d.listas_compras.find((l) => l.id === listaId);
      if (!lista) return;
      if (fornecedorIds.length === 0) {
        lista.status = "confirmada";
        return;
      }
      lista.status = "em_cotacao";
      for (const fornecedorId of fornecedorIds) {
        const cotacaoId = uid("cot");
        d.cotacoes.push({
          id: cotacaoId,
          lista_id: listaId,
          fornecedor_id: fornecedorId,
          token: uid("tok"),
          status: "enviada",
          prazo_resposta: prazoISO,
          canal: "whatsapp",
          enviada_em: agora,
        });
        // Fornecedor sugerido: recebe só os itens que vende.
        // Fornecedor incluído por você: recebe a lista completa (responde o que tiver).
        const registrados = itens.filter((item) =>
          d.fornecedor_produtos.some(
            (fp) => fp.fornecedor_id === fornecedorId && fp.produto_id === item.produto_id
          )
        );
        const itensDaCotacao = registrados.length > 0 ? registrados : itens;
        for (const item of itensDaCotacao) {
          d.cotacao_itens.push({
            id: uid("ci"),
            cotacao_id: cotacaoId,
            produto_id: item.produto_id,
            quantidade: item.quantidade,
            unidade_id: item.unidade_id,
            disponivel: true,
          });
        }
      }
    });

    setEscolhendoLista(null);
    setAviso(
      fornecedorIds.length === 0
        ? "Lista confirmada sem cotações — nenhum fornecedor foi selecionado."
        : `Lista confirmada! Cotação enviada por WhatsApp para ${fornecedorIds.length} fornecedor${
            fornecedorIds.length === 1 ? "" : "es"
          } (simulado). Acompanhe na tela de Cotações.`
    );
  }

  return (
    <div>
      <TituloPagina
        titulo="Lista de Compras"
        acao={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secundario" onClick={novaListaManual}>
              <FilePlus2 className="h-4 w-4" /> Nova lista manual
            </button>
            <button className="btn-primario" onClick={gerarListaAutomatica}>
              <Sparkles className="h-4 w-4" /> Gerar lista automática
            </button>
          </div>
        }
      />

      {aviso && (
        <div className="mb-4 rounded-card bg-sucesso-clara px-4 py-3 text-sm font-medium text-primaria-escura">
          {aviso}
        </div>
      )}

      {listas.length === 0 ? (
        <Vazio mensagem="Nenhuma lista de compras ainda. Use o botão acima para gerar uma automaticamente." />
      ) : (
        <div className="space-y-4">
          {listas.map((lista) => {
            const itens = db.lista_itens.filter((i) => i.lista_id === lista.id);
            const status = STATUS_LISTA[lista.status];
            const rascunho = lista.status === "rascunho";
            const disponiveis = db.produtos.filter(
              (p) => p.ativo && !itens.some((i) => i.produto_id === p.id)
            );
            return (
              <Card key={lista.id}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2>Lista de {dataHoraBR(lista.criada_em)}</h2>
                    <p className="text-xs text-slate-500">
                      Criada por {nomePerfil(db, lista.criada_por)}
                      {lista.gerada_automaticamente ? " · gerada automaticamente" : " · manual"} ·{" "}
                      {itens.length} {itens.length === 1 ? "item" : "itens"}
                    </p>
                  </div>
                  <Badge cor={status.cor}>{status.rotulo}</Badge>
                </div>

                {rascunho ? (
                  <>
                    {itens.length === 0 ? (
                      <p className="py-3 text-sm text-slate-500">Lista vazia — adicione produtos abaixo.</p>
                    ) : (
                      <Tabela cabecalho={["Produto", "Quantidade e unidade", "Observação", ""]}>
                        {itens.map((item) => {
                          const sigla = siglaUnidadeUso(db, item.produto_id);
                          const produto = db.produtos.find((p) => p.id === item.produto_id);
                          const vendedores = quemVende(item.produto_id);
                          return (
                            <tr key={item.id}>
                              <td className="px-3 py-2">
                                <p className="font-medium">{nomeProduto(db, item.produto_id)}</p>
                                {produto && (
                                  <p className="text-xs text-slate-400">
                                    estoque {qtd(estoqueAtual(db, produto.id), sigla)} · mín.{" "}
                                    {qtd(produto.estoque_minimo, sigla)}
                                  </p>
                                )}
                                {vendedores.length > 0 ? (
                                  <p className="text-xs text-primaria-escura">
                                    <Store size={11} className="mr-1 inline" />
                                    vendem: {vendedores.join(", ")}
                                  </p>
                                ) : (
                                  <p className="text-xs text-destaque">
                                    <Store size={11} className="mr-1 inline" />
                                    nenhum fornecedor vinculado — inclua manualmente na hora de cotar
                                  </p>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min={1}
                                    className="campo !w-24 !py-1.5"
                                    value={item.quantidade}
                                    onChange={(e) =>
                                      atualizarItem(item.id, {
                                        quantidade: Math.max(1, Number(e.target.value) || 1),
                                      })
                                    }
                                  />
                                  <select
                                    className="campo !w-auto !py-1.5"
                                    value={item.unidade_id ?? produto?.unidade_uso_id ?? ""}
                                    onChange={(e) => atualizarItem(item.id, { unidade_id: e.target.value })}
                                    aria-label="Unidade do item"
                                  >
                                    {db.unidades.map((u) => (
                                      <option key={u.id} value={u.id}>
                                        {u.sigla}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  className="campo min-w-[160px] !py-1.5"
                                  placeholder="Ex.: peça limpa, sem cordão"
                                  value={item.observacao ?? ""}
                                  onChange={(e) =>
                                    atualizarItem(item.id, { observacao: e.target.value || undefined })
                                  }
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  className="rounded-full p-1.5 text-erro hover:bg-erro-clara"
                                  onClick={() => removerItem(item.id)}
                                  aria-label="Remover item"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </Tabela>
                    )}

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Plus className="h-4 w-4 text-slate-400" />
                        <select
                          className="campo max-w-xs"
                          value=""
                          onChange={(e) => adicionarItem(lista.id, e.target.value)}
                        >
                          <option value="">Adicionar produto…</option>
                          {disponiveis.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        className="btn-primario"
                        disabled={itens.length === 0}
                        onClick={() => abrirEscolhaFornecedores(lista.id)}
                      >
                        Confirmar lista
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Ao confirmar, você escolhe os fornecedores: os que vendem itens da lista já vêm sugeridos, e
                      você pode incluir outros (prazo de resposta: 2 dias).
                    </p>
                  </>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {itens.map((item) => (
                      <li key={item.id} className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium">{nomeProduto(db, item.produto_id)}</span>
                        <span className="text-slate-500">
                          {qtd(item.quantidade, siglaParaItem(db, item.produto_id, item.unidade_id))}
                        </span>
                        {item.observacao && <span className="text-xs text-slate-400">({item.observacao})</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        aberto={escolhendoLista !== null}
        titulo="Quem vai cotar?"
        onFechar={() => setEscolhendoLista(null)}
      >
        {escolhendoLista &&
          (() => {
            const itens = db.lista_itens.filter((i) => i.lista_id === escolhendoLista);
            const ativos = db.fornecedores.filter((f) => f.ativo);
            const sugeridos = ativos.filter((f) => itensQueVende(f.id, itens) > 0);
            const outros = ativos.filter((f) => itensQueVende(f.id, itens) === 0);
            const totalMarcados = ativos.filter((f) => selecionados[f.id]).length;

            const LinhaFornecedor = ({ id, nome, detalhe }: { id: string; nome: string; detalhe: string }) => (
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-stone-50">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primaria"
                  checked={selecionados[id] ?? false}
                  onChange={(e) => setSelecionados((atual) => ({ ...atual, [id]: e.target.checked }))}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{nome}</span>
                  <span className="block text-xs text-stone-500">{detalhe}</span>
                </span>
              </label>
            );

            return (
              <div className="space-y-4">
                {sugeridos.length > 0 && (
                  <div>
                    <p className="rotulo mb-1 flex items-center gap-1.5">
                      <Sparkles size={13} className="text-primaria-escura" /> Sugeridos pelo sistema
                    </p>
                    {sugeridos.map((f) => {
                      const n = itensQueVende(f.id, itens);
                      return (
                        <LinhaFornecedor
                          key={f.id}
                          id={f.id}
                          nome={f.nome}
                          detalhe={`vende ${n} de ${itens.length} ${itens.length === 1 ? "item" : "itens"} da lista`}
                        />
                      );
                    })}
                  </div>
                )}

                {outros.length > 0 && (
                  <div>
                    <p className="rotulo mb-1 flex items-center gap-1.5">
                      <Store size={13} /> Outros fornecedores
                    </p>
                    {outros.map((f) => (
                      <LinhaFornecedor
                        key={f.id}
                        id={f.id}
                        nome={f.nome}
                        detalhe="sem itens cadastrados — recebe a lista completa e responde o que tiver"
                      />
                    ))}
                  </div>
                )}

                <button
                  className="btn-primario w-full"
                  disabled={totalMarcados === 0}
                  onClick={() =>
                    confirmarLista(
                      escolhendoLista,
                      ativos.filter((f) => selecionados[f.id]).map((f) => f.id)
                    )
                  }
                >
                  Enviar cotações ({totalMarcados})
                </button>
              </div>
            );
          })()}
      </Modal>
    </div>
  );
}
