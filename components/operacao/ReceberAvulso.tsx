"use client";

// Recebimento AVULSO — para entregas sem o arquivo XML:
// - Sem nota nenhuma (hortifrúti, feira, compra direta): preenche os itens na hora.
// - Com a nota impressa (DANFE): QR, PDF ou foto+OCR → chave / fornecedor / nº;
//   os itens são preenchidos à mão (itens automáticos vêm com XML ou certificado A1).

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, CircleCheck, FileUp, PackagePlus, Plus, ReceiptText, Trash2 } from "lucide-react";
import { Campo, Card } from "@/components/ui";
import CodeScanner from "@/components/scanner/CodeScanner";
import CampoQuantidade from "@/components/operacao/CampoQuantidade";
import CampoMoeda from "@/components/operacao/CampoMoeda";
import { estoqueAtual, mutate, nomeFornecedor, nomeProduto, siglaUnidadeUso, uid } from "@/lib/data";
import { enviarEstoqueTotal } from "@/lib/integracao";
import { criarLote } from "@/lib/domain/estoque";
import {
  identificarDanfeDeArquivo,
  type OrigemIdentificacaoDanfe,
} from "@/lib/domain/danfe-captura-browser";
import { identificarNotaPorTexto, type NotaIdentificadaDanfe } from "@/lib/domain/danfe-identificacao";
import { moeda, qtd } from "@/lib/format";
import type { StatusRecebimento } from "@/lib/types";
import type { ResultadoNota } from "@/components/operacao/ReceberPorNota";

interface ItemAvulso {
  id: string;
  produtoId: string;
  quantidade: number;
  validade: string;
  preco?: number; // opcional — só dono/gerente informa
}

