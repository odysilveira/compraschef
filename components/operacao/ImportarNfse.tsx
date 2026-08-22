"use client";

// Importação de NFS-e (nota de serviço) via PDF — sem estoque.
// Gera título liberado na agenda financeira (boleto ou PIX).

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, FileUp, FlaskConical, ReceiptText, Wallet } from "lucide-react";
import { Badge, Campo, Card } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import { extrairTextoPdfBrowser } from "@/lib/domain/folha-recibo-pdf-browser";
import {
  TEXTO_NFSE_DEMO_ANOTA_AI,
  chaveNfseValida,
  extrairDadosNfseDoTexto,
  garantirFornecedorNfse,
  registrarNfseIdempotente,
  type DadosNfseExtraidos,
  type MeioPagamentoNfse,
} from "@/lib/domain/nfse";
import { dataBR, moeda } from "@/lib/format";

function soData(iso: string): string {
  return iso.slice(0, 10);
}

function adicionarDiasIso(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function formatarCnpj(valor: string): string {
  const n = valor.replace(/\D/g, "").slice(0, 14);
  if (n.length !== 14) return valor;
  return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export interface ResultadoImportacaoNfse {
  fornecedorNome: string;
  valor: number;
  meio: MeioPagamentoNfse;
  notaId: string;
}

interface Props {
  onVoltar: () => void;
  onConcluido: (resultado: ResultadoImportacaoNfse) => void;
  /** PDF já escolhido na triagem de lote. */
  arquivoInicial?: File | null;
}

export default function ImportarNfse({ onVoltar, onConcluido, arquivoInicial }: Props) {
  const db = useDB();
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const [textoExtraido, setTextoExtraido] = useState("");
  const [dados, setDados] = useState<DadosNfseExtraidos | null>(null);
  const [meio, setMeio] = useState<MeioPagamentoNfse>("pix");
  const [vencimento, setVencimento] = useState("");
  const [numero, setNumero] = useState("");
  const [chave, setChave] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [razao, setRazao] = useState("");
  const [valor, setValor] = useState("");
  const [emitidaEm, setEmitidaEm] = useState("");
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const fornecedorExistente = useMemo(() => {
    const digitos = cnpj.replace(/\D/g, "");
    if (digitos.length !== 14) return null;
    return db.fornecedores.find((f) => f.cnpj.replace(/\D/g, "") === digitos) ?? null;
  }, [db.fornecedores, cnpj]);

  function aplicarDados(extraidos: DadosNfseExtraidos, nomeArquivo?: string) {
    setDados(extraidos);
    setArquivoNome(nomeArquivo ?? null);
    setNumero(extraidos.numero ?? "");
    setChave(extraidos.chave_nfse ?? "");
    setCnpj(extraidos.cnpj_prestador ? formatarCnpj(extraidos.cnpj_prestador) : "");
    setRazao(extraidos.razao_social_prestador ?? "");
    setValor(extraidos.valor_total != null ? String(extraidos.valor_total).replace(".", ",") : "");
    setEmitidaEm(extraidos.emitida_em ?? "");
    setDescricao(extraidos.descricao_servico ?? "");
    const base = extraidos.emitida_em || soData(new Date().toISOString());
    setVencimento(adicionarDiasIso(base, 14));
    setErro(null);
  }

  async function aoEscolherPdf(file: File | null) {
    if (!file) return;
    setLendo(true);
    setErro(null);
    try {
      const buffer = await file.arrayBuffer();
      const texto = await extrairTextoPdfBrowser(buffer);
      setTextoExtraido(texto);
      const extraidos = extrairDadosNfseDoTexto(texto);
      aplicarDados(extraidos, file.name);
      if (!extraidos.chave_nfse && !extraidos.valor_total && !extraidos.cnpj_prestador) {
        setErro(
          "Não consegui ler campos da NFS-e neste PDF (muitos são imagem). Use o exemplo demo ou complete os campos à mão."
        );
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler o PDF.");
    } finally {
      setLendo(false);
    }
  }

  useEffect(() => {
    if (!arquivoInicial) return;
    void aoEscolherPdf(arquivoInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carrega só o PDF inicial do lote
  }, [arquivoInicial]);

  function carregarDemo() {
    setTextoExtraido(TEXTO_NFSE_DEMO_ANOTA_AI);
    aplicarDados(extrairDadosNfseDoTexto(TEXTO_NFSE_DEMO_ANOTA_AI), "demo-anota-ai-osasco.txt");
    setMeio("pix");
  }

  function parseValorCampo(bruto: string): number | undefined {
    const limpo = bruto.trim();
    if (!limpo) return undefined;
    const n = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
    return Number.isFinite(n) ? Number(n.toFixed(2)) : undefined;
  }

  function confirmar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const valorNum = parseValorCampo(valor);
    if (!numero.trim()) {
      setErro("Informe o número da NFS-e.");
      return;
    }
    if (!chaveNfseValida(chave)) {
      setErro("Informe a chave NFS-e (começa com NFS… ou código longo do município).");
      return;
    }
    if (cnpj.replace(/\D/g, "").length !== 14) {
      setErro("CNPJ do prestador inválido.");
      return;
    }
    if (!razao.trim()) {
      setErro("Informe a razão social do prestador.");
      return;
    }
    if (valorNum == null || valorNum <= 0) {
      setErro("Valor total inválido.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(emitidaEm)) {
      setErro("Data de emissão inválida.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) {
      setErro("Vencimento do pagamento inválido.");
      return;
    }

    setSalvando(true);
    try {
      let notaIdFinal = "";
      let nomeFornecedor = razao.trim();
      mutate((atual) => {
        const forn = garantirFornecedorNfse(atual, {
          cnpj,
          razao_social: razao,
          meio_pagamento: meio,
          gerarId: () => uid("forn"),
        });
        nomeFornecedor = forn.nome;
        const resultado = registrarNfseIdempotente(
          atual,
          {
            fornecedor_id: forn.id,
            numero: numero.trim(),
            chave_nfse: chave.trim(),
            cnpj_emitente: cnpj,
            razao_social_emitente: razao.trim(),
            valor_total: valorNum,
            emitida_em: emitidaEm,
            importada_em: new Date().toISOString(),
            descricao_servico: descricao.trim() || undefined,
            municipio_emissao: dados?.municipio,
            arquivo_pdf_nome: arquivoNome ?? undefined,
            meio_pagamento: meio,
            vencimento,
          },
          { gerarIdNota: () => uid("nfse"), gerarIdBoleto: () => uid("bol") }
        );
        if (!resultado.sucesso) {
          throw new Error(resultado.mensagem ?? "Não foi possível registrar a NFS-e.");
        }
        notaIdFinal = resultado.notaId!;
      });
      onConcluido({
        fornecedorNome: nomeFornecedor,
        valor: valorNum,
        meio,
        notaId: notaIdFinal,
      });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secundario" onClick={onVoltar}>
          <ArrowLeft size={16} /> Voltar
        </button>
        <h1 className="text-xl font-bold">Importar NFS-e (serviço)</h1>
      </div>

      <Card className="space-y-3 p-4">
        <p className="text-sm text-slate-600">
          A maioria das notas de serviço chega em <strong>PDF</strong> (prefeitura). O sistema extrai o texto,
          você confere e escolhe se o pagamento será por <strong>boleto</strong> ou <strong>PIX</strong>. Não
          passa pelo estoque — o título já nasce liberado na agenda financeira.
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="btn-primario cursor-pointer">
            <FileUp size={16} />
            {lendo ? "Lendo PDF…" : "Escolher PDF"}
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={lendo}
              onChange={(ev) => void aoEscolherPdf(ev.target.files?.[0] ?? null)}
            />
          </label>
          <button type="button" className="btn-secundario" onClick={carregarDemo}>
            <FlaskConical size={16} /> Exemplo Anota AI (Osasco)
          </button>
        </div>
        {arquivoNome && (
          <p className="text-xs text-slate-500">
            Arquivo: {arquivoNome}
            {textoExtraido ? ` · ${textoExtraido.length} caracteres lidos` : ""}
          </p>
        )}
      </Card>

      {(dados || numero || chave) && (
        <form onSubmit={confirmar} className="space-y-4">
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <ReceiptText size={18} className="text-primaria" />
              <span className="font-semibold">Dados da NFS-e</span>
              <Badge cor="azul">serviço</Badge>
              {fornecedorExistente && <Badge cor="verde">fornecedor já cadastrado</Badge>}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo rotulo="Número *">
                <input className="campo" value={numero} onChange={(e) => setNumero(e.target.value)} required />
              </Campo>
              <Campo rotulo="Emissão *">
                <input
                  type="date"
                  className="campo"
                  value={emitidaEm}
                  onChange={(e) => setEmitidaEm(e.target.value)}
                  required
                />
              </Campo>
              <Campo rotulo="CNPJ prestador *">
                <input className="campo" value={cnpj} onChange={(e) => setCnpj(e.target.value)} required />
              </Campo>
              <Campo rotulo="Razão social *">
                <input className="campo" value={razao} onChange={(e) => setRazao(e.target.value)} required />
              </Campo>
              <Campo rotulo="Valor total *">
                <input className="campo" value={valor} onChange={(e) => setValor(e.target.value)} required />
              </Campo>
              <Campo rotulo="Vencimento do pagamento *">
                <input
                  type="date"
                  className="campo"
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                  required
                />
              </Campo>
            </div>
            <Campo rotulo="Chave NFS-e *">
              <input className="campo font-mono text-xs" value={chave} onChange={(e) => setChave(e.target.value)} required />
            </Campo>
            <Campo rotulo="Discriminação do serviço">
              <textarea className="campo min-h-20" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </Campo>
          </Card>

          <Card className="space-y-3 p-4">
            <div className="flex items-center gap-2 font-semibold">
              <Wallet size={18} className="text-primaria" /> Como vai pagar?
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-start gap-2 rounded-lg border-2 p-3 ${
                  meio === "pix" ? "border-primaria bg-primaria-clara" : "border-slate-200"
                }`}
              >
                <input type="radio" name="meio" checked={meio === "pix"} onChange={() => setMeio("pix")} />
                <span>
                  <span className="block font-semibold">PIX</span>
                  <span className="text-sm text-slate-600">
                    Título liberado na agenda; informe o pagamento quando sair no banco.
                  </span>
                </span>
              </label>
              <label
                className={`flex cursor-pointer items-start gap-2 rounded-lg border-2 p-3 ${
                  meio === "boleto" ? "border-primaria bg-primaria-clara" : "border-slate-200"
                }`}
              >
                <input type="radio" name="meio" checked={meio === "boleto"} onChange={() => setMeio("boleto")} />
                <span>
                  <span className="block font-semibold">Boleto</span>
                  <span className="text-sm text-slate-600">
                    Título liberado; depois importe o PDF/linha do boleto para conferir.
                  </span>
                </span>
              </label>
            </div>
            {emitidaEm && vencimento && (
              <p className="text-sm text-slate-600">
                Resumo: {moeda(parseValorCampo(valor) ?? 0)} · emitir {dataBR(emitidaEm)} · pagar até{" "}
                {dataBR(vencimento)} · via {meio.toUpperCase()}
              </p>
            )}
          </Card>

          {erro && <p className="text-sm font-medium text-erro">{erro}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secundario" onClick={onVoltar}>
              Cancelar
            </button>
            <button type="submit" className="btn-primario" disabled={salvando || lendo}>
              {salvando ? "Salvando…" : "Confirmar NFS-e"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
