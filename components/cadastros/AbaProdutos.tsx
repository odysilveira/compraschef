"use client";

// Aba Produtos — lista + abre o cadastro completo (ModalCadastroProduto).

import { useEffect, useRef, useState } from "react";
import { Eraser, Plus } from "lucide-react";
import { Badge, Tabela, Vazio } from "@/components/ui";
import { estoqueAtual, mutate, siglaUnidadeUso, useDB } from "@/lib/data";
import { qtd } from "@/lib/format";
import type { Produto } from "@/lib/types";
import {
  desativarProdutosNomeTitulo,
  listarProdutosNomeTitulo,
} from "@/lib/domain/produtos-limpeza-nome";
import {
  aplicarSugestaoContaDreProdutos,
  listarProdutosSemContaDre,
  nomeContaSugerida,
  sugerirContaDrePorNome,
} from "@/lib/domain/sugerir-conta-dre-nome";
import { BarraBusca, contem } from "./comum";
import { ModalCadastroProduto, produtoVazio } from "./ModalCadastroProduto";

export function AbaProdutos({ produtoParaAbrirId }: { produtoParaAbrirId?: string } = {}) {
  const db = useDB();
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Produto | null>(null);
  const produtoAbertoPorUrl = useRef<string | undefined>(undefined);

  const categorias = Array.isArray(db.categorias_produtos) ? db.categorias_produtos : [];
  const candidatosLimpezaNome = listarProdutosNomeTitulo(db);
  const semContaDre = listarProdutosSemContaDre(db.produtos);
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

  useEffect(() => {
    if (!produtoParaAbrirId) {
      produtoAbertoPorUrl.current = undefined;
      return;
    }
    if (produtoAbertoPorUrl.current === produtoParaAbrirId) return;
    const produto = db.produtos.find((p) => p.id === produtoParaAbrirId);
    if (produto) {
      produtoAbertoPorUrl.current = produtoParaAbrirId;
      setForm(produto);
    }
  }, [produtoParaAbrirId, db.produtos]);

  function limparNomesTitulo() {
    const qtde = candidatosLimpezaNome.length;
    if (qtde === 0) return;
    const amostra = candidatosLimpezaNome
      .slice(0, 8)
      .map((p) => `• ${p.nome}`)
      .join("\n");
    const resto = qtde > 8 ? `\n… e mais ${qtde - 8}` : "";
    if (
      !window.confirm(
        `Remover ${qtde} produto(s) com nome em minúsculas/título?\n\nMantém só os em CAIXA ALTA da NF.\nEx.: remove "4 Queijos G", "Base de risoto…"; mantém "ACUCAR REFINADO…".\n\n${amostra}${resto}`
      )
    ) {
      return;
    }
    mutate((banco) => {
      desativarProdutosNomeTitulo(banco);
      banco.produtos_limpeza_nome_titulo_v1 = true;
      banco.produtos_limpeza_nome_titulo_v2 = true;
    });
    setForm(null);
  }

  function sugerirContasDreEmLote() {
    const qtde = semContaDre.length;
    if (qtde === 0) return;
    const amostra = semContaDre
      .slice(0, 8)
      .map((p) => {
        const contaId = sugerirContaDrePorNome(p.nome);
        return `• ${p.nome} → ${nomeContaSugerida(db.contas_dre, contaId)}`;
      })
      .join("\n");
    const resto = qtde > 8 ? `\n… e mais ${qtde - 8}` : "";
    if (
      !window.confirm(
        `Sugerir conta DRE em ${qtde} produto(s) sem classificação?\n\nNão altera produtos que já têm conta.\n\n${amostra}${resto}`
      )
    ) {
      return;
    }
    mutate((banco) => {
      aplicarSugestaoContaDreProdutos(banco, { soSemConta: true });
      banco.produtos_sugestao_conta_dre_v1 = true;
    });
    setForm(null);
  }

  function abrir(p: Produto | null) {
    if (!p) {
      const categoriaPadrao = categorias.find((c) => c.codigo === "sem-categoria")?.id;
      setForm({ ...produtoVazio(db.unidades[0]?.id ?? ""), categoria_id: categoriaPadrao });
      return;
    }
    setForm(p);
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <BarraBusca valor={busca} onMudar={setBusca} placeholder="Buscar por nome, categoria, código…" />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {candidatosLimpezaNome.length > 0 ? (
            <button
              type="button"
              className="btn-secundario"
              title="Remove comprados com nome tipo 'Tomate'; mantém 'TOMATE' da NF"
              onClick={limparNomesTitulo}
            >
              <Eraser size={16} /> Limpar nomes em minúsculas ({candidatosLimpezaNome.length})
            </button>
          ) : null}
          {semContaDre.length > 0 ? (
            <button
              type="button"
              className="btn-secundario"
              title="Preenche Conta DRE pelo nome (limpeza, laticínios, massas…)"
              onClick={sugerirContasDreEmLote}
            >
              Sugerir contas DRE ({semContaDre.length})
            </button>
          ) : null}
          <button className="btn-primario" onClick={() => abrir(null)}>
            <Plus size={16} /> Novo produto
          </button>
        </div>
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
                  <td className="px-3 py-2.5">
                    {categorias.find((c) => c.id === p.categoria_id)?.nome ?? p.categoria ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {p.tipo === "comprado" ? (
                      <Badge cor="azul">Comprado</Badge>
                    ) : (
                      <Badge cor="verde">Produzido</Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    {abaixo ? (
                      <Badge cor="laranja">
                        {qtd(estoque, sigla)} · abaixo do mínimo
                      </Badge>
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

      <ModalCadastroProduto
        aberto={form !== null}
        produtoInicial={form}
        onFechar={() => setForm(null)}
      />
    </div>
  );
}
