"use client";

// Aba Produtos — requisitos 2 e 3 (vínculo fornecedor × produto).

import { useState, type FormEvent } from "react";
import { Link2, Plus, X } from "lucide-react";
import { Badge, Campo, Modal, Tabela, Vazio } from "@/components/ui";
import { estoqueAtual, mutate, nomeFornecedor, siglaUnidadeUso, uid, useDB } from "@/lib/data";
import { podeVerValores, usePapel } from "@/lib/roles";
import { dataBR, moeda, qtd } from "@/lib/format";
import type { Produto, TipoProduto } from "@/lib/types";
import { BarraBusca, contem, numOpcional, RodapeFormulario } from "./comum";

function produtoVazio(unidadePadraoId: string): Produto {
  return {
    id: "",
    nome: "",
    tipo: "comprado",
    unidade_uso_id: unidadePadraoId,
    fator_conversao: 1,
    estoque_minimo: 0,
    ativo: true,
  };
}

export function AbaProdutos() {
  const db = useDB();
  const { papel } = usePapel();
  const mostrarPrecos = podeVerValores(papel);
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Produto | null>(null);
  const [fornecedorParaVincular, setFornecedorParaVincular] = useState("");

  const lista = db.produtos
    .filter((p) => p.ativo)
    .filter((p) => contem(busca, p.nome, p.categoria, p.codigo_externo, p.codigo_barras))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  function alterar(mudanca: Partial<Produto>) {
    setForm((atual) => (atual ? { ...atual, ...mudanca } : atual));
  }

  function abrir(p: Produto | null) {
    setFornecedorParaVincular("");
    setForm(p ? { ...p } : produtoVazio(db.unidades[0]?.id ?? ""));
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    mutate((banco) => {
      if (form.id) {
        const i = banco.produtos.findIndex((p) => p.id === form.id);
        if (i >= 0) banco.produtos[i] = form;
      } else {
        banco.produtos.push({ ...form, id: uid("prod") });
      }
    });
    setForm(null);
  }

  function excluir() {
    if (!form?.id) return;
    if (!window.confirm(`Desativar o produto "${form.nome}"? Ele sai das listas, mas o histórico é mantido.`)) return;
    mutate((banco) => {
      const p = banco.produtos.find((x) => x.id === form.id);
      if (p) p.ativo = false;
    });
    setForm(null);
  }

  function vincularFornecedor() {
    if (!form?.id || !fornecedorParaVincular) return;
    const produtoId = form.id;
    const fornecedorId = fornecedorParaVincular;
    mutate((banco) => {
      const jaExiste = banco.fornecedor_produtos.some(
        (fp) => fp.produto_id === produtoId && fp.fornecedor_id === fornecedorId
      );
      if (!jaExiste) {
        banco.fornecedor_produtos.push({ id: uid("fp"), fornecedor_id: fornecedorId, produto_id: produtoId });
      }
    });
    setFornecedorParaVincular("");
  }

  function desvincularFornecedor(fpId: string, nome: string) {
    if (!window.confirm(`Desvincular o fornecedor "${nome}" deste produto?`)) return;
    mutate((banco) => {
      banco.fornecedor_produtos = banco.fornecedor_produtos.filter((fp) => fp.id !== fpId);
    });
  }

  const vinculos = form?.id ? db.fornecedor_produtos.filter((fp) => fp.produto_id === form.id) : [];
  const fornecedoresDisponiveis = form?.id
    ? db.fornecedores.filter(
        (f) => f.ativo && !vinculos.some((fp) => fp.fornecedor_id === f.id)
      )
    : [];

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <BarraBusca valor={busca} onMudar={setBusca} placeholder="Buscar por nome, categoria, código…" />
        <button className="btn-primario mb-4" onClick={() => abrir(null)}>
          <Plus size={16} /> Novo produto
        </button>
      </div>

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhum produto encontrado." />
      ) : (
        <div className="card p-0 sm:p-2">
          <Tabela cabecalho={["Nome", "Categoria", "Tipo", "Estoque atual", "Estoque mínimo"]}>
            {lista.map((p) => {
              const estoque = estoqueAtual(db, p.id);
              const sigla = siglaUnidadeUso(db, p.id);
              const abaixo = estoque < p.estoque_minimo;
              return (
                <tr
                  key={p.id}
                  className="cursor-pointer transition-colors hover:bg-slate-50"
                  onClick={() => abrir(p)}
                >
                  <td className="px-3 py-2.5 font-medium">{p.nome}</td>
                  <td className="px-3 py-2.5">{p.categoria ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    {p.tipo === "comprado" ? <Badge cor="azul">Comprado</Badge> : <Badge cor="verde">Produzido</Badge>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {abaixo ? (
                      <Badge cor="laranja">{qtd(estoque, sigla)} · abaixo do mínimo</Badge>
                    ) : (
                      qtd(estoque, sigla)
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">{qtd(p.estoque_minimo, sigla)}</td>
                </tr>
              );
            })}
          </Tabela>
        </div>
      )}

      <Modal
        aberto={form !== null}
        titulo={form?.id ? "Editar produto" : "Novo produto"}
        onFechar={() => setForm(null)}
      >
        {form && (
          <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Campo rotulo="Nome *">
                <input className="campo" required value={form.nome} onChange={(e) => alterar({ nome: e.target.value })} />
              </Campo>
            </div>
            <Campo rotulo="Código no ERP parceiro">
              <input
                className="campo"
                placeholder="ex.: P101"
                value={form.codigo_externo ?? ""}
                onChange={(e) => alterar({ codigo_externo: e.target.value || undefined })}
              />
            </Campo>
            <Campo rotulo="Categoria">
              <input
                className="campo"
                placeholder="ex.: hortifrúti"
                value={form.categoria ?? ""}
                onChange={(e) => alterar({ categoria: e.target.value || undefined })}
              />
            </Campo>
            <Campo rotulo="Tipo *">
              <select
                className="campo"
                value={form.tipo}
                onChange={(e) => alterar({ tipo: e.target.value as TipoProduto })}
              >
                <option value="comprado">Comprado</option>
                <option value="produzido">Produzido na casa</option>
              </select>
            </Campo>
            <Campo rotulo="Código de barras">
              <input
                className="campo"
                value={form.codigo_barras ?? ""}
                onChange={(e) => alterar({ codigo_barras: e.target.value || undefined })}
              />
            </Campo>
            <Campo rotulo="Unidade de compra">
              <select
                className="campo"
                value={form.unidade_compra_id ?? ""}
                onChange={(e) => alterar({ unidade_compra_id: e.target.value || undefined })}
              >
                <option value="">— nenhuma —</option>
                {db.unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} ({u.sigla})
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Unidade de uso *">
              <select
                className="campo"
                required
                value={form.unidade_uso_id}
                onChange={(e) => alterar({ unidade_uso_id: e.target.value })}
              >
                {db.unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} ({u.sigla})
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Fator de conversão *">
              <input
                type="number"
                min={0}
                step="any"
                required
                className="campo"
                value={form.fator_conversao}
                onChange={(e) => alterar({ fator_conversao: numOpcional(e.target.value) ?? 1 })}
              />
            </Campo>
            <Campo rotulo="Estoque mínimo (na unid. de uso) *">
              <input
                type="number"
                min={0}
                step="any"
                required
                className="campo"
                value={form.estoque_minimo}
                onChange={(e) => alterar({ estoque_minimo: numOpcional(e.target.value) ?? 0 })}
              />
            </Campo>
            <Campo rotulo="Validade padrão (dias)">
              <input
                type="number"
                min={0}
                className="campo"
                value={form.validade_padrao_dias ?? ""}
                onChange={(e) => alterar({ validade_padrao_dias: numOpcional(e.target.value) })}
              />
            </Campo>
            <p className="text-xs text-slate-500 sm:col-span-2">
              1 unidade de compra = {form.fator_conversao || "?"} unidade(s) de uso.
            </p>

            {form.id ? (
              <div className="rounded-card border border-slate-200 p-3 sm:col-span-2">
                <h2 className="mb-2 text-base">Quem vende este produto</h2>
                {vinculos.length === 0 ? (
                  <p className="mb-3 text-sm text-slate-500">Nenhum fornecedor vinculado ainda.</p>
                ) : (
                  <ul className="mb-3 divide-y divide-slate-100">
                    {vinculos.map((fp) => (
                      <li key={fp.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="font-medium">{nomeFornecedor(db, fp.fornecedor_id)}</span>
                        <span className="flex items-center gap-2">
                          {mostrarPrecos && (
                            <span className="text-slate-600">
                              {fp.ultimo_preco !== undefined ? (
                                <>
                                  {moeda(fp.ultimo_preco)}
                                  {fp.atualizado_em ? (
                                    <span className="text-xs text-slate-400"> em {dataBR(fp.atualizado_em)}</span>
                                  ) : null}
                                </>
                              ) : (
                                "sem preço"
                              )}
                            </span>
                          )}
                          <button
                            type="button"
                            className="rounded-full p-1 text-slate-400 hover:bg-erro-clara hover:text-erro"
                            title="Desvincular fornecedor"
                            aria-label="Desvincular fornecedor"
                            onClick={() => desvincularFornecedor(fp.id, nomeFornecedor(db, fp.fornecedor_id))}
                          >
                            <X size={16} />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {fornecedoresDisponiveis.length > 0 && (
                  <div className="flex items-center gap-2">
                    <select
                      className="campo flex-1"
                      value={fornecedorParaVincular}
                      onChange={(e) => setFornecedorParaVincular(e.target.value)}
                    >
                      <option value="">Escolher fornecedor…</option>
                      {fornecedoresDisponiveis.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-secundario"
                      disabled={!fornecedorParaVincular}
                      onClick={vincularFornecedor}
                    >
                      <Link2 size={16} /> Vincular
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 sm:col-span-2">
                Salve o produto para depois vincular os fornecedores que o vendem.
              </p>
            )}

            <div className="sm:col-span-2">
              <RodapeFormulario onExcluir={form.id ? excluir : undefined} rotuloExcluir="Desativar" />
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
