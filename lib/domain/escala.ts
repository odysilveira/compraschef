import type {
  ConvocacaoIntermitente,
  DB,
  EscalaSlot,
  PagamentoPessoa,
  PessoaRH,
  StatusConvocacao,
  TipoPagamentoPessoa,
  TipoPessoaRH,
} from "../types";
import { aplicarDescontosNoPagamento } from "./consumos-pessoas";
import { rotuloFuncao } from "./rh";

export const ANTECEDENCIA_MINIMA_DIAS = 3;
export const LOCAL_PADRAO_ESCALA = "Vera Bela Restaurante";
export const RAZAO_SOCIAL_PADRAO = "Vera Bela Restaurante Ltda";

const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function pessoaPrecisaConvocacao(tipo: TipoPessoaRH): boolean {
  return tipo === "intermitente" || tipo === "entregador";
}

export function rotuloStatusConvocacao(status: StatusConvocacao): string {
  switch (status) {
    case "rascunho":
      return "Rascunho";
    case "enviada":
      return "Enviada";
    case "aceita":
      return "Aceita";
    case "recusada":
      return "Recusada";
    case "silencio":
      return "Silêncio (recusa)";
  }
}

/** Lista YYYY-MM-DD dos próximos 28 dias a partir de hoje (inclusive). */
export function janela28Dias(hoje: string | Date = new Date()): string[] {
  const base = typeof hoje === "string" ? parseDataLocal(hoje) : new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias: string[] = [];
  for (let i = 0; i < 28; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    dias.push(formatDataLocal(d));
  }
  return dias;
}

