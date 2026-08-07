"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  ClipboardList,
  History,
  QrCode,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import CodeScanner from "@/components/scanner/CodeScanner";
import CampoQuantidade from "@/components/operacao/CampoQuantidade";
import { Badge, Campo, Card, TituloPagina, Vazio } from "@/components/ui";
import { dataBR, dataHoraBR, qtd } from "@/lib/format";
import { mutate, nomeLocal, nomeProduto, siglaUnidadeUso, sincronizarDBLocalSalvo, uid, useDB } from "@/lib/data";
import { usePapel } from "@/lib/roles";
import {
  calcularQuantidadeReposicao,
  loteDaCaixa,
  reservasFefoDisponiveis,
  transferirReservaParaOperacional,
  validarPreTransferenciaReposicaoPorQr,
  type ConfirmacaoLeituraReposicao,
  type ReposicaoOperacionalResultado,
} from "@/lib/domain/estoque";
import {
  eventoPorTipoDescricao,
  eventosOperacaoBoxOrdenados,
  filtrarEventosOperacaoBox,
  registrarAberturaBoxOperacional,
  registrarEventoReposicaoOperacional,
  registrarFechamentoBoxOperacional,
  type AberturaBoxOperacionalResultado,
  type FechamentoBoxOperacionalResultado,
  type ConfirmacaoQrOperacaoBox,
  type TipoFiltroEventoOperacaoBox,
} from "@/lib/domain/operacao-boxes";
import { produtoOperacionalEfetivo, ROTULO_POSICAO_BOX, ROTULO_TIPO_BOX } from "@/lib/domain/estoque-boxes";
import { localizarBoxParaPreviaManual, resolverPreviaManualBox } from "@/lib/domain/previa-qr-box";

type AbaOperacao = "abertura" | "reposicao" | "fechamento" | "divergencias" | "historico";
type OrigemPreenchimento = "nao_lido" | "digitado" | "colado" | "leitura";
type EstadoSeloLeitura = "nao_lido" | "preenchido" | "localizado" | "confirmado" | "invalido";

function clampQuantidade(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.max(0, valor);
}

function normalizarQr(valor: string | undefined): string {
  return (valor ?? "").trim();
}

function criarConfirmacaoQr(
  db: ReturnType<typeof useDB>,
  sessaoId: string,
  qr: string
): ConfirmacaoQrOperacaoBox | undefined {
  const caixa = db.caixas.find((item) => item.qr_code.toLowerCase() === normalizarQr(qr).toLowerCase());
  if (!caixa) return undefined;
  return {
    sessao_id: sessaoId,
    qr_confirmado: normalizarQr(qr),
    caixa_id: caixa.id,
    produto_id: produtoOperacionalEfetivo(caixa),
    lote_id: loteDaCaixa(db, caixa.id)?.id,
  };
}

function nomeUsuario(db: ReturnType<typeof useDB>, usuarioId: string): string {
  return db.perfis.find((perfil) => perfil.id === usuarioId)?.nome ?? usuarioId;
}

function nomeEvento(tipo: TipoFiltroEventoOperacaoBox | undefined): string {
  if (!tipo || tipo === "todos") return "Todos";
  return eventoPorTipoDescricao(tipo);
}

