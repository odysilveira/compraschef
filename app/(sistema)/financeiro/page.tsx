"use client";

// Financeiro — agenda de boletos (requisitos 27–30).
// Protegida: líder/caixa não veem nada daqui (podeVerValores).

import { Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Ban,
  Barcode,
  CalendarDays,
  CircleCheck,
  CircleCheckBig,
  Clock3,
  Copy,
  Download,
  Lock,
  Phone,
  Plus,
  ReceiptText,
  Search,
  ScanLine,
  ShieldAlert,
  Eye,
  EyeOff,
  RefreshCcw,
  TriangleAlert,
  Upload,
  Users,
} from "lucide-react";
import { Badge, Card, Modal, Tabela, TituloPagina, Vazio } from "@/components/ui";
import { calcularValorFinal, criarContaManual, mutate, nomeFornecedor, uid, useDB } from "@/lib/data";
import { identificarFormatoBoleto, normalizarLinhaBoleto } from "@/lib/domain/boletos";
import { calcularHashSHA256, receberBoletoContaPagar, validarArquivoDocumentoBoleto } from "@/lib/domain/documentos-boleto";
import {
  filtrarContasPagar,
  resumirContasPagar,
  exportarContasPagarCsv,
  hrefFinanceiro,
  parseAbaFinanceiro,
  parseFilaAgendaFinanceiro,
  parseFiltroStatusConta,
  parseFiltroVencimentoConta,
  type AbaFinanceiro,
  type FilaAgendaFinanceiro,
  type FiltroVencimentoConta,
} from "@/lib/domain/financeiro";
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
import { corrigirFornecedorNotaFiscal } from "@/lib/domain/nfe-completude";
import {
  abrirModalCorrecaoNfe,
  detalharNotaFiscalFinanceiro,
  exportarNotasFiscaisFinanceiroCsv,
  listarNotasFiscaisFinanceiro,
  type EstadoModalCorrecaoNfe,
  type IndicadorCompletudeFinanceiro,
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
  conciliarBoletosAguardando,
  criarSnapshotPagamentoBoleto,
  gerarPadraoInterleaved2of5,
  informarPagamentoBoleto,
  informarPagamentosBoletosLiberados,
  linhaDigitavelParaPagamento,
  montarEstadoAgendaPagamentoBoleto,
  montarTextosLinhasDigitaveisBoletosLote,
  exportarAgendaFinanceiraCsv,
  registrarDivergenciaBoleto,
  type SegmentoCodigoBarrasItf,
  type SnapshotPagamentoBoleto,
} from "@/lib/domain/pagar-boleto";
import {
  conciliarPagamentoPessoa,
  conciliarPagamentosAguardando,
  registrarDivergenciaPagamentoPessoa,
  rotuloTipoPagamentoPessoa,
} from "@/lib/domain/pagamentos-pessoas";
import { filtroPagamentosRhDeStatus, hrefPagamentosRh } from "@/lib/domain/resumo-rh";
import { hrefPerfilRh } from "@/lib/domain/rh";
import {
  montarTextoConfirmacaoRecebimento,
  montarTextoReciboPagamentoPessoa,
  montarTextosWhatsAppRecibosPagamentoLote,
  linkWhatsAppReciboPagamento,
} from "@/lib/domain/recibo-pagamento-pessoa";
import { parseOfx } from "@/lib/domain/extrato-ofx";
import {
  aplicarMatchesExtrato,
  sugerirMatchesExtrato,
  type SugestaoMatchExtrato,
} from "@/lib/domain/conciliar-extrato";
import { SeletorContaOrigem } from "@/components/financeiro/SeletorContaOrigem";
import { contaPadraoOrigem } from "@/lib/domain/contas-pagamento";
import {
  CLASSE_CAIXA_CODIGO_SEM_ROLAGEM,
  CLASSE_GRID_CODIGO_PAGAMENTO,
  acoesUnicasQuandoCodigoAberto,
  fecharCodigoAmpliado,
  montarConfiguracaoSvgCodigo,
  type EstadoCodigoAmpliado,
} from "@/lib/domain/codigo-pagamento-ui";
import { podeVerValores, usePapel } from "@/lib/roles";
import { cnpjBR, dataBR, diasAte, moeda } from "@/lib/format";
import type {
  Boleto,
  ContaPagar,
  DB,
  OrigemContaPagar,
  PagamentoPessoa,
  StatusBoleto,
  StatusContaPagar,
} from "@/lib/types";

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

type FormConciliarBoletoState = {
  dataLiquidacao: string;
  responsavel: string;
  observacao: string;
};

