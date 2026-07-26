"use client";

// Recebimento AVULSO — para entregas sem o arquivo XML:
// - Sem nota nenhuma (hortifrúti, feira, compra direta): preenche os itens na hora.
// - Com a nota impressa (DANFE): lê o QR/código de barras → o sistema extrai a
//   chave de acesso, identifica o fornecedor (CNPJ) e o nº da nota; os itens são
//   preenchidos à mão (o download automático dos itens virá com o certificado A1).

import { useState } from "react";
import { ArrowLeft, CircleCheck, PackagePlus, Plus, ReceiptText, Trash2 } from "lucide-react";
import { Badge, Campo, Card } from "@/components/ui";
import CodeScanner from "@/components/scanner/CodeScanner";
import CampoQuantidade from "@/components/operacao/CampoQuantidade";
import CampoMoeda from "@/components/operacao/CampoMoeda";
import { estoqueAtual, mutate, nomeFornecedor, nomeProduto, siglaUnidadeUso, uid } from "@/lib/data";
import { enviarEstoqueTotal } from "@/lib/integracao";
import { criarLote } from "@/lib/domain/estoque";
import { moeda, qtd } from "@/lib/format";
import type { DB, StatusRecebimento } from "@/lib/types";
import type { ResultadoNota } from "@/components/operacao/ReceberPorNota";

interface ItemAvulso {
  id: string;
  produtoId: string;
  quantidade: number;
  validade: string;
  preco?: number; // opcional — só dono/gerente informa
}

interface NotaIdentificada {
  chave: string;
  numero: string;
  cnpj: string;
}