export default function OperacaoDiariaDosBoxesPage() {
  const db = useDB();
  const { papel } = usePapel();
  const usuarioPadrao = db.perfis.find((perfil) => perfil.papel === papel)?.id ?? "perfil-dono";

  const [aba, setAba] = useState<AbaOperacao>("abertura");

  const [responsavelId, setResponsavelId] = useState(usuarioPadrao);

  const [aberturaSessaoId, setAberturaSessaoId] = useState(() => uid("sess-ab"));
  const [aberturaQr, setAberturaQr] = useState("");
  const [aberturaQrDigitadoParaPrevia, setAberturaQrDigitadoParaPrevia] = useState("");
  const [aberturaConfirmacao, setAberturaConfirmacao] = useState<ConfirmacaoQrOperacaoBox | undefined>(undefined);
  const [aberturaContada, setAberturaContada] = useState(0);
  const [aberturaNecessidade, setAberturaNecessidade] = useState(50);
  const [aberturaJustificativa, setAberturaJustificativa] = useState("");
  const [aberturaOrigemEntrada, setAberturaOrigemEntrada] = useState<OrigemPreenchimento>("nao_lido");
  const [aberturaResultado, setAberturaResultado] = useState<AberturaBoxOperacionalResultado | null>(null);
  const [erroAbertura, setErroAbertura] = useState<string | null>(null);

  const [fechamentoSessaoId, setFechamentoSessaoId] = useState(() => uid("sess-fe"));
  const [fechamentoQr, setFechamentoQr] = useState("");
  const [fechamentoQrDigitadoParaPrevia, setFechamentoQrDigitadoParaPrevia] = useState("");
  const [fechamentoConfirmacao, setFechamentoConfirmacao] = useState<ConfirmacaoQrOperacaoBox | undefined>(undefined);
  const [fechamentoContado, setFechamentoContado] = useState(0);
  const [fechamentoJustificativa, setFechamentoJustificativa] = useState("");
  const [fechamentoOrigemEntrada, setFechamentoOrigemEntrada] = useState<OrigemPreenchimento>("nao_lido");
  const [fechamentoResultado, setFechamentoResultado] = useState<FechamentoBoxOperacionalResultado | null>(null);
  const [erroFechamento, setErroFechamento] = useState<string | null>(null);

  const [reposicaoSessaoId, setReposicaoSessaoId] = useState(() => uid("sess-rep"));
  const [reposicaoOrigemQr, setReposicaoOrigemQr] = useState("");
  const [reposicaoOrigemQrDigitadoParaPrevia, setReposicaoOrigemQrDigitadoParaPrevia] = useState("");
  const [reposicaoDestinoQr, setReposicaoDestinoQr] = useState("");
  const [reposicaoDestinoQrDigitadoParaPrevia, setReposicaoDestinoQrDigitadoParaPrevia] = useState("");
  const [reposicaoConfirmacaoOrigem, setReposicaoConfirmacaoOrigem] = useState<ConfirmacaoLeituraReposicao | undefined>(
    undefined
  );
  const [reposicaoConfirmacaoDestino, setReposicaoConfirmacaoDestino] = useState<ConfirmacaoLeituraReposicao | undefined>(
    undefined
  );
  const [reposicaoOrigemEntrada, setReposicaoOrigemEntrada] = useState<OrigemPreenchimento>("nao_lido");
  const [reposicaoDestinoEntrada, setReposicaoDestinoEntrada] = useState<OrigemPreenchimento>("nao_lido");
  const [quantidadeTransferencia, setQuantidadeTransferencia] = useState(0);
  const [totalTransferidoSessao, setTotalTransferidoSessao] = useState(0);
  const [erroReposicao, setErroReposicao] = useState<string | null>(null);
  const [comprovanteReposicao, setComprovanteReposicao] = useState<ReposicaoOperacionalResultado | null>(null);

  const [filtroHistoricoData, setFiltroHistoricoData] = useState("");
  const [filtroHistoricoBoxId, setFiltroHistoricoBoxId] = useState("");
  const [filtroHistoricoProdutoId, setFiltroHistoricoProdutoId] = useState("");
  const [filtroHistoricoTipo, setFiltroHistoricoTipo] = useState<TipoFiltroEventoOperacaoBox>("todos");

  const aberturaQrParaPrevia = aberturaQrDigitadoParaPrevia || aberturaQr;
  const fechamentoQrParaPrevia = fechamentoQrDigitadoParaPrevia || fechamentoQr;
  const reposicaoOrigemQrParaPrevia = reposicaoOrigemQrDigitadoParaPrevia || reposicaoOrigemQr;
  const reposicaoDestinoQrParaPrevia = reposicaoDestinoQrDigitadoParaPrevia || reposicaoDestinoQr;
  const aberturaBox = localizarBoxParaPreviaManual(db, aberturaQrParaPrevia);
  const fechamentoBox = localizarBoxParaPreviaManual(db, fechamentoQrParaPrevia);
  const reposicaoOrigem = localizarBoxParaPreviaManual(db, reposicaoOrigemQrParaPrevia);
  const reposicaoDestino = localizarBoxParaPreviaManual(db, reposicaoDestinoQrParaPrevia);
  const aberturaProdutoId = aberturaBox ? produtoOperacionalEfetivo(aberturaBox) : undefined;
  const fechamentoProdutoId = fechamentoBox ? produtoOperacionalEfetivo(fechamentoBox) : undefined;
  const reposicaoDestinoProdutoId = reposicaoDestino ? produtoOperacionalEfetivo(reposicaoDestino) : undefined;
  const aberturaSemLocalFisico = Boolean(aberturaBox && aberturaBox.tipo_box === "OPERACIONAL" && !aberturaBox.local_id);
  const fechamentoSemLocalFisico = Boolean(fechamentoBox && fechamentoBox.tipo_box === "OPERACIONAL" && !fechamentoBox.local_id);
  const reposicaoDestinoSemLocalFisico = Boolean(reposicaoDestino && reposicaoDestino.tipo_box === "OPERACIONAL" && !reposicaoDestino.local_id);

  const aberturaUltimoFechamento = aberturaBox ? eventosOperacaoBoxOrdenados(db).find((evento) => evento.tipo === "fechamento" && evento.box_id === aberturaBox.id) : undefined;
  const fechamentoEsperado = clampQuantidade(fechamentoBox?.quantidade ?? 0);
  const aberturaEsperado = clampQuantidade(aberturaUltimoFechamento?.quantidade_contada ?? 0);
  const aberturaDiferenca = clampQuantidade(aberturaContada) - aberturaEsperado;
  const fechamentoDiferenca = clampQuantidade(fechamentoContado) - fechamentoEsperado;
  const aberturaSugestaoReposicao = aberturaBox && aberturaProdutoId ? Math.max(clampQuantidade(aberturaNecessidade) - clampQuantidade(aberturaContada), 0) : 0;
  const fechamentoSugestaoReposicao = fechamentoBox && fechamentoProdutoId ? Math.max(clampQuantidade(aberturaNecessidade) - clampQuantidade(fechamentoContado), 0) : 0;

  const reposicaoProdutoId = reposicaoDestinoProdutoId ?? reposicaoOrigem?.produto_id ?? "";
  const reposicaoLoteId = reposicaoOrigem ? loteDaCaixa(db, reposicaoOrigem.id)?.id : reposicaoDestino ? loteDaCaixa(db, reposicaoDestino.id)?.id : undefined;
  const reposicaoLoteOrigem = reposicaoOrigem ? loteDaCaixa(db, reposicaoOrigem.id) : undefined;
  const reposicaoUnidade = reposicaoProdutoId ? siglaUnidadeUso(db, reposicaoProdutoId) : undefined;
  const quantidadeReposicao = clampQuantidade(quantidadeTransferencia);
  const saldoOrigemAtual = clampQuantidade(reposicaoOrigem?.quantidade ?? 0);
  const saldoDestinoAtual = clampQuantidade(reposicaoDestino?.quantidade ?? 0);
  const origemDepoisProjetada = Math.max(saldoOrigemAtual - quantidadeReposicao, 0);
  const destinoDepoisProjetado = saldoDestinoAtual + quantidadeReposicao;
  const reposicaoCompativel = Boolean(reposicaoOrigem?.produto_id && reposicaoDestinoProdutoId && reposicaoOrigem.produto_id === reposicaoDestinoProdutoId);
  const reposicaoAvisosPapel = [
    reposicaoOrigem?.tipo_box === "OPERACIONAL" ? "Origem inválida — este box é Operacional. Leia um Box Reserva." : undefined,
    reposicaoDestino?.tipo_box === "RESERVA" ? "Destino inválido — este box é Reserva. Leia um Box Operacional." : undefined,
    reposicaoOrigem?.tipo_box === "QUARENTENA" || reposicaoDestino?.tipo_box === "QUARENTENA" ? "Box em Quarentena — movimentação bloqueada." : undefined,
    reposicaoOrigem && reposicaoDestino && reposicaoOrigem.id === reposicaoDestino.id ? "Origem e destino não podem ser o mesmo box." : undefined,
  ].filter((aviso): aviso is string => Boolean(aviso));
  const reposicaoTemBloqueioPapel = reposicaoAvisosPapel.length > 0;
  const quantidadeReposicaoValida = quantidadeReposicao > 0 && quantidadeReposicao <= saldoOrigemAtual && Number.isFinite(quantidadeTransferencia);
  const passoReposicao = reposicaoUnidade?.toLowerCase() === "kg" ? 0.001 : 1;
  const casasDecimaisReposicao = reposicaoUnidade?.toLowerCase() === "kg" ? 3 : 2;
  const aberturaUnidade = aberturaProdutoId ? siglaUnidadeUso(db, aberturaProdutoId) : undefined;
  const fechamentoUnidade = fechamentoProdutoId ? siglaUnidadeUso(db, fechamentoProdutoId) : undefined;
  const sugeridaReposicao = calcularQuantidadeReposicao(
    clampQuantidade(aberturaNecessidade),
    clampQuantidade(aberturaContada)
  );
  const reposicoesFefo = useMemo(() => (reposicaoProdutoId ? reservasFefoDisponiveis(db, reposicaoProdutoId) : []), [db, reposicaoProdutoId]);
  const reservaSugerida = reposicoesFefo[0];

  const historicoFiltrado = useMemo(
    () =>
      filtrarEventosOperacaoBox(db, {
        data: filtroHistoricoData || undefined,
        boxId: filtroHistoricoBoxId || undefined,
        produtoId: filtroHistoricoProdutoId || undefined,
        tipo: filtroHistoricoTipo,
      }),
    [db, filtroHistoricoBoxId, filtroHistoricoData, filtroHistoricoProdutoId, filtroHistoricoTipo]
  );

  const divergencias = useMemo(
    () =>
      eventosOperacaoBoxOrdenados(db).filter((evento) => {
        if (evento.tipo === "reposicao") return false;
        return (evento.delta ?? 0) !== 0 || evento.tipo === "divergencia" || evento.status_divergencia !== undefined;
      }),
    [db]
  );

  function classesSelo(estado: EstadoSeloLeitura): string {
    if (estado === "confirmado") return "bg-sucesso-clara text-primaria-escura";
    if (estado === "invalido") return "bg-erro-clara text-erro";
    if (estado === "localizado") return "bg-destaque-clara text-destaque";
    if (estado === "preenchido") return "bg-destaque-clara text-destaque";
    return "bg-slate-100 text-slate-600";
  }

  function rotuloSelo(estado: EstadoSeloLeitura, lado: "Origem" | "Destino"): string {
    if (estado === "confirmado") return `${lado}: QR confirmado`;
    if (estado === "invalido") return `${lado}: inválido ou alterado após leitura`;
    if (estado === "localizado") return `${lado}: QR digitado — não confirmado`;
    if (estado === "preenchido") return `${lado}: preenchido, mas não confirmado`;
    return `${lado}: não lido`;
  }

  function estadoSelo(qrAtual: string, confirmacao?: ConfirmacaoQrOperacaoBox, localizado?: boolean): EstadoSeloLeitura {
    const qr = normalizarQr(qrAtual);
    if (!qr && !confirmacao) return "nao_lido";
    if (confirmacao && normalizarQr(confirmacao.qr_confirmado) !== qr) return "invalido";
    if (confirmacao && normalizarQr(confirmacao.qr_confirmado) === qr) return "confirmado";
    if (qr && localizado) return "localizado";
    return "preenchido";
  }

  function resetarSessaoAbertura() {
    setAberturaSessaoId(uid("sess-ab"));
    setAberturaQr("");
    setAberturaQrDigitadoParaPrevia("");
    setAberturaConfirmacao(undefined);
    setAberturaContada(0);
    setAberturaJustificativa("");
    setAberturaOrigemEntrada("nao_lido");
    setErroAbertura(null);
  }

  function resetarSessaoFechamento() {
    setFechamentoSessaoId(uid("sess-fe"));
    setFechamentoQr("");
    setFechamentoQrDigitadoParaPrevia("");
    setFechamentoConfirmacao(undefined);
    setFechamentoContado(0);
    setFechamentoJustificativa("");
    setFechamentoOrigemEntrada("nao_lido");
    setErroFechamento(null);
  }

  function resetarSessaoReposicao() {
    setReposicaoSessaoId(uid("sess-rep"));
    setReposicaoOrigemQr("");
    setReposicaoOrigemQrDigitadoParaPrevia("");
    setReposicaoDestinoQr("");
    setReposicaoDestinoQrDigitadoParaPrevia("");
    setReposicaoConfirmacaoOrigem(undefined);
    setReposicaoConfirmacaoDestino(undefined);
    setReposicaoOrigemEntrada("nao_lido");
    setReposicaoDestinoEntrada("nao_lido");
    setQuantidadeTransferencia(0);
    setErroReposicao(null);
  }

  function confirmarLeituraAbertura(qr: string) {
    setAberturaQr(qr.trim());
    setAberturaQrDigitadoParaPrevia(qr.trim());
    setAberturaOrigemEntrada("leitura");
    const confirmacao = criarConfirmacaoQr(db, aberturaSessaoId, qr);
    setAberturaConfirmacao(confirmacao);
    if (!confirmacao) {
      setErroAbertura("QR do Box Operacional não encontrado.");
      return;
    }
    setErroAbertura(null);
  }

  function confirmarLeituraFechamento(qr: string) {
    setFechamentoQr(qr.trim());
    setFechamentoQrDigitadoParaPrevia(qr.trim());
    setFechamentoOrigemEntrada("leitura");
    const confirmacao = criarConfirmacaoQr(db, fechamentoSessaoId, qr);
    setFechamentoConfirmacao(confirmacao);
    if (!confirmacao) {
      setErroFechamento("QR do Box Operacional não encontrado.");
      return;
    }
    setErroFechamento(null);
  }

  function confirmarLeituraReposicao(qr: string, lado: "origem" | "destino") {
    const confirmacao = criarConfirmacaoQr(db, reposicaoSessaoId, qr);
    if (lado === "origem") {
      setReposicaoOrigemQr(qr.trim());
      setReposicaoOrigemQrDigitadoParaPrevia(qr.trim());
      setReposicaoConfirmacaoOrigem(confirmacao as ConfirmacaoLeituraReposicao | undefined);
      if (!confirmacao) {
        setErroReposicao("QR de origem não encontrado nos boxes cadastrados.");
        return;
      }
    } else {
      setReposicaoDestinoQr(qr.trim());
      setReposicaoDestinoQrDigitadoParaPrevia(qr.trim());
      setReposicaoConfirmacaoDestino(confirmacao as ConfirmacaoLeituraReposicao | undefined);
      if (!confirmacao) {
        setErroReposicao("QR de destino não encontrado nos boxes cadastrados.");
        return;
      }
    }
    setErroReposicao(null);
  }

  function selecionarManualAbertura(qr: string, origem: OrigemPreenchimento) {
    const codigo = normalizarQr(qr);
    setAberturaQrDigitadoParaPrevia(codigo);
    setAberturaQr(codigo);
    setAberturaOrigemEntrada(origem);
    setErroAbertura(null);
  }

  function selecionarManualFechamento(qr: string, origem: OrigemPreenchimento) {
    const codigo = normalizarQr(qr);
    setFechamentoQrDigitadoParaPrevia(codigo);
    setFechamentoQr(codigo);
    setFechamentoOrigemEntrada(origem);
    setErroFechamento(null);
  }

  function selecionarManualReposicao(qr: string, lado: "origem" | "destino", origem: OrigemPreenchimento) {
    if (lado === "origem") {
      const codigo = normalizarQr(qr);
      setReposicaoOrigemQrDigitadoParaPrevia(codigo);
      setReposicaoOrigemQr(codigo);
      setReposicaoOrigemEntrada(origem);
    } else {
      const codigo = normalizarQr(qr);
      setReposicaoDestinoQrDigitadoParaPrevia(codigo);
      setReposicaoDestinoQr(codigo);
      setReposicaoDestinoEntrada(origem);
    }
    setErroReposicao(null);
  }

  function localizarManualAbertura(qr: string) {
    const dbAtual = sincronizarDBLocalSalvo();
    const previa = resolverPreviaManualBox(dbAtual, { qrDigitadoParaPrevia: qr, necessidadePrevista: aberturaNecessidade, quantidadeContada: aberturaContada });
    setAberturaQrDigitadoParaPrevia(previa.qrNormalizado);
    setAberturaQr(previa.qrNormalizado);
    setAberturaOrigemEntrada("digitado");
    setAberturaConfirmacao(undefined);
    setErroAbertura(previa.localizado ? null : "QR não encontrado.");
  }

  function localizarManualFechamento(qr: string) {
    const dbAtual = sincronizarDBLocalSalvo();
    const previa = resolverPreviaManualBox(dbAtual, { qrDigitadoParaPrevia: qr, quantidadeContada: fechamentoContado });
    setFechamentoQrDigitadoParaPrevia(previa.qrNormalizado);
    setFechamentoQr(previa.qrNormalizado);
    setFechamentoOrigemEntrada("digitado");
    setFechamentoConfirmacao(undefined);
    setErroFechamento(previa.localizado ? null : "QR não encontrado.");
  }

  function localizarManualReposicao(qr: string, lado: "origem" | "destino") {
    const dbAtual = sincronizarDBLocalSalvo();
    const previa = resolverPreviaManualBox(dbAtual, { qrDigitadoParaPrevia: qr });
    if (lado === "origem") {
      setReposicaoOrigemQrDigitadoParaPrevia(previa.qrNormalizado);
      setReposicaoOrigemQr(previa.qrNormalizado);
      setReposicaoOrigemEntrada("digitado");
      setReposicaoConfirmacaoOrigem(undefined);
    } else {
      setReposicaoDestinoQrDigitadoParaPrevia(previa.qrNormalizado);
      setReposicaoDestinoQr(previa.qrNormalizado);
      setReposicaoDestinoEntrada("digitado");
      setReposicaoConfirmacaoDestino(undefined);
    }
    setErroReposicao(previa.localizado ? null : "QR não encontrado.");
  }

  function alterarQuantidadeReposicao(valor: number) {
    const quantidade = Number.isFinite(valor) ? Math.max(0, valor) : 0;
    setQuantidadeTransferencia(quantidade);
    if (quantidade > saldoOrigemAtual && reposicaoOrigem) {
      setErroReposicao("Quantidade maior que o saldo disponível da origem.");
      return;
    }
    setErroReposicao(null);
  }

  function confirmarAbertura() {
    if (!aberturaConfirmacao) {
      setErroAbertura("QR obrigatório para abrir o dia.");
      return;
    }
    try {
      let resultado: AberturaBoxOperacionalResultado | undefined;
      mutate((d) => {
        resultado = registrarAberturaBoxOperacional(d, {
          sessaoId: aberturaSessaoId,
          usuarioId: responsavelId,
          qrAtual: aberturaQr,
          confirmacao: aberturaConfirmacao,
          quantidadeContada: aberturaContada,
          necessidadePrevista: aberturaNecessidade,
          justificativa: aberturaJustificativa,
        });
      });
      if (resultado) {
        setAberturaResultado(resultado);
        resetarSessaoAbertura();
      }
    } catch (error) {
      setErroAbertura(error instanceof Error ? error.message : "Não foi possível concluir a abertura.");
    }
  }

  function confirmarFechamento() {
    if (!fechamentoConfirmacao) {
      setErroFechamento("QR obrigatório para fechar o dia.");
      return;
    }
    try {
      let resultado: FechamentoBoxOperacionalResultado | undefined;
      mutate((d) => {
        resultado = registrarFechamentoBoxOperacional(d, {
          sessaoId: fechamentoSessaoId,
          usuarioId: responsavelId,
          qrAtual: fechamentoQr,
          confirmacao: fechamentoConfirmacao,
          quantidadeContada: fechamentoContado,
          justificativa: fechamentoJustificativa,
        });
      });
      if (resultado) {
        setFechamentoResultado(resultado);
        resetarSessaoFechamento();
      }
    } catch (error) {
      setErroFechamento(error instanceof Error ? error.message : "Não foi possível concluir o fechamento.");
    }
  }

  function confirmarReposicao() {
    const quantidade = clampQuantidade(quantidadeTransferencia);
    const prevalidacao = validarPreTransferenciaReposicaoPorQr({
      sessaoLeituraAtual: reposicaoSessaoId,
      qrOrigemAtual: reposicaoOrigemQr,
      qrOrigemConfirmado: reposicaoConfirmacaoOrigem?.qr_confirmado,
      qrDestinoAtual: reposicaoDestinoQr,
      qrDestinoConfirmado: reposicaoConfirmacaoDestino?.qr_confirmado,
      origem: reposicaoOrigem ? { id: reposicaoOrigem.id, produto_id: reposicaoOrigem.produto_id } : undefined,
      destino: reposicaoDestino ? { id: reposicaoDestino.id, produto_id: reposicaoDestinoProdutoId } : undefined,
      produtoId: reposicaoProdutoId,
      loteId: reposicaoLoteId,
      quantidade,
      confirmacaoOrigem: reposicaoConfirmacaoOrigem as ConfirmacaoLeituraReposicao | undefined,
      confirmacaoDestino: reposicaoConfirmacaoDestino as ConfirmacaoLeituraReposicao | undefined,
    });
    if (!prevalidacao.valido) {
      setErroReposicao(prevalidacao.motivo ?? "Validação de leitura não aprovada para esta transferência.");
      return;
    }

    const origemLabel = reposicaoOrigem ? `Box ${reposicaoOrigem.numero}` : "origem";
    const destinoLabel = reposicaoDestino ? `Box ${reposicaoDestino.numero}` : "destino";
    const ok = window.confirm(`Confirmar transferência de ${qtd(quantidade, reposicaoUnidade)} de ${origemLabel} para ${destinoLabel}?`);
    if (!ok) return;

    try {
      const agora = new Date().toISOString();
      let recibo: ReposicaoOperacionalResultado | undefined;
      mutate((d) => {
        const origemAntes = reposicaoOrigem ? d.caixas.find((caixa) => caixa.id === reposicaoOrigem.id) : undefined;
        const destinoAntes = reposicaoDestino ? d.caixas.find((caixa) => caixa.id === reposicaoDestino.id) : undefined;
        if (!origemAntes || !destinoAntes) {
          throw new Error("Leia origem e destino para registrar a reposição.");
        }
        const saldoOrigemAntes = origemAntes.quantidade ?? 0;
        const saldoDestinoAntes = destinoAntes.quantidade ?? 0;
        recibo = transferirReservaParaOperacional(d, {
          movimentoId: uid("mov"),
          alocacaoDestinoId: uid("aloc"),
          origemQrCode: reposicaoOrigemQr,
          destinoQrCode: reposicaoDestinoQr,
          quantidade,
          usuarioId: responsavelId,
          agora,
          motivo: "REPOSICAO_OPERACIONAL",
        });
        if (recibo) {
          registrarEventoReposicaoOperacional(
            d,
            {
              sessaoId: reposicaoSessaoId,
              usuarioId: responsavelId,
              origemQr: reposicaoOrigemQr,
              destinoQr: reposicaoDestinoQr,
              quantidade,
              movimentoId: recibo.movimento_id,
              alocacaoDestinoId: uid("aloc-hist"),
            },
            {
              boxOrigemNumero: origemAntes.numero,
              boxDestinoNumero: destinoAntes.numero,
              produtoId: recibo.produto_id,
              loteId: recibo.lote_id,
              validade: recibo.validade,
              quantidadeAnteriorOrigem: saldoOrigemAntes,
              quantidadePosteriorOrigem: recibo.saldo_origem_depois,
              quantidadeAnteriorDestino: saldoDestinoAntes,
              quantidadePosteriorDestino: recibo.saldo_destino_depois,
            }
          );
        }
      });
      if (recibo) {
        setComprovanteReposicao(recibo);
        setTotalTransferidoSessao((atual) => atual + recibo!.quantidade_transferida);
        setErroReposicao(null);
        resetarSessaoReposicao();
      }
    } catch (error) {
      setErroReposicao(error instanceof Error ? error.message : "Não foi possível transferir.");
    }
  }

  function origemQtdUtilizavel() {
    return Math.max(0, aberturaContada);
  }

  const aberturaResultadoDiferenca = aberturaResultado?.abertura.delta ?? aberturaDiferenca;
  const fechamentoResultadoDiferenca = fechamentoResultado?.fechamento.delta ?? fechamentoDiferenca;

  return (
    <div className="space-y-4">
      <TituloPagina titulo="Operação diária dos Boxes" subtitulo="Abertura, reposição, fechamento, divergências e histórico por QR" />

      <Card className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <button className={aba === "abertura" ? "btn-primario" : "btn-secundario"} onClick={() => setAba("abertura")}>
            <ClipboardList size={16} /> Abertura
          </button>
          <button className={aba === "reposicao" ? "btn-primario" : "btn-secundario"} onClick={() => setAba("reposicao")}>
            <ArrowLeftRight size={16} /> Reposição
          </button>
          <button className={aba === "fechamento" ? "btn-primario" : "btn-secundario"} onClick={() => setAba("fechamento")}>
            <CheckCircle2 size={16} /> Fechamento
          </button>
          <button className={aba === "divergencias" ? "btn-primario" : "btn-secundario"} onClick={() => setAba("divergencias")}>
            <TriangleAlert size={16} /> Divergências
          </button>
          <button className={aba === "historico" ? "btn-primario" : "btn-secundario"} onClick={() => setAba("historico")}>
            <History size={16} /> Histórico
          </button>
        </div>
        <p className="text-sm text-slate-600">
          O fluxo inteiro fica nesta página. QR digitado ou colado não confirma; somente leitura física valida a sessão.
        </p>
      </Card>

      <Card className="space-y-3">
        <Campo rotulo="Usuário responsável">
          <select className="campo" value={responsavelId} onChange={(event) => setResponsavelId(event.target.value)}>
            {db.perfis.filter((perfil) => perfil.ativo).map((perfil) => (
              <option key={perfil.id} value={perfil.id}>
                {perfil.nome}
              </option>
            ))}
          </select>
        </Campo>
      </Card>

      {aba === "abertura" && (
        <Card className="space-y-4">
          <p className="font-bold">Abertura do dia</p>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-semibold">QR do Box Operacional</p>
              <CodeScanner rotulo="Escanear Box Operacional" onLeitura={confirmarLeituraAbertura} onManual={localizarManualAbertura} />
              <input
                className="campo"
                value={aberturaQr}
                onPaste={(event) => {
                  selecionarManualAbertura(event.clipboardData.getData("text"), "colado");
                  event.preventDefault();
                }}
                onChange={(event) => selecionarManualAbertura(event.target.value, "digitado")}
                placeholder="QR da abertura"
              />
              <p className={`rounded-card px-2 py-1 text-xs font-semibold ${classesSelo(estadoSelo(aberturaQr, aberturaConfirmacao, Boolean(aberturaBox)))}`}>
                {rotuloSelo(estadoSelo(aberturaQr, aberturaConfirmacao, Boolean(aberturaBox)), "Origem")}
              </p>
              {aberturaBox && !aberturaConfirmacao && <p className="text-xs text-destaque">Box localizado — leitura física do QR ainda pendente.</p>}
              {aberturaSemLocalFisico && <p className="rounded-card bg-destaque-clara px-3 py-2 text-sm text-destaque">Local físico não definido — configure o box antes da operação.</p>}
              {aberturaOrigemEntrada === "colado" && <p className="text-xs text-destaque">Código colado não confirma leitura física.</p>}
              {aberturaOrigemEntrada === "digitado" && <p className="text-xs text-destaque">Código digitado não confirma leitura física.</p>}
            </div>
            <div className="space-y-2 rounded-card bg-slate-50 p-3">
              <p className="text-sm font-semibold">Fechamento anterior</p>
              <p className="text-lg font-bold">{qtd(aberturaEsperado, aberturaUnidade)}</p>
              <p className="text-sm text-slate-600">Box: {aberturaBox ? `nº ${aberturaBox.numero}` : "—"}</p>
              <p className="text-sm text-slate-600">Produto/porcionamento: {aberturaProdutoId ? nomeProduto(db, aberturaProdutoId) : "Sem destinação — configure antes da operação."}</p>
              <p className="text-sm text-slate-600">Diferença na abertura: {qtd(aberturaResultadoDiferenca, aberturaUnidade)}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo={`Quantidade física contada${aberturaUnidade ? ` (${aberturaUnidade})` : ""}`}>
              <CampoQuantidade valor={aberturaContada} onChange={(valor) => { setAberturaContada(valor); setErroAbertura(null); }} />
            </Campo>
            <Campo rotulo={`Necessidade prevista do dia${aberturaUnidade ? ` (${aberturaUnidade})` : ""}`}>
              <CampoQuantidade valor={aberturaNecessidade} onChange={(valor) => { setAberturaNecessidade(valor); setErroAbertura(null); }} />
            </Campo>
          </div>
          <div className="grid gap-2 rounded-card bg-slate-50 p-3 text-sm sm:grid-cols-3">
            <p>
              <span className="rotulo">Utilizável</span>
              <span className="block text-lg font-bold">{qtd(origemQtdUtilizavel(), aberturaUnidade)}</span>
            </p>
            <p>
              <span className="rotulo">Reposição sugerida</span>
              <span className="block text-lg font-bold text-primaria">{qtd(aberturaSugestaoReposicao, aberturaUnidade)}</span>
            </p>
            <p>
              <span className="rotulo">Fechamento anterior</span>
              <span className="block text-lg font-bold">{qtd(aberturaEsperado, aberturaUnidade)}</span>
            </p>
          </div>
          <Campo rotulo="Justificativa de divergência">
            <textarea
              className="campo min-h-24"
              value={aberturaJustificativa}
              onChange={(event) => setAberturaJustificativa(event.target.value)}
              placeholder="Obrigatória se a contagem divergir do fechamento anterior"
            />
          </Campo>
          {aberturaDiferenca !== 0 && (
            <p className="rounded-card bg-destaque-clara px-3 py-2 text-sm text-destaque">
              Divergência de abertura: {qtd(aberturaDiferenca, aberturaUnidade)}.
              A reposição usará as porções fisicamente encontradas.
            </p>
          )}
          {erroAbertura && (
            <p className="rounded-card bg-erro-clara px-3 py-2 text-sm text-erro">
              <ShieldAlert size={14} className="mr-1 inline" /> {erroAbertura}
            </p>
          )}
          {aberturaResultado && (
            <Card className="space-y-2 border-2 border-sucesso bg-white">
              <p className="font-bold text-primaria-escura">Abertura registrada</p>
              <p className="text-sm">Box: {aberturaResultado.abertura.box_numero}</p>
              <p className="text-sm">Fechamento anterior: {qtd(aberturaResultado.abertura.quantidade_esperada ?? 0, aberturaUnidade)}</p>
              <p className="text-sm">Contado: {qtd(aberturaResultado.abertura.quantidade_contada ?? 0, aberturaUnidade)}</p>
              <p className="text-sm">Diferença: {qtd(aberturaResultado.abertura.delta ?? 0, aberturaUnidade)}</p>
              <p className="text-sm">Reposição sugerida: {qtd(aberturaResultado.reposicaoSugerida, aberturaUnidade)}</p>
            </Card>
          )}
           <button className="btn-gigante" disabled={!aberturaConfirmacao || aberturaSemLocalFisico} onClick={confirmarAbertura}>
            Confirmar abertura
          </button>
        </Card>
      )}

      {aba === "reposicao" && (
        <Card className="space-y-4">
          <p className="font-bold">Reposição</p>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-semibold">QR do Box Reserva (origem)</p>
              <CodeScanner rotulo="Escanear Box Reserva" onLeitura={(qr) => { selecionarManualReposicao(qr, "origem", "leitura"); confirmarLeituraReposicao(qr, "origem"); }} onManual={(qr) => localizarManualReposicao(qr, "origem")} />
              <input
                className="campo"
                value={reposicaoOrigemQr}
                onPaste={(event) => {
                  selecionarManualReposicao(event.clipboardData.getData("text"), "origem", "colado");
                  event.preventDefault();
                }}
                onChange={(event) => selecionarManualReposicao(event.target.value, "origem", "digitado")}
                placeholder="QR da origem"
              />
              <p className={`rounded-card px-2 py-1 text-xs font-semibold ${classesSelo(estadoSelo(reposicaoOrigemQr, reposicaoConfirmacaoOrigem, Boolean(reposicaoOrigem)))}`}>
                {rotuloSelo(estadoSelo(reposicaoOrigemQr, reposicaoConfirmacaoOrigem, Boolean(reposicaoOrigem)), "Origem")}
              </p>
              {reposicaoOrigem && !reposicaoConfirmacaoOrigem && <p className="text-xs text-destaque">Box localizado — leitura física do QR ainda pendente.</p>}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">QR do Box Operacional (destino)</p>
              <CodeScanner rotulo="Escanear Box Operacional" onLeitura={(qr) => { selecionarManualReposicao(qr, "destino", "leitura"); confirmarLeituraReposicao(qr, "destino"); }} onManual={(qr) => localizarManualReposicao(qr, "destino")} />
              <input
                className="campo"
                value={reposicaoDestinoQr}
                onPaste={(event) => {
                  selecionarManualReposicao(event.clipboardData.getData("text"), "destino", "colado");
                  event.preventDefault();
                }}
                onChange={(event) => selecionarManualReposicao(event.target.value, "destino", "digitado")}
                placeholder="QR do destino"
              />
              <p className={`rounded-card px-2 py-1 text-xs font-semibold ${classesSelo(estadoSelo(reposicaoDestinoQr, reposicaoConfirmacaoDestino, Boolean(reposicaoDestino)))}`}>
                {rotuloSelo(estadoSelo(reposicaoDestinoQr, reposicaoConfirmacaoDestino, Boolean(reposicaoDestino)), "Destino")}
              </p>
              {reposicaoDestino && !reposicaoConfirmacaoDestino && <p className="text-xs text-destaque">Box localizado — leitura física do QR ainda pendente.</p>}
              {reposicaoDestinoSemLocalFisico && <p className="rounded-card bg-destaque-clara px-3 py-2 text-sm text-destaque">Local físico não definido — configure o box antes da operação.</p>}
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="space-y-2 border border-slate-200 bg-slate-50">
              <p className="font-bold">Origem — Box Reserva</p>
              {reposicaoOrigem ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-slate-500">Número e QR</dt>
                  <dd className="font-medium">Box {reposicaoOrigem.numero} · {reposicaoOrigem.qr_code}</dd>
                  <dt className="text-slate-500">Tipo</dt>
                  <dd>{ROTULO_TIPO_BOX[reposicaoOrigem.tipo_box]}</dd>
                  <dt className="text-slate-500">Produto/porcionamento</dt>
                  <dd>{reposicaoOrigem.produto_id ? nomeProduto(db, reposicaoOrigem.produto_id) : "—"}</dd>
                  <dt className="text-slate-500">Unidade</dt>
                  <dd>{reposicaoOrigem.produto_id ? siglaUnidadeUso(db, reposicaoOrigem.produto_id) : "—"}</dd>
                  <dt className="text-slate-500">Saldo disponível</dt>
                  <dd>{qtd(saldoOrigemAtual, reposicaoOrigem.produto_id ? siglaUnidadeUso(db, reposicaoOrigem.produto_id) : undefined)}</dd>
                  <dt className="text-slate-500">Lote</dt>
                  <dd>{reposicaoLoteOrigem?.id ?? "—"}</dd>
                  <dt className="text-slate-500">Validade</dt>
                  <dd>{reposicaoLoteOrigem?.validade ? dataBR(reposicaoLoteOrigem.validade) : "—"}</dd>
                  <dt className="text-slate-500">Localização</dt>
                  <dd>{nomeLocal(db, reposicaoOrigem.local_id)}</dd>
                  <dt className="text-slate-500">Posição física</dt>
                  <dd>{ROTULO_POSICAO_BOX[reposicaoOrigem.posicao_fisica]}</dd>
                  <dt className="text-slate-500">Status da leitura</dt>
                  <dd>{reposicaoConfirmacaoOrigem ? "Fisicamente confirmado" : "Digitado — não confirmado"}</dd>
                </dl>
              ) : (
                <p className="text-sm text-slate-500">Localize uma Reserva para ver saldo, lote e validade.</p>
              )}
            </Card>
            <Card className="space-y-2 border border-slate-200 bg-slate-50">
              <p className="font-bold">Destino — Box Operacional</p>
              {reposicaoDestino ? (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-slate-500">Número e QR</dt>
                  <dd className="font-medium">Box {reposicaoDestino.numero} · {reposicaoDestino.qr_code}</dd>
                  <dt className="text-slate-500">Tipo</dt>
                  <dd>{ROTULO_TIPO_BOX[reposicaoDestino.tipo_box]}</dd>
                  <dt className="text-slate-500">Destinação ativa</dt>
                  <dd>{reposicaoDestinoProdutoId ? nomeProduto(db, reposicaoDestinoProdutoId) : "—"}</dd>
                  <dt className="text-slate-500">Unidade</dt>
                  <dd>{reposicaoDestinoProdutoId ? siglaUnidadeUso(db, reposicaoDestinoProdutoId) : "—"}</dd>
                  <dt className="text-slate-500">Saldo atual</dt>
                  <dd>{qtd(saldoDestinoAtual, reposicaoUnidade)}</dd>
                  <dt className="text-slate-500">Localização</dt>
                  <dd>{nomeLocal(db, reposicaoDestino.local_id)}</dd>
                  <dt className="text-slate-500">Posição física</dt>
                  <dd>{ROTULO_POSICAO_BOX[reposicaoDestino.posicao_fisica]}</dd>
                  <dt className="text-slate-500">Status da leitura</dt>
                  <dd>{reposicaoConfirmacaoDestino ? "Fisicamente confirmado" : "Digitado — não confirmado"}</dd>
                  <dt className="text-slate-500">Saldo projetado</dt>
                  <dd>{qtd(destinoDepoisProjetado, reposicaoUnidade)}</dd>
                </dl>
              ) : (
                <p className="text-sm text-slate-500">Localize um Operacional para ver destinação e saldo projetado.</p>
              )}
            </Card>
          </div>
          {reposicaoOrigem && reposicaoDestino && (
            <p className={`rounded-card px-3 py-2 text-sm font-semibold ${reposicaoCompativel ? "bg-sucesso-clara text-primaria-escura" : "bg-erro-clara text-erro"}`}>
              {reposicaoCompativel ? "Compatível" : "Incompatível"} — produto da Reserva {reposicaoOrigem.produto_id ? nomeProduto(db, reposicaoOrigem.produto_id) : "—"} e destinação do Operacional {reposicaoDestinoProdutoId ? nomeProduto(db, reposicaoDestinoProdutoId) : "—"}.
            </p>
          )}
          {reposicaoAvisosPapel.length > 0 && (
            <div className="space-y-2">
              {reposicaoAvisosPapel.map((aviso) => (
                <p key={aviso} className="rounded-card bg-erro-clara px-3 py-2 text-sm font-semibold text-erro">
                  <ShieldAlert size={14} className="mr-1 inline" /> {aviso}
                </p>
              ))}
            </div>
          )}
          <div className="grid gap-2 rounded-card bg-slate-50 p-3 text-sm sm:grid-cols-3">
            <p>
              <span className="rotulo">Quantidade a transferir</span>
              <span className="block text-lg font-bold">{qtd(quantidadeReposicao, reposicaoUnidade)}</span>
            </p>
            <p>
              <span className="rotulo">Reserva depois</span>
              <span className="block text-lg font-bold">{qtd(origemDepoisProjetada, reposicaoUnidade)}</span>
            </p>
            <p>
              <span className="rotulo">Operacional depois</span>
              <span className="block text-lg font-bold text-primaria">{qtd(destinoDepoisProjetado, reposicaoUnidade)}</span>
            </p>
          </div>
          <Campo rotulo={`Quantidade da transferência${reposicaoUnidade ? ` (${reposicaoUnidade})` : ""}`}>
            <CampoQuantidade valor={quantidadeTransferencia} passo={passoReposicao} casasDecimais={casasDecimaisReposicao} onChange={alterarQuantidadeReposicao} />
          </Campo>
          {reposicaoOrigem && quantidadeReposicao > saldoOrigemAtual && (
            <p className="rounded-card bg-erro-clara px-3 py-2 text-sm text-erro">Quantidade maior que o saldo disponível da origem.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn-secundario" onClick={() => setQuantidadeTransferencia(Math.min(clampQuantidade(aberturaSugestaoReposicao), reposicaoOrigem?.quantidade ?? 0))}>
              Usar sugestão da reposição pendente ({qtd(aberturaSugestaoReposicao, reposicaoUnidade)})
            </button>
            {reservaSugerida && (
              <div className="rounded-card border border-primaria/20 bg-white p-3 text-sm">
                <button className="btn-secundario" onClick={() => localizarManualReposicao(reservaSugerida.qr_code, "origem")}>
                  Selecionar origem FEFO sugerida
                </button>
                <p className="mt-2 font-semibold">Reserva FEFO: Box {reservaSugerida.numero} · {reservaSugerida.qr_code}</p>
                <p>Lote: {reservaSugerida.lote_id} · Validade: {reservaSugerida.validade ? dataBR(reservaSugerida.validade) : "—"} · Saldo: {qtd(reservaSugerida.quantidade_disponivel, reposicaoUnidade)}</p>
                <p className="text-slate-600">Motivo da prioridade FEFO: menor validade válida e saldo disponível fora de Quarentena.</p>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Bloqueios ativos: sem leitura de QR dos dois boxes, origem igual ao destino, quantidade zero/negativa, saldo insuficiente, incompatibilidade de produto/porcionamento, Quarentena e fluxo inverso Operacional → Reserva.
          </p>
          {erroReposicao && (
            <p className="rounded-card bg-erro-clara px-3 py-2 text-sm text-erro">
              <ShieldAlert size={14} className="mr-1 inline" /> {erroReposicao}
            </p>
          )}
          {comprovanteReposicao && (
            <Card className="space-y-2 border-2 border-sucesso bg-white">
              <p className="flex items-center gap-2 text-lg font-bold text-primaria-escura">
                <CheckCircle2 size={20} className="text-sucesso" /> Comprovante do movimento
              </p>
              <p className="text-sm">Movimento: {comprovanteReposicao.movimento_id}</p>
              <p className="text-sm">Motivo: REPOSICAO_OPERACIONAL</p>
              <p className="text-sm">Data e hora: {dataHoraBR(comprovanteReposicao.criado_em)}</p>
              <p className="text-sm">Usuário: {nomeUsuario(db, responsavelId)}</p>
              <p className="text-sm">Lote: {comprovanteReposicao.lote_id}</p>
              <p className="text-sm">Validade: {comprovanteReposicao.validade ? dataBR(comprovanteReposicao.validade) : "—"}</p>
              <p className="text-sm">Origem antes/depois: {qtd(comprovanteReposicao.saldo_origem_antes, reposicaoUnidade)} → {qtd(comprovanteReposicao.saldo_origem_depois, reposicaoUnidade)}</p>
              <p className="text-sm">Destino antes/depois: {qtd(comprovanteReposicao.saldo_destino_antes, reposicaoUnidade)} → {qtd(comprovanteReposicao.saldo_destino_depois, reposicaoUnidade)}</p>
            </Card>
          )}
           <button className="btn-gigante" disabled={!reposicaoConfirmacaoOrigem || !reposicaoConfirmacaoDestino || !reposicaoCompativel || !quantidadeReposicaoValida || reposicaoDestinoSemLocalFisico || reposicaoTemBloqueioPapel} onClick={confirmarReposicao}>
            Confirmar transferência
          </button>
        </Card>
      )}

      {aba === "fechamento" && (
        <Card className="space-y-4">
          <p className="font-bold">Fechamento do dia</p>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-semibold">QR do Box Operacional</p>
              <CodeScanner rotulo="Escanear Box Operacional" onLeitura={confirmarLeituraFechamento} onManual={localizarManualFechamento} />
              <input
                className="campo"
                value={fechamentoQr}
                onPaste={(event) => {
                  selecionarManualFechamento(event.clipboardData.getData("text"), "colado");
                  event.preventDefault();
                }}
                onChange={(event) => selecionarManualFechamento(event.target.value, "digitado")}
                placeholder="QR do fechamento"
              />
              <p className={`rounded-card px-2 py-1 text-xs font-semibold ${classesSelo(estadoSelo(fechamentoQr, fechamentoConfirmacao, Boolean(fechamentoBox)))}`}>
                {rotuloSelo(estadoSelo(fechamentoQr, fechamentoConfirmacao, Boolean(fechamentoBox)), "Origem")}
              </p>
              {fechamentoBox && !fechamentoConfirmacao && <p className="text-xs text-destaque">Box localizado — leitura física do QR ainda pendente.</p>}
              {fechamentoSemLocalFisico && <p className="rounded-card bg-destaque-clara px-3 py-2 text-sm text-destaque">Local físico não definido — configure o box antes da operação.</p>}
              {fechamentoOrigemEntrada === "colado" && <p className="text-xs text-destaque">Código colado não confirma leitura física.</p>}
              {fechamentoOrigemEntrada === "digitado" && <p className="text-xs text-destaque">Código digitado não confirma leitura física.</p>}
            </div>
            <div className="space-y-2 rounded-card bg-slate-50 p-3">
              <p className="text-sm font-semibold">Saldo esperado para fechamento</p>
              <p className="text-lg font-bold">{qtd(fechamentoEsperado, fechamentoUnidade)}</p>
              <p className="text-sm text-slate-600">Box: {fechamentoBox ? `nº ${fechamentoBox.numero}` : "—"}</p>
              <p className="text-sm text-slate-600">Produto/porcionamento: {fechamentoProdutoId ? nomeProduto(db, fechamentoProdutoId) : "—"}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo={`Quantidade física restante${fechamentoUnidade ? ` (${fechamentoUnidade})` : ""}`}>
              <CampoQuantidade valor={fechamentoContado} onChange={(valor) => { setFechamentoContado(valor); setErroFechamento(null); }} />
            </Campo>
            <Campo rotulo="Justificativa de divergência">
              <textarea
                className="campo min-h-24"
                value={fechamentoJustificativa}
                onChange={(event) => setFechamentoJustificativa(event.target.value)}
                placeholder="Obrigatória se o saldo contado divergir do saldo esperado"
              />
            </Campo>
          </div>
          <div className="grid gap-2 rounded-card bg-slate-50 p-3 text-sm sm:grid-cols-3">
            <p>
              <span className="rotulo">Diferença</span>
              <span className="block text-lg font-bold">{qtd(fechamentoResultadoDiferenca, fechamentoUnidade)}</span>
            </p>
            <p>
              <span className="rotulo">Sobra preservada</span>
              <span className="block text-lg font-bold">{qtd(fechamentoContado, fechamentoUnidade)}</span>
            </p>
            <p>
              <span className="rotulo">Abertura seguinte</span>
              <span className="block text-lg font-bold text-primaria">{qtd(fechamentoContado, fechamentoUnidade)}</span>
            </p>
          </div>
          {fechamentoDiferenca !== 0 && (
            <p className="rounded-card bg-destaque-clara px-3 py-2 text-sm text-destaque">
              Divergência de fechamento: {qtd(fechamentoDiferenca, fechamentoUnidade)}. A sobra fica no próprio Box Operacional e será a referência da próxima abertura.
            </p>
          )}
          {erroFechamento && (
            <p className="rounded-card bg-erro-clara px-3 py-2 text-sm text-erro">
              <ShieldAlert size={14} className="mr-1 inline" /> {erroFechamento}
            </p>
          )}
          {fechamentoResultado && (
            <Card className="space-y-2 border-2 border-sucesso bg-white">
              <p className="font-bold text-primaria-escura">Fechamento registrado</p>
              <p className="text-sm">Box: {fechamentoResultado.fechamento.box_numero}</p>
              <p className="text-sm">Esperado: {qtd(fechamentoResultado.fechamento.quantidade_esperada ?? 0, fechamentoUnidade)}</p>
              <p className="text-sm">Contado: {qtd(fechamentoResultado.fechamento.quantidade_contada ?? 0, fechamentoUnidade)}</p>
              <p className="text-sm">Diferença: {qtd(fechamentoResultado.fechamento.delta ?? 0, fechamentoUnidade)}</p>
            </Card>
          )}
           <button className="btn-gigante" disabled={!fechamentoConfirmacao || fechamentoSemLocalFisico} onClick={confirmarFechamento}>
            Confirmar fechamento
          </button>
        </Card>
      )}

      {aba === "divergencias" && (
        <Card className="space-y-3">
          <p className="flex items-center gap-2 font-bold"><TriangleAlert size={18} className="text-destaque" /> Divergências</p>
          {divergencias.length === 0 ? (
            <Vazio mensagem="Nenhuma divergência registrada ainda." />
          ) : (
            <div className="space-y-2">
              {divergencias.map((evento) => (
                <div key={evento.id} className="rounded-card border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">Box {evento.box_numero} · {eventoPorTipoDescricao(evento.tipo)}</p>
                    <Badge cor={evento.status_divergencia === "ajustada" ? "verde" : "laranja"}>{evento.status_divergencia ?? "aberta"}</Badge>
                  </div>
                  <p>Esperado: {qtd(evento.quantidade_esperada ?? 0, evento.produto_id ? siglaUnidadeUso(db, evento.produto_id) : undefined)} · Encontrado: {qtd(evento.quantidade_contada ?? 0, evento.produto_id ? siglaUnidadeUso(db, evento.produto_id) : undefined)} · Diferença: {qtd(evento.delta ?? 0, evento.produto_id ? siglaUnidadeUso(db, evento.produto_id) : undefined)}</p>
                  <p>Motivo: {evento.justificativa ?? evento.motivo ?? "—"}</p>
                  <p>Responsável: {nomeUsuario(db, evento.usuario_id)} · {dataHoraBR(evento.criado_em)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {aba === "historico" && (
        <Card className="space-y-3">
          <p className="flex items-center gap-2 font-bold"><History size={18} className="text-primaria" /> Histórico</p>
          <div className="grid gap-3 lg:grid-cols-4">
            <Campo rotulo="Data">
              <input className="campo" type="date" value={filtroHistoricoData} onChange={(event) => setFiltroHistoricoData(event.target.value)} />
            </Campo>
            <Campo rotulo="Box">
              <select className="campo" value={filtroHistoricoBoxId} onChange={(event) => setFiltroHistoricoBoxId(event.target.value)}>
                <option value="">Todos</option>
                {db.caixas.map((caixa) => (
                  <option key={caixa.id} value={caixa.id}>{`Box ${caixa.numero} · ${caixa.qr_code}`}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Produto">
              <select className="campo" value={filtroHistoricoProdutoId} onChange={(event) => setFiltroHistoricoProdutoId(event.target.value)}>
                <option value="">Todos</option>
                {db.produtos.map((produto) => (
                  <option key={produto.id} value={produto.id}>{produto.nome}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Tipo de evento">
              <select className="campo" value={filtroHistoricoTipo} onChange={(event) => setFiltroHistoricoTipo(event.target.value as TipoFiltroEventoOperacaoBox)}>
                <option value="todos">Todos</option>
                <option value="abertura">Abertura</option>
                <option value="reposicao">Reposição</option>
                <option value="fechamento">Fechamento</option>
                <option value="divergencia">Divergência</option>
                <option value="ajuste_inventario">Ajuste de inventário</option>
              </select>
            </Campo>
          </div>
          {historicoFiltrado.length === 0 ? (
            <Vazio mensagem="Nenhum evento encontrado com os filtros atuais." />
          ) : (
            <div className="space-y-2">
              {historicoFiltrado.map((evento) => (
                <div key={evento.id} className="rounded-card border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{eventoPorTipoDescricao(evento.tipo)} · Box {evento.box_numero}</p>
                    <span className="text-xs text-slate-500">{dataHoraBR(evento.criado_em)}</span>
                  </div>
                  <p>Produto/porcionamento: {evento.produto_id ? nomeProduto(db, evento.produto_id) : "—"}</p>
                  <p>Lote: {evento.lote_id ?? "—"} · Validade: {evento.validade ? dataBR(evento.validade) : "—"}</p>
                  <p>Quantidade: {qtd(evento.quantidade ?? 0, evento.produto_id ? siglaUnidadeUso(db, evento.produto_id) : undefined)}</p>
                  <p>Saldo anterior/posterior: {qtd(evento.saldo_anterior ?? 0, evento.produto_id ? siglaUnidadeUso(db, evento.produto_id) : undefined)} → {qtd(evento.saldo_posterior ?? 0, evento.produto_id ? siglaUnidadeUso(db, evento.produto_id) : undefined)}</p>
                  {evento.origem_qr_code && evento.destino_qr_code && (
                    <p>Origem/Destino: {evento.origem_qr_code} → {evento.destino_qr_code}</p>
                  )}
                  {(evento.justificativa || evento.motivo) && <p>Justificativa: {evento.justificativa ?? evento.motivo}</p>}
                  <p>Usuário: {nomeUsuario(db, evento.usuario_id)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card className="space-y-2 border-2 border-primaria bg-white">
        <p className="font-bold">Resumo persistido</p>
        <p className="text-sm text-slate-600">Os eventos ficam no mesmo banco mock/localStorage do resto do projeto, então reload preserva abertura, reposição, fechamento, divergências e histórico.</p>
        <p className="text-sm text-slate-600">Total de eventos: {db.eventos_box_operacional.length}</p>
      </Card>

      <Card>
        <Link className="btn-secundario" href="/estoque">
          Voltar para Estoque
        </Link>
      </Card>
    </div>
  );
}
