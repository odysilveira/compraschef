"use client";

// Recebimento de mercadoria (requisitos 31–35):
// Passo 1 — escolher o pedido; Passo 2 — conferência item a item com scanner,
// foto e divergência; Finalizar — entrada no estoque, nota e boletos.

import { useRef, useState } from "react";
import Link from "next/link";
import {
  FileStack,
  ArrowLeft,
  Camera,
  CircleCheck,
  RefreshCcw,
  PackageCheck,
  PackagePlus,
  ReceiptText,
  FileText,
  TriangleAlert,
} from "lucide-react";
import { Badge, Campo, Card, Modal, TituloPagina, Vazio } from "@/components/ui";
import CodeScanner from "@/components/scanner/CodeScanner";
import CampoQuantidade from "@/components/operacao/CampoQuantidade";
import ReceberPorNota from "@/components/operacao/ReceberPorNota";
import ReceberAvulso from "@/components/operacao/ReceberAvulso";
import ImportarNfse from "@/components/operacao/ImportarNfse";
import ImportarLote, { type AcaoLoteArquivo } from "@/components/operacao/ImportarLote";
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
import { converterParaUnidadeUso, precoPorUnidadeUso } from "@/lib/domain/produtos";
import { criarLote } from "@/lib/domain/estoque";
import {
  avaliarCompletudeNotaFiscal,
  boletosNaoConferidosDaNota,
  corrigirFornecedorNotaFiscal,
  indicadorCompletudeNota,
} from "@/lib/domain/nfe-completude";
import {
  marcarItemConcluido,
  marcarItemPendente,
  quantidadeFilaAberta,
  useFilaLoteRecebimento,
} from "@/lib/domain/lote-recebimento-store";
import { contarItensAbertos } from "@/lib/domain/lote-recebimento-fila";
import { podeVerValores, usePapel } from "@/lib/roles";
import { cnpjBR, dataBR, moeda, qtd } from "@/lib/format";
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
  const filaLote = useFilaLoteRecebimento();
  const abertosLote = contarItensAbertos(filaLote);

  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [modoNota, setModoNota] = useState(false);
  const [modoAvulso, setModoAvulso] = useState(false);
  const [modoNfse, setModoNfse] = useState(false);
  const [modoLote, setModoLote] = useState(false);
  const [arquivoLote, setArquivoLote] = useState<File | null>(null);
  const [itemLoteId, setItemLoteId] = useState<string | null>(null);
  const [notaConferirId, setNotaConferirId] = useState<string | null>(null);
  const [notaCorrecaoId, setNotaCorrecaoId] = useState<string | null>(null);
  const [filtroCompletudeNfe, setFiltroCompletudeNfe] = useState<"todas" | "pendentes" | "completas">("todas");
  const [fornecedorCorrecaoId, setFornecedorCorrecaoId] = useState("");
  const [justificativaCorrecao, setJustificativaCorrecao] = useState("");
  const [mensagemCorrecaoNfe, setMensagemCorrecaoNfe] = useState<string | null>(null);
  const [erroCorrecaoNfe, setErroCorrecaoNfe] = useState<string | null>(null);
  const [salvandoCorrecaoNfe, setSalvandoCorrecaoNfe] = useState(false);
  const [conferencia, setConferencia] = useState<Record<string, ConferenciaItem>>({});
  const [destaqueItem, setDestaqueItem] = useState<string | null>(null);
  const [avisoScanner, setAvisoScanner] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const timerDestaque = useRef<ReturnType<typeof setTimeout> | null>(null);
  const salvandoCorrecaoNfeRef = useRef(false);

  const pedidosParaReceber = db.pedidos.filter((p) => p.status === "enviado" || p.status === "confirmado");
  // DANFEs baixadas da Receita (via certificado) aguardando conferência
  const notasImportadas = db.notas_fiscais.filter(
    (n) => n.status === "aguardando_conferencia" && n.itens_importados && n.itens_importados.length > 0
  );
  const notasImportadasCompletude = notasImportadas.map((nota) => ({
    nota,
    completude: avaliarCompletudeNotaFiscal(db, nota),
    indicador: indicadorCompletudeNota(db, nota),
  }));
  const notasImportadasFiltradas = notasImportadasCompletude.filter((item) => {
    if (filtroCompletudeNfe === "todas") return true;
    if (filtroCompletudeNfe === "pendentes") return item.indicador === "pendente";
    return item.indicador === "completa";
  });
  const notaCorrecao = notaCorrecaoId ? db.notas_fiscais.find((n) => n.id === notaCorrecaoId) ?? null : null;
  const correcaoSemMudanca = Boolean(notaCorrecao && fornecedorCorrecaoId === notaCorrecao.fornecedor_id);
  const completudeNotaCorrecao = notaCorrecao ? avaliarCompletudeNotaFiscal(db, notaCorrecao) : null;
  const boletosPendentesReconferencia = notaCorrecao ? boletosNaoConferidosDaNota(db, notaCorrecao.id) : [];
  const pedido = db.pedidos.find((p) => p.id === pedidoId);
  const itensPedido = pedido ? db.pedido_itens.filter((i) => i.pedido_id === pedido.id) : [];

  function abrirCorrecaoNfe(notaId: string) {
    const nota = db.notas_fiscais.find((n) => n.id === notaId);
    if (!nota) return;
    setNotaCorrecaoId(notaId);
    setFornecedorCorrecaoId(nota.fornecedor_id || "");
    setJustificativaCorrecao("");
    setMensagemCorrecaoNfe(null);
    setErroCorrecaoNfe(null);
  }

  function fecharCorrecaoNfe() {
    setNotaCorrecaoId(null);
    setFornecedorCorrecaoId("");
    setJustificativaCorrecao("");
    setMensagemCorrecaoNfe(null);
    setErroCorrecaoNfe(null);
    setSalvandoCorrecaoNfe(false);
    salvandoCorrecaoNfeRef.current = false;
  }

  function salvarCorrecaoFornecedorNfe() {
    if (salvandoCorrecaoNfeRef.current) return;
    if (!notaCorrecao) return;
    if (!fornecedorCorrecaoId) {
      setErroCorrecaoNfe("Selecione um fornecedor válido.");
      return;
    }
    if (correcaoSemMudanca) {
      setErroCorrecaoNfe("Selecione um fornecedor diferente do já vinculado para salvar a correção.");
      return;
    }

    salvandoCorrecaoNfeRef.current = true;
    setSalvandoCorrecaoNfe(true);

    try {
      const proximo = structuredClone(db);
      const resultado = corrigirFornecedorNotaFiscal(proximo, {
        notaId: notaCorrecao.id,
        fornecedorIdNovo: fornecedorCorrecaoId,
        responsavel: "usuário local",
        justificativa: justificativaCorrecao,
        gerarIdRegistro: () => uid("nfe-corr"),
      });

      if (!resultado.sucesso) {
        setErroCorrecaoNfe(resultado.mensagem ?? "Não foi possível corrigir fornecedor da NF-e.");
        setMensagemCorrecaoNfe(null);
        return;
      }

      mutate((d) => {
        Object.assign(d, proximo);
      });

      setErroCorrecaoNfe(null);
      setMensagemCorrecaoNfe(resultado.alterou ? "Fornecedor da NF-e corrigido com sucesso." : resultado.mensagem ?? "Nenhuma alteração necessária.");
    } finally {
      setSalvandoCorrecaoNfe(false);
      salvandoCorrecaoNfeRef.current = false;
    }
  }

  function reconferirBoletosPendentesNfe() {
    if (!notaCorrecao) return;
    let atualizados = 0;
    mutate((d) => {
      const pendentes = boletosNaoConferidosDaNota(d, notaCorrecao.id);
      for (const boleto of pendentes) {
        if (boleto.status_conferencia === "conferido") {
          continue;
        }
        boleto.status_conferencia = "em_analise";
        atualizados += 1;
      }
    });
    setErroCorrecaoNfe(null);
    setMensagemCorrecaoNfe(
      atualizados > 0
        ? `${atualizados} boleto${atualizados === 1 ? "" : "s"} não confirmado${atualizados === 1 ? "" : "s"} marcado${atualizados === 1 ? "" : "s"} para reconferência.`
        : "Nenhum boleto pendente para reconferência."
    );
  }

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
        const esperadaConvertida = converterParaUnidadeUso(d, item.produto_id, item.quantidade, {
          unidadeOrigemId: item.unidade_id,
          fornecedorId: pedido.fornecedor_id,
        });
        const recebidaConvertida = converterParaUnidadeUso(d, item.produto_id, c.recebida, {
          unidadeOrigemId: item.unidade_id,
          fornecedorId: pedido.fornecedor_id,
        });
        const recebimentoItemId = uid("ri");
        d.recebimento_itens.push({
          id: recebimentoItemId,
          recebimento_id: recebimentoId,
          produto_id: item.produto_id,
          qtd_esperada: esperadaConvertida.quantidadeUso,
          qtd_recebida: recebidaConvertida.quantidadeUso,
          qtd_esperada_origem: item.quantidade,
          qtd_recebida_origem: c.recebida,
          unidade_origem_id: item.unidade_id,
          fator_conversao_aplicado: recebidaConvertida.fator,
          validade: c.validade || undefined,
          divergencia: c.divergencia.trim() || undefined,
          foto_url: c.foto_url,
        });
        if (recebidaConvertida.quantidadeUso > 0) {
          criarLote(d, {
            id: uid("lote"),
            produto_id: item.produto_id,
            recebimento_item_id: recebimentoItemId,
            origem: "recebimento",
            quantidade: recebidaConvertida.quantidadeUso,
            data_entrada: agora.slice(0, 10),
            validade: c.validade || undefined,
            criado_em: agora,
            atualizado_em: agora,
          });
          d.movimentos_estoque.unshift({
            id: uid("mov"),
            produto_id: item.produto_id,
            tipo: "entrada",
            quantidade: recebidaConvertida.quantidadeUso,
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
              preco: precoPorUnidadeUso(d, item.produto_id, item.preco_unitario, {
                unidadeOrigemId: item.unidade_id,
                fornecedorId: pedido.fornecedor_id,
              }),
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
      enviarEstoqueTotal(produto?.codigo_externo, estoqueAtual(dbNovo, item.produto_id));
    });

    setResultado({ status, temNota: Boolean(nota), boletosLiberados });
  }

  function recomecar() {
    setPedidoId(null);
    setModoNota(false);
    setModoAvulso(false);
    setModoNfse(false);
    setModoLote(false);
    setArquivoLote(null);
    setItemLoteId(null);
    setNotaConferirId(null);
    setConferencia({});
    setResultado(null);
    setDestaqueItem(null);
    setAvisoScanner(null);
  }

  /** Sai do XML/NFS-e/avulso sem concluir — devolve o item à fila e reabre o lote. */
  function voltarDoFluxoLote() {
    if (itemLoteId) marcarItemPendente(itemLoteId);
    setModoNota(false);
    setModoAvulso(false);
    setModoNfse(false);
    setArquivoLote(null);
    setItemLoteId(null);
    if (quantidadeFilaAberta() > 0) setModoLote(true);
  }

  function finalizarItemLoteSeHouver() {
    if (itemLoteId) marcarItemConcluido(itemLoteId);
    setArquivoLote(null);
    setItemLoteId(null);
  }

  function continuarLoteAposResultado() {
    setResultado(null);
    setModoNota(false);
    setModoAvulso(false);
    setModoNfse(false);
    setArquivoLote(null);
    setItemLoteId(null);
    setModoLote(true);
  }

  // ---------- Tela final ----------
  if (resultado) {
    const ok = resultado.status === "ok";
    const restamLote = quantidadeFilaAberta();
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
            {restamLote > 0 && (
              <p className="text-sm font-medium text-primaria-escura">
                Ainda há {restamLote} arquivo{restamLote === 1 ? "" : "s"} a conciliar no lote.
              </p>
            )}
          </div>
        </Card>
        {restamLote > 0 && (
          <button className="btn-gigante" onClick={continuarLoteAposResultado}>
            <FileStack size={28} /> Continuar lote ({restamLote})
          </button>
        )}
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
          arquivoInicial={arquivoLote}
          onVoltar={() => {
            if (itemLoteId) voltarDoFluxoLote();
            else {
              setModoNota(false);
              setArquivoLote(null);
            }
          }}
          aoFinalizar={(r) => {
            finalizarItemLoteSeHouver();
            setResultado({
              status: r.status,
              temNota: true,
              boletosLiberados: r.boletosLiberados,
              mensagemExtra: `Nota de ${r.fornecedorNome} registrada no financeiro${
                r.boletos > 0 ? ` com ${r.boletos} boleto${r.boletos === 1 ? "" : "s"}` : ""
              }${r.vinculouPedido ? " · pedido do fornecedor marcado como entregue" : ""}.`,
            });
          }}
        />
      </div>
    );
  }

  // ---------- NFS-e (serviço / PDF) ----------
  if (modoNfse) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <TituloPagina titulo="NFS-e — nota de serviço" />
        <ImportarNfse
          arquivoInicial={arquivoLote}
          onVoltar={() => {
            if (itemLoteId) voltarDoFluxoLote();
            else {
              setModoNfse(false);
              setArquivoLote(null);
            }
          }}
          onConcluido={(r) => {
            finalizarItemLoteSeHouver();
            setResultado({
              status: "ok",
              temNota: true,
              boletosLiberados: 1,
              mensagemExtra: `NFS-e de ${r.fornecedorNome} (${moeda(r.valor)}) registrada · pagamento via ${r.meio.toUpperCase()} · título liberado na agenda (sem estoque).`,
            });
          }}
        />
      </div>
    );
  }

  // ---------- Conferir uma DANFE importada da Receita ----------
  if (notaConferirId) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <TituloPagina titulo="Conferir nota importada" />
        <ReceberPorNota
          db={db}
          usuarioId={usuarioId}
          notaImportadaId={notaConferirId}
          onVoltar={() => setNotaConferirId(null)}
          aoFinalizar={(r) =>
            setResultado({
              status: r.status,
              temNota: true,
              boletosLiberados: r.boletosLiberados,
              mensagemExtra: `Nota de ${r.fornecedorNome} conferida${
                r.boletos > 0
                  ? ` · ${r.boletosLiberados} de ${r.boletos} boleto${r.boletos === 1 ? "" : "s"} liberado${
                      r.boletosLiberados === 1 ? "" : "s"
                    }`
                  : ""
              }.`,
            })
          }
        />
      </div>
    );
  }

  // ---------- Modo avulso (QR da nota ou sem nota) ----------
  if (modoAvulso) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <TituloPagina titulo="Recebimento sem XML" />
        <ReceberAvulso
          db={db}
          usuarioId={usuarioId}
          verValores={verValores}
          arquivoInicial={arquivoLote}
          onVoltar={() => {
            if (itemLoteId) voltarDoFluxoLote();
            else {
              setModoAvulso(false);
              setArquivoLote(null);
            }
          }}
          aoFinalizar={(r) => {
            finalizarItemLoteSeHouver();
            setResultado({
              status: r.status,
              temNota: r.boletos > 0,
              boletosLiberados: r.boletosLiberados,
              mensagemExtra: `Entrada de ${r.fornecedorNome} registrada${
                r.vinculouPedido ? " · pedido do fornecedor marcado como entregue" : ""
              }.`,
            });
          }}
        />
      </div>
    );
  }

  // ---------- Importar lote (Downloads do e-mail) ----------
  if (modoLote) {
    const abrirDoLote = (acao: AcaoLoteArquivo) => {
      setItemLoteId(acao.id);
      setArquivoLote(acao.arquivo);
      setModoLote(false);
      if (acao.tipo === "xml_nfe") setModoNota(true);
      else if (acao.tipo === "pdf_nfse") setModoNfse(true);
      else if (acao.tipo === "pdf_danfe" || acao.tipo === "imagem") setModoAvulso(true);
    };

    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <TituloPagina titulo="Importar lote" />
        <ImportarLote
          onVoltar={() => {
            setModoLote(false);
            setArquivoLote(null);
            setItemLoteId(null);
          }}
          onAbrirFluxo={abrirDoLote}
        />
      </div>
    );
  }

  // ---------- Passo 1: escolher pedido ----------
  if (!pedido) {
    return (
      <>
        <div className="space-y-4">
          <TituloPagina titulo="Recebimento" />
          {abertosLote > 0 && (
            <button
              type="button"
              className="card flex w-full items-center gap-3 border-2 border-destaque bg-destaque-clara p-4 text-left transition-colors hover:opacity-95"
              onClick={() => setModoLote(true)}
            >
              <FileStack size={28} className="shrink-0 text-destaque" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold text-primaria-escura">A conciliar</span>
                  <Badge cor="laranja">{abertosLote}</Badge>
                </span>
                <span className="block text-sm text-slate-700">
                  Arquivos do lote ainda pendentes — salvos neste navegador até conciliar.
                </span>
              </span>
            </button>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            className="card flex items-center gap-3 border-2 border-dashed border-primaria p-5 text-left transition-colors hover:bg-primaria-clara"
            onClick={() => setModoNota(true)}
          >
            <ReceiptText size={32} className="shrink-0 text-primaria" />
            <span>
              <span className="block text-lg font-bold">Ler nota fiscal (XML)</span>
              <span className="block text-sm text-slate-600">
                Importe o XML da NF-e e confirme os itens um a um.
              </span>
            </span>
          </button>
          <button
            className="card flex items-center gap-3 border-2 border-dashed border-primaria p-5 text-left transition-colors hover:bg-primaria-clara"
            onClick={() => setModoAvulso(true)}
          >
            <PackagePlus size={32} className="shrink-0 text-primaria" />
            <span>
              <span className="block text-lg font-bold">Receber sem XML</span>
              <span className="block text-sm text-slate-600">
                QR, PDF da DANFE ou foto com OCR — ou preencha à mão (hortifrúti, feira).
              </span>
            </span>
          </button>
          <button
            className="card flex items-center gap-3 border-2 border-dashed border-primaria p-5 text-left transition-colors hover:bg-primaria-clara sm:col-span-2"
            onClick={() => setModoNfse(true)}
          >
            <FileText size={32} className="shrink-0 text-primaria" />
            <span>
              <span className="block text-lg font-bold">Importar NFS-e (PDF)</span>
              <span className="block text-sm text-slate-600">
                Nota de serviço da prefeitura — Anota AI, software, etc. Gera título boleto ou PIX, sem estoque.
              </span>
            </span>
          </button>
          <button
            className="card flex items-center gap-3 border-2 border-dashed border-primaria p-5 text-left transition-colors hover:bg-primaria-clara sm:col-span-2"
            onClick={() => setModoLote(true)}
          >
            <FileStack size={32} className="shrink-0 text-primaria" />
            <span>
              <span className="block text-lg font-bold">Importar lote (e-mail)</span>
              <span className="block text-sm text-slate-600">
                Vários XMLs, PDFs e fotos de uma vez — classifica, você confere e abre o fluxo certo.
              </span>
            </span>
          </button>
          </div>

          {notasImportadas.length > 0 && (
            <section>
            <h2 className="mb-2 flex items-center gap-2">
              <ReceiptText size={20} className="text-primaria" /> Notas importadas da Receita
            </h2>
            <p className="mb-3 text-sm text-slate-600">
              Baixadas automaticamente pelo certificado digital. Toque para conferir os itens.
            </p>
            <div className="mb-3 flex items-center gap-2">
              <label className="text-sm text-slate-700">Completude:</label>
              <select
                className="campo w-full max-w-56"
                value={filtroCompletudeNfe}
                onChange={(event) => setFiltroCompletudeNfe(event.target.value as "todas" | "pendentes" | "completas")}
              >
                <option value="todas">Todas</option>
                <option value="pendentes">Com pendências</option>
                <option value="completas">Completas</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {notasImportadasFiltradas.map(({ nota: n, completude, indicador }) => {
                const numItens = n.itens_importados?.length ?? 0;
                return (
                  <Card key={n.id} className="space-y-3 border-2 border-transparent p-5">
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="text-lg font-bold">{nomeFornecedor(db, n.fornecedor_id)}</span>
                      <span className="flex items-center gap-2">
                        <Badge cor="laranja">a conferir</Badge>
                        <Badge cor={indicador === "completa" ? "verde" : "laranja"}>
                          {indicador === "completa" ? "completa" : "pendente"}
                        </Badge>
                      </span>
                    </span>
                    <span className="text-sm text-slate-600">
                      Nota nº {n.numero} · {numItens} {numItens === 1 ? "item" : "itens"}
                    </span>
                    {verValores && <span className="text-sm font-semibold">{moeda(n.valor_total)}</span>}

                    {completude.pendencias.length > 0 && (
                      <p className="text-xs text-destaque">
                        {completude.pendencias.length} pendência{completude.pendencias.length === 1 ? "" : "s"} de completude.
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        className="btn-secundario"
                        onClick={() => abrirCorrecaoNfe(n.id)}
                      >
                        Completar ou corrigir dados
                      </button>
                      <button
                        type="button"
                        className="btn-primario"
                        onClick={() => setNotaConferirId(n.id)}
                      >
                        Conferir itens
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
            </section>
          )}

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

        <Modal aberto={Boolean(notaCorrecao)} titulo="Completar ou corrigir dados da NF-e" onFechar={fecharCorrecaoNfe}>
          {notaCorrecao && (
            <div className="space-y-3">
            <Card className="space-y-2 bg-slate-50 py-3">
              <p className="text-sm font-semibold text-slate-800">Dados fiscais importados (somente leitura)</p>
              <p className="text-sm text-slate-700">Nota: {notaCorrecao.numero || "—"}</p>
              <p className="text-sm text-slate-700">Razão social emitente: {notaCorrecao.razao_social_emitente || "Não disponível na importação original"}</p>
              <p className="text-sm text-slate-700">Chave de acesso: {notaCorrecao.chave_acesso || "—"}</p>
              <p className="text-sm text-slate-700">CNPJ emitente: {cnpjBR(notaCorrecao.cnpj_emitente)}</p>
              <p className="text-sm text-slate-700">Valor total: {moeda(notaCorrecao.valor_total)}</p>
            </Card>

            <Campo rotulo="Fornecedor vinculado no ComprasChef">
              <select
                className="campo"
                value={fornecedorCorrecaoId}
                onChange={(event) => {
                  setFornecedorCorrecaoId(event.target.value);
                  setErroCorrecaoNfe(null);
                }}
              >
                <option value="">Selecione</option>
                {db.fornecedores
                  .filter((fornecedor) => fornecedor.ativo)
                  .map((fornecedor) => (
                    <option key={fornecedor.id} value={fornecedor.id}>
                      {fornecedor.nome}
                    </option>
                  ))}
              </select>
            </Campo>

            <Campo rotulo="Justificativa da correção (opcional)">
              <textarea
                className="campo min-h-20"
                value={justificativaCorrecao}
                onChange={(event) => setJustificativaCorrecao(event.target.value)}
              />
            </Campo>

            {completudeNotaCorrecao && completudeNotaCorrecao.pendencias.length > 0 && (
              <Card className="space-y-1 border border-destaque bg-destaque-clara py-3">
                <p className="text-sm font-semibold text-destaque">Pendências de completude</p>
                {completudeNotaCorrecao.pendencias.map((pendencia, index) => (
                  <p key={`${pendencia.codigo}-${index}`} className="text-sm text-destaque">{pendencia.mensagem}</p>
                ))}
              </Card>
            )}

            {completudeNotaCorrecao && completudeNotaCorrecao.alertas.length > 0 && (
              <Card className="space-y-1 border border-slate-300 bg-white py-3">
                <p className="text-sm font-semibold text-slate-700">Avisos</p>
                {completudeNotaCorrecao.alertas.map((alerta, index) => (
                  <p key={`alerta-${index}`} className="text-sm text-slate-600">{alerta}</p>
                ))}
              </Card>
            )}

            <Card className="space-y-2 border border-slate-200 py-3">
              <p className="text-sm font-semibold text-slate-800">Reconferência de boletos</p>
              <p className="text-sm text-slate-600">
                Boletos não confirmados desta NF-e: {boletosPendentesReconferencia.length}
              </p>
              <button type="button" className="btn-secundario" onClick={reconferirBoletosPendentesNfe}>
                <RefreshCcw size={16} /> Reconferir somente boletos não confirmados
              </button>
            </Card>

            {erroCorrecaoNfe && <p className="rounded-card bg-erro-clara px-3 py-2 text-sm text-erro">{erroCorrecaoNfe}</p>}
            {mensagemCorrecaoNfe && (
              <p className="rounded-card border border-sucesso bg-sucesso-clara px-3 py-2 text-sm text-primaria-escura">
                {mensagemCorrecaoNfe}
              </p>
            )}

            {Array.isArray(notaCorrecao.correcoes_fornecedor) && notaCorrecao.correcoes_fornecedor.length > 0 && (
              <Card className="space-y-1 border border-slate-200 py-3">
                <p className="text-sm font-semibold text-slate-800">Histórico de correções de fornecedor</p>
                {notaCorrecao.correcoes_fornecedor.map((correcao) => (
                  <p key={correcao.id} className="text-xs text-slate-600">
                    {dataBR(correcao.corrigido_em)} · {nomeFornecedor(db, correcao.fornecedor_anterior_id)} para {nomeFornecedor(db, correcao.fornecedor_novo_id)} · {correcao.corrigido_por}
                  </p>
                ))}
              </Card>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secundario" onClick={fecharCorrecaoNfe}>
                Fechar
              </button>
              <button
                type="button"
                className="btn-primario"
                onClick={salvarCorrecaoFornecedorNfe}
                disabled={salvandoCorrecaoNfe || correcaoSemMudanca || !fornecedorCorrecaoId}
              >
                {salvandoCorrecaoNfe ? "Salvando..." : "Salvar correção"}
              </button>
            </div>
            </div>
          )}
        </Modal>
      </>
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
