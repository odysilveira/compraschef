"use client";

// Recebimento de mercadoria (requisitos 31–35):
// Passo 1 — escolher o pedido; Passo 2 — conferência item a item com scanner,
// foto e divergência; Finalizar — entrada no estoque, nota e boletos.

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  CircleCheck,
  PackageCheck,
  ReceiptText,
  TriangleAlert,
} from "lucide-react";
import { Badge, Campo, Card, TituloPagina, Vazio } from "@/components/ui";
import CodeScanner from "@/components/scanner/CodeScanner";
import CampoQuantidade from "@/components/operacao/CampoQuantidade";
import ReceberPorNota from "@/components/operacao/ReceberPorNota";
import {
  estoqueAtual,
  mutate,
  nomeFornecedor,
  nomeProduto,
  siglaUnidadeUso,
  uid,
  useDB,
} from "@/lib/data";
import { enviarEstoqueTotal } from "@/lib/integracao";
import { podeVerValores, usePapel } from "@/lib/roles";
import { dataBR, moeda, qtd } from "@/lib/format";
import type { StatusRecebimento } from "@/lib/types";

interface ConferenciaItem {
  recebida: number;
  validade: string; // ISO date
  divergencia: string;
  foto_url?: string;
  divergenciaAberta: boolean;
}

interface Resultado {
  status: StatusRecebimento;
  temNota: boolean;
  boletosLiberados: number;
  mensagemExtra?: string;
}

function hojeMais(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Lê a foto e reduz para um data URL pequeno (miniatura JPEG). */
function lerFotoPequena(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(leitor.error);
    leitor.onload = () => {
      const original = leitor.result as string;
      const img = new Image();
      img.onerror = () => resolve(original);
      img.onload = () => {
        const escala = Math.min(1, 480 / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * escala));
        canvas.height = Math.max(1, Math.round(img.height * escala));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(original);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
      img.src = original;
    };
    leitor.readAsDataURL(arquivo);
  });
}

