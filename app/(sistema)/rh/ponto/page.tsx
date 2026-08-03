"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, Download, FileUp, Fingerprint, RefreshCw, Wifi } from "lucide-react";
import { Badge, Campo, Card, Modal, TituloPagina, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import { importarAfdNoDb } from "@/lib/domain/afd-ponto";
import { configControlIdPadrao, maiorNsrDoAfd } from "@/lib/domain/controlid-rep";
import {
  aprovarPendenciaPonto,
  avisoPontoHorasDoDb,
  competenciaDeData,
  detectarPendenciasPonto,
  garantirConfigRh,
  importarBatidasPonto,
  linkWhatsAppPonto,
  marcarAvisoPontoEnviado,
  montarEspelhoPonto,
  montarTextoAvisoPontoWhatsApp,
  pendenciasPontoAbertas,
  pendenciaAbertaNoDia,
  recusarPendenciaPonto,
  registrarPropostaPonto,
  resumirEspelhoPonto,
  exportarEspelhoCsv,
  formatarDuracaoHoras,
  rotuloOrigemBatidaPonto,
  rotuloStatusDiaEspelho,
  rotuloStatusPendenciaPonto,
  rotuloTipoFaltaPonto,
  toleranciaAtrasoMinutosDoDb,
} from "@/lib/domain/ponto-rh";
import type { StatusDiaEspelho } from "@/lib/domain/ponto-rh";
import { usePodeAcessarModulo, usePapel } from "@/lib/roles";
import { dataBR } from "@/lib/format";
import type { PendenciaPonto, StatusPendenciaPonto } from "@/lib/types";

function BadgeStatus({ status }: { status: StatusPendenciaPonto }) {
  const cor =
    status === "aprovada"
      ? "verde"
      : status === "proposta"
        ? "laranja"
        : status === "recusada" || status === "cancelada"
          ? "cinza"
          : "azul";
  return <Badge cor={cor}>{rotuloStatusPendenciaPonto(status)}</Badge>;
}

function BadgeEspelho({ status }: { status: StatusDiaEspelho }) {
  const cor =
    status === "ok"
      ? "verde"
      : status === "atraso" || status === "incompleto" || status === "sem_batida"
        ? "laranja"
        : "cinza";
  return <Badge cor={cor}>{rotuloStatusDiaEspelho(status)}</Badge>;
}

export default function RhPontoPage() {
  const db = useDB();
  const { papel } = usePapel();
  const podeRh = usePodeAcessarModulo("rh");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"abertas" | "todas">("abertas");
  const [aba, setAba] = useState<"pendencias" | "espelho">("pendencias");
  const [competenciaEspelho, setCompetenciaEspelho] = useState(() => competenciaDeData());
  const [pessoaEspelho, setPessoaEspelho] = useState<string>("");
  const [filtroEspelho, setFiltroEspelho] = useState<"todos" | StatusDiaEspelho>("todos");
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [propostaEntrada, setPropostaEntrada] = useState("");
  const [propostaSaida, setPropostaSaida] = useState("");
  const [propostaMotivo, setPropostaMotivo] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [importandoAfd, setImportandoAfd] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const inputAfdRef = useRef<HTMLInputElement>(null);

  const horasAviso = avisoPontoHorasDoDb(db);
  const toleranciaEspelho = toleranciaAtrasoMinutosDoDb(db);
  const [toleranciaMin, setToleranciaMin] = useState(String(toleranciaEspelho));
  const controlId = db.config_rh?.control_id ?? configControlIdPadrao();
  const [hostCid, setHostCid] = useState(controlId.host);
  const [loginCid, setLoginCid] = useState(controlId.login);
  const [senhaCid, setSenhaCid] = useState(controlId.password);
  const [mode671, setMode671] = useState(controlId.mode_671 !== false);
  const abertas = useMemo(() => pendenciasPontoAbertas(db), [db]);
  const lista = useMemo(() => {
    const todas = [...(db.pendencias_ponto ?? [])].sort((a, b) => b.data.localeCompare(a.data));
    return filtro === "abertas" ? todas.filter((p) => abertas.some((a) => a.id === p.id)) : todas;
  }, [abertas, db.pendencias_ponto, filtro]);

  const espelho = useMemo(
    () =>
      montarEspelhoPonto(db, {
        competencia: competenciaEspelho,
        pessoa_id: pessoaEspelho || undefined,
        tolerancia_atraso_minutos: toleranciaEspelho,
      }),
    [competenciaEspelho, db, pessoaEspelho, toleranciaEspelho]
  );

  const resumoEspelho = useMemo(() => resumirEspelhoPonto(espelho), [espelho]);

  const espelhoFiltrado = useMemo(
    () => (filtroEspelho === "todos" ? espelho : espelho.filter((d) => d.status === filtroEspelho)),
    [espelho, filtroEspelho]
  );

  const colaboradoresEspelho = useMemo(
    () =>
      (db.pessoas ?? [])
        .filter((p) => p.tipo === "colaborador" && p.ativo)
        .slice()
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [db.pessoas]
  );

  const detalhe = detalheId ? db.pendencias_ponto?.find((p) => p.id === detalheId) : undefined;
  const detalhePessoa = detalhe ? db.pessoas.find((p) => p.id === detalhe.pessoa_id) : undefined;

  if (!podeRh) {
    return (
      <div className="mx-auto max-w-lg">
        <TituloPagina titulo="Ponto" />
        <Card className="py-10 text-center">
          <Fingerprint size={40} className="mx-auto text-slate-400" />
          <p className="mt-3 font-bold">Área restrita</p>
        </Card>
      </div>
    );
  }

  function nomePessoa(id: string) {
    return db.pessoas.find((p) => p.id === id)?.nome ?? "—";
  }

  function detectar() {
    const proximo = structuredClone(db);
    const r = detectarPendenciasPonto(proximo, { idFactory: () => uid("pend-ponto") });
    mutate((atual) => Object.assign(atual, proximo));
    setErro(null);
    const partes = [
      r.criadas.length ? `${r.criadas.length} nova(s)` : null,
      r.canceladas.length ? `${r.canceladas.length} cancelada(s) (batida chegou)` : null,
    ].filter(Boolean);
    setMensagem(
      partes.length
        ? `Detecção: ${partes.join(" · ")}.`
        : "Nenhuma pendência nova. Escala CLT e batidas já estão alinhadas no prazo."
    );
    setFiltro("abertas");
    return { proximo, r };
  }

  function irParaPendenciaDoDia(pessoaId: string, data: string) {
    const jaAberta = pendenciaAbertaNoDia(db.pendencias_ponto ?? [], pessoaId, data);
    if (jaAberta) {
      setAba("pendencias");
      setFiltro("abertas");
      abrirDetalhe(jaAberta);
      setErro(null);
      return;
    }

    const { proximo, r } = detectar();
    const criada =
      r.criadas.find((p) => p.pessoa_id === pessoaId && p.data === data) ??
      pendenciaAbertaNoDia(proximo.pendencias_ponto ?? [], pessoaId, data);

    setAba("pendencias");
    setFiltro("abertas");
    if (criada) {
      abrirDetalhe(criada);
      setMensagem(`Pendência pronta para ${nomePessoa(pessoaId)} em ${dataBR(data)}.`);
    } else {
      setMensagem(
        "Ainda sem pendência para este dia (fora do prazo de aviso ou já resolvida). Confira a lista."
      );
    }
  }

  function simularImportRelogio() {
    const data = new Date();
    data.setDate(data.getDate() - 2);
    data.setHours(12, 0, 0, 0);
    const dia = data.toISOString().slice(0, 10);
    const proximo = structuredClone(db);
    const imp = importarBatidasPonto(
      proximo,
      [
        { pessoa_id: "pes-caixa", data: dia, hora: "09:02", tipo: "entrada" },
        { pessoa_id: "pes-caixa", data: dia, hora: "17:05", tipo: "saida" },
      ],
      { idFactory: () => uid("bat") }
    );
    const det = detectarPendenciasPonto(proximo, { idFactory: () => uid("pend-ponto") });
    mutate((atual) => Object.assign(atual, proximo));
    setErro(null);
    setMensagem(
      `Importação demo: ${imp.importadas} batida(s). Detecção: ${det.criadas.length} nova(s), ${det.canceladas.length} cancelada(s).`
    );
  }

  async function aoEscolherAfd(arquivo: File | null) {
    if (!arquivo) return;
    setImportandoAfd(true);
    setErro(null);
    setMensagem(null);
    try {
      const texto = await arquivo.text();
      const proximo = structuredClone(db);
      const imp = importarAfdNoDb(proximo, texto, { idFactory: () => uid("bat") });
      if (!imp.sucesso && imp.importadas === 0) {
        setErro(imp.erros.join(" ") || "Arquivo AFD sem marcações reconhecidas.");
        return;
      }
      const det = detectarPendenciasPonto(proximo, { idFactory: () => uid("pend-ponto") });
      mutate((atual) => Object.assign(atual, proximo));
      const avisos = imp.avisos.length ? ` ${imp.avisos[0]}` : "";
      setMensagem(
        `AFD (${imp.layoutDetectado}): ${imp.marcacoesLidas} marcação(ões), ${imp.importadas} batida(s) nova(s)` +
          (imp.semPessoa ? `, ${imp.semPessoa} CPF sem cadastro` : "") +
          `. Detecção: ${det.criadas.length} pendência(s).${avisos}`
      );
      setFiltro("abertas");
    } catch {
      setErro("Não foi possível ler o arquivo AFD.");
    } finally {
      setImportandoAfd(false);
      if (inputAfdRef.current) inputAfdRef.current.value = "";
    }
  }

  function salvarConfigControlId() {
    const proximo = structuredClone(db);
    garantirConfigRh(proximo);
    proximo.config_rh!.control_id = {
      ...(proximo.config_rh!.control_id ?? configControlIdPadrao()),
      host: hostCid.trim(),
      login: loginCid.trim() || "admin",
      password: senhaCid,
      mode_671: mode671,
    };
    proximo.config_rh!.atualizado_em = new Date().toISOString();
    mutate((atual) => Object.assign(atual, proximo));
    setMensagem("Configuração Control iD salva neste navegador.");
    setErro(null);
  }

  function salvarToleranciaEspelho() {
    const n = Number(toleranciaMin);
    if (!Number.isFinite(n) || n < 0 || n > 180) {
      setErro("Tolerância deve ser entre 0 e 180 minutos.");
      return;
    }
    const proximo = structuredClone(db);
    garantirConfigRh(proximo);
    proximo.config_rh!.tolerancia_atraso_minutos = Math.floor(n);
    proximo.config_rh!.atualizado_em = new Date().toISOString();
    mutate((atual) => Object.assign(atual, proximo));
    setToleranciaMin(String(Math.floor(n)));
    setMensagem(`Tolerância do espelho: ${Math.floor(n)} min.`);
    setErro(null);
  }

  async function sincronizarControlId() {
    setSincronizando(true);
    setErro(null);
    setMensagem(null);
    try {
      const res = await fetch("/api/rh/ponto/controlid-afd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: hostCid.trim(),
          login: loginCid.trim() || "admin",
          password: senhaCid,
          mode_671: mode671,
          initial_nsr: controlId.ultimo_nsr,
        }),
      });
      const data = (await res.json()) as {
        sucesso?: boolean;
        erros?: string[];
        afd_texto?: string;
      };
      if (!res.ok || !data.sucesso || !data.afd_texto) {
        setErro(data.erros?.join(" ") || "Falha ao sincronizar com o REP.");
        return;
      }
      const proximo = structuredClone(db);
      garantirConfigRh(proximo);
      const imp = importarAfdNoDb(proximo, data.afd_texto, { idFactory: () => uid("bat") });
      if (!imp.sucesso && imp.importadas === 0) {
        setErro(imp.erros.join(" ") || "AFD do REP sem marcações reconhecidas.");
        return;
      }
      const det = detectarPendenciasPonto(proximo, { idFactory: () => uid("pend-ponto") });
      const maior = maiorNsrDoAfd(data.afd_texto);
      proximo.config_rh!.control_id = {
        ...(proximo.config_rh!.control_id ?? configControlIdPadrao()),
        host: hostCid.trim(),
        login: loginCid.trim() || "admin",
        password: senhaCid,
        mode_671: mode671,
        ultimo_nsr: maior ?? proximo.config_rh!.control_id?.ultimo_nsr,
        ultima_sync_em: new Date().toISOString(),
      };
      proximo.config_rh!.atualizado_em = new Date().toISOString();
      mutate((atual) => Object.assign(atual, proximo));
      const avisos = imp.avisos.length ? ` ${imp.avisos[0]}` : "";
      setMensagem(
        `Sync Control iD (${imp.layoutDetectado}): ${imp.marcacoesLidas} marcação(ões), ${imp.importadas} nova(s)` +
          (maior != null ? ` · NSR até ${maior}` : "") +
          `. Detecção: ${det.criadas.length} pendência(s).${avisos}`
      );
      setFiltro("abertas");
    } catch {
      setErro(
        "Não foi possível conectar. O Next.js precisa rodar na mesma rede do REP (não use só Vercel)."
      );
    } finally {
      setSincronizando(false);
    }
  }

  function baixarEspelhoCsv() {
    const linhas = filtroEspelho === "todos" ? espelho : espelhoFiltrado;
    if (linhas.length === 0) {
      setErro("Nada para exportar neste filtro.");
      return;
    }
    const csv = exportarEspelhoCsv(linhas, nomePessoa);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `espelho-ponto-${competenciaEspelho}${filtroEspelho !== "todos" ? `-${filtroEspelho}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMensagem(`CSV baixado (${linhas.length} linha(s)).`);
    setErro(null);
  }

  function textoAviso(pendencia: PendenciaPonto) {
    const pessoa = db.pessoas.find((p) => p.id === pendencia.pessoa_id);
    if (!pessoa) return pendencia.texto_aviso ?? "";
    return (
      pendencia.texto_aviso ??
      montarTextoAvisoPontoWhatsApp({ pessoa, pendencia, horasAviso })
    );
  }

  async function copiarAviso(pendencia: PendenciaPonto) {
    const texto = textoAviso(pendencia);
    try {
      await navigator.clipboard.writeText(texto);
      const proximo = structuredClone(db);
      marcarAvisoPontoEnviado(proximo, pendencia.id, { texto });
      mutate((atual) => Object.assign(atual, proximo));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
      setMensagem("Aviso copiado. Pendência marcada como aguardando funcionário.");
      setErro(null);
    } catch {
      setErro("Não foi possível copiar.");
    }
  }

  function abrirWhatsApp(pendencia: PendenciaPonto) {
    const pessoa = db.pessoas.find((p) => p.id === pendencia.pessoa_id);
    const texto = textoAviso(pendencia);
    const url = linkWhatsAppPonto(pessoa?.telefone, texto);
    if (!url) {
      setErro("Cadastre o telefone da pessoa para abrir o WhatsApp.");
      return;
    }
    const proximo = structuredClone(db);
    marcarAvisoPontoEnviado(proximo, pendencia.id, { texto });
    mutate((atual) => Object.assign(atual, proximo));
    window.open(url, "_blank", "noopener,noreferrer");
    setMensagem("WhatsApp aberto. Aguardando resposta do funcionário.");
    setErro(null);
  }

  function abrirDetalhe(pendencia: PendenciaPonto) {
    setDetalheId(pendencia.id);
    setPropostaEntrada(pendencia.proposta_entrada ?? pendencia.horario_previsto_entrada ?? "");
    setPropostaSaida(pendencia.proposta_saida ?? pendencia.horario_previsto_saida ?? "");
    setPropostaMotivo(pendencia.proposta_motivo ?? "");
    setErro(null);
  }

  function salvarProposta() {
    if (!detalheId) return;
    const proximo = structuredClone(db);
    const r = registrarPropostaPonto(
      proximo,
      detalheId,
      { entrada: propostaEntrada, saida: propostaSaida, motivo: propostaMotivo },
    );
    if (!r.sucesso) {
      setErro(r.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setMensagem("Proposta registrada — confirme ou recuse.");
    setErro(null);
  }

  function aprovar() {
    if (!detalheId) return;
    const proximo = structuredClone(db);
    const r = aprovarPendenciaPonto(proximo, detalheId, {
      revisado_por: papel,
      idFactory: () => uid("bat"),
    });
    if (!r.sucesso) {
      setErro(r.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setDetalheId(null);
    setAba("espelho");
    setMensagem("Aprovado — batidas gravadas no espelho de ponto.");
    setErro(null);
  }

  function recusar() {
    if (!detalheId) return;
    const proximo = structuredClone(db);
    const r = recusarPendenciaPonto(proximo, detalheId, { revisado_por: papel });
    if (!r.sucesso) {
      setErro(r.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setDetalheId(null);
    setMensagem("Pendência recusada.");
    setErro(null);
  }

  return (
    <div>
      <TituloPagina
        titulo="Ponto"
        subtitulo={`Falta de digital: após ${horasAviso}h do fim do plantão, avisamos o funcionário; ele propõe o horário e o gestor confirma.`}
        acao={
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputAfdRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={(e) => void aoEscolherAfd(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="btn-secundario"
              disabled={sincronizando || !hostCid.trim()}
              onClick={() => void sincronizarControlId()}
            >
              <Wifi size={16} /> {sincronizando ? "Sincronizando…" : "Sincronizar Control iD"}
            </button>
            <button
              type="button"
              className="btn-secundario"
              disabled={importandoAfd}
              onClick={() => inputAfdRef.current?.click()}
            >
              <FileUp size={16} /> {importandoAfd ? "Importando…" : "Importar AFD"}
            </button>
            <button type="button" className="btn-secundario" onClick={simularImportRelogio}>
              Simular batidas
            </button>
            <button type="button" className="btn-primario" onClick={detectar}>
              <RefreshCw size={16} /> Detectar faltas
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

      <Card className="mb-4 space-y-3 p-4">
        <p className="text-sm font-semibold text-slate-900">REP Control iD (rede local)</p>
        <p className="text-xs text-slate-600">
          IP do relógio na rede do restaurante. A sincronização usa a API do Next.js nesta máquina
          (HTTPS com certificado próprio do REP). Em produção na nuvem, rode o app na LAN ou use
          importação de arquivo.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo rotulo="IP ou host">
            <input
              className="input"
              placeholder="192.168.0.129"
              value={hostCid}
              onChange={(e) => setHostCid(e.target.value)}
            />
          </Campo>
          <Campo rotulo="Login">
            <input className="input" value={loginCid} onChange={(e) => setLoginCid(e.target.value)} />
          </Campo>
          <Campo rotulo="Senha">
            <input
              className="input"
              type="password"
              value={senhaCid}
              onChange={(e) => setSenhaCid(e.target.value)}
              autoComplete="off"
            />
          </Campo>
          <Campo rotulo="Formato AFD">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={mode671} onChange={(e) => setMode671(e.target.checked)} />
              Portaria 671 (recomendado)
            </label>
          </Campo>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secundario" onClick={salvarConfigControlId}>
            Salvar config
          </button>
          {controlId.ultima_sync_em && (
            <span className="text-xs text-slate-500">
              Última sync: {new Date(controlId.ultima_sync_em).toLocaleString("pt-BR")}
              {controlId.ultimo_nsr != null ? ` · NSR ${controlId.ultimo_nsr}` : ""}
            </span>
          )}
        </div>
      </Card>

      <Card className="mb-4 space-y-2 p-4">
        <p className="text-sm font-semibold text-slate-900">Como funciona</p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>
            Configure o IP do REP e clique em <strong>Sincronizar Control iD</strong>, ou importe o
            arquivo AFD (pendrive / porta fiscal).
          </li>
          <li>Cruzamos com a escala CLT. Sem digital após {horasAviso}h → pendência.</li>
          <li>Avisamos no WhatsApp; o funcionário informa o horário.</li>
          <li>Você confirma — só então entra no espelho oficial.</li>
        </ol>
        {abertas.length > 0 && (
          <p className="text-sm font-medium text-amber-800">{abertas.length} pendência(s) aberta(s).</p>
        )}
      </Card>

      {mensagem && (
        <p className="mb-3 rounded-card border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {mensagem}
        </p>
      )}
      {erro && !detalheId && (
        <p className="mb-3 rounded-card border border-erro bg-erro-clara px-3 py-2 text-sm font-medium text-erro">
          {erro}
        </p>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={aba === "pendencias" ? "btn-primario" : "btn-secundario"}
          onClick={() => setAba("pendencias")}
        >
          Pendências ({abertas.length})
        </button>
        <button
          type="button"
          className={aba === "espelho" ? "btn-primario" : "btn-secundario"}
          onClick={() => setAba("espelho")}
        >
          Espelho
        </button>
      </div>

      {aba === "pendencias" && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={filtro === "abertas" ? "btn-primario" : "btn-secundario"}
              onClick={() => setFiltro("abertas")}
            >
              Abertas ({abertas.length})
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
                filtro === "abertas"
                  ? "Nenhuma pendência aberta. Clique em Detectar faltas (há plantão do João sem digital na seed)."
                  : "Nenhuma pendência registrada."
              }
            />
          ) : (
            <div className="grid gap-3">
              {lista.map((p) => (
                <Card key={p.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-bold text-slate-900">{nomePessoa(p.pessoa_id)}</p>
                      <p className="text-sm text-slate-600">
                        {dataBR(p.data)}
                        {p.horario_previsto_entrada && p.horario_previsto_saida
                          ? ` · previsto ${p.horario_previsto_entrada}–${p.horario_previsto_saida}`
                          : ""}
                      </p>
                      <p className="text-sm text-slate-500">{rotuloTipoFaltaPonto(p.tipo_falta)}</p>
                    </div>
                    <BadgeStatus status={p.status} />
                  </div>
                  {p.status === "proposta" && (
                    <p className="text-sm text-amber-900">
                      Proposta: {p.proposta_entrada ?? "—"} → {p.proposta_saida ?? "—"}
                      {p.proposta_motivo ? ` · ${p.proposta_motivo}` : ""}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-secundario" onClick={() => abrirDetalhe(p)}>
                      Abrir
                    </button>
                    {(p.status === "aguardando_aviso" || p.status === "aguardando_funcionario") && (
                      <>
                        <button type="button" className="btn-primario" onClick={() => abrirWhatsApp(p)}>
                          Avisar no WhatsApp
                        </button>
                        <button
                          type="button"
                          className="btn-secundario"
                          onClick={() => void copiarAviso(p)}
                        >
                          {copiado ? <Check size={16} /> : <Copy size={16} />} Copiar aviso
                        </button>
                      </>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {aba === "espelho" && (
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-sm text-slate-600 max-w-2xl">
                Cruza a escala (previsto) com as batidas oficiais (relógio / aprovação / manual). Dias
                com plantão e sem digital também aparecem. Atraso só conta acima da tolerância (
                {toleranciaEspelho} min).
              </p>
              <button
                type="button"
                className="btn-primario shrink-0"
                disabled={espelhoFiltrado.length === 0}
                onClick={baixarEspelhoCsv}
                title={
                  espelhoFiltrado.length === 0
                    ? "Não há linhas neste filtro/mês para exportar"
                    : "Baixar CSV do filtro atual"
                }
              >
                <Download size={16} /> Exportar CSV
                {espelhoFiltrado.length > 0 ? ` (${espelhoFiltrado.length})` : ""}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo rotulo="Competência">
                <input
                  className="input"
                  type="month"
                  value={competenciaEspelho}
                  onChange={(e) => setCompetenciaEspelho(e.target.value)}
                />
              </Campo>
              <Campo rotulo="Pessoa">
                <select
                  className="input"
                  value={pessoaEspelho}
                  onChange={(e) => setPessoaEspelho(e.target.value)}
                >
                  <option value="">Todas</option>
                  {colaboradoresEspelho.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Tolerância (min)">
                <div className="flex gap-2">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={180}
                    value={toleranciaMin}
                    onChange={(e) => setToleranciaMin(e.target.value)}
                  />
                  <button type="button" className="btn-secundario shrink-0" onClick={salvarToleranciaEspelho}>
                    Salvar
                  </button>
                </div>
              </Campo>
            </div>
          </Card>

          {espelho.length === 0 ? (
            <Vazio mensagem="Nenhum plantão nem batida neste mês. Monte a escala ou sincronize o REP." />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["todos", `Todos (${resumoEspelho.total})`],
                    ["ok", `OK (${resumoEspelho.ok})`],
                    ["atraso", `Atraso (${resumoEspelho.atraso})`],
                    ["incompleto", `Incompleto (${resumoEspelho.incompleto})`],
                    ["sem_batida", `Sem digital (${resumoEspelho.sem_batida})`],
                    ["sem_escala", `Sem escala (${resumoEspelho.sem_escala})`],
                  ] as const
                ).map(([id, rotulo]) => (
                  <button
                    key={id}
                    type="button"
                    className={filtroEspelho === id ? "btn-primario" : "btn-secundario"}
                    onClick={() => setFiltroEspelho(id)}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>

              <p className="text-sm text-slate-600">
                Horas no filtro: previsto{" "}
                <span className="font-semibold tabular-nums text-slate-900">
                  {formatarDuracaoHoras(
                    espelhoFiltrado.reduce((acc, d) => acc + (d.previsto_minutos ?? 0), 0)
                  )}
                </span>
                {" · "}
                realizado{" "}
                <span className="font-semibold tabular-nums text-slate-900">
                  {formatarDuracaoHoras(
                    espelhoFiltrado.reduce((acc, d) => acc + (d.realizado_minutos ?? 0), 0)
                  )}
                </span>
              </p>

              {espelhoFiltrado.length === 0 ? (
                <Vazio mensagem="Nenhum dia neste filtro." />
              ) : (
                <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Data</th>
                        <th className="px-3 py-2 font-semibold">Pessoa</th>
                        <th className="px-3 py-2 font-semibold">Previsto</th>
                        <th className="px-3 py-2 font-semibold">Realizado</th>
                        <th className="px-3 py-2 font-semibold">Horas</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 font-semibold">Origem</th>
                        <th className="px-3 py-2 font-semibold">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {espelhoFiltrado.map((dia) => {
                        const origens = Array.from(
                          new Set(dia.batidas.map((b) => rotuloOrigemBatidaPonto(b.origem)))
                        );
                        const detalheAtraso = [
                          dia.atraso_entrada_min != null && dia.atraso_entrada_min > 0
                            ? `+${dia.atraso_entrada_min} min entrada`
                            : null,
                          dia.saida_antecipada_min != null && dia.saida_antecipada_min > 0
                            ? `−${dia.saida_antecipada_min} min saída`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ");
                        return (
                          <tr key={`${dia.pessoa_id}-${dia.data}`} className="border-b border-slate-100">
                            <td className="px-3 py-2 whitespace-nowrap">{dataBR(dia.data)}</td>
                            <td className="px-3 py-2 font-medium text-slate-900">
                              {nomePessoa(dia.pessoa_id)}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-slate-600">
                              {dia.previsto_entrada && dia.previsto_saida
                                ? `${dia.previsto_entrada}–${dia.previsto_saida}`
                                : "—"}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {dia.entrada || dia.saida
                                ? `${dia.entrada ?? "—"}–${dia.saida ?? "—"}`
                                : "—"}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-slate-700">
                              <span className="text-slate-500">
                                {formatarDuracaoHoras(dia.previsto_minutos)}
                              </span>
                              <span className="mx-1 text-slate-300">/</span>
                              <span className="font-medium">
                                {formatarDuracaoHoras(dia.realizado_minutos)}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-col gap-0.5">
                                <BadgeEspelho status={dia.status} />
                                {detalheAtraso && (
                                  <span className="text-xs text-amber-800">{detalheAtraso}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {origens.length ? origens.join(", ") : "—"}
                            </td>
                            <td className="px-3 py-2">
                              {(dia.status === "sem_batida" || dia.status === "incompleto") && (
                                <button
                                  type="button"
                                  className="btn-secundario"
                                  onClick={() => irParaPendenciaDoDia(dia.pessoa_id, dia.data)}
                                >
                                  Pendência
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Modal
        aberto={Boolean(detalhe)}
        titulo="Pendência de ponto"
        onFechar={() => setDetalheId(null)}
        fecharAoClicarFundo={false}
      >
        {detalhe && detalhePessoa && (
          <div className="space-y-3">
            <div>
              <p className="text-lg font-bold">{detalhePessoa.nome}</p>
              <p className="text-sm text-slate-600">
                {dataBR(detalhe.data)} · {rotuloTipoFaltaPonto(detalhe.tipo_falta)}
              </p>
              <BadgeStatus status={detalhe.status} />
            </div>

            {(detalhe.status === "aguardando_aviso" ||
              detalhe.status === "aguardando_funcionario" ||
              detalhe.status === "proposta") && (
              <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
                <p className="text-sm font-semibold">Horário informado pelo funcionário</p>
                <p className="text-xs text-slate-500">
                  Na demo, o RH registra aqui a resposta do WhatsApp. Depois pode vir do app do funcionário.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(detalhe.tipo_falta === "entrada" || detalhe.tipo_falta === "ambos") && (
                    <Campo rotulo="Entrada">
                      <input
                        type="time"
                        className="campo"
                        value={propostaEntrada}
                        onChange={(e) => setPropostaEntrada(e.target.value)}
                      />
                    </Campo>
                  )}
                  {(detalhe.tipo_falta === "saida" || detalhe.tipo_falta === "ambos") && (
                    <Campo rotulo="Saída">
                      <input
                        type="time"
                        className="campo"
                        value={propostaSaida}
                        onChange={(e) => setPropostaSaida(e.target.value)}
                      />
                    </Campo>
                  )}
                </div>
                <Campo rotulo="Motivo">
                  <input
                    className="campo"
                    value={propostaMotivo}
                    onChange={(e) => setPropostaMotivo(e.target.value)}
                    placeholder="Esqueci de bater / relógio offline…"
                  />
                </Campo>
                <button type="button" className="btn-secundario" onClick={salvarProposta}>
                  Registrar proposta
                </button>
              </div>
            )}

            {detalhe.status === "proposta" && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primario" onClick={aprovar}>
                  Confirmar e gravar no espelho
                </button>
                <button type="button" className="btn-secundario text-destaque" onClick={recusar}>
                  Recusar
                </button>
              </div>
            )}

            {erro && (
              <p className="rounded-card border border-erro bg-erro-clara px-3 py-2 text-sm font-medium text-erro">
                {erro}
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
