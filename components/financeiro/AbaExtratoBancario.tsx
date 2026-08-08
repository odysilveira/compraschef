"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Upload } from "lucide-react";
import { Badge, Card, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import type { AlvoMatchExtrato } from "@/lib/domain/conciliar-extrato";
import {
  aplicarMatchesLinhasPersistidas,
  contarDebitosExtratoAbertos,
  contarTitulosAguardandoConciliacao,
  filtrarLinhasExtrato,
  ignorarLinhasExtrato,
  listarImportacoesExtrato,
  parseFiltroStatusExtratoLinha,
  rotuloOrigemExtrato,
  sugerirMatchesLinhasPersistidas,
  type FiltroStatusExtratoLinha,
} from "@/lib/domain/extrato-persistido";
import { hrefFinanceiro } from "@/lib/domain/financeiro";
import { dataBR, dataHoraBR, moeda } from "@/lib/format";
import type { DB, ExtratoLinha, StatusExtratoLinha } from "@/lib/types";
import { rotuloContaBancaria } from "@/lib/domain/contas-pagamento";

type Props = {
  onMensagem: (msg: string) => void;
  onAbrirImportar: () => void;
};

type ChaveAlvo = `${AlvoMatchExtrato}:${string}`;

const FILTROS: { valor: FiltroStatusExtratoLinha; rotulo: string }[] = [
  { valor: "abertas", rotulo: "Abertas" },
  { valor: "conciliadas", rotulo: "Conciliadas" },
  { valor: "ignoradas", rotulo: "Ignoradas" },
  { valor: "todas", rotulo: "Todas" },
];

function chaveAlvo(alvo: AlvoMatchExtrato, id: string): ChaveAlvo {
  return `${alvo}:${id}`;
}

function parseChaveAlvo(valor: string): { alvo: AlvoMatchExtrato; alvo_id: string } | null {
  if (!valor) return null;
  const sep = valor.indexOf(":");
  if (sep <= 0) return null;
  const alvo = valor.slice(0, sep);
  const alvo_id = valor.slice(sep + 1);
  if ((alvo !== "boleto" && alvo !== "rh") || !alvo_id) return null;
  return { alvo, alvo_id };
}

function rotuloBoleto(db: Pick<DB, "boletos" | "notas_fiscais" | "fornecedores">, boletoId: string): string {
  const boleto = (db.boletos ?? []).find((b) => b.id === boletoId);
  if (!boleto) return `Boleto · ${boletoId}`;
  const nota = (db.notas_fiscais ?? []).find((n) => n.id === boleto.nota_id);
  const forn = nota ? (db.fornecedores ?? []).find((f) => f.id === nota.fornecedor_id) : undefined;
  const banco = boleto.pagamento_banco_conta ? ` · ${boleto.pagamento_banco_conta}` : "";
  return `Boleto · ${forn?.nome ?? "fornecedor"} · ${moeda(boleto.pagamento_valor ?? boleto.valor)}${banco}`;
}

function rotuloRh(db: Pick<DB, "pagamentos_pessoas" | "pessoas">, pagamentoId: string): string {
  const pag = (db.pagamentos_pessoas ?? []).find((p) => p.id === pagamentoId);
  if (!pag) return `RH · ${pagamentoId}`;
  const pessoa = (db.pessoas ?? []).find((p) => p.id === pag.pessoa_id);
  const banco = pag.pagamento_banco_conta ? ` · ${pag.pagamento_banco_conta}` : "";
  return `RH · ${pessoa?.nome ?? "pessoa"} · ${moeda(pag.pagamento_valor ?? pag.valor)}${banco}`;
}

function rotuloStatus(status: StatusExtratoLinha): string {
  if (status === "aberta") return "Aberta";
  if (status === "conciliada") return "Conciliada";
  return "Ignorada";
}

function corStatus(status: StatusExtratoLinha): "azul" | "verde" | "cinza" {
  if (status === "aberta") return "azul";
  if (status === "conciliada") return "verde";
  return "cinza";
}

function textoConfianca(confianca: "exata" | "proxima" | "nenhuma", motivos: string[]): string {
  if (confianca === "nenhuma") return "Sem correspondente sugerido";
  const base = confianca === "exata" ? "Match exato" : "Match próximo";
  return motivos.length ? `${base} · ${motivos.join(", ")}` : base;
}

export default function AbaExtratoBancario({ onMensagem, onAbrirImportar }: Props) {
  const db = useDB();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filtro = parseFiltroStatusExtratoLinha(searchParams.get("status"));

  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [processando, setProcessando] = useState(false);

  const linhas = db.extrato_linhas ?? [];
  const titulosAguardando = useMemo(() => contarTitulosAguardandoConciliacao(db), [db]);
  const importacoes = useMemo(() => listarImportacoesExtrato(db), [db]);

  const contagens = useMemo(
    () => ({
      abertas: contarDebitosExtratoAbertos(db),
      conciliadas: filtrarLinhasExtrato(linhas, "conciliadas").length,
      ignoradas: filtrarLinhasExtrato(linhas, "ignoradas").length,
      todas: linhas.length,
    }),
    [db, linhas]
  );

  const sugestoes = useMemo(
    () => (filtro === "abertas" ? sugerirMatchesLinhasPersistidas(db) : []),
    [db, filtro]
  );

  const linhasFiltradas = useMemo(() => {
    if (filtro === "abertas") return [];
    return filtrarLinhasExtrato(linhas, filtro).sort((a, b) => a.data.localeCompare(b.data));
  }, [filtro, linhas]);

  const alvosDisponiveis = useMemo(() => {
    const boletos = (db.boletos ?? [])
      .filter((b) => b.status === "aguardando_conciliacao")
      .map((b) => ({
        valor: chaveAlvo("boleto", b.id),
        rotulo: rotuloBoleto(db, b.id),
      }));
    const rhs = (db.pagamentos_pessoas ?? [])
      .filter((p) => p.status === "aguardando_conciliacao")
      .map((p) => ({
        valor: chaveAlvo("rh", p.id),
        rotulo: rotuloRh(db, p.id),
      }));
    return [...boletos, ...rhs];
  }, [db]);

  function irFiltro(extratoStatus: FiltroStatusExtratoLinha) {
    setSelecionados({});
    router.replace(hrefFinanceiro({ aba: "extrato", extratoStatus }), { scroll: false });
  }

  function escolhaEfetiva(linhaId: string, sugestaoAlvo?: AlvoMatchExtrato | null, sugestaoId?: string | null): string {
    if (escolhas[linhaId] !== undefined) return escolhas[linhaId];
    if (sugestaoAlvo && sugestaoId) return chaveAlvo(sugestaoAlvo, sugestaoId);
    return "";
  }

  function idsSelecionados(): string[] {
    return Object.entries(selecionados)
      .filter(([, ok]) => ok)
      .map(([id]) => id);
  }

  function conciliarSelecionados() {
    if (processando) return;
    const ids = idsSelecionados();
    if (ids.length === 0) {
      onMensagem("Selecione ao menos um débito para conciliar.");
      return;
    }

    const matches: Array<{ extrato_linha_id: string; alvo: AlvoMatchExtrato; alvo_id: string }> = [];
    for (const id of ids) {
      const sug = sugestoes.find((s) => s.linha.id === id);
      const parsed = parseChaveAlvo(escolhaEfetiva(id, sug?.alvo, sug?.alvo_id));
      if (!parsed) {
        onMensagem("Escolha o título (boleto ou RH) para cada débito selecionado.");
        return;
      }
      matches.push({ extrato_linha_id: id, alvo: parsed.alvo, alvo_id: parsed.alvo_id });
    }

    setProcessando(true);
    try {
      const proximo = structuredClone(db) as DB;
      const resultado = aplicarMatchesLinhasPersistidas(proximo, matches, {
        responsavel: "usuário local",
        idFactory: () => uid("bph"),
      });
      if (resultado.conciliados === 0) {
        onMensagem(resultado.erros.join(" ") || "Nenhum título foi conciliado.");
        return;
      }
      mutate((atual) => {
        Object.assign(atual, proximo);
      });
      setSelecionados({});
      onMensagem(
        `${resultado.conciliados} débito(s) conciliado(s).` +
          (resultado.erros.length ? ` Alguns falharam: ${resultado.erros[0]}` : "")
      );
    } finally {
      setProcessando(false);
    }
  }

  function ignorarSelecionados() {
    if (processando) return;
    const ids = idsSelecionados();
    if (ids.length === 0) {
      onMensagem("Selecione ao menos um débito para ignorar.");
      return;
    }

    setProcessando(true);
    try {
      const proximo = structuredClone(db) as DB;
      const resultado = ignorarLinhasExtrato(proximo, ids);
      if (resultado.ignoradas === 0) {
        onMensagem(resultado.erros.join(" ") || "Nenhuma linha foi ignorada.");
        return;
      }
      mutate((atual) => {
        Object.assign(atual, proximo);
      });
      setSelecionados({});
      onMensagem(
        `${resultado.ignoradas} linha(s) ignorada(s).` +
          (resultado.erros.length ? ` Alguns falharam: ${resultado.erros[0]}` : "")
      );
    } finally {
      setProcessando(false);
    }
  }

  function rotuloAlvoConciliado(linha: ExtratoLinha): string | null {
    if (!linha.alvo || !linha.alvo_id) return null;
    return linha.alvo === "boleto" ? rotuloBoleto(db, linha.alvo_id) : rotuloRh(db, linha.alvo_id);
  }

  function rotuloContaImportacao(contaId: string | undefined): string | null {
    if (!contaId) return null;
    const conta = (db.contas_bancarias ?? []).find((c) => c.id === contaId);
    return conta ? rotuloContaBancaria(conta) : null;
  }

  const mensagemVazioAbertas =
    linhas.length === 0
      ? "Nenhum extrato importado ainda. Use Importar OFX/CSV para começar a conciliação."
      : contagens.abertas === 0
        ? "Nenhum débito aberto — tudo conciliado ou ignorado neste extrato."
        : "Nenhum débito aberto no extrato.";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Extrato bancário</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Importe OFX/CSV, revise os débitos e concilie com boletos ou pagamentos de RH.
          </p>
        </div>
        <button type="button" className="btn-primario" onClick={onAbrirImportar}>
          <Upload size={16} /> Importar OFX/CSV
        </button>
      </div>

      {importacoes.length > 0 && (
        <Card className="space-y-2 py-3">
          <p className="text-sm font-semibold text-slate-800">Importações recentes</p>
          <ul className="space-y-1.5">
            {importacoes.slice(0, 5).map((imp) => {
              const contaRotulo = rotuloContaImportacao(imp.conta_bancaria_id);
              return (
                <li
                  key={imp.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm text-slate-600"
                >
                  <span>
                    <span className="font-medium text-slate-800">{imp.arquivo_nome}</span>
                    {" · "}
                    {rotuloOrigemExtrato(imp.origem)}
                    {" · "}
                    {imp.debitos} débito{imp.debitos === 1 ? "" : "s"}
                    {contaRotulo ? ` · ${contaRotulo}` : ""}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {dataHoraBR(imp.importado_em)}
                    {imp.importado_por ? ` · ${imp.importado_por}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
          {importacoes.length > 5 && (
            <p className="text-xs text-slate-400">+ {importacoes.length - 5} importação(ões) anteriores</p>
          )}
        </Card>
      )}

      {filtro === "abertas" && contagens.abertas > 0 && titulosAguardando === 0 && (
        <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Há débitos abertos no extrato, mas nenhum boleto ou pagamento RH em{" "}
          <span className="font-semibold">aguardando conciliação</span>. Informe o pagamento na agenda de
          boletos (ou no RH) antes de casar com o extrato — ou ignore débitos que não forem do restaurante.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const ativo = filtro === f.valor;
          const qtd = contagens[f.valor];
          return (
            <button
              key={f.valor}
              type="button"
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                ativo
                  ? "border-primaria bg-primaria/10 font-semibold text-primaria-escura"
                  : "border-stone-200 bg-white text-slate-600 hover:border-primaria/40"
              }`}
              onClick={() => irFiltro(f.valor)}
            >
              {f.rotulo} ({qtd})
            </button>
          );
        })}
      </div>

      {filtro === "abertas" ? (
        <>
          {sugestoes.length === 0 ? (
            <Vazio mensagem={mensagemVazioAbertas} />
          ) : (
            <div className="space-y-2">
              {sugestoes.map((s) => {
                const id = s.linha.id;
                const escolha = escolhaEfetiva(id, s.alvo, s.alvo_id);
                return (
                  <Card key={id} className="flex flex-wrap items-start gap-3 py-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={Boolean(selecionados[id])}
                      disabled={processando}
                      onChange={(e) =>
                        setSelecionados((atual) => ({ ...atual, [id]: e.target.checked }))
                      }
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-sm font-semibold text-slate-900">{dataBR(s.linha.data)}</span>
                        <span className="text-sm font-bold text-slate-800">{moeda(Math.abs(s.linha.valor))}</span>
                        <span className="text-sm text-slate-600">{s.linha.descricao}</span>
                      </div>
                      <label className="block max-w-xl">
                        <span className="rotulo mb-1 block">Conciliar com</span>
                        <select
                          className="input w-full py-1.5 text-sm"
                          value={escolha}
                          disabled={processando || alvosDisponiveis.length === 0}
                          onChange={(e) =>
                            setEscolhas((atual) => ({ ...atual, [id]: e.target.value }))
                          }
                        >
                          <option value="">
                            {alvosDisponiveis.length === 0
                              ? "Nenhum título aguardando conciliação"
                              : "Selecione boleto ou pagamento RH…"}
                          </option>
                          {alvosDisponiveis.map((a) => (
                            <option key={a.valor} value={a.valor}>
                              {a.rotulo}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="text-xs text-slate-500">{textoConfianca(s.confianca, s.motivos)}</p>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {sugestoes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-primario"
                disabled={processando || idsSelecionados().length === 0 || titulosAguardando === 0}
                onClick={conciliarSelecionados}
                title={
                  titulosAguardando === 0
                    ? "Não há títulos em aguardando conciliação"
                    : "Conciliar débitos selecionados"
                }
              >
                {processando ? "Processando…" : "Conciliar selecionados"}
              </button>
              <button
                type="button"
                className="btn-secundario"
                disabled={processando || idsSelecionados().length === 0}
                onClick={ignorarSelecionados}
              >
                Ignorar selecionados
              </button>
            </div>
          )}
        </>
      ) : linhasFiltradas.length === 0 ? (
        <Vazio
          mensagem={
            filtro === "todas"
              ? "Nenhuma linha de extrato ainda. Importe um OFX ou CSV."
              : `Nenhuma linha ${filtro === "conciliadas" ? "conciliada" : "ignorada"} ainda.`
          }
        />
      ) : (
        <div className="space-y-2">
          {linhasFiltradas.map((linha) => {
            const alvoRotulo = rotuloAlvoConciliado(linha);
            return (
              <Card key={linha.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm font-semibold text-slate-900">{dataBR(linha.data)}</span>
                    <span className="text-sm font-bold text-slate-800">{moeda(Math.abs(linha.valor))}</span>
                    <span className="text-sm text-slate-600">{linha.descricao}</span>
                  </div>
                  {alvoRotulo && <p className="text-xs text-slate-500">→ {alvoRotulo}</p>}
                  {linha.observacao && <p className="text-xs text-slate-400">{linha.observacao}</p>}
                </div>
                <Badge cor={corStatus(linha.status)}>{rotuloStatus(linha.status)}</Badge>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