function hojeMais(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function somenteDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/** Extrai a chave de acesso (44 dígitos) do QR/código da nota e decodifica CNPJ + número. */
function lerChaveDeAcesso(codigo: string): NotaIdentificada | null {
  const achado = codigo.match(/\d{44}/);
  if (!achado) return null;
  const chave = achado[0];
  return {
    chave,
    cnpj: chave.slice(6, 20),
    numero: String(Number(chave.slice(25, 34)) || 0),
  };
}

export default function ReceberAvulso({
  db,
  usuarioId,
  verValores,
  onVoltar,
  aoFinalizar,
}: {
  db: DB;
  usuarioId: string;
  verValores: boolean;
  onVoltar: () => void;
  aoFinalizar: (resultado: ResultadoNota) => void;
}) {
  const [fornecedorId, setFornecedorId] = useState("");
  const [notaIdentificada, setNotaIdentificada] = useState<NotaIdentificada | null>(null);
  const [itens, setItens] = useState<ItemAvulso[]>([]);
  const [avisoScanner, setAvisoScanner] = useState<string | null>(null);

  function adicionarProduto(produtoId: string) {
    if (!produtoId) return;
    const produto = db.produtos.find((p) => p.id === produtoId);
    setItens((atual) => [
      ...atual,
      {
        id: uid("ia"),
        produtoId,
        quantidade: 1,
        validade: hojeMais(produto?.validade_padrao_dias ?? 30),
      },
    ]);
  }

  function alterarItem(id: string, mudanca: Partial<ItemAvulso>) {
    setItens((atual) => atual.map((i) => (i.id === id ? { ...i, ...mudanca } : i)));
  }

  /** O leitor serve para dois códigos: a chave da nota (44 dígitos) ou o código de barras de um produto. */
  function aoLerCodigo(codigo: string) {
    setAvisoScanner(null);
    const nota = lerChaveDeAcesso(codigo);
    if (nota) {
      setNotaIdentificada(nota);
      const forn = db.fornecedores.find((f) => somenteDigitos(f.cnpj) === nota.cnpj);
      if (forn) setFornecedorId(forn.id);
      return;
    }
    const limpo = codigo.trim();
    const produto = db.produtos.find((p) => p.ativo && p.codigo_barras === limpo);
    if (produto) {
      adicionarProduto(produto.id);
      return;
    }
    setAvisoScanner(`Código "${limpo}" não é uma chave de nota nem um produto cadastrado.`);
  }

  function finalizar() {
    if (itens.length === 0) return;
    const agora = new Date().toISOString();
    const hoje = agora.slice(0, 10);
    const status: StatusRecebimento = "ok";

    const pedido = fornecedorId
      ? db.pedidos.find(
          (p) => p.fornecedor_id === fornecedorId && (p.status === "enviado" || p.status === "confirmado")
        )
      : undefined;

    const valorTotal = itens.reduce((s, i) => s + (i.preco ?? 0) * i.quantidade, 0);
    const notaId = notaIdentificada ? uid("nf") : undefined;
    const recebimentoId = uid("rec");

    const dbNovo = mutate((d) => {
      if (notaIdentificada && notaId) {
        d.notas_fiscais.unshift({
          id: notaId,
          fornecedor_id: fornecedorId,
          pedido_id: pedido?.id,
          numero: notaIdentificada.numero,
          chave_acesso: notaIdentificada.chave,
          valor_total: Math.round(valorTotal * 100) / 100,
          emitida_em: hoje,
          importada_em: agora,
          status: "conferida",
        });
      }

      d.recebimentos.unshift({
        id: recebimentoId,
        pedido_id: pedido?.id ?? "",
        nota_id: notaId,
        status,
        recebido_por: usuarioId,
        recebido_em: agora,
      });

      for (const item of itens) {
        const recebimentoItemId = uid("ri");
        d.recebimento_itens.push({
          id: recebimentoItemId,
          recebimento_id: recebimentoId,
          produto_id: item.produtoId,
          qtd_esperada: item.quantidade,
          qtd_recebida: item.quantidade,
          validade: item.validade || undefined,
        });
        criarLote(d, {
          id: uid("lote"),
          produto_id: item.produtoId,
          recebimento_item_id: recebimentoItemId,
          origem: "recebimento",
          quantidade: item.quantidade,
          data_entrada: hoje,
          validade: item.validade || undefined,
          criado_em: agora,
          atualizado_em: agora,
        });
        d.movimentos_estoque.unshift({
          id: uid("mov"),
          produto_id: item.produtoId,
          tipo: "entrada",
          quantidade: item.quantidade,
          recebimento_id: recebimentoId,
          usuario_id: usuarioId,
          criado_em: agora,
          sincronizado: false,
        });
        if (fornecedorId && item.preco !== undefined && item.preco > 0) {
          d.precos_historico.push({
            id: uid("ph"),
            produto_id: item.produtoId,
            fornecedor_id: fornecedorId,
            preco: item.preco,
            origem: "nota",
            data: hoje,
          });
        }
      }

      if (pedido) {
        const ped = d.pedidos.find((p) => p.id === pedido.id);
        if (ped) ped.status = "entregue";
      }
    });

    for (const item of itens) {
      const produto = dbNovo.produtos.find((p) => p.id === item.produtoId);
      enviarEstoqueTotal(produto?.codigo_externo, estoqueAtual(dbNovo, item.produtoId));
    }

    aoFinalizar({
      status,
      fornecedorNome: fornecedorId ? nomeFornecedor(db, fornecedorId) : "entrega sem fornecedor",
      boletos: 0,
      boletosLiberados: 0,
      vinculouPedido: Boolean(pedido),
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <p className="flex items-center gap-2 text-lg font-bold">
          <PackagePlus size={22} className="text-primaria" /> Receber sem o arquivo da nota
        </p>
        <p className="text-sm text-slate-600">
          Se tiver a nota impressa, leia o <strong>QR code</strong> dela para identificar fornecedor e número.
          Também dá para bipar o <strong>código de barras dos produtos</strong> para adicioná-los rapidinho — ou
          escolher tudo à mão. Entrega sem nota (hortifrúti, feira)? É só preencher os itens.
        </p>
        <CodeScanner rotulo="Ler QR da nota ou código do produto" onLeitura={aoLerCodigo} />
        {avisoScanner && (
          <p className="rounded-card bg-destaque-clara px-3 py-2 text-sm text-destaque">{avisoScanner}</p>
        )}
        {notaIdentificada && (
          <p className="rounded-card bg-sucesso-clara px-3 py-2 text-sm text-primaria-escura">
            <ReceiptText size={14} className="mr-1 inline" />
            Nota nº {notaIdentificada.numero} identificada pelo QR
            {fornecedorId
              ? ` — ${nomeFornecedor(db, fornecedorId)}`
              : ` (CNPJ ${notaIdentificada.cnpj} não está nos seus fornecedores)`}
            . Os itens você preenche abaixo — a busca automática virá com o certificado digital.
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <Campo rotulo="Fornecedor (opcional)">
          <select className="campo" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
            <option value="">— sem fornecedor —</option>
            {db.fornecedores
              .filter((f) => f.ativo)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
          </select>
        </Campo>

        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 shrink-0 text-slate-400" />
          <select className="campo" value="" onChange={(e) => adicionarProduto(e.target.value)}>
            <option value="">Adicionar produto…</option>
            {db.produtos
              .filter((p) => p.ativo)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
          </select>
        </div>
      </Card>

      {itens.map((item) => {
        const sigla = siglaUnidadeUso(db, item.produtoId);
        return (
          <Card key={item.id} className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-bold">{nomeProduto(db, item.produtoId)}</p>
              <button
                className="rounded-full p-1.5 text-erro hover:bg-erro-clara"
                onClick={() => setItens((atual) => atual.filter((i) => i.id !== item.id))}
                aria-label="Remover item"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <Campo rotulo={`Quantidade recebida${sigla ? ` (${sigla})` : ""}`}>
              <CampoQuantidade valor={item.quantidade} onChange={(v) => alterarItem(item.id, { quantidade: v })} />
            </Campo>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo rotulo="Validade">
                <input
                  type="date"
                  className="campo"
                  value={item.validade}
                  onChange={(e) => alterarItem(item.id, { validade: e.target.value })}
                />
              </Campo>
              {verValores && (
                <Campo rotulo="Preço unitário pago (opcional)">
                  <CampoMoeda
                    valor={item.preco}
                    onChange={(v) => alterarItem(item.id, { preco: v })}
                    placeholder="0,00"
                  />
                </Campo>
              )}
            </div>
          </Card>
        );
      })}

      {itens.length > 0 && (
        <button className="btn-gigante" onClick={finalizar} disabled={itens.some((i) => i.quantidade <= 0)}>
          <CircleCheck size={28} /> Finalizar recebimento ({itens.length}{" "}
          {itens.length === 1 ? "item" : "itens"}
          {verValores && itens.some((i) => i.preco) ? ` · ${moeda(itens.reduce((s, i) => s + (i.preco ?? 0) * i.quantidade, 0))}` : ""}
          )
        </button>
      )}

      <button className="btn-secundario w-full" onClick={onVoltar}>
        <ArrowLeft size={18} /> Cancelar
      </button>
    </div>
  );
}
