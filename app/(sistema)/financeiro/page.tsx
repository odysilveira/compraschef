"use client";

// Financeiro — agenda de boletos (requisitos 27–30).
// Protegida: líder/caixa não veem nada daqui (podeVerValores).

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import {
  Ban,
  Barcode,
  CalendarDays,
  CircleCheck,
  CircleCheckBig,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Phone,
  Plus,
  ReceiptText,
  RefreshCcw,
  ScanLine,
  Search,
  ShieldAlert,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { Badge, Card, Modal, Tabela, TituloPagina, Vazio } from "@/components/ui";
import ConferenciaFinanceira from "@/components/financeiro/ConferenciaFinanceira";
import { VistaNotaEstiloDanfe } from "@/components/financeiro/VistaNotaEstiloDanfe";
import { calcularValorFinal, criarContaManual, getDB, limparNotasEBoletos, mutate, nomeFornecedor, uid, useDB } from "@/lib/data";
import { identificarFormatoBoleto, normalizarLinhaBoleto } from "@/lib/domain/boletos";
import { calcularHashSHA256, receberBoletoContaPagar, validarArquivoDocumentoBoleto } from "@/lib/domain/documentos-boleto";
import { filtrarContasPagar, resumirContasPagar, type FiltroVencimentoConta } from "@/lib/domain/financeiro";
import {
  combinarTextosPdfFragmentados,
  identificarCodigoBoletoNoArquivoLocal,
  type DiagnosticoIdentificacaoBoleto,
  type ResultadoIdentificacaoArquivoBoleto,
} from "@/lib/domain/identificacao-boleto-browser";
import { configurarWorkerPdfjs } from "@/lib/domain/pdfjs-worker";
import type { BoletoValidoIdentificado } from "@/lib/domain/identificacao-boleto";
import {
  confrontarBoletoComNfe,
  extrairDadosEstruturadosDoBoleto,
  type DadosBoletoExtraidos,
  type ResultadoConfrontoBoletoNfe,
} from "@/lib/domain/boleto-nfe-confronto";
import { confirmarConfrontoBoleto } from "@/lib/domain/confirmacao-confronto-boleto";
import { lerArquivoDocumentoBoletoIdb, salvarArquivoDocumentoBoletoIdb } from "@/lib/domain/documentos-boleto-arquivo-idb";
import { listarRegistrosLoteIdb, registroIdbParaArquivo } from "@/lib/domain/lote-recebimento-idb";
import { receberBoletoPendenteNaConferencia, detectarBoletoJaPago } from "@/lib/domain/pareamento-nfe-boleto";
import { criarParcelaAguardandoDocumento } from "@/lib/domain/parcela-nota";
import { corrigirFornecedorNotaFiscal } from "@/lib/domain/nfe-completude";
import {
  abrirModalCorrecaoNfe,
  detalharNotaFiscalFinanceiro,
  listarNotasFiscaisFinanceiro,
  rotuloStatusPagamentoNota,
  statusPagamentoNota,
  type EstadoModalCorrecaoNfe,
  type IndicadorCompletudeFinanceiro,
  type StatusPagamentoNota,
} from "@/lib/domain/nfe-financeiro";
import {
  apresentarResultadoConfronto,
  candidatoSelecionadoEhValido,
  mascararLinhaDigitavel,
  valorValidadoComoMoeda,
} from "@/lib/domain/importar-boleto-ui";
import {
  alternarCodigoAberto,
  acoesPagamentoDisponiveisNoLayout,
  avaliarElegibilidadePagamentoBoleto,
  conciliarBoleto,
  criarSnapshotPagamentoBoleto,
  gerarPadraoInterleaved2of5,
  informarPagamentoBoleto,
  boletoProntoParaAgendaPagamentos,
  listarBancosContasUsados,
  montarEstadoAgendaPagamentoBoleto,
  type SegmentoCodigoBarrasItf,
  type SnapshotPagamentoBoleto,
} from "@/lib/domain/pagar-boleto";
import {
  CLASSE_CAIXA_CODIGO_SEM_ROLAGEM,
  CLASSE_GRID_CODIGO_PAGAMENTO,
  acoesUnicasQuandoCodigoAberto,
  fecharCodigoAmpliado,
  montarConfiguracaoSvgCodigo,
  type EstadoCodigoAmpliado,
} from "@/lib/domain/codigo-pagamento-ui";
import {
  hidratarFilaLoteDoIdb,
  marcarItemConcluido,
  obterArquivoFilaAsync,
} from "@/lib/domain/lote-recebimento-store";
import {
  fornecedorDoPagamento,
  notaDoPagamento,
  rotuloMeioPagamento,
  rotuloStatusDocumentoFiscal,
  statusDocumentoFiscalEfetivo,
  sugerirVinculosNfseParaPagamentos,
  vincularNotaAoPagamento,
} from "@/lib/domain/pagamento-documento-fiscal";
import { podeVerValores, usePapel } from "@/lib/roles";
import { cnpjBR, dataBR, diasAte, moeda } from "@/lib/format";
import type { Boleto, ContaPagar, DB, OrigemContaPagar, StatusBoleto, StatusContaPagar } from "@/lib/types";

const MARCA_GOLPE = "GOLPE CONFIRMADO";

type FormContaState = {
  fornecedor_id: string;
  descricao: string;
  categoria: string;
  centro_custo: string;
  documento_id: string;
  data_emissao: string;
  data_vencimento: string;
  valor_original: string;
  juros: string;
  desconto: string;
  observacoes: string;
};

type FormReceberBoletoState = {
  arquivo: File | null;
  linha: string;
};

type FormPagamentoBoletoState = {
  dataPagamento: string;
  valorPago: string;
  bancoConta: string;
  responsavel: string;
  observacao: string;
  confirmouAviso: boolean;
};

type EtapaImportacaoBoleto = "lendo_documento" | "validando_codigo" | "procurando_nfe" | "resultado";

type EstadoImportacaoBoleto = {
  arquivo: File | null;
  conteudo?: ArrayBuffer;
  hash?: string;
  linhaSelecionada?: string;
  dadosExtraidos?: DadosBoletoExtraidos;
  confronto?: ResultadoConfrontoBoletoNfe;
  diagnostico?: DiagnosticoIdentificacaoBoleto | null;
  etapa?: EtapaImportacaoBoleto;
  falha?: string;
};

const STATUS_CONTA_OPCOES: Array<{ valor: StatusContaPagar | "todos"; rotulo: string }> = [
  { valor: "todos", rotulo: "Todos os status" },
  { valor: "aguardando_boleto", rotulo: "Aguardando boleto" },
  { valor: "boleto_recebido", rotulo: "Boleto recebido" },
  { valor: "em_conferencia", rotulo: "Em conferência" },
  { valor: "compativel", rotulo: "Compatível" },
  { valor: "divergente", rotulo: "Divergente" },
  { valor: "bloqueado", rotulo: "Bloqueado" },
  { valor: "aguardando_conciliacao", rotulo: "Aguardando conciliação bancária" },
  { valor: "conciliado", rotulo: "Conciliado" },
  { valor: "cancelado", rotulo: "Cancelado" },
];

const FILTRO_VENCIMENTO_OPCOES: Array<{ valor: FiltroVencimentoConta; rotulo: string }> = [
  { valor: "todas", rotulo: "Todos os vencimentos" },
  { valor: "hoje", rotulo: "Vencendo hoje" },
  { valor: "proximos_7_dias", rotulo: "Próximos 7 dias" },
  { valor: "atrasadas", rotulo: "Atrasadas" },
];

const FILTRO_COMPLETUDE_NFE_OPCOES: Array<{ valor: "todas" | IndicadorCompletudeFinanceiro; rotulo: string }> = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "Completa", rotulo: "Completa" },
  { valor: "Falta fornecedor", rotulo: "Falta fornecedor" },
  { valor: "Faltam dados fiscais", rotulo: "Faltam dados fiscais" },
  { valor: "Faltam dados de parcela", rotulo: "Faltam dados de parcela" },
  { valor: "Sem boleto informado", rotulo: "Sem boleto informado" },
];

const FILTRO_STATUS_PAGAMENTO_NFE_OPCOES: Array<{ valor: "todas" | StatusPagamentoNota; rotulo: string }> = [
  { valor: "todas", rotulo: "Todos os pagamentos" },
  { valor: "sem_boleto", rotulo: "Sem boleto / a conferir" },
  { valor: "aguardando_pagamento", rotulo: "Aguardando pagamento" },
  { valor: "parcialmente_paga", rotulo: "Parcialmente paga" },
  { valor: "quitada", rotulo: "Quitada (arquivo)" },
];

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function novaContaInicial(): FormContaState {
  return {
    fornecedor_id: "",
    descricao: "",
    categoria: "",
    centro_custo: "",
    documento_id: "",
    data_emissao: hojeISO(),
    data_vencimento: "",
    valor_original: "",
    juros: "",
    desconto: "",
    observacoes: "",
  };
}

function novoRecebimentoBoletoInicial(): FormReceberBoletoState {
  return {
    arquivo: null,
    linha: "",
  };
}

function novoPagamentoBoletoInicial(): FormPagamentoBoletoState {
  return {
    dataPagamento: hojeISO(),
    valorPago: "",
    bancoConta: "",
    responsavel: "usuário local",
    observacao: "",
    confirmouAviso: false,
  };
}

function novoEstadoImportacaoBoleto(): EstadoImportacaoBoleto {
  return {
    arquivo: null,
    diagnostico: null,
  };
}

function resumirCodigoParaEscolha(codigo: string): string {
  if (codigo.length <= 12) return codigo;
  return `${codigo.slice(0, 8)}...${codigo.slice(-6)}`;
}

function lerNumero(valor: string): number | undefined {
  if (valor.trim() === "") return undefined;
  const numero = Number(valor.replace(",", "."));
  return Number.isFinite(numero) ? numero : undefined;
}