function hojeMais(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function somenteDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function rotuloOrigem(origem?: OrigemIdentificacaoDanfe): string {
  switch (origem) {
    case "pdf_texto":
      return "pelo PDF";
    case "pdf_ocr":
      return "pelo PDF (OCR)";
    case "foto_ocr":
      return "pela foto (OCR)";
    case "qr":
      return "pelo QR";
    default:
      return "";
  }
}

export default function ReceberAvulso({
  db,
  usuarioId,
  verValores,
  onVoltar,
  aoFinalizar,
  arquivoInicial,
}: {
  db: import("@/lib/types").DB;
  usuarioId: string;
  verValores: boolean;
  onVoltar: () => void;
  aoFinalizar: (resultado: ResultadoNota) => void;
  /** PDF/foto já escolhido na triagem de lote. */
  arquivoInicial?: File | null;
}) {
  const [fornecedorId, setFornecedorId] = useState("");
  const [notaIdentificada, setNotaIdentificada] = useState<NotaIdentificadaDanfe | null>(null);
  const [origemNota, setOrigemNota] = useState<OrigemIdentificacaoDanfe | undefined>(undefined);
  const [itens, setItens] = useState<ItemAvulso[]>([]);
  const [avisoScanner, setAvisoScanner] = useState<string | null>(null);
  const [lendoArquivo, setLendoArquivo] = useState(false);
  /** PDF/foto vindos do lote — permite reler sem pedir o arquivo de novo. */
  const [arquivoLote, setArquivoLote] = useState<File | null>(arquivoInicial ?? null);
  const inputPdfRef = useRef<HTMLInputElement>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  function formatarCnpj(digitos: string): string {
    const n = somenteDigitos(digitos).slice(0, 14);
    if (n.length !== 14) return digitos;
    return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }

  function aplicarNota(nota: NotaIdentificadaDanfe, origem: OrigemIdentificacaoDanfe) {
    setNotaIdentificada(nota);
    setOrigemNota(origem);
    setAvisoScanner(null);
    const forn = db.fornecedores.find((f) => somenteDigitos(f.cnpj) === nota.cnpj);
    if (forn) setFornecedorId(forn.id);
  }

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

  /** QR/código: chave da nota (44 dígitos) ou EAN de produto. */
  function aoLerCodigo(codigo: string) {
    setAvisoScanner(null);
    const nota = identificarNotaPorTexto(codigo, { aceitarSemDv: true });
    if (nota) {
      aplicarNota(nota, "qr");
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

  async function aoEscolherArquivo(arquivo: File | null) {
    if (!arquivo) return;
    setArquivoLote(arquivo);
    setLendoArquivo(true);
    setAvisoScanner(null);
    try {
      const resultado = await identificarDanfeDeArquivo(arquivo);
      if (resultado.nota && resultado.origem) {
        aplicarNota(resultado.nota, resultado.origem);
      } else {
        setNotaIdentificada(null);
        setOrigemNota(undefined);
        setAvisoScanner(resultado.detalhe ?? "Não consegui identificar a DANFE neste arquivo.");
      }
    } catch (erro) {
      setAvisoScanner(erro instanceof Error ? erro.message : "Falha ao processar o arquivo.");
    } finally {
      setLendoArquivo(false);
      if (inputPdfRef.current) inputPdfRef.current.value = "";
      if (inputFotoRef.current) inputFotoRef.current.value = "";
    }
  }

  useEffect(() => {
    if (!arquivoInicial) return;
    setArquivoLote(arquivoInicial);
    void aoEscolherArquivo(arquivoInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carrega só o arquivo inicial do lote
  }, [arquivoInicial]);

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
          {arquivoLote
            ? <>PDF do lote: <strong>{arquivoLote.name}</strong> — a leitura é automática. Se precisar, use <strong>Ler de novo</strong> sem escolher o arquivo outra vez.</>
            : <>Identifique a DANFE pelo <strong>QR</strong>, pelo <strong>PDF</strong> ou por uma <strong>foto com OCR</strong>. Os itens ainda são à mão — a lista automática vem do XML/certificado.</>}
        </p>
        <CodeScanner rotulo="Ler QR da nota ou código do produto" onLeitura={aoLerCodigo} />
        <div className="flex flex-wrap gap-2">
          {arquivoLote && (
            <button
              type="button"
              className="btn-primario"
              disabled={lendoArquivo}
              onClick={() => void aoEscolherArquivo(arquivoLote)}
            >
              <FileUp size={16} /> {lendoArquivo ? "Lendo PDF do lote…" : "Ler de novo o PDF do lote"}
            </button>
          )}
          <button
            type="button"
            className="btn-secundario"
            disabled={lendoArquivo}
            onClick={() => inputPdfRef.current?.click()}
          >
            <FileUp size={16} /> {lendoArquivo ? "Lendo…" : arquivoLote ? "Trocar PDF…" : "PDF da DANFE"}
          </button>
          <button
            type="button"
            className="btn-secundario"
            disabled={lendoArquivo}
            onClick={() => inputFotoRef.current?.click()}
          >
            <Camera size={16} /> {lendoArquivo ? "Lendo…" : "Foto / OCR"}
          </button>
          <input
            ref={inputPdfRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => void aoEscolherArquivo(e.target.files?.[0] ?? null)}
          />
          <input
            ref={inputFotoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void aoEscolherArquivo(e.target.files?.[0] ?? null)}
          />
        </div>
        {lendoArquivo && (
          <p className="rounded-card bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Lendo o PDF{arquivoLote ? ` (${arquivoLote.name})` : ""} — texto e OCR…
          </p>
        )}
        {avisoScanner && (
          <p className="rounded-card bg-destaque-clara px-3 py-2 text-sm text-destaque">{avisoScanner}</p>
        )}
        {notaIdentificada && (
          <div className="space-y-1 rounded-card bg-sucesso-clara px-3 py-2 text-sm text-primaria-escura">
            <p>
              <ReceiptText size={14} className="mr-1 inline" />
              Nota nº {notaIdentificada.numero} identificada {rotuloOrigem(origemNota)}
              {arquivoLote ? " a partir do arquivo do lote" : ""}.
            </p>
            <p className="text-xs text-slate-600">
              Chave …{notaIdentificada.chave.slice(-8)} · CNPJ {formatarCnpj(notaIdentificada.cnpj)}
              {fornecedorId
                ? ` — ${nomeFornecedor(db, fornecedorId)}`
                : " — cadastre ou escolha o fornecedor abaixo (ainda não está nos Cadastros)."}
            </p>
            <p className="text-xs text-slate-600">
              Os itens você preenche abaixo — a lista automática de itens vem com o XML ou certificado.
            </p>
          </div>
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
