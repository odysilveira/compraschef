"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleCheckBig, Copy, Download, FileUp, Plus, TriangleAlert, WalletCards } from "lucide-react";
import { Badge, Campo, Card, Modal, TituloPagina, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import {
  TIPOS_PAGAMENTO_PESSOA,
  conciliarPagamentoPessoa,
  exportarPagamentosPessoasCsv,
  gerarFolhaCltMes,
  informarPagamentoPessoa,
  informarPagamentosLiberados,
  liberarPagamentoPessoa,
  liberarPagamentosPrevistos,
  conciliarPagamentosAguardando,
  registrarDivergenciaPagamentoPessoa,
  rotuloStatusPagamentoPessoa,
  rotuloTipoPagamentoPessoa,
} from "@/lib/domain/pagamentos-pessoas";
import {
  montarTextoConfirmacaoRecebimento,
  montarTextoReciboPagamentoPessoa,
} from "@/lib/domain/recibo-pagamento-pessoa";
import {
  aplicarDescontosNoPagamento,
  pagamentoUsaConsumoDiario,
  previewFechamentoIntermitente,
  previewFechamentoSalario,
  validarAdiantamento,
} from "@/lib/domain/consumos-pessoas";
import {
  criarPagamentosDaFolha,
  parseRecibosFolhaTexto,
  vincularRecibosAPessoas,
  type ReciboFolhaVinculado,
} from "@/lib/domain/folha-recibo-pdf";
import { extrairTextoPdfBrowser } from "@/lib/domain/folha-recibo-pdf-browser";
import { contaPadraoOrigem } from "@/lib/domain/contas-pagamento";
import { SeletorContaOrigem } from "@/components/financeiro/SeletorContaOrigem";
import {
  hrefConsumosRh,
  hrefPagamentosRh,
  parseCompetenciaPagamentosRh,
  parseFiltroPagamentosRh,
  parsePessoaPontoRh,
  parseTipoPagamentosRh,
  type FiltroPagamentosRh,
  type FiltroTipoPagamentosRh,
} from "@/lib/domain/resumo-rh";
import { hrefPerfilRh } from "@/lib/domain/rh";
import { usePodeAcessarModulo } from "@/lib/roles";
import { dataBR, moeda } from "@/lib/format";
import type { PagamentoPessoa, TipoPagamentoPessoa } from "@/lib/types";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function competenciaAtual(): string {
  return hojeISO().slice(0, 7);
}

type FormNovo = {
  pessoa_id: string;
  tipo: TipoPagamentoPessoa;
  descricao: string;
  competencia: string;
  vencimento: string;
  valor: string;
  horas: string;
  valor_hora: string;
};

type FormInformar = {
  dataPagamento: string;
  valorPago: string;
  bancoConta: string;
  responsavel: string;
  observacao: string;
};

function formNovoVazio(pessoaId = ""): FormNovo {
  return {
    pessoa_id: pessoaId,
    tipo: "salario",
    descricao: "",
    competencia: competenciaAtual(),
    vencimento: hojeISO(),
    valor: "",
    horas: "",
    valor_hora: "",
  };
}

function BadgeStatusPagamento({ pagamento }: { pagamento: PagamentoPessoa }) {
  const cor =
    pagamento.status === "pago"
      ? "verde"
      : pagamento.status === "aguardando_conciliacao"
        ? "azul"
        : pagamento.status === "liberado"
          ? "laranja"
          : "cinza";
  return <Badge cor={cor}>{rotuloStatusPagamentoPessoa(pagamento.status)}</Badge>;
}

function RhPagamentosConteudo() {
  const db = useDB();
  const router = useRouter();
  const searchParams = useSearchParams();
  const podeRh = usePodeAcessarModulo("rh");
  const [filtro, setFiltro] = useState<FiltroPagamentosRh>(() =>
    parseFiltroPagamentosRh(searchParams.get("filtro"))
  );
  const [filtroPessoa, setFiltroPessoa] = useState<string>(() => {
    const pessoa = parsePessoaPontoRh(searchParams.get("pessoa"));
    return pessoa || "todos";
  });
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipoPagamentosRh>(() =>
    parseTipoPagamentosRh(searchParams.get("tipo"))
  );
  const [filtroCompetencia, setFiltroCompetencia] = useState<string>(() =>
    parseCompetenciaPagamentosRh(searchParams.get("competencia"))
  );
  const [formNovo, setFormNovo] = useState<FormNovo | null>(null);
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const [informarId, setInformarId] = useState<string | null>(null);
  const [informarLoteAberto, setInformarLoteAberto] = useState(false);
  const [formInformar, setFormInformar] = useState<FormInformar>({
    dataPagamento: hojeISO(),
    valorPago: "",
    bancoConta: "",
    responsavel: "usuário local",
    observacao: "",
  });
  const [erroInformar, setErroInformar] = useState<string | null>(null);

  const [conciliarId, setConciliarId] = useState<string | null>(null);
  const [dataLiquidacao, setDataLiquidacao] = useState(hojeISO());
  const [erroConciliar, setErroConciliar] = useState<string | null>(null);

  const [divergenciaId, setDivergenciaId] = useState<string | null>(null);
  const [motivoDivergencia, setMotivoDivergencia] = useState("");
  const [erroDivergencia, setErroDivergencia] = useState<string | null>(null);

  const [importAberto, setImportAberto] = useState(false);
  const [importPasso, setImportPasso] = useState<"arquivo" | "revisao">("arquivo");
  const [importLinhas, setImportLinhas] = useState<ReciboFolhaVinculado[]>([]);
  const [importCarregando, setImportCarregando] = useState(false);
  const [erroImport, setErroImport] = useState<string | null>(null);
  const [vencimentoImport, setVencimentoImport] = useState(hojeISO());

  useEffect(() => {
    setFiltro(parseFiltroPagamentosRh(searchParams.get("filtro")));
    setFiltroCompetencia(parseCompetenciaPagamentosRh(searchParams.get("competencia")));
    setFiltroTipo(parseTipoPagamentosRh(searchParams.get("tipo")));
    const pessoaUrl = parsePessoaPontoRh(searchParams.get("pessoa"));
    if (!pessoaUrl) {
      setFiltroPessoa("todos");
      return;
    }
    const existe = (db.pessoas ?? []).some((p) => p.id === pessoaUrl);
    setFiltroPessoa(existe ? pessoaUrl : "todos");
  }, [db.pessoas, searchParams]);

  function irParaFiltros(
    proximoFiltro: FiltroPagamentosRh,
    proximaPessoa: string = filtroPessoa,
    proximaCompetencia: string = filtroCompetencia,
    proximoTipo: FiltroTipoPagamentosRh = filtroTipo
  ) {
    setFiltro(proximoFiltro);
    setFiltroPessoa(proximaPessoa);
    setFiltroCompetencia(proximaCompetencia);
    setFiltroTipo(proximoTipo);
    router.replace(
      hrefPagamentosRh({
        filtro: proximoFiltro,
        pessoa: proximaPessoa !== "todos" ? proximaPessoa : undefined,
        competencia: proximaCompetencia.trim() || undefined,
        tipo: proximoTipo,
      }),
      { scroll: false }
    );
  }

  function irParaFiltro(proximo: FiltroPagamentosRh) {
    irParaFiltros(proximo);
  }

  function aoMudarFiltroPessoa(proximaPessoa: string) {
    irParaFiltros(filtro, proximaPessoa);
  }

  function aoMudarFiltroCompetencia(proximaCompetencia: string) {
    irParaFiltros(filtro, filtroPessoa, proximaCompetencia);
  }

  function aoMudarFiltroTipo(proximoTipo: FiltroTipoPagamentosRh) {
    irParaFiltros(filtro, filtroPessoa, filtroCompetencia, proximoTipo);
  }
  const pessoasAtivas = useMemo(
    () => (db.pessoas ?? []).filter((p) => p.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [db.pessoas]
  );

  const nomePessoa = (id: string) => db.pessoas.find((p) => p.id === id)?.nome ?? "—";

  const lista = useMemo(() => {
    const todos = [...(db.pagamentos_pessoas ?? [])];
    const filtrados = todos.filter((p) => {
      if (filtro === "aguardando" && p.status !== "aguardando_conciliacao") return false;
      if (filtro === "pagos" && p.status !== "pago") return false;
      if (filtro === "previsto" && p.status !== "previsto") return false;
      if (filtro === "liberado" && p.status !== "liberado") return false;
      if (
        filtro === "abertos" &&
        p.status !== "previsto" &&
        p.status !== "liberado" &&
        p.status !== "aguardando_conciliacao"
      ) {
        return false;
      }
      if (filtroPessoa !== "todos" && p.pessoa_id !== filtroPessoa) return false;
      if (filtroTipo !== "todos" && p.tipo !== filtroTipo) return false;
      if (filtroCompetencia.trim() && (p.competencia ?? "") !== filtroCompetencia.trim()) return false;
      return true;
    });
    return filtrados.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  }, [db.pagamentos_pessoas, filtro, filtroCompetencia, filtroPessoa, filtroTipo]);

  const totais = useMemo(() => {
    const itens = db.pagamentos_pessoas ?? [];
    return {
      aguardando: itens.filter((p) => p.status === "aguardando_conciliacao").reduce((s, p) => s + (p.pagamento_valor ?? p.valor), 0),
      pagos: itens.filter((p) => p.status === "pago").reduce((s, p) => s + (p.pagamento_valor ?? p.valor), 0),
      abertos: itens
        .filter((p) => p.status === "previsto" || p.status === "liberado")
        .reduce((s, p) => s + p.valor, 0),
    };
  }, [db.pagamentos_pessoas]);

  const previewNovo = useMemo(() => {
    if (!formNovo?.pessoa_id) return null;
    const bruto = Number(formNovo.valor.replace(",", "."));
    if (!Number.isFinite(bruto) || bruto <= 0) return null;
    if (formNovo.tipo === "salario") {
      return previewFechamentoSalario(db, formNovo.pessoa_id, formNovo.competencia || competenciaAtual(), bruto);
    }
    if (pagamentoUsaConsumoDiario(formNovo.tipo)) {
      return previewFechamentoIntermitente(db, formNovo.pessoa_id, bruto);
    }
    return null;
  }, [db, formNovo]);

  if (!podeRh) {
    return (
      <div className="mx-auto max-w-lg">
        <TituloPagina titulo="Pagamentos de pessoas" />
        <Card className="py-10 text-center">
          <WalletCards size={40} className="mx-auto text-slate-400" />
          <p className="mt-3 font-bold">Área restrita</p>
        </Card>
      </div>
    );
  }

  function salvarNovo(e: FormEvent) {
    e.preventDefault();
    if (!formNovo) return;
    if (!formNovo.pessoa_id) {
      setErroNovo("Selecione a pessoa.");
      return;
    }
    const pessoa = db.pessoas.find((p) => p.id === formNovo.pessoa_id);
    const valorBruto = Number(formNovo.valor.replace(",", "."));
    if (!Number.isFinite(valorBruto) || valorBruto <= 0) {
      setErroNovo("Informe um valor válido.");
      return;
    }

    if (formNovo.tipo === "adiantamento") {
      const checagem = validarAdiantamento(pessoa?.salario, valorBruto);
      if (!checagem.ok) {
        setErroNovo(checagem.erros.join(" "));
        return;
      }
    }

    const agora = new Date().toISOString();
    const horas = formNovo.horas ? Number(formNovo.horas.replace(",", ".")) : undefined;
    const valorHora = formNovo.valor_hora ? Number(formNovo.valor_hora.replace(",", ".")) : undefined;
    const competencia = formNovo.competencia || undefined;

    mutate((banco) => {
      const id = uid("pagp");
      const pagamento: PagamentoPessoa = {
        id,
        pessoa_id: formNovo.pessoa_id,
        tipo: formNovo.tipo,
        descricao: formNovo.descricao.trim() || undefined,
        competencia,
        vencimento: formNovo.vencimento,
        valor: Number(valorBruto.toFixed(2)),
        valor_bruto: Number(valorBruto.toFixed(2)),
        horas: Number.isFinite(horas) ? horas : undefined,
        valor_hora: Number.isFinite(valorHora) ? valorHora : undefined,
        status: "previsto",
        criado_em: agora,
        atualizado_em: agora,
      };
      banco.pagamentos_pessoas.push(pagamento);

      if (formNovo.tipo === "salario" || pagamentoUsaConsumoDiario(formNovo.tipo)) {
        aplicarDescontosNoPagamento(banco, id);
      }
    });
    setFormNovo(null);
    setErroNovo(null);
    setMensagem("Pagamento lançado como previsto.");
  }

  function aoMudarPessoaOuTipo(pessoaId: string, tipo: TipoPagamentoPessoa) {
    if (!formNovo) return;
    const pessoa = db.pessoas.find((p) => p.id === pessoaId);
    let valor = formNovo.valor;
    let valorHora = formNovo.valor_hora;
    let horas = formNovo.horas;

    if (tipo === "adiantamento" && pessoa?.adiantamento_valor != null) {
      valor = pessoa.adiantamento_valor.toFixed(2);
    } else if (tipo === "salario" && pessoa?.salario != null) {
      valor = pessoa.salario.toFixed(2);
    } else if (pagamentoUsaConsumoDiario(tipo) && pessoa?.valor_hora != null && !formNovo.valor) {
      valorHora = pessoa.valor_hora.toFixed(2);
    }

    setFormNovo({
      ...formNovo,
      pessoa_id: pessoaId,
      tipo,
      valor,
      valor_hora: valorHora,
      horas,
    });
  }

  function abrirInformar(pagamento: PagamentoPessoa) {
    setInformarLoteAberto(false);
    setInformarId(pagamento.id);
    setFormInformar({
      dataPagamento: hojeISO(),
      valorPago: pagamento.valor.toFixed(2),
      bancoConta: contaPadraoOrigem(db),
      responsavel: "usuário local",
      observacao: "",
    });
    setErroInformar(null);
  }

  function abrirInformarLote() {
    const liberados = lista.filter((p) => p.status === "liberado");
    if (liberados.length === 0) {
      setMensagem("Nenhum pagamento liberado neste filtro.");
      return;
    }
    setInformarId(null);
    setInformarLoteAberto(true);
    setFormInformar({
      dataPagamento: hojeISO(),
      valorPago: "",
      bancoConta: contaPadraoOrigem(db),
      responsavel: "usuário local",
      observacao: "",
    });
    setErroInformar(null);
  }

  function confirmarInformar(e: FormEvent) {
    e.preventDefault();
    if (!informarId) return;
    const valorPago = Number(formInformar.valorPago.replace(",", "."));
    const proximo = structuredClone(db);
    const resultado = informarPagamentoPessoa(proximo, informarId, {
      dataPagamento: formInformar.dataPagamento,
      valorPago,
      bancoConta: formInformar.bancoConta,
      responsavel: formInformar.responsavel,
      observacao: formInformar.observacao,
    });
    if (!resultado.sucesso) {
      setErroInformar(resultado.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setInformarId(null);
    setMensagem("Pagamento informado. Aguardando conciliação bancária.");
  }

  function confirmarInformarLote(e: FormEvent) {
    e.preventDefault();
    const ids = lista.filter((p) => p.status === "liberado").map((p) => p.id);
    if (ids.length === 0) {
      setErroInformar("Nenhum pagamento liberado neste filtro.");
      return;
    }
    const proximo = structuredClone(db);
    const r = informarPagamentosLiberados(proximo, ids, {
      dataPagamento: formInformar.dataPagamento,
      bancoConta: formInformar.bancoConta,
      responsavel: formInformar.responsavel,
      observacao: formInformar.observacao,
    });
    mutate((atual) => Object.assign(atual, proximo));
    setInformarLoteAberto(false);
    if (r.informados > 0) {
      setMensagem(
        `${r.informados} pagamento(s) informado(s). Aguardando conciliação bancária.`
      );
      irParaFiltro("aguardando");
    }
    if (r.erros.length) {
      setMensagem(
        (r.informados > 0 ? `${r.informados} informado(s). ` : "") + r.erros.join(" ")
      );
    }
  }

  function confirmarConciliar(e: FormEvent) {
    e.preventDefault();
    if (!conciliarId) return;
    const proximo = structuredClone(db);
    const resultado = conciliarPagamentoPessoa(proximo, conciliarId, {
      dataLiquidacao,
      responsavel: "usuário local",
    });
    if (!resultado.sucesso) {
      setErroConciliar(resultado.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setConciliarId(null);
    setMensagem("Pagamento conciliado e marcado como pago.");
  }

  function confirmarDivergencia(e: FormEvent) {
    e.preventDefault();
    if (!divergenciaId) return;
    const proximo = structuredClone(db);
    const resultado = registrarDivergenciaPagamentoPessoa(proximo, divergenciaId, {
      motivo: motivoDivergencia,
      responsavel: "usuário local",
    });
    if (!resultado.sucesso) {
      setErroDivergencia(resultado.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setDivergenciaId(null);
    setMotivoDivergencia("");
    setMensagem("Divergência registrada. Segue aguardando conciliação.");
  }

  async function copiarRecibo(pagamento: PagamentoPessoa, variante: "recibo" | "confirmacao" = "recibo") {
    const pessoa = db.pessoas.find((p) => p.id === pagamento.pessoa_id);
    if (!pessoa) {
      setMensagem("Pessoa do pagamento não encontrada.");
      return;
    }
    const texto =
      variante === "confirmacao"
        ? montarTextoConfirmacaoRecebimento({ pessoa, pagamento })
        : montarTextoReciboPagamentoPessoa({
            pessoa,
            pagamento,
            consumos: db.consumos_pessoas ?? [],
          });
    try {
      await navigator.clipboard.writeText(texto);
      setMensagem(
        variante === "confirmacao"
          ? "Texto de confirmação copiado — envie para a pessoa responder no WhatsApp."
          : "Recibo discriminado copiado — pode colar no WhatsApp ou arquivar."
      );
    } catch {
      setMensagem("Não foi possível copiar neste navegador.");
    }
  }

  function abrirImportacao() {
    setImportAberto(true);
    setImportPasso("arquivo");
    setImportLinhas([]);
    setErroImport(null);
    setVencimentoImport(hojeISO());
  }

  async function onArquivoFolha(file: File | null) {
    if (!file) return;
    setImportCarregando(true);
    setErroImport(null);
    try {
      const buffer = await file.arrayBuffer();
      const texto = await extrairTextoPdfBrowser(buffer);
      const recibos = parseRecibosFolhaTexto(texto);
      if (recibos.length === 0) {
        setErroImport("Não encontrei recibos neste PDF. Confira se é o arquivo de Recibos de Salários do contador.");
        return;
      }
      const vinculados = vincularRecibosAPessoas(recibos, db.pessoas ?? [], db.pagamentos_pessoas ?? []);
      setImportLinhas(vinculados);
      setImportPasso("revisao");
    } catch (err) {
      setErroImport(err instanceof Error ? err.message : "Falha ao ler o PDF.");
    } finally {
      setImportCarregando(false);
    }
  }

  function atualizarLinhaImport(idx: number, patch: Partial<ReciboFolhaVinculado>) {
    setImportLinhas((atual) =>
      atual.map((linha, i) => {
        if (i !== idx) return linha;
        const proxima = { ...linha, ...patch };
        if (patch.pessoa_id !== undefined) {
          const pessoa = db.pessoas.find((p) => p.id === patch.pessoa_id);
          proxima.pessoa_nome = pessoa?.nome;
          proxima.alerta = pessoa
            ? proxima.ja_existe
              ? "Já existe pagamento igual nesta competência."
              : undefined
            : "Pessoa não encontrada — selecione manualmente.";
        }
        return proxima;
      })
    );
  }

  function confirmarImportacao() {
    const selecionadas = importLinhas.filter((l) => l.selecionado);
    if (selecionadas.length === 0) {
      setErroImport("Selecione ao menos um recibo para importar.");
      return;
    }
    let resultado = { criados: 0, ignorados: 0, erros: [] as string[] };
    mutate((banco) => {
      resultado = criarPagamentosDaFolha(banco, importLinhas, {
        vencimento: vencimentoImport,
        idFactory: () => uid("pagp"),
      });
    });
    setImportAberto(false);
    setImportLinhas([]);
    setMensagem(
      `Folha importada: ${resultado.criados} pagamento(s) criado(s)${
        resultado.ignorados ? ` · ${resultado.ignorados} ignorado(s)` : ""
      }.`
    );
  }

  function gerarFolhaMes() {
    const competencia = competenciaAtual();
    const proximo = structuredClone(db);
    const r = gerarFolhaCltMes(proximo, competencia, { idFactory: () => uid("pagp") });
    if (!r.sucesso) {
      setMensagem(r.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    irParaFiltros("abertos", filtroPessoa, competencia, "salario");
    const avisos = r.avisos.length ? ` ${r.avisos.join(" ")}` : "";
    setMensagem(
      `Folha ${competencia}: ${r.criados} salário(s) criado(s)${
        r.pulados ? ` · ${r.pulados} já existia(m)` : ""
      }.${avisos}`
    );
  }

  function baixarPagamentosCsv() {
    if (lista.length === 0) {
      setMensagem("Nenhum pagamento neste filtro para exportar.");
      return;
    }
    const csv = exportarPagamentosPessoasCsv(lista, nomePessoa);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const sufixoPessoa = filtroPessoa !== "todos" ? `-${filtroPessoa}` : "";
    a.download = `rh-pagamentos-${filtro}${sufixoPessoa}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMensagem(`CSV baixado (${lista.length} pagamento(s)).`);
  }

  function liberarTodosPrevistosDaLista() {
    const ids = lista.filter((p) => p.status === "previsto").map((p) => p.id);
    if (ids.length === 0) {
      setMensagem("Nenhum pagamento previsto neste filtro.");
      return;
    }
    const proximo = structuredClone(db);
    const r = liberarPagamentosPrevistos(proximo, ids);
    mutate((atual) => Object.assign(atual, proximo));
    if (r.liberados > 0) {
      setMensagem(
        `${r.liberados} pagamento(s) liberado(s). Agora dá para informar o pagamento.`
      );
      irParaFiltro("liberado");
    }
    if (r.erros.length) {
      setMensagem(
        (r.liberados > 0 ? `${r.liberados} liberado(s). ` : "") + r.erros.join(" ")
      );
    }
  }

  function conciliarTodosAguardandoDaLista() {
    const ids = lista
      .filter((p) => p.status === "aguardando_conciliacao")
      .map((p) => p.id);
    if (ids.length === 0) {
      setMensagem("Nenhum pagamento aguardando conciliação neste filtro.");
      return;
    }
    const proximo = structuredClone(db);
    const r = conciliarPagamentosAguardando(
      proximo,
      ids,
      { dataLiquidacao: hojeISO(), responsavel: "usuário local" }
    );
    mutate((atual) => Object.assign(atual, proximo));
    if (r.conciliados > 0) {
      setMensagem(`${r.conciliados} pagamento(s) conciliado(s) e marcado(s) como pago.`);
      irParaFiltro("pagos");
    }
    if (r.erros.length) {
      setMensagem(
        (r.conciliados > 0 ? `${r.conciliados} conciliado(s). ` : "") + r.erros.join(" ")
      );
    }
  }

  const pagamentoInformar = informarId ? db.pagamentos_pessoas.find((p) => p.id === informarId) : null;
  const pagamentoConciliar = conciliarId ? db.pagamentos_pessoas.find((p) => p.id === conciliarId) : null;
  const pagamentoDivergencia = divergenciaId ? db.pagamentos_pessoas.find((p) => p.id === divergenciaId) : null;

  return (
    <div>
      <TituloPagina
        titulo="Pagamentos de pessoas"
        subtitulo="Informar pagamento ≠ pago. A baixa definitiva depende da conciliação bancária."
        acao={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secundario"
              disabled={lista.length === 0}
              onClick={baixarPagamentosCsv}
              title={
                lista.length === 0
                  ? "Nada para exportar neste filtro"
                  : "Exportar pagamentos do filtro atual (CSV)"
              }
            >
              <Download size={16} /> Exportar CSV
              {lista.length > 0 ? ` (${lista.length})` : ""}
            </button>
            <button type="button" className="btn-secundario" onClick={gerarFolhaMes}>
              Gerar folha do mês
            </button>
            <button type="button" className="btn-secundario" onClick={abrirImportacao}>
              <FileUp size={16} /> Importar folha PDF
            </button>
            <button type="button" className="btn-primario" onClick={() => setFormNovo(formNovoVazio(pessoasAtivas[0]?.id ?? ""))}>
              <Plus size={16} /> Novo pagamento
            </button>
          </div>
        }
      />

      {mensagem && (
        <div className="mb-4 rounded-card border border-sucesso bg-sucesso-clara px-4 py-3 text-sm font-medium text-primaria-escura">
          {mensagem}
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="py-3">
          <p className="rotulo">Abertos</p>
          <p className="text-xl font-bold">{moeda(totais.abertos)}</p>
        </Card>
        <Card className="py-3">
          <p className="rotulo text-blue-700">Aguardando conciliação</p>
          <p className="text-xl font-bold text-blue-700">{moeda(totais.aguardando)}</p>
        </Card>
        <Card className="py-3">
          <p className="rotulo text-emerald-700">Pagos</p>
          <p className="text-xl font-bold text-emerald-700">{moeda(totais.pagos)}</p>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["abertos", "Abertos"],
            ["previsto", "A liberar"],
            ["liberado", "A informar"],
            ["aguardando", "Aguardando"],
            ["pagos", "Pagos"],
            ["todos", "Todos"],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            className={filtro === id ? "btn-primario" : "btn-secundario"}
            onClick={() => irParaFiltro(id)}
          >
            {rotulo}
          </button>
        ))}
        {filtro === "previsto" && lista.some((p) => p.status === "previsto") && (
          <button type="button" className="btn-primario" onClick={liberarTodosPrevistosDaLista}>
            Liberar todos ({lista.filter((p) => p.status === "previsto").length})
          </button>
        )}
        {filtro === "liberado" && lista.some((p) => p.status === "liberado") && (
          <button
            type="button"
            className="btn-primario"
            onClick={abrirInformarLote}
            title="Informa todos os liberados do filtro (valor de cada título)"
          >
            Informar todos ({lista.filter((p) => p.status === "liberado").length})
          </button>
        )}
        {filtro === "aguardando" &&
          lista.some((p) => p.status === "aguardando_conciliacao") && (
            <button
              type="button"
              className="btn-primario"
              onClick={conciliarTodosAguardandoDaLista}
              title="Marca todos como pagos com a data de hoje"
            >
              Conciliar todos (
              {lista.filter((p) => p.status === "aguardando_conciliacao").length})
            </button>
          )}
        <Link href="/rh" className="btn-secundario ml-auto">
          Ver pessoas
        </Link>
        <Link
          href={hrefConsumosRh(
            filtroPessoa !== "todos" ? { pessoa: filtroPessoa } : undefined
          )}
          className="btn-secundario"
        >
          Consumos
        </Link>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div>
          <Campo rotulo="Pessoa">
            <select
              className="campo"
              value={filtroPessoa}
              onChange={(e) => aoMudarFiltroPessoa(e.target.value)}
            >
              <option value="todos">Todas ({pessoasAtivas.length} ativas)</option>
              {pessoasAtivas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} ({p.tipo})
                </option>
              ))}
            </select>
          </Campo>
          {pessoasAtivas.length === 0 && (
            <p className="mt-1 text-sm text-destaque">
              Nenhuma pessoa ativa — cadastre em{" "}
              <Link href="/rh" className="underline">
                Pessoas
              </Link>
              .
            </p>
          )}
        </div>
        <Campo rotulo="Tipo">
          <select
            className="campo"
            value={filtroTipo}
            onChange={(e) => aoMudarFiltroTipo(e.target.value as FiltroTipoPagamentosRh)}
          >
            <option value="todos">Todos</option>
            {TIPOS_PAGAMENTO_PESSOA.map((t) => (
              <option key={t.id} value={t.id}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Competência (YYYY-MM)">
          <input
            className="campo"
            value={filtroCompetencia}
            onChange={(e) => aoMudarFiltroCompetencia(e.target.value)}
            placeholder={competenciaAtual()}
          />
        </Campo>
      </div>

      {filtroPessoa !== "todos" && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-2 border-sky-200 bg-sky-50/70 p-3">
          <p className="text-sm text-sky-950">
            Mostrando pagamentos de <strong>{nomePessoa(filtroPessoa)}</strong>.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={hrefPerfilRh(filtroPessoa, { aba: "pagamentos" })} className="btn-secundario text-sm">
              Ver perfil
            </Link>
            <button
              type="button"
              className="btn-secundario text-sm"
              onClick={() => irParaFiltros(filtro, "todos")}
            >
              Limpar pessoa
            </button>
          </div>
        </Card>
      )}

      {lista.length === 0 ? (
        <Vazio
          mensagem={
            filtroPessoa !== "todos"
              ? `Nenhum pagamento de ${nomePessoa(filtroPessoa)} neste filtro.`
              : "Nenhum pagamento neste filtro."
          }
        />
      ) : (
        <div className="space-y-3">
          {lista.map((pagamento) => (
            <Card key={pagamento.id} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{nomePessoa(pagamento.pessoa_id)}</p>
                  <p className="text-sm text-slate-600">
                    {rotuloTipoPagamentoPessoa(pagamento.tipo)}
                    {pagamento.descricao ? ` · ${pagamento.descricao}` : ""}
                    {pagamento.convocacao_id ? " · via convocação" : ""}
                  </p>
                  <p className="text-xl font-bold">{moeda(pagamento.pagamento_valor ?? pagamento.valor)}</p>
                  {(pagamento.desconto_consumo || pagamento.desconto_adiantamento) && (
                    <p className="text-xs text-slate-500">
                      Bruto {moeda(pagamento.valor_bruto ?? pagamento.valor)}
                      {pagamento.desconto_adiantamento
                        ? ` − adiant. ${moeda(pagamento.desconto_adiantamento)}`
                        : ""}
                      {pagamento.desconto_consumo ? ` − consumo ${moeda(pagamento.desconto_consumo)}` : ""}
                    </p>
                  )}
                  <p className="text-sm text-slate-500">Vencimento {dataBR(pagamento.vencimento)}</p>
                  {pagamento.status === "aguardando_conciliacao" && pagamento.pagamento_banco_conta && (
                    <p className="text-sm text-blue-800">
                      Informado em {pagamento.pagamento_data ? dataBR(pagamento.pagamento_data) : "—"} · saiu de{" "}
                      <span className="font-semibold">{pagamento.pagamento_banco_conta}</span>
                    </p>
                  )}
                  {pagamento.conciliacao_divergente && pagamento.conciliacao_divergencia_motivo && (
                    <p className="text-sm font-medium text-destaque">Divergência: {pagamento.conciliacao_divergencia_motivo}</p>
                  )}
                  <Link
                    href={hrefPerfilRh(pagamento.pessoa_id, { aba: "pagamentos" })}
                    className="mt-1 inline-block text-sm text-primaria-escura underline"
                  >
                    Ver perfil
                  </Link>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <BadgeStatusPagamento pagamento={pagamento} />
                  {pagamento.conciliacao_divergente && pagamento.status === "aguardando_conciliacao" && (
                    <Badge cor="laranja">Divergente</Badge>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {pagamento.status === "previsto" && (
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() => {
                      const proximo = structuredClone(db);
                      const r = liberarPagamentoPessoa(proximo, pagamento.id);
                      if (r.sucesso) {
                        mutate((atual) => Object.assign(atual, proximo));
                        setMensagem("Pagamento liberado.");
                      }
                    }}
                  >
                    Liberar
                  </button>
                )}
                {(pagamento.status === "previsto" || pagamento.status === "liberado") && (
                  <button type="button" className="btn-primario" onClick={() => abrirInformar(pagamento)}>
                    Informar pagamento
                  </button>
                )}
                {pagamento.status === "aguardando_conciliacao" && (
                  <>
                    <button
                      type="button"
                      className="btn-primario"
                      onClick={() => {
                        setConciliarId(pagamento.id);
                        setDataLiquidacao(pagamento.pagamento_data || hojeISO());
                        setErroConciliar(null);
                      }}
                    >
                      <CircleCheckBig size={16} /> Conciliar
                    </button>
                    <button
                      type="button"
                      className="btn-secundario"
                      onClick={() => {
                        setDivergenciaId(pagamento.id);
                        setMotivoDivergencia("");
                        setErroDivergencia(null);
                      }}
                    >
                      <TriangleAlert size={16} /> Divergente
                    </button>
                  </>
                )}
                {(pagamento.status === "aguardando_conciliacao" || pagamento.status === "pago") && (
                  <>
                    <button type="button" className="btn-secundario" onClick={() => void copiarRecibo(pagamento, "recibo")}>
                      <Copy size={16} /> Copiar recibo
                    </button>
                    <button
                      type="button"
                      className="btn-secundario"
                      onClick={() => void copiarRecibo(pagamento, "confirmacao")}
                    >
                      <Copy size={16} /> Confirmação (empregado)
                    </button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal aberto={formNovo !== null} titulo="Novo pagamento" onFechar={() => setFormNovo(null)} fecharAoClicarFundo={false}>
        {formNovo && (
          <form onSubmit={salvarNovo} className="space-y-3">
            <Campo rotulo="Pessoa *">
              <select
                className="campo"
                required
                value={formNovo.pessoa_id}
                onChange={(e) => aoMudarPessoaOuTipo(e.target.value, formNovo.tipo)}
              >
                <option value="">Selecione</option>
                {pessoasAtivas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Tipo *">
                <select
                  className="campo"
                  value={formNovo.tipo}
                  onChange={(e) => aoMudarPessoaOuTipo(formNovo.pessoa_id, e.target.value as TipoPagamentoPessoa)}
                >
                  {TIPOS_PAGAMENTO_PESSOA.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Competência">
                <input
                  type="month"
                  className="campo"
                  value={formNovo.competencia}
                  onChange={(e) => setFormNovo({ ...formNovo, competencia: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Vencimento *">
                <input
                  type="date"
                  className="campo"
                  required
                  value={formNovo.vencimento}
                  onChange={(e) => setFormNovo({ ...formNovo, vencimento: e.target.value })}
                />
              </Campo>
              <Campo
                rotulo={
                  formNovo.tipo === "salario" || pagamentoUsaConsumoDiario(formNovo.tipo)
                    ? "Valor bruto *"
                    : "Valor *"
                }
              >
                <input
                  className="campo"
                  required
                  inputMode="decimal"
                  value={formNovo.valor}
                  onChange={(e) => setFormNovo({ ...formNovo, valor: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Horas (se houver)">
                <input
                  className="campo"
                  inputMode="decimal"
                  value={formNovo.horas}
                  onChange={(e) => setFormNovo({ ...formNovo, horas: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Valor-hora (se houver)">
                <input
                  className="campo"
                  inputMode="decimal"
                  value={formNovo.valor_hora}
                  onChange={(e) => setFormNovo({ ...formNovo, valor_hora: e.target.value })}
                />
              </Campo>
            </div>
            <Campo rotulo="Descrição">
              <input
                className="campo"
                value={formNovo.descricao}
                onChange={(e) => setFormNovo({ ...formNovo, descricao: e.target.value })}
              />
            </Campo>
            {previewNovo && (previewNovo.desconto_consumo > 0 || previewNovo.desconto_adiantamento > 0) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p>
                  Bruto: <strong>{moeda(previewNovo.valor_bruto)}</strong>
                </p>
                {previewNovo.desconto_adiantamento > 0 && (
                  <p>− Adiantamento: {moeda(previewNovo.desconto_adiantamento)}</p>
                )}
                {previewNovo.desconto_consumo > 0 && (
                  <p>
                    − Consumo ({previewNovo.itens_consumo.length} itens): {moeda(previewNovo.desconto_consumo)}
                  </p>
                )}
                <p className="mt-1 font-semibold">A pagar: {moeda(previewNovo.valor_liquido)}</p>
              </div>
            )}
            {formNovo.tipo === "adiantamento" && (
              <p className="text-xs text-slate-500">Teto: 50% do salário cadastrado da pessoa.</p>
            )}
            {erroNovo && <p className="text-sm font-medium text-erro">{erroNovo}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secundario" onClick={() => setFormNovo(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario">
                Salvar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        aberto={Boolean(pagamentoInformar)}
        titulo="Informar pagamento"
        onFechar={() => setInformarId(null)}
        fecharAoClicarFundo={false}
      >
        {pagamentoInformar && (
          <form onSubmit={confirmarInformar} className="space-y-3">
            <div className="rounded-card border border-destaque bg-destaque-clara px-3 py-3 text-sm text-destaque">
              Informar pagamento não dá baixa final. O título fica em aguardando conciliação.
            </div>
            <p className="text-sm text-slate-700">
              {nomePessoa(pagamentoInformar.pessoa_id)} · {moeda(pagamentoInformar.valor)}{" "}
              <Link
                href={hrefPerfilRh(pagamentoInformar.pessoa_id, { aba: "pagamentos" })}
                className="text-primaria-escura underline"
              >
                Ver perfil
              </Link>
            </p>
            {(() => {
              const pessoa = db.pessoas.find((p) => p.id === pagamentoInformar.pessoa_id);
              if (!pessoa?.chave_pix) return null;
              return (
                <p className="text-xs text-slate-500">
                  Destino (PIX da pessoa): <span className="font-medium text-slate-700">{pessoa.chave_pix}</span> — isso
                  não substitui a conta de onde o restaurante pagou.
                </p>
              );
            })()}
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Data *">
                <input
                  type="date"
                  className="campo"
                  required
                  value={formInformar.dataPagamento}
                  onChange={(e) => setFormInformar({ ...formInformar, dataPagamento: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Valor pago *">
                <input
                  className="campo"
                  required
                  value={formInformar.valorPago}
                  onChange={(e) => setFormInformar({ ...formInformar, valorPago: e.target.value })}
                />
              </Campo>
              <div className="sm:col-span-2 space-y-2">
                <Campo rotulo="De qual banco/conta saiu o pagamento? *">
                  <SeletorContaOrigem
                    db={db}
                    valor={formInformar.bancoConta}
                    onChange={(bancoConta) => setFormInformar({ ...formInformar, bancoConta })}
                    listId="contas-origem-rh"
                  />
                </Campo>
                <p className="text-xs text-slate-500">
                  Essa informação facilita achar o débito no extrato na hora de conciliar.
                </p>
              </div>
              <Campo rotulo="Responsável">
                <input
                  className="campo"
                  value={formInformar.responsavel}
                  onChange={(e) => setFormInformar({ ...formInformar, responsavel: e.target.value })}
                />
              </Campo>
            </div>
            {erroInformar && <p className="text-sm font-medium text-erro">{erroInformar}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secundario" onClick={() => setInformarId(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario">
                Informar pagamento
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        aberto={informarLoteAberto}
        titulo="Informar pagamentos em lote"
        onFechar={() => setInformarLoteAberto(false)}
        fecharAoClicarFundo={false}
      >
        {informarLoteAberto && (
          <form onSubmit={confirmarInformarLote} className="space-y-3">
            <div className="rounded-card border border-destaque bg-destaque-clara px-3 py-3 text-sm text-destaque">
              Informar não dá baixa final. Cada título vai para aguardando conciliação com o valor do
              próprio título.
            </div>
            {(() => {
              const liberados = lista.filter((p) => p.status === "liberado");
              const total = liberados.reduce((acc, p) => acc + (p.pagamento_valor ?? p.valor), 0);
              return (
                <p className="text-sm text-slate-700">
                  {liberados.length} pagamento(s) liberado(s) neste filtro · total{" "}
                  <strong>{moeda(total)}</strong>
                </p>
              );
            })()}
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Data *">
                <input
                  type="date"
                  className="campo"
                  required
                  value={formInformar.dataPagamento}
                  onChange={(e) => setFormInformar({ ...formInformar, dataPagamento: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Responsável">
                <input
                  className="campo"
                  value={formInformar.responsavel}
                  onChange={(e) => setFormInformar({ ...formInformar, responsavel: e.target.value })}
                />
              </Campo>
              <div className="sm:col-span-2 space-y-2">
                <Campo rotulo="De qual banco/conta saiu o pagamento? *">
                  <SeletorContaOrigem
                    db={db}
                    valor={formInformar.bancoConta}
                    onChange={(bancoConta) => setFormInformar({ ...formInformar, bancoConta })}
                    listId="contas-origem-rh-lote"
                  />
                </Campo>
                <p className="text-xs text-slate-500">
                  Mesma origem para todos os títulos do lote — facilita achar no extrato.
                </p>
              </div>
            </div>
            {erroInformar && <p className="text-sm font-medium text-erro">{erroInformar}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-secundario"
                onClick={() => setInformarLoteAberto(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="btn-primario">
                Informar todos
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal aberto={Boolean(pagamentoConciliar)} titulo="Conciliar pagamento" onFechar={() => setConciliarId(null)}>
        {pagamentoConciliar && (
          <form onSubmit={confirmarConciliar} className="space-y-3">
            <p className="text-sm text-slate-700">
              {nomePessoa(pagamentoConciliar.pessoa_id)} ·{" "}
              {moeda(pagamentoConciliar.pagamento_valor ?? pagamentoConciliar.valor)}{" "}
              <Link
                href={hrefPerfilRh(pagamentoConciliar.pessoa_id, { aba: "pagamentos" })}
                className="text-primaria-escura underline"
              >
                Ver perfil
              </Link>
            </p>
            <Campo rotulo="Data da liquidação *">
              <input
                type="date"
                className="campo"
                required
                value={dataLiquidacao}
                onChange={(e) => setDataLiquidacao(e.target.value)}
              />
            </Campo>
            {erroConciliar && <p className="text-sm font-medium text-erro">{erroConciliar}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secundario" onClick={() => setConciliarId(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario">
                Conciliar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal aberto={Boolean(pagamentoDivergencia)} titulo="Registrar divergência" onFechar={() => setDivergenciaId(null)}>
        {pagamentoDivergencia && (
          <form onSubmit={confirmarDivergencia} className="space-y-3">
            <Campo rotulo="Motivo *">
              <textarea
                className="campo min-h-24"
                required
                value={motivoDivergencia}
                onChange={(e) => setMotivoDivergencia(e.target.value)}
              />
            </Campo>
            {erroDivergencia && <p className="text-sm font-medium text-erro">{erroDivergencia}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secundario" onClick={() => setDivergenciaId(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario">
                Registrar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        aberto={importAberto}
        titulo="Importar folha PDF"
        onFechar={() => {
          if (!importCarregando) setImportAberto(false);
        }}
        fecharAoClicarFundo={false}
      >
        {importPasso === "arquivo" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Baixe o PDF de recibos que o contador enviou no WhatsApp e selecione aqui. O sistema lê o líquido,
              adiantamento e consumo de cada pessoa.
            </p>
            <Campo rotulo="Arquivo PDF *">
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="campo"
                disabled={importCarregando}
                onChange={(e) => void onArquivoFolha(e.target.files?.[0] ?? null)}
              />
            </Campo>
            {importCarregando && <p className="text-sm text-slate-600">Lendo PDF…</p>}
            {erroImport && <p className="text-sm font-medium text-destaque">{erroImport}</p>}
            <div className="flex justify-end">
              <button type="button" className="btn-secundario" onClick={() => setImportAberto(false)} disabled={importCarregando}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {importPasso === "revisao" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Confira os vínculos e o valor líquido. Só as linhas marcadas serão lançadas como pagamento previsto.
            </p>
            <Campo rotulo="Vencimento dos pagamentos">
              <input
                type="date"
                className="campo"
                value={vencimentoImport}
                onChange={(e) => setVencimentoImport(e.target.value)}
              />
            </Campo>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {importLinhas.map((linha, idx) => (
                <div key={`${linha.codigo_funcionario}-${linha.liquido}-${idx}`} className="rounded-lg border border-stone-200 p-3">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={linha.selecionado}
                      onChange={(e) => atualizarLinhaImport(idx, { selecionado: e.target.checked })}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">
                        {linha.codigo_funcionario}-{linha.nome}
                      </p>
                      <p className="text-xs text-slate-500">
                        {linha.tipo_recibo === "pro_labore" ? "Pró-labore" : "Salário"} · {linha.competencia_rotulo}
                      </p>
                      <p className="text-sm">
                        Líquido <strong>{moeda(linha.liquido)}</strong>
                        {linha.adiantamento != null ? ` · Adiant. ${moeda(linha.adiantamento)}` : ""}
                        {linha.consumo != null ? ` · Consumo ${moeda(linha.consumo)}` : ""}
                      </p>
                      <Campo rotulo="Pessoa no ComprasChef">
                        <select
                          className="campo"
                          value={linha.pessoa_id ?? ""}
                          onChange={(e) =>
                            atualizarLinhaImport(idx, {
                              pessoa_id: e.target.value || undefined,
                              selecionado: Boolean(e.target.value) && !linha.ja_existe && linha.liquido > 0,
                            })
                          }
                        >
                          <option value="">Selecione</option>
                          {pessoasAtivas.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome}
                            </option>
                          ))}
                        </select>
                      </Campo>
                      {linha.alerta && <p className="mt-1 text-xs font-medium text-destaque">{linha.alerta}</p>}
                    </div>
                  </label>
                </div>
              ))}
            </div>
            {erroImport && <p className="text-sm font-medium text-destaque">{erroImport}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn-secundario"
                onClick={() => {
                  setImportPasso("arquivo");
                  setImportLinhas([]);
                  setErroImport(null);
                }}
              >
                Outro arquivo
              </button>
              <button type="button" className="btn-primario" onClick={confirmarImportacao}>
                Confirmar importação ({importLinhas.filter((l) => l.selecionado).length})
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function RhPagamentosPage() {
  return (
    <Suspense
      fallback={
        <div>
          <TituloPagina titulo="RH — Pagamentos" subtitulo="Carregando…" />
          <p className="text-sm text-slate-500">Carregando pagamentos…</p>
        </div>
      }
    >
      <RhPagamentosConteudo />
    </Suspense>
  );
}
