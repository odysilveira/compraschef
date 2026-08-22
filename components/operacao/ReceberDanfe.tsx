"use client";

/**
 * Recebimento pela DANFE (PDF): painel do PDF ao lado + conferência no estilo do XML
 * (confirmar item, cadastrar produto/fornecedor). Não substitui o XML — itens vêm
 * da leitura do PDF quando possível; o operador confere olhando a imagem.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Building2,
  CircleCheck,
  CircleX,
  FileUp,
  PackagePlus,
  Plus,
} from "lucide-react";
import { Badge, Campo, Card, Modal } from "@/components/ui";
import CampoQuantidade from "@/components/operacao/CampoQuantidade";
import { estoqueAtual, mutate, nomeFornecedor, uid } from "@/lib/data";
import { enviarEstoqueTotal } from "@/lib/integracao";
import { criarLote } from "@/lib/domain/estoque";
import { identificarDanfeDeArquivo } from "@/lib/domain/danfe-captura-browser";
import type { NotaIdentificadaDanfe } from "@/lib/domain/danfe-identificacao";
import { moeda, qtd } from "@/lib/format";
import type { DB, Fornecedor, StatusRecebimento } from "@/lib/types";
import type { ResultadoNota } from "@/components/operacao/ReceberPorNota";

interface ItemConferencia {
  indice: number;
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  valorUnitario?: number;
}

interface DecisaoItem {
  decisao: "pendente" | "confirmado" | "recusado";
  quantidade: number;
  validade: string;
  produtoId: string;
}

function hojeMais(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function somenteDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function formatarCnpj(valor: string): string {
  const n = somenteDigitos(valor).slice(0, 14);
  if (n.length !== 14) return valor;
  return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function casarProduto(db: DB, item: ItemConferencia, fornecedorId?: string): string {
  const porCodigo = db.produtos.find(
    (p) =>
      p.ativo &&
      (p.codigo_externo === item.codigo ||
        p.codigo_barras === item.codigo ||
        (fornecedorId &&
          db.fornecedor_produtos.some(
            (fp) =>
              fp.fornecedor_id === fornecedorId &&
              fp.produto_id === p.id &&
              fp.codigo_produto_fornecedor === item.codigo
          )))
  );
  if (porCodigo) return porCodigo.id;
  const norm = item.descricao.toLowerCase();
  const porNome = db.produtos.find(
    (p) => p.ativo && (p.nome.toLowerCase() === norm || p.nome.toLowerCase().includes(norm.slice(0, 16)))
  );
  return porNome?.id ?? "";
}

export default function ReceberDanfe({
  db,
  usuarioId,
  arquivoInicial,
  onVoltar,
  aoFinalizar,
}: {
  db: DB;
  usuarioId: string;
  arquivoInicial: File;
  onVoltar: () => void;
  aoFinalizar: (resultado: ResultadoNota) => void;
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [lendo, setLendo] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [notaId, setNotaId] = useState<NotaIdentificadaDanfe | null>(null);
  const [nomeEmitente, setNomeEmitente] = useState("");
  const [itens, setItens] = useState<ItemConferencia[]>([]);
  const [decisoes, setDecisoes] = useState<Record<number, DecisaoItem>>({});
  const [fornecedorForm, setFornecedorForm] = useState<Fornecedor | null>(null);
  const [produtoForm, setProdutoForm] = useState<{
    indice: number;
    nome: string;
    codigoExterno: string;
    unidadeCompraId: string;
    unidadeUsoId: string;
    fatorConversao: number;
    estoqueMinimo: number;
    validadePadraoDias: number;
  } | null>(null);
  const [novoItemDesc, setNovoItemDesc] = useState("");
  const [novoItemQtd, setNovoItemQtd] = useState(1);

  const ehPdf =
    arquivoInicial.type === "application/pdf" ||
    arquivoInicial.name.toLowerCase().endsWith(".pdf");

  const fornecedor = useMemo(() => {
    if (!notaId) return undefined;
    return db.fornecedores.find((f) => somenteDigitos(f.cnpj) === notaId.cnpj);
  }, [db.fornecedores, notaId]);

  useEffect(() => {
    const url = URL.createObjectURL(arquivoInicial);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivoInicial]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setLendo(true);
      setErro(null);
      try {
        const resultado = await identificarDanfeDeArquivo(arquivoInicial);
        if (cancelado) return;
        if (!resultado.nota) {
          setErro(resultado.detalhe ?? "Não consegui ler a chave da DANFE neste PDF.");
          setLendo(false);
          return;
        }
        setNotaId(resultado.nota);
        setNomeEmitente(resultado.dados?.nomeEmitente ?? "");
        const extraidos: ItemConferencia[] = (resultado.dados?.itens ?? []).map((it, i) => ({
          indice: i,
          codigo: it.codigo,
          descricao: it.descricao,
          unidade: it.unidade,
          quantidade: it.quantidade,
          valorUnitario: it.valorUnitario,
        }));
        setItens(extraidos);
        const fornId = db.fornecedores.find((f) => somenteDigitos(f.cnpj) === resultado.nota!.cnpj)?.id;
        const inic: Record<number, DecisaoItem> = {};
        for (const item of extraidos) {
          const produto = db.produtos.find((p) => p.id === casarProduto(db, item, fornId));
          inic[item.indice] = {
            decisao: "pendente",
            quantidade: item.quantidade,
            validade: hojeMais(produto?.validade_padrao_dias ?? 30),
            produtoId: produto?.id ?? "",
          };
        }
        setDecisoes(inic);
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Falha ao ler a DANFE.");
      } finally {
        if (!cancelado) setLendo(false);
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arquivoInicial]);

  function alterar(indice: number, mudanca: Partial<DecisaoItem>) {
    setDecisoes((atual) => ({ ...atual, [indice]: { ...atual[indice], ...mudanca } }));
  }

  function adicionarItemManual() {
    if (!novoItemDesc.trim() || novoItemQtd <= 0) return;
    const indice = itens.length === 0 ? 0 : Math.max(...itens.map((i) => i.indice)) + 1;
    const item: ItemConferencia = {
      indice,
      codigo: `manual-${indice}`,
      descricao: novoItemDesc.trim(),
      unidade: "UN",
      quantidade: novoItemQtd,
    };
    setItens((a) => [...a, item]);
    setDecisoes((a) => ({
      ...a,
      [indice]: {
        decisao: "pendente",
        quantidade: novoItemQtd,
        validade: hojeMais(30),
        produtoId: casarProduto(db, item, fornecedor?.id),
      },
    }));
    setNovoItemDesc("");
    setNovoItemQtd(1);
  }

  function abrirCadastroFornecedor() {
    if (!notaId) return;
    setFornecedorForm({
      id: "",
      nome: nomeEmitente || `Fornecedor ${formatarCnpj(notaId.cnpj)}`,
      cnpj: formatarCnpj(notaId.cnpj),
      forma_pagamento: "boleto",
      ativo: true,
    });
  }

  function salvarFornecedor(e: FormEvent) {
    e.preventDefault();
    if (!fornecedorForm) return;
    const id = uid("forn");
    mutate((d) => {
      d.fornecedores.push({ ...fornecedorForm, id });
    });
    setFornecedorForm(null);
  }

  function abrirCadastroProduto(item: ItemConferencia) {
    const un = db.unidades[0]?.id ?? "";
    setProdutoForm({
      indice: item.indice,
      nome: item.descricao,
      codigoExterno: item.codigo.startsWith("manual-") ? "" : item.codigo,
      unidadeCompraId: un,
      unidadeUsoId: un,
      fatorConversao: 1,
      estoqueMinimo: 0,
      validadePadraoDias: 30,
    });
  }

  function salvarProduto(e: FormEvent) {
    e.preventDefault();
    if (!produtoForm || !produtoForm.nome.trim()) return;
    const produtoId = uid("prod");
    const agora = new Date().toISOString();
    mutate((d) => {
      d.produtos.push({
        id: produtoId,
        nome: produtoForm.nome.trim(),
        codigo_externo: produtoForm.codigoExterno.trim() || undefined,
        tipo: "comprado",
        unidade_compra_id: produtoForm.unidadeCompraId || undefined,
        unidade_uso_id: produtoForm.unidadeUsoId,
        fator_conversao: produtoForm.fatorConversao,
        estoque_minimo: produtoForm.estoqueMinimo,
        validade_padrao_dias: produtoForm.validadePadraoDias,
        ativo: true,
      });
      const item = itens.find((i) => i.indice === produtoForm.indice);
      if (item && fornecedor && !item.codigo.startsWith("manual-")) {
        d.fornecedor_produtos.push({
          id: uid("fp"),
          fornecedor_id: fornecedor.id,
          produto_id: produtoId,
          codigo_produto_fornecedor: item.codigo,
          atualizado_em: agora,
        });
      }
    });
    alterar(produtoForm.indice, { produtoId, decisao: "pendente" });
    setProdutoForm(null);
  }

  function finalizar() {
    if (!notaId) return;
    if (!fornecedor) {
      setErro("Cadastre o fornecedor com este CNPJ antes de finalizar.");
      return;
    }
    const pendentes = itens.filter((i) => decisoes[i.indice]?.decisao === "pendente");
    if (pendentes.length > 0) {
      setErro(`Ainda faltam decidir ${pendentes.length} item(ns).`);
      return;
    }
    const confirmados = itens.filter((i) => decisoes[i.indice]?.decisao === "confirmado");
    if (confirmados.length === 0) {
      setErro("Confirme ao menos um item para finalizar.");
      return;
    }

    const agora = new Date().toISOString();
    const hoje = agora.slice(0, 10);
    const status: StatusRecebimento = "ok";
    const fornId = fornecedor.id;
    const pedido = db.pedidos.find(
      (p) => p.fornecedor_id === fornId && (p.status === "enviado" || p.status === "confirmado")
    );

    const valorTotal = confirmados.reduce((s, item) => {
      const dec = decisoes[item.indice];
      return s + (item.valorUnitario ?? 0) * (dec?.quantidade ?? item.quantidade);
    }, 0);

    const nfId = uid("nf");
    const recebimentoId = uid("rec");

    const dbNovo = mutate((d) => {
      d.notas_fiscais.unshift({
        id: nfId,
        fornecedor_id: fornId,
        pedido_id: pedido?.id,
        numero: notaId.numero,
        chave_acesso: notaId.chave,
        cnpj_emitente: formatarCnpj(notaId.cnpj),
        razao_social_emitente: nomeEmitente || undefined,
        arquivo_pdf_nome: arquivoInicial.name,
        valor_total: Math.round(valorTotal * 100) / 100,
        emitida_em: hoje,
        importada_em: agora,
        status: "conferida",
        origem: "manual",
      });
      d.recebimentos.unshift({
        id: recebimentoId,
        pedido_id: pedido?.id ?? "",
        nota_id: nfId,
        status,
        recebido_por: usuarioId,
        recebido_em: agora,
      });
      for (const item of confirmados) {
        const dec = decisoes[item.indice];
        if (!dec?.produtoId || dec.quantidade <= 0) continue;
        const ri = uid("ri");
        d.recebimento_itens.push({
          id: ri,
          recebimento_id: recebimentoId,
          produto_id: dec.produtoId,
          qtd_esperada: item.quantidade,
          qtd_recebida: dec.quantidade,
          validade: dec.validade || undefined,
        });
        criarLote(d, {
          id: uid("lote"),
          produto_id: dec.produtoId,
          recebimento_item_id: ri,
          origem: "recebimento",
          quantidade: dec.quantidade,
          data_entrada: hoje,
          validade: dec.validade || undefined,
          criado_em: agora,
          atualizado_em: agora,
        });
        d.movimentos_estoque.unshift({
          id: uid("mov"),
          produto_id: dec.produtoId,
          tipo: "entrada",
          quantidade: dec.quantidade,
          recebimento_id: recebimentoId,
          usuario_id: usuarioId,
          criado_em: agora,
          sincronizado: false,
        });
      }
      if (pedido) {
        const ped = d.pedidos.find((p) => p.id === pedido.id);
        if (ped) ped.status = "entregue";
      }
    });

    for (const item of confirmados) {
      const dec = decisoes[item.indice];
      if (!dec?.produtoId) continue;
      const produto = dbNovo.produtos.find((p) => p.id === dec.produtoId);
      enviarEstoqueTotal(produto?.codigo_externo, estoqueAtual(dbNovo, dec.produtoId));
    }

    aoFinalizar({
      status,
      fornecedorNome: nomeFornecedor(db, fornecedor.id),
      boletos: 0,
      boletosLiberados: 0,
      vinculouPedido: Boolean(pedido),
    });
  }

  const pendentes = itens.filter((i) => decisoes[i.indice]?.decisao === "pendente").length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        PDF da DANFE à esquerda (ou acima no celular) para você conferir. À direita, a mesma lógica da
        conferência do XML: produto, cadastrar se faltar, confirmar ou recusar. A lista automática
        completa só vem com o <strong>XML</strong> — aqui usamos o que o PDF permitir ler.
      </p>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden p-0 xl:sticky xl:top-4 xl:self-start">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold">
            <FileUp size={16} className="mr-1 inline" />
            {arquivoInicial.name}
          </div>
          {pdfUrl ? (
            ehPdf ? (
              <iframe
                title="DANFE PDF"
                src={pdfUrl}
                className="h-[55vh] w-full bg-slate-100 xl:h-[75vh]"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pdfUrl}
                alt="DANFE / foto da nota"
                className="max-h-[55vh] w-full object-contain bg-slate-100 xl:max-h-[75vh]"
              />
            )
          ) : (
            <p className="p-4 text-sm text-slate-500">Carregando arquivo…</p>
          )}
        </Card>

        <div className="space-y-3">
          {lendo && (
            <p className="rounded-card bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Lendo chave, CNPJ e produtos do PDF…
            </p>
          )}
          {erro && <p className="rounded-card bg-erro-clara px-3 py-2 text-sm text-erro">{erro}</p>}

          {notaId && (
            <Card>
              <p className="text-lg font-bold">Nota nº {notaId.numero}</p>
              <p className="text-sm text-slate-700">
                CNPJ emitente: {formatarCnpj(notaId.cnpj)}
                {nomeEmitente ? ` · ${nomeEmitente}` : ""}
              </p>
              <p className="text-xs text-slate-500">Chave …{notaId.chave.slice(-12)}</p>
              <p className="mt-1 text-sm text-slate-600">
                Fornecedor: {fornecedor ? nomeFornecedor(db, fornecedor.id) : "não cadastrado"}
              </p>
              {!fornecedor && (
                <button type="button" className="btn-secundario mt-2" onClick={abrirCadastroFornecedor}>
                  <Building2 size={16} /> Cadastrar fornecedor com este CNPJ
                </button>
              )}
            </Card>
          )}

          {itens.map((item) => {
            const dec = decisoes[item.indice];
            if (!dec) return null;
            const confirmado = dec.decisao === "confirmado";
            const recusado = dec.decisao === "recusado";
            return (
              <Card
                key={item.indice}
                className={`space-y-3 border-2 ${
                  confirmado ? "border-sucesso" : recusado ? "border-erro opacity-80" : "border-transparent"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold">{item.descricao}</p>
                    <p className="text-sm text-slate-600">
                      {item.codigo} · {qtd(item.quantidade)} {item.unidade}
                      {item.valorUnitario !== undefined ? ` × ${moeda(item.valorUnitario)}` : ""}
                    </p>
                  </div>
                  {confirmado && (
                    <Badge cor="verde">
                      <CircleCheck size={14} /> confirmado
                    </Badge>
                  )}
                  {recusado && (
                    <Badge cor="vermelho">
                      <CircleX size={14} /> recusado
                    </Badge>
                  )}
                </div>

                <Campo rotulo="Produto no ComprasChef">
                  <select
                    className="campo"
                    value={dec.produtoId}
                    onChange={(e) => {
                      const produto = db.produtos.find((p) => p.id === e.target.value);
                      alterar(item.indice, {
                        produtoId: e.target.value,
                        validade: hojeMais(produto?.validade_padrao_dias ?? 30),
                      });
                    }}
                    disabled={recusado}
                  >
                    <option value="">— escolher / cadastrar —</option>
                    {db.produtos
                      .filter((p) => p.ativo)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                  </select>
                </Campo>

                {!dec.produtoId && !recusado && (
                  <button type="button" className="btn-secundario w-full" onClick={() => abrirCadastroProduto(item)}>
                    <PackagePlus size={16} /> Cadastrar produto da DANFE
                  </button>
                )}

                {dec.produtoId && !recusado && (
                  <Campo rotulo="Quantidade recebida">
                    <CampoQuantidade
                      valor={dec.quantidade}
                      onChange={(v) => alterar(item.indice, { quantidade: v })}
                    />
                  </Campo>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`btn-secundario flex-1 ${confirmado ? "border-sucesso" : ""}`}
                    disabled={!dec.produtoId && !confirmado}
                    onClick={() =>
                      alterar(item.indice, { decisao: confirmado ? "pendente" : "confirmado" })
                    }
                  >
                    <CircleCheck size={18} /> Confirmar
                  </button>
                  <button
                    type="button"
                    className={`btn-secundario flex-1 ${recusado ? "border-erro" : ""}`}
                    onClick={() => alterar(item.indice, { decisao: recusado ? "pendente" : "recusado" })}
                  >
                    <CircleX size={18} /> Recusar
                  </button>
                </div>
              </Card>
            );
          })}

          <Card className="space-y-2">
            <p className="text-sm font-semibold">Item que o PDF não leu — olhe a DANFE ao lado</p>
            <Campo rotulo="Descrição">
              <input
                className="campo"
                value={novoItemDesc}
                onChange={(e) => setNovoItemDesc(e.target.value)}
                placeholder="Como na DANFE"
              />
            </Campo>
            <Campo rotulo="Quantidade">
              <CampoQuantidade valor={novoItemQtd} onChange={setNovoItemQtd} />
            </Campo>
            <button type="button" className="btn-secundario" onClick={adicionarItemManual}>
              <Plus size={16} /> Incluir na conferência
            </button>
          </Card>

          {pendentes > 0 && (
            <p className="text-sm text-destaque">
              Faltam decidir {pendentes} item{pendentes === 1 ? "" : "s"} — Confirmar ou Recusar.
            </p>
          )}

          <button
            type="button"
            className="btn-gigante"
            disabled={!notaId || !fornecedor || itens.length === 0 || pendentes > 0}
            onClick={finalizar}
          >
            <CircleCheck size={28} /> Finalizar conferência DANFE
          </button>

          <button type="button" className="btn-secundario w-full" onClick={onVoltar}>
            <ArrowLeft size={18} /> Voltar
          </button>
        </div>
      </div>

      <Modal aberto={fornecedorForm !== null} titulo="Cadastrar fornecedor" onFechar={() => setFornecedorForm(null)}>
        {fornecedorForm && (
          <form onSubmit={salvarFornecedor} className="space-y-3">
            <Campo rotulo="CNPJ">
              <input className="campo" readOnly value={fornecedorForm.cnpj} />
            </Campo>
            <Campo rotulo="Nome *">
              <input
                className="campo"
                required
                value={fornecedorForm.nome}
                onChange={(e) => setFornecedorForm({ ...fornecedorForm, nome: e.target.value })}
              />
            </Campo>
            <button type="submit" className="btn-primario w-full">
              Salvar fornecedor
            </button>
          </form>
        )}
      </Modal>

      <Modal
        aberto={produtoForm !== null}
        titulo="Cadastrar produto da DANFE"
        onFechar={() => setProdutoForm(null)}
        fecharAoClicarFundo={false}
      >
        {produtoForm && (
          <form onSubmit={salvarProduto} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Campo rotulo="Nome *">
                <input
                  className="campo"
                  required
                  value={produtoForm.nome}
                  onChange={(e) => setProdutoForm({ ...produtoForm, nome: e.target.value })}
                />
              </Campo>
            </div>
            <Campo rotulo="Código no fornecedor">
              <input
                className="campo"
                value={produtoForm.codigoExterno}
                onChange={(e) => setProdutoForm({ ...produtoForm, codigoExterno: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Unidade de compra *">
              <select
                className="campo"
                required
                value={produtoForm.unidadeCompraId}
                onChange={(e) => setProdutoForm({ ...produtoForm, unidadeCompraId: e.target.value })}
              >
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
                value={produtoForm.unidadeUsoId}
                onChange={(e) => setProdutoForm({ ...produtoForm, unidadeUsoId: e.target.value })}
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
                min={0.0001}
                step="any"
                className="campo"
                required
                value={produtoForm.fatorConversao}
                onChange={(e) =>
                  setProdutoForm({ ...produtoForm, fatorConversao: Number(e.target.value) || 1 })
                }
              />
            </Campo>
            <Campo rotulo="Estoque mínimo">
              <input
                type="number"
                min={0}
                className="campo"
                value={produtoForm.estoqueMinimo}
                onChange={(e) =>
                  setProdutoForm({ ...produtoForm, estoqueMinimo: Number(e.target.value) || 0 })
                }
              />
            </Campo>
            <button type="submit" className="btn-primario sm:col-span-2">
              Salvar produto e vincular
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