type FormDivergenciaBoletoState = {
  motivo: string;
  responsavel: string;
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
  { valor: "aguardando_conciliacao", rotulo: "Aguardando conciliação" },
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

function novaConciliacaoBoletoInicial(boleto?: Boleto): FormConciliarBoletoState {
  return {
    dataLiquidacao: boleto?.pagamento_data || hojeISO(),
    responsavel: boleto?.pagamento_responsavel || "usuário local",
    observacao: "",
  };
}

function novaDivergenciaBoletoInicial(): FormDivergenciaBoletoState {
  return {
    motivo: "",
    responsavel: "usuário local",
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
    aguardando_conciliacao: "Aguardando conciliação",
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
          <Clock3 size={14} /> aguardando conciliação
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
  const nota = db.notas_fiscais.find((n) => n.id === boleto.nota_id);
  return nomeFornecedor(db, nota?.fornecedor_id);
}

function notaDoBoleto(db: DB, boleto: Boleto) {
  return db.notas_fiscais.find((n) => n.id === boleto.nota_id);
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
          <Clock3 size={14} /> aguardando conciliação
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

function FinanceiroConteudo() {
  const db = useDB();
  const { papel } = usePapel();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [confirmandoLiberacao, setConfirmandoLiberacao] = useState<string | null>(null);
  const [abaFinanceira, setAbaFinanceira] = useState<AbaFinanceiro>(() =>
    parseAbaFinanceiro(searchParams.get("aba"))
  );
  const [modalNovaContaAberto, setModalNovaContaAberto] = useState(false);
  const [buscaConta, setBuscaConta] = useState("");
  const [filtroStatusConta, setFiltroStatusConta] = useState<StatusContaPagar | "todos">(() =>
    parseFiltroStatusConta(searchParams.get("status"))
  );
  const [filtroVencimentoConta, setFiltroVencimentoConta] = useState<FiltroVencimentoConta>(() =>
    parseFiltroVencimentoConta(searchParams.get("vencimento"))
  );
  const [buscaNfe, setBuscaNfe] = useState("");
  const [filtroCompletudeNfe, setFiltroCompletudeNfe] = useState<"todas" | IndicadorCompletudeFinanceiro>("todas");
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
  const [informarBoletosLoteAberto, setInformarBoletosLoteAberto] = useState(false);
  const [boletoConciliarId, setBoletoConciliarId] = useState<string | null>(null);
  const [formConciliarBoleto, setFormConciliarBoleto] = useState<FormConciliarBoletoState>(novaConciliacaoBoletoInicial());
  const [erroConciliarBoleto, setErroConciliarBoleto] = useState<string | null>(null);
  const [processandoConciliarBoleto, setProcessandoConciliarBoleto] = useState(false);
  const [boletoDivergenciaId, setBoletoDivergenciaId] = useState<string | null>(null);
  const [formDivergenciaBoleto, setFormDivergenciaBoleto] = useState<FormDivergenciaBoletoState>(novaDivergenciaBoletoInicial());
  const [erroDivergenciaBoleto, setErroDivergenciaBoleto] = useState<string | null>(null);
  const [modalExtratoOfxAberto, setModalExtratoOfxAberto] = useState(false);
  const [sugestoesExtrato, setSugestoesExtrato] = useState<SugestaoMatchExtrato[]>([]);
  const [selecionadosExtrato, setSelecionadosExtrato] = useState<Record<string, boolean>>({});
  const [erroExtratoOfx, setErroExtratoOfx] = useState<string | null>(null);
  const [processandoExtratoOfx, setProcessandoExtratoOfx] = useState(false);
  const [processandoDivergenciaBoleto, setProcessandoDivergenciaBoleto] = useState(false);
  const [rhConciliarId, setRhConciliarId] = useState<string | null>(null);
  const [formConciliarRh, setFormConciliarRh] = useState<FormConciliarBoletoState>(novaConciliacaoBoletoInicial());
  const [erroConciliarRh, setErroConciliarRh] = useState<string | null>(null);
  const [processandoConciliarRh, setProcessandoConciliarRh] = useState(false);
  const [rhDivergenciaId, setRhDivergenciaId] = useState<string | null>(null);
  const [formDivergenciaRh, setFormDivergenciaRh] = useState<FormDivergenciaBoletoState>(novaDivergenciaBoletoInicial());
  const [erroDivergenciaRh, setErroDivergenciaRh] = useState<string | null>(null);
  const [processandoDivergenciaRh, setProcessandoDivergenciaRh] = useState(false);
  const inputLinhaRef = useRef<HTMLInputElement | null>(null);
  const execucaoIdentificacaoRef = useRef(0);
  const contaSelecionadaBoletoIdRef = useRef<string | null>(null);
  const salvandoCorrecaoNfeRef = useRef(false);
  const processandoPagamentoBoletoRef = useRef(false);
  const processandoConciliarBoletoRef = useRef(false);
  const processandoDivergenciaBoletoRef = useRef(false);
  const processandoConciliarRhRef = useRef(false);
  const processandoDivergenciaRhRef = useRef(false);

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
      bancoConta: contaPadraoOrigem(db),
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

  function abrirInformarBoletosLote() {
    const liberados = db.boletos.filter(
      (b) =>
        !golpeConfirmado(b) &&
        b.status === "liberado" &&
        avaliarElegibilidadePagamentoBoleto(b).permitido
    );
    if (liberados.length === 0) {
      setMensagemReceberBoleto("Nenhum boleto liberado apto para informar pagamento.");
      return;
    }
    setBoletoPagamentoId(null);
    setSnapshotPagamento(null);
    setInformarBoletosLoteAberto(true);
    setFormPagamentoBoleto({
      ...novoPagamentoBoletoInicial(),
      bancoConta: contaPadraoOrigem(db),
      confirmouAviso: false,
    });
    setErroPagamentoBoleto(null);
    setMensagemPagamentoBoleto(null);
  }

  function fecharInformarBoletosLote() {
    if (processandoPagamentoBoleto) return;
    setInformarBoletosLoteAberto(false);
    setFormPagamentoBoleto(novoPagamentoBoletoInicial());
    setErroPagamentoBoleto(null);
    setMensagemPagamentoBoleto(null);
  }

  function confirmarInformarBoletosLote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (processandoPagamentoBoletoRef.current) return;
    const ids = db.boletos
      .filter(
        (b) =>
          !golpeConfirmado(b) &&
          b.status === "liberado" &&
          avaliarElegibilidadePagamentoBoleto(b).permitido
      )
      .map((b) => b.id);
    if (ids.length === 0) {
      setErroPagamentoBoleto("Nenhum boleto liberado apto neste momento.");
      return;
    }
    if (!formPagamentoBoleto.confirmouAviso) {
      setErroPagamentoBoleto("Confirme o aviso de responsabilidade antes de continuar.");
      return;
    }
    processandoPagamentoBoletoRef.current = true;
    setProcessandoPagamentoBoleto(true);
    setErroPagamentoBoleto(null);
    try {
      const proximo = structuredClone(db) as DB;
      const r = informarPagamentosBoletosLiberados(
        proximo,
        ids,
        {
          dataPagamento: formPagamentoBoleto.dataPagamento,
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
      mutate((atual) => {
        Object.assign(atual, proximo);
      });
      setInformarBoletosLoteAberto(false);
      setFormPagamentoBoleto(novoPagamentoBoletoInicial());
      if (r.informados > 0) {
        setMensagemReceberBoleto(
          `${r.informados} boleto(s) informado(s). Aguardando conciliação bancária.`
        );
      }
      if (r.erros.length) {
        setMensagemReceberBoleto(
          (r.informados > 0 ? `${r.informados} informado(s). ` : "") + r.erros.join(" ")
        );
      }
    } finally {
      processandoPagamentoBoletoRef.current = false;
      setProcessandoPagamentoBoleto(false);
    }
  }

  function abrirConciliarBoleto(boleto: Boleto) {
    if (boleto.status !== "aguardando_conciliacao") {
      setMensagemReceberBoleto("Só é possível conciliar boletos aguardando conciliação.");
      return;
    }
    setBoletoConciliarId(boleto.id);
    setFormConciliarBoleto(novaConciliacaoBoletoInicial(boleto));
    setErroConciliarBoleto(null);
  }

  function fecharConciliarBoleto() {
    if (processandoConciliarBoleto) return;
    setBoletoConciliarId(null);
    setFormConciliarBoleto(novaConciliacaoBoletoInicial());
    setErroConciliarBoleto(null);
  }

  function abrirDivergenciaBoleto(boleto: Boleto) {
    if (boleto.status !== "aguardando_conciliacao") {
      setMensagemReceberBoleto("Só é possível registrar divergência em boletos aguardando conciliação.");
      return;
    }
    setBoletoDivergenciaId(boleto.id);
    setFormDivergenciaBoleto(novaDivergenciaBoletoInicial());
    setErroDivergenciaBoleto(null);
  }

  function fecharDivergenciaBoleto() {
    if (processandoDivergenciaBoleto) return;
    setBoletoDivergenciaId(null);
    setFormDivergenciaBoleto(novaDivergenciaBoletoInicial());
    setErroDivergenciaBoleto(null);
  }

  function abrirImportarExtratoOfx() {
    setModalExtratoOfxAberto(true);
    setSugestoesExtrato([]);
    setSelecionadosExtrato({});
    setErroExtratoOfx(null);
  }

  function fecharImportarExtratoOfx() {
    if (processandoExtratoOfx) return;
    setModalExtratoOfxAberto(false);
    setSugestoesExtrato([]);
    setSelecionadosExtrato({});
    setErroExtratoOfx(null);
  }

  async function aoEscolherArquivoOfx(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = "";
    if (!arquivo) return;
    setErroExtratoOfx(null);
    try {
      const texto = await arquivo.text();
      const parseado = parseOfx(texto);
      if (!parseado.ok) {
        setErroExtratoOfx(parseado.erro);
        setSugestoesExtrato([]);
        return;
      }
      const sugestoes = sugerirMatchesExtrato(db, parseado.linhas);
      setSugestoesExtrato(sugestoes);
      const sel: Record<string, boolean> = {};
      for (const s of sugestoes) {
        if (s.alvo_id && (s.confianca === "exata" || s.confianca === "proxima")) {
          sel[`${s.linha.fitid ?? s.linha.data}-${s.linha.valor}-${s.alvo}-${s.alvo_id}`] = s.confianca === "exata";
        }
      }
      setSelecionadosExtrato(sel);
      if (!sugestoes.some((s) => s.alvo_id)) {
        setErroExtratoOfx("Extrato lido, mas nenhum débito casou com boleto ou pagamento RH aguardando conciliação.");
      }
    } catch {
      setErroExtratoOfx("Não foi possível ler o arquivo.");
    }
  }

  function confirmarExtratoOfx() {
    if (processandoExtratoOfx) return;
    const matches = sugestoesExtrato
      .filter((s) => {
        if (!s.alvo || !s.alvo_id) return false;
        const chave = `${s.linha.fitid ?? s.linha.data}-${s.linha.valor}-${s.alvo}-${s.alvo_id}`;
        return selecionadosExtrato[chave];
      })
      .map((s) => ({
        alvo: s.alvo!,
        alvo_id: s.alvo_id!,
        dataLiquidacao: s.linha.data,
        observacao: `OFX: ${s.linha.descricao}`.slice(0, 200),
      }));
    if (matches.length === 0) {
      setErroExtratoOfx("Selecione ao menos um match para conciliar.");
      return;
    }
    setProcessandoExtratoOfx(true);
    setErroExtratoOfx(null);
    try {
      const proximo = structuredClone(db) as DB;
      const resultado = aplicarMatchesExtrato(proximo, matches, {
        responsavel: "usuário local",
        idFactory: () => uid("bph"),
      });
      if (resultado.conciliados === 0) {
        setErroExtratoOfx(resultado.erros.join(" ") || "Nenhum título foi conciliado.");
        return;
      }
      mutate((atual) => {
        Object.assign(atual, proximo);
      });
      setModalExtratoOfxAberto(false);
      setSugestoesExtrato([]);
      setSelecionadosExtrato({});
      setMensagemReceberBoleto(
        `${resultado.conciliados} título(s) conciliado(s) pelo extrato OFX (boletos e/ou RH).` +
          (resultado.erros.length ? ` Alguns falharam: ${resultado.erros[0]}` : "")
      );
    } finally {
      setProcessandoExtratoOfx(false);
    }
  }

  function confirmarConciliarBoleto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (processandoConciliarBoletoRef.current || !boletoConciliarId) return;
    processandoConciliarBoletoRef.current = true;
    setProcessandoConciliarBoleto(true);
    setErroConciliarBoleto(null);

    try {
      const proximo = structuredClone(db) as DB;
      const resultado = conciliarBoleto(
        proximo,
        boletoConciliarId,
        {
          dataLiquidacao: formConciliarBoleto.dataLiquidacao,
          responsavel: formConciliarBoleto.responsavel,
          observacao: formConciliarBoleto.observacao,
        },
        {
          responsavelPadrao: "usuário local",
          gerarIdHistorico: () => uid("bph"),
        }
      );

      if (!resultado.sucesso) {
        setErroConciliarBoleto(resultado.erros.join(" "));
        return;
      }

      mutate((atual) => {
        Object.assign(atual, proximo);
      });

      setBoletoConciliarId(null);
      setFormConciliarBoleto(novaConciliacaoBoletoInicial());
      setMensagemReceberBoleto("Boleto conciliado e marcado como pago.");
    } finally {
      processandoConciliarBoletoRef.current = false;
      setProcessandoConciliarBoleto(false);
    }
  }

  function conciliarTodosBoletosAguardando() {
    const ids = boletosAguardandoConciliacao.map((b) => b.id);
    if (ids.length === 0) {
      setMensagemReceberBoleto("Nenhum boleto aguardando conciliação.");
      return;
    }
    const proximo = structuredClone(db) as DB;
    const r = conciliarBoletosAguardando(
      proximo,
      ids,
      { dataLiquidacao: hojeISO(), responsavel: "usuário local" },
      { gerarIdHistorico: () => uid("bph") }
    );
    mutate((atual) => {
      Object.assign(atual, proximo);
    });
    if (r.conciliados > 0) {
      setMensagemReceberBoleto(
        `${r.conciliados} boleto(s) conciliado(s) e marcado(s) como pago.`
      );
    }
    if (r.erros.length) {
      setMensagemReceberBoleto(
        (r.conciliados > 0 ? `${r.conciliados} conciliado(s). ` : "") + r.erros.join(" ")
      );
    }
  }

  function conciliarTodosPagamentosRhAguardando() {
    const ids = rhAguardandoConciliacao.map((p) => p.id);
    if (ids.length === 0) {
      setMensagemReceberBoleto("Nenhum pagamento de RH aguardando conciliação.");
      return;
    }
    const proximo = structuredClone(db) as DB;
    const r = conciliarPagamentosAguardando(proximo, ids, {
      dataLiquidacao: hojeISO(),
      responsavel: "usuário local",
    });
    mutate((atual) => {
      Object.assign(atual, proximo);
    });
    if (r.conciliados > 0) {
      setMensagemReceberBoleto(
        `${r.conciliados} pagamento(s) de RH conciliado(s) e marcado(s) como pago.`
      );
    }
    if (r.erros.length) {
      setMensagemReceberBoleto(
        (r.conciliados > 0 ? `${r.conciliados} conciliado(s). ` : "") + r.erros.join(" ")
      );
    }
  }

  function confirmarDivergenciaBoleto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (processandoDivergenciaBoletoRef.current || !boletoDivergenciaId) return;
    processandoDivergenciaBoletoRef.current = true;
    setProcessandoDivergenciaBoleto(true);
    setErroDivergenciaBoleto(null);

    try {
      const proximo = structuredClone(db) as DB;
      const resultado = registrarDivergenciaBoleto(
        proximo,
        boletoDivergenciaId,
        {
          motivo: formDivergenciaBoleto.motivo,
          responsavel: formDivergenciaBoleto.responsavel,
        },
        {
          responsavelPadrao: "usuário local",
          gerarIdHistorico: () => uid("bph"),
        }
      );

      if (!resultado.sucesso) {
        setErroDivergenciaBoleto(resultado.erros.join(" "));
        return;
      }

      mutate((atual) => {
        Object.assign(atual, proximo);
      });

      setBoletoDivergenciaId(null);
      setFormDivergenciaBoleto(novaDivergenciaBoletoInicial());
      setMensagemReceberBoleto("Divergência registrada. O boleto segue aguardando conciliação.");
    } finally {
      processandoDivergenciaBoletoRef.current = false;
      setProcessandoDivergenciaBoleto(false);
    }
  }

  function abrirConciliarRh(pagamento: PagamentoPessoa) {
    if (pagamento.status !== "aguardando_conciliacao") return;
    setRhConciliarId(pagamento.id);
    setFormConciliarRh({
      dataLiquidacao: (pagamento.pagamento_data || hojeISO()).slice(0, 10),
      responsavel: pagamento.pagamento_responsavel || "usuário local",
      observacao: "",
    });
    setErroConciliarRh(null);
  }

  function fecharConciliarRh() {
    if (processandoConciliarRh) return;
    setRhConciliarId(null);
    setFormConciliarRh(novaConciliacaoBoletoInicial());
    setErroConciliarRh(null);
  }

  function confirmarConciliarRh(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (processandoConciliarRhRef.current || !rhConciliarId) return;
    processandoConciliarRhRef.current = true;
    setProcessandoConciliarRh(true);
    setErroConciliarRh(null);
    try {
      const proximo = structuredClone(db) as DB;
      const resultado = conciliarPagamentoPessoa(
        proximo,
        rhConciliarId,
        {
          dataLiquidacao: formConciliarRh.dataLiquidacao,
          responsavel: formConciliarRh.responsavel,
          observacao: formConciliarRh.observacao,
        },
        { responsavelPadrao: "usuário local" }
      );
      if (!resultado.sucesso) {
        setErroConciliarRh(resultado.erros.join(" "));
        return;
      }
      mutate((atual) => Object.assign(atual, proximo));
      setRhConciliarId(null);
      setFormConciliarRh(novaConciliacaoBoletoInicial());
      setMensagemReceberBoleto("Pagamento de RH conciliado e marcado como pago.");
    } finally {
      processandoConciliarRhRef.current = false;
      setProcessandoConciliarRh(false);
    }
  }

  function abrirDivergenciaRh(pagamento: PagamentoPessoa) {
    if (pagamento.status !== "aguardando_conciliacao") return;
    setRhDivergenciaId(pagamento.id);
    setFormDivergenciaRh(novaDivergenciaBoletoInicial());
    setErroDivergenciaRh(null);
  }

  function fecharDivergenciaRh() {
    if (processandoDivergenciaRh) return;
    setRhDivergenciaId(null);
    setFormDivergenciaRh(novaDivergenciaBoletoInicial());
    setErroDivergenciaRh(null);
  }

  function confirmarDivergenciaRh(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (processandoDivergenciaRhRef.current || !rhDivergenciaId) return;
    processandoDivergenciaRhRef.current = true;
    setProcessandoDivergenciaRh(true);
    setErroDivergenciaRh(null);
    try {
      const proximo = structuredClone(db) as DB;
      const resultado = registrarDivergenciaPagamentoPessoa(
        proximo,
        rhDivergenciaId,
        {
          motivo: formDivergenciaRh.motivo,
          responsavel: formDivergenciaRh.responsavel,
        },
        { responsavelPadrao: "usuário local" }
      );
      if (!resultado.sucesso) {
        setErroDivergenciaRh(resultado.erros.join(" "));
        return;
      }
      mutate((atual) => Object.assign(atual, proximo));
      setRhDivergenciaId(null);
      setFormDivergenciaRh(novaDivergenciaBoletoInicial());
      setMensagemReceberBoleto("Divergência de RH registrada. Segue aguardando conciliação.");
    } finally {
      processandoDivergenciaRhRef.current = false;
      setProcessandoDivergenciaRh(false);
    }
  }

  function nomePessoaRh(pessoaId: string): string {
    return db.pessoas.find((p) => p.id === pessoaId)?.nome ?? "Pessoa";
  }

  async function copiarReciboRh(
    pagamento: PagamentoPessoa,
    variante: "recibo" | "confirmacao" = "recibo"
  ) {
    const pessoa = db.pessoas.find((p) => p.id === pagamento.pessoa_id);
    if (!pessoa) {
      setMensagemReceberBoleto("Pessoa do pagamento RH não encontrada.");
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
      setMensagemReceberBoleto(
        variante === "confirmacao"
          ? "Confirmação RH copiada — envie para a pessoa responder no WhatsApp."
          : "Recibo RH copiado — pode colar no WhatsApp ou arquivar."
      );
    } catch {
      setMensagemReceberBoleto("Não foi possível copiar o recibo RH neste navegador.");
    }
  }

  function abrirWhatsAppReciboRh(
    pagamento: PagamentoPessoa,
    variante: "recibo" | "confirmacao" = "recibo"
  ) {
    const pessoa = db.pessoas.find((p) => p.id === pagamento.pessoa_id);
    if (!pessoa) {
      setMensagemReceberBoleto("Pessoa do pagamento RH não encontrada.");
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
    const url = linkWhatsAppReciboPagamento(pessoa.telefone, texto);
    if (!url) {
      setMensagemReceberBoleto("Cadastre o telefone da pessoa no perfil para abrir o WhatsApp.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setMensagemReceberBoleto(
      variante === "confirmacao"
        ? "WhatsApp aberto com a confirmação RH."
        : "WhatsApp aberto com o recibo RH."
    );
  }

  async function copiarRecibosRhDoLote(
    alvo: PagamentoPessoa[],
    variante: "recibo" | "confirmacao" = "recibo"
  ) {
    if (alvo.length === 0) {
      setMensagemReceberBoleto("Nenhum pagamento RH nesta fila para copiar.");
      return;
    }
    const texto = montarTextosWhatsAppRecibosPagamentoLote(alvo, {
      pessoaPorId: (id) => db.pessoas.find((p) => p.id === id),
      consumos: db.consumos_pessoas ?? [],
      variante,
    });
    if (!texto) {
      setMensagemReceberBoleto("Nenhum texto de recibo RH para copiar nesta fila.");
      return;
    }
    try {
      await navigator.clipboard.writeText(texto);
      setMensagemReceberBoleto(
        variante === "confirmacao"
          ? `${alvo.length} confirmação(ões) RH copiada(s). Cole no WhatsApp de cada pessoa.`
          : `${alvo.length} recibo(s) RH copiado(s). Cole no WhatsApp de cada pessoa.`
      );
    } catch {
      setMensagemReceberBoleto("Não foi possível copiar o lote de recibos RH neste navegador.");
    }
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

  async function copiarLinhasDigitaveisDoLote() {
    const itens = boletosLiberadosElegiveis.map((boleto) => {
      const documento = boleto.documento_boleto_id
        ? db.documentos_boleto.find((d) => d.id === boleto.documento_boleto_id)
        : undefined;
      const nota = notaDoBoleto(db, boleto);
      return {
        boleto,
        documento,
        fornecedor: fornecedorDoBoleto(db, boleto),
        numeroNota: nota?.numero,
      };
    });
    const texto = montarTextosLinhasDigitaveisBoletosLote(itens);
    if (!texto) {
      setMensagemReceberBoleto("Nenhuma linha digitável disponível nos liberados aptos.");
      return;
    }
    try {
      await navigator.clipboard.writeText(texto);
      const qtd = itens.filter((item) =>
        Boolean(linhaDigitavelParaPagamento(item.boleto, item.documento))
      ).length;
      setMensagemReceberBoleto(
        `${qtd} linha(s) copiada(s) com cabeçalho. Cole no banco; o status não muda.`
      );
    } catch {
      setMensagemReceberBoleto("Não foi possível copiar as linhas digitáveis neste navegador.");
    }
  }

  function baixarAgendaBoletosCsv() {
    const pagamentosRhAgenda = [...rhAguardandoConciliacao, ...rhPagos];
    const total = boletosAtivos.length + pagamentosRhAgenda.length;
    if (total === 0) {
      setMensagemReceberBoleto("Nenhum título na agenda para exportar.");
      return;
    }
    const csv = exportarAgendaFinanceiraCsv(
      {
        boletos: boletosAtivos,
        pagamentosRh: pagamentosRhAgenda,
      },
      {
        fornecedorDoBoleto: (boleto) => fornecedorDoBoleto(db, boleto),
        numeroNotaDoBoleto: (boleto) => notaDoBoleto(db, boleto)?.numero ?? "",
        nomePessoaRh: (pessoaId) => nomePessoaRh(pessoaId),
      }
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "financeiro-agenda.csv";
    a.click();
    URL.revokeObjectURL(url);
    setMensagemReceberBoleto(
      `CSV baixado (${boletosAtivos.length} boleto(s) + ${pagamentosRhAgenda.length} RH).`
    );
  }

  function baixarContasPagarCsv() {
    if (contasFiltradas.length === 0) {
      setMensagemReceberBoleto("Nenhuma conta no filtro atual para exportar.");
      return;
    }
    const csv = exportarContasPagarCsv(contasFiltradas, {
      fornecedorDaConta: (conta) =>
        conta.fornecedor_id ? nomeFornecedor(db, conta.fornecedor_id) : "Sem fornecedor",
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "financeiro-contas-a-pagar.csv";
    a.click();
    URL.revokeObjectURL(url);
    setMensagemReceberBoleto(`CSV baixado (${contasFiltradas.length} conta(s)).`);
  }

  function baixarNotasFiscaisCsv() {
    if (notasFiscaisFinanceiro.length === 0) {
      setMensagemReceberBoleto("Nenhuma nota no filtro atual para exportar.");
      return;
    }
    const csv = exportarNotasFiscaisFinanceiroCsv(notasFiscaisFinanceiro);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "financeiro-notas-fiscais.csv";
    a.click();
    URL.revokeObjectURL(url);
    setMensagemReceberBoleto(`CSV baixado (${notasFiscaisFinanceiro.length} nota(s)).`);
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
      const proximo = structuredClone(db) as DB;
      const resultado = informarPagamentoBoleto(
        proximo,
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
        setErroPagamentoBoleto(resultado.erros.join(" "));
        return;
      }

      mutate((atual) => {
        Object.assign(atual, proximo);
      });

      setMensagemReceberBoleto("Pagamento informado. O boleto agora aguarda conciliação bancária.");
      setBoletoPagamentoId(null);
      setSnapshotPagamento(null);
      setFormPagamentoBoleto(novoPagamentoBoletoInicial());
      setErroPagamentoBoleto(null);
      setMensagemPagamentoBoleto(null);
    } finally {
      processandoPagamentoBoletoRef.current = false;
      setProcessandoPagamentoBoleto(false);
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
      }),
    [db, buscaNfe, filtroCompletudeNfe]
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
  const boletosLiberadosElegiveis = boletosAtivos.filter(
    (boleto) =>
      boleto.status === "liberado" && avaliarElegibilidadePagamentoBoleto(boleto).permitido
  );
  const boletosAguardandoConciliacao = boletosAtivos.filter((boleto) => boleto.status === "aguardando_conciliacao");
  const boletosPagos = boletosAtivos.filter((boleto) => boleto.status === "pago");
  const boletosPendentesAgenda = boletosAtivos.filter(
    (boleto) => boleto.status !== "aguardando_conciliacao" && boleto.status !== "pago"
  );
  const rhAguardandoConciliacao = (db.pagamentos_pessoas ?? []).filter((p) => p.status === "aguardando_conciliacao");
  const rhPagos = (db.pagamentos_pessoas ?? []).filter((p) => p.status === "pago");

  const boletosAtrasados = boletosPendentesAgenda.filter((boleto) => (diasAte(boleto.vencimento) ?? 0) < 0);
  const boletosVencendoHoje = boletosPendentesAgenda.filter((boleto) => (diasAte(boleto.vencimento) ?? 0) === 0);
  const boletosAVencer = boletosPendentesAgenda.filter((boleto) => (diasAte(boleto.vencimento) ?? 0) > 0);

  // Totais por status (boletos + RH na fila de conciliação / pagos)
  const totais: Record<StatusBoleto, number> = {
    travado: 0,
    liberado: 0,
    aguardando_conciliacao: 0,
    pago: 0,
    suspeito: 0,
  };
  boletosAtivos.forEach((b) => {
    totais[b.status] += b.valor;
  });
  for (const pag of rhAguardandoConciliacao) {
    totais.aguardando_conciliacao += pag.pagamento_valor ?? pag.valor;
  }
  for (const pag of rhPagos) {
    totais.pago += pag.pagamento_valor ?? pag.valor;
  }
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

  useEffect(() => {
    setAbaFinanceira(parseAbaFinanceiro(searchParams.get("aba")));
    setFiltroStatusConta(parseFiltroStatusConta(searchParams.get("status")));
    setFiltroVencimentoConta(parseFiltroVencimentoConta(searchParams.get("vencimento")));
  }, [searchParams]);

  useEffect(() => {
    const aba = parseAbaFinanceiro(searchParams.get("aba"));
    const fila = parseFilaAgendaFinanceiro(searchParams.get("fila"));
    if (aba !== "boletos" || !fila) return;
    const id =
      fila === "aguardando" ? "financeiro-fila-aguardando" : "financeiro-fila-pagos";
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [searchParams, abaFinanceira]);

  function irParaFinanceiro(opts: {
    aba?: AbaFinanceiro;
    vencimento?: FiltroVencimentoConta;
    status?: StatusContaPagar | "todos";
    fila?: FilaAgendaFinanceiro;
  }) {
    const aba = opts.aba ?? abaFinanceira;
    const vencimento =
      opts.vencimento ?? (aba === "contas" ? filtroVencimentoConta : "todas");
    const status = opts.status ?? (aba === "contas" ? filtroStatusConta : "todos");
    const fila =
      aba === "boletos"
        ? opts.fila ?? parseFilaAgendaFinanceiro(searchParams.get("fila"))
        : undefined;
    setAbaFinanceira(aba);
    if (aba === "contas") {
      setFiltroVencimentoConta(vencimento);
      setFiltroStatusConta(status);
    }
    router.replace(hrefFinanceiro({ aba, vencimento, status, fila }), { scroll: false });
  }

  function abrirNovaConta() {
    setErroFormConta(null);
    setFormConta(novaContaInicial());
    setModalNovaContaAberto(true);
    irParaFinanceiro({ aba: "contas" });
  }

  function fecharNovaConta() {
    setErroFormConta(null);
    setModalNovaContaAberto(false);
  }

  function abrirDetalhesNfe(notaId: string) {
    setNotaDetalhesId(notaId);
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

    if (confronto.classificacao === "parcial" && !justificativaImportacao.trim()) {
      setMensagemImportacaoBoleto("Justificativa obrigatória para confirmação parcial.");
      return;
    }

    setProcessandoImportacaoBoleto(true);
    setMensagemImportacaoBoleto(null);

    try {
      const proximo = structuredClone(db) as DB;
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
          parcelaSelecionadaId: confronto.classificacao === "multiplas_possibilidades" ? parcelaSelecionadaMultipla : undefined,
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

      setMensagemReceberBoleto("Boleto conferido e adicionado aos boletos a vencer");
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
    irParaFinanceiro({ aba: "contas" });
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
      try {
        return gerarPadraoInterleaved2of5(estadoAgendaPagamento.codigoCanonico);
      } catch {
        return [];
      }
    }, [codigoAberto, estadoAgendaPagamento.codigoCanonico]);
    const acoesDesktop = acoesPagamentoDisponiveisNoLayout("desktop", estadoAgendaPagamento);
    const acoesMobile = acoesPagamentoDisponiveisNoLayout("mobile", estadoAgendaPagamento);
    const configuracaoCodigoSvg = useMemo(() => {
      if (!codigoAberto || segmentosCodigoPagamento.length === 0) return null;
      return montarConfiguracaoSvgCodigo(segmentosCodigoPagamento, "linha");
    }, [codigoAberto, segmentosCodigoPagamento]);
    const mostrarAcoesInlineCodigo = codigoAberto && acoesUnicasQuandoCodigoAberto().length > 0;

    return (
      <Card
        className={`space-y-2 ${cancelado ? "opacity-60" : ""} ${
          boleto.status === "suspeito" && !cancelado ? "border-2 border-erro" : ""
        }`}
      >
        <div className={CLASSE_GRID_CODIGO_PAGAMENTO}>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className={cancelado ? "line-through" : ""}>
                <p className="font-bold">{fornecedor}</p>
                <p className="text-sm text-slate-600">NF-e {notaDoBoleto(db, boleto)?.numero ?? "—"} · {rotuloParcela(boleto.numero_parcela)}</p>
                <p className="text-xl font-bold">{moeda(boleto.valor)}</p>
                <p className="text-sm text-slate-600">Vencimento: {dataBR(boleto.vencimento)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <BadgeStatus boleto={boleto} />
                {boleto.conciliacao_divergente && boleto.status === "aguardando_conciliacao" && (
                  <Badge cor="laranja">
                    <TriangleAlert size={14} /> Divergente
                  </Badge>
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

            {boleto.status === "aguardando_conciliacao" && (
              <div className="rounded-card border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                <p>
                  Pagamento informado em {boleto.pagamento_data ? dataBR(boleto.pagamento_data) : "—"}
                  {boleto.pagamento_valor != null ? ` · ${moeda(boleto.pagamento_valor)}` : ""}
                  {boleto.pagamento_banco_conta ? ` · ${boleto.pagamento_banco_conta}` : ""}
                </p>
                {boleto.conciliacao_divergente && boleto.conciliacao_divergencia_motivo && (
                  <p className="mt-1 font-medium text-destaque">Divergência: {boleto.conciliacao_divergencia_motivo}</p>
                )}
              </div>
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
                  <>
                    <button type="button" className="btn-primario" onClick={() => abrirConciliarBoleto(boleto)}>
                      <CircleCheckBig size={16} /> Conciliar
                    </button>
                    <button type="button" className="btn-secundario" onClick={() => abrirDivergenciaBoleto(boleto)}>
                      <TriangleAlert size={16} /> Divergente
                    </button>
                  </>
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

  function CartaoPagamentoRh({ pagamento }: { pagamento: PagamentoPessoa }) {
    const valor = pagamento.pagamento_valor ?? pagamento.valor;
    return (
      <Card className="space-y-2 border-blue-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-800">
              <Users size={12} /> RH
            </p>
            <p className="font-bold">{nomePessoaRh(pagamento.pessoa_id)}</p>
            <Link
              href={hrefPerfilRh(pagamento.pessoa_id, { aba: "pagamentos" })}
              className="mt-0.5 inline-block text-sm text-primaria-escura underline"
            >
              Ver perfil
            </Link>
            <p className="text-sm text-slate-600">
              {rotuloTipoPagamentoPessoa(pagamento.tipo)}
              {pagamento.descricao ? ` · ${pagamento.descricao}` : ""}
            </p>
            <p className="text-xl font-bold">{moeda(valor)}</p>
            <p className="text-sm text-slate-600">Vencimento: {dataBR(pagamento.vencimento)}</p>
            <Link
              href={hrefPagamentosRh({
                filtro: filtroPagamentosRhDeStatus(pagamento.status),
                pessoa: pagamento.pessoa_id,
                competencia: pagamento.competencia || undefined,
                tipo: pagamento.tipo,
              })}
              className="mt-0.5 inline-block text-sm text-primaria-escura underline"
            >
              Ver na lista RH
            </Link>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge cor={pagamento.status === "pago" ? "verde" : "azul"}>
              {pagamento.status === "pago" ? "Pago" : "Aguardando conciliação"}
            </Badge>
            {pagamento.conciliacao_divergente && pagamento.status === "aguardando_conciliacao" && (
              <Badge cor="laranja">
                <TriangleAlert size={14} /> Divergente
              </Badge>
            )}
          </div>
        </div>

        {pagamento.status === "aguardando_conciliacao" && (
          <div className="rounded-card border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            <p>
              Pagamento informado em {pagamento.pagamento_data ? dataBR(pagamento.pagamento_data) : "—"}
              {pagamento.pagamento_valor != null ? ` · ${moeda(pagamento.pagamento_valor)}` : ""}
              {pagamento.pagamento_banco_conta ? ` · saiu de ${pagamento.pagamento_banco_conta}` : ""}
            </p>
            {pagamento.conciliacao_divergente && pagamento.conciliacao_divergencia_motivo && (
              <p className="mt-1 font-medium text-destaque">Divergência: {pagamento.conciliacao_divergencia_motivo}</p>
            )}
          </div>
        )}

        {pagamento.status === "pago" && pagamento.pagamento_banco_conta && (
          <p className="text-sm text-slate-600">Saiu de {pagamento.pagamento_banco_conta}</p>
        )}

        {pagamento.status === "aguardando_conciliacao" && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primario" onClick={() => abrirConciliarRh(pagamento)}>
              <CircleCheckBig size={16} /> Conciliar
            </button>
            <button type="button" className="btn-secundario" onClick={() => abrirDivergenciaRh(pagamento)}>
              <TriangleAlert size={16} /> Divergente
            </button>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => void copiarReciboRh(pagamento, "recibo")}
            >
              <Copy size={16} /> Copiar recibo
            </button>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => abrirWhatsAppReciboRh(pagamento, "recibo")}
              title="Abre o WhatsApp com o recibo (precisa de telefone no perfil)"
            >
              WhatsApp recibo
            </button>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => void copiarReciboRh(pagamento, "confirmacao")}
            >
              <Copy size={16} /> Confirmação
            </button>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => abrirWhatsAppReciboRh(pagamento, "confirmacao")}
              title="Abre o WhatsApp com a confirmação (precisa de telefone no perfil)"
            >
              WhatsApp confirmação
            </button>
          </div>
        )}

        {pagamento.status === "pago" && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secundario"
              onClick={() => void copiarReciboRh(pagamento, "recibo")}
            >
              <Copy size={16} /> Copiar recibo
            </button>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => abrirWhatsAppReciboRh(pagamento, "recibo")}
              title="Abre o WhatsApp com o recibo (precisa de telefone no perfil)"
            >
              WhatsApp recibo
            </button>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => void copiarReciboRh(pagamento, "confirmacao")}
            >
              <Copy size={16} /> Confirmação
            </button>
            <button
              type="button"
              className="btn-secundario"
              onClick={() => abrirWhatsAppReciboRh(pagamento, "confirmacao")}
              title="Abre o WhatsApp com a confirmação (precisa de telefone no perfil)"
            >
              WhatsApp confirmação
            </button>
          </div>
        )}
      </Card>
    );
  }

  const boletoLiberando = db.boletos.find((b) => b.id === confirmandoLiberacao);
  const boletoResumo = boletoResumoId ? db.boletos.find((boleto) => boleto.id === boletoResumoId) ?? null : null;
  const boletoPagamento = boletoPagamentoId ? db.boletos.find((boleto) => boleto.id === boletoPagamentoId) ?? null : null;
  const boletoConciliar = boletoConciliarId ? db.boletos.find((boleto) => boleto.id === boletoConciliarId) ?? null : null;
  const boletoDivergencia = boletoDivergenciaId ? db.boletos.find((boleto) => boleto.id === boletoDivergenciaId) ?? null : null;
  const rhConciliar = rhConciliarId
    ? (db.pagamentos_pessoas ?? []).find((p) => p.id === rhConciliarId) ?? null
    : null;
  const rhDivergencia = rhDivergenciaId
    ? (db.pagamentos_pessoas ?? []).find((p) => p.id === rhDivergenciaId) ?? null
    : null;
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
      <TituloPagina titulo="Financeiro" subtitulo="Boletos e contas" />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn-secundario ${abaFinanceira === "boletos" ? "border-primaria bg-primaria-clara text-primaria" : ""}`}
          onClick={() => irParaFinanceiro({ aba: "boletos" })}
        >
          Boletos
        </button>
        <button
          type="button"
          className={`btn-secundario ${abaFinanceira === "contas" ? "border-primaria bg-primaria-clara text-primaria" : ""}`}
          onClick={() => irParaFinanceiro({ aba: "contas" })}
        >
          Contas a pagar
        </button>
        <button
          type="button"
          className={`btn-secundario ${abaFinanceira === "notas" ? "border-primaria bg-primaria-clara text-primaria" : ""}`}
          onClick={() => irParaFinanceiro({ aba: "notas" })}
        >
          Notas fiscais
        </button>
      </div>

      {abaFinanceira === "boletos" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2>Boletos a vencer</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secundario"
                disabled={boletosAtivos.length + rhAguardandoConciliacao.length + rhPagos.length === 0}
                onClick={baixarAgendaBoletosCsv}
                title={
                  boletosAtivos.length + rhAguardandoConciliacao.length + rhPagos.length === 0
                    ? "Nada para exportar na agenda"
                    : "Exportar agenda (boletos + RH) em CSV"
                }
              >
                <Download size={16} /> Exportar CSV
                {boletosAtivos.length + rhAguardandoConciliacao.length + rhPagos.length > 0
                  ? ` (${boletosAtivos.length + rhAguardandoConciliacao.length + rhPagos.length})`
                  : ""}
              </button>
              <button type="button" className="btn-secundario" onClick={abrirImportarExtratoOfx}>
                <Upload size={18} /> Importar extrato OFX
              </button>
              <button type="button" className="btn-primario" onClick={() => abrirImportarBoleto()}>
                <Upload size={18} /> Importar boleto
              </button>
            </div>
          </div>

          {mensagemReceberBoleto && (
            <div className="rounded-card border border-sucesso bg-sucesso-clara px-4 py-3 text-sm font-medium text-primaria-escura">
              {mensagemReceberBoleto}
            </div>
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
            <button
              type="button"
              className={`rounded-card border bg-white px-4 py-3 text-left space-y-1 transition ${
                parseFilaAgendaFinanceiro(searchParams.get("fila")) === "aguardando"
                  ? "border-primaria ring-1 ring-primaria"
                  : "border-slate-200 hover:border-primaria"
              }`}
              onClick={() => irParaFinanceiro({ aba: "boletos", fila: "aguardando" })}
              title="Ir para a fila Aguardando conciliação"
            >
              <p className="rotulo flex items-center gap-1">
                <Clock3 size={13} /> Aguardando conciliação
              </p>
              <p className="text-xl font-bold text-blue-700">{moeda(totais.aguardando_conciliacao)}</p>
            </button>
            <button
              type="button"
              className={`rounded-card border bg-white px-4 py-3 text-left space-y-1 transition ${
                parseFilaAgendaFinanceiro(searchParams.get("fila")) === "pagos"
                  ? "border-primaria ring-1 ring-primaria"
                  : "border-slate-200 hover:border-primaria"
              }`}
              onClick={() => irParaFinanceiro({ aba: "boletos", fila: "pagos" })}
              title="Ir para a fila Pagos"
            >
              <p className="rotulo flex items-center gap-1">
                <CircleCheckBig size={13} /> Pagos
              </p>
              <p className="text-xl font-bold text-primaria-escura">{moeda(totais.pago)}</p>
            </button>
            <Card className="py-3">
              <p className="rotulo flex items-center gap-1">
                <TriangleAlert size={13} /> Suspeitos
              </p>
              <p className="text-xl font-bold text-erro">{moeda(totais.suspeito)}</p>
            </Card>
          </div>

          {boletosLiberadosElegiveis.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secundario"
                onClick={() => void copiarLinhasDigitaveisDoLote()}
                title="Copia todas as linhas digitáveis com cabeçalho por boleto. Não altera status."
              >
                <Copy size={16} /> Copiar linhas ({boletosLiberadosElegiveis.length})
              </button>
              <button
                type="button"
                className="btn-primario"
                onClick={abrirInformarBoletosLote}
                title="Informa pagamento de todos os liberados aptos com a mesma data/conta"
              >
                Informar pagamentos em lote ({boletosLiberadosElegiveis.length})
              </button>
            </div>
          )}

          {/* Agenda financeira */}
          <section className="space-y-4">
            <h2>Agenda financeira</h2>

            <div className="space-y-2">
              <p className="rotulo text-erro">Atrasados</p>
              {boletosAtrasados.length === 0 ? (
                <Vazio mensagem="Nenhum boleto atrasado." />
              ) : (
                [...boletosAtrasados]
                  .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
                  .map((boleto) => <CartaoBoleto key={boleto.id} boleto={boleto} />)
              )}
            </div>

            <div className="space-y-2">
              <p className="rotulo">Vencendo hoje</p>
              {boletosVencendoHoje.length === 0 ? (
                <Vazio mensagem="Nenhum boleto vencendo hoje." />
              ) : (
                [...boletosVencendoHoje]
                  .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
                  .map((boleto) => <CartaoBoleto key={boleto.id} boleto={boleto} />)
              )}
            </div>

            <div className="space-y-2">
              <p className="rotulo">A vencer</p>
              {boletosAVencer.length === 0 ? (
                <Vazio mensagem="Nenhum boleto a vencer." />
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

            <div id="financeiro-fila-aguardando" className="space-y-2 scroll-mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="rotulo text-blue-700">Aguardando conciliação</p>
                <div className="flex flex-wrap items-center gap-2">
                  {boletosAguardandoConciliacao.length > 0 && (
                    <button
                      type="button"
                      className="btn-primario text-sm"
                      onClick={conciliarTodosBoletosAguardando}
                      title="Marca todos os boletos desta fila como pagos com a data de hoje"
                    >
                      Conciliar todos boletos ({boletosAguardandoConciliacao.length})
                    </button>
                  )}
                  {rhAguardandoConciliacao.length > 0 && (
                    <>
                      <button
                        type="button"
                        className="btn-secundario text-sm"
                        onClick={() => void copiarRecibosRhDoLote(rhAguardandoConciliacao, "recibo")}
                        title="Copia recibos discriminados dos RH desta fila"
                      >
                        <Copy size={14} /> Copiar recibos RH ({rhAguardandoConciliacao.length})
                      </button>
                      <button
                        type="button"
                        className="btn-secundario text-sm"
                        onClick={() =>
                          void copiarRecibosRhDoLote(rhAguardandoConciliacao, "confirmacao")
                        }
                        title="Copia confirmações curtas dos RH desta fila"
                      >
                        <Copy size={14} /> Copiar confirmações RH ({rhAguardandoConciliacao.length})
                      </button>
                      <button
                        type="button"
                        className="btn-primario text-sm"
                        onClick={conciliarTodosPagamentosRhAguardando}
                        title="Marca todos os pagamentos de RH desta fila como pagos com a data de hoje"
                      >
                        Conciliar todos RH ({rhAguardandoConciliacao.length})
                      </button>
                    </>
                  )}
                  <Link
                    href={hrefPagamentosRh("aguardando")}
                    className="text-xs font-medium text-blue-800 underline-offset-2 hover:underline"
                  >
                    Ver pagamentos de RH
                  </Link>
                </div>
              </div>
              {boletosAguardandoConciliacao.length === 0 && rhAguardandoConciliacao.length === 0 ? (
                <Vazio mensagem="Nenhum boleto ou pagamento de RH aguardando conciliação." />
              ) : (
                <>
                  {[...boletosAguardandoConciliacao]
                    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
                    .map((boleto) => <CartaoBoleto key={boleto.id} boleto={boleto} />)}
                  {[...rhAguardandoConciliacao]
                    .sort((a, b) => (a.pagamento_data || a.vencimento).localeCompare(b.pagamento_data || b.vencimento))
                    .map((pagamento) => <CartaoPagamentoRh key={pagamento.id} pagamento={pagamento} />)}
                </>
              )}
            </div>

            <div id="financeiro-fila-pagos" className="space-y-2 scroll-mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="rotulo text-primaria-escura">Pagos</p>
                {rhPagos.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn-secundario text-sm"
                      onClick={() => void copiarRecibosRhDoLote(rhPagos, "recibo")}
                      title="Copia recibos discriminados dos RH pagos"
                    >
                      <Copy size={14} /> Copiar recibos RH ({rhPagos.length})
                    </button>
                    <button
                      type="button"
                      className="btn-secundario text-sm"
                      onClick={() => void copiarRecibosRhDoLote(rhPagos, "confirmacao")}
                      title="Copia confirmações curtas dos RH pagos"
                    >
                      <Copy size={14} /> Copiar confirmações RH ({rhPagos.length})
                    </button>
                  </div>
                )}
              </div>
              {boletosPagos.length === 0 && rhPagos.length === 0 ? (
                <Vazio mensagem="Nenhum boleto ou pagamento de RH marcado como pago." />
              ) : (
                <>
                  {[...boletosPagos]
                    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
                    .map((boleto) => <CartaoBoleto key={boleto.id} boleto={boleto} />)}
                  {[...rhPagos]
                    .sort((a, b) => (a.pagamento_data || a.vencimento).localeCompare(b.pagamento_data || b.vencimento))
                    .map((pagamento) => <CartaoPagamentoRh key={pagamento.id} pagamento={pagamento} />)}
                </>
              )}
            </div>
          </section>
        </>
      ) : abaFinanceira === "contas" ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2>Contas a pagar</h2>
              <p className="text-sm text-slate-600">Mesma área financeira, reunindo contas manuais e originadas de NF-e.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secundario"
                disabled={contasFiltradas.length === 0}
                onClick={baixarContasPagarCsv}
                title={
                  contasFiltradas.length === 0
                    ? "Nada para exportar neste filtro"
                    : "Exportar contas do filtro atual (CSV)"
                }
              >
                <Download size={16} /> Exportar CSV
                {contasFiltradas.length > 0 ? ` (${contasFiltradas.length})` : ""}
              </button>
              <button type="button" className="btn-primario" onClick={abrirNovaConta}>
                <Plus size={18} /> Nova conta
              </button>
            </div>
          </div>

          {mensagemReceberBoleto && (
            <div className="rounded-card border border-sucesso bg-sucesso-clara px-4 py-3 text-sm font-medium text-primaria-escura">
              {mensagemReceberBoleto}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <button
              type="button"
              className={`rounded-card border bg-white px-4 py-3 text-left space-y-2 transition ${
                filtroVencimentoConta === "hoje" && filtroStatusConta === "todos"
                  ? "border-primaria ring-1 ring-primaria"
                  : "border-slate-200 hover:border-primaria"
              }`}
              onClick={() =>
                irParaFinanceiro({ aba: "contas", vencimento: "hoje", status: "todos" })
              }
              title="Filtrar contas vencendo hoje"
            >
              <p className="rotulo flex items-center gap-1">
                <CalendarDays size={14} /> Vencendo hoje
              </p>
              <p className="text-2xl font-bold text-slate-900">{resumoContas.vencendoHoje.quantidade}</p>
              <p className="text-sm text-slate-600">{moeda(resumoContas.vencendoHoje.total)}</p>
            </button>
            <button
              type="button"
              className={`rounded-card border bg-white px-4 py-3 text-left space-y-2 transition ${
                filtroVencimentoConta === "proximos_7_dias" && filtroStatusConta === "todos"
                  ? "border-primaria ring-1 ring-primaria"
                  : "border-slate-200 hover:border-primaria"
              }`}
              onClick={() =>
                irParaFinanceiro({
                  aba: "contas",
                  vencimento: "proximos_7_dias",
                  status: "todos",
                })
              }
              title="Filtrar contas dos próximos 7 dias"
            >
              <p className="rotulo flex items-center gap-1">
                <Clock3 size={14} /> Próximos 7 dias
              </p>
              <p className="text-2xl font-bold text-slate-900">{resumoContas.proximos7Dias.quantidade}</p>
              <p className="text-sm text-slate-600">{moeda(resumoContas.proximos7Dias.total)}</p>
            </button>
            <button
              type="button"
              className={`rounded-card border bg-white px-4 py-3 text-left space-y-2 transition ${
                filtroVencimentoConta === "atrasadas" && filtroStatusConta === "todos"
                  ? "border-primaria ring-1 ring-primaria"
                  : "border-slate-200 hover:border-primaria"
              }`}
              onClick={() =>
                irParaFinanceiro({ aba: "contas", vencimento: "atrasadas", status: "todos" })
              }
              title="Filtrar contas atrasadas"
            >
              <p className="rotulo flex items-center gap-1 text-erro">
                <TriangleAlert size={14} /> Atrasadas
              </p>
              <p className="text-2xl font-bold text-erro">{resumoContas.atrasadas.quantidade}</p>
              <p className="text-sm text-slate-600">{moeda(resumoContas.atrasadas.total)}</p>
            </button>
            <button
              type="button"
              className={`rounded-card border bg-white px-4 py-3 text-left space-y-2 transition ${
                filtroStatusConta === "aguardando_conciliacao" && filtroVencimentoConta === "todas"
                  ? "border-primaria ring-1 ring-primaria"
                  : "border-slate-200 hover:border-primaria"
              }`}
              onClick={() =>
                irParaFinanceiro({
                  aba: "contas",
                  vencimento: "todas",
                  status: "aguardando_conciliacao",
                })
              }
              title="Filtrar contas aguardando conciliação"
            >
              <p className="rotulo flex items-center gap-1 text-blue-700">
                <CircleCheckBig size={14} /> Aguardando conciliação
              </p>
              <p className="text-2xl font-bold text-blue-700">{resumoContas.aguardandoConciliacao.quantidade}</p>
              <p className="text-sm text-slate-600">{moeda(resumoContas.aguardandoConciliacao.total)}</p>
            </button>
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
                  onChange={(event) =>
                    irParaFinanceiro({
                      aba: "contas",
                      status: event.target.value as StatusContaPagar | "todos",
                    })
                  }
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
                  onChange={(event) =>
                    irParaFinanceiro({
                      aba: "contas",
                      vencimento: event.target.value as FiltroVencimentoConta,
                    })
                  }
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
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2>Notas fiscais</h2>
              <p className="text-sm text-slate-600">Visualização completa das NF-e importadas para conferência e correção.</p>
            </div>
            <button
              type="button"
              className="btn-secundario"
              disabled={notasFiscaisFinanceiro.length === 0}
              onClick={baixarNotasFiscaisCsv}
              title={
                notasFiscaisFinanceiro.length === 0
                  ? "Nada para exportar neste filtro"
                  : "Exportar notas do filtro atual (CSV)"
              }
            >
              <Download size={16} /> Exportar CSV
              {notasFiscaisFinanceiro.length > 0 ? ` (${notasFiscaisFinanceiro.length})` : ""}
            </button>
          </div>

          {mensagemReceberBoleto && (
            <div className="rounded-card border border-sucesso bg-sucesso-clara px-4 py-3 text-sm font-medium text-primaria-escura">
              {mensagemReceberBoleto}
            </div>
          )}

          <Card className="space-y-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
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
                      "Status",
                      "Completude",
                      "Ações",
                    ]}
                  >
                    {notasFiscaisFinanceiro.map((resumo) => (
                      <tr key={resumo.nota.id}>
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
                        <td className="px-3 py-3 text-sm text-slate-700">{resumo.nota.status}</td>
                        <td className="px-3 py-3">
                          <BadgeCompletudeNfeFinanceiro indicador={resumo.indicadorCompletude} />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="btn-secundario" onClick={() => abrirDetalhesNfe(resumo.nota.id)}>
                              Ver detalhes
                            </button>
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
                  <Card key={resumo.nota.id} className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-900">NF-e {resumo.nota.numero || "—"}</p>
                        <p className="text-sm text-slate-600">{resumo.fornecedorNome}</p>
                        <p className="text-xs text-slate-500">{resumo.emitenteNome} · {resumo.emitenteCnpj}</p>
                      </div>
                      <BadgeCompletudeNfeFinanceiro indicador={resumo.indicadorCompletude} />
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
        aberto={modalExtratoOfxAberto}
        titulo="Importar extrato OFX"
        onFechar={fecharImportarExtratoOfx}
        fecharAoClicarFundo={false}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Exporte o extrato em OFX no internet banking e envie aqui. O ComprasChef sugere casar débitos com boletos e
            pagamentos de RH em <span className="font-semibold">aguardando conciliação</span> (valor, data e banco
            informado).
          </p>
          <label className="block">
            <span className="rotulo mb-1 block">Arquivo OFX</span>
            <input
              type="file"
              accept=".ofx,.OFX,application/x-ofx,application/ofx,text/xml"
              className="input w-full py-2"
              disabled={processandoExtratoOfx}
              onChange={(e) => void aoEscolherArquivoOfx(e)}
            />
          </label>
          {erroExtratoOfx && <p className="text-sm font-medium text-erro">{erroExtratoOfx}</p>}
          {sugestoesExtrato.length > 0 && (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {sugestoesExtrato.map((s) => {
                const chave = `${s.linha.fitid ?? s.linha.data}-${s.linha.valor}-${s.alvo ?? "x"}-${s.alvo_id ?? "x"}`;
                return (
                  <label
                    key={chave}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                      s.alvo_id ? "border-stone-200 bg-white" : "border-dashed border-stone-200 bg-stone-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={!s.alvo_id || processandoExtratoOfx}
                      checked={Boolean(s.alvo_id && selecionadosExtrato[chave])}
                      onChange={(e) =>
                        setSelecionadosExtrato((atual) => ({ ...atual, [chave]: e.target.checked }))
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-900">
                        {dataBR(s.linha.data)} · {moeda(Math.abs(s.linha.valor))} · {s.linha.descricao}
                      </span>
                      {s.alvo_id ? (
                        <span className="block text-xs text-slate-600">
                          → {s.rotulo_alvo} ({s.confianca === "exata" ? "match exato" : "match próximo"}
                          {s.motivos.length ? ` · ${s.motivos.join(", ")}` : ""})
                        </span>
                      ) : (
                        <span className="block text-xs text-slate-500">Sem correspondente</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secundario" onClick={fecharImportarExtratoOfx} disabled={processandoExtratoOfx}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primario"
              disabled={processandoExtratoOfx || !sugestoesExtrato.some((s) => s.alvo_id)}
              onClick={confirmarExtratoOfx}
            >
              {processandoExtratoOfx ? "Conciliando…" : "Conciliar selecionados"}
            </button>
          </div>
        </div>
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

              {estadoImportacaoBoleto.confronto.classificacao === "multiplas_possibilidades" && (
                <div className="space-y-2 rounded-card border border-slate-200 bg-white px-3 py-2">
                  <p className="text-sm font-semibold">Selecione uma parcela candidata</p>
                  <select
                    className="input w-full"
                    value={parcelaSelecionadaMultipla}
                    onChange={(event) => setParcelaSelecionadaMultipla(event.target.value)}
                    disabled={processandoImportacaoBoleto}
                  >
                    <option value="">Selecione</option>
                    {estadoImportacaoBoleto.confronto.candidatos.map((candidato) => {
                      const parcela = db.boletos.find((boleto) => boleto.id === candidato.boleto_id);
                      const nota = db.notas_fiscais.find((n) => n.id === candidato.nota_id);
                      return (
                        <option key={candidato.boleto_id} value={candidato.boleto_id}>
                          {nota?.numero ?? "s/n"} · {rotuloParcela(parcela?.numero_parcela)} · {parcela ? moeda(parcela.valor) : "—"}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {(estadoImportacaoBoleto.confronto.classificacao === "parcial" ||
                estadoImportacaoBoleto.confronto.classificacao === "multiplas_possibilidades") && (
                <label className="block">
                  <span className="rotulo mb-1 block">Justificativa da confirmação *</span>
                  <textarea
                    className="input min-h-20 w-full py-2"
                    value={justificativaImportacao}
                    onChange={(event) => setJustificativaImportacao(event.target.value)}
                    disabled={processandoImportacaoBoleto}
                  />
                </label>
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
                  estadoImportacaoBoleto.confronto.classificacao === "multiplas_possibilidades"
                )
              }
            >
              <Upload size={16} />
              {estadoImportacaoBoleto.confronto?.classificacao === "parcial" ||
              estadoImportacaoBoleto.confronto?.classificacao === "multiplas_possibilidades"
                ? "Confirmar vínculo e adicionar aos boletos a vencer"
                : "Confirmar e adicionar aos boletos a vencer"}
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
        titulo="Pagar boleto"
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
              <p className="text-sm text-slate-700">Status conferência: {boletoPagamento.status_conferencia ?? "—"}</p>
            </Card>

            <div className="rounded-card border border-destaque bg-destaque-clara px-3 py-3 text-sm text-destaque">
              Informar pagamento não significa baixa financeira final. Este boleto ficará em aguardando conciliação até confirmação bancária.
            </div>

            <label className="block rounded-card border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <span className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={formPagamentoBoleto.confirmouAviso}
                  onChange={(event) => atualizarCampoPagamento("confirmouAviso", event.target.checked)}
                />
                Confirmo que revisei beneficiário, valor e vencimento antes de informar o pagamento.
              </span>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="rotulo mb-1 block">Data do pagamento *</span>
                <input
                  type="date"
                  className="input w-full"
                  value={formPagamentoBoleto.dataPagamento}
                  onChange={(event) => atualizarCampoPagamento("dataPagamento", event.target.value)}
                  required
                />
              </label>
              <label className="block">
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
                <span className="rotulo mb-1 block">De qual banco/conta saiu o pagamento? *</span>
                <SeletorContaOrigem
                  db={db}
                  valor={formPagamentoBoleto.bancoConta}
                  onChange={(bancoConta) => atualizarCampoPagamento("bancoConta", bancoConta)}
                  listId="contas-origem-boleto"
                  classNameInput="input w-full"
                />
                <p className="mt-1 text-xs text-slate-500">Ajuda a localizar o débito no extrato OFX.</p>
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

            <Card className="space-y-1 py-3 text-sm text-slate-700">
              <p>Valor do boleto: {moeda(boletoPagamento.valor)}</p>
              <p>Vencimento: {dataBR(boletoPagamento.vencimento)}</p>
              <p className="text-slate-600">O código para pagamento fica disponível na própria linha do boleto na agenda.</p>
            </Card>

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
              <button type="submit" className="btn-primario" disabled={processandoPagamentoBoleto}>
                <CircleCheckBig size={16} /> {processandoPagamentoBoleto ? "Informando..." : "Informar pagamento"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        aberto={informarBoletosLoteAberto}
        titulo="Informar pagamentos de boletos em lote"
        onFechar={fecharInformarBoletosLote}
        fecharAoClicarFundo={false}
      >
        {informarBoletosLoteAberto && (
          <form onSubmit={confirmarInformarBoletosLote} className="space-y-3">
            <div className="rounded-card border border-destaque bg-destaque-clara px-3 py-3 text-sm text-destaque">
              Informar não dá baixa final. Cada boleto vai para aguardando conciliação com o valor de face.
            </div>
            <p className="text-sm text-slate-700">
              {boletosLiberadosElegiveis.length} boleto(s) liberado(s) apto(s) · total{" "}
              <strong>
                {moeda(boletosLiberadosElegiveis.reduce((acc, b) => acc + b.valor, 0))}
              </strong>
            </p>

            <label className="block rounded-card border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <span className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={formPagamentoBoleto.confirmouAviso}
                  onChange={(event) => atualizarCampoPagamento("confirmouAviso", event.target.checked)}
                />
                Confirmo que revisei beneficiário, valor e vencimento de cada boleto do lote antes de informar.
              </span>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="rotulo mb-1 block">Data do pagamento *</span>
                <input
                  type="date"
                  className="input w-full"
                  value={formPagamentoBoleto.dataPagamento}
                  onChange={(event) => atualizarCampoPagamento("dataPagamento", event.target.value)}
                  required
                />
              </label>
              <label className="block">
                <span className="rotulo mb-1 block">Responsável</span>
                <input
                  className="input w-full"
                  value={formPagamentoBoleto.responsavel}
                  onChange={(event) => atualizarCampoPagamento("responsavel", event.target.value)}
                />
              </label>
              <div className="sm:col-span-2 space-y-2">
                <label className="block">
                  <span className="rotulo mb-1 block">De qual banco/conta saiu o pagamento? *</span>
                  <SeletorContaOrigem
                    db={db}
                    valor={formPagamentoBoleto.bancoConta}
                    onChange={(bancoConta) => atualizarCampoPagamento("bancoConta", bancoConta)}
                    listId="contas-origem-boletos-lote"
                  />
                </label>
                <p className="text-xs text-slate-500">
                  Mesma origem para todos os boletos do lote — facilita achar no extrato.
                </p>
              </div>
              <label className="block sm:col-span-2">
                <span className="rotulo mb-1 block">Observação (opcional)</span>
                <textarea
                  className="input min-h-20 w-full py-2"
                  value={formPagamentoBoleto.observacao}
                  onChange={(event) => atualizarCampoPagamento("observacao", event.target.value)}
                />
              </label>
            </div>

            {erroPagamentoBoleto && (
              <p className="rounded-card border border-erro bg-erro-clara px-3 py-2 text-sm font-medium text-erro">
                {erroPagamentoBoleto}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secundario"
                onClick={fecharInformarBoletosLote}
                disabled={processandoPagamentoBoleto}
              >
                Cancelar
              </button>
              <button type="submit" className="btn-primario" disabled={processandoPagamentoBoleto}>
                <CircleCheckBig size={16} />{" "}
                {processandoPagamentoBoleto ? "Informando..." : "Informar pagamentos"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        aberto={Boolean(boletoConciliar)}
        titulo="Conciliar boleto"
        onFechar={fecharConciliarBoleto}
        fecharAoClicarFundo={false}
      >
        {boletoConciliar && (
          <form onSubmit={confirmarConciliarBoleto} className="space-y-3">
            <Card className="space-y-2 bg-slate-50 py-3">
              <p className="font-bold text-slate-900">{fornecedorDoBoleto(db, boletoConciliar)}</p>
              <p className="text-sm text-slate-700">
                Pagamento informado: {boletoConciliar.pagamento_data ? dataBR(boletoConciliar.pagamento_data) : "—"}
                {boletoConciliar.pagamento_valor != null ? ` · ${moeda(boletoConciliar.pagamento_valor)}` : ""}
              </p>
              {boletoConciliar.pagamento_banco_conta && (
                <p className="text-sm text-slate-700">Banco/conta: {boletoConciliar.pagamento_banco_conta}</p>
              )}
              {boletoConciliar.conciliacao_divergente && boletoConciliar.conciliacao_divergencia_motivo && (
                <p className="text-sm font-medium text-destaque">
                  Divergência anterior: {boletoConciliar.conciliacao_divergencia_motivo}
                </p>
              )}
            </Card>

            <div className="rounded-card border border-destaque bg-destaque-clara px-3 py-3 text-sm text-destaque">
              Confirme apenas se o valor apareceu no extrato/banco. Isso marca o boleto como pago definitivo.
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="rotulo mb-1 block">Data da liquidação *</span>
                <input
                  type="date"
                  className="input w-full"
                  value={formConciliarBoleto.dataLiquidacao}
                  onChange={(event) =>
                    setFormConciliarBoleto((atual) => ({ ...atual, dataLiquidacao: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="block">
                <span className="rotulo mb-1 block">Responsável</span>
                <input
                  className="input w-full"
                  value={formConciliarBoleto.responsavel}
                  onChange={(event) =>
                    setFormConciliarBoleto((atual) => ({ ...atual, responsavel: event.target.value }))
                  }
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="rotulo mb-1 block">Observação (opcional)</span>
                <textarea
                  className="input min-h-20 w-full py-2"
                  value={formConciliarBoleto.observacao}
                  onChange={(event) =>
                    setFormConciliarBoleto((atual) => ({ ...atual, observacao: event.target.value }))
                  }
                />
              </label>
            </div>

            {erroConciliarBoleto && (
              <p className="rounded-card border border-erro bg-erro-clara px-3 py-2 text-sm font-medium text-erro">
                {erroConciliarBoleto}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secundario"
                onClick={fecharConciliarBoleto}
                disabled={processandoConciliarBoleto}
              >
                Cancelar
              </button>
              <button type="submit" className="btn-primario" disabled={processandoConciliarBoleto}>
                <CircleCheckBig size={16} /> {processandoConciliarBoleto ? "Conciliando..." : "Conciliar"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        aberto={Boolean(boletoDivergencia)}
        titulo="Registrar divergência"
        onFechar={fecharDivergenciaBoleto}
        fecharAoClicarFundo={false}
      >
        {boletoDivergencia && (
          <form onSubmit={confirmarDivergenciaBoleto} className="space-y-3">
            <Card className="space-y-2 bg-slate-50 py-3">
              <p className="font-bold text-slate-900">{fornecedorDoBoleto(db, boletoDivergencia)}</p>
              <p className="text-sm text-slate-700">
                Valor informado:{" "}
                {boletoDivergencia.pagamento_valor != null ? moeda(boletoDivergencia.pagamento_valor) : moeda(boletoDivergencia.valor)}
              </p>
            </Card>

            <div className="rounded-card border border-destaque bg-destaque-clara px-3 py-3 text-sm text-destaque">
              O boleto permanece em aguardando conciliação. Você poderá conciliar depois de resolver a divergência.
            </div>

            <label className="block">
              <span className="rotulo mb-1 block">Motivo da divergência *</span>
              <textarea
                className="input min-h-24 w-full py-2"
                value={formDivergenciaBoleto.motivo}
                onChange={(event) =>
                  setFormDivergenciaBoleto((atual) => ({ ...atual, motivo: event.target.value }))
                }
                placeholder="Ex.: valor no extrato diferente, data não encontrada..."
                required
              />
            </label>

            <label className="block">
              <span className="rotulo mb-1 block">Responsável</span>
              <input
                className="input w-full"
                value={formDivergenciaBoleto.responsavel}
                onChange={(event) =>
                  setFormDivergenciaBoleto((atual) => ({ ...atual, responsavel: event.target.value }))
                }
              />
            </label>

            {erroDivergenciaBoleto && (
              <p className="rounded-card border border-erro bg-erro-clara px-3 py-2 text-sm font-medium text-erro">
                {erroDivergenciaBoleto}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secundario"
                onClick={fecharDivergenciaBoleto}
                disabled={processandoDivergenciaBoleto}
              >
                Cancelar
              </button>
              <button type="submit" className="btn-primario" disabled={processandoDivergenciaBoleto}>
                <TriangleAlert size={16} /> {processandoDivergenciaBoleto ? "Registrando..." : "Registrar divergência"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        aberto={Boolean(rhConciliar)}
        titulo="Conciliar pagamento de RH"
        onFechar={fecharConciliarRh}
        fecharAoClicarFundo={false}
      >
        {rhConciliar && (
          <form onSubmit={confirmarConciliarRh} className="space-y-3">
            <Card className="space-y-2 bg-slate-50 py-3">
              <p className="font-bold text-slate-900">{nomePessoaRh(rhConciliar.pessoa_id)}</p>
              <Link
                href={hrefPerfilRh(rhConciliar.pessoa_id, { aba: "pagamentos" })}
                className="inline-block text-sm text-primaria-escura underline"
              >
                Ver perfil
              </Link>
              <p className="text-sm text-slate-700">
                {rotuloTipoPagamentoPessoa(rhConciliar.tipo)}
                {rhConciliar.descricao ? ` · ${rhConciliar.descricao}` : ""}
              </p>
              <p className="text-sm text-slate-700">
                Pagamento informado: {rhConciliar.pagamento_data ? dataBR(rhConciliar.pagamento_data) : "—"}
                {rhConciliar.pagamento_valor != null ? ` · ${moeda(rhConciliar.pagamento_valor)}` : ""}
              </p>
              {rhConciliar.pagamento_banco_conta && (
                <p className="text-sm text-slate-700">Saiu de: {rhConciliar.pagamento_banco_conta}</p>
              )}
              {rhConciliar.conciliacao_divergente && rhConciliar.conciliacao_divergencia_motivo && (
                <p className="text-sm font-medium text-destaque">
                  Divergência anterior: {rhConciliar.conciliacao_divergencia_motivo}
                </p>
              )}
            </Card>

            <div className="rounded-card border border-destaque bg-destaque-clara px-3 py-3 text-sm text-destaque">
              Confirme apenas se o valor apareceu no extrato/banco. Isso marca o pagamento como pago definitivo.
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="rotulo mb-1 block">Data da liquidação *</span>
                <input
                  type="date"
                  className="input w-full"
                  value={formConciliarRh.dataLiquidacao}
                  onChange={(event) =>
                    setFormConciliarRh((atual) => ({ ...atual, dataLiquidacao: event.target.value }))
                  }
                  required
                />
              </label>
              <label className="block">
                <span className="rotulo mb-1 block">Responsável</span>
                <input
                  className="input w-full"
                  value={formConciliarRh.responsavel}
                  onChange={(event) =>
                    setFormConciliarRh((atual) => ({ ...atual, responsavel: event.target.value }))
                  }
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="rotulo mb-1 block">Observação (opcional)</span>
                <textarea
                  className="input min-h-20 w-full py-2"
                  value={formConciliarRh.observacao}
                  onChange={(event) =>
                    setFormConciliarRh((atual) => ({ ...atual, observacao: event.target.value }))
                  }
                />
              </label>
            </div>

            {erroConciliarRh && (
              <p className="rounded-card border border-erro bg-erro-clara px-3 py-2 text-sm font-medium text-erro">
                {erroConciliarRh}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secundario" onClick={fecharConciliarRh} disabled={processandoConciliarRh}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario" disabled={processandoConciliarRh}>
                <CircleCheckBig size={16} /> {processandoConciliarRh ? "Conciliando..." : "Conciliar"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        aberto={Boolean(rhDivergencia)}
        titulo="Registrar divergência (RH)"
        onFechar={fecharDivergenciaRh}
        fecharAoClicarFundo={false}
      >
        {rhDivergencia && (
          <form onSubmit={confirmarDivergenciaRh} className="space-y-3">
            <Card className="space-y-2 bg-slate-50 py-3">
              <p className="font-bold text-slate-900">{nomePessoaRh(rhDivergencia.pessoa_id)}</p>
              <Link
                href={hrefPerfilRh(rhDivergencia.pessoa_id, { aba: "pagamentos" })}
                className="inline-block text-sm text-primaria-escura underline"
              >
                Ver perfil
              </Link>
              <p className="text-sm text-slate-700">
                Valor informado:{" "}
                {rhDivergencia.pagamento_valor != null ? moeda(rhDivergencia.pagamento_valor) : moeda(rhDivergencia.valor)}
              </p>
            </Card>

            <div className="rounded-card border border-destaque bg-destaque-clara px-3 py-3 text-sm text-destaque">
              O pagamento permanece em aguardando conciliação. Você poderá conciliar depois de resolver a divergência.
            </div>

            <label className="block">
              <span className="rotulo mb-1 block">Motivo da divergência *</span>
              <textarea
                className="input min-h-24 w-full py-2"
                value={formDivergenciaRh.motivo}
                onChange={(event) =>
                  setFormDivergenciaRh((atual) => ({ ...atual, motivo: event.target.value }))
                }
                placeholder="Ex.: valor no extrato diferente, data não encontrada..."
                required
              />
            </label>

            <label className="block">
              <span className="rotulo mb-1 block">Responsável</span>
              <input
                className="input w-full"
                value={formDivergenciaRh.responsavel}
                onChange={(event) =>
                  setFormDivergenciaRh((atual) => ({ ...atual, responsavel: event.target.value }))
                }
              />
            </label>

            {erroDivergenciaRh && (
              <p className="rounded-card border border-erro bg-erro-clara px-3 py-2 text-sm font-medium text-erro">
                {erroDivergenciaRh}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secundario"
                onClick={fecharDivergenciaRh}
                disabled={processandoDivergenciaRh}
              >
                Cancelar
              </button>
              <button type="submit" className="btn-primario" disabled={processandoDivergenciaRh}>
                <TriangleAlert size={16} /> {processandoDivergenciaRh ? "Registrando..." : "Registrar divergência"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal aberto={Boolean(notaDetalhes)} titulo="Detalhes da nota fiscal" onFechar={fecharDetalhesNfe}>
        {notaDetalhes && (
          <div className="space-y-3">
            <Card className="space-y-2 bg-slate-50 py-3">
              <p className="text-sm font-semibold text-slate-800">Dados fiscais importados</p>
              <p className="text-sm text-slate-700">Nota: {notaDetalhes.nota.numero || "—"}</p>
              <p className="text-sm text-slate-700">Chave de acesso: {notaDetalhes.nota.chave_acesso || "—"}</p>
              <p className="text-sm text-slate-700">Fornecedor vinculado: {notaDetalhes.fornecedorNome}</p>
              <p className="text-sm text-slate-700">Emitente no XML: {notaDetalhes.emitenteNome}</p>
              <p className="text-sm text-slate-700">CNPJ emitente: {cnpjBR(notaDetalhes.emitenteCnpj)}</p>
              <p className="text-sm text-slate-700">Valor total: {moeda(notaDetalhes.nota.valor_total)}</p>
              <p className="text-sm text-slate-700">Emissão: {notaDetalhes.nota.emitida_em ? dataBR(notaDetalhes.nota.emitida_em) : "—"}</p>
            </Card>

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

export default function FinanceiroPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <TituloPagina titulo="Financeiro" subtitulo="Carregando…" />
          <p className="text-sm text-slate-500">Carregando financeiro…</p>
        </div>
      }
    >
      <FinanceiroConteudo />
    </Suspense>
  );
}
