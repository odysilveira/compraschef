"use client";

// Aba Produtos — requisitos 2 e 3 (vínculo fornecedor × produto).

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link2, Plus, X } from "lucide-react";
import CodeScanner from "@/components/scanner/CodeScanner";
import { Badge, Campo, Modal, Tabela, Vazio } from "@/components/ui";
import { estoqueAtual, mutate, nomeFornecedor, precoMedioHistorico, siglaUnidadeUso, uid, useDB } from "@/lib/data";
import { podeVerValores, usePapel } from "@/lib/roles";
import { dataBR, moeda, qtd } from "@/lib/format";
import type { CategoriaProduto, Produto, TipoProduto, ProdutoCodigoBarras } from "@/lib/types";
import { associarCategoriasProdutos } from "@/lib/domain/produtos";
import { BarraBusca, contem, numOpcional, RodapeFormulario } from "./comum";

function produtoVazio(unidadePadraoId: string): Produto {
  return {
    id: "",
    nome: "",
    tipo: "comprado",
    unidade_uso_id: unidadePadraoId,
    fator_conversao: 1,
    estoque_minimo: 0,
    controla_lote: false,
    controla_validade: false,
    validade_padrao_dias: 30,
    ativo: true,
  };
}

export function AbaProdutos({ produtoParaAbrirId }: { produtoParaAbrirId?: string } = {}) {
  const db = useDB();
  const { papel } = usePapel();
  const mostrarPrecos = podeVerValores(papel);
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Produto | null>(null);
  const [codigoBarrasForm, setCodigoBarrasForm] = useState<ProdutoCodigoBarras[]>([]);
  const [novoCodigoBarras, setNovoCodigoBarras] = useState("");
  const [fornecedorParaVincular, setFornecedorParaVincular] = useState("");
  const produtoAbertoPorUrl = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!produtoParaAbrirId) {
      produtoAbertoPorUrl.current = undefined;
      return;
    }
    // Evita reabrir (e zerar o select de vínculo) a cada atualização do DB.
    if (produtoAbertoPorUrl.current === produtoParaAbrirId) return;
    const produto = db.produtos.find((p) => p.id === produtoParaAbrirId);
    if (produto) {
      produtoAbertoPorUrl.current = produtoParaAbrirId;
      abrir(produto);
    }
  }, [produtoParaAbrirId, db.produtos]);

  const categorias = Array.isArray(db.categorias_produtos) ? db.categorias_produtos : [];
  const lista = db.produtos
    .filter((p) => p.ativo)
    .filter((p) => {
      const codigos = (Array.isArray(db.produto_codigos_barras) ? db.produto_codigos_barras : [])
        .filter((c) => c.produto_id === p.id)
        .map((c) => c.codigo_barras)
        .join(" ");
      return contem(busca, p.nome, p.categoria, p.codigo_externo, p.codigo_barras, codigos);
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  function alterar(mudanca: Partial<Produto>) {
    setForm((atual) => (atual ? { ...atual, ...mudanca } : atual));
  }

  function abrir(p: Produto | null) {
    if (!p) {
      const categoriaPadrao = categorias.find((c) => c.codigo === "sem-categoria")?.id;
      setForm({ ...produtoVazio(db.unidades[0]?.id ?? ""), categoria_id: categoriaPadrao });
      setCodigoBarrasForm([]);
      setNovoCodigoBarras("");
      return;
    }
    const codigos = (Array.isArray(db.produto_codigos_barras) ? db.produto_codigos_barras : []).filter((c) => c.produto_id === p.id);
    const codigoPadrao = codigos.length
      ? codigos
      : p.codigo_barras
      ? [{ id: `pcb-${p.id}`, produto_id: p.id, codigo_barras: p.codigo_barras, principal: true }]
      : [];
    const principalCodigo = codigoPadrao.find((c) => c.principal)?.codigo_barras;
    setFornecedorParaVincular("");
    setForm({ ...p, codigo_barras: principalCodigo ?? p.codigo_barras });
    setCodigoBarrasForm(codigoPadrao);
    setNovoCodigoBarras("");
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    mutate((banco) => {
      const categoriaSelecionada = form.categoria_id
        ? banco.categorias_produtos.find((c) => c.id === form.categoria_id)
        : undefined;
      const produtoId = form.id || uid("prod");
      const codigos = codigoBarrasForm.length
        ? codigoBarrasForm
        : form.codigo_barras
        ? [{ id: `pcb-${produtoId}-${Date.now()}`, produto_id: produtoId, codigo_barras: form.codigo_barras, principal: true }]
        : [];
      const principalCodigo = codigos.find((c) => c.principal)?.codigo_barras ?? form.codigo_barras;
      const produtoParaSalvar = {
        ...form,
        categoria: undefined,
        categoria_id: categoriaSelecionada ? categoriaSelecionada.id : undefined,
        codigo_barras: principalCodigo,
        id: produtoId,
      } as Produto;
      if (form.id) {
        const i = banco.produtos.findIndex((p) => p.id === form.id);
        if (i >= 0) banco.produtos[i] = produtoParaSalvar;
      } else {
        banco.produtos.push(produtoParaSalvar);
      }

      banco.produto_codigos_barras = banco.produto_codigos_barras.filter((c) => c.produto_id !== produtoId);
      if (codigos.length > 0) {
        const principalExists = codigos.some((c) => c.principal);
        if (!principalExists) codigos[0].principal = true;
        for (const codigo of codigos) {
          banco.produto_codigos_barras.push({
            id: codigo.id || uid("pcb"),
            produto_id: produtoId,
            codigo_barras: codigo.codigo_barras,
            principal: codigo.principal,
          });
        }
      }

      associarCategoriasProdutos(banco);
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
  const idsJaVinculados = new Set(vinculos.map((fp) => fp.fornecedor_id));
  const fornecedoresDisponiveis = form?.id
    ? db.fornecedores
        .filter((f) => f.ativo !== false && !idsJaVinculados.has(f.id))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
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
                  <td className="px-3 py-2.5">{categorias.find((c) => c.id === p.categoria_id)?.nome ?? p.categoria ?? "—"}</td>
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
              <select
                className="campo"
                value={form.categoria_id ?? ""}
                onChange={(e) => alterar({ categoria_id: e.target.value || undefined, categoria: undefined })}
              >
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </option>
                ))}
              </select>
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
            <Campo rotulo="Código de barras principal">
              <input
                className="campo"
                value={form.codigo_barras ?? ""}
                onChange={(e) => alterar({ codigo_barras: e.target.value || undefined })}
              />
            </Campo>
            <Campo rotulo="Códigos de barras adicionais">
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,auto]">
                  <input
                    className="campo"
                    placeholder="Adicionar código"
                    value={novoCodigoBarras}
                    onChange={(e) => setNovoCodigoBarras(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() => {
                      const codigo = novoCodigoBarras.trim();
                      if (!codigo) return;
                      setCodigoBarrasForm((atual) =>
                        atual.some((item) => item.codigo_barras === codigo)
                          ? atual
                          : [...atual, { id: uid("pcb"), produto_id: form.id, codigo_barras: codigo, principal: false }]
                      );
                      setNovoCodigoBarras("");
                    }}
                  >
                    Adicionar
                  </button>
                </div>
                <CodeScanner
                  rotulo="Ler código de barras"
                  onLeitura={(codigo) => {
                    if (!codigo) return;
                    setCodigoBarrasForm((atual) =>
                      atual.some((item) => item.codigo_barras === codigo)
                        ? atual
                        : [...atual, { id: uid("pcb"), produto_id: form.id, codigo_barras: codigo, principal: false }]
                    );
                  }}
                />
                <div className="space-y-2">
                  {codigoBarrasForm.map((codigo) => (
                    <div key={codigo.id} className="flex items-center gap-2 rounded-card border border-slate-200 p-2">
                      <input
                        type="radio"
                        name="principal-codigo"
                        checked={codigo.principal}
                        onChange={() =>
                          setCodigoBarrasForm((atual) =>
                            atual.map((item) => ({ ...item, principal: item.id === codigo.id }))
                          )
                        }
                      />
                      <span className="flex-1 text-sm">{codigo.codigo_barras}</span>
                      <button
                        type="button"
                        className="btn-perigo px-2 py-1 text-xs"
                        onClick={() =>
                          setCodigoBarrasForm((atual) => atual.filter((item) => item.id !== codigo.id))
                        }
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              </div>
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
            <Campo rotulo="Fator de correção">
              <input
                type="number"
                min={0}
                step="any"
                className="campo"
                value={form.fator_correcao ?? ""}
                onChange={(e) => alterar({ fator_correcao: numOpcional(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Rendimento (%)">
              <input
                type="number"
                min={0}
                step="any"
                className="campo"
                value={form.rendimento ?? ""}
                onChange={(e) => alterar({ rendimento: numOpcional(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Custo unitário">
              <input
                type="number"
                min={0}
                step="any"
                className="campo"
                value={form.custo_unitario ?? ""}
                onChange={(e) => alterar({ custo_unitario: numOpcional(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Saldo atual">
              <div className="campo h-11 leading-11 text-slate-700">
                {form.id ? qtd(estoqueAtual(db, form.id), siglaUnidadeUso(db, form.id)) : "—"}
              </div>
            </Campo>
            <Campo rotulo="Preço médio histórico">
              <div className="campo h-11 leading-11 text-slate-700">
                {form.id && precoMedioHistorico(db, form.id) !== undefined
                  ? moeda(precoMedioHistorico(db, form.id) ?? 0)
                  : "—"}
              </div>
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
            <Campo rotulo="Controla lote">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.controla_lote ?? false}
                  onChange={(e) => alterar({ controla_lote: e.target.checked })}
                />
                Sim
              </label>
            </Campo>
            <Campo rotulo="Controla validade">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.controla_validade ?? false}
                  onChange={(e) => alterar({ controla_validade: e.target.checked })}
                />
                Sim
              </label>
            </Campo>
            <Campo rotulo="Ponto de pedido">
              <input
                type="number"
                min={0}
                className="campo"
                value={form.ponto_pedido ?? ""}
                onChange={(e) => alterar({ ponto_pedido: numOpcional(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Estoque máximo">
              <input
                type="number"
                min={0}
                className="campo"
                value={form.estoque_maximo ?? ""}
                onChange={(e) => alterar({ estoque_maximo: numOpcional(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Consumo médio mensal">
              <input
                type="number"
                min={0}
                className="campo"
                value={form.consumo_medio_mensal ?? ""}
                onChange={(e) => alterar({ consumo_medio_mensal: numOpcional(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Fornecedor padrão">
              <select
                className="campo"
                value={form.fornecedor_padrao_id ?? ""}
                onChange={(e) => alterar({ fornecedor_padrao_id: e.target.value || undefined })}
              >
                <option value="">— nenhum —</option>
                {db.fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Dados fiscais">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  className="campo"
                  placeholder="NCM"
                  value={form.ncm ?? ""}
                  onChange={(e) => alterar({ ncm: e.target.value || undefined })}
                />
                <input
                  className="campo"
                  placeholder="CEST"
                  value={form.cest ?? ""}
                  onChange={(e) => alterar({ cest: e.target.value || undefined })}
                />
                <input
                  className="campo"
                  placeholder="Origem da mercadoria"
                  value={form.origem_mercadoria ?? ""}
                  onChange={(e) => alterar({ origem_mercadoria: e.target.value || undefined })}
                />
                <input
                  className="campo"
                  placeholder="CFOP padrão"
                  value={form.cfop_padrao ?? ""}
                  onChange={(e) => alterar({ cfop_padrao: e.target.value || undefined })}
                />
              </div>
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
                          {f.cnpj ? ` · ${f.cnpj}` : ""}
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
                {fornecedoresDisponiveis.length === 0 && (
                  <p className="text-xs text-slate-500">
                    {vinculos.length > 0
                      ? "Todos os fornecedores ativos já estão vinculados. Cadastre um novo em Cadastros → Fornecedores."
                      : "Nenhum fornecedor cadastrado ainda. Cadastre em Cadastros → Fornecedores."}
                  </p>
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