export default function RecebimentoPage() {
  const db = useDB();
  const { papel } = usePapel();
  const verValores = podeVerValores(papel);
  const usuarioId = db.perfis.find((p) => p.papel === papel)?.id ?? "perfil-dono";

  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [modoNota, setModoNota] = useState(false);
  const [conferencia, setConferencia] = useState<Record<string, ConferenciaItem>>({});
  const [destaqueItem, setDestaqueItem] = useState<string | null>(null);
  const [avisoScanner, setAvisoScanner] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const timerDestaque = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pedidosParaReceber = db.pedidos.filter((p) => p.status === "enviado" || p.status === "confirmado");
  const pedido = db.pedidos.find((p) => p.id === pedidoId);
  const itensPedido = pedido ? db.pedido_itens.filter((i) => i.pedido_id === pedido.id) : [];

  function escolherPedido(id: string) {
    const itens = db.pedido_itens.filter((i) => i.pedido_id === id);
    const inicial: Record<string, ConferenciaItem> = {};
    itens.forEach((item) => {
      const produto = db.produtos.find((p) => p.id === item.produto_id);
      inicial[item.id] = {
        recebida: item.quantidade,
        validade: hojeMais(produto?.validade_padrao_dias ?? 30),
        divergencia: "",
        divergenciaAberta: false,
      };
    });
    setConferencia(inicial);
    setPedidoId(id);
    setResultado(null);
    setAvisoScanner(null);
  }

  function atualizarItem(itemId: string, mudanca: Partial<ConferenciaItem>) {
    setConferencia((atual) => ({ ...atual, [itemId]: { ...atual[itemId], ...mudanca } }));
  }

  function aoBipar(codigo: string) {
    const limpo = codigo.trim();
    const item = itensPedido.find((i) => {
      const produto = db.produtos.find((p) => p.id === i.produto_id);
      return produto?.codigo_barras === limpo;
    });
    if (!item) {
      setAvisoScanner(`Código "${limpo}" não corresponde a nenhum item deste pedido.`);
      return;
    }
    setAvisoScanner(null);
    setDestaqueItem(item.id);
    document.getElementById(`item-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (timerDestaque.current) clearTimeout(timerDestaque.current);
    timerDestaque.current = setTimeout(() => setDestaqueItem(null), 4000);
  }

  async function anexarFoto(itemId: string, arquivo: File | undefined) {
    if (!arquivo) return;
    try {
      const dataUrl = await lerFotoPequena(arquivo);
      atualizarItem(itemId, { foto_url: dataUrl });
    } catch {
      // leitura falhou — segue sem foto
    }
  }

  function finalizar() {
    if (!pedido) return;
    const agora = new Date().toISOString();

    let temDivergenciaTexto = false;
    let temFalta = false;
    let temSobra = false;
    itensPedido.forEach((item) => {
      const c = conferencia[item.id];
      if (!c) return;
      if (c.divergencia.trim()) temDivergenciaTexto = true;
      if (c.recebida < item.quantidade) temFalta = true;
      if (c.recebida > item.quantidade) temSobra = true;
    });
    const status: StatusRecebimento = temDivergenciaTexto || temSobra ? "divergente" : temFalta ? "parcial" : "ok";
    const tudoOk = status === "ok";

    const nota = db.notas_fiscais.find((n) => n.pedido_id === pedido.id);
    let boletosLiberados = 0;

    const recebimentoId = uid("rec");
    const dbNovo = mutate((d) => {
      d.recebimentos.unshift({
        id: recebimentoId,
        pedido_id: pedido.id,
        nota_id: nota?.id,
        status,
        recebido_por: usuarioId,
        recebido_em: agora,
      });

      itensPedido.forEach((item) => {
        const c = conferencia[item.id];
        if (!c) return;
        d.recebimento_itens.push({
          id: uid("ri"),
          recebimento_id: recebimentoId,
          produto_id: item.produto_id,
          qtd_esperada: item.quantidade,
          qtd_recebida: c.recebida,
          validade: c.validade || undefined,
          divergencia: c.divergencia.trim() || undefined,
          foto_url: c.foto_url,
        });
        if (c.recebida > 0) {
          d.movimentos_estoque.unshift({
            id: uid("mov"),
            produto_id: item.produto_id,
            tipo: "entrada",
            quantidade: c.recebida,
            recebimento_id: recebimentoId,
            usuario_id: usuarioId,
            criado_em: agora,
            sincronizado: false,
          });
          // Registra o preço pago no histórico (requisito 34)
          if (item.preco_unitario > 0) {
            d.precos_historico.push({
              id: uid("ph"),
              produto_id: item.produto_id,
              fornecedor_id: pedido.fornecedor_id,
              preco: item.preco_unitario,
              origem: "nota",
              data: agora.slice(0, 10),
            });
          }
        }
      });

      const ped = d.pedidos.find((p) => p.id === pedido.id);
      if (ped) ped.status = "entregue";

      if (nota) {
        const nf = d.notas_fiscais.find((n) => n.id === nota.id);
        if (nf) nf.status = tudoOk ? "conferida" : "divergente";
        d.boletos.forEach((b) => {
          if (b.nota_id !== nota.id) return;
          if (b.status === "travado") {
            if (tudoOk) {
              b.status = "liberado";
              b.observacao = "Liberado após conferência OK da mercadoria";
              boletosLiberados += 1;
            } else {
              b.observacao =
                "Divergência no recebimento — liberação proporcional pendente de acerto com o fornecedor";
            }
          }
        });
      }
    });

    // Envia o novo total ao ERP parceiro (fora do mutate principal)
    itensPedido.forEach((item) => {
      const c = conferencia[item.id];
      if (!c || c.recebida <= 0) return;
      const produto = dbNovo.produtos.find((p) => p.id === item.produto_id);
      enviarEstoqueTotal(produto?.codigo_externo, estoqueAtual(dbNovo, item.produto_id) + c.recebida);
    });

    setResultado({ status, temNota: Boolean(nota), boletosLiberados });
  }

  function recomecar() {
    setPedidoId(null);
    setModoNota(false);
    setConferencia({});
    setResultado(null);
    setDestaqueItem(null);
    setAvisoScanner(null);
  }

  // ---------- Tela final ----------
  if (resultado) {
    const ok = resultado.status === "ok";
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <TituloPagina titulo="Recebimento" />
        <Card className={ok ? "border-2 border-sucesso bg-sucesso-clara" : "border-2 border-destaque bg-destaque-clara"}>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            {ok ? (
              <CircleCheck size={64} className="text-sucesso" />
            ) : (
              <TriangleAlert size={64} className="text-destaque" />
            )}
            <p className={`text-2xl font-bold ${ok ? "text-primaria-escura" : "text-destaque"}`}>
              {ok ? "Tudo certo!" : resultado.status === "parcial" ? "Recebimento parcial" : "Divergência registrada"}
            </p>
            <p className="text-sm text-slate-700">
              {ok
                ? resultado.temNota
                  ? resultado.boletosLiberados > 0
                    ? "Mercadoria conferida e entrada no estoque feita — boletos liberados para pagamento."
                    : "Mercadoria conferida e entrada no estoque feita."
                  : "Mercadoria conferida e entrada no estoque feita."
                : resultado.temNota
                  ? "A entrada foi registrada, mas os boletos continuam travados até o acerto com o fornecedor (liberação proporcional pendente)."
                  : "A entrada foi registrada com a divergência anotada."}
            </p>
            {resultado.mensagemExtra && <p className="text-sm text-slate-700">{resultado.mensagemExtra}</p>}
          </div>
        </Card>
        <button className="btn-gigante" onClick={recomecar}>
          <PackageCheck size={28} /> Novo recebimento
        </button>
        <Link href="/" className="btn-secundario w-full">
          Voltar ao painel
        </Link>
      </div>
    );
  }

  // ---------- Modo nota fiscal (XML) ----------
  if (modoNota) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <TituloPagina titulo="Recebimento pela nota" />
        <ReceberPorNota
          db={db}
          usuarioId={usuarioId}
          onVoltar={() => setModoNota(false)}
          aoFinalizar={(r) =>
            setResultado({
              status: r.status,
              temNota: true,
              boletosLiberados: r.boletosLiberados,
              mensagemExtra: `Nota de ${r.fornecedorNome} registrada no financeiro${
                r.boletos > 0 ? ` com ${r.boletos} boleto${r.boletos === 1 ? "" : "s"}` : ""
              }${r.vinculouPedido ? " · pedido do fornecedor marcado como entregue" : ""}.`,
            })
          }
        />
      </div>
    );
  }

  // ---------- Passo 1: escolher pedido ----------
  if (!pedido) {
    return (
      <div className="space-y-4">
        <TituloPagina titulo="Recebimento" />
        <button
          className="card flex w-full items-center gap-3 border-2 border-dashed border-primaria p-5 text-left transition-colors hover:bg-primaria-clara"
          onClick={() => setModoNota(true)}
        >
          <ReceiptText size={32} className="shrink-0 text-primaria" />
          <span>
            <span className="block text-lg font-bold">Ler nota fiscal (XML)</span>
            <span className="block text-sm text-slate-600">
              Importe o XML da NF-e e confirme os itens um a um — mesmo sem pedido no sistema.
            </span>
          </span>
        </button>
        <p className="text-sm text-slate-600">Ou toque no pedido que chegou para começar a conferência.</p>
        {pedidosParaReceber.length === 0 ? (
          <Vazio mensagem="Nenhum pedido aguardando entrega no momento." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {pedidosParaReceber.map((p) => {
              const numItens = db.pedido_itens.filter((i) => i.pedido_id === p.id).length;
              return (
                <button
                  key={p.id}
                  className="card flex flex-col items-start gap-2 border-2 border-transparent p-5 text-left transition-colors hover:border-primaria"
                  onClick={() => escolherPedido(p.id)}
                >
                  <span className="text-xl font-bold">{nomeFornecedor(db, p.fornecedor_id)}</span>
                  <span className="text-sm text-slate-600">
                    {numItens} {numItens === 1 ? "item" : "itens"} · pedido de {dataBR(p.criado_em)}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge cor={p.status === "confirmado" ? "verde" : "azul"}>
                      {p.status === "confirmado" ? "confirmado" : "enviado"}
                    </Badge>
                    {verValores && <span className="text-sm font-semibold">{moeda(p.valor_total)}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ---------- Passo 2: conferência item a item ----------
  return (
    <div className="space-y-4">
      <TituloPagina
        titulo={`Conferindo: ${nomeFornecedor(db, pedido.fornecedor_id)}`}
        acao={
          <button className="btn-secundario" onClick={recomecar}>
            <ArrowLeft size={18} /> Trocar pedido
          </button>
        }
      />

      <Card>
        <CodeScanner rotulo="Bipar item (código de barras)" onLeitura={aoBipar} />
        {avisoScanner && (
          <p className="mt-2 rounded-card bg-destaque-clara px-3 py-2 text-sm text-destaque">{avisoScanner}</p>
        )}
      </Card>

      <div className="space-y-3">
        {itensPedido.map((item) => {
          const c = conferencia[item.id];
          if (!c) return null;
          const sigla = siglaUnidadeUso(db, item.produto_id);
          const bateu = c.recebida === item.quantidade && !c.divergencia.trim();
          return (
            <Card
              key={item.id}
              className={`space-y-3 transition-shadow ${
                destaqueItem === item.id ? "ring-4 ring-destaque" : ""
              }`}
            >
              <div id={`item-${item.id}`} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{nomeProduto(db, item.produto_id)}</p>
                  <p className="text-sm text-slate-600">Esperado: {qtd(item.quantidade, sigla)}</p>
                </div>
                {bateu ? (
                  <Badge cor="verde">
                    <CircleCheck size={14} /> bateu
                  </Badge>
                ) : (
                  <Badge cor="laranja">
                    <TriangleAlert size={14} /> diferente
                  </Badge>
                )}
              </div>

              <Campo rotulo={`Quantidade recebida${sigla ? ` (${sigla})` : ""}`}>
                <CampoQuantidade valor={c.recebida} onChange={(v) => atualizarItem(item.id, { recebida: v })} />
              </Campo>

              <Campo rotulo="Validade">
                <input
                  type="date"
                  className="campo"
                  value={c.validade}
                  onChange={(e) => atualizarItem(item.id, { validade: e.target.value })}
                />
              </Campo>

              <div className="flex flex-wrap gap-2">
                <label className="btn-secundario cursor-pointer">
                  <Camera size={18} /> {c.foto_url ? "Trocar foto" : "Anexar foto"}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => anexarFoto(item.id, e.target.files?.[0])}
                  />
                </label>
                <button
                  className="btn-secundario"
                  onClick={() => atualizarItem(item.id, { divergenciaAberta: !c.divergenciaAberta })}
                >
                  <TriangleAlert size={18} /> Registrar divergência
                </button>
              </div>

              {c.foto_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.foto_url} alt="Foto da mercadoria" className="max-h-40 rounded-card border border-slate-200" />
              )}

              {(c.divergenciaAberta || c.divergencia) && (
                <Campo rotulo="Descreva a divergência (falta, sobra, avaria, produto errado…)">
                  <textarea
                    className="campo"
                    rows={2}
                    value={c.divergencia}
                    onChange={(e) => atualizarItem(item.id, { divergencia: e.target.value })}
                    placeholder="Ex.: veio 1 caixa amassada, devolvida ao entregador"
                  />
                </Campo>
              )}
            </Card>
          );
        })}
      </div>

      <button className="btn-gigante" onClick={finalizar}>
        <PackageCheck size={28} /> Finalizar recebimento
      </button>
    </div>
  );
}
