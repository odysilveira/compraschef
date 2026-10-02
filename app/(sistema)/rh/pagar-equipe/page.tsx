"use client";

import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  QrCode,
  Wallet,
} from "lucide-react";
import { Badge, Campo, Card, TituloPagina, Vazio } from "@/components/ui";
import { mutate, useDB } from "@/lib/data";
import { contaPadraoOrigem, opcoesOrigemPagamento } from "@/lib/domain/contas-pagamento";
import {
  listarLotePagarEquipe,
  marcarPagamentoEquipePago,
  type ItemLotePagarEquipe,
} from "@/lib/domain/pagar-equipe";
import { hojeIsoLocal } from "@/lib/domain/pix-copia-cola";
import { moeda } from "@/lib/format";
import { ROTULO_PAPEL, usePapel } from "@/lib/roles";

function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function PagarEquipePage() {
  const db = useDB();
  const { papel } = usePapel();
  const [competencia, setCompetencia] = useState(competenciaAtual);
  const [incluirPrevistos, setIncluirPrevistos] = useState(true);
  const [modoFila, setModoFila] = useState(false);
  const [indiceFila, setIndiceFila] = useState(0);
  const [contaOrigem, setContaOrigem] = useState(() => contaPadraoOrigem(db) || "");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const contas = useMemo(() => opcoesOrigemPagamento(db), [db]);

  const lote = useMemo(
    () =>
      listarLotePagarEquipe(db, {
        competencia,
        incluirPrevistos,
        cidadePadrao: "LONDRINA",
      }),
    [db, competencia, incluirPrevistos]
  );

  const itemFila = lote[indiceFila] ?? null;

  async function copiarPix(item: ItemLotePagarEquipe) {
    if (!item.payload_pix) return;
    try {
      await navigator.clipboard.writeText(item.payload_pix);
      setCopiadoId(item.pagamento.id);
      setTimeout(() => setCopiadoId(null), 2000);
    } catch {
      setErro("Não foi possível copiar. Selecione o texto do PIX manualmente.");
    }
  }

  function marcarPago(item: ItemLotePagarEquipe) {
    setErro(null);
    setMensagem(null);
    if (!contaOrigem.trim()) {
      setErro("Escolha a conta de origem do pagamento.");
      return;
    }
    let ok = false;
    mutate((banco) => {
      const r = marcarPagamentoEquipePago(banco, item.pagamento.id, {
        bancoConta: contaOrigem,
        responsavel: ROTULO_PAPEL[papel],
        dataPagamento: hojeIsoLocal(),
      });
      ok = r.sucesso;
      if (!r.sucesso) setErro(r.erros.join(" "));
    });
    if (ok) {
      setMensagem(`Marcado como pago: ${item.pessoa.nome} · ${moeda(item.valor)}`);
      if (modoFila && indiceFila >= lote.length - 1) {
        setIndiceFila(Math.max(0, lote.length - 2));
      }
    }
  }

  function CartaoPagamento({ item }: { item: ItemLotePagarEquipe }) {
    return (
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-lg font-bold">{item.pessoa.nome}</p>
            <p className="text-sm text-stone-600">
              {item.rotulo_tipo}
              {item.pagamento.descricao ? ` · ${item.pagamento.descricao}` : ""}
            </p>
            <p className="mt-1 text-2xl font-bold text-primaria-escura">{moeda(item.valor)}</p>
          </div>
          <Badge cor={item.pagamento.status === "liberado" ? "verde" : "laranja"}>
            {item.pagamento.status === "liberado" ? "Liberado" : "Previsto"}
          </Badge>
        </div>

        {!item.chave_pix ? (
          <div className="flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            Sem chave PIX no cadastro. Abra a pessoa em RH e cadastre a chave.
          </div>
        ) : item.erro_pix && !item.payload_pix ? (
          <div className="flex items-start gap-2 rounded-card border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {item.erro_pix}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <div className="rounded-card border border-stone-200 bg-white p-3">
              {item.payload_pix ? (
                <QRCodeSVG value={item.payload_pix} size={200} marginSize={1} level="M" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs font-medium text-stone-500">Chave PIX</p>
              <p className="break-all text-sm font-semibold">{item.chave_pix}</p>
              <p className="text-xs font-medium text-stone-500">Copia e cola</p>
              <p className="max-h-24 overflow-auto break-all rounded bg-stone-50 p-2 font-mono text-[10px] text-stone-600">
                {item.payload_pix}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secundario" onClick={() => void copiarPix(item)}>
                  <Copy size={16} />
                  {copiadoId === item.pagamento.id ? "Copiado!" : "Copiar PIX"}
                </button>
                <button type="button" className="btn-primario" onClick={() => marcarPago(item)}>
                  <CheckCircle2 size={16} /> Marcar pago
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>
    );
  }

  return (
    <div>
      <TituloPagina
        titulo="Pagar equipe"
        subtitulo="QR PIX por motoboy e freela — escaneie no banco e marque como pago"
      />

      <Card className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo rotulo="Competência">
          <input
            type="month"
            className="campo"
            value={competencia}
            onChange={(e) => {
              setCompetencia(e.target.value);
              setIndiceFila(0);
            }}
          />
        </Campo>
        <Campo rotulo="Conta de origem *">
          <select
            className="campo"
            value={contaOrigem}
            onChange={(e) => setContaOrigem(e.target.value)}
          >
            <option value="">— escolher —</option>
            {contas.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Campo>
        <label className="flex items-center gap-2 text-sm sm:mt-7">
          <input
            type="checkbox"
            checked={incluirPrevistos}
            onChange={(e) => setIncluirPrevistos(e.target.checked)}
          />
          Incluir previstos
        </label>
        <label className="flex items-center gap-2 text-sm sm:mt-7">
          <input
            type="checkbox"
            checked={modoFila}
            onChange={(e) => {
              setModoFila(e.target.checked);
              setIndiceFila(0);
            }}
          />
          Modo fila (um por vez)
        </label>
      </Card>

      {erro && (
        <div className="mb-3 flex gap-2 rounded-card border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {erro}
        </div>
      )}
      {mensagem && (
        <div className="mb-3 flex gap-2 rounded-card border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          {mensagem}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-stone-600">
        <Wallet size={16} />
        <span>
          {lote.length} pagamento(s) · total {moeda(lote.reduce((s, i) => s + i.valor, 0))}
        </span>
        <span className="text-stone-400">
          · {lote.filter((i) => i.pode_gerar_pix).length} com QR pronto
        </span>
      </div>

      {lote.length === 0 ? (
        <Vazio mensagem="Nenhum pagamento de motoboy/freela liberado ou previsto nesta competência. Crie em RH → Pagamentos." />
      ) : modoFila && itemFila ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="btn-secundario"
              disabled={indiceFila <= 0}
              onClick={() => setIndiceFila((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft size={16} /> Anterior
            </button>
            <span className="text-sm font-medium text-stone-600">
              <QrCode size={14} className="mr-1 inline" />
              {indiceFila + 1} / {lote.length}
            </span>
            <button
              type="button"
              className="btn-secundario"
              disabled={indiceFila >= lote.length - 1}
              onClick={() => setIndiceFila((i) => Math.min(lote.length - 1, i + 1))}
            >
              Próximo <ChevronRight size={16} />
            </button>
          </div>
          <CartaoPagamento item={itemFila} />
        </div>
      ) : (
        <div className="space-y-4">
          {lote.map((item) => (
            <CartaoPagamento key={item.pagamento.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
