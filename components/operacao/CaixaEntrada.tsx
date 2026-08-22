"use client";

/**
 * Caixa de entrada unificada: classifica, sugere, confirma.
 * Compra → lote / Financeiro; resto → pastas OneDrive locais.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  FolderOpen,
  HardDrive,
  Inbox,
  Loader2,
  Trash2,
} from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { classificarArquivosRecebimentoBrowser } from "@/lib/domain/classificar-arquivo-recebimento-browser";
import type { ResultadoClassificacaoArquivo } from "@/lib/domain/classificar-arquivo-recebimento";
import {
  montarSugestaoInbox,
  rotuloTipoDestinoInbox,
  tipoRecebimentoDaCompra,
  TIPOS_DESTINO_INBOX,
  type TipoDestinoInbox,
} from "@/lib/domain/inbox-entrada";
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
  copiarArquivoParaInboxOneDrive,
  NOME_PASTA_INBOX,
  onedrivePastaLocalDisponivel,
  obterPastaRaizOneDrive,
  type PastaRelativaInbox,
} from "@/lib/domain/onedrive-pasta-local";

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
      return "cinza";
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

export default function CaixaEntrada() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const fila = useFilaInboxEntrada();
  const [lendo, setLendo] = useState(false);
  const [progresso, setProgresso] = useState<{ feito: number; total: number; nome: string } | null>(
    null
  );
  const [erro, setErro] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [substituir, setSubstituir] = useState(false);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [pastaPronta, setPastaPronta] = useState(false);
  const [nomePasta, setNomePasta] = useState<string | null>(null);
  const [verificandoPasta, setVerificandoPasta] = useState(true);
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

        if (sugestao.fluxoCompra === "financeiro") {
          router.push(`/financeiro?importarLoteBoleto=${encodeURIComponent(id)}&aba=boletos`);
          return;
        }
        setOkMsg("Arquivo enviado à fila A conciliar do Recebimento.");
        router.push("/recebimento?abrirLote=1");
        return;
      }

      // OneDrive
      if (!apiOk) {
        setErro("OneDrive local só funciona no Chrome ou Edge neste computador.");
        return;
      }
      let raiz = await obterPastaRaizOneDrive();
      if (!raiz) {
        raiz = await escolherPastaRaizOneDrive();
        setPastaPronta(true);
        setNomePasta(raiz.name);
      }
      const pasta = sugestao.pastaOneDrive as PastaRelativaInbox;
      const gravado = await copiarArquivoParaInboxOneDrive(raiz, pasta, arquivo);
      removerItemInbox(id);
      await flushPersistenciaInbox();
      setOkMsg(`Gravado em ${gravado.caminhoRelativo}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao confirmar a ação.");
    } finally {
      setConfirmandoId(null);
    }
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

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
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
            Escolha uma vez a pasta raiz do OneDrive. Criamos{" "}
            <code className="text-[11px]">{NOME_PASTA_INBOX}/…</code> e a sync do Windows sobe
            para a nuvem.
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
              return (
                <li key={item.id}>
                  <Card className="space-y-3 p-4">
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
                      <Badge cor={corTipo(item.tipo)}>{sugestao.canal === "compra" ? "Compra" : "OneDrive"}</Badge>
                    </div>

                    <label className="block text-sm text-slate-700">
                      Destino sugerido (pode alterar)
                      <select
                        className="campo mt-1 w-full max-w-md"
                        value={item.tipo}
                        onChange={(e) =>
                          alterarTipoItemInbox(item.id, e.target.value as TipoDestinoInbox)
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

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-primario inline-flex items-center gap-2 text-sm"
                        disabled={confirmandoId === item.id}
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
                        className="btn-secundario text-sm"
                        onClick={() => removerItemInbox(item.id)}
                      >
                        Descartar
                      </button>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
