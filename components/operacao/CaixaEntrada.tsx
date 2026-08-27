"use client";

/**
 * Caixa de entrada unificada: classifica, sugere, confirma.
 * Compra → lote / Financeiro; resto → pastas OneDrive locais.
 * Prévia ao lado + Ver (modal) + atalho Enviar ao OneDrive.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CloudUpload,
  Eye,
  FileText,
  FolderOpen,
  HardDrive,
  Inbox,
  Loader2,
  Trash2,
} from "lucide-react";
import { Badge, Card, Modal } from "@/components/ui";
import { classificarArquivosRecebimentoBrowser } from "@/lib/domain/classificar-arquivo-recebimento-browser";
import type { ResultadoClassificacaoArquivo } from "@/lib/domain/classificar-arquivo-recebimento";
import {
  montarSugestaoInbox,
  pastaPadraoEnvioOneDrive,
  rotuloPastaInbox,
  rotuloTipoDestinoInbox,
  tipoRecebimentoDaCompra,
  TIPOS_DESTINO_INBOX,
  type TipoDestinoInbox,
} from "@/lib/domain/inbox-entrada";
import type { ItemFilaInbox } from "@/lib/domain/inbox-entrada-idb";
import {
  acrescentarClassificadosNaInbox,
  alterarTipoItemInbox,
  definirFilaInboxDeClassificados,
  flushPersistenciaInbox,
  hidratarInboxDoIdb,
  limparFilaInbox,
  obterArquivoInboxAsync,
  removerItemInbox,
  useFilaInboxEntrada,
} from "@/lib/domain/inbox-entrada-store";
import {
  acrescentarClassificados,
  flushPersistenciaFilaLote,
  hidratarFilaLoteDoIdb,
  marcarItemEmAndamento,
} from "@/lib/domain/lote-recebimento-store";
import {
  escolherPastaRaizOneDrive,
  escolherPastaDestinoEscrita,
  copiarArquivoParaInboxOneDrive,
  copiarArquivoParaPastaHandle,
  NOME_PASTA_INBOX,
  onedrivePastaLocalDisponivel,
  obterPastaRaizOneDrive,
  obterPastaSugestaoParaPicker,
  PASTAS_INBOX,
  type PastaRelativaInbox,
} from "@/lib/domain/onedrive-pasta-local";

type PreviewArquivo = {
  url: string;
  mime: string;
  nome: string;
  textoXml?: string;
};

function corTipo(tipo: TipoDestinoInbox): "verde" | "azul" | "laranja" | "vermelho" | "cinza" {
  switch (tipo) {
    case "xml_nfe":
      return "verde";
    case "pdf_boleto":
      return "azul";
    case "pdf_nfse":
    case "documento_restaurante":
      return "laranja";
    case "pdf_danfe":
    case "foto_restaurante":
    case "pessoal":
      return "cinza";
    default:
      return "vermelho";
  }
}

function classificacaoStub(
  tipo: TipoDestinoInbox,
  detalhe?: string
): ResultadoClassificacaoArquivo {
  const tipoRecebimento = tipoRecebimentoDaCompra(tipo) ?? "desconhecido";
  return {
    tipo: tipoRecebimento,
    confianca: "media",
    rotulo: rotuloTipoDestinoInbox(tipo),
    detalhe,
    sinais: {
      pareceXmlNfe: tipo === "xml_nfe",
      temBoletoValido: tipo === "pdf_boleto",
      temChaveDanfe: tipo === "pdf_danfe",
      pareceNfse: tipo === "pdf_nfse",
    },
  };
}

function ehImagemPreview(mime: string, nome: string): boolean {
  return mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic)$/i.test(nome);
}

function ehPdfPreview(mime: string, nome: string): boolean {
  return mime === "application/pdf" || nome.toLowerCase().endsWith(".pdf");
}

/** Carrega object URLs / texto XML para miniaturas da fila. */
function usePreviewsFila(fila: ItemFilaInbox[]) {
  const [previews, setPreviews] = useState<Record<string, PreviewArquivo>>({});
  const idsChave = fila.map((i) => i.id).join(",");

  useEffect(() => {
    let cancelado = false;
    const urls: string[] = [];

    void (async () => {
      const next: Record<string, PreviewArquivo> = {};
      for (const item of fila) {
        const arquivo = await obterArquivoInboxAsync(item.id);
        if (!arquivo || cancelado) continue;
        const nome = arquivo.name;
        const mime = arquivo.type || "application/octet-stream";
        const ehXml = mime.includes("xml") || nome.toLowerCase().endsWith(".xml");
        if (ehXml) {
          try {
            const textoXml = await arquivo.text();
            next[item.id] = { url: "", mime, nome, textoXml };
          } catch {
            next[item.id] = { url: "", mime, nome, textoXml: "(não foi possível ler o XML)" };
          }
        } else {
          const url = URL.createObjectURL(arquivo);
          urls.push(url);
          next[item.id] = { url, mime, nome };
        }
      }
      if (!cancelado) setPreviews(next);
    })();

    return () => {
      cancelado = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsChave resume a fila
  }, [idsChave]);

  return previews;
}

function MiniaturaPreview({ preview }: { preview: PreviewArquivo | undefined }) {
  if (!preview) {
    return (
      <div className="flex h-36 w-full items-center justify-center rounded-lg bg-slate-100 text-slate-400 sm:h-40 sm:w-36">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }
  if (preview.textoXml !== undefined) {
    return (
      <div className="h-36 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2 sm:h-40 sm:w-36">
        <pre className="text-[9px] leading-tight text-slate-600 whitespace-pre-wrap break-all">
          {preview.textoXml.slice(0, 400)}
          {preview.textoXml.length > 400 ? "…" : ""}
        </pre>
      </div>
    );
  }
  if (ehImagemPreview(preview.mime, preview.nome)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={preview.url}
        alt={preview.nome}
        className="h-36 w-full rounded-lg border border-slate-200 bg-slate-100 object-contain sm:h-40 sm:w-36"
      />
    );
  }
  if (ehPdfPreview(preview.mime, preview.nome)) {
    return (
      <iframe
        title={`Prévia ${preview.nome}`}
        src={preview.url}
        className="pointer-events-none h-36 w-full rounded-lg border border-slate-200 bg-slate-100 sm:h-40 sm:w-36"
      />
    );
  }
  return (
    <div className="flex h-36 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-500 sm:h-40 sm:w-36">
      <FileText size={28} />
      <span className="px-2 text-center text-[11px]">Sem prévia</span>
    </div>
  );
}

export default function CaixaEntrada() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const fila = useFilaInboxEntrada();
  const previews = usePreviewsFila(fila);
  const [lendo, setLendo] = useState(false);
  const [progresso, setProgresso] = useState<{ feito: number; total: number; nome: string } | null>(
    null
  );
  const [erro, setErro] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [substituir, setSubstituir] = useState(false);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [enviandoOneDriveId, setEnviandoOneDriveId] = useState<string | null>(null);
  const [pastaPronta, setPastaPronta] = useState(false);
  const [nomePasta, setNomePasta] = useState<string | null>(null);
  const [verificandoPasta, setVerificandoPasta] = useState(true);
  const [pastasEnvio, setPastasEnvio] = useState<Record<string, PastaRelativaInbox>>({});
  const [previewModal, setPreviewModal] = useState<PreviewArquivo | null>(null);
  const apiOk = onedrivePastaLocalDisponivel();

  const contagem = useMemo(() => {
    const map = Object.fromEntries(TIPOS_DESTINO_INBOX.map((t) => [t, 0])) as Record<
      TipoDestinoInbox,
      number
    >;
    for (const item of fila) map[item.tipo] += 1;
    return map;
  }, [fila]);

  useEffect(() => {
    setPastasEnvio((atual) => {
      const next = { ...atual };
      for (const item of fila) {
        if (!next[item.id]) next[item.id] = pastaPadraoEnvioOneDrive(item.tipo);
      }
      for (const id of Object.keys(next)) {
        if (!fila.some((i) => i.id === id)) delete next[id];
      }
      return next;
    });
  }, [fila]);

  useEffect(() => {
    void (async () => {
      await hidratarInboxDoIdb();
      setVerificandoPasta(true);
      try {
        const raiz = await obterPastaRaizOneDrive();
        if (raiz) {
          setPastaPronta(true);
          setNomePasta(raiz.name);
        } else {
          setPastaPronta(false);
          setNomePasta(null);
        }
      } finally {
        setVerificandoPasta(false);
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (previewModal?.url) URL.revokeObjectURL(previewModal.url);
    };
  }, [previewModal?.url]);

  async function configurarPasta() {
    setErro(null);
    setOkMsg(null);
    try {
      const raiz = await escolherPastaRaizOneDrive();
      setPastaPronta(true);
      setNomePasta(raiz.name);
      setOkMsg(
        `Pasta pronta: ${raiz.name}/${NOME_PASTA_INBOX}. A sync do OneDrive sobe os arquivos.`
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível escolher a pasta.");
    }
  }

  async function aoEscolher(lista: FileList | null) {
    if (!lista?.length) return;
    setErro(null);
    setOkMsg(null);
    setLendo(true);
    setProgresso({ feito: 0, total: lista.length, nome: "" });
    try {
      await hidratarInboxDoIdb();
      const classificados = await classificarArquivosRecebimentoBrowser(Array.from(lista), {
        onProgresso: (feito, total, nome) => setProgresso({ feito, total, nome }),
      });
      if (classificados.length === 0) {
        setErro("Nenhum arquivo foi classificado. Tente de novo.");
        return;
      }
      if (substituir || fila.length === 0) {
        definirFilaInboxDeClassificados(classificados);
      } else {
        acrescentarClassificadosNaInbox(classificados);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao classificar os arquivos.");
    } finally {
      setLendo(false);
      setProgresso(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function fecharPreviewModal() {
    if (previewModal?.url) URL.revokeObjectURL(previewModal.url);
    setPreviewModal(null);
  }

  async function verArquivoCompleto(id: string) {
    setErro(null);
    const arquivo = await obterArquivoInboxAsync(id);
    if (!arquivo) {
      setErro("Não encontrei o arquivo salvo. Selecione de novo.");
      return;
    }
    if (previewModal?.url) URL.revokeObjectURL(previewModal.url);

    const nome = arquivo.name;
    const mime = arquivo.type || "application/octet-stream";
    const ehXml = mime.includes("xml") || nome.toLowerCase().endsWith(".xml");
    if (ehXml) {
      const textoXml = await arquivo.text();
      setPreviewModal({ url: "", mime, nome, textoXml });
      return;
    }
    const url = URL.createObjectURL(arquivo);
    setPreviewModal({ url, mime, nome });
  }

  async function garantirRaizOneDrive(): Promise<FileSystemDirectoryHandle> {
    let raiz = await obterPastaRaizOneDrive();
    if (!raiz) {
      raiz = await escolherPastaRaizOneDrive();
      setPastaPronta(true);
      setNomePasta(raiz.name);
    }
    return raiz;
  }

  async function gravarNoOneDrive(
    id: string,
    pasta: PastaRelativaInbox
  ): Promise<{ caminhoRelativo: string }> {
    if (!apiOk) {
      throw new Error("OneDrive local só funciona no Chrome ou Edge neste computador.");
    }
    const arquivo = await obterArquivoInboxAsync(id);
    if (!arquivo) {
      throw new Error("Não encontrei o arquivo salvo. Selecione de novo.");
    }
    const raiz = await garantirRaizOneDrive();
    return copiarArquivoParaInboxOneDrive(raiz, pasta, arquivo);
  }

  /** Abre o diálogo do Windows/Chrome para o usuário navegar e escolher a pasta. */
  async function enviarEscolhendoPasta(id: string, pastaSugestao: PastaRelativaInbox) {
    setErro(null);
    setOkMsg(null);
    setEnviandoOneDriveId(id);
    try {
      if (!apiOk) {
        setErro("OneDrive local só funciona no Chrome ou Edge neste computador.");
        return;
      }
      const arquivo = await obterArquivoInboxAsync(id);
      if (!arquivo) {
        setErro("Não encontrei o arquivo salvo. Selecione de novo.");
        return;
      }
      const raiz = await obterPastaRaizOneDrive();
      const startIn = await obterPastaSugestaoParaPicker(raiz, pastaSugestao);
      const destino = await escolherPastaDestinoEscrita(startIn);
      const gravado = await copiarArquivoParaPastaHandle(destino, arquivo);
      removerItemInbox(id);
      await flushPersistenciaInbox();
      if (previewModal) fecharPreviewModal();
      setOkMsg(`Enviado para a pasta “${gravado.pastaNome}”: ${gravado.nomeGravado}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao escolher pasta.";
      // Usuário cancelou o diálogo — não assusta com erro vermelho
      if (/abort|cancel|denied/i.test(msg) || (e instanceof DOMException && e.name === "AbortError")) {
        setOkMsg(null);
        return;
      }
      setErro(msg);
    } finally {
      setEnviandoOneDriveId(null);
    }
  }

  async function enviarAoOneDrive(id: string, pasta: PastaRelativaInbox) {
    setErro(null);
    setOkMsg(null);
    setEnviandoOneDriveId(id);
    try {
      const gravado = await gravarNoOneDrive(id, pasta);
      removerItemInbox(id);
      await flushPersistenciaInbox();
      if (previewModal) fecharPreviewModal();
      setOkMsg(`Enviado ao OneDrive: ${gravado.caminhoRelativo}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao enviar ao OneDrive.");
    } finally {
      setEnviandoOneDriveId(null);
    }
  }

  async function confirmarItem(id: string, tipo: TipoDestinoInbox) {
    setErro(null);
    setOkMsg(null);
    setConfirmandoId(id);
    try {
      const arquivo = await obterArquivoInboxAsync(id);
      if (!arquivo) {
        setErro("Não encontrei o arquivo salvo. Selecione de novo.");
        return;
      }
      const sugestao = montarSugestaoInbox(tipo);

      if (sugestao.canal === "compra") {
        const tipoCompra = tipoRecebimentoDaCompra(tipo);
        if (!tipoCompra) {
          setErro("Tipo de compra inválido.");
          return;
        }
        await hidratarFilaLoteDoIdb();
        acrescentarClassificados([
          {
            id,
            arquivo,
            classificacao: classificacaoStub(tipo, sugestao.detalhe),
            tipoEscolhido: tipoCompra,
          },
        ]);
        marcarItemEmAndamento(id);
        await flushPersistenciaFilaLote();
        removerItemInbox(id);
        await flushPersistenciaInbox();
        if (previewModal) fecharPreviewModal();

        if (sugestao.fluxoCompra === "financeiro") {
          router.push(`/financeiro?importarLoteBoleto=${encodeURIComponent(id)}&aba=boletos`);
          return;
        }
        setOkMsg("Arquivo enviado à fila A conciliar do Recebimento.");
        router.push("/recebimento?abrirLote=1");
        return;
      }

      const pasta = (sugestao.pastaOneDrive ??
        pastasEnvio[id] ??
        pastaPadraoEnvioOneDrive(tipo)) as PastaRelativaInbox;
      const gravado = await gravarNoOneDrive(id, pasta);
      removerItemInbox(id);
      await flushPersistenciaInbox();
      if (previewModal) fecharPreviewModal();
      setOkMsg(`Gravado em ${gravado.caminhoRelativo}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao confirmar a ação.");
    } finally {
      setConfirmandoId(null);
    }
  }

  function aoMudarTipo(id: string, tipo: TipoDestinoInbox) {
    alterarTipoItemInbox(id, tipo);
    setPastasEnvio((atual) => ({
      ...atual,
      [id]: pastaPadraoEnvioOneDrive(tipo),
    }));
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <Inbox size={28} className="shrink-0 text-primaria" />
          <div>
            <h2 className="text-lg font-bold">Caixa de entrada</h2>
            <p className="text-sm text-slate-600">
              Um lugar para e-mail, WhatsApp, foto ou arquivo. O sistema sugere; você confirma.
              Compra segue no ComprasChef; o resto vai para pastas do OneDrive no PC.
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <HardDrive size={18} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-800">Pasta OneDrive (local)</span>
            {verificandoPasta ? (
              <Badge cor="cinza">Verificando…</Badge>
            ) : pastaPronta ? (
              <Badge cor="verde">Configurada{nomePasta ? `: ${nomePasta}` : ""}</Badge>
            ) : (
              <Badge cor="laranja">Não configurada</Badge>
            )}
          </div>
          <p className="text-xs text-slate-600">
            A pasta base serve de atalho. Ao enviar, você pode usar a pasta sugerida{" "}
            <code className="text-[11px]">{NOME_PASTA_INBOX}/…</code> ou abrir o diálogo e
            navegar até qualquer pasta do OneDrive.
          </p>
          {!apiOk && (
            <p className="text-sm text-amber-800">
              Este navegador não expõe pasta local. Use Chrome ou Edge no computador.
            </p>
          )}
          <button
            type="button"
            className="btn-secundario inline-flex items-center gap-2 text-sm"
            disabled={!apiOk}
            onClick={() => void configurarPasta()}
          >
            <FolderOpen size={16} />
            {pastaPronta ? "Trocar pasta OneDrive" : "Escolher pasta OneDrive"}
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xml,application/xml,text/xml,.pdf,application/pdf,image/*,.doc,.docx,.xls,.xlsx,.txt"
          className="hidden"
          onChange={(e) => void aoEscolher(e.target.files)}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primario inline-flex items-center gap-2"
            disabled={lendo}
            onClick={() => inputRef.current?.click()}
          >
            {lendo ? <Loader2 size={18} className="animate-spin" /> : <Inbox size={18} />}
            {lendo ? "Classificando…" : fila.length > 0 ? "Adicionar arquivos" : "Selecionar arquivos"}
          </button>
          {fila.length > 0 && (
            <button
              type="button"
              className="btn-secundario inline-flex items-center gap-2"
              onClick={() => {
                limparFilaInbox();
                setErro(null);
                setOkMsg(null);
              }}
            >
              <Trash2 size={16} /> Limpar fila
            </button>
          )}
        </div>

        {fila.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={substituir}
              onChange={(e) => setSubstituir(e.target.checked)}
            />
            Próxima seleção substitui a fila (deixe desmarcado para acumular)
          </label>
        )}

        {lendo && progresso && (
          <p className="text-sm text-slate-600">
            Lendo {progresso.feito}/{progresso.total}
            {progresso.nome ? ` · ${progresso.nome}` : ""}
          </p>
        )}
        {erro && <p className="text-sm text-red-700">{erro}</p>}
        {okMsg && <p className="text-sm text-emerald-700">{okMsg}</p>}
      </Card>

      {fila.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge cor="laranja">{fila.length} na inbox</Badge>
            {TIPOS_DESTINO_INBOX.filter((t) => contagem[t] > 0).map((tipo) => (
              <Badge key={tipo} cor={corTipo(tipo)}>
                {contagem[tipo]} {rotuloTipoDestinoInbox(tipo).split(" → ")[0]}
              </Badge>
            ))}
          </div>

          <ul className="space-y-3">
            {fila.map((item) => {
              const sugestao = montarSugestaoInbox(item.tipo);
              const pastaEnvio =
                pastasEnvio[item.id] ?? pastaPadraoEnvioOneDrive(item.tipo);
              const ocupado =
                confirmandoId === item.id || enviandoOneDriveId === item.id;
              return (
                <li key={item.id}>
                  <Card className="p-4">
                    <div className="flex flex-col gap-4 sm:flex-row">
                      <div className="shrink-0 sm:w-36">
                        <MiniaturaPreview preview={previews[item.id]} />
                      </div>

                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold" title={item.nome}>
                              {item.nome}
                            </p>
                            <p className="text-xs text-slate-500">
                              {(item.tamanho / 1024).toFixed(1)} KB
                              {item.detalhe ? ` · ${item.detalhe}` : ""}
                            </p>
                          </div>
                          <Badge cor={corTipo(item.tipo)}>
                            {sugestao.canal === "compra" ? "Compra" : "OneDrive"}
                          </Badge>
                        </div>

                        <label className="block text-sm text-slate-700">
                          Destino sugerido (pode alterar)
                          <select
                            className="campo mt-1 w-full max-w-md"
                            value={item.tipo}
                            onChange={(e) =>
                              aoMudarTipo(item.id, e.target.value as TipoDestinoInbox)
                            }
                          >
                            {TIPOS_DESTINO_INBOX.map((tipo) => (
                              <option key={tipo} value={tipo}>
                                {rotuloTipoDestinoInbox(tipo)}
                              </option>
                            ))}
                          </select>
                        </label>

                        <p className="text-sm text-slate-600">{sugestao.detalhe}</p>

                        <div className="flex flex-wrap items-end gap-2">
                          <label className="block text-sm text-slate-700">
                            Pasta sugerida (atalho)
                            <select
                              className="campo mt-1 w-full min-w-[12rem]"
                              value={pastaEnvio}
                              onChange={(e) =>
                                setPastasEnvio((atual) => ({
                                  ...atual,
                                  [item.id]: e.target.value as PastaRelativaInbox,
                                }))
                              }
                            >
                              {PASTAS_INBOX.map((pasta) => (
                                <option key={pasta} value={pasta}>
                                  {rotuloPastaInbox(pasta)}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn-primario inline-flex items-center gap-2 text-sm"
                            disabled={ocupado}
                            onClick={() => void confirmarItem(item.id, item.tipo)}
                          >
                            {confirmandoId === item.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Check size={16} />
                            )}
                            Confirmar ação
                          </button>
                          <button
                            type="button"
                            className="btn-secundario inline-flex items-center gap-2 text-sm"
                            disabled={ocupado || !apiOk}
                            onClick={() => void enviarEscolhendoPasta(item.id, pastaEnvio)}
                            title="Abre o diálogo do Windows para você navegar e escolher a pasta"
                          >
                            {enviandoOneDriveId === item.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <FolderOpen size={16} />
                            )}
                            Escolher pasta e enviar…
                          </button>
                          <button
                            type="button"
                            className="btn-secundario inline-flex items-center gap-2 text-sm"
                            disabled={ocupado || !apiOk}
                            onClick={() => void enviarAoOneDrive(item.id, pastaEnvio)}
                          >
                            {enviandoOneDriveId === item.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <CloudUpload size={16} />
                            )}
                            Enviar na sugerida
                          </button>
                          <button
                            type="button"
                            className="btn-secundario inline-flex items-center gap-2 text-sm"
                            onClick={() => void verArquivoCompleto(item.id)}
                          >
                            <Eye size={16} /> Ver
                          </button>
                          <button
                            type="button"
                            className="btn-secundario text-sm"
                            disabled={ocupado}
                            onClick={() => removerItemInbox(item.id)}
                          >
                            Descartar
                          </button>
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Modal
        aberto={previewModal !== null}
        titulo={previewModal?.nome ?? "Pré-visualização"}
        onFechar={fecharPreviewModal}
      >
        {previewModal && (
          <div className="space-y-3">
            {previewModal.textoXml !== undefined ? (
              <pre className="max-h-[70vh] overflow-auto rounded-card bg-slate-50 p-3 text-xs text-slate-800">
                {previewModal.textoXml.slice(0, 80_000)}
                {previewModal.textoXml.length > 80_000 ? "\n… (truncado)" : ""}
              </pre>
            ) : ehImagemPreview(previewModal.mime, previewModal.nome) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewModal.url}
                alt={previewModal.nome}
                className="max-h-[70vh] w-full bg-slate-100 object-contain"
              />
            ) : (
              <iframe
                title={previewModal.nome}
                src={previewModal.url}
                className="h-[70vh] w-full rounded-card border border-slate-200 bg-slate-100"
              />
            )}
            <p className="text-sm text-slate-600">
              Arquivo na inbox — feche para voltar à triagem.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
