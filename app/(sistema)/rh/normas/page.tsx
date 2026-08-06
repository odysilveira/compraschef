"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpenCheck, Download, ExternalLink, RefreshCw } from "lucide-react";
import { Badge, Card, TituloPagina, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import {
  antecedenciaMinimaDoDb,
  confirmarNorma,
  confirmarNormasPendentes,
  exportarNormasRhCsv,
  ignorarNorma,
  ignorarNormasPendentes,
  normasPendentes,
  rotuloParametroNorma,
  rotuloStatusNorma,
  verificarAtualizacoesNormas,
} from "@/lib/domain/normas-rh";
import {
  hrefNormasRh,
  parseFiltroNormasRh,
  type FiltroNormasRh,
} from "@/lib/domain/resumo-rh";
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

function RhNormasConteudo() {
  const db = useDB();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { papel } = usePapel();
  const podeRh = usePodeAcessarModulo("rh");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroNormasRh>(() =>
    parseFiltroNormasRh(searchParams.get("filtro"))
  );

  useEffect(() => {
    setFiltro(parseFiltroNormasRh(searchParams.get("filtro")));
  }, [searchParams]);

  function irParaFiltro(proximo: FiltroNormasRh) {
    setFiltro(proximo);
    router.replace(hrefNormasRh(proximo));
  }

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
      irParaFiltro("pendente");
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

  function confirmarTodasPendentes() {
    const ids = pendentes.map((n) => n.id);
    if (ids.length === 0) {
      setMensagem("Nenhuma norma pendente para confirmar.");
      return;
    }
    const proximo = structuredClone(db);
    const r = confirmarNormasPendentes(proximo, ids, {
      revisado_por: papel ?? "usuario",
    });
    mutate((atual) => Object.assign(atual, proximo));
    setErro(r.erros.length ? r.erros.join(" ") : null);
    setMensagem(
      r.confirmadas > 0
        ? `${r.confirmadas} norma(s) confirmada(s)${
            r.erros.length ? ` · ${r.erros.length} com erro` : ""
          }. Antecedência vigente: ${antecedenciaMinimaDoDb(proximo)} dia(s).`
        : r.erros.join(" ") || "Nenhuma norma confirmada."
    );
    irParaFiltro("pendente");
  }

  function ignorarTodasPendentes() {
    const ids = pendentes.map((n) => n.id);
    if (ids.length === 0) {
      setMensagem("Nenhuma norma pendente para ignorar.");
      return;
    }
    const proximo = structuredClone(db);
    const r = ignorarNormasPendentes(proximo, ids, {
      revisado_por: papel ?? "usuario",
    });
    mutate((atual) => Object.assign(atual, proximo));
    setErro(r.erros.length ? r.erros.join(" ") : null);
    setMensagem(
      r.ignoradas > 0
        ? `${r.ignoradas} norma(s) ignorada(s) — configuração não mudou.`
        : r.erros.join(" ") || "Nenhuma norma ignorada."
    );
    irParaFiltro("pendente");
  }

  function baixarNormasCsv() {
    if (lista.length === 0) {
      setMensagem("Nenhuma norma neste filtro para exportar.");
      return;
    }
    const csv = exportarNormasRhCsv(lista);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rh-normas-${filtro}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMensagem(`CSV baixado (${lista.length} norma(s)).`);
    setErro(null);
  }

  return (
    <div>
      <TituloPagina
        titulo="Normas RH"
        subtitulo="O sistema detecta publicações relevantes; você confirma antes de qualquer mudança na escala."
        acao={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secundario"
              onClick={baixarNormasCsv}
              disabled={lista.length === 0}
              title={
                lista.length === 0
                  ? "Nenhuma norma neste filtro"
                  : "Exportar normas do filtro atual (CSV)"
              }
            >
              <Download size={16} /> Exportar CSV
            </button>
            <button type="button" className="btn-primario" onClick={verificar}>
              <RefreshCw size={16} /> Verificar agora
            </button>
          </div>
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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={filtro === "pendente" ? "btn-primario" : "btn-secundario"}
          onClick={() => irParaFiltro("pendente")}
        >
          Pendentes ({pendentes.length})
        </button>
        <button
          type="button"
          className={filtro === "todas" ? "btn-primario" : "btn-secundario"}
          onClick={() => irParaFiltro("todas")}
        >
          Todas
        </button>
        {filtro === "pendente" && pendentes.length > 0 && (
          <>
            <button
              type="button"
              className="btn-primario"
              onClick={confirmarTodasPendentes}
              title="Confirma todas as pendentes e aplica parâmetros mapeados"
            >
              Confirmar todas ({pendentes.length})
            </button>
            <button
              type="button"
              className="btn-secundario"
              onClick={ignorarTodasPendentes}
              title="Ignora todas sem alterar a configuração"
            >
              Ignorar todas ({pendentes.length})
            </button>
          </>
        )}
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
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primaria-escura underline"
                >
                  <ExternalLink size={14} /> Fonte
                </a>
              )}
              {norma.status === "pendente" && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-primario" onClick={() => confirmar(norma.id)}>
                    Confirmar
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

export default function RhNormasPage() {
  return (
    <Suspense
      fallback={
        <div>
          <TituloPagina titulo="Normas RH" subtitulo="Carregando…" />
          <p className="text-sm text-slate-500">Carregando normas…</p>
        </div>
      }
    >
      <RhNormasConteudo />
    </Suspense>
  );
}
