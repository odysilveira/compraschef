"use client";

// Aba Fornecedores — requisito 1.

import { useState, type FormEvent } from "react";
import { Building2, Link2, Pencil, Plus, X } from "lucide-react";
import { Badge, Campo, Modal, StatCard, Tabela, Vazio } from "@/components/ui";
import { mutate, nomeProduto, uid, useDB } from "@/lib/data";
import { podeVerValores, usePapel } from "@/lib/roles";
import { moeda } from "@/lib/format";
import type { Fornecedor } from "@/lib/types";
import { BarraBusca, contem, numOpcional, RodapeFormulario } from "./comum";

function fornecedorVazio(): Fornecedor {
  return {
    id: "",
    nome: "",
    cnpj: "",
    forma_pagamento: "boleto",
    ativo: true,
  };
}

export function AbaFornecedores() {
  const db = useDB();
  const { papel } = usePapel();
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Fornecedor | null>(null);
  const [produtoParaVincular, setProdutoParaVincular] = useState("");
  // Produtos marcados durante um cadastro NOVO (gravados junto no Salvar)
  const [produtosNovos, setProdutosNovos] = useState<string[]>([]);

  const lista = db.fornecedores
    .filter((f) => f.ativo)
    .filter((f) => contem(busca, f.nome, f.cnpj, f.whatsapp, f.contato_nome, f.codigo_externo))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  function alterar(mudanca: Partial<Fornecedor>) {
    setForm((atual) => (atual ? { ...atual, ...mudanca } : atual));
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    mutate((banco) => {
      if (form.id) {
        const i = banco.fornecedores.findIndex((f) => f.id === form.id);
        if (i >= 0) banco.fornecedores[i] = form;
      } else {
        const novoId = uid("forn");
        banco.fornecedores.push({ ...form, id: novoId });
        // Grava os produtos marcados durante o cadastro
        for (const produtoId of produtosNovos) {
          banco.fornecedor_produtos.push({ id: uid("fp"), fornecedor_id: novoId, produto_id: produtoId });
        }
      }
    });
    setForm(null);
    setProdutosNovos([]);
  }

  function excluir() {
    if (!form?.id) return;
    if (!window.confirm(`Desativar o fornecedor "${form.nome}"? Ele sai das listas, mas o histórico é mantido.`)) return;
    mutate((banco) => {
      const f = banco.fornecedores.find((x) => x.id === form.id);
      if (f) f.ativo = false;
    });
    setForm(null);
  }

  function vincularProduto() {
    if (!form || !produtoParaVincular) return;
    const produtoId = produtoParaVincular;
    if (form.id) {
      const fornecedorId = form.id;
      mutate((banco) => {
        const jaExiste = banco.fornecedor_produtos.some(
          (fp) => fp.fornecedor_id === fornecedorId && fp.produto_id === produtoId
        );
        if (!jaExiste) {
          banco.fornecedor_produtos.push({ id: uid("fp"), fornecedor_id: fornecedorId, produto_id: produtoId });
        }
      });
    } else {
      // Cadastro novo: guarda localmente até o Salvar
      setProdutosNovos((atual) => (atual.includes(produtoId) ? atual : [...atual, produtoId]));
    }
    setProdutoParaVincular("");
  }

  function desvincularProduto(fpId: string, nome: string) {
    if (!window.confirm(`Remover "${nome}" da lista de produtos deste fornecedor?`)) return;
    mutate((banco) => {
      banco.fornecedor_produtos = banco.fornecedor_produtos.filter((fp) => fp.id !== fpId);
    });
  }

  const vinculos = form?.id
    ? db.fornecedor_produtos
        .filter((fp) => fp.fornecedor_id === form.id)
        .sort((a, b) => nomeProduto(db, a.produto_id).localeCompare(nomeProduto(db, b.produto_id), "pt-BR"))
    : [];
  const produtosDisponiveis = form
    ? db.produtos
        .filter(
          (p) =>
            p.ativo &&
            !vinculos.some((fp) => fp.produto_id === p.id) &&
            !produtosNovos.includes(p.id)
        )
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    : [];

  const total = db.fornecedores.length;
  const ativos = db.fornecedores.filter((f) => f.ativo).length;
  const semWhatsapp = db.fornecedores.filter((f) => f.ativo && !f.whatsapp).length;
  const porBoleto = db.fornecedores.filter((f) => f.ativo && f.forma_pagamento === "boleto").length;

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard rotulo="Total" valor={total} cor="cinza" />
        <StatCard rotulo="Ativos" valor={ativos} subtexto={`${total - ativos} inativo${total - ativos === 1 ? "" : "s"}`} cor="verde" />
        <StatCard rotulo="Pagam por boleto" valor={porBoleto} subtexto="atenção às datas" cor="laranja" />
        <StatCard rotulo="Sem WhatsApp" valor={semWhatsapp} subtexto="cadastro incompleto" cor="amarelo" />
      </div>

      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <BarraBusca valor={busca} onMudar={setBusca} placeholder="Buscar por nome, CNPJ, contato…" />
        <button
          className="btn-primario mb-4"
          onClick={() => {
            setProdutosNovos([]);
            setForm(fornecedorVazio());
          }}
        >
          <Plus size={16} /> Novo fornecedor
        </button>
      </div>

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhum fornecedor encontrado." />
      ) : (
        <div className="card p-0 sm:p-2">
          <Tabela cabecalho={["Fornecedor", "CNPJ", "WhatsApp", "Forma de pagamento", "Prazo de entrega", "Status", ""]}>
            {lista.map((f) => (
              <tr
                key={f.id}
                className="cursor-pointer transition-colors hover:bg-stone-50"
                onClick={() => setForm({ ...f })}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primaria-clara text-primaria-escura">
                      <Building2 size={15} />
                    </span>
                    <span>
                      <span className="block font-medium">{f.nome}</span>
                      {f.contato_nome && <span className="block text-xs text-stone-500">{f.contato_nome}</span>}
                    </span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-stone-600">{f.cnpj}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-stone-600">{f.whatsapp ?? "—"}</td>
                <td className="px-3 py-2.5">
                  {f.forma_pagamento === "boleto" ? (
                    <Badge cor="azul">Boleto{f.prazo_boleto_dias ? ` · ${f.prazo_boleto_dias} dias` : ""}</Badge>
                  ) : (
                    <Badge cor="verde">Pix</Badge>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-stone-600">
                  {f.prazo_entrega_dias !== undefined
                    ? `${f.prazo_entrega_dias} dia${f.prazo_entrega_dias === 1 ? "" : "s"}`
                    : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <Badge cor="verde">Ativo</Badge>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-texto"
                    aria-label={`Editar ${f.nome}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setForm({ ...f });
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      <Modal
        aberto={form !== null}
        titulo={form?.id ? "Editar fornecedor" : "Novo fornecedor"}
        onFechar={() => {
          setForm(null);
          setProdutosNovos([]);
        }}
      >
        {form && (
          <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Campo rotulo="Nome *">
                <input
                  className="campo"
                  required
                  value={form.nome}
                  onChange={(e) => alterar({ nome: e.target.value })}
                />
              </Campo>
            </div>
            <Campo rotulo="CNPJ *">
              <input
                className="campo"
                required
                placeholder="00.000.000/0000-00"
                value={form.cnpj}
                onChange={(e) => alterar({ cnpj: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Código no ERP parceiro">
              <input
                className="campo"
                placeholder="ex.: F001"
                value={form.codigo_externo ?? ""}
                onChange={(e) => alterar({ codigo_externo: e.target.value || undefined })}
              />
            </Campo>
            <Campo rotulo="WhatsApp">
              <input
                className="campo"
                placeholder="(11) 90000-0000"
                value={form.whatsapp ?? ""}
                onChange={(e) => alterar({ whatsapp: e.target.value || undefined })}
              />
            </Campo>
            <Campo rotulo="Telefone (ligações)">
              <input
                className="campo"
                placeholder="(11) 3000-0000"
                value={form.telefone ?? ""}
                onChange={(e) => alterar({ telefone: e.target.value || undefined })}
              />
            </Campo>
            <Campo rotulo="E-mail">
              <input
                type="email"
                className="campo"
                value={form.email ?? ""}
                onChange={(e) => alterar({ email: e.target.value || undefined })}
              />
            </Campo>
            <Campo rotulo="Pessoa de contato">
              <input
                className="campo"
                value={form.contato_nome ?? ""}
                onChange={(e) => alterar({ contato_nome: e.target.value || undefined })}
              />
            </Campo>
            <Campo rotulo="Prazo de entrega (dias)">
              <input
                type="number"
                min={0}
                className="campo"
                value={form.prazo_entrega_dias ?? ""}
                onChange={(e) => alterar({ prazo_entrega_dias: numOpcional(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Pedido mínimo (R$)">
              <input
                type="number"
                min={0}
                step="0.01"
                className="campo"
                value={form.pedido_minimo ?? ""}
                onChange={(e) => alterar({ pedido_minimo: numOpcional(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Dias de atendimento">
              <input
                className="campo"
                placeholder="ex.: seg a sex"
                value={form.dias_atendimento ?? ""}
                onChange={(e) => alterar({ dias_atendimento: e.target.value || undefined })}
              />
            </Campo>
            <Campo rotulo="Horário de atendimento">
              <input
                className="campo"
                placeholder="ex.: 08h às 17h"
                value={form.horario_atendimento ?? ""}
                onChange={(e) => alterar({ horario_atendimento: e.target.value || undefined })}
              />
            </Campo>
            <Campo rotulo="Forma de pagamento *">
              <select
                className="campo"
                value={form.forma_pagamento}
                onChange={(e) =>
                  alterar({
                    forma_pagamento: e.target.value as Fornecedor["forma_pagamento"],
                    ...(e.target.value === "pix" ? { prazo_boleto_dias: undefined } : {}),
                  })
                }
              >
                <option value="boleto">Boleto</option>
                <option value="pix">Pix</option>
              </select>
            </Campo>
            {form.forma_pagamento === "boleto" && (
              <Campo rotulo="Prazo do boleto (dias)">
                <input
                  type="number"
                  min={0}
                  className="campo"
                  value={form.prazo_boleto_dias ?? ""}
                  onChange={(e) => alterar({ prazo_boleto_dias: numOpcional(e.target.value) })}
                />
              </Campo>
            )}

            <div className="rounded-card border border-stone-200 p-3 sm:col-span-2">
              <h2 className="mb-1 text-base">O que este fornecedor vende</h2>
              <p className="mb-2 text-xs text-stone-500">
                Usado para sugerir este fornecedor nas cotações. As respostas de cotação também alimentam esta
                lista sozinhas.
                {!form.id && " Os produtos marcados serão gravados junto quando você salvar."}
              </p>

              {form.id ? (
                vinculos.length === 0 ? (
                  <p className="mb-3 text-sm text-stone-500">Nenhum produto vinculado ainda.</p>
                ) : (
                  <ul className="mb-3 divide-y divide-stone-100">
                    {vinculos.map((fp) => (
                      <li key={fp.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                        <span className="min-w-0 truncate font-medium">{nomeProduto(db, fp.produto_id)}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {podeVerValores(papel) && fp.ultimo_preco !== undefined && (
                            <span className="text-xs text-stone-500">último preço {moeda(fp.ultimo_preco)}</span>
                          )}
                          <button
                            type="button"
                            className="rounded-full p-1 text-stone-400 hover:bg-erro-clara hover:text-erro"
                            title="Remover produto"
                            aria-label={`Remover ${nomeProduto(db, fp.produto_id)}`}
                            onClick={() => desvincularProduto(fp.id, nomeProduto(db, fp.produto_id))}
                          >
                            <X size={16} />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )
              ) : produtosNovos.length === 0 ? (
                <p className="mb-3 text-sm text-stone-500">Nenhum produto marcado ainda.</p>
              ) : (
                <ul className="mb-3 divide-y divide-stone-100">
                  {produtosNovos.map((produtoId) => (
                    <li key={produtoId} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                      <span className="min-w-0 truncate font-medium">{nomeProduto(db, produtoId)}</span>
                      <button
                        type="button"
                        className="rounded-full p-1 text-stone-400 hover:bg-erro-clara hover:text-erro"
                        title="Remover produto"
                        aria-label={`Remover ${nomeProduto(db, produtoId)}`}
                        onClick={() => setProdutosNovos((atual) => atual.filter((id) => id !== produtoId))}
                      >
                        <X size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {produtosDisponiveis.length > 0 && (
                <div className="flex gap-2">
                  <select
                    className="campo"
                    value={produtoParaVincular}
                    onChange={(e) => setProdutoParaVincular(e.target.value)}
                  >
                    <option value="">Adicionar produto…</option>
                    {produtosDisponiveis.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                        {p.categoria ? ` (${p.categoria})` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn-secundario shrink-0"
                    disabled={!produtoParaVincular}
                    onClick={vincularProduto}
                  >
                    <Link2 size={16} /> Vincular
                  </button>
                </div>
              )}
            </div>

            <div className="sm:col-span-2">
              <RodapeFormulario onExcluir={form.id ? excluir : undefined} rotuloExcluir="Desativar" />
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
