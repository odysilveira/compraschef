"use client";

// Importar lote — caixa de entrada dos Downloads do e-mail:
// multi-seleção → classifica → fila “A conciliar” (sessão) → abre o fluxo.
// A fila sobrevive ao cadastro de fornecedor/produto; nada grava só por classificar.

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, FileStack, FolderOpen, Link2, Loader2, Trash2 } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { classificarArquivosRecebimentoBrowser } from "@/lib/domain/classificar-arquivo-recebimento-browser";
import {
  contarPorTipo,
  rotuloTipoArquivoRecebimento,
  type TipoArquivoRecebimento,
} from "@/lib/domain/classificar-arquivo-recebimento";
import { filtrarItensAbertos, rotuloStatusFilaLote } from "@/lib/domain/lote-recebimento-fila";
import {
  acrescentarClassificados,
  alterarTipoItemFila,
  descartarItemFila,
  definirFilaDeClassificados,
  limparFilaLote,
  marcarItemEmAndamento,
  obterArquivoFila,
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
  const inputRef = useRef<HTMLInputElement>(null);
  const fila = useFilaLoteRecebimento();
  const abertos = useMemo(() => filtrarItensAbertos(fila), [fila]);
  const [lendo, setLendo] = useState(false);
  const [progresso, setProgresso] = useState<{ feito: number; total: number; nome: string } | null>(
    null
  );
  const [erro, setErro] = useState<string | null>(null);
  const [substituir, setSubstituir] = useState(true);

  const contagem = useMemo(
    () => contarPorTipo(abertos.map((i) => ({ tipo: i.tipo }))),
    [abertos]
  );

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

  function abrirItem(id: string, tipo: TipoArquivoRecebimento) {
    const arquivo = obterArquivoFila(id);
    if (!arquivo) {
      setErro("Arquivo não está mais na memória desta sessão. Selecione o lote de novo.");
      return;
    }
    if (tipo === "desconhecido") return;
    marcarItemEmAndamento(id);
    onAbrirFluxo({ id, tipo, arquivo });
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
              Classifique vários arquivos. A fila <strong>A conciliar</strong> fica nesta sessão: você
              pode cadastrar fornecedor/produto e voltar aos arquivos restantes.
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
            {lendo ? "Classificando…" : abertos.length > 0 ? "Adicionar arquivos" : "Selecionar arquivos"}
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
                      <a
                        href="/financeiro"
                        className="btn-primario inline-flex items-center gap-2 text-sm"
                        onClick={() => marcarItemEmAndamento(item.id)}
                      >
                        <Link2 size={16} /> Abrir no Financeiro
                      </a>
                    ) : item.tipo === "desconhecido" ? (
                      <span className="text-sm text-slate-600">
                        Escolha o tipo acima ou descarte o arquivo.
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn-primario text-sm"
                        onClick={() => abrirItem(item.id, item.tipo)}
                      >
                        {item.status === "em_andamento" ? "Continuar" : "Abrir neste fluxo"}
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
    </div>
  );
}