function mascararCnpj(valor?: string): string {
  const digitos = (valor ?? "").replace(/\D+/g, "");
  if (digitos.length !== 14) return "—";
  return `**.***.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
}

function mascararChaveNfe(chave?: string): string {
  if (!chave) return "—";
  const digitos = chave.replace(/\D+/g, "");
  if (digitos.length <= 8) return digitos;
  return `${digitos.slice(0, 6)}...${digitos.slice(-4)}`;
}

function rotuloParcela(numeroParcela?: string): string {
  const numero = (numeroParcela ?? "").trim();
  if (!numero) return "Parcela —";
  if (/^\d+$/.test(numero)) return `Parcela ${numero.padStart(3, "0")}`;
  return `Parcela ${numero}`;
}

function rotuloOrigemConta(origem: OrigemContaPagar): string {
  return {
    manual: "Manual",
    nfe: "NF-e",
    nfse: "NFS-e",
    recorrente: "Recorrente",
  }[origem];
}

function rotuloStatusConta(status: StatusContaPagar): string {
  return {
    aguardando_boleto: "Aguardando boleto",
    boleto_recebido: "Boleto recebido",
    em_conferencia: "Em conferência",
    compativel: "Compatível",
    divergente: "Divergente",
    bloqueado: "Bloqueado",
    aguardando_conciliacao: "Aguardando conciliação bancária",
    conciliado: "Conciliado",
    cancelado: "Cancelado",
  }[status];
}

function BadgeStatusConta({ status }: { status: StatusContaPagar }) {
  switch (status) {
    case "aguardando_boleto":
      return (
        <Badge cor="cinza">
          <ReceiptText size={14} /> aguardando boleto
        </Badge>
      );
    case "boleto_recebido":
      return (
        <Badge cor="azul">
          <ReceiptText size={14} /> boleto recebido
        </Badge>
      );
    case "em_conferencia":
      return (
        <Badge cor="laranja">
          <Clock3 size={14} /> em conferência
        </Badge>
      );
    case "compativel":
      return (
        <Badge cor="verde">
          <CircleCheck size={14} /> compatível
        </Badge>
      );
    case "divergente":
      return (
        <Badge cor="vermelho">
          <TriangleAlert size={14} /> divergente
        </Badge>
      );
    case "bloqueado":
      return (
        <Badge cor="cinza">
          <Lock size={14} /> bloqueado
        </Badge>
      );
    case "aguardando_conciliacao":
      return (
        <Badge cor="azul">
          <Clock3 size={14} /> aguardando conciliação bancária
        </Badge>
      );
    case "conciliado":
      return (
        <Badge cor="verde">
          <CircleCheckBig size={14} /> conciliado
        </Badge>
      );
    case "cancelado":
      return (
        <Badge cor="cinza">
          <Ban size={14} /> cancelado
        </Badge>
      );
  }
}

function BannerMensagemFinanceiro({ texto }: { texto: string }) {
  const alerta = /^atenção/i.test(texto.trim());
  return (
    <div
      className={`rounded-card border px-4 py-3 text-sm font-medium ${
        alerta
          ? "border-destaque bg-destaque-clara text-destaque"
          : "border-sucesso bg-sucesso-clara text-primaria-escura"
      }`}
    >
      {texto}
    </div>
  );
}

function BadgeStatusPagamentoNota({ status }: { status: StatusPagamentoNota }) {
  if (status === "quitada") {
    return (
      <Badge cor="verde">
        <CircleCheckBig size={14} /> {rotuloStatusPagamentoNota(status)}
      </Badge>
    );
  }
  if (status === "parcialmente_paga") {
    return (
      <Badge cor="azul">
        <Clock3 size={14} /> {rotuloStatusPagamentoNota(status)}
      </Badge>
    );
  }
  if (status === "aguardando_pagamento") {
    return (
      <Badge cor="laranja">
        <Clock3 size={14} /> {rotuloStatusPagamentoNota(status)}
      </Badge>
    );
  }
  return (
    <Badge cor="cinza">
      <ReceiptText size={14} /> {rotuloStatusPagamentoNota(status)}
    </Badge>
  );
}

function BadgeCompletudeNfeFinanceiro({ indicador }: { indicador: IndicadorCompletudeFinanceiro }) {
  if (indicador === "Completa") {
    return (
      <Badge cor="verde">
        <CircleCheckBig size={14} /> Completa
      </Badge>
    );
  }

  if (indicador === "Falta fornecedor") {
    return (
      <Badge cor="vermelho">
        <TriangleAlert size={14} /> Falta fornecedor
      </Badge>
    );
  }

  if (indicador === "Faltam dados fiscais") {
    return (
      <Badge cor="vermelho">
        <TriangleAlert size={14} /> Faltam dados fiscais
      </Badge>
    );
  }

  if (indicador === "Faltam dados de parcela") {
    return (
      <Badge cor="laranja">
        <TriangleAlert size={14} /> Faltam dados de parcela
      </Badge>
    );
  }

  return (
    <Badge cor="laranja">
      <ReceiptText size={14} /> Sem boleto informado
    </Badge>
  );
}

function fornecedorDoBoleto(db: DB, boleto: Boleto): string {
  return fornecedorDoPagamento(db, boleto);
}

function notaDoBoleto(db: DB, boleto: Boleto) {
  return notaDoPagamento(db, boleto);
}

function golpeConfirmado(b: Boleto): boolean {
  return b.status === "suspeito" && Boolean(b.observacao?.startsWith(MARCA_GOLPE));
}

function BadgeStatus({ boleto }: { boleto: Boleto }) {
  if (golpeConfirmado(boleto)) {
    return (
      <Badge cor="cinza">
        <Ban size={14} /> golpe — cancelado
      </Badge>
    );
  }
  switch (boleto.status) {
    case "travado":
      return (
        <Badge cor="cinza">
          <Lock size={14} /> travado
        </Badge>
      );
    case "liberado":
      return (
        <Badge cor="verde">
          <CircleCheck size={14} /> liberado
        </Badge>
      );
    case "pago":
      return (
        <Badge cor="verde">
          <CircleCheckBig size={14} /> pago
        </Badge>
      );
    case "aguardando_conciliacao":
      return (
        <Badge cor="azul">
          <Clock3 size={14} /> aguardando conciliação bancária
        </Badge>
      );
    case "suspeito":
      return (
        <Badge cor="vermelho">
          <TriangleAlert size={14} /> suspeito
        </Badge>
      );
  }
}

export default function FinanceiroPage() {
  const db = useDB();
  const { papel } = usePapel();
  const handoffLoteProcessado = useRef<string | null>(null);
  const [itemLoteBoletoId, setItemLoteBoletoId] = useState<string | null>(null);


  const [confirmandoLiberacao, setConfirmandoLiberacao] = useState<string | null>(null);
  const [abaFinanceira, setAbaFinanceira] = useState<
    "pagamentos" | "conferencia" | "conciliacao" | "contas" | "notas" | "boletos_pagos"
  >("pagamentos");
  const [buscaBoletosPagos, setBuscaBoletosPagos] = useState("");
  const [abrindoPdfArquivoId, setAbrindoPdfArquivoId] = useState<string | null>(null);
  const [modalNovaContaAberto, setModalNovaContaAberto] = useState(false);
  const [buscaConta, setBuscaConta] = useState("");
  const [filtroStatusConta, setFiltroStatusConta] = useState<StatusContaPagar | "todos">("todos");
  const [filtroVencimentoConta, setFiltroVencimentoConta] = useState<FiltroVencimentoConta>("todas");
  const [buscaNfe, setBuscaNfe] = useState("");
  const [filtroCompletudeNfe, setFiltroCompletudeNfe] = useState<"todas" | IndicadorCompletudeFinanceiro>("todas");
  const [filtroStatusPagamentoNfe, setFiltroStatusPagamentoNfe] = useState<"todas" | StatusPagamentoNota>("todas");
  const [notaDetalhesId, setNotaDetalhesId] = useState<string | null>(null);
  const [estadoCorrecaoNfe, setEstadoCorrecaoNfe] = useState<EstadoModalCorrecaoNfe | null>(null);
  const [mensagemCorrecaoNfe, setMensagemCorrecaoNfe] = useState<string | null>(null);
  const [erroCorrecaoNfe, setErroCorrecaoNfe] = useState<string | null>(null);
  const [salvandoCorrecaoNfe, setSalvandoCorrecaoNfe] = useState(false);
  const [formConta, setFormConta] = useState<FormContaState>(novaContaInicial());
  const [erroFormConta, setErroFormConta] = useState<string | null>(null);
  const [contaSelecionadaBoletoId, setContaSelecionadaBoletoId] = useState<string | null>(null);
  const [formReceberBoleto, setFormReceberBoleto] = useState<FormReceberBoletoState>(novoRecebimentoBoletoInicial());
  const [erroReceberBoleto, setErroReceberBoleto] = useState<string | null>(null);
  const [mensagemReceberBoleto, setMensagemReceberBoleto] = useState<string | null>(null);
  const [processandoRecebimentoBoleto, setProcessandoRecebimentoBoleto] = useState(false);
  const [identificandoCodigoBoleto, setIdentificandoCodigoBoleto] = useState(false);
  const [mensagemIdentificacaoBoleto, setMensagemIdentificacaoBoleto] = useState<string | null>(null);
  const [opcoesIdentificacaoBoleto, setOpcoesIdentificacaoBoleto] = useState<BoletoValidoIdentificado[]>([]);
  const [diagnosticoIdentificacao, setDiagnosticoIdentificacao] = useState<DiagnosticoIdentificacaoBoleto | null>(null);
  const [modalImportarBoletoAberto, setModalImportarBoletoAberto] = useState(false);
  const [boletoImportacaoAlvoId, setBoletoImportacaoAlvoId] = useState<string | null>(null);
  const [estadoImportacaoBoleto, setEstadoImportacaoBoleto] = useState<EstadoImportacaoBoleto>(novoEstadoImportacaoBoleto());
  const [processandoImportacaoBoleto, setProcessandoImportacaoBoleto] = useState(false);
  const [mostrarLinhaCompletaImportada, setMostrarLinhaCompletaImportada] = useState(false);
  const [mostrarDetalhesTecnicos, setMostrarDetalhesTecnicos] = useState(false);
  const [justificativaImportacao, setJustificativaImportacao] = useState("");
  const [parcelaSelecionadaMultipla, setParcelaSelecionadaMultipla] = useState("");
  const [notaVinculoManualId, setNotaVinculoManualId] = useState("");
  const [mensagemImportacaoBoleto, setMensagemImportacaoBoleto] = useState<string | null>(null);
  const [boletoResumoId, setBoletoResumoId] = useState<string | null>(null);
  const [boletoCodigoAbertoId, setBoletoCodigoAbertoId] = useState<string | null>(null);
  const [codigoAmpliado, setCodigoAmpliado] = useState<EstadoCodigoAmpliado | null>(null);
  const [boletoLinhaCompletaId, setBoletoLinhaCompletaId] = useState<string | null>(null);
  const [boletoPagamentoId, setBoletoPagamentoId] = useState<string | null>(null);
  const [snapshotPagamento, setSnapshotPagamento] = useState<SnapshotPagamentoBoleto | null>(null);
  const [formPagamentoBoleto, setFormPagamentoBoleto] = useState<FormPagamentoBoletoState>(novoPagamentoBoletoInicial());
  const [erroPagamentoBoleto, setErroPagamentoBoleto] = useState<string | null>(null);
  const [mensagemPagamentoBoleto, setMensagemPagamentoBoleto] = useState<string | null>(null);
  const [processandoPagamentoBoleto, setProcessandoPagamentoBoleto] = useState(false);
  const [boletoDestaqueId, setBoletoDestaqueId] = useState<string | null>(null);
  const [boletoConciliandoId, setBoletoConciliandoId] = useState<string | null>(null);
  const [confirmouDataBancoConciliacao, setConfirmouDataBancoConciliacao] = useState(false);
  const [erroConciliacaoBoleto, setErroConciliacaoBoleto] = useState<string | null>(null);
  const [processandoConciliacaoBoleto, setProcessandoConciliacaoBoleto] = useState(false);
  const inputLinhaRef = useRef<HTMLInputElement | null>(null);
  const execucaoIdentificacaoRef = useRef(0);
  const contaSelecionadaBoletoIdRef = useRef<string | null>(null);
  const salvandoCorrecaoNfeRef = useRef(false);
  const processandoPagamentoBoletoRef = useRef(false);

  useEffect(() => {
    if (!boletoDestaqueId) return;
    const timer = window.setTimeout(() => setBoletoDestaqueId(null), 8000);
    const scrollTimer = window.setTimeout(() => {
      document
        .getElementById(`boleto-card-${boletoDestaqueId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(scrollTimer);
    };
  }, [boletoDestaqueId]);

  useEffect(() => {
    if (!codigoAmpliado) return;
    function aoTeclar(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setCodigoAmpliado(fecharCodigoAmpliado());
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [codigoAmpliado]);

  if (!podeVerValores(papel)) {
    return (
      <div className="mx-auto max-w-lg">
        <TituloPagina titulo="Financeiro" />
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Lock size={48} className="text-slate-400" />
          <p className="text-lg font-bold">Área restrita</p>
          <p className="text-sm text-slate-600">
            Boletos, notas e valores são visíveis apenas para o dono e o gerente. Se precisar de algo daqui, fale com
            eles.
          </p>
        </Card>
      </div>
    );
  }

  function mudarBoleto(id: string, mudanca: (b: Boleto) => void) {
    mutate((d) => {
      const b = d.boletos.find((x) => x.id === id);
      if (b) mudanca(b);
    });
  }

  function abrirPagamentoBoleto(boleto: Boleto) {
    const elegibilidade = avaliarElegibilidadePagamentoBoleto(boleto);
    if (!elegibilidade.permitido) {
      setMensagemReceberBoleto(elegibilidade.mensagem);
      return;
    }

    setBoletoPagamentoId(boleto.id);
    setSnapshotPagamento(criarSnapshotPagamentoBoleto(boleto));
    setFormPagamentoBoleto({
      ...novoPagamentoBoletoInicial(),
      valorPago: boleto.valor.toFixed(2),
    });
    setErroPagamentoBoleto(null);
    setMensagemPagamentoBoleto(null);
  }

  function fecharPagamentoBoleto() {
    if (processandoPagamentoBoleto) return;
    setBoletoPagamentoId(null);
    setSnapshotPagamento(null);
    setFormPagamentoBoleto(novoPagamentoBoletoInicial());
    setErroPagamentoBoleto(null);
    setMensagemPagamentoBoleto(null);
  }

  async function copiarLinhaAgenda(linha?: string) {
    if (!linha) {
      setMensagemReceberBoleto("Não há linha digitável disponível para cópia neste boleto.");
      return;
    }
    try {
      await navigator.clipboard.writeText(linha);
      setMensagemReceberBoleto("Linha digitável copiada.");
    } catch {
      setMensagemReceberBoleto("Não foi possível copiar a linha digitável neste navegador.");
    }
  }

  function atualizarCampoPagamento<K extends keyof FormPagamentoBoletoState>(
    campo: K,
    valor: FormPagamentoBoletoState[K]
  ) {
    setFormPagamentoBoleto((atual) => ({ ...atual, [campo]: valor }));
  }

  function confirmarPagamentoBoleto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (processandoPagamentoBoletoRef.current) return;

    const boletoId = boletoPagamentoId;
    const snapshot = snapshotPagamento;
    if (!boletoId || !snapshot) return;

    const valorPago = lerNumero(formPagamentoBoleto.valorPago);
    if (valorPago === undefined) {
      setErroPagamentoBoleto("Informe o valor pago.");
      return;
    }

    processandoPagamentoBoletoRef.current = true;
    setProcessandoPagamentoBoleto(true);
    setErroPagamentoBoleto(null);
    setMensagemPagamentoBoleto(null);

    try {
      let falhou: string | null = null;
      mutate((atual) => {
        const resultado = informarPagamentoBoleto(
          atual,
          boletoId,
          snapshot,
          {
            dataPagamento: formPagamentoBoleto.dataPagamento,
            valorPago,
            bancoConta: formPagamentoBoleto.bancoConta,
            responsavel: formPagamentoBoleto.responsavel,
            observacao: formPagamentoBoleto.observacao,
            confirmouAviso: formPagamentoBoleto.confirmouAviso,
          },
          {
            responsavelPadrao: "usuário local",
            gerarIdHistorico: () => uid("bph"),
          }
        );
        if (!resultado.sucesso) {
          falhou = resultado.erros.join(" ") || "Não foi possível informar o pagamento.";
        }
      });

      if (falhou) {
        setErroPagamentoBoleto(falhou);
        return;
      }

      setMensagemReceberBoleto(
        "Pagamento informado. Confira data e banco na aba Conciliação bancária — a baixa final só acontece depois de você confirmar no extrato."
      );
      setBoletoPagamentoId(null);
      setSnapshotPagamento(null);
      setFormPagamentoBoleto(novoPagamentoBoletoInicial());
      setErroPagamentoBoleto(null);
      setMensagemPagamentoBoleto(null);
      setBoletoDestaqueId(boletoId);
      setBoletoConciliandoId(boletoId);
      setConfirmouDataBancoConciliacao(false);
      setErroConciliacaoBoleto(null);
      setAbaFinanceira("conciliacao");
    } catch (erro) {
      setErroPagamentoBoleto(
        erro instanceof Error ? erro.message : "Falha inesperada ao informar o pagamento."
      );
    } finally {
      processandoPagamentoBoletoRef.current = false;
      setProcessandoPagamentoBoleto(false);
    }
  }

  function abrirConciliacaoBoleto(boletoId: string) {
    setAbaFinanceira("conciliacao");
    setBoletoConciliandoId(boletoId);
    setBoletoDestaqueId(boletoId);
    setConfirmouDataBancoConciliacao(false);
    setErroConciliacaoBoleto(null);
  }

  function confirmarConciliacaoBoleto(boletoId: string) {
    if (processandoConciliacaoBoleto) return;
    setProcessandoConciliacaoBoleto(true);
    setErroConciliacaoBoleto(null);

    try {
      let falhou: string | null = null;
      mutate((atual) => {
        const resultado = conciliarBoleto(
          atual,
          boletoId,
          {
            confirmouDataEBanco: confirmouDataBancoConciliacao,
            responsavel: "usuário local",
          },
          { gerarIdHistorico: () => uid("bph") }
        );
        if (!resultado.sucesso) {
          falhou = resultado.erros.join(" ") || "Não foi possível conciliar o boleto.";
        }
      });

      if (falhou) {
        setErroConciliacaoBoleto(falhou);
        return;
      }

      setMensagemReceberBoleto("Conciliação confirmada. O boleto foi marcado como pago.");
      setBoletoConciliandoId(null);
      setConfirmouDataBancoConciliacao(false);
      setBoletoDestaqueId(boletoId);
      setAbaFinanceira("pagamentos");
    } catch (erro) {
      setErroConciliacaoBoleto(
        erro instanceof Error ? erro.message : "Falha inesperada ao conciliar."
      );
    } finally {
      setProcessandoConciliacaoBoleto(false);
    }
  }

  function liberarMesmoAssim(b: Boleto) {
    mudarBoleto(b.id, (x) => {
      x.status = "liberado";
      x.observacao = "Liberado manualmente antes da conferência da mercadoria";
    });
    setConfirmandoLiberacao(null);
  }

  function confirmarLegitimo(b: Boleto) {
    mudarBoleto(b.id, (x) => {
      x.status = "liberado";
      x.observacao = "Confirmado com o fornecedor por telefone — boleto legítimo";
    });
  }

  function confirmarGolpe(b: Boleto) {
    const ok = window.confirm(
      "Confirmar que este boleto é um golpe? Ele será cancelado e ficará arquivado como fraude. Não pague este boleto."
    );
    if (!ok) return;
    mudarBoleto(b.id, (x) => {
      x.observacao = `${MARCA_GOLPE} — boleto cancelado em ${dataBR(new Date().toISOString())}. Não pagar. Avise o fornecedor e o banco.`;
    });
  }

  const suspeitos = db.boletos.filter((b) => b.status === "suspeito" && !golpeConfirmado(b));
  const contas = Array.isArray(db.contas_pagar) ? db.contas_pagar : [];
  const fornecedoresPorId = useMemo(
    () => Object.fromEntries(db.fornecedores.map((fornecedor) => [fornecedor.id, fornecedor.nome])),
    [db.fornecedores]
  );
  const resumoContas = useMemo(() => resumirContasPagar(contas), [contas]);
  const contasFiltradas = useMemo(
    () =>
      filtrarContasPagar(contas, {
        texto: buscaConta,
        status: filtroStatusConta,
        vencimento: filtroVencimentoConta,
        fornecedorPorId: fornecedoresPorId,
      }),
    [contas, buscaConta, filtroStatusConta, filtroVencimentoConta, fornecedoresPorId]
  );
  const contaSelecionadaBoleto = contaSelecionadaBoletoId
    ? contas.find((conta) => conta.id === contaSelecionadaBoletoId) ?? null
    : null;
  const notasFiscaisFinanceiro = useMemo(
    () =>
      listarNotasFiscaisFinanceiro(db, {
        pesquisa: buscaNfe,
        completude: filtroCompletudeNfe,
        statusPagamento: filtroStatusPagamentoNfe,
      }),
    [db, buscaNfe, filtroCompletudeNfe, filtroStatusPagamentoNfe]
  );
  const notaDetalhes = notaDetalhesId ? detalharNotaFiscalFinanceiro(db, notaDetalhesId) ?? null : null;
  const notaCorrecao = estadoCorrecaoNfe ? db.notas_fiscais.find((nota) => nota.id === estadoCorrecaoNfe.notaId) ?? null : null;
  const correcaoSemMudanca = Boolean(
    estadoCorrecaoNfe && notaCorrecao && estadoCorrecaoNfe.fornecedorCorrecaoId === notaCorrecao.fornecedor_id
  );

  const linhaNormalizadaPreview = useMemo(() => {
    if (!formReceberBoleto.linha.trim()) return undefined;
    try {
      return normalizarLinhaBoleto(formReceberBoleto.linha);
    } catch {
      return undefined;
    }
  }, [formReceberBoleto.linha]);

  const formatoBoletoPreview = linhaNormalizadaPreview ? identificarFormatoBoleto(linhaNormalizadaPreview) : undefined;

  useEffect(() => {
    contaSelecionadaBoletoIdRef.current = contaSelecionadaBoletoId;
  }, [contaSelecionadaBoletoId]);

  useEffect(() => {
    if (!contaSelecionadaBoletoId) return;
    inputLinhaRef.current?.focus();
    inputLinhaRef.current?.select();
  }, [contaSelecionadaBoletoId]);

  // Agenda: atrasados + próximos 7 dias
  const boletosAtivos = db.boletos.filter((boleto) => !golpeConfirmado(boleto));
  const boletosAguardandoConciliacao = boletosAtivos.filter((boleto) => boleto.status === "aguardando_conciliacao");
  const boletosPagos = boletosAtivos.filter((boleto) => boleto.status === "pago");
  const boletosPendentesAgenda = boletosAtivos.filter(
    (boleto) =>
      boleto.status !== "aguardando_conciliacao" &&
      boleto.status !== "pago" &&
      boletoProntoParaAgendaPagamentos(boleto)
  );

  const boletosPagosArquivo = useMemo(() => {
    const termo = buscaBoletosPagos.trim().toLowerCase();
    const lista = [...boletosPagos].sort((a, b) => {
      const da = a.pagamento_data || a.pagamento_informado_em || a.vencimento;
      const db_ = b.pagamento_data || b.pagamento_informado_em || b.vencimento;
      return (db_ || "").localeCompare(da || "");
    });
    if (!termo) return lista;
    return lista.filter((boleto) => {
      const fornecedor = fornecedorDoBoleto(db, boleto).toLowerCase();
      const nota = notaDoBoleto(db, boleto);
      const campos = [
        fornecedor,
        boleto.pagamento_banco_conta,
        boleto.linha_digitavel,
        nota?.numero,
        boleto.numero_parcela,
        String(boleto.pagamento_valor ?? boleto.valor),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return campos.includes(termo);
    });
  }, [boletosPagos, buscaBoletosPagos, db]);

  async function verPdfArquivoBoleto(boleto: Boleto) {
    const documentoId = boleto.documento_boleto_id;
    if (!documentoId) {
      setMensagemReceberBoleto("Este boleto pago não tem PDF guardado.");
      return;
    }
    const doc = db.documentos_boleto.find((d) => d.id === documentoId);
    setAbrindoPdfArquivoId(documentoId);
    try {
      let arquivo = await lerArquivoDocumentoBoletoIdb(documentoId);
      if (!arquivo && doc?.nome_arquivo) {
        const lote = await listarRegistrosLoteIdb();
        const registro = lote.find(
          (item) => item.tipo === "pdf_boleto" && item.nome.toLowerCase() === doc.nome_arquivo.toLowerCase()
        );
        if (registro) arquivo = registroIdbParaArquivo(registro);
      }
      if (!arquivo) {
        setMensagemReceberBoleto(
          `Não achei o PDF “${doc?.nome_arquivo ?? documentoId}” neste navegador.`
        );
        return;
      }
      const url = URL.createObjectURL(arquivo);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setMensagemReceberBoleto(e instanceof Error ? e.message : "Não foi possível abrir o PDF.");
    } finally {
      setAbrindoPdfArquivoId(null);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const aba = new URLSearchParams(window.location.search).get("aba");
    if (aba === "contas") setAbaFinanceira("contas");
    else if (aba === "notas") setAbaFinanceira("notas");
    else if (aba === "boletos_pagos" || aba === "boletos-pagos") setAbaFinanceira("boletos_pagos");
    else if (aba === "conferencia") setAbaFinanceira("conferencia");
    else if (aba === "conciliacao") setAbaFinanceira("conciliacao");
    else setAbaFinanceira("pagamentos"); // boletos / pagamentos
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("limparNotasBoletos") !== "1") return;
    const resultado = limparNotasEBoletos();
    window.history.replaceState({}, "", "/financeiro?aba=conferencia");
    setAbaFinanceira("conferencia");
    setMensagemReceberBoleto(
      `Limpeza concluída: ${resultado.notas} nota(s), ${resultado.boletos} boleto(s) e ${resultado.documentos} PDF(s) removidos. Pode começar do zero.`
    );
  }, []);

  const bancosContasUsados = useMemo(() => listarBancosContasUsados(db), [db]);

  const boletosAtrasados = boletosPendentesAgenda.filter((boleto) => (diasAte(boleto.vencimento) ?? 0) < 0);
  const boletosVencendoHoje = boletosPendentesAgenda.filter((boleto) => (diasAte(boleto.vencimento) ?? 0) === 0);
  const boletosAVencer = boletosPendentesAgenda.filter((boleto) => (diasAte(boleto.vencimento) ?? 0) > 0);

  // Totais por status
  const totais: Record<StatusBoleto, number> = {
    travado: 0,
    liberado: 0,
    aguardando_conciliacao: 0,
    pago: 0,
    suspeito: 0,
  };
  boletosAtivos.forEach((b) => {
    if (
      b.status === "aguardando_conciliacao" ||
      b.status === "pago" ||
      boletoProntoParaAgendaPagamentos(b)
    ) {
      totais[b.status] += b.valor;
    }
  });

  function rotuloDia(iso: string): string {
    const dias = diasAte(iso);
    if (dias === undefined) return dataBR(iso);
    if (dias < 0) return `Atrasado — venceu ${dataBR(iso)}`;
    if (dias === 0) return `Hoje — ${dataBR(iso)}`;
    if (dias === 1) return `Amanhã — ${dataBR(iso)}`;
    return `${dataBR(iso)} (em ${dias} dias)`;
  }

  function nomeFornecedorConta(conta: ContaPagar): string {
    if (!conta.fornecedor_id) return "Fornecedor não identificado";
    return db.fornecedores.find((fornecedor) => fornecedor.id === conta.fornecedor_id)?.nome ?? "Fornecedor não identificado";
  }

  function nomeFornecedorDoConfronto(confronto?: ResultadoConfrontoBoletoNfe): string {
    if (!confronto?.nota_id) return "—";
    const nota = db.notas_fiscais.find((item) => item.id === confronto.nota_id);
    if (!nota) return "—";
    return nomeFornecedor(db, nota.fornecedor_id);
  }

  function parcelaDoConfronto(confronto?: ResultadoConfrontoBoletoNfe): Boleto | undefined {
    if (!confronto) return undefined;
    if (confronto.parcela_id) return db.boletos.find((item) => item.id === confronto.parcela_id);
    if (parcelaSelecionadaMultipla) return db.boletos.find((item) => item.id === parcelaSelecionadaMultipla);
    return undefined;
  }

  function alterarCampoConta<K extends keyof FormContaState>(campo: K, valor: FormContaState[K]) {
    setFormConta((atual) => ({ ...atual, [campo]: valor }));
  }

  function impedirEnterAcidental(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
    }
  }

  function abrirNovaConta() {
    setErroFormConta(null);
    setFormConta(novaContaInicial());
    setModalNovaContaAberto(true);
    setAbaFinanceira("contas");
  }

  function fecharNovaConta() {
    setErroFormConta(null);
    setModalNovaContaAberto(false);
  }

  function abrirDetalhesNfe(notaId: string) {
    setNotaDetalhesId(notaId);
  }

  function irParaPagamentoDaNota(notaId: string) {
    const parcelas = db.boletos.filter(
      (boleto) => boleto.nota_id === notaId && !golpeConfirmado(boleto)
    );
    const aguardandoConciliacao = parcelas.find((b) => b.status === "aguardando_conciliacao");
    const naAgenda = parcelas.find(
      (b) =>
        b.status !== "pago" &&
        b.status !== "aguardando_conciliacao" &&
        boletoProntoParaAgendaPagamentos(b)
    );
    const alvo = aguardandoConciliacao ?? naAgenda;

    fecharDetalhesNfe();
    setErroReceberBoleto(null);

    if (!alvo) {
      setAbaFinanceira("conferencia");
      setMensagemReceberBoleto(
        "Essa nota ainda não tem boleto conferido. Pareie na Conferência; depois o título aparece em Pagamentos."
      );
      return;
    }

    if (alvo.status === "aguardando_conciliacao") {
      setAbaFinanceira("conciliacao");
      setMensagemReceberBoleto(
        "Pagamento já informado — confirme data e banco na conciliação."
      );
    } else {
      setAbaFinanceira("pagamentos");
      setMensagemReceberBoleto(
        alvo.status === "travado"
          ? "Título encontrado, mas ainda travado até a conferência da mercadoria no Recebimento."
          : "Título destacado na agenda. Use Informar pagamento realizado para registrar banco e data."
      );
    }
    setBoletoDestaqueId(alvo.id);
  }

  function fecharDetalhesNfe() {
    setNotaDetalhesId(null);
  }

  function iniciarCorrecaoNfe(notaId: string) {
    const estado = abrirModalCorrecaoNfe(db, notaId);
    if (!estado) return;
    setEstadoCorrecaoNfe(estado);
    setErroCorrecaoNfe(null);
    setMensagemCorrecaoNfe(null);
  }

  function fecharCorrecaoNfe() {
    setEstadoCorrecaoNfe(null);
    setErroCorrecaoNfe(null);
    setMensagemCorrecaoNfe(null);
    setSalvandoCorrecaoNfe(false);
    salvandoCorrecaoNfeRef.current = false;
  }

  function salvarCorrecaoFornecedorNfe() {
    if (salvandoCorrecaoNfeRef.current) return;
    if (!estadoCorrecaoNfe) return;
    if (!estadoCorrecaoNfe.fornecedorCorrecaoId) {
      setErroCorrecaoNfe("Selecione um fornecedor válido.");
      return;
    }
    if (correcaoSemMudanca) {
      setErroCorrecaoNfe("Selecione um fornecedor diferente do já vinculado para salvar a correção.");
      return;
    }

    salvandoCorrecaoNfeRef.current = true;
    setSalvandoCorrecaoNfe(true);

    try {
      const proximo = structuredClone(db) as DB;
      const resultado = corrigirFornecedorNotaFiscal(proximo, {
        notaId: estadoCorrecaoNfe.notaId,
        fornecedorIdNovo: estadoCorrecaoNfe.fornecedorCorrecaoId,
        responsavel: "usuário local",
        justificativa: estadoCorrecaoNfe.justificativaCorrecao,
        gerarIdRegistro: () => uid("nfe-corr"),
      });

      if (!resultado.sucesso) {
        setErroCorrecaoNfe(resultado.mensagem ?? "Não foi possível corrigir fornecedor da NF-e.");
        setMensagemCorrecaoNfe(null);
        return;
      }

      mutate((atual) => {
        Object.assign(atual, proximo);
      });

      setErroCorrecaoNfe(null);
      setMensagemCorrecaoNfe(
        resultado.alterou ? "Fornecedor da NF-e corrigido com sucesso." : resultado.mensagem ?? "Nenhuma alteração necessária."
      );
    } finally {
      salvandoCorrecaoNfeRef.current = false;
      setSalvandoCorrecaoNfe(false);
    }
  }

  function contaPodeReceberBoleto(conta: ContaPagar): boolean {
    return conta.status !== "cancelado" && conta.status !== "conciliado";
  }

  function abrirReceberBoleto(conta: ContaPagar) {
    execucaoIdentificacaoRef.current += 1;
    setContaSelecionadaBoletoId(conta.id);
    setFormReceberBoleto(novoRecebimentoBoletoInicial());
    setErroReceberBoleto(null);
    setMensagemReceberBoleto(null);
    setMensagemIdentificacaoBoleto(null);
    setOpcoesIdentificacaoBoleto([]);
    setIdentificandoCodigoBoleto(false);
    setDiagnosticoIdentificacao(null);
  }

  function fecharReceberBoleto() {
    if (processandoRecebimentoBoleto) return;
    execucaoIdentificacaoRef.current += 1;
    setContaSelecionadaBoletoId(null);
    setFormReceberBoleto(novoRecebimentoBoletoInicial());
    setErroReceberBoleto(null);
    setMensagemIdentificacaoBoleto(null);
    setOpcoesIdentificacaoBoleto([]);
    setIdentificandoCodigoBoleto(false);
    setDiagnosticoIdentificacao(null);
  }

  function aplicarIdentificacaoUnica(identificado: BoletoValidoIdentificado) {
    setFormReceberBoleto((atual) => ({ ...atual, linha: identificado.valorNormalizado }));
    setMensagemIdentificacaoBoleto("Código identificado automaticamente e dígitos verificadores válidos");
    setOpcoesIdentificacaoBoleto([identificado]);
  }

  function aplicarResultadoIdentificacao(resultado: ResultadoIdentificacaoArquivoBoleto) {
    setDiagnosticoIdentificacao(resultado.diagnostico);

    if (resultado.validos.length === 1) {
      aplicarIdentificacaoUnica(resultado.validos[0]);
      return;
    }

    if (resultado.validos.length > 1) {
      setMensagemIdentificacaoBoleto("Mais de um boleto válido foi identificado. Selecione uma opção.");
      setOpcoesIdentificacaoBoleto(resultado.validos);
      return;
    }

    setOpcoesIdentificacaoBoleto([]);
    if (resultado.quantidadeCandidatos > 0) {
      setMensagemIdentificacaoBoleto("Foram encontrados números no arquivo, mas nenhum passou na validação dos dígitos verificadores.");
    } else {
      setMensagemIdentificacaoBoleto("Não foi possível identificar automaticamente. Leia com o leitor ou informe manualmente.");
    }
    inputLinhaRef.current?.focus();
  }

  async function identificarCodigoAutomaticamente(arquivo: File) {
    const execucao = execucaoIdentificacaoRef.current + 1;
    execucaoIdentificacaoRef.current = execucao;

    setIdentificandoCodigoBoleto(true);
    setMensagemIdentificacaoBoleto("Identificando código do boleto...");
    setOpcoesIdentificacaoBoleto([]);
    setDiagnosticoIdentificacao(null);

    try {
      const resultado = await identificarCodigoBoletoNoArquivoLocal(
        arquivo,
        () => execucaoIdentificacaoRef.current !== execucao || !contaSelecionadaBoletoIdRef.current
      );

      if (execucaoIdentificacaoRef.current !== execucao || !contaSelecionadaBoletoIdRef.current) return;
      aplicarResultadoIdentificacao(resultado);
    } catch {
      if (execucaoIdentificacaoRef.current !== execucao || !contaSelecionadaBoletoIdRef.current) return;
      setOpcoesIdentificacaoBoleto([]);
      setMensagemIdentificacaoBoleto("Não foi possível identificar automaticamente. Leia com o leitor ou informe manualmente.");
      setDiagnosticoIdentificacao({
        pdfAberto: false,
        paginasProcessadas: 0,
        textoEncontrado: false,
        candidatosNumericosEncontrados: 0,
        barcodeDetectorDisponivel: false,
        barcodeDetectorExecutado: false,
        zxingExecutado: false,
        resultadoValidoEncontrado: false,
        falhaTecnica: "Falha técnica durante a identificação automática.",
      });
      inputLinhaRef.current?.focus();
    } finally {
      if (execucaoIdentificacaoRef.current === execucao) {
        setIdentificandoCodigoBoleto(false);
      }
    }
  }

  function alterarArquivoReceberBoleto(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0] ?? null;
    setFormReceberBoleto((atual) => ({ ...atual, arquivo }));
    setErroReceberBoleto(null);
    setMensagemIdentificacaoBoleto(null);
    setOpcoesIdentificacaoBoleto([]);
    setDiagnosticoIdentificacao(null);
    if (!arquivo) return;
    void identificarCodigoAutomaticamente(arquivo);
  }

  function alterarLinhaReceberBoleto(valor: string) {
    setFormReceberBoleto((atual) => ({ ...atual, linha: valor }));
    setErroReceberBoleto(null);
  }

  async function salvarReceberBoleto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contaSelecionadaBoleto || !formReceberBoleto.arquivo || processandoRecebimentoBoleto) return;

    if (!formReceberBoleto.linha.trim()) {
      setErroReceberBoleto("Informe a linha digitável ou o código de barras do boleto.");
      return;
    }

    setProcessandoRecebimentoBoleto(true);
    setErroReceberBoleto(null);
    setMensagemReceberBoleto(null);

    try {
      const conteudo = await formReceberBoleto.arquivo.arrayBuffer();
      const proximo = structuredClone(db) as DB;
      const resultado = await receberBoletoContaPagar(
        proximo,
        {
          contaPagarId: contaSelecionadaBoleto.id,
          arquivo: {
            nomeArquivo: formReceberBoleto.arquivo.name,
            tipoArquivo: formReceberBoleto.arquivo.type,
            tamanhoBytes: formReceberBoleto.arquivo.size,
            conteudo,
          },
          linhaInformada: formReceberBoleto.linha,
        },
        { criadoPor: "usuário local" }
      );

      if (!resultado.sucesso) {
        setErroReceberBoleto(resultado.erros.join(" "));
        return;
      }

      mutate((atual) => {
        Object.assign(atual, proximo);
      });
      setMensagemReceberBoleto(resultado.mensagem ?? "Boleto recebido e aguardando conferência.");
      execucaoIdentificacaoRef.current += 1;
      setContaSelecionadaBoletoId(null);
      setFormReceberBoleto(novoRecebimentoBoletoInicial());
      setMensagemIdentificacaoBoleto(null);
      setOpcoesIdentificacaoBoleto([]);
      setIdentificandoCodigoBoleto(false);
      setDiagnosticoIdentificacao(null);
    } catch (erro) {
      setErroReceberBoleto(erro instanceof Error ? erro.message : "Não foi possível receber o boleto.");
    } finally {
      setProcessandoRecebimentoBoleto(false);
    }
  }

  async function extrairTextoEstruturadoEmMemoria(arquivo: File): Promise<string> {
    const nome = arquivo.name.toLowerCase();
    if (!nome.endsWith(".pdf")) return "";

    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs").catch(() => null);
    if (!pdfjs?.GlobalWorkerOptions) return "";
    configurarWorkerPdfjs(pdfjs);

    const buffer = await arquivo.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)) });
    const documento = await loadingTask.promise.catch(() => null);
    if (!documento) return "";

    const blocos: string[] = [];
    try {
      const total = Math.min(documento.numPages, 5);
      for (let pagina = 1; pagina <= total; pagina += 1) {
        const p = await documento.getPage(pagina).catch(() => null);
        if (!p) continue;
        const textContent = await p.getTextContent().catch(() => null);
        if (!textContent) continue;
        const texto = combinarTextosPdfFragmentados(textContent as { items: Array<{ str?: string; hasEOL?: boolean }> });
        if (texto.trim()) blocos.push(texto);
      }
    } finally {
      await loadingTask.destroy?.().catch(() => undefined);
    }

    return blocos.join("\n");
  }

  function abrirImportarBoleto(boletoIdAlvo?: string) {
    setBoletoImportacaoAlvoId(boletoIdAlvo ?? null);
    setModalImportarBoletoAberto(true);
    setEstadoImportacaoBoleto(novoEstadoImportacaoBoleto());
    setMensagemImportacaoBoleto(null);
    setJustificativaImportacao("");
    setParcelaSelecionadaMultipla("");
    setNotaVinculoManualId("");
    setMostrarLinhaCompletaImportada(false);
    setMostrarDetalhesTecnicos(false);
  }

  function fecharImportarBoleto() {
    if (processandoImportacaoBoleto) return;
    setModalImportarBoletoAberto(false);
    setBoletoImportacaoAlvoId(null);
  }

  async function analisarImportacaoBoleto(arquivo: File) {
    setProcessandoImportacaoBoleto(true);
    setMensagemImportacaoBoleto(null);
    setEstadoImportacaoBoleto({ arquivo, etapa: "lendo_documento", diagnostico: null });
    setJustificativaImportacao("");
    setParcelaSelecionadaMultipla("");
    setNotaVinculoManualId("");

    try {
      const conteudo = await arquivo.arrayBuffer();
      const validacaoArquivo = validarArquivoDocumentoBoleto({
        nomeArquivo: arquivo.name,
        tipoArquivo: arquivo.type,
        tamanhoBytes: arquivo.size,
        conteudo,
      });

      if (!validacaoArquivo.valido) {
        setEstadoImportacaoBoleto({ arquivo, conteudo, falha: validacaoArquivo.erros.join(" "), diagnostico: null });
        return;
      }

      const hash = await calcularHashSHA256(conteudo);
      setEstadoImportacaoBoleto((atual) => ({ ...atual, conteudo, hash, etapa: "validando_codigo" }));

      const identificado = await identificarCodigoBoletoNoArquivoLocal(arquivo, () => false);
      if (identificado.validos.length === 0) {
        setEstadoImportacaoBoleto({
          arquivo,
          conteudo,
          hash,
          diagnostico: identificado.diagnostico,
          falha: "Não foi possível identificar um código de boleto válido.",
        });
        return;
      }

      const escolhido = identificado.validos[0];
      const jaPago = detectarBoletoJaPago(db, { linhaDigitavel: escolhido.valorNormalizado, hashSha256: hash });
      if (jaPago) {
        setEstadoImportacaoBoleto({
          arquivo,
          conteudo,
          hash,
          linhaSelecionada: escolhido.valorNormalizado,
          diagnostico: identificado.diagnostico,
          falha: jaPago.mensagem,
        });
        return;
      }

      const textoEstruturado = await extrairTextoEstruturadoEmMemoria(arquivo);
      const dados = extrairDadosEstruturadosDoBoleto(escolhido.valorNormalizado, textoEstruturado);

      setEstadoImportacaoBoleto((atual) => ({
        ...atual,
        linhaSelecionada: escolhido.valorNormalizado,
        dadosExtraidos: dados,
        diagnostico: identificado.diagnostico,
        etapa: "procurando_nfe",
      }));

      const confronto = confrontarBoletoComNfe(db, dados, hash);
      setEstadoImportacaoBoleto((atual) => ({ ...atual, confronto, etapa: "resultado" }));
      setMostrarDetalhesTecnicos(false);
    } catch (erro) {
      setEstadoImportacaoBoleto((atual) => ({
        ...atual,
        falha: erro instanceof Error ? erro.message : "Falha durante a análise do boleto.",
      }));
    } finally {
      setProcessandoImportacaoBoleto(false);
    }
  }

  function selecionarArquivoImportacao(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0] ?? null;
    if (!arquivo) return;
    void analisarImportacaoBoleto(arquivo);
  }

  /** Caixa / lote: boleto → fila Conferência (sem casar ainda). */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const idConferencia = params.get("receberBoletoConferencia");
    const idImportar = params.get("importarLoteBoleto");
    const id = idConferencia || idImportar;
    if (!id || handoffLoteProcessado.current === id) return;
    handoffLoteProcessado.current = id;
    window.history.replaceState({}, "", "/financeiro?aba=conferencia");

    void (async () => {
      await hidratarFilaLoteDoIdb();
      const arquivo = await obterArquivoFilaAsync(id);
      if (!arquivo) {
        setMensagemReceberBoleto(
          "Não achei o PDF do boleto neste navegador. Volte na Caixa de entrada e confirme de novo."
        );
        setAbaFinanceira("conferencia");
        return;
      }

      setAbaFinanceira("conferencia");
      setItemLoteBoletoId(id);

      try {
        setMensagemReceberBoleto(`Recebendo boleto na conferência: ${arquivo.name}`);
        const conteudo = await arquivo.arrayBuffer();
        let linha: string | undefined;
        try {
          const identificado = await identificarCodigoBoletoNoArquivoLocal(arquivo, () => false);
          linha = identificado.validos[0]?.valorNormalizado;
        } catch {
          // Sem linha ainda — documento entra mesmo assim para parear depois
        }

        const proximo = structuredClone(getDB()) as typeof db;
        const resultado = await receberBoletoPendenteNaConferencia(
          proximo,
          {
            arquivo: {
              nomeArquivo: arquivo.name,
              tipoArquivo: arquivo.type,
              tamanhoBytes: arquivo.size,
              conteudo,
            },
            linhaInformada: linha,
          },
          { gerarId: () => uid("docbol") }
        );

        if (!resultado.sucesso && !resultado.jaPago) {
          setMensagemReceberBoleto(
            resultado.erros.join(" ") ||
              "Não foi possível registrar o boleto. Use Importar boleto na Conferência."
          );
          setModalImportarBoletoAberto(true);
          setEstadoImportacaoBoleto(novoEstadoImportacaoBoleto());
          await analisarImportacaoBoleto(arquivo);
          return;
        }

        if (resultado.jaPago) {
          marcarItemConcluido(id);
          setItemLoteBoletoId(null);
          setMensagemReceberBoleto(resultado.jaPago.mensagem);
          setAbaFinanceira("conciliacao");
          return;
        }

        if (!resultado.documento) {
          setMensagemReceberBoleto("Não foi possível registrar o boleto.");
          return;
        }

        mutate((atual) => {
          Object.assign(atual, proximo);
        });
        try {
          await salvarArquivoDocumentoBoletoIdb(resultado.documento.id, arquivo);
        } catch {
          // Ver PDF pode falhar até reimportar
        }

        marcarItemConcluido(id);
        setItemLoteBoletoId(null);
        setMensagemReceberBoleto(
          `Boleto “${arquivo.name}” na Conferência (sem NF). Marque a nota e o boleto e confirme o pareamento.`
        );
        return;
      } catch (erro) {
        setMensagemReceberBoleto(
          erro instanceof Error ? erro.message : "Falha ao receber boleto na conferência."
        );
      }

      setItemLoteBoletoId(id);
      setBoletoImportacaoAlvoId(null);
      setModalImportarBoletoAberto(true);
      setEstadoImportacaoBoleto(novoEstadoImportacaoBoleto());
      setMensagemImportacaoBoleto(null);
      setJustificativaImportacao("");
      setParcelaSelecionadaMultipla("");
      setNotaVinculoManualId("");
      setMostrarLinhaCompletaImportada(false);
      setMostrarDetalhesTecnicos(false);
      setMensagemReceberBoleto(`Analisando boleto: ${arquivo.name}`);
      await analisarImportacaoBoleto(arquivo);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handoff único na entrada da página
  }, []);

  function criarParcelaManualEReanalisar() {
    const dados = estadoImportacaoBoleto.dadosExtraidos;
    const hash = estadoImportacaoBoleto.hash;
    if (!dados) {
      setMensagemImportacaoBoleto("Analise o boleto antes de vincular manualmente.");
      return;
    }
    if (!notaVinculoManualId) {
      setMensagemImportacaoBoleto("Selecione a NF-e correspondente a este boleto.");
      return;
    }
    if (dados.valor_codificado === undefined || !dados.vencimento_extraido) {
      setMensagemImportacaoBoleto(
        "O boleto precisa ter valor e vencimento lidos para criar a parcela. Confira o PDF ou digite a linha digitável de novo."
      );
      return;
    }
    const nota = db.notas_fiscais.find((n) => n.id === notaVinculoManualId);
    if (!nota) {
      setMensagemImportacaoBoleto("Nota selecionada não encontrada.");
      return;
    }

    try {
      const parcelaId = uid("bol");
      const dbNovo = mutate((d) => {
        criarParcelaAguardandoDocumento(d, {
          id: parcelaId,
          nota_id: notaVinculoManualId,
          valor: dados.valor_codificado!,
          vencimento: dados.vencimento_extraido!,
          cnpj_beneficiario: dados.cnpj_beneficiario || nota.cnpj_emitente,
          numero_parcela: dados.numero_parcela ?? "001",
          meio_pagamento_esperado: "boleto",
          status: "liberado",
        });
      });
      const confronto = confrontarBoletoComNfe(dbNovo, dados, hash);
      setEstadoImportacaoBoleto((atual) => ({ ...atual, confronto, etapa: "resultado" }));
      setMensagemImportacaoBoleto(null);
      if (confronto.classificacao === "parcial" || confronto.classificacao === "multiplas_possibilidades") {
        setJustificativaImportacao(
          `Parcela criada manualmente a partir do boleto e vinculada à NF-e ${nota.numero ?? "s/n"}.`
        );
      }
      if (confronto.classificacao === "sem_correspondencia") {
        setMensagemImportacaoBoleto(
          "Parcela criada, mas o confronto ainda não bateu. Confira se valor e vencimento do boleto batem com a parcela."
        );
      }
    } catch (erro) {
      setMensagemImportacaoBoleto(erro instanceof Error ? erro.message : "Falha ao criar parcela.");
    }
  }

  async function confirmarImportacaoPrincipal() {
    if (processandoImportacaoBoleto) return;
    const arquivo = estadoImportacaoBoleto.arquivo;
    const conteudo = estadoImportacaoBoleto.conteudo;
    const dados = estadoImportacaoBoleto.dadosExtraidos;
    const confronto = estadoImportacaoBoleto.confronto;
    if (!arquivo || !conteudo || !dados || !confronto || !estadoImportacaoBoleto.linhaSelecionada) return;

    if (confronto.classificacao === "multiplas_possibilidades") {
      if (!candidatoSelecionadoEhValido(confronto.candidatos, parcelaSelecionadaMultipla)) {
        setMensagemImportacaoBoleto("Selecione uma parcela candidata válida.");
        return;
      }
      if (!justificativaImportacao.trim()) {
        setMensagemImportacaoBoleto("Informe justificativa para confirmar por seleção manual.");
        return;
      }
    }

    if (confronto.classificacao === "divergente") {
      if (
        confronto.candidatos.length > 1 &&
        !candidatoSelecionadoEhValido(confronto.candidatos, parcelaSelecionadaMultipla)
      ) {
        setMensagemImportacaoBoleto("Selecione a parcela candidata para confirmar a divergência.");
        return;
      }
      if (!justificativaImportacao.trim()) {
        setMensagemImportacaoBoleto("Justificativa obrigatória para confirmar resultado divergente.");
        return;
      }
    }

    if (confronto.classificacao === "parcial" && !justificativaImportacao.trim()) {
      setMensagemImportacaoBoleto("Justificativa obrigatória para confirmação parcial.");
      return;
    }

    setProcessandoImportacaoBoleto(true);
    setMensagemImportacaoBoleto(null);

    try {
      const proximo = structuredClone(db) as DB;
      const parcelaIdConfirmacao =
        confronto.classificacao === "multiplas_possibilidades" ||
        (confronto.classificacao === "divergente" && confronto.candidatos.length > 1)
          ? parcelaSelecionadaMultipla
          : confronto.classificacao === "divergente"
            ? parcelaSelecionadaMultipla || confronto.parcela_id
            : undefined;
      const resultado = await confirmarConfrontoBoleto(
        proximo,
        {
          arquivo: {
            nomeArquivo: arquivo.name,
            tipoArquivo: arquivo.type,
            tamanhoBytes: arquivo.size,
            conteudo,
          },
          linhaInformada: estadoImportacaoBoleto.linhaSelecionada,
          dadosExtraidos: dados,
          resultadoConfrontoInformado: confronto,
          parcelaSelecionadaId: parcelaIdConfirmacao,
          boletoEsperadoId: boletoImportacaoAlvoId ?? undefined,
          confirmacaoHumana: true,
          responsavel: "usuário local",
          justificativaConfirmacao: justificativaImportacao.trim() || undefined,
        },
        {}
      );

      if (!resultado.sucesso) {
        setMensagemImportacaoBoleto(resultado.erros.join(" "));
        return;
      }

      mutate((atual) => {
        Object.assign(atual, proximo);
      });

      if (resultado.documento?.id) {
        try {
          await salvarArquivoDocumentoBoletoIdb(resultado.documento.id, arquivo);
        } catch {
          // Metadados já gravados; Ver PDF pode falhar até reimportar.
        }
      }

      if (itemLoteBoletoId) {
        marcarItemConcluido(itemLoteBoletoId);
        setItemLoteBoletoId(null);
      }

      setMensagemReceberBoleto("Boleto conferido e adicionado aos pagamentos futuros");
      setModalImportarBoletoAberto(false);
      setBoletoImportacaoAlvoId(null);
    } catch (erro) {
      setMensagemImportacaoBoleto(erro instanceof Error ? erro.message : "Falha ao confirmar importação de boleto.");
    } finally {
      setProcessandoImportacaoBoleto(false);
    }
  }

  const valorOriginal = lerNumero(formConta.valor_original);
  const juros = lerNumero(formConta.juros) ?? 0;
  const desconto = lerNumero(formConta.desconto) ?? 0;
  const valorFinalPreview = valorOriginal === undefined ? undefined : calcularValorFinal(valorOriginal, juros, desconto);

  function salvarNovaConta(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const valorOriginalNumero = lerNumero(formConta.valor_original);
    const jurosNumero = lerNumero(formConta.juros) ?? 0;
    const descontoNumero = lerNumero(formConta.desconto) ?? 0;

    if (valorOriginalNumero === undefined) {
      setErroFormConta("Informe o valor original da conta.");
      return;
    }
    if (valorOriginalNumero < 0 || jurosNumero < 0 || descontoNumero < 0) {
      setErroFormConta("Valores monetários não podem ser negativos.");
      return;
    }
    if (!formConta.data_vencimento) {
      setErroFormConta("A data de vencimento é obrigatória.");
      return;
    }

    mutate((d) => {
      criarContaManual(d, {
        fornecedor_id: formConta.fornecedor_id || undefined,
        descricao: formConta.descricao.trim(),
        origem: "manual",
        documento_id: formConta.documento_id.trim() || undefined,
        categoria: formConta.categoria.trim(),
        centro_custo: formConta.centro_custo.trim() || undefined,
        data_emissao: formConta.data_emissao,
        data_vencimento: formConta.data_vencimento,
        valor_original: valorOriginalNumero,
        juros: jurosNumero,
        desconto: descontoNumero,
        observacoes: formConta.observacoes.trim() || undefined,
        status: "aguardando_boleto",
      });
    });

    setErroFormConta(null);
    setFormConta(novaContaInicial());
    setModalNovaContaAberto(false);
    setAbaFinanceira("contas");
  }

  function CartaoBoleto({ boleto }: { boleto: Boleto }) {
    const cancelado = golpeConfirmado(boleto);
    const atrasado = (diasAte(boleto.vencimento) ?? 0) < 0 && boleto.status !== "pago" && boleto.status !== "aguardando_conciliacao";
    const documentoBoleto = boleto.documento_boleto_id
      ? db.documentos_boleto.find((documento) => documento.id === boleto.documento_boleto_id)
      : undefined;
    const estadoAgendaPagamento = montarEstadoAgendaPagamentoBoleto(boleto, documentoBoleto);
    const codigoAberto = boletoCodigoAbertoId === boleto.id && estadoAgendaPagamento.podeExibirCodigo;
    const mostrarLinhaCompleta = boletoLinhaCompletaId === boleto.id;
    const linhaParaPagamento =
      (boleto.linha_digitavel ?? "").trim() ||
      (documentoBoleto?.linha_informada ?? "").trim() ||
      estadoAgendaPagamento.codigoCanonico;
    const linhaMascarada = linhaParaPagamento ? mascararLinhaDigitavel(linhaParaPagamento, mostrarLinhaCompleta) : "—";
    const fornecedor = fornecedorDoBoleto(db, boleto);
    const segmentosCodigoPagamento: SegmentoCodigoBarrasItf[] = useMemo(() => {
      if (!codigoAberto || !estadoAgendaPagamento.codigoCanonico) return [];
      if (boleto.meio_pagamento_esperado === "pix") return [];
      try {
        return gerarPadraoInterleaved2of5(estadoAgendaPagamento.codigoCanonico);
      } catch {
        return [];
      }
    }, [codigoAberto, estadoAgendaPagamento.codigoCanonico, boleto.meio_pagamento_esperado]);
    const acoesDesktop = acoesPagamentoDisponiveisNoLayout("desktop", estadoAgendaPagamento);
    const acoesMobile = acoesPagamentoDisponiveisNoLayout("mobile", estadoAgendaPagamento);
    const configuracaoCodigoSvg = useMemo(() => {
      if (!codigoAberto || segmentosCodigoPagamento.length === 0) return null;
      return montarConfiguracaoSvgCodigo(segmentosCodigoPagamento, "linha");
    }, [codigoAberto, segmentosCodigoPagamento]);
    const mostrarAcoesInlineCodigo = codigoAberto && acoesUnicasQuandoCodigoAberto().length > 0;

    const destacado = boletoDestaqueId === boleto.id;

    return (
      <Card
        id={`boleto-card-${boleto.id}`}
        className={`space-y-2 ${cancelado ? "opacity-60" : ""} ${
          boleto.status === "suspeito" && !cancelado ? "border-2 border-erro" : ""
        } ${destacado ? "border-2 border-blue-500 ring-2 ring-blue-200" : ""} ${
          boleto.status === "aguardando_conciliacao" ? "border-blue-200 bg-blue-50/40" : ""
        }`}
      >
        <div className={CLASSE_GRID_CODIGO_PAGAMENTO}>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className={cancelado ? "line-through" : ""}>
                <p className="font-bold">{fornecedor}</p>
                <p className="text-sm text-slate-600">
                  {boleto.meio_pagamento_esperado === "plataforma"
                    ? "Plataforma"
                    : boleto.meio_pagamento_esperado === "pix"
                      ? "PIX"
                      : "Boleto"}
                  {notaDoBoleto(db, boleto)
                    ? ` · ${notaDoBoleto(db, boleto)?.tipo === "nfse" ? "NFS-e" : "NF-e"} ${notaDoBoleto(db, boleto)?.numero}`
                    : statusDocumentoFiscalEfetivo(boleto) === "aguardando_nfse"
                      ? " · Aguardando NFS-e"
                      : " · Sem nota"}
                  {boleto.numero_parcela ? ` · ${rotuloParcela(boleto.numero_parcela)}` : ""}
                </p>
                <p className="text-xl font-bold">{moeda(boleto.valor)}</p>
                <p className="text-sm text-slate-600">Vencimento: {dataBR(boleto.vencimento)}</p>
                {boleto.status === "aguardando_conciliacao" && (
                  <p className="mt-1 text-sm font-medium text-blue-800">
                    Pagamento informado
                    {boleto.pagamento_data ? ` em ${dataBR(boleto.pagamento_data)}` : ""}
                    {boleto.pagamento_valor != null ? ` · ${moeda(boleto.pagamento_valor)}` : ""}
                    {boleto.pagamento_banco_conta ? ` · ${boleto.pagamento_banco_conta}` : ""}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <BadgeStatus boleto={boleto} />
                <Badge
                  cor={
                    boleto.meio_pagamento_esperado === "plataforma"
                      ? "verde"
                      : boleto.meio_pagamento_esperado === "pix"
                        ? "azul"
                        : "cinza"
                  }
                >
                  {rotuloMeioPagamento(boleto)}
                </Badge>
                {statusDocumentoFiscalEfetivo(boleto) === "aguardando_nfse" && (
                  <Badge cor="laranja">{rotuloStatusDocumentoFiscal("aguardando_nfse")}</Badge>
                )}
                {boleto.status_conferencia === "conferido" && <Badge cor="verde">Conferido</Badge>}
                {atrasado && !cancelado && <Badge cor="vermelho">atrasado</Badge>}
              </div>
            </div>

            {boleto.status === "travado" && (
              <p className="flex items-center gap-1.5 text-sm text-slate-500">
                <Lock size={14} /> aguardando conferência da mercadoria
              </p>
            )}

            {estadoAgendaPagamento.motivoBloqueio && !estadoAgendaPagamento.podeExibirCodigo && (
              <p className="rounded-card border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {estadoAgendaPagamento.motivoBloqueio}
              </p>
            )}

            {boleto.observacao && (
              <p className={`text-sm ${boleto.status === "suspeito" && !cancelado ? "font-semibold text-erro" : "text-slate-600"}`}>
                {boleto.observacao}
              </p>
            )}

            {!cancelado && (
              <div className="flex flex-wrap gap-2 pt-1">
                {boleto.documento_boleto_id && (
                  <button className="btn-secundario" onClick={() => setBoletoResumoId(boleto.id)}>
                    Resumo da conferência
                  </button>
                )}
                {estadoAgendaPagamento.mostrarImportarBoleto && (
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() => abrirImportarBoleto(boleto.id)}
                  >
                    <Upload size={16} /> {estadoAgendaPagamento.rotuloImportarBoleto ?? "Importar boleto"}
                  </button>
                )}
                {boleto.status === "aguardando_conciliacao" && (
                  <button className="btn-primario" type="button" onClick={() => abrirConciliacaoBoleto(boleto.id)}>
                    <Clock3 size={16} /> Conciliar no banco
                  </button>
                )}
                {boleto.status === "travado" && (
                  <button className="btn-secundario" onClick={() => setConfirmandoLiberacao(boleto.id)}>
                    Liberar mesmo assim
                  </button>
                )}
                {boleto.status === "suspeito" && (
                  <>
                    <button className="btn-secundario" onClick={() => confirmarLegitimo(boleto)}>
                      <Phone size={18} /> Confirmei — é legítimo
                    </button>
                    <button className="btn-perigo" onClick={() => confirmarGolpe(boleto)}>
                      <Ban size={18} /> Confirmado golpe — cancelar
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2 border-slate-200 lg:border-l lg:pl-4">
            {acoesDesktop.includes("exibir_codigo") && (
              <button
                type="button"
                className="btn-secundario w-full justify-center"
                onClick={() => {
                  setBoletoCodigoAbertoId((atual) => alternarCodigoAberto(atual, boleto.id));
                  setBoletoLinhaCompletaId(null);
                }}
              >
                <Barcode size={16} /> {codigoAberto ? "Ocultar código" : "Exibir código para pagamento"}
              </button>
            )}

            {!codigoAberto && (acoesDesktop.includes("copiar_linha") || acoesDesktop.includes("informar_pagamento")) && (
              <div className="flex flex-wrap gap-2">
                {acoesDesktop.includes("copiar_linha") && (
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() => void copiarLinhaAgenda(linhaParaPagamento)}
                  >
                    <Copy size={16} /> Copiar linha
                  </button>
                )}
                {acoesDesktop.includes("informar_pagamento") && (
                  <button type="button" className="btn-primario" onClick={() => abrirPagamentoBoleto(boleto)}>
                    <CircleCheckBig size={16} /> Informar pagamento realizado
                  </button>
                )}
              </div>
            )}

            {codigoAberto && (
              <div className="space-y-2 rounded-card border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-800">
                  Valor {moeda(boleto.valor)} · Vencimento {dataBR(boleto.vencimento)}
                </p>
                <div className={CLASSE_CAIXA_CODIGO_SEM_ROLAGEM}>
                  {configuracaoCodigoSvg ? (
                    <svg
                      aria-label="Codigo de barras Interleaved 2 of 5"
                      role="img"
                      viewBox={configuracaoCodigoSvg.viewBox}
                      className="h-[120px] w-full max-w-[1100px]"
                      preserveAspectRatio="xMidYMid meet"
                      shapeRendering="crispEdges"
                    >
                      <rect x={0} y={0} width="100%" height="100%" fill="white" />
                      {configuracaoCodigoSvg.retangulos.map((barra, indice) => (
                        <rect
                          key={`barra-${indice}`}
                          x={barra.x}
                          y={0}
                          width={barra.largura}
                          height={configuracaoCodigoSvg.altura}
                          fill="black"
                        />
                      ))}
                    </svg>
                  ) : (
                    <p className="text-sm text-slate-600">Codigo indisponivel para renderizacao.</p>
                  )}
                </div>
                <p className="text-sm text-slate-700">Linha: {linhaMascarada}</p>
                {mostrarAcoesInlineCodigo && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secundario"
                      onClick={() => setBoletoLinhaCompletaId((atual) => (atual === boleto.id ? null : boleto.id))}
                    >
                      {mostrarLinhaCompleta ? <EyeOff size={16} /> : <Eye size={16} />} {mostrarLinhaCompleta ? "Ocultar linha" : "Mostrar linha"}
                    </button>
                    {(acoesDesktop.includes("copiar_linha") || acoesMobile.includes("copiar_linha")) && (
                      <button
                        type="button"
                        className="btn-secundario"
                        onClick={() => void copiarLinhaAgenda(linhaParaPagamento)}
                      >
                        <Copy size={16} /> Copiar linha
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-secundario"
                      onClick={() =>
                        estadoAgendaPagamento.codigoCanonico &&
                        setCodigoAmpliado({
                          boletoId: boleto.id,
                          codigoCanonico: estadoAgendaPagamento.codigoCanonico,
                          fornecedor,
                          valor: boleto.valor,
                          vencimento: boleto.vencimento,
                        })
                      }
                    >
                      <Barcode size={16} /> Ampliar codigo
                    </button>
                    {(acoesDesktop.includes("informar_pagamento") || acoesMobile.includes("informar_pagamento")) && (
                      <button type="button" className="btn-primario" onClick={() => abrirPagamentoBoleto(boleto)}>
                        <CircleCheckBig size={16} /> Informar pagamento realizado
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-secundario"
                      onClick={() => {
                        setBoletoCodigoAbertoId(null);
                        setBoletoLinhaCompletaId(null);
                      }}
                    >
                      <EyeOff size={16} /> Ocultar codigo
                    </button>
                  </div>
                )}
              </div>
            )}

            {!estadoAgendaPagamento.podeExibirCodigo && estadoAgendaPagamento.motivoBloqueio && (
              <p className="text-sm text-slate-600">{estadoAgendaPagamento.motivoBloqueio}</p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  const boletoLiberando = db.boletos.find((b) => b.id === confirmandoLiberacao);
  const boletoResumo = boletoResumoId ? db.boletos.find((boleto) => boleto.id === boletoResumoId) ?? null : null;
  const boletoPagamento = boletoPagamentoId ? db.boletos.find((boleto) => boleto.id === boletoPagamentoId) ?? null : null;
  const notaPagamento = boletoPagamento ? notaDoBoleto(db, boletoPagamento) : null;
  const documentoResumo = boletoResumo?.documento_boleto_id
    ? db.documentos_boleto.find((documento) => documento.id === boletoResumo.documento_boleto_id) ?? null
    : null;
  const notaResumo = documentoResumo?.nota_id
    ? db.notas_fiscais.find((nota) => nota.id === documentoResumo.nota_id) ?? null
    : null;
  const apresentacaoConfronto = estadoImportacaoBoleto.confronto
    ? apresentarResultadoConfronto(estadoImportacaoBoleto.confronto)
    : null;
  const segmentosCodigoAmpliado: SegmentoCodigoBarrasItf[] = useMemo(() => {
    if (!codigoAmpliado) return [];
    try {
      return gerarPadraoInterleaved2of5(codigoAmpliado.codigoCanonico);
    } catch {
      return [];
    }
  }, [codigoAmpliado]);
  const configuracaoCodigoAmpliado = useMemo(() => {
    if (!codigoAmpliado || segmentosCodigoAmpliado.length === 0) return null;
    return montarConfiguracaoSvgCodigo(segmentosCodigoAmpliado, "ampliado");
  }, [codigoAmpliado, segmentosCodigoAmpliado]);

  return (
    <div className="space-y-4">
      <TituloPagina titulo="Financeiro" subtitulo="Pagamentos, conferência, conciliação e contas" />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn-secundario ${abaFinanceira === "pagamentos" ? "border-primaria bg-primaria-clara text-primaria" : ""}`}
          onClick={() => setAbaFinanceira("pagamentos")}
        >
          Pagamentos
        </button>
        <button
          type="button"
          className={`btn-secundario ${abaFinanceira === "conferencia" ? "border-primaria bg-primaria-clara text-primaria" : ""}`}
          onClick={() => setAbaFinanceira("conferencia")}
        >
          Conferência
        </button>
        <button
          type="button"
          className={`btn-secundario ${abaFinanceira === "conciliacao" ? "border-primaria bg-primaria-clara text-primaria" : ""}`}
          onClick={() => {
            setAbaFinanceira("conciliacao");
            setErroConciliacaoBoleto(null);
          }}
        >
          Conciliação bancária
          {boletosAguardandoConciliacao.length > 0 ? ` (${boletosAguardandoConciliacao.length})` : ""}
        </button>
        <button
          type="button"
          className={`btn-secundario ${abaFinanceira === "contas" ? "border-primaria bg-primaria-clara text-primaria" : ""}`}
          onClick={() => setAbaFinanceira("contas")}
        >
          Contas a pagar
        </button>
        <button
          type="button"
          className={`btn-secundario ${abaFinanceira === "notas" ? "border-primaria bg-primaria-clara text-primaria" : ""}`}
          onClick={() => setAbaFinanceira("notas")}
        >
          Notas fiscais
        </button>
        <button
          type="button"
          className={`btn-secundario ${abaFinanceira === "boletos_pagos" ? "border-primaria bg-primaria-clara text-primaria" : ""}`}
          onClick={() => setAbaFinanceira("boletos_pagos")}
        >
          Boletos pagos
          {boletosPagos.length > 0 ? ` (${boletosPagos.length})` : ""}
        </button>

      </div>

      {abaFinanceira === "pagamentos" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2>Pagamentos futuros</h2>
            <button type="button" className="btn-primario" onClick={() => abrirImportarBoleto()}>
              <Upload size={18} /> Importar boleto
            </button>
          </div>

          {mensagemReceberBoleto && (
            <BannerMensagemFinanceiro texto={mensagemReceberBoleto} />
          )}

          {/* Alerta de boleto suspeito */}
          {suspeitos.map((b) => (
            <div key={b.id} className="rounded-card border-2 border-erro bg-erro-clara p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert size={32} className="mt-0.5 shrink-0 text-erro" />
                <div className="space-y-1">
                  <p className="text-lg font-bold text-erro">Atenção: possível golpe do boleto!</p>
                  <p className="text-sm text-texto">
                    Boleto de <span className="font-bold">{moeda(b.valor)}</span> em nome de{" "}
                    <span className="font-bold">{fornecedorDoBoleto(db, b)}</span>, vencendo {dataBR(b.vencimento)}.
                  </p>
                  {b.observacao && <p className="text-sm font-semibold text-erro">{b.observacao}</p>}
                  {b.cnpj_beneficiario && (
                    <p className="text-sm text-texto">CNPJ do beneficiário no boleto: {b.cnpj_beneficiario}</p>
                  )}
                  <p className="flex items-center gap-1.5 text-sm font-bold text-erro">
                    <Phone size={16} /> NÃO pague — confirme com o fornecedor por telefone antes de qualquer coisa.
                  </p>
                </div>
              </div>
            </div>
          ))}

          {/* Totais da semana */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Card className="py-3">
              <p className="rotulo flex items-center gap-1">
                <Lock size={13} /> Travados
              </p>
              <p className="text-xl font-bold text-slate-600">{moeda(totais.travado)}</p>
            </Card>
            <Card className="py-3">
              <p className="rotulo flex items-center gap-1">
                <CircleCheck size={13} /> Liberados
              </p>
              <p className="text-xl font-bold text-primaria">{moeda(totais.liberado)}</p>
            </Card>
            <Card className="py-3">
              <p className="rotulo flex items-center gap-1">
                <Clock3 size={13} /> Aguardando conciliação bancária
              </p>
              <p className="text-xl font-bold text-blue-700">{moeda(totais.aguardando_conciliacao)}</p>
            </Card>
            <Card className="py-3">
              <p className="rotulo flex items-center gap-1">
                <CircleCheckBig size={13} /> Pagos
              </p>
              <p className="text-xl font-bold text-primaria-escura">{moeda(totais.pago)}</p>
            </Card>
            <Card className="py-3">
              <p className="rotulo flex items-center gap-1">
                <TriangleAlert size={13} /> Suspeitos
              </p>
              <p className="text-xl font-bold text-erro">{moeda(totais.suspeito)}</p>
            </Card>
          </div>

          {/* Agenda financeira */}
          <section className="space-y-4">
            <h2>Agenda financeira</h2>

            <div id="secao-aguardando-conciliacao" className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="rotulo text-blue-700">Aguardando conciliação bancária</p>
                <button type="button" className="btn-secundario" onClick={() => setAbaFinanceira("conciliacao")}>
                  Abrir conciliação
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Pagamento já informado — confirme data e banco na aba Conciliação bancária para marcar como pago.
              </p>
              {boletosAguardandoConciliacao.length === 0 ? (
                <Vazio mensagem="Nenhum boleto com pagamento informado aguardando baixa bancária." />
              ) : (
                [...boletosAguardandoConciliacao]
                  .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
                  .map((boleto) => <CartaoBoleto key={boleto.id} boleto={boleto} />)
              )}
            </div>

            <div className="space-y-2">
              <p className="rotulo text-erro">Atrasados</p>
              {boletosAtrasados.length === 0 ? (
                <Vazio mensagem="Nenhum pagamento atrasado." />
              ) : (
                [...boletosAtrasados]
                  .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
                  .map((boleto) => <CartaoBoleto key={boleto.id} boleto={boleto} />)
              )}
            </div>

            <div className="space-y-2">
              <p className="rotulo">Vencendo hoje</p>
              {boletosVencendoHoje.length === 0 ? (
                <Vazio mensagem="Nenhum pagamento vencendo hoje." />
              ) : (
                [...boletosVencendoHoje]
                  .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
                  .map((boleto) => <CartaoBoleto key={boleto.id} boleto={boleto} />)
              )}
            </div>

            <div className="space-y-2">
              <p className="rotulo">A vencer</p>
              {boletosAVencer.length === 0 ? (
                <Vazio mensagem="Nenhum pagamento a vencer." />
              ) : (
                [...boletosAVencer]
                  .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
                  .map((boleto) => (
                    <div key={boleto.id} className="space-y-1">
                      <p className="rotulo">{rotuloDia(boleto.vencimento)}</p>
                      <CartaoBoleto boleto={boleto} />
                    </div>
                  ))
              )}
            </div>

            <div className="space-y-2">
              <p className="rotulo text-primaria-escura">Pagos</p>
              {boletosPagos.length === 0 ? (
                <Vazio mensagem="Nenhum boleto marcado como pago." />
              ) : (
                [...boletosPagos]
                  .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
                  .map((boleto) => <CartaoBoleto key={boleto.id} boleto={boleto} />)
              )}
            </div>
          </section>
        </>
      ) : abaFinanceira === "conferencia" ? (
        <div className="space-y-4">
          {mensagemReceberBoleto && (
            <BannerMensagemFinanceiro texto={mensagemReceberBoleto} />
          )}
          <ConferenciaFinanceira
            onIrParaPagamentos={(boletoId) => {
              setAbaFinanceira("pagamentos");
              if (boletoId) setBoletoDestaqueId(boletoId);
            }}
            onImportarBoleto={(boletoId) => {
              setAbaFinanceira("pagamentos");
              abrirImportarBoleto(boletoId);
            }}
          />
        </div>
      ) : abaFinanceira === "conciliacao" ? (
        <section className="space-y-4">
          <div>
            <h2>Conciliação bancária</h2>
            <p className="mt-1 text-sm text-slate-600">
              Aqui ficam os boletos com pagamento já informado. Confirme a <strong>data</strong> e o{" "}
              <strong>banco/conta</strong> no extrato e só então marque como pago.
            </p>
          </div>

          {mensagemReceberBoleto && (
            <BannerMensagemFinanceiro texto={mensagemReceberBoleto} />
          )}

          {boletosAguardandoConciliacao.length === 0 ? (
            <Vazio mensagem="Nenhum boleto aguardando conciliação. Informe o pagamento em Pagamentos para aparecer aqui." />
          ) : (
            <div className="space-y-3">
              {[...boletosAguardandoConciliacao]
                .sort((a, b) => (a.pagamento_data ?? a.vencimento).localeCompare(b.pagamento_data ?? b.vencimento))
                .map((boleto) => {
                  const selecionado = boletoConciliandoId === boleto.id;
                  const destacado = boletoDestaqueId === boleto.id;
                  return (
                    <Card
                      key={boleto.id}
                      id={`boleto-card-${boleto.id}`}
                      className={`space-y-3 ${destacado ? "border-2 border-blue-500 ring-2 ring-blue-200" : ""} ${
                        selecionado ? "border-blue-300 bg-blue-50/50" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-bold">{fornecedorDoBoleto(db, boleto)}</p>
                          <p className="text-sm text-slate-600">
                            {notaDoBoleto(db, boleto)
                              ? `${notaDoBoleto(db, boleto)?.tipo === "nfse" ? "NFS-e" : "NF-e"} ${notaDoBoleto(db, boleto)?.numero}`
                              : "Sem nota"}
                            {boleto.numero_parcela ? ` · ${rotuloParcela(boleto.numero_parcela)}` : ""}
                          </p>
                          <p className="text-xl font-bold">{moeda(boleto.pagamento_valor ?? boleto.valor)}</p>
                        </div>
                        <Badge cor="azul">Aguardando conciliação</Badge>
                      </div>

                      <div className="grid gap-2 rounded-card border border-blue-200 bg-white px-3 py-3 text-sm sm:grid-cols-2">
                        <p>
                          <span className="rotulo block">Data do pagamento</span>
                          <span className="font-semibold text-slate-900">
                            {boleto.pagamento_data ? dataBR(boleto.pagamento_data) : "—"}
                          </span>
                        </p>
                        <p>
                          <span className="rotulo block">Banco/conta usada</span>
                          <span className="font-semibold text-slate-900">{boleto.pagamento_banco_conta || "—"}</span>
                        </p>
                        <p>
                          <span className="rotulo block">Valor informado</span>
                          <span className="font-semibold text-slate-900">
                            {moeda(boleto.pagamento_valor ?? boleto.valor)}
                          </span>
                        </p>
                        <p>
                          <span className="rotulo block">Vencimento do boleto</span>
                          <span className="font-semibold text-slate-900">{dataBR(boleto.vencimento)}</span>
                        </p>
                      </div>

                      {!selecionado ? (
                        <button type="button" className="btn-primario" onClick={() => abrirConciliacaoBoleto(boleto.id)}>
                          <CircleCheckBig size={16} /> Confirmar data e banco no extrato
                        </button>
                      ) : (
                        <div className="space-y-3 rounded-card border border-slate-200 bg-slate-50 p-3">
                          <p className="text-sm font-medium text-slate-800">
                            Confirme no extrato do banco: pagamento em{" "}
                            <strong>{boleto.pagamento_data ? dataBR(boleto.pagamento_data) : "—"}</strong> pela conta{" "}
                            <strong>{boleto.pagamento_banco_conta || "—"}</strong>.
                          </p>
                          <label className="flex items-start gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={confirmouDataBancoConciliacao}
                              onChange={(event) => setConfirmouDataBancoConciliacao(event.target.checked)}
                            />
                            Confirmei a data de pagamento e o banco/conta no extrato.
                          </label>
                          {erroConciliacaoBoleto && (
                            <p className="rounded-card border border-erro bg-erro-clara px-3 py-2 text-sm font-medium text-erro">
                              {erroConciliacaoBoleto}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn-secundario"
                              disabled={processandoConciliacaoBoleto}
                              onClick={() => {
                                setBoletoConciliandoId(null);
                                setConfirmouDataBancoConciliacao(false);
                                setErroConciliacaoBoleto(null);
                              }}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              className="btn-primario"
                              disabled={processandoConciliacaoBoleto || !confirmouDataBancoConciliacao}
                              onClick={() => confirmarConciliacaoBoleto(boleto.id)}
                            >
                              <CircleCheckBig size={16} />
                              {processandoConciliacaoBoleto ? "Conciliando..." : "Marcar como pago"}
                            </button>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
            </div>
          )}
        </section>
      ) : abaFinanceira === "contas" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2>Contas a pagar</h2>
              <p className="text-sm text-slate-600">Mesma área financeira, reunindo contas manuais e originadas de NF-e.</p>
            </div>
            <button type="button" className="btn-primario" onClick={abrirNovaConta}>
              <Plus size={18} /> Nova conta
            </button>
          </div>

          {mensagemReceberBoleto && (
            <BannerMensagemFinanceiro texto={mensagemReceberBoleto} />
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="space-y-2 py-3">
              <p className="rotulo flex items-center gap-1">
                <CalendarDays size={14} /> Vencendo hoje
              </p>
              <p className="text-2xl font-bold text-slate-900">{resumoContas.vencendoHoje.quantidade}</p>
              <p className="text-sm text-slate-600">{moeda(resumoContas.vencendoHoje.total)}</p>
            </Card>
            <Card className="space-y-2 py-3">
              <p className="rotulo flex items-center gap-1">
                <Clock3 size={14} /> Próximos 7 dias
              </p>
              <p className="text-2xl font-bold text-slate-900">{resumoContas.proximos7Dias.quantidade}</p>
              <p className="text-sm text-slate-600">{moeda(resumoContas.proximos7Dias.total)}</p>
            </Card>
            <Card className="space-y-2 py-3">
              <p className="rotulo flex items-center gap-1 text-erro">
                <TriangleAlert size={14} /> Atrasadas
              </p>
              <p className="text-2xl font-bold text-erro">{resumoContas.atrasadas.quantidade}</p>
              <p className="text-sm text-slate-600">{moeda(resumoContas.atrasadas.total)}</p>
            </Card>
            <Card className="space-y-2 py-3">
              <p className="rotulo flex items-center gap-1 text-blue-700">
                <CircleCheckBig size={14} /> Aguardando conciliação bancária
              </p>
              <p className="text-2xl font-bold text-blue-700">{resumoContas.aguardandoConciliacao.quantidade}</p>
              <p className="text-sm text-slate-600">{moeda(resumoContas.aguardandoConciliacao.total)}</p>
            </Card>
          </div>

          <Card className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
              <label className="block">
                <span className="rotulo mb-1 flex items-center gap-1">
                  <Search size={14} /> Pesquisa
                </span>
                <input
                  type="search"
                  value={buscaConta}
                  onChange={(event) => setBuscaConta(event.target.value)}
                  className="input w-full"
                  placeholder="Fornecedor, descrição ou documento"
                />
              </label>
              <label className="block">
                <span className="rotulo mb-1 block">Status</span>
                <select
                  className="input w-full"
                  value={filtroStatusConta}
                  onChange={(event) => setFiltroStatusConta(event.target.value as StatusContaPagar | "todos")}
                >
                  {STATUS_CONTA_OPCOES.map((opcao) => (
                    <option key={opcao.valor} value={opcao.valor}>
                      {opcao.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="rotulo mb-1 block">Vencimento</span>
                <select
                  className="input w-full"
                  value={filtroVencimentoConta}
                  onChange={(event) => setFiltroVencimentoConta(event.target.value as FiltroVencimentoConta)}
                >
                  {FILTRO_VENCIMENTO_OPCOES.map((opcao) => (
                    <option key={opcao.valor} value={opcao.valor}>
                      {opcao.rotulo}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Card>

          {contasFiltradas.length === 0 ? (
            <Vazio mensagem={contas.length === 0 ? "Nenhuma conta a pagar cadastrada." : "Nenhuma conta encontrada com os filtros atuais."} />
          ) : (
            <>
              <div className="hidden md:block">
                <Card className="p-0">
                  <Tabela cabecalho={["Fornecedor", "Descrição", "Origem", "Documento", "Vencimento", "Valor final", "Status", "Ações"]}>
                    {contasFiltradas.map((conta) => (
                      <tr key={conta.id}>
                        <td className="px-3 py-3 text-sm text-slate-700">{nomeFornecedorConta(conta)}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">{conta.descricao}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">{rotuloOrigemConta(conta.origem)}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">{conta.documento_id ?? "—"}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">{dataBR(conta.data_vencimento)}</td>
                        <td className="px-3 py-3 text-sm font-bold text-slate-900">{moeda(conta.valor_final)}</td>
                        <td className="px-3 py-3">
                          <BadgeStatusConta status={conta.status} />
                        </td>
                        <td className="px-3 py-3">
                          {contaPodeReceberBoleto(conta) && (
                            <button type="button" className="btn-secundario" onClick={() => abrirReceberBoleto(conta)}>
                              <Upload size={16} /> Receber boleto
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Tabela>
                </Card>
              </div>

              <div className="space-y-3 md:hidden">
                {contasFiltradas.map((conta) => (
                  <Card key={conta.id} className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-900">{nomeFornecedorConta(conta)}</p>
                        <p className="text-sm text-slate-600">{conta.descricao}</p>
                      </div>
                      <BadgeStatusConta status={conta.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                      <div>
                        <p className="rotulo">Origem</p>
                        <p>{rotuloOrigemConta(conta.origem)}</p>
                      </div>
                      <div>
                        <p className="rotulo">Documento</p>
                        <p>{conta.documento_id ?? "—"}</p>
                      </div>
                      <div>
                        <p className="rotulo">Vencimento</p>
                        <p>{dataBR(conta.data_vencimento)}</p>
                      </div>
                      <div>
                        <p className="rotulo">Valor final</p>
                        <p className="font-bold text-slate-900">{moeda(conta.valor_final)}</p>
                      </div>
                    </div>
                    {contaPodeReceberBoleto(conta) && (
                      <div className="pt-1">
                        <button type="button" className="btn-secundario w-full" onClick={() => abrirReceberBoleto(conta)}>
                          <Upload size={16} /> Receber boleto
                        </button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </>
          )}
        </section>
      ) : abaFinanceira === "boletos_pagos" ? (
        <section className="space-y-4">
          <div>
            <h2>Arquivo de boletos pagos</h2>
            <p className="mt-1 text-sm text-slate-600">
              Memória dos boletos já liquidados. Se o mesmo PDF voltar pela Caixa de entrada, o sistema avisa
              que já foi pago.
            </p>
          </div>

          {mensagemReceberBoleto && <BannerMensagemFinanceiro texto={mensagemReceberBoleto} />}

          <Card className="space-y-3">
            <label className="block max-w-xl">
              <span className="rotulo mb-1 flex items-center gap-1">
                <Search size={14} /> Pesquisa
              </span>
              <input
                type="search"
                value={buscaBoletosPagos}
                onChange={(event) => setBuscaBoletosPagos(event.target.value)}
                className="input w-full"
                placeholder="Fornecedor, NF, banco, valor…"
              />
            </label>
          </Card>

          {boletosPagosArquivo.length === 0 ? (
            <Vazio
              mensagem={
                boletosPagos.length === 0
                  ? "Nenhum boleto pago ainda. Após conciliar, eles aparecem aqui."
                  : "Nenhum boleto encontrado com a pesquisa atual."
              }
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Card className="p-0">
                  <Tabela
                    cabecalho={[
                      "Fornecedor",
                      "NF / parcela",
                      "Vencimento",
                      "Pago em",
                      "Banco/conta",
                      "Valor pago",
                      "Ações",
                    ]}
                  >
                    {boletosPagosArquivo.map((boleto) => {
                      const nota = notaDoBoleto(db, boleto);
                      return (
                        <tr key={boleto.id} className="bg-emerald-50/30">
                          <td className="px-3 py-3 text-sm font-semibold text-slate-900">
                            {fornecedorDoBoleto(db, boleto)}
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-700">
                            {nota
                              ? `${nota.tipo === "nfse" ? "NFS-e" : "NF-e"} ${nota.numero}`
                              : "Sem nota"}
                            {boleto.numero_parcela ? ` · parc. ${boleto.numero_parcela}` : ""}
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-700">{dataBR(boleto.vencimento)}</td>
                          <td className="px-3 py-3 text-sm text-slate-700">
                            {boleto.pagamento_data ? dataBR(boleto.pagamento_data) : "—"}
                          </td>
                          <td className="px-3 py-3 text-sm text-slate-700">
                            {boleto.pagamento_banco_conta || "—"}
                          </td>
                          <td className="px-3 py-3 text-sm font-bold text-slate-900">
                            {moeda(boleto.pagamento_valor ?? boleto.valor)}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-2">
                              {boleto.documento_boleto_id && (
                                <button
                                  type="button"
                                  className="btn-secundario text-xs"
                                  disabled={abrindoPdfArquivoId === boleto.documento_boleto_id}
                                  onClick={() => void verPdfArquivoBoleto(boleto)}
                                >
                                  <Eye size={14} />
                                  {abrindoPdfArquivoId === boleto.documento_boleto_id
                                    ? "Abrindo..."
                                    : "Ver PDF"}
                                </button>
                              )}
                              <Badge cor="verde">Pago</Badge>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </Tabela>
                </Card>
              </div>

              <div className="space-y-3 md:hidden">
                {boletosPagosArquivo.map((boleto) => {
                  const nota = notaDoBoleto(db, boleto);
                  return (
                    <Card key={boleto.id} className="space-y-3 border-emerald-200 bg-emerald-50/40">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900">{fornecedorDoBoleto(db, boleto)}</p>
                          <p className="text-sm text-slate-600">
                            {nota
                              ? `${nota.tipo === "nfse" ? "NFS-e" : "NF-e"} ${nota.numero}`
                              : "Sem nota"}
                            {boleto.numero_parcela ? ` · parc. ${boleto.numero_parcela}` : ""}
                          </p>
                        </div>
                        <Badge cor="verde">Pago</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
                        <div>
                          <p className="rotulo">Vencimento</p>
                          <p>{dataBR(boleto.vencimento)}</p>
                        </div>
                        <div>
                          <p className="rotulo">Pago em</p>
                          <p>{boleto.pagamento_data ? dataBR(boleto.pagamento_data) : "—"}</p>
                        </div>
                        <div>
                          <p className="rotulo">Banco/conta</p>
                          <p>{boleto.pagamento_banco_conta || "—"}</p>
                        </div>
                        <div>
                          <p className="rotulo">Valor</p>
                          <p className="font-semibold text-slate-900">
                            {moeda(boleto.pagamento_valor ?? boleto.valor)}
                          </p>
                        </div>
                      </div>
                      {boleto.documento_boleto_id && (
                        <button
                          type="button"
                          className="btn-secundario w-full"
                          disabled={abrindoPdfArquivoId === boleto.documento_boleto_id}
                          onClick={() => void verPdfArquivoBoleto(boleto)}
                        >
                          <Eye size={16} />
                          {abrindoPdfArquivoId === boleto.documento_boleto_id ? "Abrindo..." : "Ver PDF"}
                        </button>
                      )}
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2>Notas fiscais</h2>
              <p className="text-sm text-slate-600">
                Arquivo das NF-e. Notas quitadas (todas as parcelas pagas) ficam destacadas como arquivo.
              </p>
            </div>
          </div>

          <Card className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_240px]">
              <label className="block">
                <span className="rotulo mb-1 flex items-center gap-1">
                  <Search size={14} /> Pesquisa
                </span>
                <input
                  type="search"
                  value={buscaNfe}
                  onChange={(event) => setBuscaNfe(event.target.value)}
                  className="input w-full"
                  placeholder="Número, fornecedor, CNPJ emitente ou chave"
                />
              </label>
              <label className="block">
                <span className="rotulo mb-1 block">Completude</span>
                <select
                  className="input w-full"
                  value={filtroCompletudeNfe}
                  onChange={(event) => setFiltroCompletudeNfe(event.target.value as "todas" | IndicadorCompletudeFinanceiro)}
                >
                  {FILTRO_COMPLETUDE_NFE_OPCOES.map((opcao) => (
                    <option key={opcao.valor} value={opcao.valor}>
                      {opcao.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="rotulo mb-1 block">Pagamento</span>
                <select
                  className="input w-full"
                  value={filtroStatusPagamentoNfe}
                  onChange={(event) =>
                    setFiltroStatusPagamentoNfe(event.target.value as "todas" | StatusPagamentoNota)
                  }
                >
                  {FILTRO_STATUS_PAGAMENTO_NFE_OPCOES.map((opcao) => (
                    <option key={opcao.valor} value={opcao.valor}>
                      {opcao.rotulo}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Card>

          {notasFiscaisFinanceiro.length === 0 ? (
            <Vazio mensagem={db.notas_fiscais.length === 0 ? "Nenhuma nota fiscal importada." : "Nenhuma nota fiscal encontrada com os filtros atuais."} />
          ) : (
            <>
              <div className="hidden md:block">
                <Card className="p-0">
                  <Tabela
                    cabecalho={[
                      "NF-e",
                      "Fornecedor vinculado",
                      "Emitente (XML)",
                      "Emissão",
                      "Total",
                      "Parcelas",
                      "Soma parcelas",
                      "Pagamento",
                      "Completude",
                      "Ações",
                    ]}
                  >
                    {notasFiscaisFinanceiro.map((resumo) => (
                      <tr
                        key={resumo.nota.id}
                        className={resumo.statusPagamento === "quitada" ? "bg-emerald-50/40" : undefined}
                      >
                        <td className="px-3 py-3 text-sm font-semibold text-slate-900">{resumo.nota.numero || "—"}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">{resumo.fornecedorNome}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">
                          <p>{resumo.emitenteNome}</p>
                          <p className="text-xs text-slate-500">{resumo.emitenteCnpj}</p>
                        </td>
                        <td className="px-3 py-3 text-sm text-slate-700">{resumo.nota.emitida_em ? dataBR(resumo.nota.emitida_em) : "—"}</td>
                        <td className="px-3 py-3 text-sm font-semibold text-slate-900">{moeda(resumo.nota.valor_total)}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">{resumo.quantidadeParcelas}</td>
                        <td className="px-3 py-3 text-sm text-slate-700">{moeda(resumo.somaParcelas)}</td>
                        <td className="px-3 py-3">
                          <BadgeStatusPagamentoNota status={resumo.statusPagamento} />
                        </td>
                        <td className="px-3 py-3">
                          <BadgeCompletudeNfeFinanceiro indicador={resumo.indicadorCompletude} />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="btn-secundario" onClick={() => abrirDetalhesNfe(resumo.nota.id)}>
                              Ver detalhes
                            </button>
                            {(resumo.statusPagamento === "aguardando_pagamento" ||
                              resumo.statusPagamento === "parcialmente_paga") && (
                              <button
                                type="button"
                                className="btn-primario"
                                onClick={() => irParaPagamentoDaNota(resumo.nota.id)}
                              >
                                Ir para pagamento
                              </button>
                            )}
                            {resumo.statusPagamento === "sem_boleto" && (
                              <button
                                type="button"
                                className="btn-secundario"
                                onClick={() => {
                                  setAbaFinanceira("conferencia");
                                  setMensagemReceberBoleto(
                                    `NF-e ${resumo.nota.numero}: pareie o boleto na Conferência para liberar o pagamento.`
                                  );
                                }}
                              >
                                Ir para conferência
                              </button>
                            )}
                            <button type="button" className="btn-secundario" onClick={() => iniciarCorrecaoNfe(resumo.nota.id)}>
                              Completar ou corrigir dados
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </Tabela>
                </Card>
              </div>

              <div className="space-y-3 md:hidden">
                {notasFiscaisFinanceiro.map((resumo) => (
                  <Card
                    key={resumo.nota.id}
                    className={`space-y-3 ${resumo.statusPagamento === "quitada" ? "border-emerald-200 bg-emerald-50/40" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-900">NF-e {resumo.nota.numero || "—"}</p>
                        <p className="text-sm text-slate-600">{resumo.fornecedorNome}</p>
                        <p className="text-xs text-slate-500">{resumo.emitenteNome} · {resumo.emitenteCnpj}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <BadgeStatusPagamentoNota status={resumo.statusPagamento} />
                        <BadgeCompletudeNfeFinanceiro indicador={resumo.indicadorCompletude} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                      <div>
                        <p className="rotulo">Emissão</p>
                        <p>{resumo.nota.emitida_em ? dataBR(resumo.nota.emitida_em) : "—"}</p>
                      </div>
                      <div>
                        <p className="rotulo">Total</p>
                        <p className="font-semibold text-slate-900">{moeda(resumo.nota.valor_total)}</p>
                      </div>
                      <div>
                        <p className="rotulo">Parcelas</p>
                        <p>{resumo.quantidadeParcelas}</p>
                      </div>
                      <div>
                        <p className="rotulo">Soma parcelas</p>
                        <p>{moeda(resumo.somaParcelas)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 pt-1">
                      <button type="button" className="btn-secundario w-full" onClick={() => abrirDetalhesNfe(resumo.nota.id)}>
                        Ver detalhes
                      </button>
                      {(resumo.statusPagamento === "aguardando_pagamento" ||
                        resumo.statusPagamento === "parcialmente_paga") && (
                        <button
                          type="button"
                          className="btn-primario w-full"
                          onClick={() => irParaPagamentoDaNota(resumo.nota.id)}
                        >
                          Ir para pagamento
                        </button>
                      )}
                      {resumo.statusPagamento === "sem_boleto" && (
                        <button
                          type="button"
                          className="btn-secundario w-full"
                          onClick={() => {
                            setAbaFinanceira("conferencia");
                            setMensagemReceberBoleto(
                              `NF-e ${resumo.nota.numero}: pareie o boleto na Conferência para liberar o pagamento.`
                            );
                          }}
                        >
                          Ir para conferência
                        </button>
                      )}
                      <button type="button" className="btn-secundario w-full" onClick={() => iniciarCorrecaoNfe(resumo.nota.id)}>
                        Completar ou corrigir dados
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* Confirmação "Liberar mesmo assim" */}
      <Modal
        aberto={Boolean(boletoLiberando)}
        titulo="Liberar sem conferência?"
        onFechar={() => setConfirmandoLiberacao(null)}
      >
        {boletoLiberando && (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              Este boleto de <span className="font-bold">{moeda(boletoLiberando.valor)}</span> (
              {fornecedorDoBoleto(db, boletoLiberando)}) está travado porque a mercadoria ainda não foi conferida.
            </p>
            <p className="rounded-card bg-destaque-clara p-3 text-sm font-semibold text-destaque">
              Risco: se a entrega vier com falta ou avaria depois do pagamento, fica muito mais difícil negociar o
              desconto ou a devolução com o fornecedor.
            </p>
            <div className="flex gap-2">
              <button className="btn-perigo flex-1" onClick={() => liberarMesmoAssim(boletoLiberando)}>
                Liberar mesmo assim
              </button>
              <button className="btn-secundario flex-1" onClick={() => setConfirmandoLiberacao(null)}>
                Manter travado
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        aberto={modalImportarBoletoAberto}
        titulo="Importar boleto"
        onFechar={fecharImportarBoleto}
        fecharAoClicarFundo={false}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          className="space-y-4"
        >
          <label className="block">
            <span className="rotulo mb-1 block">Arquivo do boleto (PDF, JPG ou PNG)</span>
            {estadoImportacaoBoleto.arquivo && (
              <p className="mb-2 rounded-card bg-sucesso-clara px-3 py-2 text-sm text-slate-800">
                Já carregado{itemLoteBoletoId ? " do lote" : ""}:{" "}
                <strong>{estadoImportacaoBoleto.arquivo.name}</strong>
                {processandoImportacaoBoleto ? " · analisando…" : ""}
              </p>
            )}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              className="input w-full py-2"
              onChange={selecionarArquivoImportacao}
              disabled={processandoImportacaoBoleto}
            />
          </label>

          <Card className="space-y-1 bg-slate-50 py-3">
            <p className="text-sm font-semibold text-slate-800">Etapas</p>
            <p className="text-xs text-slate-600">1. Lendo documento</p>
            <p className="text-xs text-slate-600">2. Validando código</p>
            <p className="text-xs text-slate-600">3. Procurando NF-e e parcela</p>
            <p className="text-xs text-slate-600">4. Resultado do confronto</p>
            {estadoImportacaoBoleto.etapa && <p className="text-xs font-semibold text-primaria">Etapa atual: {estadoImportacaoBoleto.etapa.replace(/_/g, " ")}</p>}
          </Card>

          {estadoImportacaoBoleto.linhaSelecionada && (
            <Card className="space-y-2 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">Linha identificada</p>
                <button
                  type="button"
                  className="btn-secundario"
                  onClick={() => setMostrarLinhaCompletaImportada((atual) => !atual)}
                >
                  {mostrarLinhaCompletaImportada ? <EyeOff size={16} /> : <Eye size={16} />} {mostrarLinhaCompletaImportada ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <p className="text-sm text-slate-700">
                {mascararLinhaDigitavel(estadoImportacaoBoleto.linhaSelecionada, mostrarLinhaCompletaImportada)}
              </p>
              <p className="text-sm text-slate-700">
                Valor validado: {valorValidadoComoMoeda(estadoImportacaoBoleto.linhaSelecionada) === undefined ? "—" : moeda(valorValidadoComoMoeda(estadoImportacaoBoleto.linhaSelecionada) ?? 0)}
              </p>
            </Card>
          )}

          {estadoImportacaoBoleto.confronto && apresentacaoConfronto && (
            <Card
              className={`space-y-2 py-3 ${
                apresentacaoConfronto.variante === "verde"
                  ? "border border-sucesso bg-sucesso-clara"
                  : apresentacaoConfronto.variante === "amarelo"
                  ? "border border-destaque bg-destaque-clara"
                  : apresentacaoConfronto.variante === "vermelho"
                  ? "border border-erro bg-erro-clara"
                  : "border border-slate-300 bg-slate-50"
              }`}
            >
              <p className="font-bold">{apresentacaoConfronto.titulo}</p>
              {apresentacaoConfronto.proximoPasso && (
                <p className="text-sm text-slate-700">{apresentacaoConfronto.proximoPasso}</p>
              )}
              {estadoImportacaoBoleto.confronto.avisos.length > 0 && (
                <div className="space-y-1 text-sm text-slate-700">
                  {estadoImportacaoBoleto.confronto.avisos.map((aviso, index) => (
                    <p key={`aviso-${index}`}>{aviso}</p>
                  ))}
                </div>
              )}
              <p className="text-sm">Fornecedor: {nomeFornecedorDoConfronto(estadoImportacaoBoleto.confronto)}</p>
              <p className="text-sm">
                CNPJ emitente/beneficiário: {mascararCnpj(estadoImportacaoBoleto.dadosExtraidos?.cnpj_beneficiario)}
              </p>
              <p className="text-sm">NF-e: {estadoImportacaoBoleto.dadosExtraidos?.numero_nfe ?? "—"}</p>
              <p className="text-sm">Chave NF-e: {mascararChaveNfe(estadoImportacaoBoleto.dadosExtraidos?.chave_nfe)}</p>
              <p className="text-sm">Parcela: {estadoImportacaoBoleto.dadosExtraidos?.numero_parcela ?? "—"}</p>
              <p className="text-sm">Valor do boleto: {estadoImportacaoBoleto.dadosExtraidos?.valor_codificado === undefined ? "—" : moeda(estadoImportacaoBoleto.dadosExtraidos.valor_codificado)}</p>
              <p className="text-sm">Valor da parcela: {parcelaDoConfronto(estadoImportacaoBoleto.confronto) ? moeda(parcelaDoConfronto(estadoImportacaoBoleto.confronto)?.valor ?? 0) : "—"}</p>
              <p className="text-sm">Vencimento do boleto: {estadoImportacaoBoleto.dadosExtraidos?.vencimento_extraido ? dataBR(estadoImportacaoBoleto.dadosExtraidos.vencimento_extraido) : "—"}</p>
              <p className="text-sm">Vencimento da parcela: {parcelaDoConfronto(estadoImportacaoBoleto.confronto)?.vencimento ? dataBR(parcelaDoConfronto(estadoImportacaoBoleto.confronto)?.vencimento ?? "") : "—"}</p>
              {estadoImportacaoBoleto.confronto.criterios_coincidentes.length > 0 && (
                <p className="text-sm">Critérios conferidos: {estadoImportacaoBoleto.confronto.criterios_coincidentes.join(", ")}</p>
              )}
              {estadoImportacaoBoleto.confronto.divergencias.length > 0 && (
                <div className="space-y-1 rounded-card border border-erro bg-white px-3 py-2 text-sm text-erro">
                  {estadoImportacaoBoleto.confronto.divergencias.map((item, index) => (
                    <p key={`${item}-${index}`}>{item}</p>
                  ))}
                </div>
              )}

              {(estadoImportacaoBoleto.confronto.classificacao === "multiplas_possibilidades" ||
                (estadoImportacaoBoleto.confronto.classificacao === "divergente" &&
                  estadoImportacaoBoleto.confronto.candidatos.length > 0)) && (
                <div className="space-y-2 rounded-card border border-slate-200 bg-white px-3 py-2">
                  <p className="text-sm font-semibold">
                    {estadoImportacaoBoleto.confronto.classificacao === "divergente"
                      ? "Possíveis notas / parcelas"
                      : "Selecione uma parcela candidata"}
                  </p>
                  <select
                    className="input w-full"
                    value={
                      parcelaSelecionadaMultipla ||
                      (estadoImportacaoBoleto.confronto.candidatos.length === 1
                        ? estadoImportacaoBoleto.confronto.candidatos[0].boleto_id
                        : "")
                    }
                    onChange={(event) => setParcelaSelecionadaMultipla(event.target.value)}
                    disabled={processandoImportacaoBoleto}
                  >
                    <option value="">Selecione</option>
                    {estadoImportacaoBoleto.confronto.candidatos.map((candidato) => {
                      const parcela = db.boletos.find((boleto) => boleto.id === candidato.boleto_id);
                      const nota = db.notas_fiscais.find((n) => n.id === candidato.nota_id);
                      const deltaValor =
                        parcela && estadoImportacaoBoleto.dadosExtraidos?.valor_codificado !== undefined
                          ? Math.abs(
                              Number(
                                (parcela.valor - estadoImportacaoBoleto.dadosExtraidos.valor_codificado).toFixed(2)
                              )
                            )
                          : undefined;
                      return (
                        <option key={candidato.boleto_id} value={candidato.boleto_id}>
                          NF {nota?.numero ?? "s/n"} · {nomeFornecedor(db, nota?.fornecedor_id)} ·{" "}
                          {rotuloParcela(parcela?.numero_parcela)} · {parcela ? moeda(parcela.valor) : "—"}
                          {parcela?.vencimento ? ` · ${dataBR(parcela.vencimento)}` : ""}
                          {deltaValor !== undefined && deltaValor > 0.01 ? ` · Δ ${moeda(deltaValor)}` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {(estadoImportacaoBoleto.confronto.classificacao === "parcial" ||
                estadoImportacaoBoleto.confronto.classificacao === "multiplas_possibilidades" ||
                estadoImportacaoBoleto.confronto.classificacao === "divergente") && (
                <label className="block">
                  <span className="rotulo mb-1 block">Justificativa da confirmação *</span>
                  <textarea
                    className="input min-h-20 w-full py-2"
                    value={justificativaImportacao}
                    onChange={(event) => setJustificativaImportacao(event.target.value)}
                    disabled={processandoImportacaoBoleto}
                    placeholder="Ex.: conferi DANFE e boleto; diferença de centavos / vencimento do fornecedor"
                  />
                </label>
              )}

              {(estadoImportacaoBoleto.confronto.classificacao === "sem_correspondencia" ||
                estadoImportacaoBoleto.confronto.classificacao === "divergente") && (
                <div className="space-y-2 rounded-card border border-slate-200 bg-white px-3 py-3">
                  <p className="text-sm font-semibold text-slate-800">Vincular manualmente a uma NF-e</p>
                  <p className="text-xs text-slate-600">
                    Use se a nota ainda não tem parcela, ou se nenhuma sugestão estiver correta. O sistema cria a
                    parcela com o valor e o vencimento do boleto e reanalisa.
                  </p>
                  <select
                    className="input w-full"
                    value={notaVinculoManualId}
                    onChange={(event) => setNotaVinculoManualId(event.target.value)}
                    disabled={processandoImportacaoBoleto}
                  >
                    <option value="">Selecione a NF-e</option>
                    {[...db.notas_fiscais]
                      .slice()
                      .sort((a, b) => (b.importada_em || "").localeCompare(a.importada_em || ""))
                      .slice(0, 40)
                      .map((nota) => (
                        <option key={nota.id} value={nota.id}>
                          NF {nota.numero ?? "s/n"} · {nomeFornecedor(db, nota.fornecedor_id)} ·{" "}
                          {moeda(nota.valor_total)} · {dataBR(nota.emitida_em)}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="btn-secundario w-full"
                    onClick={criarParcelaManualEReanalisar}
                    disabled={processandoImportacaoBoleto || !notaVinculoManualId}
                  >
                    Criar parcela nesta NF-e e reanalisar
                  </button>
                </div>
              )}
            </Card>
          )}

          {estadoImportacaoBoleto.falha && (
            <Card className="space-y-2 border border-erro bg-erro-clara py-3">
              <p className="text-sm font-semibold text-erro">Falha na análise do boleto</p>
              <p className="text-sm text-erro">{estadoImportacaoBoleto.falha}</p>
              <button type="button" className="btn-secundario" onClick={() => setMostrarDetalhesTecnicos((atual) => !atual)}>
                Detalhes técnicos
              </button>
              {mostrarDetalhesTecnicos && estadoImportacaoBoleto.diagnostico && (
                <div className="rounded-card border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  <p>PDF aberto: {estadoImportacaoBoleto.diagnostico.pdfAberto ? "sim" : "não"}</p>
                  <p>Páginas processadas: {estadoImportacaoBoleto.diagnostico.paginasProcessadas}</p>
                  <p>Texto encontrado: {estadoImportacaoBoleto.diagnostico.textoEncontrado ? "sim" : "não"}</p>
                  <p>Candidatos numéricos encontrados: {estadoImportacaoBoleto.diagnostico.candidatosNumericosEncontrados}</p>
                  <p>BarcodeDetector disponível: {estadoImportacaoBoleto.diagnostico.barcodeDetectorDisponivel ? "sim" : "não"}</p>
                  <p>BarcodeDetector executado: {estadoImportacaoBoleto.diagnostico.barcodeDetectorExecutado ? "sim" : "não"}</p>
                  <p>ZXing executado: {estadoImportacaoBoleto.diagnostico.zxingExecutado ? "sim" : "não"}</p>
                  <p>Resultado válido encontrado: {estadoImportacaoBoleto.diagnostico.resultadoValidoEncontrado ? "sim" : "não"}</p>
                </div>
              )}
            </Card>
          )}

          {mensagemImportacaoBoleto && (
            <p className="rounded-card border border-erro bg-erro-clara px-3 py-2 text-sm font-medium text-erro">{mensagemImportacaoBoleto}</p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secundario" onClick={fecharImportarBoleto} disabled={processandoImportacaoBoleto}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primario"
              onClick={() => void confirmarImportacaoPrincipal()}
              disabled={
                processandoImportacaoBoleto ||
                !estadoImportacaoBoleto.confronto ||
                !(
                  estadoImportacaoBoleto.confronto.classificacao === "exata" ||
                  estadoImportacaoBoleto.confronto.classificacao === "parcial" ||
                  estadoImportacaoBoleto.confronto.classificacao === "multiplas_possibilidades" ||
                  estadoImportacaoBoleto.confronto.classificacao === "divergente"
                )
              }
            >
              <Upload size={16} />
              {estadoImportacaoBoleto.confronto?.classificacao === "exata"
                ? `Confirmar vínculo: NF-e ${
                    db.notas_fiscais.find((n) => n.id === estadoImportacaoBoleto.confronto?.nota_id)?.numero ?? "—"
                  } · parcela ${
                    db.boletos.find((b) => b.id === estadoImportacaoBoleto.confronto?.parcela_id)?.numero_parcela ??
                    "—"
                  }`
                : estadoImportacaoBoleto.confronto?.classificacao === "parcial" ||
                    estadoImportacaoBoleto.confronto?.classificacao === "multiplas_possibilidades" ||
                    estadoImportacaoBoleto.confronto?.classificacao === "divergente"
                  ? "Confirmar vínculo e adicionar aos pagamentos futuros"
                  : "Confirmar e adicionar aos pagamentos futuros"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal aberto={Boolean(boletoResumo)} titulo="Resumo da conferência" onFechar={() => setBoletoResumoId(null)}>
        {boletoResumo && (
          <div className="space-y-2 text-sm text-slate-700">
            <p>Fornecedor: {fornecedorDoBoleto(db, boletoResumo)}</p>
            <p>NF-e: {notaResumo?.numero ?? "—"}</p>
            <p>Parcela: {boletoResumo.numero_parcela ?? "—"}</p>
            <p>Valor: {moeda(boletoResumo.valor)}</p>
            <p>Vencimento: {dataBR(boletoResumo.vencimento)}</p>
            <p>Status conferência: {boletoResumo.status_conferencia ?? "—"}</p>
            <p>Conferido por: {boletoResumo.conferido_por ?? "—"}</p>
            <p>Conferido em: {boletoResumo.conferido_em ? dataBR(boletoResumo.conferido_em) : "—"}</p>
            {documentoResumo?.criterios_conferidos && documentoResumo.criterios_conferidos.length > 0 && (
              <p>Critérios: {documentoResumo.criterios_conferidos.join(", ")}</p>
            )}
            {documentoResumo?.justificativa_confirmacao && <p>Justificativa: {documentoResumo.justificativa_confirmacao}</p>}
          </div>
        )}
      </Modal>

      <Modal
        aberto={Boolean(boletoPagamento && snapshotPagamento)}
        titulo="Informar pagamento realizado"
        onFechar={fecharPagamentoBoleto}
        fecharAoClicarFundo={false}
      >
        {boletoPagamento && snapshotPagamento && (
          <form onSubmit={confirmarPagamentoBoleto} className="space-y-3">
            <Card className="space-y-2 bg-slate-50 py-3">
              <p className="font-bold text-slate-900">{fornecedorDoBoleto(db, boletoPagamento)}</p>
              <p className="text-sm text-slate-700">NF-e: {notaPagamento?.numero ?? "—"}</p>
              <p className="text-sm text-slate-700">Parcela: {rotuloParcela(boletoPagamento.numero_parcela)}</p>
              <p className="text-sm text-slate-700">CNPJ beneficiário: {cnpjBR(boletoPagamento.cnpj_beneficiario)}</p>
              <p className="text-sm text-slate-700">Valor do boleto: {moeda(boletoPagamento.valor)}</p>
              <p className="text-sm text-slate-700">Vencimento: {dataBR(boletoPagamento.vencimento)}</p>
            </Card>

            <div className="rounded-card border border-destaque bg-destaque-clara px-3 py-3 text-sm text-destaque">
              Informe a <strong>data</strong> e o <strong>banco/conta</strong> usados no pagamento. Depois você
              confirma esses dados na aba Conciliação bancária (baixa final).
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-1">
                <span className="rotulo mb-1 block">Data do pagamento *</span>
                <input
                  type="date"
                  className="input w-full"
                  value={formPagamentoBoleto.dataPagamento}
                  onChange={(event) => atualizarCampoPagamento("dataPagamento", event.target.value)}
                  required
                />
              </label>
              <label className="block sm:col-span-1">
                <span className="rotulo mb-1 block">Valor pago *</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  className="input w-full"
                  value={formPagamentoBoleto.valorPago}
                  onChange={(event) => atualizarCampoPagamento("valorPago", event.target.value)}
                  required
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="rotulo mb-1 block">Banco/conta de onde pagou *</span>
                <input
                  className="input w-full"
                  list="lista-bancos-contas-pagamento"
                  value={formPagamentoBoleto.bancoConta}
                  onChange={(event) => atualizarCampoPagamento("bancoConta", event.target.value)}
                  placeholder="Ex.: Itaú - Conta Operacional"
                  required
                />
                <datalist id="lista-bancos-contas-pagamento">
                  {bancosContasUsados.map((banco) => (
                    <option key={banco} value={banco} />
                  ))}
                </datalist>
                <span className="mt-1 block text-xs text-slate-500">
                  Esse banco/conta será o que você confirma depois na conciliação.
                </span>
              </label>
              <label className="block sm:col-span-2">
                <span className="rotulo mb-1 block">Responsável</span>
                <input
                  className="input w-full"
                  value={formPagamentoBoleto.responsavel}
                  onChange={(event) => atualizarCampoPagamento("responsavel", event.target.value)}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="rotulo mb-1 block">Observação (opcional)</span>
                <textarea
                  className="input min-h-20 w-full py-2"
                  value={formPagamentoBoleto.observacao}
                  onChange={(event) => atualizarCampoPagamento("observacao", event.target.value)}
                />
              </label>
            </div>

            <Card className="space-y-2 border border-blue-200 bg-blue-50/40 py-3 text-sm text-slate-800">
              <p className="font-semibold text-blue-900">Confirme antes de gravar</p>
              <p>
                Data:{" "}
                <strong>
                  {formPagamentoBoleto.dataPagamento ? dataBR(formPagamentoBoleto.dataPagamento) : "—"}
                </strong>
              </p>
              <p>
                Banco/conta: <strong>{formPagamentoBoleto.bancoConta.trim() || "—"}</strong>
              </p>
              <p>
                Valor:{" "}
                <strong>
                  {lerNumero(formPagamentoBoleto.valorPago) != null
                    ? moeda(lerNumero(formPagamentoBoleto.valorPago)!)
                    : "—"}
                </strong>
              </p>
            </Card>

            <label className="block rounded-card border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <span className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={formPagamentoBoleto.confirmouAviso}
                  onChange={(event) => atualizarCampoPagamento("confirmouAviso", event.target.checked)}
                />
                Confirmei a data do pagamento e o banco/conta usados, além de beneficiário, valor e vencimento.
              </span>
            </label>

            {erroPagamentoBoleto && (
              <p className="rounded-card border border-erro bg-erro-clara px-3 py-2 text-sm font-medium text-erro">{erroPagamentoBoleto}</p>
            )}
            {mensagemPagamentoBoleto && (
              <p className="rounded-card border border-sucesso bg-sucesso-clara px-3 py-2 text-sm font-medium text-primaria-escura">
                {mensagemPagamentoBoleto}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secundario" onClick={fecharPagamentoBoleto} disabled={processandoPagamentoBoleto}>
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primario"
                disabled={
                  processandoPagamentoBoleto ||
                  !formPagamentoBoleto.confirmouAviso ||
                  !formPagamentoBoleto.dataPagamento ||
                  !formPagamentoBoleto.bancoConta.trim()
                }
              >
                <CircleCheckBig size={16} /> {processandoPagamentoBoleto ? "Informando..." : "Informar pagamento"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        aberto={Boolean(notaDetalhes)}
        titulo="Detalhes da nota fiscal"
        onFechar={fecharDetalhesNfe}
        tamanho="lg"
      >
        {notaDetalhes && (
          <div className="space-y-3">
            <VistaNotaEstiloDanfe
              nota={notaDetalhes.nota}
              fornecedorNome={notaDetalhes.fornecedorNome}
            />

            <Card className="space-y-2 border border-slate-200 py-3">
              <p className="text-sm font-semibold text-slate-800">Parcelas e boletos associados</p>
              {notaDetalhes.parcelas.length === 0 ? (
                <p className="text-sm text-slate-600">Nenhuma parcela/boletos vinculados.</p>
              ) : (
                <div className="space-y-1 text-sm text-slate-700">
                  {notaDetalhes.parcelas.map((parcela) => (
                    <p key={parcela.id}>
                      {rotuloParcela(parcela.numero_parcela)} · {moeda(parcela.valor)} · {parcela.vencimento ? dataBR(parcela.vencimento) : "—"} · status {parcela.status}
                    </p>
                  ))}
                </div>
              )}
              <p className="text-sm font-semibold text-slate-800">Soma das parcelas: {moeda(notaDetalhes.somaParcelas)}</p>
            </Card>

            {(() => {
              const sugestoes =
                notaDetalhes.nota.tipo === "nfse"
                  ? sugerirVinculosNfseParaPagamentos(db, notaDetalhes.nota)
                  : [];
              if (sugestoes.length === 0) return null;
              return (
                <Card className="space-y-2 border border-primaria/40 bg-primaria-clara/30 py-3">
                  <p className="text-sm font-semibold text-primaria-escura">
                    Pagamentos PIX sem nota que podem ser desta NFS-e
                  </p>
                  {sugestoes.map((s) => (
                    <div
                      key={s.boleto.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-2 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">{fornecedorDoBoleto(db, s.boleto)}</p>
                        <p className="text-slate-600">
                          {moeda(s.boleto.valor)} · {s.motivos.join(", ")}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn-primario text-xs"
                        onClick={() => {
                          mutate((atual) => {
                            const r = vincularNotaAoPagamento(atual, s.boleto.id, notaDetalhes.nota.id);
                            if (r.sucesso) {
                              setMensagemReceberBoleto("NFS-e vinculada ao pagamento PIX.");
                            } else {
                              setErroReceberBoleto(r.erros[0] ?? "Falha ao vincular.");
                            }
                          });
                        }}
                      >
                        Vincular
                      </button>
                    </div>
                  ))}
                </Card>
              );
            })()}

            {notaDetalhes.pendencias.length > 0 && (
              <Card className="space-y-1 border border-destaque bg-destaque-clara py-3">
                <p className="text-sm font-semibold text-destaque">Pendências detectadas</p>
                {notaDetalhes.pendencias.map((pendencia, index) => (
                  <p key={`${pendencia}-${index}`} className="text-sm text-destaque">
                    {pendencia}
                  </p>
                ))}
              </Card>
            )}

            {Array.isArray(notaDetalhes.nota.correcoes_fornecedor) && notaDetalhes.nota.correcoes_fornecedor.length > 0 && (
              <Card className="space-y-1 border border-slate-200 py-3">
                <p className="text-sm font-semibold text-slate-800">Histórico de correções de fornecedor</p>
                {notaDetalhes.nota.correcoes_fornecedor.map((correcao) => (
                  <p key={correcao.id} className="text-xs text-slate-600">
                    {dataBR(correcao.corrigido_em)} · {nomeFornecedor(db, correcao.fornecedor_anterior_id)} para {nomeFornecedor(db, correcao.fornecedor_novo_id)} · {correcao.corrigido_por}
                  </p>
                ))}
              </Card>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secundario" onClick={fecharDetalhesNfe}>
                Fechar
              </button>
              {(statusPagamentoNota(db, notaDetalhes.nota) === "aguardando_pagamento" ||
                statusPagamentoNota(db, notaDetalhes.nota) === "parcialmente_paga") && (
                <button
                  type="button"
                  className="btn-primario"
                  onClick={() => irParaPagamentoDaNota(notaDetalhes.nota.id)}
                >
                  Ir para pagamento
                </button>
              )}
              {statusPagamentoNota(db, notaDetalhes.nota) === "sem_boleto" && (
                <button
                  type="button"
                  className="btn-primario"
                  onClick={() => {
                    fecharDetalhesNfe();
                    setAbaFinanceira("conferencia");
                  }}
                >
                  Ir para conferência
                </button>
              )}
              <button
                type="button"
                className="btn-primario"
                onClick={() => {
                  fecharDetalhesNfe();
                  iniciarCorrecaoNfe(notaDetalhes.nota.id);
                }}
              >
                Completar ou corrigir dados
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal aberto={Boolean(estadoCorrecaoNfe && notaCorrecao)} titulo="Completar ou corrigir dados da NF-e" onFechar={fecharCorrecaoNfe}>
        {estadoCorrecaoNfe && notaCorrecao && (
          <div className="space-y-3">
            <Card className="space-y-2 bg-slate-50 py-3">
              <p className="text-sm font-semibold text-slate-800">Dados fiscais importados (somente leitura)</p>
              <p className="text-sm text-slate-700">Nota: {notaCorrecao.numero || "—"}</p>
              <p className="text-sm text-slate-700">Razão social emitente: {notaCorrecao.razao_social_emitente || "Não disponível na importação original"}</p>
              <p className="text-sm text-slate-700">Chave de acesso: {notaCorrecao.chave_acesso || "—"}</p>
              <p className="text-sm text-slate-700">CNPJ emitente: {cnpjBR(notaCorrecao.cnpj_emitente)}</p>
              <p className="text-sm text-slate-700">Valor total: {moeda(notaCorrecao.valor_total)}</p>
            </Card>

            <label className="block">
              <span className="rotulo mb-1 block">Fornecedor vinculado no ComprasChef</span>
              <select
                className="input w-full"
                value={estadoCorrecaoNfe.fornecedorCorrecaoId}
                onChange={(event) => {
                  setEstadoCorrecaoNfe((atual) =>
                    atual
                      ? {
                          ...atual,
                          fornecedorCorrecaoId: event.target.value,
                        }
                      : atual
                  );
                  setErroCorrecaoNfe(null);
                }}
              >
                <option value="">Selecione</option>
                {db.fornecedores
                  .filter((fornecedor) => fornecedor.ativo)
                  .map((fornecedor) => (
                    <option key={fornecedor.id} value={fornecedor.id}>
                      {fornecedor.nome}
                    </option>
                  ))}
              </select>
            </label>

            <label className="block">
              <span className="rotulo mb-1 block">Justificativa da correção (opcional)</span>
              <textarea
                className="input min-h-20 w-full py-2"
                value={estadoCorrecaoNfe.justificativaCorrecao}
                onChange={(event) =>
                  setEstadoCorrecaoNfe((atual) =>
                    atual
                      ? {
                          ...atual,
                          justificativaCorrecao: event.target.value,
                        }
                      : atual
                  )
                }
              />
            </label>

            <Card className="space-y-2 border border-slate-200 py-3">
              <p className="text-sm font-semibold text-slate-800">Reconferência de boletos</p>
              <p className="text-sm text-slate-600">
                As parcelas/boletos ligados a esta NF-e permanecem preservados. A correção altera apenas o vínculo do fornecedor e registra histórico.
              </p>
              <button type="button" className="btn-secundario" disabled>
                <RefreshCcw size={16} /> Regras de reconferência disponíveis no Recebimento
              </button>
            </Card>

            {erroCorrecaoNfe && <p className="rounded-card bg-erro-clara px-3 py-2 text-sm text-erro">{erroCorrecaoNfe}</p>}
            {mensagemCorrecaoNfe && (
              <p className="rounded-card border border-sucesso bg-sucesso-clara px-3 py-2 text-sm text-primaria-escura">
                {mensagemCorrecaoNfe}
              </p>
            )}

            {Array.isArray(notaCorrecao.correcoes_fornecedor) && notaCorrecao.correcoes_fornecedor.length > 0 && (
              <Card className="space-y-1 border border-slate-200 py-3">
                <p className="text-sm font-semibold text-slate-800">Histórico de correções de fornecedor</p>
                {notaCorrecao.correcoes_fornecedor.map((correcao) => (
                  <p key={correcao.id} className="text-xs text-slate-600">
                    {dataBR(correcao.corrigido_em)} · {nomeFornecedor(db, correcao.fornecedor_anterior_id)} para {nomeFornecedor(db, correcao.fornecedor_novo_id)} · {correcao.corrigido_por}
                  </p>
                ))}
              </Card>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secundario" onClick={fecharCorrecaoNfe}>
                Fechar
              </button>
              <button
                type="button"
                className="btn-primario"
                onClick={salvarCorrecaoFornecedorNfe}
                disabled={salvandoCorrecaoNfe || correcaoSemMudanca || !estadoCorrecaoNfe.fornecedorCorrecaoId}
              >
                {salvandoCorrecaoNfe ? "Salvando..." : "Salvar correção"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal aberto={modalNovaContaAberto} titulo="Nova conta" onFechar={fecharNovaConta} fecharAoClicarFundo={false}>
        <form onSubmit={salvarNovaConta} onKeyDown={impedirEnterAcidental} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="rotulo mb-1 block">Fornecedor</span>
            <select
              className="input w-full"
              value={formConta.fornecedor_id}
              onChange={(event) => alterarCampoConta("fornecedor_id", event.target.value)}
            >
              <option value="">Fornecedor não identificado</option>
              {db.fornecedores.map((fornecedor) => (
                <option key={fornecedor.id} value={fornecedor.id}>
                  {fornecedor.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="rotulo mb-1 block">Descrição *</span>
            <input
              className="input w-full"
              required
              value={formConta.descricao}
              onChange={(event) => alterarCampoConta("descricao", event.target.value)}
            />
          </label>
          <label className="block">
            <span className="rotulo mb-1 block">Categoria *</span>
            <input
              className="input w-full"
              required
              value={formConta.categoria}
              onChange={(event) => alterarCampoConta("categoria", event.target.value)}
            />
          </label>
          <label className="block">
            <span className="rotulo mb-1 block">Centro de custo</span>
            <input
              className="input w-full"
              value={formConta.centro_custo}
              onChange={(event) => alterarCampoConta("centro_custo", event.target.value)}
            />
          </label>
          <label className="block">
            <span className="rotulo mb-1 block">Número do documento</span>
            <input
              className="input w-full"
              value={formConta.documento_id}
              onChange={(event) => alterarCampoConta("documento_id", event.target.value)}
            />
          </label>
          <label className="block">
            <span className="rotulo mb-1 block">Data de emissão</span>
            <input
              type="date"
              className="input w-full"
              value={formConta.data_emissao}
              onChange={(event) => alterarCampoConta("data_emissao", event.target.value)}
            />
          </label>
          <label className="block">
            <span className="rotulo mb-1 block">Data de vencimento *</span>
            <input
              type="date"
              className="input w-full"
              required
              value={formConta.data_vencimento}
              onChange={(event) => alterarCampoConta("data_vencimento", event.target.value)}
            />
          </label>
          <label className="block">
            <span className="rotulo mb-1 block">Valor original *</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input w-full"
              required
              value={formConta.valor_original}
              onChange={(event) => alterarCampoConta("valor_original", event.target.value)}
            />
          </label>
          <label className="block">
            <span className="rotulo mb-1 block">Juros</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input w-full"
              value={formConta.juros}
              onChange={(event) => alterarCampoConta("juros", event.target.value)}
            />
          </label>
          <label className="block">
            <span className="rotulo mb-1 block">Desconto</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input w-full"
              value={formConta.desconto}
              onChange={(event) => alterarCampoConta("desconto", event.target.value)}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="rotulo mb-1 block">Observações</span>
            <textarea
              className="input min-h-24 w-full py-3"
              value={formConta.observacoes}
              onChange={(event) => alterarCampoConta("observacoes", event.target.value)}
            />
          </label>

          <Card className="sm:col-span-2 bg-slate-50 py-3">
            <p className="rotulo">Valor final calculado</p>
            <p className="text-xl font-bold text-slate-900">{valorFinalPreview === undefined ? "Preencha o valor original" : moeda(valorFinalPreview)}</p>
            <p className="text-xs text-slate-500">Status inicial: aguardando boleto · Origem: manual</p>
          </Card>

          {erroFormConta && (
            <p className="sm:col-span-2 rounded-card bg-erro-clara px-3 py-2 text-sm font-medium text-erro">{erroFormConta}</p>
          )}

          <div className="sm:col-span-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secundario" onClick={fecharNovaConta}>
              Cancelar
            </button>
            <button type="submit" className="btn-primario">
              <Plus size={18} /> Salvar conta
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        aberto={Boolean(contaSelecionadaBoleto)}
        titulo="Receber boleto"
        onFechar={fecharReceberBoleto}
        fecharAoClicarFundo={false}
      >
        {contaSelecionadaBoleto && (
          <form onSubmit={salvarReceberBoleto} onKeyDown={impedirEnterAcidental} className="space-y-4">
            <Card className="space-y-2 bg-slate-50 py-3">
              <p className="font-bold text-slate-900">{nomeFornecedorConta(contaSelecionadaBoleto)}</p>
              <p className="text-sm text-slate-700">{contaSelecionadaBoleto.descricao}</p>
              <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                <div>
                  <p className="rotulo">Vencimento</p>
                  <p>{dataBR(contaSelecionadaBoleto.data_vencimento)}</p>
                </div>
                <div>
                  <p className="rotulo">Valor final</p>
                  <p className="font-bold text-slate-900">{moeda(contaSelecionadaBoleto.valor_final)}</p>
                </div>
              </div>
            </Card>

            <label className="block">
              <span className="rotulo mb-1 block">Arquivo do boleto *</span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                className="input w-full py-2"
                onChange={alterarArquivoReceberBoleto}
              />
              <p className="mt-1 text-xs text-slate-500">Aceita PDF, JPG ou PNG com até 10 MB. Apenas metadados serão armazenados.</p>
              {mensagemIdentificacaoBoleto && (
                <p className="mt-2 text-sm font-medium text-slate-700">{mensagemIdentificacaoBoleto}</p>
              )}
              {opcoesIdentificacaoBoleto.length > 1 && (
                <div className="mt-2 space-y-2 rounded-card border border-slate-200 bg-white p-2">
                  {opcoesIdentificacaoBoleto.map((opcao, indice) => (
                    <button
                      key={`${opcao.valorNormalizado}-${indice}`}
                      type="button"
                      className="btn-secundario w-full justify-between"
                      onClick={() => aplicarIdentificacaoUnica(opcao)}
                      disabled={identificandoCodigoBoleto}
                    >
                      <span>{resumirCodigoParaEscolha(opcao.valorNormalizado)}</span>
                      <span className="text-xs text-slate-500">{opcao.formato}</span>
                    </button>
                  ))}
                </div>
              )}
              {diagnosticoIdentificacao && (
                <div className="mt-2 rounded-card border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <p>PDF aberto: {diagnosticoIdentificacao.pdfAberto ? "sim" : "não"}</p>
                  <p>Páginas processadas: {diagnosticoIdentificacao.paginasProcessadas}</p>
                  <p>Texto encontrado: {diagnosticoIdentificacao.textoEncontrado ? "sim" : "não"}</p>
                  <p>Candidatos numéricos encontrados: {diagnosticoIdentificacao.candidatosNumericosEncontrados}</p>
                  <p>BarcodeDetector disponível: {diagnosticoIdentificacao.barcodeDetectorDisponivel ? "sim" : "não"}</p>
                  <p>BarcodeDetector executado: {diagnosticoIdentificacao.barcodeDetectorExecutado ? "sim" : "não"}</p>
                  <p>ZXing executado: {diagnosticoIdentificacao.zxingExecutado ? "sim" : "não"}</p>
                  <p>Resultado válido encontrado: {diagnosticoIdentificacao.resultadoValidoEncontrado ? "sim" : "não"}</p>
                  <p>Falha técnica: {diagnosticoIdentificacao.falhaTecnica ?? "nenhuma"}</p>
                </div>
              )}
            </label>

            <label className="block">
              <span className="rotulo mb-1 flex items-center gap-1">
                <ScanLine size={14} /> Linha digitável ou código de barras *
              </span>
              <input
                ref={inputLinhaRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className="input w-full"
                placeholder="44, 47 ou 48 dígitos"
                value={formReceberBoleto.linha}
                onChange={(event) => alterarLinhaReceberBoleto(event.target.value)}
              />
              <div className="mt-2 space-y-1 text-xs text-slate-500">
                <p>Formato identificado: {formatoBoletoPreview ? formatoBoletoPreview : "aguardando leitura"}</p>
                <p>Valor validado: {linhaNormalizadaPreview ?? "—"}</p>
                {identificandoCodigoBoleto && <p>Identificando código do boleto...</p>}
              </div>
            </label>

            <div className="rounded-card border border-destaque bg-destaque-clara px-3 py-3 text-sm text-destaque">
              Esta validação confere o formato e os dígitos verificadores. Antes de pagar, confirme no banco o nome e o CNPJ do beneficiário.
            </div>

            {erroReceberBoleto && (
              <div className="rounded-card border border-erro bg-erro-clara px-3 py-3 text-sm font-medium text-erro">
                {erroReceberBoleto}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secundario" onClick={fecharReceberBoleto} disabled={processandoRecebimentoBoleto}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario" disabled={processandoRecebimentoBoleto || !formReceberBoleto.arquivo}>
                <Upload size={16} /> {processandoRecebimentoBoleto ? "Recebendo..." : "Receber boleto"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {codigoAmpliado && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-3 py-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setCodigoAmpliado(fecharCodigoAmpliado());
            }
          }}
          role="presentation"
        >
          <div className="w-[92vw] max-w-[1320px] rounded-card border border-slate-300 bg-white p-4 shadow-lg sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-base font-bold text-slate-900">{codigoAmpliado.fornecedor}</p>
                <p className="text-sm text-slate-700">Valor {moeda(codigoAmpliado.valor)} · Vencimento {dataBR(codigoAmpliado.vencimento)}</p>
              </div>
              <button
                type="button"
                className="btn-secundario"
                onClick={() => setCodigoAmpliado(fecharCodigoAmpliado())}
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 flex w-full justify-center overflow-hidden rounded-card border border-slate-200 bg-white px-6 py-4">
              {configuracaoCodigoAmpliado ? (
                <svg
                  aria-label="Codigo de barras ampliado"
                  role="img"
                  viewBox={configuracaoCodigoAmpliado.viewBox}
                  className="h-[160px] w-full max-w-[1400px]"
                  preserveAspectRatio="xMidYMid meet"
                  shapeRendering="crispEdges"
                >
                  <rect x={0} y={0} width="100%" height="100%" fill="white" />
                  {configuracaoCodigoAmpliado.retangulos.map((barra, indice) => (
                    <rect
                      key={`barra-ampliada-${indice}`}
                      x={barra.x}
                      y={0}
                      width={barra.largura}
                      height={configuracaoCodigoAmpliado.altura}
                      fill="black"
                    />
                  ))}
                </svg>
              ) : (
                <p className="text-sm text-slate-600">Codigo indisponivel para renderizacao.</p>
              )}
            </div>

            <p className="mt-3 text-sm text-slate-700">Linha: {mascararLinhaDigitavel(codigoAmpliado.codigoCanonico, true)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
