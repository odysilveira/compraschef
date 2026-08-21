"use client";

// Importar lote — caixa de entrada dos Downloads do e-mail:
// multi-seleção → classifica → fila “A conciliar” (sessão) → abre o fluxo.
// A fila sobrevive ao cadastro de fornecedor/produto; nada grava só por classificar.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, FileStack, FolderOpen, Link2, Loader2, ScanSearch, Trash2 } from "lucide-react";
import { Badge, Card, Modal } from "@/components/ui";
import {
  classificarArquivosRecebimentoBrowser,
  reclassificarArquivoRecebimentoBrowser,
} from "@/lib/domain/classificar-arquivo-recebimento-browser";
import {
  contarPorTipo,
  rotuloTipoArquivoRecebimento,
  type TipoArquivoRecebimento,
} from "@/lib/domain/classificar-arquivo-recebimento";
import { filtrarItensAbertos, rotuloStatusFilaLote } from "@/lib/domain/lote-recebimento-fila";
import {
  acrescentarClassificados,
  alterarTipoItemFila,
  atualizarClassificacaoItemFila,
  descartarItemFila,
  definirFilaDeClassificados,
  limparFilaLote,
  marcarItemEmAndamento,
  obterArquivoFilaAsync,
  useFilaLoteRecebimento,
} from "@/lib/domain/lote-recebimento-store";

const TIPOS: TipoArquivoRecebimento[] = [
  "xml_nfe",
  "pdf_boleto",
  "pdf_danfe",
  "pdf_nfse",
  "imagem",
  "desconhecido",
];

function corTipo(tipo: TipoArquivoRecebimento): "verde" | "azul" | "laranja" | "vermelho" | "cinza" {
  switch (tipo) {
    case "xml_nfe":
      return "verde";
    case "pdf_boleto":
      return "azul";
    case "pdf_nfse":
      return "laranja";
    case "pdf_danfe":
    case "imagem":
      return "cinza";
    default:
      return "vermelho";
  }
}

export interface AcaoLoteArquivo {
  id: string;
  tipo: TipoArquivoRecebimento;
  arquivo: File;
}

interface Props {
  onVoltar: () => void;
  /** Abre o fluxo correspondente com o arquivo já escolhido (sem gravar ainda). */
  onAbrirFluxo: (acao: AcaoLoteArquivo) => void;
}

