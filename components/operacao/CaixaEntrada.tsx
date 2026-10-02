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
  Pencil,
  Play,
  Star,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Badge, Card, Modal } from "@/components/ui";
import { useDB } from "@/lib/data";
import { classificarArquivosRecebimentoBrowser } from "@/lib/domain/classificar-arquivo-recebimento-browser";
import type { ResultadoClassificacaoArquivo } from "@/lib/domain/classificar-arquivo-recebimento";
import { calcularHashSHA256 } from "@/lib/domain/documentos-boleto";
import {
  montarSugestaoInbox,
  ordenarFilaInboxPorData,
  pastaPadraoEnvioOneDrive,
  rotuloPastaInbox,
  rotuloTipoDestinoInbox,
  tipoRecebimentoDaCompra,
  TIPOS_DESTINO_INBOX,
  type TipoDestinoInbox,
} from "@/lib/domain/inbox-entrada";
import {
  faseFilaInbox,
  rotuloStatusItemInbox,
  type ItemFilaInbox,
} from "@/lib/domain/inbox-entrada-idb";
import {
  acrescentarClassificadosNaInbox,
  alterarTipoItemInbox,
  atualizarFingerprintsItemInbox,
  definirFilaInboxDeClassificados,
  flushPersistenciaInbox,
  hidratarInboxDoIdb,
  limparFilaInbox,
  marcarItemInboxAConferir,
  obterArquivoInboxAsync,
  removerItemInbox,
  useFilaInboxEntrada,
} from "@/lib/domain/inbox-entrada-store";
import {
  avaliarRetrabalhoInbox,
  type AvisoRetrabalhoInbox,
} from "@/lib/domain/inbox-retrabalho";
import {
  chaveSelectFavorita,
  LIMITE_FAVORITAS_INBOX,
  parseChaveSelectFavorita,
  podeAdicionarFavorita,
  rotuloFavoritaNoSelect,
  type FavoritaInbox,
} from "@/lib/domain/inbox-favoritas";
import {
  adicionarFavoritaIdb,
  listarFavoritasIdb,
  obterRegistroFavoritaIdb,
  removerFavoritaIdb,
  renomearFavoritaIdb,
} from "@/lib/domain/inbox-favoritas-idb";
import {
  acrescentarClassificados,
  flushPersistenciaFilaLote,
  hidratarFilaLoteDoIdb,
  marcarItemEmAndamento,
  obterItemFila,
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

/** Pasta padrão, favorita `fav:id` ou pasta avulsa `avulso:itemId` (só nesta sessão). */
type AlvoPastaEnvio = PastaRelativaInbox | `fav:${string}` | `avulso:${string}`;

function ehPastaPadrao(alvo: string): alvo is PastaRelativaInbox {
  return (PASTAS_INBOX as readonly string[]).includes(alvo);
}

function chaveSelectAvulso(itemId: string): `avulso:${string}` {
  return `avulso:${itemId}`;
}

function parseChaveSelectAvulso(valor: string): string | null {
  if (!valor.startsWith("avulso:")) return null;
  const id = valor.slice(7);
  return id || null;
}
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
  const db = useDB();
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
  const [pastasEnvio, setPastasEnvio] = useState<Record<string, AlvoPastaEnvio>>({});
  const [previewModal, setPreviewModal] = useState<PreviewArquivo | null>(null);
  const [favoritas, setFavoritas] = useState<FavoritaInbox[]>([]);
  const [handlesAvulsos, setHandlesAvulsos] = useState<
    Record<string, FileSystemDirectoryHandle>
  >({});
  const [pendenteFavorita, setPendenteFavorita] = useState<{
    handle: FileSystemDirectoryHandle;
    pastaNome: string;
    itemId?: string;
  } | null>(null);
  const [salvandoFavorita, setSalvandoFavorita] = useState(false);
  const [gerenciarFavoritasAberto, setGerenciarFavoritasAberto] = useState(false);
  const [escolhendoPastaId, setEscolhendoPastaId] = useState<string | null>(null);
  const [recentesPrimeiro, setRecentesPrimeiro] = useState(true);
  /** Só após montar no cliente — no SSR `window` não existe e divergia do Chrome (hidratação). */
  const [apiOk, setApiOk] = useState(false);
  const [clientePronto, setClientePronto] = useState(false);

  const filaOrdenada = useMemo(
    () => ordenarFilaInboxPorData(fila, recentesPrimeiro),
    [fila, recentesPrimeiro]
  );
  const aClassificar = useMemo(
    () => filaOrdenada.filter((i) => faseFilaInbox(i.status) === "a_classificar"),
    [filaOrdenada]
  );
  const aConferir = useMemo(
    () => filaOrdenada.filter((i) => faseFilaInbox(i.status) === "a_conferir"),
    [filaOrdenada]
  );

  const avisosRetrabalho = useMemo(() => {
    const mapa: Record<string, AvisoRetrabalhoInbox> = {};
    for (const item of fila) {
      const aviso = avaliarRetrabalhoInbox(db, {
        tipo: item.tipo,
        chaveNfe: item.chaveNfe,
        chaveNfse: item.chaveNfse,
        codigoBoleto: item.codigoBoleto,
        hashSha256: item.hashSha256,
      });
      if (aviso) mapa[item.id] = aviso;
    }
    return mapa;
  }, [db, fila]);

  /** Hash SHA-256 dos boletos (e compra) para cruzar com documentos já registrados. */
  useEffect(() => {
    let cancelado = false;
    void (async () => {
      for (const item of fila) {
        if (item.hashSha256) continue;
        if (item.tipo !== "pdf_boleto" && item.tipo !== "xml_nfe" && item.tipo !== "pdf_danfe") {
          continue;
        }
        const arquivo = await obterArquivoInboxAsync(item.id);
        if (!arquivo || cancelado) continue;
        try {
          const hash = await calcularHashSHA256(await arquivo.arrayBuffer());
          if (cancelado) return;
          atualizarFingerprintsItemInbox(item.id, { hashSha256: hash });
        } catch {
          // sem hash — aviso por chave/código ainda funciona
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [fila]);

  useEffect(() => {
    setClientePronto(true);
    setApiOk(onedrivePastaLocalDisponivel());
  }, []);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem("compraschef-inbox-ordem");
      if (salvo === "antigos") setRecentesPrimeiro(false);
      if (salvo === "recentes") setRecentesPrimeiro(true);
    } catch {
      // ignore
    }
  }, []);

  function alternarOrdem(recentes: boolean) {
    setRecentesPrimeiro(recentes);
    try {
      localStorage.setItem("compraschef-inbox-ordem", recentes ? "recentes" : "antigos");
    } catch {
      // ignore
    }
  }

  async function recarregarFavoritas() {
    try {
      setFavoritas(await listarFavoritasIdb());
    } catch {
      setFavoritas([]);
    }
  }
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
      let mudou = false;
      const next = { ...atual };
      for (const item of fila) {
        if (!next[item.id]) {
          next[item.id] = pastaPadraoEnvioOneDrive(item.tipo);
          mudou = true;
        }
      }
      for (const id of Object.keys(next)) {
        if (!fila.some((i) => i.id === id)) {
          delete next[id];
          mudou = true;
        }
      }
      return mudou ? next : atual;
    });
  }, [fila]);

  useEffect(() => {
    void (async () => {
      await hidratarInboxDoIdb();
      await recarregarFavoritas();
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

  async function gravarEmFavorita(
    id: string,
    favoritaId: string
  ): Promise<{ pastaNome: string; nomeGravado: string }> {
    if (!apiOk) {
      throw new Error("OneDrive local só funciona no Chrome ou Edge neste computador.");
    }
    const arquivo = await obterArquivoInboxAsync(id);
    if (!arquivo) {
      throw new Error("Não encontrei o arquivo salvo. Selecione de novo.");
    }
    const registro = await obterRegistroFavoritaIdb(favoritaId);
    if (!registro) {
      throw new Error("Favorita não encontrada. Remova e salve de novo.");
    }
    return copiarArquivoParaPastaHandle(registro.handle, arquivo);
  }

  async function resolverStartInPicker(
    alvo: AlvoPastaEnvio
  ): Promise<FileSystemHandle | null> {
    const favId = parseChaveSelectFavorita(alvo);
    if (favId) {
      const reg = await obterRegistroFavoritaIdb(favId);
      return reg?.handle ?? null;
    }
    const avulsoId = parseChaveSelectAvulso(alvo);
    if (avulsoId && handlesAvulsos[avulsoId]) {
      return handlesAvulsos[avulsoId];
    }
    if (ehPastaPadrao(alvo)) {
      const raiz = await obterPastaRaizOneDrive();
      return obterPastaSugestaoParaPicker(raiz, alvo);
    }
    return obterPastaRaizOneDrive();
  }

  async function salvarPendenteComoFavorita() {
    if (!pendenteFavorita) return;
    setSalvandoFavorita(true);
    setErro(null);
    try {
      const meta = await adicionarFavoritaIdb(pendenteFavorita.handle);
      const lista = await listarFavoritasIdb();
      setFavoritas(lista);
      if (pendenteFavorita.itemId) {
        setPastasEnvio((atual) => ({
          ...atual,
          [pendenteFavorita.itemId!]: chaveSelectFavorita(meta.id),
        }));
      }
      setPendenteFavorita(null);
      setOkMsg(
        `Favorita salva: “${meta.nome}” (${lista.length}/${LIMITE_FAVORITAS_INBOX}). Agora use Enviar na sugerida.`
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a favorita.");
    } finally {
      setSalvandoFavorita(false);
    }
  }

  /** Só define a pasta do item — não envia nem remove da fila. */
  async function escolherPastaParaItem(id: string, alvoAtual: AlvoPastaEnvio) {
    setErro(null);
    setOkMsg(null);
    setPendenteFavorita(null);
    setEscolhendoPastaId(id);
    try {
      if (!apiOk) {
        setErro("OneDrive local só funciona no Chrome ou Edge neste computador.");
        return;
      }
      const startIn = await resolverStartInPicker(alvoAtual);
      const destino = await escolherPastaDestinoEscrita(startIn);
      setHandlesAvulsos((atual) => ({ ...atual, [id]: destino }));
      setPastasEnvio((atual) => ({ ...atual, [id]: chaveSelectAvulso(id) }));
      setOkMsg(
        `Pasta “${destino.name}” definida. Clique em Enviar na sugerida para gravar o arquivo.`
      );
      if (podeAdicionarFavorita(favoritas.length)) {
        setPendenteFavorita({
          handle: destino,
          pastaNome: destino.name,
          itemId: id,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao escolher pasta.";
      if (/abort|cancel|denied/i.test(msg) || (e instanceof DOMException && e.name === "AbortError")) {
        return;
      }
      setErro(msg);
    } finally {
      setEscolhendoPastaId(null);
    }
  }

  async function adicionarFavoritaPeloGerenciador() {
    setErro(null);
    try {
      if (!apiOk) {
        setErro("OneDrive local só funciona no Chrome ou Edge neste computador.");
        return;
      }
      if (!podeAdicionarFavorita(favoritas.length)) {
        setErro(`Limite de ${LIMITE_FAVORITAS_INBOX} favoritas. Remova uma antes.`);
        return;
      }
      const raiz = await obterPastaRaizOneDrive();
      const destino = await escolherPastaDestinoEscrita(raiz);
      const meta = await adicionarFavoritaIdb(destino);
      await recarregarFavoritas();
      setOkMsg(`Favorita adicionada: “${meta.nome}”.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao adicionar favorita.";
      if (/abort|cancel|denied/i.test(msg) || (e instanceof DOMException && e.name === "AbortError")) {
        return;
      }
      setErro(msg);
    }
  }

  async function enviarAoOneDrive(id: string, alvo: AlvoPastaEnvio) {
    setErro(null);
    setOkMsg(null);
    setPendenteFavorita(null);
    setEnviandoOneDriveId(id);
    try {
      const favId = parseChaveSelectFavorita(alvo);
      if (favId) {
        const gravado = await gravarEmFavorita(id, favId);
        removerItemInbox(id);
        await flushPersistenciaInbox();
        if (previewModal) fecharPreviewModal();
        setHandlesAvulsos((atual) => {
          const next = { ...atual };
          delete next[id];
          return next;
        });
        setOkMsg(`Enviado à favorita “${gravado.pastaNome}”: ${gravado.nomeGravado}`);
        return;
      }
      const avulsoId = parseChaveSelectAvulso(alvo);
      if (avulsoId) {
        const handle = handlesAvulsos[id];
        if (!handle) {
          setErro("Pasta escolhida expirou. Use Escolher pasta de novo.");
          return;
        }
        const arquivo = await obterArquivoInboxAsync(id);
        if (!arquivo) {
          setErro("Não encontrei o arquivo salvo. Selecione de novo.");
          return;
        }
        const gravado = await copiarArquivoParaPastaHandle(handle, arquivo);
        removerItemInbox(id);
        await flushPersistenciaInbox();
        if (previewModal) fecharPreviewModal();
        setHandlesAvulsos((atual) => {
          const next = { ...atual };
          delete next[id];
          return next;
        });
        setOkMsg(`Enviado para “${gravado.pastaNome}”: ${gravado.nomeGravado}`);
        return;
      }
      if (!ehPastaPadrao(alvo)) {
        setErro("Pasta sugerida inválida.");
        return;
      }
      const gravado = await gravarNoOneDrive(id, alvo);
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
    const aviso = avisosRetrabalho[id];
    if (aviso?.bloqueiaConfirmacao) {
      setErro(`${aviso.mensagem} Use Descartar para tirar da caixa.`);
      return;
    }
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
        marcarItemInboxAConferir(id);
        await flushPersistenciaInbox();
        if (previewModal) fecharPreviewModal();

        if (sugestao.fluxoCompra === "financeiro") {
          setOkMsg("Boleto na Conferência — fica em A conferir na caixa até concluir.");
          router.push(`/financeiro?receberBoletoConferencia=${encodeURIComponent(id)}&aba=conferencia`);
          return;
        }
        setOkMsg("Arquivo no Recebimento — fica em A conferir na caixa até concluir.");
        router.push(`/recebimento?abrirLote=1&itemLote=${encodeURIComponent(id)}`);
        return;
      }

      const pasta = (sugestao.pastaOneDrive ??
        (ehPastaPadrao(pastasEnvio[id] ?? "")
          ? (pastasEnvio[id] as PastaRelativaInbox)
          : null) ??
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

  async function continuarConferencia(id: string, tipo: TipoDestinoInbox) {
    setErro(null);
    setOkMsg(null);
    setConfirmandoId(id);
    try {
      const sugestao = montarSugestaoInbox(tipo);
      if (sugestao.canal !== "compra") {
        setErro("Este item não é de compra.");
        return;
      }
      const tipoCompra = tipoRecebimentoDaCompra(tipo);
      if (!tipoCompra) {
        setErro("Tipo de compra inválido.");
        return;
      }

      await hidratarFilaLoteDoIdb();
      if (!obterItemFila(id)) {
        const arquivo = await obterArquivoInboxAsync(id);
        if (!arquivo) {
          setErro("Não encontrei o arquivo salvo. Selecione de novo.");
          return;
        }
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
      }

      if (sugestao.fluxoCompra === "financeiro") {
        router.push(`/financeiro?receberBoletoConferencia=${encodeURIComponent(id)}&aba=conferencia`);
        return;
      }
      router.push(`/recebimento?abrirLote=1&itemLote=${encodeURIComponent(id)}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao continuar a conferência.");
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
              Compra fica em <strong>A conferir</strong> até concluir no Recebimento ou na Conferência;
              o resto vai para pastas do OneDrive no PC.
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
          {clientePronto && !apiOk && (
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
          <button
            type="button"
            className="btn-secundario inline-flex items-center gap-2 text-sm"
            disabled={!apiOk}
            onClick={() => setGerenciarFavoritasAberto(true)}
          >
            <Star size={16} />
            Favoritas ({favoritas.length}/{LIMITE_FAVORITAS_INBOX})
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
        {pendenteFavorita && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <Star size={16} className="text-amber-700" />
            <p className="flex-1 text-sm text-amber-900">
              Salvar “{pendenteFavorita.pastaNome}” como favorita? O arquivo continua na fila até você
              enviar.
            </p>
            <button
              type="button"
              className="btn-primario inline-flex items-center gap-2 text-sm"
              disabled={salvandoFavorita}
              onClick={() => void salvarPendenteComoFavorita()}
            >
              {salvandoFavorita ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} />}
              Salvar favorita
            </button>
            <button
              type="button"
              className="btn-secundario text-sm"
              onClick={() => setPendenteFavorita(null)}
            >
              Agora não
            </button>
          </div>
        )}
      </Card>

      {fila.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge cor="laranja">{fila.length} na inbox</Badge>
            {aClassificar.length > 0 && (
              <Badge cor="cinza">{aClassificar.length} a classificar</Badge>
            )}
            {aConferir.length > 0 && (
              <Badge cor="azul">{aConferir.length} a conferir</Badge>
            )}
            {TIPOS_DESTINO_INBOX.filter((t) => contagem[t] > 0).map((tipo) => (
              <Badge key={tipo} cor={corTipo(tipo)}>
                {contagem[tipo]} {rotuloTipoDestinoInbox(tipo).split(" → ")[0]}
              </Badge>
            ))}
            <span className="ml-auto flex flex-wrap items-center gap-1 text-sm text-slate-600">
              <span className="mr-1 hidden sm:inline">Ordem:</span>
              <button
                type="button"
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                  recentesPrimeiro
                    ? "bg-primaria text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
                onClick={() => alternarOrdem(true)}
              >
                Recentes primeiro
              </button>
              <button
                type="button"
                className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                  !recentesPrimeiro
                    ? "bg-primaria text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
                onClick={() => alternarOrdem(false)}
              >
                Antigos primeiro
              </button>
            </span>
          </div>

          {aClassificar.length > 0 && (
            <section className="space-y-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">A classificar</h3>
                <p className="text-sm text-slate-600">
                  Confirme o destino. Compra vai ao Recebimento ou à Conferência e passa para A
                  conferir.
                </p>
              </div>
              <ul className="space-y-3">
                {aClassificar.map((item) => {
                  const sugestao = montarSugestaoInbox(item.tipo);
                  const aviso = avisosRetrabalho[item.id];
                  const pastaEnvio: AlvoPastaEnvio =
                    pastasEnvio[item.id] ?? pastaPadraoEnvioOneDrive(item.tipo);
                  const ocupado =
                    confirmandoId === item.id ||
                    enviandoOneDriveId === item.id ||
                    escolhendoPastaId === item.id;
                  const handleAvulso = handlesAvulsos[item.id];
                  return (
                    <li key={item.id}>
                      <Card className={`p-4 ${aviso ? "border-amber-300 bg-amber-50/40" : ""}`}>
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
                              <div className="flex flex-wrap gap-1">
                                {aviso && <Badge cor="laranja">Já no sistema</Badge>}
                                <Badge cor="cinza">{rotuloStatusItemInbox(item.status)}</Badge>
                                <Badge cor={corTipo(item.tipo)}>
                                  {sugestao.canal === "compra" ? "Compra" : "OneDrive"}
                                </Badge>
                              </div>
                            </div>

                            {aviso && (
                              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                                <TriangleAlert size={18} className="mt-0.5 shrink-0 text-amber-700" />
                                <p>
                                  {aviso.mensagem}{" "}
                                  <strong>Descartar</strong> remove da caixa sem reimportar.
                                </p>
                              </div>
                            )}

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
                                  className="campo mt-1 w-full min-w-[14rem]"
                                  value={pastaEnvio}
                                  onChange={(e) =>
                                    setPastasEnvio((atual) => ({
                                      ...atual,
                                      [item.id]: e.target.value as AlvoPastaEnvio,
                                    }))
                                  }
                                >
                                  {handleAvulso && (
                                    <optgroup label="Escolhida agora">
                                      <option value={chaveSelectAvulso(item.id)}>
                                        → {handleAvulso.name}
                                      </option>
                                    </optgroup>
                                  )}
                                  <optgroup label="Padrão ComprasChef">
                                    {PASTAS_INBOX.map((pasta) => (
                                      <option key={pasta} value={pasta}>
                                        {rotuloPastaInbox(pasta)}
                                      </option>
                                    ))}
                                  </optgroup>
                                  {favoritas.length > 0 && (
                                    <optgroup label="Minhas pastas">
                                      {favoritas.map((fav) => (
                                        <option key={fav.id} value={chaveSelectFavorita(fav.id)}>
                                          {rotuloFavoritaNoSelect(fav)}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                </select>
                              </label>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="btn-primario inline-flex items-center gap-2 text-sm"
                                disabled={ocupado || Boolean(aviso?.bloqueiaConfirmacao)}
                                onClick={() => void confirmarItem(item.id, item.tipo)}
                                title={
                                  aviso?.bloqueiaConfirmacao
                                    ? "Arquivo já existe no sistema — use Descartar"
                                    : undefined
                                }
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
                                onClick={() => void escolherPastaParaItem(item.id, pastaEnvio)}
                                title="Define a pasta sem enviar — depois use Enviar na sugerida"
                              >
                                {escolhendoPastaId === item.id ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  <FolderOpen size={16} />
                                )}
                                Escolher pasta…
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
                                className={`inline-flex items-center gap-2 text-sm ${
                                  aviso ? "btn-primario" : "btn-secundario"
                                }`}
                                disabled={ocupado}
                                onClick={() => removerItemInbox(item.id)}
                              >
                                <Trash2 size={16} /> Descartar
                              </button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {aConferir.length > 0 && (
            <section className="space-y-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">A conferir</h3>
                <p className="text-sm text-slate-600">
                  Já encaminhados. Ficam aqui até concluir no Recebimento (mercadoria) ou na
                  Conferência (boleto). Use Continuar se precisar voltar.
                </p>
              </div>
              <ul className="space-y-3">
                {aConferir.map((item) => {
                  const sugestao = montarSugestaoInbox(item.tipo);
                  const ocupado = confirmandoId === item.id;
                  return (
                    <li key={item.id}>
                      <Card className="border-blue-100 bg-blue-50/30 p-4">
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
                                <p className="mt-1 text-sm text-slate-600">{sugestao.rotulo}</p>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                <Badge cor="azul">{rotuloStatusItemInbox(item.status)}</Badge>
                                <Badge cor={corTipo(item.tipo)}>Compra</Badge>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="btn-primario inline-flex items-center gap-2 text-sm"
                                disabled={ocupado}
                                onClick={() => void continuarConferencia(item.id, item.tipo)}
                              >
                                {confirmandoId === item.id ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  <Play size={16} />
                                )}
                                Continuar
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
                                title="Remove só da caixa; o trabalho no Recebimento/Financeiro continua"
                              >
                                Tirar da caixa
                              </button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      <Modal
        aberto={gerenciarFavoritasAberto}
        titulo="Pastas favoritas"
        onFechar={() => setGerenciarFavoritasAberto(false)}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Até {LIMITE_FAVORITAS_INBOX} pastas. Também dá para salvar após{" "}
            <strong>Escolher pasta…</strong> em um arquivo.
          </p>
          <button
            type="button"
            className="btn-primario inline-flex items-center gap-2 text-sm"
            disabled={!apiOk || !podeAdicionarFavorita(favoritas.length)}
            onClick={() => void adicionarFavoritaPeloGerenciador()}
          >
            <FolderOpen size={16} /> Adicionar pasta favorita…
          </button>
          {favoritas.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma favorita ainda.</p>
          ) : (
            <ul className="space-y-2">
              {favoritas.map((fav) => (
                <li
                  key={fav.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <Star size={14} className="shrink-0 text-amber-600" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium" title={fav.pastaNome}>
                    {fav.nome}
                    <span className="ml-1 font-normal text-slate-500">({fav.pastaNome})</span>
                  </span>
                  <button
                    type="button"
                    className="btn-secundario inline-flex items-center gap-1 text-xs"
                    onClick={() => {
                      const novo = window.prompt("Nome da favorita", fav.nome);
                      if (novo == null) return;
                      void (async () => {
                        try {
                          await renomearFavoritaIdb(fav.id, novo);
                          await recarregarFavoritas();
                        } catch (e) {
                          setErro(e instanceof Error ? e.message : "Falha ao renomear.");
                        }
                      })();
                    }}
                  >
                    <Pencil size={12} /> Renomear
                  </button>
                  <button
                    type="button"
                    className="btn-secundario inline-flex items-center gap-1 text-xs"
                    onClick={() => {
                      void (async () => {
                        await removerFavoritaIdb(fav.id);
                        setPastasEnvio((atual) => {
                          const next = { ...atual };
                          const chave = chaveSelectFavorita(fav.id);
                          for (const [itemId, alvo] of Object.entries(next)) {
                            if (alvo === chave) delete next[itemId];
                          }
                          return next;
                        });
                        await recarregarFavoritas();
                      })();
                    }}
                  >
                    <Trash2 size={12} /> Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn-secundario text-sm"
            onClick={() => setGerenciarFavoritasAberto(false)}
          >
            Fechar
          </button>
        </div>
      </Modal>

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
