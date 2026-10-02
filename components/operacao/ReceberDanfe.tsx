"use client";

/**
 * Recebimento pela DANFE (PDF): painel do PDF ao lado + conferência no estilo do XML
 * (confirmar item, cadastrar produto/fornecedor). Não substitui o XML — itens vêm
 * da leitura do PDF quando possível; o operador confere olhando a imagem.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CircleCheck,
  CircleX,
  FileUp,
  PackagePlus,
  Plus,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Badge, Campo, Card, Modal } from "@/components/ui";
import CampoQuantidade from "@/components/operacao/CampoQuantidade";
import CodeScanner from "@/components/scanner/CodeScanner";
import { SelectContaDre } from "@/components/cadastros/SelectContaDre";
import { estoqueAtual, mutate, nomeFornecedor, uid } from "@/lib/data";
import { enviarEstoqueTotal } from "@/lib/integracao";
import { memorizarContaDre, sugerirContaDre } from "@/lib/domain/dre";
import { inferirEntraNoCmv } from "@/lib/domain/produto-cmv";
import { criarLote } from "@/lib/domain/estoque";
import { identificarDanfeDeArquivo } from "@/lib/domain/danfe-captura-browser";
import type { NotaIdentificadaDanfe } from "@/lib/domain/danfe-identificacao";
import { localizarNotaFiscalPorChave } from "@/lib/domain/nfe-parcelas";
import { criarParcelaAguardandoDocumento } from "@/lib/domain/parcela-nota";
import { configurarWorkerPdfjs } from "@/lib/domain/pdfjs-worker";
import {
  codigoDeBarrasValido,
  registrarVinculoDaNota,
  unidadePorSigla,
} from "@/lib/domain/produtos";
import { moeda, qtd } from "@/lib/format";
import type { DB, Fornecedor, NotaFiscal, StatusRecebimento } from "@/lib/types";
import type { ResultadoNota } from "@/components/operacao/ReceberPorNota";

const ZOOM_MIN = 75;
const ZOOM_MAX = 250;
const ZOOM_PASSO = 25;
const ESCALA_RENDER_BASE = 1.75;
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
  /** Conta DRE sugerida / confirmada na conferência. */
  contaDreId: string;
}

/** Cadastro completo do produto (mesmo formulário do XML / ReceberPorNota). */
interface CadastroProdutoDanfe {
  indice: number;
  nome: string;
  codigoExterno: string;
  categoriaId?: string;
  codigoBarras: string;
  unidadeCompraId: string;
  unidadeUsoId: string;
  fatorConversao: number | "";
  estoqueMinimo: number | "";
  validadePadraoDias: number | "";
  controla_lote?: boolean;
  controla_validade?: boolean;
  ncm?: string;
  cest?: string;
  origemMercadoria?: string;
  cfopPadrao?: string;
  pontoPedido?: number | "";
  estoqueMaximo?: number | "";
  consumoMedioMensal?: number | "";
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
  const router = useRouter();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [lendo, setLendo] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [notaId, setNotaId] = useState<NotaIdentificadaDanfe | null>(null);
  const [nomeEmitente, setNomeEmitente] = useState("");
  const [itens, setItens] = useState<ItemConferencia[]>([]);
  const [decisoes, setDecisoes] = useState<Record<number, DecisaoItem>>({});
  const [fornecedorForm, setFornecedorForm] = useState<Fornecedor | null>(null);
  const [produtoForm, setProdutoForm] = useState<CadastroProdutoDanfe | null>(null);
  const [novoItemDesc, setNovoItemDesc] = useState("");
  const [novoItemQtd, setNovoItemQtd] = useState(1);
  const [mostrarIncluirItemManual, setMostrarIncluirItemManual] = useState(false);
  const [valorParcela, setValorParcela] = useState("");
  const [valorNotaLida, setValorNotaLida] = useState<number | undefined>(undefined);
  const [vencimentoParcela, setVencimentoParcela] = useState(() => hojeMais(7));
  const [criarParcelaPagamento, setCriarParcelaPagamento] = useState(true);
  const [zoomPdf, setZoomPdf] = useState(100);
  const [paginasPdf, setPaginasPdf] = useState<string[]>([]);
  const [carregandoPaginas, setCarregandoPaginas] = useState(false);
  const painelPdfRef = useRef<HTMLDivElement | null>(null);

  const ehPdf =
    arquivoInicial.type === "application/pdf" ||
    arquivoInicial.name.toLowerCase().endsWith(".pdf");

  const fornecedor = useMemo(() => {
    if (!notaId) return undefined;
    return db.fornecedores.find((f) => somenteDigitos(f.cnpj) === notaId.cnpj);
  }, [db.fornecedores, notaId]);

  const notaExistente: NotaFiscal | undefined = useMemo(() => {
    if (!notaId?.chave) return undefined;
    return localizarNotaFiscalPorChave(db, notaId.chave);
  }, [db, notaId?.chave]);

