"use client";

// Importar lote — caixa de entrada dos Downloads do e-mail:
// multi-seleção → classifica (XML / boleto / NFS-e / DANFE / revisar) → triagem →
// abre o fluxo certo. Nada é gravado só por classificar.

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, FileStack, FolderOpen, Link2, Loader2, Trash2 } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import {
  classificarArquivosRecebimentoBrowser,
  type ItemLoteClassificado,
} from "@/lib/domain/classificar-arquivo-recebimento-browser";
import {
  contarPorTipo,
  rotuloTipoArquivoRecebimento,
  type TipoArquivoRecebimento,
} from "@/lib/domain/classificar-arquivo-recebimento";

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
  const [itens, setItens] = useState<ItemLoteClassificado[]>([]);
  const [lendo, setLendo] = useState(false);
  const [progresso, setProgresso] = useState<{ feito: number; total: number; nome: string } | null>(
    null
  );
  const [erro, setErro] = useState<string | null>(null);

  const contagem = useMemo(
    () => contarPorTipo(itens.map((i) => ({ tipo: i.tipoEscolhido }))),
    [itens]
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
      setItens(classificados);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao classificar os arquivos.");
      setItens([]);
    } finally {
      setLendo(false);
      setProgresso(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function alterarTipo(id: string, tipo: TipoArquivoRecebimento) {
    setItens((atual) =>
      atual.map((item) => (item.id === id ? { ...item, tipoEscolhido: tipo } : item))
    );
  }

  function remover(id: string) {
    setItens((atual) => atual.filter((item) => item.id !== id));
  }

  function limpar() {
    setItens([]);
    setErro(null);
  }

  return (
    <div className="space-y-4">
      <button type="button" className="btn-secundario inline-flex items-center gap-2" onClick={onVoltar}>
        <ArrowLeft size={18} /> Voltar
      </button>

      <Card className="space-y-3 p-5">
        <div className="flex items-start gap-3">
          <FileStack size={28} className="shrink-0 text-primaria" />
          <div>
            <h2 className="text-lg font-bold">Importar lote (e-mail)</h2>
            <p className="text-sm text-slate-600">
              Selecione vários arquivos baixados (XML, PDF, foto). O ComprasChef separa por tipo;
              você confere a triagem e só então abre cada fluxo — nada é gravado automaticamente.
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
            {lendo ? "Classificando…" : "Selecionar arquivos"}
          </button>
          {itens.length > 0 && (
            <button type="button" className="btn-secundario inline-flex items-center gap-2" onClick={limpar}>
              <Trash2 size={16} /> Limpar lista
            </button>
          )}
        </div>

        {lendo && progresso && (
          <p className="text-sm text-slate-600">
            Lendo {progresso.feito}/{progresso.total}
            {progresso.nome ? ` · ${progresso.nome}` : ""}
          </p>
        )}
        {erro && <p className="text-sm text-red-700">{erro}</p>}
      </Card>

      {itens.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(contagem) as TipoArquivoRecebimento[])
              .filter((t) => contagem[t] > 0)
              .map((tipo) => (
                <Badge key={tipo} cor={corTipo(tipo)}>
                  {contagem[tipo]} {rotuloTipoArquivoRecebimento(tipo)}
                </Badge>
              ))}
          </div>

          <ul className="space-y-3">
            {itens.map((item) => (
              <li key={item.id}>
                <Card className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold" title={item.arquivo.name}>
                        {item.arquivo.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {(item.arquivo.size / 1024).toFixed(1)} KB
                        {item.classificacao.detalhe ? ` · ${item.classificacao.detalhe}` : ""}
                      </p>
                    </div>
                    <Badge cor={corTipo(item.tipoEscolhido)}>
                      {rotuloTipoArquivoRecebimento(item.tipoEscolhido)}
                    </Badge>
                  </div>

                  <label className="block text-sm text-slate-700">
                    Tipo na triagem
                    <select
                      className="campo mt-1 w-full max-w-xs"
                      value={item.tipoEscolhido}
                      onChange={(e) =>
                        alterarTipo(item.id, e.target.value as TipoArquivoRecebimento)
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
                    {item.tipoEscolhido === "pdf_boleto" ? (
                      <a href="/financeiro" className="btn-primario inline-flex items-center gap-2 text-sm">
                        <Link2 size={16} /> Abrir no Financeiro
                      </a>
                    ) : item.tipoEscolhido === "desconhecido" ? (
                      <span className="text-sm text-slate-600">
                        Escolha o tipo acima ou descarte o arquivo.
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn-primario text-sm"
                        onClick={() =>
                          onAbrirFluxo({ tipo: item.tipoEscolhido, arquivo: item.arquivo })
                        }
                      >
                        Abrir neste fluxo
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-secundario text-sm"
                      onClick={() => remover(item.id)}
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
    </div>
  );
}
