"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpenCheck, ExternalLink, RefreshCw } from "lucide-react";
import { Badge, Card, TituloPagina, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import {
  antecedenciaMinimaDoDb,
  confirmarNorma,
  ignorarNorma,
  normasPendentes,
  rotuloParametroNorma,
  rotuloStatusNorma,
  verificarAtualizacoesNormas,
} from "@/lib/domain/normas-rh";
import { usePodeAcessarModulo, usePapel } from "@/lib/roles";
import { dataBR } from "@/lib/format";
import type { NormaRh } from "@/lib/types";

function BadgeRelevancia({ relevancia }: { relevancia: NormaRh["relevancia"] }) {
  const cor = relevancia === "alta" ? "vermelho" : relevancia === "media" ? "laranja" : "cinza";
  return <Badge cor={cor}>{relevancia}</Badge>;
}

function BadgeStatus({ status }: { status: NormaRh["status"] }) {
  const cor = status === "aplicada" ? "verde" : status === "ignorada" ? "cinza" : "azul";
  return <Badge cor={cor}>{rotuloStatusNorma(status)}</Badge>;
}

export default function RhNormasPage() {
  const db = useDB();
  const { papel } = usePapel();
  const podeRh = usePodeAcessarModulo("rh");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"pendente" | "todas">("pendente");

  const antecedencia = antecedenciaMinimaDoDb(db);
  const pendentes = useMemo(() => normasPendentes(db), [db]);
  const lista = useMemo(() => {
    const todas = [...(db.normas_rh ?? [])].sort((a, b) => b.detectado_em.localeCompare(a.detectado_em));
    return filtro === "pendente" ? todas.filter((n) => n.status === "pendente") : todas;
  }, [db.normas_rh, filtro]);

  if (!podeRh) {
    return (
      <div className="mx-auto max-w-lg">
        <TituloPagina titulo="Normas RH" />
        <Card className="py-10 text-center">
          <BookOpenCheck size={40} className="mx-auto text-slate-400" />
          <p className="mt-3 font-bold">Área restrita</p>
        </Card>
      </div>
    );
  }

  function verificar() {
    const proximo = structuredClone(db);
    const r = verificarAtualizacoesNormas(proximo, { idFactory: () => uid("norma") });
    mutate((atual) => Object.assign(atual, proximo));
    setErro(null);
    if (r.novas.length === 0) {
      setMensagem("Nenhuma publicação nova no catálogo demo. A fila já está atualizada.");
    } else {
      setMensagem(`${r.novas.length} norma(s) detectada(s) para revisão.`);
      setFiltro("pendente");
    }
  }

  function confirmar(id: string) {
    const proximo = structuredClone(db);
    const r = confirmarNorma(proximo, id, { revisado_por: papel ?? "usuario" });
    if (!r.sucesso) {
      setErro(r.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setErro(null);
    setMensagem(
      r.norma?.parametro
        ? `Norma aplicada: ${rotuloParametroNorma(r.norma.parametro)} agora é ${r.config?.antecedencia_minima_dias} dia(s).`
        : "Norma marcada como aplicada (sem parâmetro automático)."
    );
  }

  function ignorar(id: string) {
    const proximo = structuredClone(db);
    const r = ignorarNorma(proximo, id, { revisado_por: papel ?? "usuario" });
    if (!r.sucesso) {
      setErro(r.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setErro(null);
    setMensagem("Norma ignorada — configuração do sistema não mudou.");
  }

  return (
    <div>
      <TituloPagina
        titulo="Normas RH"
        subtitulo="O sistema detecta publicações relevantes; você confirma antes de qualquer mudança na escala."
        acao={
          <button type="button" className="btn-primario" onClick={verificar}>
            <RefreshCw size={16} /> Verificar agora
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/rh" className="btn-secundario">
          Pessoas
        </Link>
        <Link href="/rh/escala" className="btn-secundario">
          Escala
        </Link>
      </div>

      <Card className="mb-4 space-y-2 p-4">
        <p className="text-sm font-semibold text-slate-900">Configuração vigente</p>
        <p className="text-sm text-slate-700">
          Antecedência mínima de convocação: <strong>{antecedencia} dia(s)</strong> corridos
        </p>
        <p className="text-xs text-slate-500">
          Nesta fase a “varredura” usa um catálogo demo (DOU/eSocial simulados). Em produção, um job diário
          alimentaria a mesma fila — e só a confirmação aplica parâmetros mapeados.
        </p>
        {pendentes.length > 0 && (
          <p className="text-sm font-medium text-amber-800">
            {pendentes.length} norma(s) aguardando revisão.
          </p>
        )}
      </Card>

      {mensagem && (
        <p className="mb-3 rounded-card border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {mensagem}
        </p>
      )}
      {erro && (
        <p className="mb-3 rounded-card border border-erro bg-erro-clara px-3 py-2 text-sm font-medium text-erro">
          {erro}
        </p>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={filtro === "pendente" ? "btn-primario" : "btn-secundario"}
          onClick={() => setFiltro("pendente")}
        >
          Pendentes ({pendentes.length})
        </button>
        <button
          type="button"
          className={filtro === "todas" ? "btn-primario" : "btn-secundario"}
          onClick={() => setFiltro("todas")}
        >
          Todas
        </button>
      </div>

      {lista.length === 0 ? (
        <Vazio
          mensagem={
            filtro === "pendente"
              ? "Nenhuma norma pendente. Use Verificar agora para buscar no catálogo demo."
              : "Nenhuma norma registrada."
          }
        />
      ) : (
        <div className="grid gap-3">
          {lista.map((norma) => (
            <Card key={norma.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-bold text-slate-900">{norma.titulo}</p>
                  <p className="text-sm text-slate-600">
                    {norma.fonte}
                    {norma.publicado_em ? ` · publicado ${dataBR(norma.publicado_em)}` : ""}
                    {norma.vigencia_em ? ` · vigência ${dataBR(norma.vigencia_em)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <BadgeRelevancia relevancia={norma.relevancia} />
                  <BadgeStatus status={norma.status} />
                </div>
              </div>
              <p className="text-sm text-slate-700">{norma.resumo}</p>
              {norma.parametro && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Ao confirmar: {rotuloParametroNorma(norma.parametro)}
                  {norma.valor_anterior != null ? ` de ${norma.valor_anterior}` : ""}
                  {norma.valor_proposto != null ? ` → ${norma.valor_proposto}` : ""}
                </p>
              )}
              {norma.url_fonte && (
                <a
                  href={norma.url_fonte}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primaria-escura underline"
                >
                  Fonte oficial <ExternalLink size={14} />
                </a>
              )}
              {norma.status === "pendente" && (
                <div className="flex flex-wrap gap-2 border-t border-stone-200 pt-3">
                  <button type="button" className="btn-primario" onClick={() => confirmar(norma.id)}>
                    Confirmar{norma.parametro ? " e aplicar" : ""}
                  </button>
                  <button type="button" className="btn-secundario" onClick={() => ignorar(norma.id)}>
                    Ignorar
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