export default function ImportarLote({ onVoltar, onAbrirFluxo }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const fila = useFilaLoteRecebimento();
  const abertos = useMemo(() => filtrarItensAbertos(fila), [fila]);
  const [lendo, setLendo] = useState(false);
  const [progresso, setProgresso] = useState<{ feito: number; total: number; nome: string } | null>(
    null
  );
  const [erro, setErro] = useState<string | null>(null);
  const [substituir, setSubstituir] = useState(true);
  const [reconhecendoId, setReconhecendoId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    url: string;
    nome: string;
    mime: string;
    textoXml?: string;
  } | null>(null);

  const contagem = useMemo(
    () => contarPorTipo(abertos.map((i) => ({ tipo: i.tipo }))),
    [abertos]
  );

  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview?.url]);

  function fecharPreview() {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  async function aoEscolher(lista: FileList | null) {
    if (!lista?.length) return;
    setErro(null);
    setLendo(true);
    setProgresso({ feito: 0, total: lista.length, nome: "" });
    try {
      const classificados = await classificarArquivosRecebimentoBrowser(Array.from(lista), {
        onProgresso: (feito, total, nome) => setProgresso({ feito, total, nome }),
      });
      if (substituir || abertos.length === 0) {
        definirFilaDeClassificados(classificados);
      } else {
        acrescentarClassificados(classificados);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao classificar os arquivos.");
    } finally {
      setLendo(false);
      setProgresso(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function abrirItem(id: string, tipo: TipoArquivoRecebimento) {
    const arquivo = await obterArquivoFilaAsync(id);
    if (!arquivo) {
      setErro("Não encontrei o arquivo salvo. Selecione o lote de novo.");
      return;
    }
    if (tipo === "desconhecido") return;
    marcarItemEmAndamento(id);
    onAbrirFluxo({ id, tipo, arquivo });
  }

  /** Pré-visualiza no modal (sem pop-up — evita bloqueio do navegador). */
  async function verArquivo(id: string) {
    setErro(null);
    const arquivo = await obterArquivoFilaAsync(id);
    if (!arquivo) {
      setErro("Não encontrei o arquivo salvo. Selecione o lote de novo.");
      return;
    }
    if (preview?.url) URL.revokeObjectURL(preview.url);

    const nome = arquivo.name.toLowerCase();
    const ehXml =
      arquivo.type.includes("xml") || nome.endsWith(".xml");
    if (ehXml) {
      const textoXml = await arquivo.text();
      setPreview({ url: "", nome: arquivo.name, mime: arquivo.type || "application/xml", textoXml });
      return;
    }

    const url = URL.createObjectURL(arquivo);
    setPreview({ url, nome: arquivo.name, mime: arquivo.type || "application/octet-stream" });
  }

  function levarBoletoAoFinanceiro(id: string) {
    marcarItemEmAndamento(id);
    router.push(`/financeiro?importarLoteBoleto=${encodeURIComponent(id)}`);
  }

  /** OCR/leitura de novo no arquivo já salvo na fila (sem rebaixar). */
  async function reconhecerDeNovo(id: string) {
    setErro(null);
    setReconhecendoId(id);
    try {
      const arquivo = await obterArquivoFilaAsync(id);
      if (!arquivo) {
        setErro("Não encontrei o arquivo salvo. Selecione o lote de novo.");
        return;
      }
      const resultado = await reclassificarArquivoRecebimentoBrowser(arquivo);
      atualizarClassificacaoItemFila(
        id,
        resultado.tipoEscolhido,
        resultado.classificacao.detalhe
      );
      if (resultado.tipoEscolhido === "desconhecido") {
        setErro(
          "Ainda não reconheci este arquivo. Use Ver arquivo e escolha o tipo na lista."
        );
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao reconhecer o arquivo.");
    } finally {
      setReconhecendoId(null);
    }
  }

  return (
    <div className="space-y-4">
      <button type="button" className="btn-secundario inline-flex items-center gap-2" onClick={onVoltar}>
        <ArrowLeft size={18} /> Voltar ao Recebimento
      </button>

      <Card className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <FileStack size={28} className="shrink-0 text-primaria" />
          <div>
            <h2 className="text-lg font-bold">Importar lote (e-mail)</h2>
            <p className="text-sm text-slate-600">
              Classifique vários arquivos. A fila <strong>A conciliar</strong> fica salva neste
              navegador (IndexedDB): você pode cadastrar fornecedor/produto, dar F5 e voltar aos
              arquivos restantes.
            </p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xml,application/xml,text/xml,.pdf,application/pdf,image/*"
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
            {lendo ? <Loader2 size={18} className="animate-spin" /> : <FolderOpen size={18} />}
            {lendo ? "Classificando… (PDF pode usar OCR)" : abertos.length > 0 ? "Adicionar arquivos" : "Selecionar arquivos"}
          </button>
          {abertos.length > 0 && (
            <button
              type="button"
              className="btn-secundario inline-flex items-center gap-2"
              onClick={() => {
                limparFilaLote();
                setErro(null);
              }}
            >
              <Trash2 size={16} /> Limpar fila
            </button>
          )}
        </div>

        {abertos.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={substituir}
              onChange={(e) => setSubstituir(e.target.checked)}
            />
            Próxima seleção substitui a fila (desmarque para acrescentar)
          </label>
        )}

        {lendo && progresso && (
          <p className="text-sm text-slate-600">
            Lendo {progresso.feito}/{progresso.total}
            {progresso.nome ? ` · ${progresso.nome}` : ""}
          </p>
        )}
        {erro && <p className="text-sm text-red-700">{erro}</p>}
      </Card>

      {abertos.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge cor="laranja">{abertos.length} a conciliar</Badge>
            {(Object.keys(contagem) as TipoArquivoRecebimento[])
              .filter((t) => contagem[t] > 0)
              .map((tipo) => (
                <Badge key={tipo} cor={corTipo(tipo)}>
                  {contagem[tipo]} {rotuloTipoArquivoRecebimento(tipo)}
                </Badge>
              ))}
          </div>

          <ul className="space-y-3">
            {abertos.map((item) => (
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
                    <div className="flex flex-wrap gap-1">
                      <Badge cor={item.status === "em_andamento" ? "laranja" : "cinza"}>
                        {rotuloStatusFilaLote(item.status)}
                      </Badge>
                      <Badge cor={corTipo(item.tipo)}>{rotuloTipoArquivoRecebimento(item.tipo)}</Badge>
                    </div>
                  </div>

                  <label className="block text-sm text-slate-700">
                    Tipo na triagem
                    <select
                      className="campo mt-1 w-full max-w-xs"
                      value={item.tipo}
                      onChange={(e) =>
                        alterarTipoItemFila(item.id, e.target.value as TipoArquivoRecebimento)
                      }
                    >
                      {TIPOS.map((tipo) => (
                        <option key={tipo} value={tipo}>
                          {rotuloTipoArquivoRecebimento(tipo)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex flex-wrap gap-2">
                    {item.tipo === "pdf_boleto" ? (
                      <button
                        type="button"
                        className="btn-primario inline-flex items-center gap-2 text-sm"
                        onClick={() => levarBoletoAoFinanceiro(item.id)}
                      >
                        <Link2 size={16} /> Levar ao Financeiro
                      </button>
                    ) : item.tipo === "desconhecido" ? (
                      <>
                        <button
                          type="button"
                          className="btn-primario inline-flex items-center gap-2 text-sm"
                          onClick={() => void verArquivo(item.id)}
                        >
                          <Eye size={16} /> Ver arquivo
                        </button>
                        <button
                          type="button"
                          className="btn-secundario inline-flex items-center gap-2 text-sm"
                          disabled={reconhecendoId === item.id}
                          onClick={() => void reconhecerDeNovo(item.id)}
                        >
                          {reconhecendoId === item.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <ScanSearch size={16} />
                          )}
                          {reconhecendoId === item.id ? "Lendo…" : "Reconhecer (OCR)"}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn-primario text-sm"
                        onClick={() => void abrirItem(item.id, item.tipo)}
                      >
                        {item.status === "em_andamento" ? "Continuar" : "Abrir neste fluxo"}
                      </button>
                    )}
                    {item.tipo !== "desconhecido" && (
                      <button
                        type="button"
                        className="btn-secundario inline-flex items-center gap-2 text-sm"
                        onClick={() => void verArquivo(item.id)}
                      >
                        <Eye size={16} /> Ver
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-secundario text-sm"
                      onClick={() => descartarItemFila(item.id)}
                    >
                      Descartar
                    </button>
                  </div>
                  {item.tipo === "desconhecido" && (
                    <p className="text-sm text-slate-600">
                      PDFs sem texto passam por OCR automático. Se ainda falhar, use Ver arquivo /
                      Reconhecer (OCR) e escolha o tipo acima — sem baixar de novo.
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {abertos.length === 0 && !lendo && (
        <p className="text-center text-sm text-slate-500">
          Nenhum arquivo a conciliar. Selecione os Downloads do e-mail para começar.
        </p>
      )}

      <Modal
        aberto={preview !== null}
        titulo={preview?.nome ?? "Pré-visualização"}
        onFechar={fecharPreview}
      >
        {preview && (
          <div className="space-y-3">
            {preview.textoXml !== undefined ? (
              <pre className="max-h-[70vh] overflow-auto rounded-card bg-slate-50 p-3 text-xs text-slate-800">
                {preview.textoXml.slice(0, 80_000)}
                {preview.textoXml.length > 80_000 ? "\n… (truncado)" : ""}
              </pre>
            ) : preview.mime.startsWith("image/") ||
              /\.(png|jpe?g|webp|gif)$/i.test(preview.nome) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.url}
                alt={preview.nome}
                className="max-h-[70vh] w-full object-contain bg-slate-100"
              />
            ) : (
              <iframe
                title={preview.nome}
                src={preview.url}
                className="h-[70vh] w-full rounded-card border border-slate-200 bg-slate-100"
              />
            )}
            <p className="text-sm text-slate-600">
              Arquivo já está na fila — não precisa baixar de novo. Feche para voltar à triagem.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
