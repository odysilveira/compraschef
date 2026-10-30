"use client";

// Modal de cadastro/edição completo de produto — usado em Cadastros e no recebimento da NF.

import { useEffect, useState, type FormEvent } from "react";
import { Link2, X } from "lucide-react";
import CodeScanner from "@/components/scanner/CodeScanner";
import { Campo, Modal } from "@/components/ui";
import { SelectContaDre } from "@/components/cadastros/SelectContaDre";
import { numOpcional, RodapeFormulario } from "@/components/cadastros/comum";
import {
  estoqueAtual,
  mutate,
  nomeFornecedor,
  precoMedioHistorico,
  siglaUnidadeUso,
  uid,
  useDB,
} from "@/lib/data";
import { podeVerValores, usePapel } from "@/lib/roles";
import { dataBR, moeda, qtd } from "@/lib/format";
import type { Produto, TipoProduto, ProdutoCodigoBarras } from "@/lib/types";
import { associarCategoriasProdutos, registrarVinculoDaNota } from "@/lib/domain/produtos";
import { inferirEntraNoCmv } from "@/lib/domain/produto-cmv";
import {
  conteudoTotalEmbalagem,
  custoUsoApartirDaMediaHistorica,
  custoUsoDeEmbalagem,
  modoMioloEmbalagemAtivo,
  normalizarPrecosCadastroProduto,
  precoEmbalagemDeCustoUso,
  preencherPrecoCompraDaNota,
  sincronizarFatorDoMiolo,
} from "@/lib/domain/produto-precos";
import { sugerirContaDrePorNome } from "@/lib/domain/sugerir-conta-dre-nome";

export function produtoVazio(unidadePadraoId: string): Produto {
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
    entra_no_cmv: true,
    ativo: true,
  };
}

function formatarDecimalBr(valor: number | undefined): string {
  if (valor === undefined || !Number.isFinite(valor)) return "";
  return String(valor).replace(".", ",");
}

function normalizarDecimalDigitado(bruto: string): string {
  const limpo = bruto.replace(/[^\d.,]/g, "");
  const partes = limpo.split(/[.,]/);
  if (partes.length <= 1) return limpo;
  return `${partes[0].replace(/[.,]/g, "")},${partes.slice(1).join("").replace(/[.,]/g, "")}`;
}

export type VinculoNotaProduto = {
  fornecedorId?: string;
  codigoFornecedor?: string;
  ean?: string;
  /** Preço da unidade comercial nesta NF (pacote / UN / kg da nota). */
  ultimoPreco?: number;
};