  const jaConferida = Boolean(
    notaExistente && (notaExistente.status === "conferida" || notaExistente.status === "divergente")
  );

  const parcelaJaExiste = useMemo(() => {
    if (!notaExistente) return false;
    return db.boletos.some(
      (b) =>
        b.nota_id === notaExistente.id &&
        b.status !== "suspeito" &&
        !(b.observacao?.startsWith("GOLPE CONFIRMADO"))
    );
  }, [db.boletos, notaExistente]);

  useEffect(() => {
    const url = URL.createObjectURL(arquivoInicial);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivoInicial]);

  /** Renderiza todas as páginas do PDF (ou usa a foto) para conferência com zoom + rolagem completa. */
  useEffect(() => {
    let cancelado = false;

    (async () => {
      if (!ehPdf) {
        setPaginasPdf(pdfUrl ? [pdfUrl] : []);
        return;
      }

      setCarregandoPaginas(true);
      setPaginasPdf([]);
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        configurarWorkerPdfjs(pdfjs);
        const buffer = await arquivoInicial.arrayBuffer();
        const dados = new Uint8Array(buffer.slice(0));
        const loadingTask = pdfjs.getDocument({ data: dados });
        const doc = await loadingTask.promise;
        const urls: string[] = [];
        try {
          for (let i = 1; i <= doc.numPages; i += 1) {
            if (cancelado) return;
            const page = await doc.getPage(i);
            const viewport = page.getViewport({ scale: ESCALA_RENDER_BASE });
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.floor(viewport.width));
            canvas.height = Math.max(1, Math.floor(viewport.height));
            const ctx = canvas.getContext("2d", { alpha: false });
            if (!ctx) continue;
            await page.render({ canvasContext: ctx, viewport, canvas }).promise;
            urls.push(canvas.toDataURL("image/jpeg", 0.92));
          }
        } finally {
          const destruir = (doc as { destroy?: () => Promise<void> }).destroy;
          if (destruir) await destruir.call(doc).catch(() => undefined);
        }
        if (!cancelado) setPaginasPdf(urls);
      } catch {
        // fallback: iframe nativo se o render falhar
        if (!cancelado) setPaginasPdf([]);
      } finally {
        if (!cancelado) setCarregandoPaginas(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [arquivoInicial, ehPdf, pdfUrl]);

  // Listener nativo não-passivo: impede o zoom da página do Chrome ao usar Ctrl+scroll no PDF
  useEffect(() => {
    const el = painelPdfRef.current;
    if (!el) return;
    const onWheel = (event: globalThis.WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const direcao = event.deltaY > 0 ? -ZOOM_PASSO : ZOOM_PASSO;
      setZoomPdf((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + direcao)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [pdfUrl, paginasPdf.length]);

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
        const valorLido = resultado.dados?.valorTotalNota;
        const notaJa = resultado.nota?.chave
          ? localizarNotaFiscalPorChave(db, resultado.nota.chave)
          : undefined;
        // Preferir valor já salvo na NF (mais confiável) se a nota já existir; senão o lido no PDF.
        const valorPreferido =
          notaJa && Number.isFinite(notaJa.valor_total) && notaJa.valor_total > 0
            ? notaJa.valor_total
            : valorLido != null && Number.isFinite(valorLido) && valorLido > 0
              ? valorLido
              : undefined;
        if (valorPreferido != null) {
          setValorNotaLida(valorPreferido);
          setValorParcela(valorPreferido.toFixed(2).replace(".", ","));
        } else {
          setValorNotaLida(undefined);
        }
        const extraidos: ItemConferencia[] = (resultado.dados?.itens ?? []).map((it, i) => ({
          indice: i,
          codigo: it.codigo,
          descricao: it.descricao,
          unidade: it.unidade,
          quantidade: it.quantidade,
          valorUnitario: it.valorUnitario,
        }));
        setItens(extraidos);
        setMostrarIncluirItemManual(extraidos.length === 0);
        const fornId = db.fornecedores.find((f) => somenteDigitos(f.cnpj) === resultado.nota!.cnpj)?.id;
        const inic: Record<number, DecisaoItem> = {};
        for (const item of extraidos) {
          const produtoId = casarProduto(db, item, fornId);
          const produto = db.produtos.find((p) => p.id === produtoId);
          inic[item.indice] = {
            decisao: "pendente",
            quantidade: item.quantidade,
            validade: hojeMais(produto?.validade_padrao_dias ?? 30),
            produtoId: produtoId || "",
            contaDreId: sugerirContaDre(db, {
              produtoId,
              fornecedorId: fornId,
              nomeHint: item.descricao,
            }),
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
    const produtoId = casarProduto(db, item, fornecedor?.id);
    setDecisoes((a) => ({
      ...a,
      [indice]: {
        decisao: "pendente",
        quantidade: novoItemQtd,
        validade: hojeMais(30),
        produtoId,
        contaDreId: sugerirContaDre(db, {
          produtoId,
          fornecedorId: fornecedor?.id,
          nomeHint: item.descricao,
        }),
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
      prazo_boleto_dias: 7,
      ativo: true,
    });
  }

  function salvarFornecedor(e: FormEvent) {
    e.preventDefault();
    if (!fornecedorForm) return;
    if (!fornecedorForm.nome.trim()) return;
    const id = uid("forn");
    mutate((d) => {
      d.fornecedores.push({
        ...fornecedorForm,
        id,
        nome: fornecedorForm.nome.trim(),
        whatsapp: fornecedorForm.whatsapp?.trim() || undefined,
        telefone: fornecedorForm.telefone?.trim() || undefined,
        email: fornecedorForm.email?.trim() || undefined,
        contato_nome: fornecedorForm.contato_nome?.trim() || undefined,
      });
    });
    setFornecedorForm(null);
  }

  const valorItensConfirmados = useMemo(() => {
    return itens
      .filter((i) => decisoes[i.indice]?.decisao === "confirmado")
      .reduce((s, item) => {
        const dec = decisoes[item.indice];
        return s + (item.valorUnitario ?? 0) * (dec?.quantidade ?? item.quantidade);
      }, 0);
  }, [itens, decisoes]);

  useEffect(() => {
    if (valorParcela.trim()) return;
    if (valorNotaLida != null && valorNotaLida > 0) {
      setValorParcela(valorNotaLida.toFixed(2).replace(".", ","));
      return;
    }
    if (valorItensConfirmados > 0) {
      setValorParcela(valorItensConfirmados.toFixed(2).replace(".", ","));
    }
  }, [valorItensConfirmados, valorNotaLida, valorParcela]);

  useEffect(() => {
    if (!jaConferida) return;
    // Retrabalho: não criar parcela de novo se já existir
    if (parcelaJaExiste) setCriarParcelaPagamento(false);
  }, [jaConferida, parcelaJaExiste]);

  useEffect(() => {
    if (!fornecedor) return;
    const prazo = fornecedor.prazo_boleto_dias ?? 7;
    setVencimentoParcela(hojeMais(prazo));
  }, [fornecedor?.id, fornecedor?.prazo_boleto_dias]);

  function abrirCadastroProduto(item: ItemConferencia) {
    const unidadeXml = unidadePorSigla(db, item.unidade);
    const unidadePadrao = unidadeXml?.id ?? db.unidades[0]?.id ?? "";
    const categorias = Array.isArray(db.categorias_produtos) ? db.categorias_produtos : [];
    const categoriaPadrao = categorias.find((c) => c.codigo === "sem-categoria")?.id;
    setProdutoForm({
      indice: item.indice,
      nome: item.descricao,
      codigoExterno: "",
      categoriaId: categoriaPadrao,
      codigoBarras: codigoDeBarrasValido(item.codigo) ?? "",
      unidadeCompraId: unidadePadrao,
      unidadeUsoId: unidadePadrao,
      fatorConversao: 1,
      estoqueMinimo: 0,
      validadePadraoDias: 30,
      controla_lote: false,
      controla_validade: false,
      ncm: undefined,
      cest: undefined,
      origemMercadoria: undefined,
      cfopPadrao: undefined,
      pontoPedido: "",
      estoqueMaximo: "",
      consumoMedioMensal: "",
    });
  }

  function salvarProdutoInterno(): string | undefined {
    if (!produtoForm || !produtoForm.nome.trim()) return undefined;
    const item = itens.find((i) => i.indice === produtoForm.indice);
    if (!item) return undefined;
    const produtoId = uid("prod");
    const agora = new Date().toISOString();
    const fatorConversao = typeof produtoForm.fatorConversao === "number" ? produtoForm.fatorConversao : 0;
    const estoqueMinimo = typeof produtoForm.estoqueMinimo === "number" ? produtoForm.estoqueMinimo : 0;
    const validadePadraoDias =
      typeof produtoForm.validadePadraoDias === "number" ? produtoForm.validadePadraoDias : 0;
    mutate((d) => {
      d.produtos.push({
        id: produtoId,
        codigo_externo: produtoForm.codigoExterno.trim() || undefined,
        nome: produtoForm.nome.trim(),
        categoria_id: produtoForm.categoriaId || undefined,
        tipo: "comprado",
        unidade_compra_id: produtoForm.unidadeCompraId || undefined,
        unidade_uso_id: produtoForm.unidadeUsoId,
        fator_conversao: fatorConversao,
        codigo_barras: produtoForm.codigoBarras.trim() || undefined,
        estoque_minimo: estoqueMinimo,
        validade_padrao_dias: validadePadraoDias,
        controla_lote: produtoForm.controla_lote,
        controla_validade: produtoForm.controla_validade,
        ncm: produtoForm.ncm?.trim() || undefined,
        cest: produtoForm.cest?.trim() || undefined,
        origem_mercadoria: produtoForm.origemMercadoria?.trim() || undefined,
        cfop_padrao: produtoForm.cfopPadrao?.trim() || undefined,
        ponto_pedido: typeof produtoForm.pontoPedido === "number" ? produtoForm.pontoPedido : undefined,
        estoque_maximo: typeof produtoForm.estoqueMaximo === "number" ? produtoForm.estoqueMaximo : undefined,
        consumo_medio_mensal:
          typeof produtoForm.consumoMedioMensal === "number" ? produtoForm.consumoMedioMensal : undefined,
        entra_no_cmv: inferirEntraNoCmv({
          nome: produtoForm.nome,
          contaDreId: produtoForm.contaDreId,
          contasDre: d.contas_dre,
        }),
        ativo: true,
      });
      if (!Array.isArray(d.produto_codigos_barras)) {
        d.produto_codigos_barras = [];
      }
      if (produtoForm.codigoBarras.trim()) {
        d.produto_codigos_barras.push({
          id: uid("pcb"),
          produto_id: produtoId,
          codigo_barras: produtoForm.codigoBarras.trim(),
          principal: true,
        });
      }
      if (fornecedor && !item.codigo.startsWith("manual-")) {
        registrarVinculoDaNota(d, {
          idNovo: uid("fp"),
          fornecedorId: fornecedor.id,
          produtoId,
          codigoFornecedor: item.codigo,
          ean: codigoDeBarrasValido(item.codigo) ?? undefined,
          unidadeCompraId: produtoForm.unidadeCompraId || undefined,
          fatorConversao,
          ultimoPreco: item.valorUnitario,
          atualizadoEm: agora,
        });
      }
    });
    alterar(produtoForm.indice, {
      produtoId,
      validade: hojeMais(validadePadraoDias),
      decisao: "pendente",
      contaDreId: "",
    });
    setProdutoForm(null);
    return produtoId;
  }

  function salvarProduto(e: FormEvent) {
    e.preventDefault();
    if (!produtoForm) return;
    const form = e.currentTarget as HTMLFormElement;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    salvarProdutoInterno();
  }

  function salvarECompletarCadastro() {
    if (!produtoForm) return;
    if (
      !produtoForm.nome.trim() ||
      !produtoForm.unidadeCompraId ||
      !produtoForm.unidadeUsoId ||
      produtoForm.fatorConversao === "" ||
      produtoForm.estoqueMinimo === "" ||
      produtoForm.validadePadraoDias === ""
    ) {
      return;
    }
    const produtoId = salvarProdutoInterno();
    if (produtoId) {
      router.push(`/cadastros?aba=produtos&produtoId=${produtoId}`);
    }
  }

  function finalizar() {
    if (!notaId) return;
    if (!fornecedor) {
      setErro("Cadastre o fornecedor com este CNPJ antes de finalizar.");
      return;
    }

    // Nota já conferida: não lança estoque de novo — só fecha ou completa parcela faltante.
    if (jaConferida && notaExistente) {
      let boletosCriados = 0;
      const valorInformado = Number(String(valorParcela).replace(",", "."));
      const valorTotal =
        Number.isFinite(valorInformado) && valorInformado > 0
          ? Math.round(valorInformado * 100) / 100
          : Number.isFinite(notaExistente.valor_total)
            ? notaExistente.valor_total
            : 0;

      if (criarParcelaPagamento && !parcelaJaExiste) {
        if (!(valorTotal > 0)) {
          setErro("Informe o valor total da nota/boleto para criar a parcela.");
          return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimentoParcela)) {
          setErro("Informe o vencimento do boleto.");
          return;
        }
        mutate((d) => {
          criarParcelaAguardandoDocumento(d, {
            id: uid("bol"),
            nota_id: notaExistente.id,
            valor: valorTotal,
            vencimento: vencimentoParcela,
            cnpj_beneficiario: formatarCnpj(notaId.cnpj),
            numero_parcela: "001",
            meio_pagamento_esperado: "boleto",
            status: "liberado",
          });
        });
        boletosCriados = 1;
      }

      aoFinalizar({
        status: "ok",
        fornecedorNome: nomeFornecedor(db, fornecedor.id),
        boletos: boletosCriados,
        boletosLiberados: boletosCriados,
        vinculouPedido: false,
        avisoRetrabalho: true,
      });
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

    const valorItens = confirmados.reduce((s, item) => {
      const dec = decisoes[item.indice];
      return s + (item.valorUnitario ?? 0) * (dec?.quantidade ?? item.quantidade);
    }, 0);
    const valorInformado = Number(String(valorParcela).replace(",", "."));
    const valorPreferido =
      valorNotaLida != null && valorNotaLida > 0 ? valorNotaLida : valorItens;
    const valorTotal =
      Number.isFinite(valorInformado) && valorInformado > 0
        ? Math.round(valorInformado * 100) / 100
        : Math.round(valorPreferido * 100) / 100;

    if (criarParcelaPagamento) {
      if (!(valorTotal > 0)) {
        setErro("Informe o valor total da nota/boleto (olhe na DANFE) para criar a parcela de pagamento.");
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimentoParcela)) {
        setErro("Informe o vencimento do boleto (como na DANFE ou no boleto).");
        return;
      }
    }

    const nfId = uid("nf");
    const recebimentoId = uid("rec");
    const boletoId = uid("bol");
    let boletosCriados = 0;

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
        valor_total: valorTotal,
        emitida_em: hoje,
        importada_em: agora,
        status: "conferida",
        origem: "manual",
        meio_pagamento_esperado: "boleto",
        itens_importados: confirmados.map((item) => ({
          descricao: item.descricao,
          codigo: item.codigo.startsWith("manual-") ? undefined : item.codigo,
          ean: codigoDeBarrasValido(item.codigo) ?? undefined,
          unidade: item.unidade,
          quantidade: decisoes[item.indice]?.quantidade ?? item.quantidade,
          preco_unitario: item.valorUnitario ?? 0,
        })),
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
        const contaDreId =
          dec.contaDreId ||
          sugerirContaDre(d, {
            produtoId: dec.produtoId,
            fornecedorId: fornecedor.id,
            nomeHint: item.descricao,
          });
        d.recebimento_itens.push({
          id: ri,
          recebimento_id: recebimentoId,
          produto_id: dec.produtoId,
          qtd_esperada: item.quantidade,
          qtd_recebida: dec.quantidade,
          validade: dec.validade || undefined,
          conta_dre_id: contaDreId || undefined,
        });
        if (contaDreId) {
          memorizarContaDre(d, {
            produtoId: dec.produtoId,
            fornecedorId: fornecedor.id,
            contaDreId,
          });
        }
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
      if (criarParcelaPagamento && valorTotal > 0) {
        criarParcelaAguardandoDocumento(d, {
          id: boletoId,
          nota_id: nfId,
          valor: valorTotal,
          vencimento: vencimentoParcela,
          cnpj_beneficiario: formatarCnpj(notaId.cnpj),
          numero_parcela: "001",
          meio_pagamento_esperado: "boleto",
          status: "liberado",
        });
        boletosCriados = 1;
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
      boletos: boletosCriados,
      boletosLiberados: boletosCriados,
      vinculouPedido: Boolean(pedido),
    });
  }

  const pendentes = itens.filter((i) => decisoes[i.indice]?.decisao === "pendente").length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        O PDF à esquerda é para <strong>você conferir com os olhos</strong> — a resolução que você vê
        não é a mesma leitura automática do sistema. O programa tenta extrair texto/OCR; a lista
        completa e confiável só vem com o <strong>XML</strong>. Se faltar produto, use “Incluir item
        que faltou”. Ao finalizar, informe valor e vencimento do boleto para a nota ir para
        Pagamentos.
      </p>

      {jaConferida && notaExistente && (
        <div className="rounded-card border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Esta NF-e nº {notaExistente.numero} já foi conferida.</p>
          <p className="mt-1">
            Finalizar <strong>não lança estoque de novo</strong>
            {parcelaJaExiste
              ? " (parcela de pagamento já existe)."
              : " — você só pode criar a parcela de pagamento se ainda faltar."}{" "}
            Se abriu por engano, volte sem finalizar.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-secundario" onClick={onVoltar}>
              <ArrowLeft size={16} /> Voltar sem lançar
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden p-0 xl:sticky xl:top-4 xl:self-start">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
            <p className="min-w-0 truncate text-sm font-semibold">
              <FileUp size={16} className="mr-1 inline shrink-0" />
              {arquivoInicial.name}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="btn-secundario px-2 py-1 text-xs"
                title="Diminuir zoom"
                disabled={zoomPdf <= ZOOM_MIN}
                onClick={() => setZoomPdf((z) => Math.max(ZOOM_MIN, z - ZOOM_PASSO))}
              >
                <ZoomOut size={16} />
              </button>
              <span className="min-w-[3.25rem] text-center text-xs font-semibold tabular-nums text-slate-700">
                {zoomPdf}%
              </span>
              <button
                type="button"
                className="btn-secundario px-2 py-1 text-xs"
                title="Aumentar zoom"
                disabled={zoomPdf >= ZOOM_MAX}
                onClick={() => setZoomPdf((z) => Math.min(ZOOM_MAX, z + ZOOM_PASSO))}
              >
                <ZoomIn size={16} />
              </button>
              <button
                type="button"
                className="btn-secundario px-2 py-1 text-xs"
                title="Zoom 100%"
                onClick={() => setZoomPdf(100)}
              >
                100%
              </button>
            </div>
          </div>
          {carregandoPaginas && (
            <p className="border-b border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
              Montando páginas do PDF para conferência…
            </p>
          )}
          {pdfUrl ? (
            <div
              ref={painelPdfRef}
              className="h-[55vh] overflow-auto bg-slate-200 xl:h-[75vh]"
              title="Ctrl + bolinha do mouse para zoom (Cmd no Mac)"
            >
              {paginasPdf.length > 0 ? (
                <div className="mx-auto space-y-3 p-2" style={{ width: `${zoomPdf}%` }}>
                  {paginasPdf.map((src, indice) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${indice}-${src.slice(0, 32)}`}
                      src={src}
                      alt={`DANFE página ${indice + 1}`}
                      className="block w-full bg-white shadow-sm"
                      draggable={false}
                    />
                  ))}
                </div>
              ) : !carregandoPaginas && ehPdf ? (
                <iframe title="DANFE PDF" src={pdfUrl} className="h-full w-full border-0 bg-white" />
              ) : !carregandoPaginas && !ehPdf ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pdfUrl}
                  alt="DANFE / foto da nota"
                  className="mx-auto block bg-white object-contain"
                  style={{ width: `${zoomPdf}%` }}
                />
              ) : null}
            </div>
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
                      const produtoId = e.target.value;
                      const produto = db.produtos.find((p) => p.id === produtoId);
                      alterar(item.indice, {
                        produtoId,
                        validade: hojeMais(produto?.validade_padrao_dias ?? 30),
                        contaDreId: sugerirContaDre(db, {
                          produtoId,
                          fornecedorId: fornecedor?.id,
                          nomeHint: item.descricao,
                        }),
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
                    <PackagePlus size={16} /> Cadastrar produto da nota
                  </button>
                )}

                {dec.produtoId && !recusado && (
                  <>
                    <Campo rotulo="Conta DRE (pré-classificada — pode alterar)">
                      <SelectContaDre
                        db={db}
                        value={dec.contaDreId ?? ""}
                        onChange={(id) => alterar(item.indice, { contaDreId: id ?? "" })}
                      />
                    </Campo>
                    <Campo rotulo="Quantidade recebida">
                      <CampoQuantidade
                        valor={dec.quantidade}
                        onChange={(v) => alterar(item.indice, { quantidade: v })}
                      />
                    </Campo>
                  </>
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

          {!mostrarIncluirItemManual ? (
            <button
              type="button"
              className="btn-secundario w-full text-sm"
              onClick={() => setMostrarIncluirItemManual(true)}
            >
              <Plus size={16} /> Faltou um item na lista? Incluir manualmente
            </button>
          ) : (
            <Card className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold">Item que o PDF não leu — olhe a DANFE ao lado</p>
                <button
                  type="button"
                  className="text-xs font-medium text-slate-600 underline"
                  onClick={() => {
                    setMostrarIncluirItemManual(false);
                    setNovoItemDesc("");
                    setNovoItemQtd(1);
                  }}
                >
                  Não preciso — ocultar
                </button>
              </div>
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
          )}

          <Card>
            <p className="mb-2 text-sm font-semibold text-slate-800">Pagamento (parcela do boleto)</p>
            <p className="mb-3 text-xs text-slate-500">
              Sem esta parcela o Financeiro não encontra a nota ao importar o boleto. Use o valor e o
              vencimento impressos na DANFE ou no boleto
              {valorNotaLida != null && valorNotaLida > 0
                ? ` (lido na DANFE: ${moeda(valorNotaLida)} — confira e corrija se precisar)`
                : ""}
              .
            </p>
            {jaConferida && parcelaJaExiste && (
              <p className="mb-3 text-xs font-medium text-amber-900">
                Já existe parcela para esta nota — deixe desmarcado para não duplicar.
              </p>
            )}
            <label className="mb-3 flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={criarParcelaPagamento}
                onChange={(e) => setCriarParcelaPagamento(e.target.checked)}
                disabled={jaConferida && parcelaJaExiste}
              />
              Criar parcela e enviar para Pagamentos futuros
            </label>
            {criarParcelaPagamento && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo rotulo="Valor total (R$) *">
                  <input
                    className="campo"
                    inputMode="decimal"
                    placeholder={valorItensConfirmados > 0 ? valorItensConfirmados.toFixed(2) : "0,00"}
                    value={valorParcela}
                    onChange={(e) => setValorParcela(e.target.value)}
                  />
                </Campo>
                <Campo rotulo="Vencimento *">
                  <input
                    className="campo"
                    type="date"
                    value={vencimentoParcela}
                    onChange={(e) => setVencimentoParcela(e.target.value)}
                  />
                </Campo>
              </div>
            )}
            {valorItensConfirmados > 0 && (
              <p className="mt-2 text-xs text-slate-500">Soma dos itens confirmados: {moeda(valorItensConfirmados)}</p>
            )}
          </Card>

          {pendentes > 0 && (
            <p className="text-sm text-destaque">
              Faltam decidir {pendentes} item{pendentes === 1 ? "" : "s"} — Confirmar ou Recusar.
            </p>
          )}

          <button
            type="button"
            className="btn-gigante"
            disabled={
              !notaId ||
              !fornecedor ||
              (jaConferida ? false : itens.length === 0 || pendentes > 0)
            }
            onClick={finalizar}
          >
            <CircleCheck size={28} />{" "}
            {jaConferida
              ? criarParcelaPagamento && !parcelaJaExiste
                ? "Só criar parcela (sem estoque)"
                : "Fechar sem lançar estoque"
              : "Finalizar conferência DANFE"}
          </button>

          <button type="button" className="btn-secundario w-full" onClick={onVoltar}>
            <ArrowLeft size={18} /> Voltar
          </button>
        </div>
      </div>

      <Modal aberto={fornecedorForm !== null} titulo="Cadastrar fornecedor" onFechar={() => setFornecedorForm(null)}>
        {fornecedorForm && (
          <form onSubmit={salvarFornecedor} className="space-y-3">
            <p className="text-xs text-slate-500">
              Aqui basta CNPJ e nome para concluir o recebimento. Telefone, e-mail e prazos você pode
              completar depois em Cadastros → Fornecedores.
            </p>
            <Campo rotulo="CNPJ">
              <input className="campo" readOnly value={fornecedorForm.cnpj} />
            </Campo>
            <Campo rotulo="Razão social / nome *">
              <input
                className="campo"
                required
                value={fornecedorForm.nome}
                onChange={(e) => setFornecedorForm({ ...fornecedorForm, nome: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Nome do contato">
              <input
                className="campo"
                value={fornecedorForm.contato_nome ?? ""}
                onChange={(e) => setFornecedorForm({ ...fornecedorForm, contato_nome: e.target.value })}
              />
            </Campo>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo rotulo="WhatsApp">
                <input
                  className="campo"
                  inputMode="tel"
                  placeholder="(11) 99999-9999"
                  value={fornecedorForm.whatsapp ?? ""}
                  onChange={(e) => setFornecedorForm({ ...fornecedorForm, whatsapp: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Telefone">
                <input
                  className="campo"
                  inputMode="tel"
                  value={fornecedorForm.telefone ?? ""}
                  onChange={(e) => setFornecedorForm({ ...fornecedorForm, telefone: e.target.value })}
                />
              </Campo>
            </div>
            <Campo rotulo="E-mail">
              <input
                className="campo"
                type="email"
                value={fornecedorForm.email ?? ""}
                onChange={(e) => setFornecedorForm({ ...fornecedorForm, email: e.target.value })}
              />
            </Campo>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo rotulo="Forma de pagamento">
                <select
                  className="campo"
                  value={fornecedorForm.forma_pagamento}
                  onChange={(e) =>
                    setFornecedorForm({
                      ...fornecedorForm,
                      forma_pagamento: e.target.value as Fornecedor["forma_pagamento"],
                    })
                  }
                >
                  <option value="boleto">Boleto</option>
                  <option value="pix">PIX</option>
                </select>
              </Campo>
              <Campo rotulo="Prazo boleto (dias)">
                <input
                  className="campo"
                  type="number"
                  min={0}
                  value={fornecedorForm.prazo_boleto_dias ?? 7}
                  onChange={(e) =>
                    setFornecedorForm({
                      ...fornecedorForm,
                      prazo_boleto_dias: Number(e.target.value) || 0,
                    })
                  }
                />
              </Campo>
            </div>
            <button type="submit" className="btn-primario w-full">
              Salvar fornecedor
            </button>
          </form>
        )}
      </Modal>

      <Modal
        aberto={produtoForm !== null}
        titulo="Cadastrar produto da nota"
        onFechar={() => setProdutoForm(null)}
        fecharAoClicarFundo={false}
      >
        {produtoForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              salvarProduto(e);
            }}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <div className="sm:col-span-2">
              <Campo rotulo="Nome *">
                <input
                  className="campo"
                  required
                  value={produtoForm.nome}
                  onChange={(e) => setProdutoForm({ ...produtoForm, nome: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                />
              </Campo>
            </div>
            <Campo rotulo="Categoria">
              <select
                className="campo"
                value={produtoForm.categoriaId ?? ""}
                onChange={(e) =>
                  setProdutoForm({ ...produtoForm, categoriaId: e.target.value || undefined })
                }
              >
                {(Array.isArray(db.categorias_produtos) ? db.categorias_produtos : []).map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Código no EaseEat">
              <input
                className="campo"
                placeholder="opcional"
                value={produtoForm.codigoExterno}
                onChange={(e) => setProdutoForm({ ...produtoForm, codigoExterno: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              />
            </Campo>
            <Campo rotulo="Código de barras">
              <input
                className="campo"
                value={produtoForm.codigoBarras}
                onChange={(e) => setProdutoForm({ ...produtoForm, codigoBarras: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              />
            </Campo>
            {!produtoForm.codigoBarras && (
              <div className="sm:col-span-2 rounded-card border border-dashed border-slate-300 p-3">
                <p className="mb-2 text-sm text-slate-600">
                  Se a DANFE não trouxe um EAN válido, você pode ler o código de barras agora.
                </p>
                <CodeScanner
                  rotulo="Ler código de barras"
                  onLeitura={(codigo) => setProdutoForm({ ...produtoForm, codigoBarras: codigo })}
                />
              </div>
            )}
            <Campo
              rotulo={`Unidade de compra (DANFE: ${
                itens.find((i) => i.indice === produtoForm.indice)?.unidade || "—"
              }) *`}
            >
              <select
                className="campo"
                required
                value={produtoForm.unidadeCompraId}
                onChange={(e) => setProdutoForm({ ...produtoForm, unidadeCompraId: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              >
                {db.unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome} ({u.sigla})
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Unidade de uso no estoque *">
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
                min="0.000001"
                step="any"
                className="campo"
                required
                value={produtoForm.fatorConversao}
                onChange={(e) =>
                  setProdutoForm({
                    ...produtoForm,
                    fatorConversao: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </Campo>
            <Campo rotulo="Estoque mínimo *">
              <input
                type="number"
                min={0}
                step="any"
                className="campo"
                required
                value={produtoForm.estoqueMinimo}
                onChange={(e) =>
                  setProdutoForm({
                    ...produtoForm,
                    estoqueMinimo: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </Campo>
            <Campo rotulo="Validade padrão (dias) *">
              <input
                type="number"
                min={0}
                className="campo"
                required
                value={produtoForm.validadePadraoDias}
                onChange={(e) =>
                  setProdutoForm({
                    ...produtoForm,
                    validadePadraoDias: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </Campo>

            <div className="sm:col-span-2 space-y-2 rounded-card border border-slate-200 p-3">
              <p className="rotulo">Dados fiscais</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo rotulo="NCM">
                  <input
                    className="campo"
                    value={produtoForm.ncm ?? ""}
                    onChange={(e) => setProdutoForm({ ...produtoForm, ncm: e.target.value || undefined })}
                  />
                </Campo>
                <Campo rotulo="CEST">
                  <input
                    className="campo"
                    value={produtoForm.cest ?? ""}
                    onChange={(e) => setProdutoForm({ ...produtoForm, cest: e.target.value || undefined })}
                  />
                </Campo>
                <Campo rotulo="Origem da mercadoria">
                  <input
                    className="campo"
                    value={produtoForm.origemMercadoria ?? ""}
                    onChange={(e) =>
                      setProdutoForm({ ...produtoForm, origemMercadoria: e.target.value || undefined })
                    }
                  />
                </Campo>
                <Campo rotulo="CFOP padrão">
                  <input
                    className="campo"
                    value={produtoForm.cfopPadrao ?? ""}
                    onChange={(e) =>
                      setProdutoForm({ ...produtoForm, cfopPadrao: e.target.value || undefined })
                    }
                  />
                </Campo>
              </div>
            </div>

            <div className="sm:col-span-2 space-y-2 rounded-card border border-slate-200 p-3">
              <p className="rotulo">Controle de lote e validade</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={produtoForm.controla_lote ?? false}
                  onChange={(e) => setProdutoForm({ ...produtoForm, controla_lote: e.target.checked })}
                />
                Controla lote
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={produtoForm.controla_validade ?? false}
                  onChange={(e) => setProdutoForm({ ...produtoForm, controla_validade: e.target.checked })}
                />
                Controla validade
              </label>
            </div>

            <Campo rotulo="Ponto de pedido">
              <input
                type="number"
                min={0}
                step="any"
                className="campo"
                value={produtoForm.pontoPedido ?? ""}
                onChange={(e) =>
                  setProdutoForm({
                    ...produtoForm,
                    pontoPedido: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </Campo>
            <Campo rotulo="Estoque máximo">
              <input
                type="number"
                min={0}
                step="any"
                className="campo"
                value={produtoForm.estoqueMaximo ?? ""}
                onChange={(e) =>
                  setProdutoForm({
                    ...produtoForm,
                    estoqueMaximo: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </Campo>
            <Campo rotulo="Consumo médio mensal">
              <input
                type="number"
                min={0}
                step="any"
                className="campo"
                value={produtoForm.consumoMedioMensal ?? ""}
                onChange={(e) =>
                  setProdutoForm({
                    ...produtoForm,
                    consumoMedioMensal: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </Campo>

            <p className="sm:col-span-2 text-xs text-slate-500">
              O código do item no fornecedor (
              {itens.find((i) => i.indice === produtoForm.indice)?.codigo || "não informado"}) será
              vinculado automaticamente. O fator indica quantas unidades de uso entram no estoque para
              cada unidade comprada.
            </p>

            <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secundario w-full sm:w-auto" onClick={() => setProdutoForm(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-secundario w-full sm:w-auto"
                onClick={salvarECompletarCadastro}
              >
                <PackagePlus size={18} /> Salvar e completar cadastro
              </button>
              <button type="submit" className="btn-primario w-full sm:w-auto">
                <PackagePlus size={18} /> Salvar produto
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