export function parseDataLocal(isoDate: string): Date {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDataLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nomeDiaSemana(isoDate: string): string {
  return DIAS_SEMANA[parseDataLocal(isoDate).getDay()] ?? "";
}

export function formatDataBrLonga(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** HH:MM → minutos desde meia-noite. */
export function horaParaMinutos(hora: string): number | null {
  const m = hora.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatHora(hora: string): string {
  const mins = horaParaMinutos(hora);
  if (mins == null) return hora;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function calcularHorasPagas(
  horaInicio: string,
  horaFim: string,
  intervaloMin: number
): { horas_brutas: number; horas_pagas: number } | { erro: string } {
  const ini = horaParaMinutos(horaInicio);
  const fim = horaParaMinutos(horaFim);
  if (ini == null || fim == null) return { erro: "Informe horário no formato HH:MM." };
  let brutasMin = fim - ini;
  if (brutasMin <= 0) brutasMin += 24 * 60; // cruza meia-noite
  const intervalo = Number.isFinite(intervaloMin) && intervaloMin > 0 ? intervaloMin : 0;
  if (intervalo >= brutasMin) return { erro: "Intervalo não pode ser maior ou igual à jornada." };
  const horas_brutas = Number((brutasMin / 60).toFixed(2));
  const horas_pagas = Number(((brutasMin - intervalo) / 60).toFixed(2));
  return { horas_brutas, horas_pagas };
}

/** Antecedência mínima de 3 dias corridos entre a data da convocação e a data do serviço. */
export function antecedenciaMinimaOk(
  dataConvocacao: string,
  dataServico: string,
  minimoDias: number = ANTECEDENCIA_MINIMA_DIAS
): boolean {
  const a = parseDataLocal(dataConvocacao.slice(0, 10));
  const b = parseDataLocal(dataServico.slice(0, 10));
  const diffMs = b.getTime() - a.getTime();
  const diffDias = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return diffDias >= minimoDias;
}

export interface DadosNovoSlot {
  pessoa_id: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  intervalo_min: number;
  funcao?: string;
  local?: string;
  observacao?: string;
}

export interface ResultadoEscala {
  sucesso: boolean;
  slot?: EscalaSlot;
  convocacao?: ConvocacaoIntermitente;
  pagamento?: PagamentoPessoa;
  erros: string[];
  avisos: string[];
}

export function criarSlot(
  db: DB,
  dados: DadosNovoSlot,
  opcoes: { id?: string; agora?: string; criarConvocacao?: boolean; convocacaoId?: string } = {}
): ResultadoEscala {
  const erros: string[] = [];
  const avisos: string[] = [];
  const pessoa = db.pessoas.find((p) => p.id === dados.pessoa_id);
  if (!pessoa) erros.push("Pessoa não encontrada.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data)) erros.push("Data inválida.");
  const horas = calcularHorasPagas(dados.hora_inicio, dados.hora_fim, dados.intervalo_min);
  if ("erro" in horas) erros.push(horas.erro);
  if (erros.length || !pessoa || "erro" in horas) return { sucesso: false, erros, avisos };

  const agora = opcoes.agora ?? new Date().toISOString();
  if (!Array.isArray(db.escala_slots)) db.escala_slots = [];
  if (!Array.isArray(db.convocacoes)) db.convocacoes = [];

  const slot: EscalaSlot = {
    id: opcoes.id ?? `esc-${Date.now()}`,
    pessoa_id: dados.pessoa_id,
    data: dados.data,
    hora_inicio: formatHora(dados.hora_inicio),
    hora_fim: formatHora(dados.hora_fim),
    intervalo_min: Math.max(0, Math.round(dados.intervalo_min || 0)),
    funcao: dados.funcao?.trim() || rotuloFuncao(pessoa) || undefined,
    local: dados.local?.trim() || LOCAL_PADRAO_ESCALA,
    observacao: dados.observacao?.trim() || undefined,
    criado_em: agora,
    atualizado_em: agora,
  };
  db.escala_slots.push(slot);

  let convocacao: ConvocacaoIntermitente | undefined;
  const deveConvocar = opcoes.criarConvocacao !== false && pessoaPrecisaConvocacao(pessoa.tipo);
  if (deveConvocar) {
    const r = criarConvocacaoParaSlot(db, slot.id, { agora, id: opcoes.convocacaoId });
    if (!r.sucesso) return { sucesso: false, erros: r.erros, avisos: r.avisos, slot };
    convocacao = r.convocacao;
    avisos.push(...r.avisos);
  }

  return { sucesso: true, slot, convocacao, erros: [], avisos };
}

export function montarTextoConvocacaoWhatsApp(input: {
  pessoa: PessoaRH;
  slot: EscalaSlot;
  valor_hora: number;
  horas_brutas: number;
  horas_pagas: number;
  valor_estimado: number;
  razaoSocial?: string;
}): string {
  const { pessoa, slot } = input;
  const razao = input.razaoSocial ?? RAZAO_SOCIAL_PADRAO;
  const dataFmt = formatDataBrLonga(slot.data);
  const diaSemana = nomeDiaSemana(slot.data);
  const primeiroNome = pessoa.nome.split(/\s+/)[0] ?? pessoa.nome;

  return [
    `Olá, ${primeiroNome}, tudo bem?`,
    "",
    `Nos termos do seu contrato de trabalho intermitente, a ${razao} apresenta a seguinte convocação:`,
    "",
    `• Data: ${dataFmt} (${diaSemana})`,
    `• Horário: das ${slot.hora_inicio} às ${slot.hora_fim}`,
    `• Intervalo: ${slot.intervalo_min} min (não remunerado)`,
    `• Local: ${slot.local ?? LOCAL_PADRAO_ESCALA}`,
    `• Função: ${slot.funcao ?? rotuloFuncao(pessoa)}`,
    `• Valor-hora: R$ ${input.valor_hora.toFixed(2).replace(".", ",")}`,
    `• Horas brutas previstas: ${input.horas_brutas.toFixed(2).replace(".", ",")} h`,
    `• Horas pagas previstas: ${input.horas_pagas.toFixed(2).replace(".", ",")} h (brutas menos intervalo)`,
    `• Valor bruto estimado das horas: R$ ${input.valor_estimado.toFixed(2).replace(".", ",")}, acrescido das verbas proporcionais previstas em lei (13º, férias + 1/3 e DSR)`,
    "",
    `Você tem até 1 dia útil para responder "ACEITO" ou "NÃO ACEITO". A ausência de resposta será considerada recusa, e a recusa não gera nenhuma penalidade.`,
    "",
    "Esta mensagem integra o registro do contrato de trabalho intermitente.",
  ].join("\n");
}

export function criarConvocacaoParaSlot(
  db: DB,
  slotId: string,
  opcoes: { id?: string; agora?: string; valorHora?: number } = {}
): ResultadoEscala {
  const slot = db.escala_slots.find((s) => s.id === slotId);
  if (!slot) return { sucesso: false, erros: ["Plantão não encontrado."], avisos: [] };
  const pessoa = db.pessoas.find((p) => p.id === slot.pessoa_id);
  if (!pessoa) return { sucesso: false, erros: ["Pessoa não encontrada."], avisos: [] };

  const horas = calcularHorasPagas(slot.hora_inicio, slot.hora_fim, slot.intervalo_min);
  if ("erro" in horas) return { sucesso: false, erros: [horas.erro], avisos: [] };

  const agora = opcoes.agora ?? new Date().toISOString();
  const valor_hora = opcoes.valorHora ?? pessoa.valor_hora ?? 0;
  if (!valor_hora || valor_hora <= 0) {
    return { sucesso: false, erros: ["Informe o valor-hora no cadastro da pessoa."], avisos: [] };
  }

  const valor_estimado = Number((horas.horas_pagas * valor_hora).toFixed(2));
  const antecedencia_ok = antecedenciaMinimaOk(agora.slice(0, 10), slot.data);
  const avisos: string[] = [];
  if (!antecedencia_ok) {
    avisos.push(
      `Atenção: antecedência menor que ${ANTECEDENCIA_MINIMA_DIAS} dias corridos (exigência do contrato intermitente).`
    );
  }

  const texto_mensagem = montarTextoConvocacaoWhatsApp({
    pessoa,
    slot,
    valor_hora,
    horas_brutas: horas.horas_brutas,
    horas_pagas: horas.horas_pagas,
    valor_estimado,
  });

  if (!Array.isArray(db.convocacoes)) db.convocacoes = [];
  const convocacao: ConvocacaoIntermitente = {
    id: opcoes.id ?? `conv-${Date.now()}`,
    escala_slot_id: slot.id,
    pessoa_id: pessoa.id,
    convocada_em: agora,
    status: "rascunho",
    texto_mensagem,
    valor_hora,
    horas_brutas: horas.horas_brutas,
    horas_pagas: horas.horas_pagas,
    valor_estimado,
    antecedencia_ok,
    criado_em: agora,
    atualizado_em: agora,
  };
  db.convocacoes.push(convocacao);
  return { sucesso: true, slot, convocacao, erros: [], avisos };
}

export function marcarConvocacaoEnviada(db: DB, convocacaoId: string, agora = new Date().toISOString()): ResultadoEscala {
  const convocacao = db.convocacoes.find((c) => c.id === convocacaoId);
  if (!convocacao) return { sucesso: false, erros: ["Convocação não encontrada."], avisos: [] };
  if (convocacao.status !== "rascunho" && convocacao.status !== "enviada") {
    return { sucesso: false, erros: ["Só é possível marcar envio em rascunho/enviada."], avisos: [] };
  }
  convocacao.status = "enviada";
  convocacao.atualizado_em = agora;
  return { sucesso: true, convocacao, erros: [], avisos: [] };
}

export function registrarRespostaConvocacao(
  db: DB,
  convocacaoId: string,
  status: Extract<StatusConvocacao, "aceita" | "recusada" | "silencio">,
  agora = new Date().toISOString()
): ResultadoEscala {
  const convocacao = db.convocacoes.find((c) => c.id === convocacaoId);
  if (!convocacao) return { sucesso: false, erros: ["Convocação não encontrada."], avisos: [] };
  if (convocacao.status === "rascunho") {
    return { sucesso: false, erros: ["Marque a convocação como enviada antes de registrar a resposta."], avisos: [] };
  }
  convocacao.status = status;
  convocacao.respondida_em = agora;
  convocacao.atualizado_em = agora;

  if (status !== "aceita") {
    return { sucesso: true, convocacao, erros: [], avisos: [] };
  }

  const pagamentoResultado = criarPagamentoDaConvocacaoAceita(db, convocacaoId, { agora });
  return {
    sucesso: pagamentoResultado.sucesso,
    convocacao,
    pagamento: pagamentoResultado.pagamento,
    erros: pagamentoResultado.erros,
    avisos: pagamentoResultado.avisos,
  };
}

export function pagamentoDaConvocacao(db: DB, convocacaoId: string): PagamentoPessoa | undefined {
  return (db.pagamentos_pessoas ?? []).find((p) => p.convocacao_id === convocacaoId);
}

function tipoPagamentoPorPessoa(tipo: TipoPessoaRH): TipoPagamentoPessoa {
  return tipo === "entregador" ? "freela_hora" : "intermitente_periodo";
}

/** Cria PagamentoPessoa previsto a partir de convocação aceita (sem duplicar). */
export function criarPagamentoDaConvocacaoAceita(
  db: DB,
  convocacaoId: string,
  opcoes: { agora?: string; id?: string } = {}
): ResultadoEscala {
  const convocacao = db.convocacoes.find((c) => c.id === convocacaoId);
  if (!convocacao) return { sucesso: false, erros: ["Convocação não encontrada."], avisos: [] };
  if (convocacao.status !== "aceita") {
    return { sucesso: false, erros: ["Só é possível gerar pagamento de convocação aceita."], avisos: [] };
  }

  const existente = pagamentoDaConvocacao(db, convocacaoId);
  if (existente) {
    return { sucesso: true, convocacao, pagamento: existente, erros: [], avisos: ["Pagamento já existia para esta convocação."] };
  }

  const slot = db.escala_slots.find((s) => s.id === convocacao.escala_slot_id);
  if (!slot) return { sucesso: false, erros: ["Plantão da convocação não encontrado."], avisos: [] };
  const pessoa = db.pessoas.find((p) => p.id === convocacao.pessoa_id);
  if (!pessoa) return { sucesso: false, erros: ["Pessoa não encontrada."], avisos: [] };

  const agora = opcoes.agora ?? new Date().toISOString();
  if (!Array.isArray(db.pagamentos_pessoas)) db.pagamentos_pessoas = [];

  const dataBr = formatDataBrLonga(slot.data);
  const pagamento: PagamentoPessoa = {
    id: opcoes.id ?? `pagp-conv-${Date.now()}`,
    pessoa_id: convocacao.pessoa_id,
    tipo: tipoPagamentoPorPessoa(pessoa.tipo),
    descricao: `Período ${dataBr} ${slot.hora_inicio}–${slot.hora_fim} (convocação aceita)`,
    competencia: slot.data.slice(0, 7),
    vencimento: slot.data,
    valor: convocacao.valor_estimado,
    valor_bruto: convocacao.valor_estimado,
    horas: convocacao.horas_pagas,
    valor_hora: convocacao.valor_hora,
    convocacao_id: convocacao.id,
    status: "previsto",
    criado_em: agora,
    atualizado_em: agora,
  };
  db.pagamentos_pessoas.push(pagamento);

  const descontos = aplicarDescontosNoPagamento(db, pagamento.id);
  if (!descontos.sucesso) {
    return {
      sucesso: false,
      convocacao,
      pagamento,
      erros: descontos.erros,
      avisos: [],
    };
  }

  return {
    sucesso: true,
    convocacao,
    pagamento: descontos.pagamento ?? pagamento,
    erros: [],
    avisos: [],
  };
}

export function convocacaoDoSlot(db: DB, slotId: string): ConvocacaoIntermitente | undefined {
  return (db.convocacoes ?? []).find((c) => c.escala_slot_id === slotId);
}

export function slotsNaJanela(db: DB, dias: string[]): EscalaSlot[] {
  const set = new Set(dias);
  return (db.escala_slots ?? [])
    .filter((s) => set.has(s.data))
    .sort((a, b) => a.data.localeCompare(b.data) || a.hora_inicio.localeCompare(b.hora_inicio));
}

/** Padrões de escala CLT (ciclo rolante ou calendário). */
export type PadraoEscalaClt = "6x1" | "5x2" | "4x2" | "12x36" | "seg_sex";

export const PADROES_ESCALA_CLT: Array<{ id: PadraoEscalaClt; rotulo: string; descricao: string }> = [
  { id: "6x1", rotulo: "6x1", descricao: "6 dias trabalho · 1 folga (ciclo)" },
  { id: "5x2", rotulo: "5x2", descricao: "5 dias trabalho · 2 folgas (ciclo)" },
  { id: "4x2", rotulo: "4x2", descricao: "4 dias trabalho · 2 folgas (ciclo)" },
  { id: "12x36", rotulo: "12x36", descricao: "Trabalha um dia, folga o seguinte (alternado)" },
  { id: "seg_sex", rotulo: "Seg–sex", descricao: "Segunda a sexta no calendário" },
];

export function rotuloPadraoEscalaClt(padrao: PadraoEscalaClt): string {
  return PADROES_ESCALA_CLT.find((p) => p.id === padrao)?.rotulo ?? padrao;
}

function diasTrabalhaNoCiclo(padrao: Exclude<PadraoEscalaClt, "seg_sex" | "12x36">): { trabalho: number; ciclo: number } {
  switch (padrao) {
    case "6x1":
      return { trabalho: 6, ciclo: 7 };
    case "5x2":
      return { trabalho: 5, ciclo: 7 };
    case "4x2":
      return { trabalho: 4, ciclo: 6 };
  }
}

/**
 * Datas de trabalho na janela, a partir de `inicioJanela`.
 * `referenciaCiclo` = dia 0 do ciclo (primeiro dia de trabalho do padrão rolante).
 */
export function datasTrabalhoPadraoClt(
  padrao: PadraoEscalaClt,
  inicioJanela: string,
  referenciaCiclo: string = inicioJanela,
  quantidadeDias = 28
): string[] {
  const janela = janela28Dias(inicioJanela).slice(0, quantidadeDias);
  const ref = parseDataLocal(referenciaCiclo);

  return janela.filter((data) => {
    const d = parseDataLocal(data);
    if (padrao === "seg_sex") {
      const dia = d.getDay(); // 0=dom ... 6=sab
      return dia >= 1 && dia <= 5;
    }
    if (padrao === "12x36") {
      const diff = Math.floor((d.getTime() - ref.getTime()) / (24 * 60 * 60 * 1000));
      const idx = ((diff % 2) + 2) % 2;
      return idx === 0;
    }
    const { trabalho, ciclo } = diasTrabalhaNoCiclo(padrao);
    const diff = Math.floor((d.getTime() - ref.getTime()) / (24 * 60 * 60 * 1000));
    const idx = ((diff % ciclo) + ciclo) % ciclo;
    return idx < trabalho;
  });
}

export interface DadosGerarEscalaPadrao {
  pessoa_id: string;
  padrao: PadraoEscalaClt;
  hora_inicio: string;
  hora_fim: string;
  intervalo_min: number;
  funcao?: string;
  local?: string;
  /** Início da janela (padrão: hoje). */
  inicio_janela?: string;
  /** Dia 0 do ciclo (padrão: igual à janela). */
  referencia_ciclo?: string;
  /** Se já existir plantão da pessoa na data, pula. */
  pular_existentes?: boolean;
}

export interface ResultadoGerarEscalaPadrao {
  sucesso: boolean;
  criados: number;
  pulados: number;
  datas: string[];
  erros: string[];
  avisos: string[];
}

export function gerarEscalaPadraoClt(
  db: DB,
  dados: DadosGerarEscalaPadrao,
  opcoes: { agora?: string; idFactory?: () => string } = {}
): ResultadoGerarEscalaPadrao {
  const pessoa = db.pessoas.find((p) => p.id === dados.pessoa_id);
  if (!pessoa) return { sucesso: false, criados: 0, pulados: 0, datas: [], erros: ["Pessoa não encontrada."], avisos: [] };
  if (pessoa.tipo !== "colaborador") {
    return {
      sucesso: false,
      criados: 0,
      pulados: 0,
      datas: [],
      erros: ["Padrão CLT é só para colaborador. Intermitente usa convocação."],
      avisos: [],
    };
  }

  const horas = calcularHorasPagas(dados.hora_inicio, dados.hora_fim, dados.intervalo_min);
  if ("erro" in horas) {
    return { sucesso: false, criados: 0, pulados: 0, datas: [], erros: [horas.erro], avisos: [] };
  }

  const inicio = dados.inicio_janela ?? formatDataLocal(new Date());
  const referencia = dados.referencia_ciclo ?? inicio;
  const datas = datasTrabalhoPadraoClt(dados.padrao, inicio, referencia, 28);
  const pular = dados.pular_existentes !== false;
  const agora = opcoes.agora ?? new Date().toISOString();
  let criados = 0;
  let pulados = 0;
  const avisos: string[] = [];

  for (const data of datas) {
    const jaExiste = (db.escala_slots ?? []).some((s) => s.pessoa_id === dados.pessoa_id && s.data === data);
    if (jaExiste && pular) {
      pulados += 1;
      continue;
    }
    const r = criarSlot(
      db,
      {
        pessoa_id: dados.pessoa_id,
        data,
        hora_inicio: dados.hora_inicio,
        hora_fim: dados.hora_fim,
        intervalo_min: dados.intervalo_min,
        funcao: dados.funcao,
        local: dados.local,
        observacao: `Padrão ${rotuloPadraoEscalaClt(dados.padrao)}`,
      },
      {
        id: opcoes.idFactory?.() ?? `esc-pad-${data}-${dados.pessoa_id}`,
        agora,
        criarConvocacao: false,
      }
    );
    if (!r.sucesso) {
      return {
        sucesso: false,
        criados,
        pulados,
        datas,
        erros: r.erros,
        avisos: [...avisos, ...r.avisos],
      };
    }
    criados += 1;
  }

  if (pulados > 0) {
    avisos.push(`${pulados} dia(s) já tinham plantão e foram pulados.`);
  }

  return { sucesso: true, criados, pulados, datas, erros: [], avisos };
}
