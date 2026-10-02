"use client";

/**
 * Aba Conferência: nota × pagamentos lado a lado + cobranças PIX sem NFS-e.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CircleCheckBig,
  Eye,
  FileText,
  Link2,
  PackagePlus,
  ReceiptText,
  RefreshCw,
  Trash2,
  Upload,
  Wallet,
} from "lucide-react";
import { Badge, Card, Modal, Vazio } from "@/components/ui";
import { VistaNotaEstiloDanfe } from "@/components/financeiro/VistaNotaEstiloDanfe";
import { getDB, mutate, uid, useDB } from "@/lib/data";
import {
  listarBoletosLoteAguardandoVinculo,
  listarBoletosSemNfConferida,
  listarNotasComBoletoPendente,
  montarResumoFilasConferenciaNfeBoleto,
} from "@/lib/domain/conferencia-nfe-boleto";
import { lerArquivoDocumentoBoletoIdb, salvarArquivoDocumentoBoletoIdb } from "@/lib/domain/documentos-boleto-arquivo-idb";
import { listarRegistrosLoteIdb, registroIdbParaArquivo } from "@/lib/domain/lote-recebimento-idb";
import {
  hidratarInboxDoIdb,
  listarItensAbertosInbox,
  obterArquivoInboxAsync,
  useFilaInboxEntrada,
} from "@/lib/domain/inbox-entrada-store";
import {
  acrescentarClassificados,
  flushPersistenciaFilaLote,
  hidratarFilaLoteDoIdb,
  listarFilaLote,
  marcarItemConcluido,
  obterArquivoFilaAsync,
  useFilaLoteRecebimento,
} from "@/lib/domain/lote-recebimento-store";
import {
  criarCobrancaPixSemNota,
  fornecedorDoPagamento,
  listarCobrancasSemNota,
  marcarBoletoComoJaPago,
  sugerirVinculosNfseParaPagamentos,
  vincularNotaAoPagamento,
} from "@/lib/domain/pagamento-documento-fiscal";
import {
  MEIOS_PAGAMENTO_AVISTA,
  registrarPagamentoAvistaNota,
  resumoNotaParaExibicao,
  rotuloMeioPagamentoAvista,
  type MeioPagamentoAvista,
} from "@/lib/domain/pagamento-avista-nota";
import { opcoesOrigemPagamento } from "@/lib/domain/contas-pagamento";
import { identificarCodigoBoletoNoArquivoLocal, identificarBoletosPorPaginaNoPdf } from "@/lib/domain/identificacao-boleto-browser";
import { expandirDocumentoBoletoMultipagina } from "@/lib/domain/expandir-boleto-pdf-multipagina";
import {
  aplicarLinhaDigitavelDocumento,
  confirmarPareamentoNotaBoletos,
  descartarDocumentoBoletoPendente,
  nomeArquivoPareceChaveNfe,
  sugerirDocumentosParaNota,
  validarPareamentoNotaBoletos,
} from "@/lib/domain/pareamento-nfe-boleto";
import {
  extrairDadosPixCopiaCola,
  formatarDocumentoPix,
  formatarValorPixParaInput,
  hojeIsoLocal,
  parecePixCopiaCola,
} from "@/lib/domain/pix-copia-cola";
import { transferirBoletosLoteParaConferencia } from "@/lib/domain/transferir-boletos-lote-conferencia";
import { dataBR, moeda } from "@/lib/format";
import type { NotaFiscal } from "@/lib/types";
import type { ResultadoClassificacaoArquivo } from "@/lib/domain/classificar-arquivo-recebimento";

interface Props {
  onIrParaPagamentos?: (boletoId?: string) => void;
  onImportarBoleto?: (boletoId?: string) => void;
}

export default function ConferenciaFinanceira({ onIrParaPagamentos, onImportarBoleto }: Props) {
  const router = useRouter();
  const db = useDB();
  const filaLote = useFilaLoteRecebimento();
  const filaInbox = useFilaInboxEntrada();
  const resumo = useMemo(() => montarResumoFilasConferenciaNfeBoleto(db), [db]);
  const notasPendentes = useMemo(() => listarNotasComBoletoPendente(db), [db]);
  const boletosSemNf = useMemo(() => listarBoletosSemNfConferida(db), [db]);
  const boletosLote = useMemo(() => listarBoletosLoteAguardandoVinculo(filaLote), [filaLote]);
  const boletosInbox = useMemo(
    () =>
      filaInbox.filter(
        (i) =>
          i.tipo === "pdf_boleto" &&
          (i.status === "a_conferir" || i.status === "em_andamento" || i.status === "pendente")
      ),
    [filaInbox]
  );
  const boletosPendentesArquivo = boletosLote.length + boletosInbox.length;
  const cobrancasSemNota = useMemo(() => listarCobrancasSemNota(db), [db]);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pixLidoResumo, setPixLidoResumo] = useState<string | null>(null);
  const [notaPareamentoId, setNotaPareamentoId] = useState<string | null>(null);
  const [documentosPareamentoIds, setDocumentosPareamentoIds] = useState<string[]>([]);
  const [justificativaPareamento, setJustificativaPareamento] = useState("");
  const [processandoPareamento, setProcessandoPareamento] = useState(false);
  const [abrindoPdfId, setAbrindoPdfId] = useState<string | null>(null);
  const [transferindoLote, setTransferindoLote] = useState(false);
  const [linhaManualPorDoc, setLinhaManualPorDoc] = useState<Record<string, string>>({});
  const [relendoId, setRelendoId] = useState<string | null>(null);
  const [reclassificandoId, setReclassificandoId] = useState<string | null>(null);
  const [notaDetalheId, setNotaDetalheId] = useState<string | null>(null);
  const [abrindoNotaId, setAbrindoNotaId] = useState<string | null>(null);
  const [notaAvistaId, setNotaAvistaId] = useState<string | null>(null);
  const [avistaMeio, setAvistaMeio] = useState<MeioPagamentoAvista>("pix");
  const [avistaData, setAvistaData] = useState(hojeIsoLocal());
  const [avistaValor, setAvistaValor] = useState("");
  const [avistaBanco, setAvistaBanco] = useState("");
  const [avistaCartao, setAvistaCartao] = useState("");
  const [avistaObs, setAvistaObs] = useState("");
  const [avistaErro, setAvistaErro] = useState<string | null>(null);
  const [processandoAvista, setProcessandoAvista] = useState(false);

  const parcelasAguardandoPdf = useMemo(() => {
    const todas = resumo.parcelas;
    if (!notaPareamentoId) return todas;
    return todas.filter((p) => p.boleto.nota_id === notaPareamentoId);
  }, [resumo.parcelas, notaPareamentoId]);

  const [pixValor, setPixValor] = useState("");
  const [pixVencimento, setPixVencimento] = useState("");
  const [pixCodigo, setPixCodigo] = useState("");
  const [pixFornecedorId, setPixFornecedorId] = useState("");
  const [pixCnpj, setPixCnpj] = useState("");

  async function transferirBoletosDaFilaLote(opcoes: { incluirInbox?: boolean } = { incluirInbox: true }) {
    if (transferindoLote) return;
    setTransferindoLote(true);
    setErro(null);
    try {
      await Promise.all([hidratarFilaLoteDoIdb(), hidratarInboxDoIdb()]);
      const itens = listarFilaLote();
      const inbox = listarItensAbertosInbox();
      const incluirInbox = opcoes.incluirInbox !== false;

      const proximo = structuredClone(getDB()) as typeof db;
      const resultado = await transferirBoletosLoteParaConferencia(
        proximo,
        itens,
        async (id) => (await obterArquivoFilaAsync(id)) ?? (await obterArquivoInboxAsync(id)),
        { gerarId: () => uid("docbol"), itensInbox: incluirInbox ? inbox : [], incluirInbox }
      );

      if (resultado.resultados.length === 0) {
        setMensagem(
          incluirInbox
            ? "Nenhum PDF de boleto pendente na fila ou na caixa."
            : "Nenhum PDF de boleto pendente na fila do lote."
        );
        return;
      }

      mutate((atual) => {
        Object.assign(atual, proximo);
      });

      for (const r of resultado.resultados) {
        if (!r.ok) continue;
        // Sai do lote; da Caixa só se o usuário pediu envio explícito (incluirInbox).
        marcarItemConcluido(r.id, { limparInbox: incluirInbox });
      }

      const partes: string[] = [];
      if (resultado.transferidos > 0) {
        partes.push(`${resultado.transferidos} boleto(s) em “Boletos sem NF”`);
      }
      if (resultado.jaPagos > 0) {
        partes.push(`${resultado.jaPagos} já baixado(s)`);
      }
      if (resultado.falhas > 0) {
        partes.push(`${resultado.falhas} falha(s)`);
        setErro(
          resultado.resultados
            .filter((r) => !r.ok)
            .map((r) => `${r.nome}: ${r.erros.join(" ")}`)
            .join(" · ")
        );
      }
      setMensagem(partes.length ? partes.join(". ") + "." : "Nada a transferir.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao transferir boletos do lote.");
    } finally {
      setTransferindoLote(false);
    }
  }

  /** Hidrata filas; não esvazia a Caixa automaticamente. */
  useEffect(() => {
    void hidratarFilaLoteDoIdb();
    void hidratarInboxDoIdb();
  }, []);

  // Auto-envio desligado de propósito: mandava TODOS os PDFs da caixa/lote
  // para “Boletos sem NF” e sumia com os outros itens da Caixa.

  const notaPareamento: NotaFiscal | null = useMemo(() => {
    if (!notaPareamentoId) return null;
    return db.notas_fiscais.find((n) => n.id === notaPareamentoId) ?? null;
  }, [db.notas_fiscais, notaPareamentoId]);

  const documentosSugeridosIds = useMemo(() => {
    if (!notaPareamentoId) return new Set<string>();
    return new Set(sugerirDocumentosParaNota(db, notaPareamentoId).map((item) => item.documento.id));
  }, [db, notaPareamentoId]);

  const validacaoPareamento = useMemo(() => {
    if (!notaPareamentoId || documentosPareamentoIds.length === 0) return null;
    return validarPareamentoNotaBoletos(db, {
      notaId: notaPareamentoId,
      documentoIds: documentosPareamentoIds,
      justificativa: justificativaPareamento,
    });
  }, [db, notaPareamentoId, documentosPareamentoIds, justificativaPareamento]);

  const podeConfirmarPareamento = Boolean(
    validacaoPareamento?.ok ||
      (validacaoPareamento?.exigeJustificativa && justificativaPareamento.trim())
  );

  // Compat: detalhe NFS-e ainda usa seleção de nota
  const notaSelecionada = notaPareamento;
  const sugestoesNfse = useMemo(() => {
    if (!notaSelecionada || notaSelecionada.tipo !== "nfse") return [];
    return sugerirVinculosNfseParaPagamentos(db, notaSelecionada);
  }, [db, notaSelecionada]);

  function alternarNotaPareamento(notaId: string) {
    setNotaPareamentoId((atual) => {
      if (atual === notaId) {
        setDocumentosPareamentoIds([]);
        return null;
      }
      // Marca na hora os PDFs com valor/vencimento parecidos com as parcelas
      const ids = sugerirDocumentosParaNota(db, notaId).map((item) => item.documento.id);
      setDocumentosPareamentoIds(ids);
      return notaId;
    });
    setJustificativaPareamento("");
  }

  function alternarDocumentoPareamento(documentoId: string) {
    setDocumentosPareamentoIds((atual) =>
      atual.includes(documentoId) ? atual.filter((id) => id !== documentoId) : [...atual, documentoId]
    );
  }

  function marcarSugeridos() {
    if (!notaPareamentoId) return;
    const ids = sugerirDocumentosParaNota(db, notaPareamentoId).map((item) => item.documento.id);
    setDocumentosPareamentoIds((atual) => Array.from(new Set([...atual, ...ids])));
  }

  function confirmarPareamento() {
    if (!notaPareamentoId || documentosPareamentoIds.length === 0 || processandoPareamento) return;
    setErro(null);
    setMensagem(null);
    setProcessandoPareamento(true);

    try {
      let falhou: string | null = null;
      let primeiroBoletoId: string | undefined;
      mutate((atual) => {
        const resultado = confirmarPareamentoNotaBoletos(
          atual,
          {
            notaId: notaPareamentoId,
            documentoIds: documentosPareamentoIds,
            justificativa: justificativaPareamento,
            responsavel: "usuário local",
          },
          { gerarIdBoleto: () => uid("bol") }
        );
        if (!resultado.sucesso) {
          falhou = resultado.erros.join(" ") || "Não foi possível confirmar o pareamento.";
          return;
        }
        primeiroBoletoId = resultado.boletosVinculados[0]?.id;
      });

      if (falhou) {
        setErro(falhou);
        return;
      }

      setMensagem(
        "Pareamento confirmado. Os títulos foram para Pagamentos — informe data e banco ao pagar."
      );
      setNotaPareamentoId(null);
      setDocumentosPareamentoIds([]);
      setJustificativaPareamento("");
      onIrParaPagamentos?.(primeiroBoletoId);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao confirmar pareamento.");
    } finally {
      setProcessandoPareamento(false);
    }
  }

  function aplicarDadosDoPix(codigo: string) {
    const dados = extrairDadosPixCopiaCola(codigo);
    if (!dados) {
      setPixLidoResumo(null);
      return;
    }

    if (dados.valor !== undefined) {
      setPixValor(formatarValorPixParaInput(dados.valor));
    }
    if (dados.vencimento) {
      setPixVencimento(dados.vencimento);
    } else {
      setPixVencimento((atual) => atual || hojeIsoLocal());
    }
    if (dados.documentoRecebedor) {
      setPixCnpj(formatarDocumentoPix(dados.documentoRecebedor) ?? dados.documentoRecebedor);
    }

    if (dados.documentoRecebedor) {
      const digitos = dados.documentoRecebedor;
      const forn = db.fornecedores.find((f) => (f.cnpj ?? "").replace(/\D+/g, "") === digitos);
      if (forn) setPixFornecedorId(forn.id);
    }

    const partes = [
      dados.valor !== undefined ? `valor ${moeda(dados.valor)}` : null,
      dados.nomeRecebedor ? dados.nomeRecebedor : null,
      dados.cidade ? dados.cidade : null,
      dados.documentoRecebedor ? `CNPJ/CPF ${formatarDocumentoPix(dados.documentoRecebedor)}` : null,
    ].filter(Boolean);
    setPixLidoResumo(
      partes.length > 0
        ? `PIX reconhecido: ${partes.join(" · ")}`
        : "PIX reconhecido. Confira valor e vencimento."
    );
    setErro(null);
  }

  function aoColarOuDigitarPix(texto: string) {
    setPixCodigo(texto);
    if (parecePixCopiaCola(texto)) {
      aplicarDadosDoPix(texto);
    } else {
      setPixLidoResumo(null);
    }
  }

  function registrarPixSemNota() {
    setErro(null);
    setMensagem(null);

    let valorTexto = pixValor;
    let venc = pixVencimento;
    let cnpj = pixCnpj;
    if (parecePixCopiaCola(pixCodigo)) {
      const dados = extrairDadosPixCopiaCola(pixCodigo);
      if (dados?.valor !== undefined && !valorTexto.trim()) {
        valorTexto = formatarValorPixParaInput(dados.valor);
        setPixValor(valorTexto);
      }
      if (dados?.vencimento && !venc) {
        venc = dados.vencimento;
        setPixVencimento(venc);
      }
      if (dados?.documentoRecebedor && !cnpj.trim()) {
        cnpj = formatarDocumentoPix(dados.documentoRecebedor) ?? dados.documentoRecebedor;
        setPixCnpj(cnpj);
      }
    }
    if (!venc) {
      venc = hojeIsoLocal();
      setPixVencimento(venc);
    }

    const valor = Number(valorTexto.replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      setErro(
        parecePixCopiaCola(pixCodigo)
          ? "Este PIX não trouxe valor (QR sem campo 54). Informe o valor manualmente."
          : "Informe um valor válido."
      );
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) {
      setErro("Informe a data de vencimento.");
      return;
    }
    if (!pixCodigo.trim()) {
      setErro("Cole o código PIX (copia e cola).");
      return;
    }

    mutate((atual) => {
      criarCobrancaPixSemNota(atual, {
        id: uid("pix"),
        valor,
        vencimento: venc,
        codigoPix: pixCodigo.trim(),
        fornecedor_id: pixFornecedorId || undefined,
        cnpj_beneficiario: cnpj.trim() || undefined,
        observacao: "PIX sem NFS-e — nota fiscal chega após o pagamento",
      });
    });

    setPixValor("");
    setPixCodigo("");
    setPixCnpj("");
    setPixLidoResumo(null);
    setMensagem("PIX incluído nos pagamentos futuros. Vincule a NFS-e quando chegar.");
    onIrParaPagamentos?.();
  }

  function vincular(boletoId: string, notaId: string) {
    setErro(null);
    setMensagem(null);
    let falhou: string | null = null;
    mutate((atual) => {
      const r = vincularNotaAoPagamento(atual, boletoId, notaId);
      if (!r.sucesso) {
        falhou = r.erros[0] ?? "Não foi possível vincular.";
      }
    });
    if (falhou) setErro(falhou);
    else setMensagem("NFS-e vinculada ao pagamento.");
  }

  function marcarJaPago(boletoId: string) {
    setErro(null);
    setMensagem(null);
    let falhou: string | null = null;
    mutate((atual) => {
      const r = marcarBoletoComoJaPago(atual, boletoId);
      if (!r.sucesso) falhou = r.erros[0] ?? "Não foi possível marcar como pago.";
    });
    if (falhou) setErro(falhou);
    else setMensagem("Marcado como já pago. Saiu da fila de pendências.");
  }

  const notaDetalhe = useMemo(
    () => (notaDetalheId ? db.notas_fiscais.find((n) => n.id === notaDetalheId) ?? null : null),
    [db.notas_fiscais, notaDetalheId]
  );
  const notaAvista = useMemo(
    () => (notaAvistaId ? db.notas_fiscais.find((n) => n.id === notaAvistaId) ?? null : null),
    [db.notas_fiscais, notaAvistaId]
  );
  const itemAvista = useMemo(
    () => (notaAvistaId ? notasPendentes.find((n) => n.nota.id === notaAvistaId) ?? null : null),
    [notaAvistaId, notasPendentes]
  );
  const bancosOrigem = useMemo(() => opcoesOrigemPagamento(db), [db]);

  function abrirPagamentoAvista(notaId: string) {
    const item = notasPendentes.find((n) => n.nota.id === notaId);
    if (!item) return;
    setNotaAvistaId(notaId);
    setAvistaMeio("pix");
    setAvistaData(hojeIsoLocal());
    setAvistaValor(String(item.valorPendente.toFixed(2)));
    setAvistaBanco(bancosOrigem[0] ?? "");
    setAvistaCartao("");
    setAvistaObs("");
    setAvistaErro(null);
  }

  function fecharPagamentoAvista() {
    if (processandoAvista) return;
    setNotaAvistaId(null);
    setAvistaErro(null);
  }

  function confirmarPagamentoAvista(e: FormEvent) {
    e.preventDefault();
    if (!notaAvistaId || processandoAvista) return;
    setProcessandoAvista(true);
    setAvistaErro(null);
    setErro(null);
    setMensagem(null);
    const valor = Number(String(avistaValor).replace(",", "."));
    let falhou: string | null = null;
    let meioOk: MeioPagamentoAvista = avistaMeio;
    mutate((atual) => {
      const r = registrarPagamentoAvistaNota(
        atual,
        notaAvistaId,
        {
          meio: avistaMeio,
          dataPagamento: avistaData,
          valorPago: valor,
          bancoConta: avistaBanco,
          cartao: avistaCartao,
          observacao: avistaObs,
        },
        { gerarIdParcela: () => uid("bol"), gerarIdHistorico: () => uid("bph") }
      );
      if (!r.sucesso) {
        falhou = r.erros[0] ?? "Não foi possível registrar o pagamento.";
        return;
      }
      meioOk = avistaMeio;
    });
    setProcessandoAvista(false);
    if (falhou) {
      setAvistaErro(falhou);
      return;
    }
    if (notaPareamentoId === notaAvistaId) {
      setNotaPareamentoId(null);
      setDocumentosPareamentoIds([]);
    }
    setNotaAvistaId(null);
    setMensagem(
      `Pagamento à vista (${rotuloMeioPagamentoAvista(meioOk)}) registrado. A nota saiu da fila de conferência.`
    );
  }

  async function obterArquivoPdfDaNota(nota: NotaFiscal): Promise<File | undefined> {
    await Promise.all([hidratarInboxDoIdb(), hidratarFilaLoteDoIdb()]);
    const chave = (nota.chave_acesso || nota.chave_nfse || "").replace(/\D+/g, "");
    const nome = (nota.arquivo_pdf_nome || "").trim().toLowerCase();

    for (const item of listarItensAbertosInbox()) {
      const chaveItem = (item.chaveNfe || item.chaveNfse || "").replace(/\D+/g, "");
      const nomeItem = item.nome.trim().toLowerCase();
      const bateChave = Boolean(chave && chaveItem && chave === chaveItem);
      const bateNome = Boolean(nome && nomeItem === nome);
      if (!bateChave && !bateNome) continue;
      const arquivo = await obterArquivoInboxAsync(item.id);
      if (arquivo) return arquivo;
    }

    for (const item of listarFilaLote()) {
      const nomeItem = item.nome.trim().toLowerCase();
      if (!nome || nomeItem !== nome) continue;
      const arquivo = await obterArquivoFilaAsync(item.id);
      if (arquivo) return arquivo;
    }

    return undefined;
  }

  async function verPdfNota(notaId: string) {
    if (abrindoNotaId) return;
    const nota = db.notas_fiscais.find((n) => n.id === notaId);
    if (!nota) return;
    setAbrindoNotaId(notaId);
    setErro(null);
    try {
      const arquivo = await obterArquivoPdfDaNota(nota);
      if (arquivo) {
        const url = URL.createObjectURL(arquivo);
        window.open(url, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setMensagem(`PDF da nota ${nota.numero} aberto em nova aba.`);
      } else {
        setNotaDetalheId(notaId);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o PDF da nota.");
      setNotaDetalheId(notaId);
    } finally {
      setAbrindoNotaId(null);
    }
  }

  function descartarDocumentoPendente(documentoId: string, motivo: "nao_boleto" | "ja_pago") {
    setErro(null);
    setMensagem(null);
    let falhou: string | null = null;
    mutate((atual) => {
      const r = descartarDocumentoBoletoPendente(atual, documentoId);
      if (!r.ok) falhou = r.erros[0] ?? "Não foi possível remover.";
    });
    if (falhou) {
      setErro(falhou);
      return;
    }
    setDocumentosPareamentoIds((ids) => ids.filter((id) => id !== documentoId));
    setMensagem(
      motivo === "ja_pago"
        ? "Removido da fila — registrado como já pago fora do ComprasChef."
        : "Removido da fila de boletos."
    );
  }

  async function enviarDocumentoComoNotaFiscal(documentoId: string, nomeArquivo: string) {
    if (reclassificandoId) return;
    setErro(null);
    setMensagem(null);
    setReclassificandoId(documentoId);
    try {
      const arquivo = await obterArquivoPdfDocumento(documentoId, nomeArquivo);
      if (!arquivo) {
        setErro(
          `Não achei o arquivo “${nomeArquivo}” neste navegador. Descarte aqui e importe de novo na Caixa como DANFE/XML.`
        );
        return;
      }

      const idLote = uid("lote");
      const classificacao: ResultadoClassificacaoArquivo = {
        tipo: "pdf_danfe",
        confianca: "media",
        rotulo: "DANFE (PDF)",
        detalhe: "Reclassificado na Conferência (não era boleto)",
        sinais: {
          pareceXmlNfe: false,
          temBoletoValido: false,
          temChaveDanfe: nomeArquivoPareceChaveNfe(nomeArquivo),
          pareceNfse: false,
        },
      };

      await hidratarFilaLoteDoIdb();
      acrescentarClassificados([
        {
          id: idLote,
          arquivo,
          classificacao,
          tipoEscolhido: "pdf_danfe",
        },
      ]);
      await flushPersistenciaFilaLote();

      let falhou: string | null = null;
      mutate((atual) => {
        const r = descartarDocumentoBoletoPendente(atual, documentoId);
        if (!r.ok) falhou = r.erros[0] ?? "Não foi possível tirar da fila de boletos.";
      });
      if (falhou) {
        setErro(falhou);
        return;
      }

      setDocumentosPareamentoIds((ids) => ids.filter((id) => id !== documentoId));
      setMensagem("Enviado ao Recebimento como DANFE. Conclua a conferência da mercadoria lá.");
      router.push(`/recebimento?abrirLote=1&itemLote=${encodeURIComponent(idLote)}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao reclassificar como nota fiscal.");
    } finally {
      setReclassificandoId(null);
    }
  }

  async function obterArquivoPdfDocumento(documentoId: string, nomeArquivo: string): Promise<File | undefined> {
    let arquivo = await lerArquivoDocumentoBoletoIdb(documentoId);
    if (!arquivo) {
      const lote = await listarRegistrosLoteIdb();
      const registro = lote.find(
        (item) => item.tipo === "pdf_boleto" && item.nome.toLowerCase() === nomeArquivo.toLowerCase()
      );
      if (registro) arquivo = registroIdbParaArquivo(registro);
    }
    return arquivo;
  }

  async function verPdfBoleto(documentoId: string, nomeArquivo: string) {
    setErro(null);
    setAbrindoPdfId(documentoId);
    try {
      const arquivo = await obterArquivoPdfDocumento(documentoId, nomeArquivo);
      if (!arquivo) {
        setErro(
          `Não achei o PDF “${nomeArquivo}” neste navegador. Use Conferir este boleto para reimportar o arquivo.`
        );
        return;
      }
      const url = URL.createObjectURL(arquivo);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o PDF.");
    } finally {
      setAbrindoPdfId(null);
    }
  }

  function aplicarLinhaManual(documentoId: string) {
    const linha = (linhaManualPorDoc[documentoId] || "").trim();
    if (!linha) {
      setErro("Cole a linha digitável do boleto (os números abaixo do código de barras).");
      return;
    }
    setErro(null);
    let falhou: string | null = null;
    mutate((atual) => {
      const resultado = aplicarLinhaDigitavelDocumento(atual, documentoId, linha);
      if (!resultado.ok) {
        falhou = resultado.erros.join(" ");
      }
    });
    if (falhou) {
      setErro(falhou);
      return;
    }
    setLinhaManualPorDoc((atual) => ({ ...atual, [documentoId]: "" }));
    setMensagem("Linha lida. Valor e vencimento devem aparecer no boleto — marque com a nota.");
  }

  async function relerDocumentoBoleto(documentoId: string, nomeArquivo: string) {
    if (relendoId) return;
    setErro(null);
    setMensagem(null);
    setRelendoId(documentoId);
    try {
      const arquivo = await obterArquivoPdfDocumento(documentoId, nomeArquivo);
      if (!arquivo) {
        setErro(`Não achei o PDF “${nomeArquivo}” neste navegador. Importe o arquivo de novo.`);
        return;
      }
      const identificado = await identificarCodigoBoletoNoArquivoLocal(arquivo, () => false);
      const linha = identificado.validos[0]?.valorNormalizado;
      if (!linha) {
        // Remove leitura absurda anterior (ex.: R$ milhões / venc. 1898)
        mutate((atual) => {
          const doc = atual.documentos_boleto.find((d) => d.id === documentoId);
          if (!doc) return;
          doc.linha_informada = undefined;
          doc.codigo_canonico = undefined;
          doc.formato_boleto = undefined;
          doc.resultado_confronto = undefined;
        });
        setErro(
          identificado.quantidadeCandidatos > 0
            ? "Achei números no PDF, mas nenhum parece um boleto válido (valor/vencimento estranhos). Cole a linha digitável abaixo — os números embaixo do código de barras."
            : "Ainda não deu para ler a linha deste PDF. Se o arquivo tiver vários boletos, use “Separar páginas”. Ou copie a linha digitável e cole no campo abaixo."
        );
        return;
      }
      let falhou: string | null = null;
      mutate((atual) => {
        const resultado = aplicarLinhaDigitavelDocumento(atual, documentoId, linha);
        if (!resultado.ok) falhou = resultado.erros.join(" ");
      });
      if (falhou) {
        setErro(falhou);
        return;
      }
      setMensagem("Leitura ok. Marque o boleto com a nota e confirme o pareamento.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao reler o PDF.");
    } finally {
      setRelendoId(null);
    }
  }

  async function separarPaginasBoleto(documentoId: string, nomeArquivo: string) {
    if (relendoId) return;
    setErro(null);
    setMensagem(null);
    setRelendoId(documentoId);
    try {
      const arquivo = await obterArquivoPdfDocumento(documentoId, nomeArquivo);
      if (!arquivo) {
        setErro(`Não achei o PDF “${nomeArquivo}” neste navegador. Importe o arquivo de novo.`);
        return;
      }
      const porPagina = await identificarBoletosPorPaginaNoPdf(arquivo, () => false);
      let novosIds: string[] = [];
      let avisos: string[] = [];
      let falhou: string | null = null;
      mutate((atual) => {
        const resultado = expandirDocumentoBoletoMultipagina(
          atual,
          { documentoId, paginas: porPagina.paginas },
          { gerarId: () => uid("docbol") }
        );
        if (!resultado.ok) {
          falhou = resultado.erros.join(" ");
          return;
        }
        avisos = resultado.avisos;
        novosIds = resultado.documentos.filter((d) => d.id !== documentoId).map((d) => d.id);
      });
      if (falhou) {
        setErro(falhou);
        return;
      }
      for (const id of novosIds) {
        try {
          await salvarArquivoDocumentoBoletoIdb(id, arquivo, nomeArquivo);
        } catch {
          // Ver PDF pode falhar até reimportar
        }
      }
      const lidos = porPagina.paginas.filter((p) => !p.pareceDanfe && p.validos.length > 0).length;
      const boletos = porPagina.paginas.filter((p) => !p.pareceDanfe).length;
      setMensagem(
        `Separei em ${boletos} boleto(s)${lidos ? ` · ${lidos} com linha lida` : " · nenhum com linha automática"}. ` +
          `Marque a nota e os ${boletos} itens e confirme o pareamento.` +
          (avisos.length ? ` ${avisos[0]}` : "")
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao separar páginas do PDF.");
    } finally {
      setRelendoId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Conferência</h2>
          <p className="text-sm text-slate-600">
            Notas em cima, boletos embaixo: marque com o X, confirme o pareamento e os títulos vão para
            Pagamentos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge cor="laranja">{resumo.totalNotas} nota(s) sem boleto</Badge>
          <Badge cor="azul">{resumo.totalParcelas} parcela(s) a conferir</Badge>
          <Badge cor="cinza">{boletosSemNf.length} boleto(s) sem NF</Badge>
          {boletosPendentesArquivo > 0 && (
            <Badge cor="laranja">{boletosPendentesArquivo} PDF(s) a enviar</Badge>
          )}
          <Badge cor="vermelho">
            {resumo.documentos.filter((d) => d.motivo === "confronto_bloqueado").length} divergência(s)
          </Badge>
          <Badge cor="cinza">{cobrancasSemNota.length} PIX sem nota</Badge>
        </div>
      </div>

      {mensagem && (
        <div className="rounded-card border border-sucesso bg-sucesso-clara px-4 py-3 text-sm font-medium text-primaria-escura">
          {mensagem}
        </div>
      )}
      {erro && (
        <div className="rounded-card border border-erro bg-erro-clara px-4 py-3 text-sm font-medium text-erro">
          {erro}
        </div>
      )}

      {(boletosPendentesArquivo > 0 ||
        resumo.documentos.some((d) => d.motivo === "confronto_bloqueado")) && (
        <Card className="space-y-3 p-4">
          <p className="rotulo">Filas rápidas</p>
          <p className="text-xs text-slate-600">
            As parcelas da nota aparecem em <strong>Boletos sem NF → Parcelas aguardando PDF</strong>. Os
            PDFs da Caixa só saem de lá quando você clicar em <strong>Enviar para boletos sem NF</strong>{" "}
            (não esvazia mais sozinho).
          </p>
          {boletosPendentesArquivo > 0 && (
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-amber-950">
                  PDFs pendentes ({boletosPendentesArquivo})
                  {boletosLote.length > 0 ? ` · lote ${boletosLote.length}` : ""}
                  {boletosInbox.length > 0 ? ` · caixa ${boletosInbox.length}` : ""}
                </p>
                <button
                  type="button"
                  className="btn-primario inline-flex items-center gap-2 text-xs"
                  disabled={transferindoLote}
                  onClick={() => void transferirBoletosDaFilaLote({ incluirInbox: true })}
                >
                  <Upload size={14} />
                  {transferindoLote ? "Enviando…" : "Enviar para boletos sem NF"}
                </button>
              </div>
              <ul className="max-h-28 space-y-1 overflow-y-auto text-sm text-slate-800">
                {[...boletosLote, ...boletosInbox]
                  .filter((item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx)
                  .slice(0, 10)
                  .map((item) => (
                    <li key={item.id} className="truncate px-1">
                      {item.nome}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {resumo.documentos.filter((d) => d.motivo === "confronto_bloqueado").length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800">Documentos com divergência</p>
              <p className="text-xs text-slate-500">
                Já estão em “Boletos sem NF” — marque com a nota certa (vencimento importa: outubro
                não casa com agosto).
              </p>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                {resumo.documentos
                  .filter((d) => d.motivo === "confronto_bloqueado")
                  .slice(0, 8)
                  .map((item) => (
                    <li
                      key={item.documento.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-erro/40 bg-erro-clara/40 px-2 py-1.5"
                    >
                      <span>
                        {item.documento.nome_arquivo} · {item.rotuloMotivo}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="rotulo flex items-center gap-1.5">
            <ReceiptText size={14} /> Notas sem boleto conferido
          </p>
          <p className="text-xs text-slate-500">
            Pareie com o PDF do boleto, ou registre pagamento à vista (PIX, dinheiro ou cartão no
            estabelecimento).
          </p>
        </div>
        {notasPendentes.length === 0 ? (
          <Vazio mensagem="Nenhuma nota aguardando boleto." />
        ) : (
          <ul className="space-y-2">
            {notasPendentes.map((item) => {
              const marcada = notaPareamentoId === item.nota.id;
              return (
                <li
                  key={item.nota.id}
                  className={`rounded-lg border px-3 py-2 transition-colors ${
                    marcada ? "border-primaria bg-primaria-clara" : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={marcada}
                        onChange={() => alternarNotaPareamento(item.nota.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{item.fornecedorNome}</span>
                        <span className="block text-sm text-slate-600">
                          {item.nota.tipo === "nfse" ? "NFS-e" : "NF-e"} {item.nota.numero} ·{" "}
                          {item.quantidadePendentes > 0
                            ? `${item.quantidadePendentes} pendente(s) · ${moeda(item.valorPendente)}`
                            : `sem parcela · ${moeda(item.valorPendente)}`}
                          {item.proximoVencimento ? ` · venc. ${dataBR(item.proximoVencimento)}` : ""}
                        </span>
                        <span className="block text-xs text-slate-500">
                          Total da nota {moeda(item.nota.valor_total)}
                          {item.parcelasPendentes.length > 0
                            ? ` · ${item.parcelasPendentes.length} parcela(s): ${item.parcelasPendentes
                                .map((p) => moeda(p.valor))
                                .join(" + ")}`
                            : ""}
                          {item.parcelasPendentes.length > 1
                            ? ` · venc. ${item.parcelasPendentes
                                .map((p) => dataBR(p.vencimento))
                                .filter((v, i, arr) => arr.indexOf(v) === i)
                                .join(" · ")}`
                            : ""}
                        </span>
                        {marcada && item.parcelasPendentes.length > 0 && (
                          <span className="mt-1 block text-xs text-primaria-escura">
                            Marque embaixo os PDFs que somem {moeda(item.valorPendente)} (um por
                            parcela).
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 pl-7">
                    <button
                      type="button"
                      className="btn-secundario inline-flex items-center gap-1 text-xs"
                      disabled={abrindoNotaId === item.nota.id}
                      onClick={() => void verPdfNota(item.nota.id)}
                    >
                      <Eye size={14} />
                      {abrindoNotaId === item.nota.id ? "Abrindo…" : "Ver nota"}
                    </button>
                    {(item.nota.status === "aguardando_conferencia" &&
                      (item.nota.itens_importados?.length ?? 0) > 0) && (
                      <button
                        type="button"
                        className="btn-secundario inline-flex items-center gap-1 text-xs"
                        onClick={() =>
                          router.push(`/recebimento?conferirNota=${encodeURIComponent(item.nota.id)}`)
                        }
                      >
                        <PackagePlus size={14} /> Conferir estoque
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-primario inline-flex items-center gap-1 text-xs"
                      onClick={() => abrirPagamentoAvista(item.nota.id)}
                    >
                      <Wallet size={14} /> Pago à vista
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {notaSelecionada?.tipo === "nfse" && sugestoesNfse.length > 0 && (
          <div className="space-y-2 rounded-lg border border-primaria/40 bg-primaria-clara/40 p-3">
            <p className="text-sm font-semibold text-primaria-escura">
              PIX sem nota que podem ser desta NFS-e
            </p>
            {sugestoesNfse.map((s) => (
              <div
                key={s.boleto.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-2 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{fornecedorDoPagamento(db, s.boleto)}</p>
                  <p className="text-slate-600">
                    {moeda(s.boleto.valor)} · {s.motivos.join(", ")}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-primario inline-flex items-center gap-1 text-xs"
                  onClick={() => vincular(s.boleto.id, notaSelecionada.id)}
                >
                  <Link2 size={14} /> Vincular
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="rotulo flex items-center gap-1.5">
            <FileText size={14} /> Boletos sem NF conferida
          </p>
          {notaPareamentoId && documentosSugeridosIds.size > 0 && (
            <button type="button" className="btn-secundario text-xs" onClick={marcarSugeridos}>
              Marcar sugeridos ({documentosSugeridosIds.size})
            </button>
          )}
        </div>
        <p className="text-sm text-slate-600">
          Marque os PDFs referentes à nota. Se aparecer “Não leu”, marque mesmo assim (usa o valor da
          parcela) ou cole a linha digitável.
          {notaPareamentoId && documentosSugeridosIds.size > 0
            ? " Itens em azul são sugestão automática."
            : ""}
        </p>

        {parcelasAguardandoPdf.length > 0 && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-amber-950">
                Parcelas aguardando PDF ({parcelasAguardandoPdf.length})
                {notaPareamentoId ? " · desta nota" : ""}
              </p>
              {onImportarBoleto && (
                <button
                  type="button"
                  className="btn-primario inline-flex items-center gap-1 text-xs"
                  onClick={() => onImportarBoleto(parcelasAguardandoPdf[0]?.boleto.id)}
                >
                  <Upload size={14} /> Importar PDF
                </button>
              )}
            </div>
            <p className="text-xs text-amber-900/80">
              São títulos da NF (cobrança do XML), não arquivos. Importe o PDF de cada um para eles
              entrarem na lista de baixo e poderem ser marcados.
            </p>
            <ul className="max-h-48 space-y-1.5 overflow-y-auto text-sm">
              {parcelasAguardandoPdf.map((item) => (
                <li
                  key={item.boleto.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-100 bg-white px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {item.fornecedorNome}
                      {item.nota?.numero ? ` · NF-e ${item.nota.numero}` : ""}
                    </p>
                    <p className="text-slate-600">
                      {moeda(item.boleto.valor)}
                      {item.boleto.vencimento ? ` · venc. ${dataBR(item.boleto.vencimento)}` : ""}
                      {item.boleto.numero_parcela != null
                        ? ` · parc. ${item.boleto.numero_parcela}`
                        : ""}
                    </p>
                    <p className="text-xs text-slate-500">{item.rotuloMotivo}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge cor="laranja">Sem PDF</Badge>
                    {onImportarBoleto && (
                      <button
                        type="button"
                        className="btn-secundario text-xs"
                        onClick={() => onImportarBoleto(item.boleto.id)}
                      >
                        <Upload size={14} /> PDF
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          PDFs para marcar ({boletosSemNf.length})
        </p>
        {boletosSemNf.length === 0 ? (
          <Vazio
            mensagem={
              parcelasAguardandoPdf.length > 0
                ? "Ainda não há PDF importado. Use Importar PDF nas parcelas acima (ou na Caixa)."
                : "Nenhum boleto aguardando vínculo com NF-e."
            }
          />
        ) : (
          <ul className="space-y-2">
            {boletosSemNf.map((item) => {
              const marcado = documentosPareamentoIds.includes(item.documento.id);
              const sugerido = documentosSugeridosIds.has(item.documento.id);
              const semLeitura = item.motivo === "leitura_incompleta";
              const pareceNfe = nomeArquivoPareceChaveNfe(item.documento.nome_arquivo);
              return (
                <li
                  key={item.documento.id}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    marcado
                      ? "border-primaria bg-primaria-clara/40"
                      : sugerido
                        ? "border-blue-300 bg-blue-50/50"
                        : semLeitura
                          ? "border-amber-300 bg-amber-50/40"
                          : "border-slate-200"
                  }`}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={marcado}
                      onChange={() => alternarDocumentoPareamento(item.documento.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{item.documento.nome_arquivo}</p>
                          <p className="text-slate-600">
                            {item.valor != null ? moeda(item.valor) : "Valor —"}
                            {item.vencimento ? ` · venc. ${dataBR(item.vencimento)}` : " · venc. —"}
                            {item.fornecedorNome ? ` · ${item.fornecedorNome}` : ""}
                          </p>
                          <p className="text-xs text-slate-500">{item.rotuloMotivo}</p>
                          {pareceNfe && (
                            <p className="mt-1 text-xs font-medium text-amber-900">
                              Nome parece chave de NF-e — use “Isto é NF-e” se não for boleto.
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {sugerido && <Badge cor="azul">Sugestão</Badge>}
                          {pareceNfe && <Badge cor="cinza">Parece NF-e</Badge>}
                          <Badge
                            cor={
                              item.motivo === "confronto_bloqueado"
                                ? "vermelho"
                                : semLeitura
                                  ? "laranja"
                                  : "laranja"
                            }
                          >
                            {item.motivo === "sem_parcela"
                              ? "Sem NF"
                              : item.motivo === "confronto_bloqueado"
                                ? "Divergente"
                                : semLeitura
                                  ? "Não leu"
                                  : "A vincular"}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-secundario inline-flex items-center gap-1 text-xs"
                          disabled={abrindoPdfId === item.documento.id}
                          onClick={() => void verPdfBoleto(item.documento.id, item.documento.nome_arquivo)}
                        >
                          <Eye size={14} />
                          {abrindoPdfId === item.documento.id ? "Abrindo..." : "Ver PDF"}
                        </button>
                        <button
                          type="button"
                          className="btn-secundario inline-flex items-center gap-1 text-xs"
                          disabled={relendoId === item.documento.id}
                          onClick={() =>
                            void relerDocumentoBoleto(item.documento.id, item.documento.nome_arquivo)
                          }
                        >
                          <RefreshCw size={14} />
                          {relendoId === item.documento.id ? "Lendo…" : "Ler de novo"}
                        </button>
                        {(semLeitura || !item.documento.pagina_pdf) && (
                          <button
                            type="button"
                            className="btn-secundario inline-flex items-center gap-1 text-xs"
                            disabled={relendoId === item.documento.id}
                            onClick={() =>
                              void separarPaginasBoleto(item.documento.id, item.documento.nome_arquivo)
                            }
                            title="PDF com DANFE + vários boletos: cria um item por página de boleto"
                          >
                            <FileText size={14} />
                            Separar páginas
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-secundario inline-flex items-center gap-1 text-xs"
                          disabled={reclassificandoId === item.documento.id}
                          onClick={() =>
                            void enviarDocumentoComoNotaFiscal(
                              item.documento.id,
                              item.documento.nome_arquivo
                            )
                          }
                        >
                          <ReceiptText size={14} />
                          {reclassificandoId === item.documento.id ? "Enviando…" : "Isto é NF-e"}
                        </button>
                        {item.boleto?.id ? (
                          <button
                            type="button"
                            className="btn-secundario text-xs"
                            onClick={() => marcarJaPago(item.boleto!.id)}
                          >
                            <CircleCheckBig size={14} /> Já pago
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-secundario text-xs"
                            onClick={() => descartarDocumentoPendente(item.documento.id, "ja_pago")}
                          >
                            <CircleCheckBig size={14} /> Já paguei
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-secundario inline-flex items-center gap-1 text-xs"
                          onClick={() => descartarDocumentoPendente(item.documento.id, "nao_boleto")}
                        >
                          <Trash2 size={14} /> Descartar
                        </button>
                      </div>
                      {semLeitura && (
                        <div className="mt-2 space-y-1.5 rounded-md border border-amber-200 bg-white px-2.5 py-2">
                          <p className="text-xs text-amber-950">
                            Marque com a nota para usar o valor da parcela, ou cole a linha digitável
                            (números embaixo do código de barras). Se já pagou ou não for boleto, use
                            os botões acima.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <input
                              className="input min-w-[16rem] flex-1 text-xs"
                              placeholder="Cole a linha digitável"
                              value={linhaManualPorDoc[item.documento.id] ?? ""}
                              onChange={(event) =>
                                setLinhaManualPorDoc((atual) => ({
                                  ...atual,
                                  [item.documento.id]: event.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="btn-primario text-xs"
                              onClick={() => aplicarLinhaManual(item.documento.id)}
                            >
                              Aplicar linha
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {(notaPareamentoId || documentosPareamentoIds.length > 0) && (
        <div className="sticky bottom-3 z-10 rounded-card border border-primaria bg-white p-4 shadow-lg">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              <p className="font-semibold text-slate-900">Confirmar pareamento</p>

              {notaPareamento && (
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Nota</p>
                    <p className="font-bold text-slate-900">
                      {moeda(notaPareamento.valor_total)}
                    </p>
                    <p className="text-xs text-slate-600">NF-e {notaPareamento.numero}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Soma dos boletos
                    </p>
                    <p className="font-bold text-slate-900">
                      {validacaoPareamento
                        ? moeda(validacaoPareamento.somaBoletos)
                        : documentosPareamentoIds.length === 0
                          ? moeda(0)
                          : "—"}
                    </p>
                    <p className="text-xs text-slate-600">
                      {documentosPareamentoIds.length} marcado(s)
                    </p>
                  </div>
                  <div
                    className={`rounded-lg border px-3 py-2 ${
                      !validacaoPareamento || documentosPareamentoIds.length === 0
                        ? "border-slate-200 bg-slate-50"
                        : validacaoPareamento.divergenciaValor
                          ? "border-amber-300 bg-amber-50"
                          : "border-emerald-300 bg-emerald-50"
                    }`}
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Diferença
                    </p>
                    <p className="font-bold text-slate-900">
                      {validacaoPareamento && documentosPareamentoIds.length > 0
                        ? moeda(
                            Math.abs(
                              validacaoPareamento.somaBoletos - validacaoPareamento.valorReferencia
                            )
                          )
                        : "—"}
                    </p>
                    <p className="text-xs text-slate-600">
                      {!validacaoPareamento || documentosPareamentoIds.length === 0
                        ? "Marque nota e boletos"
                        : validacaoPareamento.divergenciaValor
                          ? "Divergente — justifique"
                          : "Bate com a nota"}
                    </p>
                  </div>
                </div>
              )}

              {!notaPareamento && (
                <p className="text-slate-600">Marque uma nota acima para comparar os valores.</p>
              )}

              {validacaoPareamento?.divergenciaValor && (
                <label className="mt-1 block">
                  <span className="rotulo mb-1 block">Justificativa da divergência *</span>
                  <input
                    className="input w-full max-w-xl"
                    value={justificativaPareamento}
                    onChange={(event) => setJustificativaPareamento(event.target.value)}
                    placeholder="Ex.: desconto comercial / juros / parcela parcial"
                  />
                </label>
              )}
              {validacaoPareamento && validacaoPareamento.avisos.length > 0 && (
                <p className="text-xs text-amber-800">{validacaoPareamento.avisos.join(" ")}</p>
              )}
              {validacaoPareamento && !validacaoPareamento.ok && !validacaoPareamento.exigeJustificativa && (
                <p className="text-erro">{validacaoPareamento.erros.join(" ")}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secundario"
                onClick={() => {
                  setNotaPareamentoId(null);
                  setDocumentosPareamentoIds([]);
                  setJustificativaPareamento("");
                }}
              >
                Limpar seleção
              </button>
              <button
                type="button"
                className="btn-primario"
                disabled={
                  processandoPareamento ||
                  !notaPareamentoId ||
                  documentosPareamentoIds.length === 0 ||
                  !podeConfirmarPareamento
                }
                onClick={confirmarPareamento}
              >
                <CircleCheckBig size={16} />
                {processandoPareamento ? "Confirmando..." : "Confirmar pareamento"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Card className="space-y-3 p-4">
        <p className="rotulo">Cobranças sem nota (PIX / serviço)</p>
        <p className="text-sm text-slate-600">
          Cole o PIX copia e cola — o sistema preenche valor e CNPJ quando o código trouxer esses
          dados. Depois do pagamento, anexe a NFS-e nesta conferência.
        </p>

        {cobrancasSemNota.length === 0 ? (
          <Vazio mensagem="Nenhuma cobrança aguardando NFS-e." />
        ) : (
          <ul className="space-y-2">
            {cobrancasSemNota.map((boleto) => (
              <li
                key={boleto.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-semibold">{fornecedorDoPagamento(db, boleto)}</p>
                  <p className="text-slate-700">
                    {moeda(boleto.valor)} · venc. {dataBR(boleto.vencimento)} · {boleto.status}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge cor="laranja">Aguardando NFS-e</Badge>
                  {boleto.status !== "pago" && boleto.status !== "aguardando_conciliacao" && (
                    <button
                      type="button"
                      className="btn-secundario inline-flex items-center gap-1 text-xs"
                      onClick={() => marcarJaPago(boleto.id)}
                    >
                      <CircleCheckBig size={14} /> Já pago
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-secundario text-xs"
                    onClick={() => onIrParaPagamentos?.(boleto.id)}
                  >
                    Ver na agenda
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="rotulo mb-1 block">Código PIX (copia e cola)</span>
            <textarea
              className="campo w-full min-h-[72px]"
              value={pixCodigo}
              onChange={(e) => aoColarOuDigitarPix(e.target.value)}
              onPaste={(e) => {
                const texto = e.clipboardData.getData("text");
                if (texto) {
                  e.preventDefault();
                  aoColarOuDigitarPix(texto);
                }
              }}
              placeholder="Cole o código PIX aqui — valor e CNPJ são preenchidos automaticamente"
            />
            {pixLidoResumo && (
              <p className="mt-1 text-xs font-medium text-primaria-escura">{pixLidoResumo}</p>
            )}
          </label>
          <label className="text-sm">
            <span className="rotulo mb-1 block">Valor</span>
            <input
              className="campo w-full"
              value={pixValor}
              onChange={(e) => setPixValor(e.target.value)}
              placeholder="200,00"
            />
          </label>
          <label className="text-sm">
            <span className="rotulo mb-1 block">Vencimento</span>
            <input
              type="date"
              className="campo w-full"
              value={pixVencimento}
              onChange={(e) => setPixVencimento(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="rotulo mb-1 block">Fornecedor (opcional)</span>
            <select
              className="campo w-full"
              value={pixFornecedorId}
              onChange={(e) => setPixFornecedorId(e.target.value)}
            >
              <option value="">—</option>
              {db.fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="rotulo mb-1 block">CNPJ beneficiário (opcional)</span>
            <input
              className="campo w-full"
              value={pixCnpj}
              onChange={(e) => setPixCnpj(e.target.value)}
              placeholder="00.000.000/0000-00"
            />
          </label>
          <div className="sm:col-span-2">
            <button type="button" className="btn-primario" onClick={registrarPixSemNota}>
              Incluir PIX sem NFS-e na agenda
            </button>
          </div>
        </div>
      </Card>

      <Modal
        aberto={Boolean(notaDetalhe)}
        titulo="Detalhes da nota"
        onFechar={() => setNotaDetalheId(null)}
        tamanho="lg"
      >
        {notaDetalhe && (
          <div className="space-y-3 text-sm text-slate-700">
            <VistaNotaEstiloDanfe
              nota={notaDetalhe}
              fornecedorNome={resumoNotaParaExibicao(db, notaDetalhe).fornecedorNome}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secundario" onClick={() => setNotaDetalheId(null)}>
                Fechar
              </button>
              {notaDetalhe.status === "aguardando_conferencia" &&
                (notaDetalhe.itens_importados?.length ?? 0) > 0 && (
                <button
                  type="button"
                  className="btn-secundario inline-flex items-center gap-1"
                  onClick={() => {
                    setNotaDetalheId(null);
                    router.push(`/recebimento?conferirNota=${encodeURIComponent(notaDetalhe.id)}`);
                  }}
                >
                  <PackagePlus size={14} /> Conferir estoque
                </button>
              )}
              <button
                type="button"
                className="btn-primario inline-flex items-center gap-1"
                onClick={() => {
                  setNotaDetalheId(null);
                  abrirPagamentoAvista(notaDetalhe.id);
                }}
              >
                <Wallet size={14} /> Pago à vista
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        aberto={Boolean(notaAvista && itemAvista)}
        titulo="Pagamento à vista no estabelecimento"
        onFechar={fecharPagamentoAvista}
        fecharAoClicarFundo={!processandoAvista}
      >
        {notaAvista && itemAvista && (
          <form onSubmit={confirmarPagamentoAvista} className="space-y-3">
            <Card className="space-y-1 bg-slate-50 py-3">
              <p className="font-bold text-slate-900">{itemAvista.fornecedorNome}</p>
              <p className="text-sm text-slate-700">
                {notaAvista.tipo === "nfse" ? "NFS-e" : "NF-e"} {notaAvista.numero}
              </p>
              <p className="text-sm text-slate-700">
                Valor pendente: {moeda(itemAvista.valorPendente)}
                {itemAvista.quantidadePendentes > 1
                  ? ` · ${itemAvista.quantidadePendentes} parcela(s)`
                  : ""}
              </p>
            </Card>

            <fieldset className="space-y-2">
              <legend className="rotulo mb-1 block">Como foi pago? *</legend>
              <div className="flex flex-wrap gap-2">
                {MEIOS_PAGAMENTO_AVISTA.map((meio) => (
                  <label
                    key={meio}
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      avistaMeio === meio
                        ? "border-primaria bg-primaria-clara font-semibold"
                        : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="meio-avista"
                      checked={avistaMeio === meio}
                      onChange={() => setAvistaMeio(meio)}
                    />
                    {rotuloMeioPagamentoAvista(meio)}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="rotulo mb-1 block">Data do pagamento *</span>
                <input
                  type="date"
                  className="campo w-full"
                  value={avistaData}
                  onChange={(e) => setAvistaData(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="rotulo mb-1 block">Valor pago *</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="campo w-full"
                  value={avistaValor}
                  onChange={(e) => setAvistaValor(e.target.value)}
                  required
                />
              </label>
              {(avistaMeio === "pix" || avistaMeio === "cartao") && (
                <label className="block text-sm sm:col-span-2">
                  <span className="rotulo mb-1 block">
                    {avistaMeio === "pix" ? "Banco/conta do PIX *" : "Banco/conta do cartão *"}
                  </span>
                  <input
                    className="campo w-full"
                    list="lista-bancos-avista-conferencia"
                    value={avistaBanco}
                    onChange={(e) => setAvistaBanco(e.target.value)}
                    placeholder="Ex.: Itaú — conta corrente"
                    required
                  />
                  <datalist id="lista-bancos-avista-conferencia">
                    {bancosOrigem.map((banco) => (
                      <option key={banco} value={banco} />
                    ))}
                  </datalist>
                </label>
              )}
              {avistaMeio === "cartao" && (
                <label className="block text-sm sm:col-span-2">
                  <span className="rotulo mb-1 block">Qual cartão? *</span>
                  <input
                    className="campo w-full"
                    value={avistaCartao}
                    onChange={(e) => setAvistaCartao(e.target.value)}
                    placeholder="Ex.: Visa final 4412 / Mastercard PJ"
                    required
                  />
                </label>
              )}
              <label className="block text-sm sm:col-span-2">
                <span className="rotulo mb-1 block">Observação (opcional)</span>
                <textarea
                  className="campo min-h-16 w-full py-2"
                  value={avistaObs}
                  onChange={(e) => setAvistaObs(e.target.value)}
                />
              </label>
            </div>

            {itemAvista.quantidadePendentes > 1 && (
              <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-950">
                Esta nota tem {itemAvista.quantidadePendentes} parcelas pendentes: cada uma será
                marcada com o mesmo meio/data/banco, usando o valor da própria parcela.
              </p>
            )}

            {avistaErro && (
              <p className="rounded-card border border-erro bg-erro-clara px-3 py-2 text-sm font-medium text-erro">
                {avistaErro}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secundario"
                onClick={fecharPagamentoAvista}
                disabled={processandoAvista}
              >
                Cancelar
              </button>
              <button type="submit" className="btn-primario" disabled={processandoAvista}>
                <CircleCheckBig size={16} />
                {processandoAvista ? "Salvando…" : "Confirmar pagamento"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