export function ModalCadastroProduto({
  aberto,
  produtoInicial,
  titulo,
  onFechar,
  onSalvo,
  fecharAoSalvar = false,
  ocultarExcluir = false,
  vinculoNota,
}: {
  aberto: boolean;
  produtoInicial: Produto | null;
  titulo?: string;
  onFechar: () => void;
  onSalvo?: (produtoId: string) => void;
  /** No fluxo da NF: salva, vincula e fecha o modal. */
  fecharAoSalvar?: boolean;
  ocultarExcluir?: boolean;
  vinculoNota?: VinculoNotaProduto;
}) {
  const db = useDB();
  const { papel } = usePapel();
  const mostrarPrecos = podeVerValores(papel);
  const [form, setForm] = useState<Produto | null>(null);
  const [codigoBarrasForm, setCodigoBarrasForm] = useState<ProdutoCodigoBarras[]>([]);
  const [novoCodigoBarras, setNovoCodigoBarras] = useState("");
  const [fornecedorParaVincular, setFornecedorParaVincular] = useState("");
  const [mensagemVinculo, setMensagemVinculo] = useState<string | null>(null);
  const [assumirPrecoComoCusto, setAssumirPrecoComoCusto] = useState(false);
  const [qtdInternaTexto, setQtdInternaTexto] = useState("");
  const [conteudoCadaTexto, setConteudoCadaTexto] = useState("");

  const categorias = Array.isArray(db.categorias_produtos) ? db.categorias_produtos : [];

  useEffect(() => {
    if (!aberto || !produtoInicial) {
      setForm(null);
      return;
    }
    setAssumirPrecoComoCusto(false);
    setFornecedorParaVincular("");
    setMensagemVinculo(null);
    setNovoCodigoBarras("");

    const p = produtoInicial;
    if (!p.id) {
      const categoriaPadrao =
        p.categoria_id || categorias.find((c) => c.codigo === "sem-categoria")?.id;
      const novo = { ...p, categoria_id: categoriaPadrao };
      preencherPrecoCompraDaNota(novo, vinculoNota?.ultimoPreco);
      setForm(novo);
      setQtdInternaTexto(formatarDecimalBr(novo.quantidade_subunidade));
      setConteudoCadaTexto(formatarDecimalBr(novo.conteudo_por_subunidade));
      setCodigoBarrasForm(
        novo.codigo_barras
          ? [
              {
                id: uid("pcb"),
                produto_id: "",
                codigo_barras: novo.codigo_barras,
                principal: true,
              },
            ]
          : []
      );
      return;
    }

    const codigos = (Array.isArray(db.produto_codigos_barras) ? db.produto_codigos_barras : []).filter(
      (c) => c.produto_id === p.id
    );
    const codigoPadrao = codigos.length
      ? codigos
      : p.codigo_barras
        ? [{ id: `pcb-${p.id}`, produto_id: p.id, codigo_barras: p.codigo_barras, principal: true }]
        : [];
    const principalCodigo = codigoPadrao.find((c) => c.principal)?.codigo_barras;
    const produtoNorm = { ...p };
    const mediaHistorica = precoMedioHistorico(db, p.id);
    const precosForn = (Array.isArray(db.fornecedor_produtos) ? db.fornecedor_produtos : [])
      .filter((fp) => fp.produto_id === p.id && fp.ultimo_preco != null && fp.ultimo_preco > 0)
      .map((fp) => fp.ultimo_preco as number);
    const precoCompraFornecedor = precosForn.length > 0 ? Math.min(...precosForn) : undefined;
    const precosEstavamVazios =
      !(p.preco_embalagem_compra != null && p.preco_embalagem_compra > 0) &&
      !(p.custo_unitario != null && p.custo_unitario > 0);
    const precosPreenchidos = normalizarPrecosCadastroProduto(produtoNorm, {
      mediaHistorica,
      precoCompraFornecedor,
    });
    // Produto já no estoque, sem preço gravado: usa o valor desta NF (pacote / UN).
    preencherPrecoCompraDaNota(produtoNorm, vinculoNota?.ultimoPreco);
    if (precosEstavamVazios && precosPreenchidos && p.id) {
      mutate((banco) => {
        const alvo = banco.produtos.find((x) => x.id === p.id);
        if (!alvo) return;
        alvo.preco_embalagem_compra = produtoNorm.preco_embalagem_compra;
        alvo.custo_unitario = produtoNorm.custo_unitario;
      });
    }
    if (modoMioloEmbalagemAtivo(produtoNorm)) {
      Object.assign(produtoNorm, sincronizarFatorDoMiolo(produtoNorm));
    }
    setForm({
      ...produtoNorm,
      codigo_barras: principalCodigo ?? p.codigo_barras,
    });
    setQtdInternaTexto(formatarDecimalBr(produtoNorm.quantidade_subunidade));
    setConteudoCadaTexto(formatarDecimalBr(produtoNorm.conteudo_por_subunidade));
    setCodigoBarrasForm(codigoPadrao);
    // produtoInicial só na abertura; key no pai remonta rascunhos da NF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, produtoInicial?.id, produtoInicial?.nome]);

  function alterar(mudanca: Partial<Produto>) {
    setForm((atual) => (atual ? { ...atual, ...mudanca } : atual));
  }

  function aplicarEstruturaEmbalagem(
    parcial: Partial<Pick<Produto, "quantidade_subunidade" | "conteudo_por_subunidade">>,
    base?: Produto | null
  ) {
    const origem = base ?? form;
    if (!origem) return;
    const mesclado = { ...origem, ...parcial };
    const sync = sincronizarFatorDoMiolo(mesclado as Produto);
    alterar({
      ...parcial,
      ...sync,
    });
  }

  const siglaEmbalagemCompra =
    db.unidades.find((u) => u.id === form?.unidade_compra_id)?.sigla ?? "emb";
  const siglaUso = db.unidades.find((u) => u.id === form?.unidade_uso_id)?.sigla ?? "uso";

  const vinculos = form?.id
    ? (Array.isArray(db.fornecedor_produtos) ? db.fornecedor_produtos : []).filter(
        (fp) => fp.produto_id === form.id
      )
    : [];
  const idsJaVinculados = new Set(vinculos.map((fp) => fp.fornecedor_id));
  const fornecedoresDisponiveis = form?.id
    ? db.fornecedores
        .filter((f) => f.ativo !== false && !idsJaVinculados.has(f.id))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    : [];

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const eraNovo = !form.id;
    let produtoIdSalvo = form.id || "";
    let custoSalvo = form.custo_unitario;
    let embalagemSalva = form.preco_embalagem_compra;
    mutate((banco) => {
      const categoriaSelecionada = form.categoria_id
        ? banco.categorias_produtos.find((c) => c.id === form.categoria_id)
        : undefined;
      const produtoId = form.id || uid("prod");
      produtoIdSalvo = produtoId;
      const codigos = codigoBarrasForm.length
        ? codigoBarrasForm
        : form.codigo_barras
          ? [
              {
                id: `pcb-${produtoId}-${Date.now()}`,
                produto_id: produtoId,
                codigo_barras: form.codigo_barras,
                principal: true,
              },
            ]
          : [];
      const principalCodigo =
        codigos.find((c) => c.principal)?.codigo_barras ?? form.codigo_barras;

      const mediaHistorica = precoMedioHistorico(banco, produtoId);
      const precosForn = (Array.isArray(banco.fornecedor_produtos) ? banco.fornecedor_produtos : [])
        .filter((fp) => fp.produto_id === produtoId && fp.ultimo_preco != null && fp.ultimo_preco > 0)
        .map((fp) => fp.ultimo_preco as number);
      const precoCompraFornecedor = precosForn.length > 0 ? Math.min(...precosForn) : undefined;
      let custoUnitario = form.custo_unitario;
      if (!assumirPrecoComoCusto && mediaHistorica !== undefined) {
        custoUnitario = custoUsoApartirDaMediaHistorica(
          mediaHistorica,
          form.fator_conversao,
          form.preco_embalagem_compra
        );
      }

      const produtoParaSalvar = {
        ...form,
        categoria: undefined,
        categoria_id: categoriaSelecionada ? categoriaSelecionada.id : undefined,
        codigo_barras: principalCodigo,
        id: produtoId,
        custo_unitario: custoUnitario,
      } as Produto;
      normalizarPrecosCadastroProduto(produtoParaSalvar, {
        mediaHistorica,
        precoCompraFornecedor,
      });
      custoSalvo = produtoParaSalvar.custo_unitario;
      embalagemSalva = produtoParaSalvar.preco_embalagem_compra;
      if (form.id) {
        const i = banco.produtos.findIndex((p) => p.id === form.id);
        if (i >= 0) banco.produtos[i] = produtoParaSalvar;
      } else {
        banco.produtos.push(produtoParaSalvar);
      }

      if (!Array.isArray(banco.produto_codigos_barras)) banco.produto_codigos_barras = [];
      banco.produto_codigos_barras = banco.produto_codigos_barras.filter(
        (c) => c.produto_id !== produtoId
      );
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

      if (vinculoNota?.fornecedorId) {
        registrarVinculoDaNota(banco, {
          idNovo: uid("fp"),
          fornecedorId: vinculoNota.fornecedorId,
          produtoId,
          codigoFornecedor: vinculoNota.codigoFornecedor,
          ean: vinculoNota.ean,
          unidadeCompraId: produtoParaSalvar.unidade_compra_id,
          fatorConversao: produtoParaSalvar.fator_conversao,
          ultimoPreco: vinculoNota.ultimoPreco,
          atualizadoEm: new Date().toISOString(),
        });
      }

      associarCategoriasProdutos(banco);
    });

    onSalvo?.(produtoIdSalvo);

    if (fecharAoSalvar) {
      onFechar();
      return;
    }

    setForm({
      ...form,
      id: produtoIdSalvo,
      codigo_barras: form.codigo_barras,
      custo_unitario: custoSalvo,
      preco_embalagem_compra: embalagemSalva,
    });
    setAssumirPrecoComoCusto(false);
    if (eraNovo) setMensagemVinculo("Produto salvo. Agora você pode vincular o fornecedor.");
  }

  function excluir() {
    if (!form?.id) return;
    if (
      !window.confirm(
        `Desativar o produto "${form.nome}"? Ele sai das listas, mas o histórico é mantido.`
      )
    )
      return;
    mutate((banco) => {
      const p = banco.produtos.find((x) => x.id === form.id);
      if (p) p.ativo = false;
    });
    onFechar();
  }

  function vincularFornecedor(fornecedorIdEscolhido?: string) {
    const fornecedorId = fornecedorIdEscolhido || fornecedorParaVincular;
    if (!form?.id || !fornecedorId) return;
    const produtoId = form.id;
    mutate((banco) => {
      if (!Array.isArray(banco.fornecedor_produtos)) banco.fornecedor_produtos = [];
      const jaExiste = banco.fornecedor_produtos.some(
        (fp) => fp.produto_id === produtoId && fp.fornecedor_id === fornecedorId
      );
      if (!jaExiste) {
        banco.fornecedor_produtos.push({
          id: uid("fp"),
          fornecedor_id: fornecedorId,
          produto_id: produtoId,
        });
      }
    });
    setFornecedorParaVincular("");
    setMensagemVinculo("Fornecedor vinculado.");
  }

  function desvincularFornecedor(fpId: string, nome: string) {
    if (!window.confirm(`Desvincular o fornecedor "${nome}" deste produto?`)) return;
    mutate((banco) => {
      if (!Array.isArray(banco.fornecedor_produtos)) banco.fornecedor_produtos = [];
      banco.fornecedor_produtos = banco.fornecedor_produtos.filter((fp) => fp.id !== fpId);
    });
  }

  return (
    <Modal
      aberto={aberto && form !== null}
      titulo={titulo ?? (form?.id ? "Editar produto" : "Novo produto")}
      onFechar={onFechar}
      fecharAoClicarFundo={false}
    >
      {form && (
        <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Campo rotulo="Nome *">
              <input
                className="campo"
                required
                value={form.nome}
                onChange={(e) => {
                  const nome = e.target.value;
                  if (!form.id) {
                    const contaId = sugerirContaDrePorNome(nome);
                    alterar({
                      nome,
                      conta_dre_id: contaId || undefined,
                      entra_no_cmv: inferirEntraNoCmv({
                        nome,
                        contaDreId: contaId || form.conta_dre_id,
                        contasDre: db.contas_dre,
                      }),
                    });
                  } else {
                    alterar({ nome });
                  }
                }}
              />
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
              onChange={(e) =>
                alterar({ categoria_id: e.target.value || undefined, categoria: undefined })
              }
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
                        : [
                            ...atual,
                            {
                              id: uid("pcb"),
                              produto_id: form.id,
                              codigo_barras: codigo,
                              principal: false,
                            },
                          ]
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
                      : [
                          ...atual,
                          {
                            id: uid("pcb"),
                            produto_id: form.id,
                            codigo_barras: codigo,
                            principal: false,
                          },
                        ]
                  );
                }}
              />
              <div className="space-y-2">
                {codigoBarrasForm.map((codigo) => (
                  <div
                    key={codigo.id}
                    className="flex items-center gap-2 rounded-card border border-slate-200 p-2"
                  >
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
          <Campo rotulo="Embalagem de compra">
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
            <p className="mt-1 text-xs text-slate-500">
              Como vem na NF / cotação (ex.: caixa, pacote). A quantidade comprada (2 caixas) fica na
              nota, não aqui.
            </p>
          </Campo>
          <Campo rotulo="Quantas unidades dentro da embalagem de compra?">
            <input
              type="text"
              inputMode="decimal"
              className="campo"
              placeholder="ex.: 6 (milho) ou 100 (canudo) — vazio no bacon"
              value={qtdInternaTexto}
              onChange={(e) => {
                const normalizado = normalizarDecimalDigitado(e.target.value);
                setQtdInternaTexto(normalizado);
                const qtdVal = numOpcional(normalizado);
                aplicarEstruturaEmbalagem({
                  quantidade_subunidade: qtdVal,
                  conteudo_por_subunidade: form.conteudo_por_subunidade,
                });
              }}
            />
            <p className="mt-1 text-xs text-slate-500">
              Ex. milho: 6. Canudo: 100. Bacon: deixe vazio.
            </p>
          </Campo>
          <Campo rotulo="Unidade de uso *">
            <select
              className="campo"
              required
              value={form.unidade_uso_id}
              onChange={(e) => {
                const unidade_uso_id = e.target.value;
                const base = { ...form, unidade_uso_id };
                if (form.quantidade_subunidade != null || form.conteudo_por_subunidade != null) {
                  const sync = sincronizarFatorDoMiolo(base);
                  alterar({ unidade_uso_id, ...sync });
                } else {
                  alterar({ unidade_uso_id });
                }
              }}
            >
              {db.unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome} ({u.sigla})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Como a cozinha consome: milho/bacon = kg; canudo = unidade.
            </p>
          </Campo>
          <Campo rotulo="quantas unidades de uso em cada Embalagem?">
            <input
              type="text"
              inputMode="decimal"
              required={!modoMioloEmbalagemAtivo(form)}
              className="campo"
              placeholder={
                modoMioloEmbalagemAtivo(form)
                  ? "ex.: 1,5 (em cada unidade de dentro)"
                  : "ex.: 5 (total na embalagem, se a pergunta acima estiver vazia)"
              }
              value={conteudoCadaTexto}
              onChange={(e) => {
                const normalizado = normalizarDecimalDigitado(e.target.value);
                setConteudoCadaTexto(normalizado);
                const cada = numOpcional(normalizado);
                aplicarEstruturaEmbalagem({
                  quantidade_subunidade: form.quantidade_subunidade,
                  conteudo_por_subunidade: cada,
                });
              }}
            />
            <p className="mt-1 text-xs text-slate-500">
              Ex. milho: 1,5 kg em cada uma das 6. Canudo: 1 (ou vazio). Bacon: 5 kg no pacote (com a
              pergunta de cima vazia).
            </p>
          </Campo>
          <Campo rotulo="Conteúdo total (estoque / CMV)">
            <div className="campo min-h-11 bg-slate-50 py-2.5 text-slate-800">
              {form.fator_conversao > 0 ? (
                <>
                  1 {siglaEmbalagemCompra} ={" "}
                  {modoMioloEmbalagemAtivo(form) ? (
                    <>
                      {formatarDecimalBr(form.quantidade_subunidade)} un ×{" "}
                      {formatarDecimalBr(form.conteudo_por_subunidade ?? 1)} {siglaUso} ={" "}
                      {formatarDecimalBr(conteudoTotalEmbalagem(form))} {siglaUso}
                    </>
                  ) : (
                    <>
                      {formatarDecimalBr(form.fator_conversao)} {siglaUso}
                    </>
                  )}
                </>
              ) : (
                <span className="text-slate-400">Preencha os campos acima</span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">Usado no estoque e no CMV.</p>
          </Campo>
          <Campo rotulo="Conta DRE">
            <SelectContaDre
              db={db}
              value={form.conta_dre_id}
              onChange={(id) => {
                const entra = inferirEntraNoCmv({
                  nome: form.nome,
                  contaDreId: id,
                  contasDre: db.contas_dre,
                });
                alterar({ conta_dre_id: id, entra_no_cmv: entra });
              }}
            />
            <p className="mt-1 text-xs text-slate-500">
              Usada na conferência da NF e no DRE (ex.: Carnes — costela, Material de limpeza).
            </p>
          </Campo>
          <Campo rotulo="Entra no CMV">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.entra_no_cmv !== false}
                onChange={(e) => alterar({ entra_no_cmv: e.target.checked })}
              />
              Sim — compras deste produto contam no CMV food
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Desmarque material de limpeza. Descartáveis de venda (canudo, embalagem) podem ficar
              marcados.
            </p>
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
          {mostrarPrecos ? (
            <>
              <Campo
                rotulo={`Valor por unidade de compra${
                  form.unidade_compra_id
                    ? ` (${db.unidades.find((u) => u.id === form.unidade_compra_id)?.sigla ?? "compra"})`
                    : " (embalagem)"
                }`}
              >
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="campo"
                  placeholder="ex.: 45,00 o pacote"
                  value={form.preco_embalagem_compra ?? ""}
                  onChange={(e) => {
                    const preco = numOpcional(e.target.value);
                    const fator = form.fator_conversao > 0 ? form.fator_conversao : 1;
                    if (preco != null && preco > 0) {
                      alterar({
                        preco_embalagem_compra: preco,
                        custo_unitario: custoUsoDeEmbalagem(preco, fator),
                      });
                    } else {
                      alterar({ preco_embalagem_compra: preco });
                    }
                  }}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Preço de 1 embalagem na NF / cotação / orçamento.
                </p>
              </Campo>
              <Campo
                rotulo={`Valor por unidade de uso${
                  form.unidade_uso_id
                    ? ` (${db.unidades.find((u) => u.id === form.unidade_uso_id)?.sigla ?? "uso"})`
                    : ""
                } — CMV`}
              >
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="campo"
                  placeholder="ex.: 9,00 por kg"
                  value={form.custo_unitario ?? ""}
                  onChange={(e) => {
                    const custo = numOpcional(e.target.value);
                    const fator = form.fator_conversao > 0 ? form.fator_conversao : 1;
                    if (custo != null && custo > 0) {
                      alterar({
                        custo_unitario: custo,
                        preco_embalagem_compra: precoEmbalagemDeCustoUso(custo, fator),
                      });
                    } else {
                      alterar({ custo_unitario: custo });
                    }
                  }}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Usado no CMV e nas fichas. Calculado: valor da compra ÷ conteúdo da embalagem.
                </p>
              </Campo>
              {form.unidade_compra_id && form.fator_conversao > 0 ? (
                <div className="sm:col-span-2 grid gap-2 rounded-lg border border-primaria/30 bg-primaria/5 px-3 py-2.5 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Conteúdo</p>
                    <p className="text-sm font-medium text-slate-800">
                      1 {siglaEmbalagemCompra}
                      {modoMioloEmbalagemAtivo(form) ? (
                        <>
                          {" "}
                          = {formatarDecimalBr(form.quantidade_subunidade)} un ×{" "}
                          {formatarDecimalBr(form.conteudo_por_subunidade ?? 1)} {siglaUso} ={" "}
                          {formatarDecimalBr(conteudoTotalEmbalagem(form))} {siglaUso}
                        </>
                      ) : (
                        <>
                          {" "}
                          = {formatarDecimalBr(form.fator_conversao)} {siglaUso}
                        </>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Valor / compra
                    </p>
                    <p className="text-sm font-medium text-slate-800">
                      {form.preco_embalagem_compra != null && form.preco_embalagem_compra > 0
                        ? `${moeda(form.preco_embalagem_compra)}/${
                            db.unidades.find((u) => u.id === form.unidade_compra_id)?.sigla ?? "pct"
                          }`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Valor / uso (CMV)
                    </p>
                    <p className="text-sm font-medium text-slate-800">
                      {form.custo_unitario != null && form.custo_unitario > 0
                        ? `${moeda(form.custo_unitario)}/${
                            db.unidades.find((u) => u.id === form.unidade_uso_id)?.sigla ?? "uso"
                          }`
                        : "—"}
                    </p>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <Campo rotulo="Preços">
              <div className="campo h-11 leading-11 text-slate-500">Visível para dono/gerente</div>
            </Campo>
          )}
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
          <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={assumirPrecoComoCusto}
                onChange={(e) => setAssumirPrecoComoCusto(e.target.checked)}
              />
              <span className="text-sm text-slate-700">
                <span className="font-medium">
                  Assumir o custo por unidade de uso como custo atual das fichas
                </span>
                <span className="mt-0.5 block text-slate-500">
                  {assumirPrecoComoCusto
                    ? "O custo por unidade de uso será gravado nas fichas técnicas (útil em pico ou promoção)."
                    : form.id && precoMedioHistorico(db, form.id) !== undefined
                      ? `Desmarcado: o custo das fichas fica na média histórica (${moeda(precoMedioHistorico(db, form.id) ?? 0)}).`
                      : "Desmarcado: mantém o custo atual / média histórica, sem trocar pelo valor digitado."}
                </span>
              </span>
            </label>
          </div>
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
          <Campo rotulo="Local padrão de armazenamento">
            <select
              className="campo"
              value={form.local_padrao_id ?? ""}
              onChange={(e) => alterar({ local_padrao_id: e.target.value || undefined })}
            >
              <option value="">— definir na hora de encher a caixa —</option>
              {(db.locais ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Ex.: molho de tomate → Estoque seco; carne → Geladeira. Ao encher a caixa, o local vem
              pré-selecionado.
            </p>
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
          <div className="space-y-1 text-xs text-slate-500 sm:col-span-2">
            {form.unidade_compra_id ? (
              <p>
                Cadastro fixo: 1 {siglaEmbalagemCompra}
                {modoMioloEmbalagemAtivo(form)
                  ? ` = ${formatarDecimalBr(form.quantidade_subunidade)} un × ${formatarDecimalBr(
                      form.conteudo_por_subunidade ?? 1
                    )} ${siglaUso} = ${formatarDecimalBr(form.fator_conversao)} ${siglaUso}`
                  : ` = ${formatarDecimalBr(form.fator_conversao)} ${siglaUso}`}{" "}
                (→ estoque/CMV).
                {mostrarPrecos &&
                form.preco_embalagem_compra != null &&
                form.preco_embalagem_compra > 0 &&
                form.custo_unitario != null
                  ? ` · ${moeda(form.preco_embalagem_compra)}/${siglaEmbalagemCompra} → ${moeda(form.custo_unitario)}/${siglaUso} (CMV).`
                  : ""}
              </p>
            ) : (
              <p>Sem embalagem de compra: o estoque e o consumo usam só a unidade de uso.</p>
            )}
            <p>
              Ex. milho: 6 dentro da embalagem × 1,5 de uso em cada = 9 kg. Bacon: pergunta de cima
              vazia e 5 na segunda. Canudo: 100 × 1. A qtd comprada (2 caixas) fica só na NF.
            </p>
          </div>

          {form.id && !fecharAoSalvar ? (
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
                                  <span className="text-xs text-slate-400">
                                    {" "}
                                    em {dataBR(fp.atualizado_em)}
                                  </span>
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
                          onClick={() =>
                            desvincularFornecedor(fp.id, nomeFornecedor(db, fp.fornecedor_id))
                          }
                        >
                          <X size={16} />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {mensagemVinculo && (
                <p className="mb-2 text-sm text-primaria-escura">{mensagemVinculo}</p>
              )}
              {fornecedoresDisponiveis.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    className="campo flex-1"
                    value={fornecedorParaVincular}
                    onChange={(e) => {
                      const id = e.target.value;
                      setFornecedorParaVincular(id);
                      if (id) vincularFornecedor(id);
                    }}
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
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      vincularFornecedor();
                    }}
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
          ) : !fecharAoSalvar ? (
            <p className="text-xs text-slate-500 sm:col-span-2">
              Salve o produto (botão Salvar) para liberar o vínculo com fornecedores — o formulário
              permanece aberto.
            </p>
          ) : vinculoNota?.codigoFornecedor ? (
            <p className="text-xs text-slate-500 sm:col-span-2">
              O código do item no fornecedor ({vinculoNota.codigoFornecedor}) será vinculado
              automaticamente ao salvar.
            </p>
          ) : null}

          <div className="sm:col-span-2">
            <RodapeFormulario
              onExcluir={!ocultarExcluir && form.id ? excluir : undefined}
              rotuloExcluir="Desativar"
            />
          </div>
        </form>
      )}
    </Modal>
  );
}
