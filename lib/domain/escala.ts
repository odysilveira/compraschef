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
import {
  diasRestantesValidade,
  formatarDiasRestantesDocumento,
  garantirChecklistDocumentos,
  hojeIsoLocal,
  rotuloTipoDocumento,
  statusDocumento,
} from "./documentos-pessoa";
import { antecedenciaMinimaDoDb } from "./normas-rh";
import { rotuloFuncao } from "./rh";

export const ANTECEDENCIA_MINIMA_DIAS = 3;
export const LOCAL_PADRAO_ESCALA = "Vera Bela Restaurante";
export const RAZAO_SOCIAL_PADRAO = "Vera Bela Restaurante Ltda";

const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function pessoaPrecisaConvocacao(tipo: TipoPessoaRH): boolean {
  return tipo === "intermitente" || tipo === "entregador";
}

/** Setor operacional na escala de convocação (intermitente / motoboy). */
export type SetorConvocacaoEscala = "cozinha" | "balcao" | "salao" | "motoboy";

/** Inclui CLT no arraste do calendário (sem convocação WhatsApp). */
export type SetorArrastoEscala = SetorConvocacaoEscala | "clt";

/** Jornada típica 12x36 (12 h brutas, 1 h de intervalo). */
export const HORARIO_PADRAO_CLT_12X36 = {
  hora_inicio: "11:00",
  hora_fim: "23:00",
  intervalo_min: 60,
} as const;

export function rotuloSetorConvocacao(setor: SetorConvocacaoEscala): string {
  switch (setor) {
    case "cozinha":
      return "Cozinha";
    case "balcao":
      return "Balcão / Caixa";
    case "salao":
      return "Salão";
    case "motoboy":
      return "Motoboy";
  }
}

export function abrevSetorConvocacao(setor: SetorConvocacaoEscala): string {
  switch (setor) {
    case "cozinha":
      return "Coz";
    case "balcao":
      return "Bal";
    case "salao":
      return "Sal";
    case "motoboy":
      return "Moto";
  }
}

function normalizarTextoSetor(valor: string): string {
  return valor
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Cozinha / balcão / salão a partir do texto da função (CLT ou intermitente). */
export function setorPorTextoFuncao(funcao?: string): Exclude<SetorConvocacaoEscala, "motoboy"> | null {
  const texto = normalizarTextoSetor(funcao ?? "");
  if (texto.includes("cozinha")) return "cozinha";
  if (texto.includes("balc") || texto.includes("caixa")) return "balcao";
  if (texto.includes("salao") || texto.includes("garcom") || texto.includes("garcon")) return "salao";
  return null;
}

/**
 * Classifica o plantão pelo tipo da pessoa + função do slot (ou da pessoa).
 * CLT de cozinha conta como cozinha; CLT de balcão/caixa conta como balcão.
 */
export function setorDoPlantao(
  slot: Pick<EscalaSlot, "funcao">,
  pessoa?: (Pick<PessoaRH, "tipo"> & Partial<Pick<PessoaRH, "funcao" | "funcao_custom">>) | null
): SetorConvocacaoEscala | null {
  if (pessoa?.tipo === "entregador") return "motoboy";
  const textoSlot = slot.funcao?.trim();
  const textoPessoa = pessoa?.funcao != null ? rotuloFuncao(pessoa as Pick<PessoaRH, "funcao" | "funcao_custom">) : "";
  return setorPorTextoFuncao(textoSlot || textoPessoa) ?? null;
}

/** Setor operacional da pessoa no cadastro (para preview ao arrastar CLT). */
export function setorOperacionalDaPessoa(
  pessoa: Pick<PessoaRH, "tipo"> & Partial<Pick<PessoaRH, "funcao" | "funcao_custom">>
): SetorConvocacaoEscala | null {
  if (pessoa.tipo === "entregador") return "motoboy";
  if (pessoa.funcao == null) return null;
  return setorPorTextoFuncao(rotuloFuncao(pessoa as Pick<PessoaRH, "funcao" | "funcao_custom">));
}

export type ResumoDiaEscala = {
  /** Intermitentes na cozinha (não CLT). */
  cozinha: number;
  /** Intermitentes no balcão/caixa (não CLT). */
  balcao: number;
  /** Intermitentes no salão (não CLT). */
  salao: number;
  motoboys: number;
  /** CLT com função cozinha. */
  clt_cozinha: number;
  /** CLT com função balcão/caixa. */
  clt_balcao: number;
  /** CLT com função salão. */
  clt_salao: number;
  /** CLT sem setor cozinha/balcão/salão (gerente, etc.). */
  clt_outros: number;
};

export function resumoSetoresDoDia(
  slots: EscalaSlot[],
  pessoas: Array<Pick<PessoaRH, "id" | "tipo"> & Partial<Pick<PessoaRH, "funcao" | "funcao_custom">>>
): ResumoDiaEscala {
  const porId = new Map(pessoas.map((p) => [p.id, p]));
  const resumo: ResumoDiaEscala = {
    motoboys: 0,
    cozinha: 0,
    balcao: 0,
    salao: 0,
    clt_cozinha: 0,
    clt_balcao: 0,
    clt_salao: 0,
    clt_outros: 0,
  };
  for (const slot of slots) {
    const pessoa = porId.get(slot.pessoa_id);
    const setor = setorDoPlantao(slot, pessoa);
    if (pessoa?.tipo === "colaborador") {
      if (setor === "cozinha") resumo.clt_cozinha += 1;
      else if (setor === "balcao") resumo.clt_balcao += 1;
      else if (setor === "salao") resumo.clt_salao += 1;
      else resumo.clt_outros += 1;
      continue;
    }
    if (setor === "motoboy") resumo.motoboys += 1;
    else if (setor === "cozinha") resumo.cozinha += 1;
    else if (setor === "balcao") resumo.balcao += 1;
    else if (setor === "salao") resumo.salao += 1;
  }
  return resumo;
}

/** Ex.: "CLT coz 2 · CLT balc 1 · CLT salão 1 · moto 1 · coz 1 · bal 2 · salão 1" */
export function textoResumoSetores(resumo: ResumoDiaEscala): string {
  const partes: string[] = [];
  if (resumo.clt_cozinha > 0) partes.push(`CLT coz ${resumo.clt_cozinha}`);
  if (resumo.clt_balcao > 0) partes.push(`CLT balc ${resumo.clt_balcao}`);
  if (resumo.clt_salao > 0) partes.push(`CLT salão ${resumo.clt_salao}`);
  if (resumo.clt_outros > 0) partes.push(`CLT ${resumo.clt_outros}`);
  if (resumo.motoboys > 0) partes.push(`${resumo.motoboys} moto`);
  if (resumo.cozinha > 0) partes.push(`${resumo.cozinha} coz`);
  if (resumo.balcao > 0) partes.push(`${resumo.balcao} bal`);
  if (resumo.salao > 0) partes.push(`${resumo.salao} salão`);
  return partes.join(" · ");
}

/**
 * Contrato escrito + eSocial antes da 1ª convocação (WhatsApp não substitui o contrato).
 * Bloqueia ASO vencido e, para entregador, CNH ausente/vencida.
 * Documentos a vencer geram avisos (não bloqueiam a convocação).
 */
export function validarPreRequisitosConvocacao(pessoa: PessoaRH): {
  ok: boolean;
  erros: string[];
  avisos: string[];
} {
  if (!pessoaPrecisaConvocacao(pessoa.tipo)) return { ok: true, erros: [], avisos: [] };
  const erros: string[] = [];
  const avisos: string[] = [];
  if (!pessoa.contrato_assinado) {
    erros.push(
      "Contrato intermitente ainda não marcado como assinado. O WhatsApp não substitui o contrato escrito (papel ou assinatura eletrônica)."
    );
  }
  if (!pessoa.esocial_ok) {
    erros.push("eSocial ainda não marcado como OK. Registre no eSocial antes do primeiro período.");
  }
  if (!pessoa.valor_hora || pessoa.valor_hora <= 0) {
    erros.push("Informe o valor-hora no cadastro da pessoa.");
  }

  const hoje = hojeIsoLocal();
  const docs = garantirChecklistDocumentos(pessoa);
  const aso = docs.find((d) => d.tipo === "aso");
  if (aso) {
    const statusAso = statusDocumento(aso, hoje);
    if (statusAso === "vencido") {
      erros.push("ASO vencido. Renove o exame antes de convocar.");
    } else if (statusAso === "a_vencer") {
      const extra = formatarDiasRestantesDocumento(diasRestantesValidade(aso.validade, hoje));
      avisos.push(
        `${rotuloTipoDocumento("aso")}${extra ? ` (${extra})` : " a vencer"}. Pode convocar, mas renove em breve.`
      );
    }
  }
  if (pessoa.tipo === "entregador") {
    const cnh = docs.find((d) => d.tipo === "cnh");
    const statusCnh = cnh ? statusDocumento(cnh, hoje) : "ausente";
    if (statusCnh === "ausente") {
      erros.push("CNH ausente no checklist. Anexe/marque a CNH do entregador antes de convocar.");
    } else if (statusCnh === "vencido") {
      erros.push("CNH vencida. Renove antes de convocar.");
    } else if (statusCnh === "a_vencer") {
      const extra = formatarDiasRestantesDocumento(diasRestantesValidade(cnh?.validade, hoje));
      avisos.push(
        `${rotuloTipoDocumento("cnh")}${extra ? ` (${extra})` : " a vencer"}. Pode convocar, mas renove em breve.`
      );
    }
  }

  return { ok: erros.length === 0, erros, avisos };
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

/**
 * Calendário da escala: do dia de hoje até o último dia do mês seguinte
 * (resto do mês corrente + mês seguinte inteiro).
 */
export function janelaCalendarioEscala(hoje: string | Date = new Date()): string[] {
  const base =
    typeof hoje === "string"
      ? parseDataLocal(hoje)
      : new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const fim = new Date(base.getFullYear(), base.getMonth() + 2, 0);
  const dias: string[] = [];
  const cursor = new Date(base);
  while (cursor.getTime() <= fim.getTime()) {
    dias.push(formatDataLocal(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

export function rotuloPeriodoJanela(dias: string[]): string {
  if (dias.length === 0) return "";
  return `${formatDataBrLonga(dias[0]!)} a ${formatDataBrLonga(dias[dias.length - 1]!)}`;
}

export function nomeMesAno(isoDate: string): string {
  const d = parseDataLocal(isoDate);
  const nome = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

/**
 * Monta semanas do calendário a partir da janela de dias.
 * `inicioSemana`: 0 = domingo, 1 = segunda (padrão BR).
 * Células fora da janela vêm como `null`.
 */
export function montarGradeCalendario(
  dias: string[],
  inicioSemana: 0 | 1 = 1
): Array<Array<string | null>> {
  if (dias.length === 0) return [];
  const primeiro = parseDataLocal(dias[0]!);
  const offset = (primeiro.getDay() - inicioSemana + 7) % 7;
  const celulas: Array<string | null> = [...Array.from({ length: offset }, () => null), ...dias];
  while (celulas.length % 7 !== 0) celulas.push(null);
  const semanas: Array<Array<string | null>> = [];
  for (let i = 0; i < celulas.length; i += 7) {
    semanas.push(celulas.slice(i, i + 7));
  }
  return semanas;
}

export function rotulosCabecalhoSemana(inicioSemana: 0 | 1 = 1): string[] {
  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  if (inicioSemana === 0) return labels;
  return [...labels.slice(1), labels[0]!];
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

  const deveConvocar = opcoes.criarConvocacao !== false && pessoa && pessoaPrecisaConvocacao(pessoa.tipo);
  if (deveConvocar && pessoa) {
    const gate = validarPreRequisitosConvocacao(pessoa);
    if (!gate.ok) erros.push(...gate.erros);
  }

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
  if (deveConvocar) {
    const r = criarConvocacaoParaSlot(db, slot.id, { agora, id: opcoes.convocacaoId });
    if (!r.sucesso) return { sucesso: false, erros: r.erros, avisos: r.avisos, slot };
    convocacao = r.convocacao;
    avisos.push(...r.avisos);
  }

  return { sucesso: true, slot, convocacao, erros: [], avisos };
}

/**
 * Move um plantão para outra data (arrastar no calendário).
 * Atualiza convocação/texto e pagamento previsto, se houver.
 */
export function moverSlotParaData(
  db: DB,
  slotId: string,
  novaData: string,
  opcoes: { agora?: string } = {}
): ResultadoEscala {
  const avisos: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novaData)) {
    return { sucesso: false, erros: ["Data inválida."], avisos };
  }

  const slot = (db.escala_slots ?? []).find((s) => s.id === slotId);
  if (!slot) return { sucesso: false, erros: ["Plantão não encontrado."], avisos };
  if (slot.data === novaData) {
    return { sucesso: true, slot, erros: [], avisos: [] };
  }

  const conflito = (db.escala_slots ?? []).some(
    (s) => s.id !== slotId && s.pessoa_id === slot.pessoa_id && s.data === novaData
  );
  if (conflito) {
    return { sucesso: false, erros: ["Já existe plantão desta pessoa neste dia."], avisos };
  }

  const convocacao = convocacaoDoSlot(db, slotId);
  const pagamento = convocacao ? pagamentoDaConvocacao(db, convocacao.id) : undefined;
  if (
    pagamento &&
    (pagamento.status === "pago" ||
      pagamento.status === "aguardando_conciliacao" ||
      pagamento.status === "liberado")
  ) {
    return {
      sucesso: false,
      erros: ["Não dá para mover: o pagamento deste período já foi informado ou pago."],
      avisos,
    };
  }

  const agora = opcoes.agora ?? new Date().toISOString();
  slot.data = novaData;
  slot.atualizado_em = agora;

  if (convocacao) {
    const pessoa = db.pessoas.find((p) => p.id === slot.pessoa_id);
    const horas = calcularHorasPagas(slot.hora_inicio, slot.hora_fim, slot.intervalo_min);
    if (pessoa && !("erro" in horas)) {
      convocacao.texto_mensagem = montarTextoConvocacaoWhatsApp({
        pessoa,
        slot,
        valor_hora: convocacao.valor_hora,
        horas_brutas: horas.horas_brutas,
        horas_pagas: horas.horas_pagas,
        valor_estimado: convocacao.valor_estimado,
      });
      convocacao.horas_brutas = horas.horas_brutas;
      convocacao.horas_pagas = horas.horas_pagas;
      convocacao.antecedencia_ok = antecedenciaMinimaOk(
        agora.slice(0, 10),
        novaData,
        antecedenciaMinimaDoDb(db)
      );
      convocacao.atualizado_em = agora;
      if (convocacao.status === "enviada" || convocacao.status === "aceita") {
        avisos.push("Data alterada. Se a convocação já foi enviada, avise a pessoa de novo pelo WhatsApp.");
      }
      if (!convocacao.antecedencia_ok) {
        avisos.push(
          `Atenção: antecedência menor que ${antecedenciaMinimaDoDb(db)} dias corridos (exigência do contrato intermitente).`
        );
      }
    }

    if (pagamento && pagamento.status === "previsto") {
      const dataBr = formatDataBrLonga(novaData);
      pagamento.vencimento = novaData;
      pagamento.competencia = novaData.slice(0, 7);
      pagamento.descricao = `Período ${dataBr} ${slot.hora_inicio}–${slot.hora_fim} (convocação aceita)`;
      pagamento.atualizado_em = agora;
    }
  }

  return { sucesso: true, slot, convocacao, pagamento, erros: [], avisos };
}

/**
 * Remove um plantão da escala.
 * Bloqueia se o pagamento já foi informado/pago (mesmas travas de mover).
 * Apaga convocação rascunho/enviada ligada; pagamento só `previsto` sai junto.
 */
export function excluirSlot(db: DB, slotId: string): ResultadoEscala {
  const avisos: string[] = [];
  const slot = (db.escala_slots ?? []).find((s) => s.id === slotId);
  if (!slot) return { sucesso: false, erros: ["Plantão não encontrado."], avisos };

  const convocacao = convocacaoDoSlot(db, slotId);
  const pagamento = convocacao ? pagamentoDaConvocacao(db, convocacao.id) : undefined;
  if (
    pagamento &&
    (pagamento.status === "pago" ||
      pagamento.status === "aguardando_conciliacao" ||
      pagamento.status === "liberado")
  ) {
    return {
      sucesso: false,
      erros: ["Não dá para excluir: o pagamento deste período já foi informado ou pago."],
      avisos,
    };
  }

  if (pagamento && pagamento.status === "previsto") {
    db.pagamentos_pessoas = (db.pagamentos_pessoas ?? []).filter((p) => p.id !== pagamento.id);
  }

  if (convocacao) {
    if (convocacao.status === "aceita") {
      avisos.push("Convocação aceita removida junto com o plantão.");
    } else if (convocacao.status === "enviada") {
      avisos.push("Convocação enviada removida — se a pessoa já recebeu o WhatsApp, avise que o período foi cancelado.");
    }
    db.convocacoes = (db.convocacoes ?? []).filter((c) => c.id !== convocacao.id);
  }

  db.escala_slots = (db.escala_slots ?? []).filter((s) => s.id !== slotId);
  return { sucesso: true, erros: [], avisos };
}

/** Monta link wa.me com texto da convocação (DDI 55). */
export function linkWhatsAppConvocacao(telefone: string | undefined, texto: string): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (!digitos) return null;
  const comDdi = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${comDdi}?text=${encodeURIComponent(texto)}`;
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

  const gate = validarPreRequisitosConvocacao(pessoa);
  if (!gate.ok) return { sucesso: false, erros: gate.erros, avisos: gate.avisos };

  const horas = calcularHorasPagas(slot.hora_inicio, slot.hora_fim, slot.intervalo_min);
  if ("erro" in horas) return { sucesso: false, erros: [horas.erro], avisos: gate.avisos };

  const agora = opcoes.agora ?? new Date().toISOString();
  const valor_hora = opcoes.valorHora ?? pessoa.valor_hora ?? 0;
  // valor_hora já validado no gate; mantém checagem defensiva
  if (!valor_hora || valor_hora <= 0) {
    return { sucesso: false, erros: ["Informe o valor-hora no cadastro da pessoa."], avisos: gate.avisos };
  }

  const valor_estimado = Number((horas.horas_pagas * valor_hora).toFixed(2));
  const minimoDias = antecedenciaMinimaDoDb(db);
  const antecedencia_ok = antecedenciaMinimaOk(agora.slice(0, 10), slot.data, minimoDias);
  const avisos: string[] = [...gate.avisos];
  if (!antecedencia_ok) {
    avisos.push(
      `Atenção: antecedência menor que ${minimoDias} dias corridos (exigência do contrato intermitente).`
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

/**
 * Marca várias convocações em rascunho como enviadas (ex.: após mandar os WhatsApps fora do app).
 * Se `ids` for informado, só esses; senão, todos os rascunhos do banco.
 */
export function marcarConvocacoesEnviadas(
  db: DB,
  ids?: string[],
  agora = new Date().toISOString()
): { sucesso: boolean; enviadas: number; erros: string[]; avisos: string[] } {
  const alvo =
    ids && ids.length > 0
      ? ids
      : (db.convocacoes ?? []).filter((c) => c.status === "rascunho").map((c) => c.id);

  const erros: string[] = [];
  const avisos: string[] = [];
  let enviadas = 0;

  for (const id of alvo) {
    const atual = db.convocacoes.find((c) => c.id === id);
    if (!atual) {
      erros.push(`${id}: convocação não encontrada.`);
      continue;
    }
    if (atual.status !== "rascunho") {
      erros.push(`${id}: só rascunhos entram no lote.`);
      continue;
    }
    const r = marcarConvocacaoEnviada(db, id, agora);
    if (r.sucesso) enviadas += 1;
    else erros.push(...r.erros.map((e) => `${id}: ${e}`));
    if (r.avisos.length) avisos.push(...r.avisos);
  }

  return { sucesso: erros.length === 0, enviadas, erros, avisos };
}

/** Convocação enviada cujo plantão já passou — ainda aguarda triagem (aceite/recusa/silêncio). */
export function convocacaoEnviadaSemRespostaVencida(
  status: StatusConvocacao,
  dataPlantao: string | undefined,
  hoje: string
): boolean {
  return status === "enviada" && Boolean(dataPlantao && /^\d{4}-\d{2}-\d{2}$/.test(dataPlantao) && dataPlantao < hoje);
}

/**
 * Marca como silêncio todas as convocações enviadas cujo plantão já passou.
 * Limpa a fila operacional sem abrir cada plantão.
 */
export function registrarSilencioConvocacoesVencidas(
  db: DB,
  hoje: string,
  agora = new Date().toISOString()
): { sucesso: boolean; atualizadas: number; erros: string[]; avisos: string[] } {
  const erros: string[] = [];
  const avisos: string[] = [];
  let atualizadas = 0;
  const ids = (db.convocacoes ?? [])
    .filter((c) => {
      if (c.status !== "enviada") return false;
      const slot = db.escala_slots.find((s) => s.id === c.escala_slot_id);
      return convocacaoEnviadaSemRespostaVencida(c.status, slot?.data, hoje);
    })
    .map((c) => c.id);

  for (const id of ids) {
    const r = registrarRespostaConvocacao(db, id, "silencio", agora);
    if (r.sucesso) atualizadas += 1;
    else erros.push(...r.erros);
    if (r.avisos.length) avisos.push(...r.avisos);
  }

  return { sucesso: erros.length === 0, atualizadas, erros, avisos };
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

/**
 * Registra aceita/recusada em várias convocações enviadas.
 * Se `ids` for informado, só esses; senão, todas as enviadas do banco.
 */
export function registrarRespostasConvocacoes(
  db: DB,
  ids: string[] | undefined,
  status: Extract<StatusConvocacao, "aceita" | "recusada">,
  agora = new Date().toISOString()
): {
  sucesso: boolean;
  atualizadas: number;
  pagamentosCriados: number;
  erros: string[];
  avisos: string[];
} {
  const alvo =
    ids && ids.length > 0
      ? ids
      : (db.convocacoes ?? []).filter((c) => c.status === "enviada").map((c) => c.id);

  const erros: string[] = [];
  const avisos: string[] = [];
  let atualizadas = 0;
  let pagamentosCriados = 0;

  for (const id of alvo) {
    const atual = db.convocacoes.find((c) => c.id === id);
    if (!atual) {
      erros.push(`${id}: convocação não encontrada.`);
      continue;
    }
    if (atual.status !== "enviada") {
      erros.push(`${id}: só convocações enviadas entram no lote.`);
      continue;
    }
    const r = registrarRespostaConvocacao(db, id, status, agora);
    if (r.sucesso) {
      atualizadas += 1;
      if (r.pagamento) pagamentosCriados += 1;
    } else {
      erros.push(...r.erros.map((e) => `${id}: ${e}`));
    }
    if (r.avisos.length) avisos.push(...r.avisos);
  }

  return { sucesso: erros.length === 0, atualizadas, pagamentosCriados, erros, avisos };
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

function csvEscapeEscala(valor: string): string {
  if (/[;"\n\r]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

/**
 * CSV dos plantões da janela (separador `;`, UTF-8 com BOM) para Excel/pt-BR.
 */
export function exportarEscalaCsv(
  slots: EscalaSlot[],
  opts: {
    nomePorId: (pessoaId: string) => string;
    tipoPorId?: (pessoaId: string) => string;
    statusConvocacaoPorSlotId?: (slotId: string) => string;
  }
): string {
  const cabecalho = [
    "Data",
    "Pessoa",
    "Tipo vínculo",
    "Função",
    "Local",
    "Início",
    "Fim",
    "Intervalo (min)",
    "Status convocação",
    "Observação",
  ];
  const ordenados = slots
    .slice()
    .sort(
      (a, b) =>
        a.data.localeCompare(b.data) ||
        a.hora_inicio.localeCompare(b.hora_inicio) ||
        opts.nomePorId(a.pessoa_id).localeCompare(opts.nomePorId(b.pessoa_id), "pt-BR")
    );
  const linhas = ordenados.map((s) =>
    [
      s.data,
      opts.nomePorId(s.pessoa_id),
      opts.tipoPorId?.(s.pessoa_id) ?? "",
      s.funcao ?? "",
      s.local ?? "",
      s.hora_inicio,
      s.hora_fim,
      String(s.intervalo_min ?? ""),
      opts.statusConvocacaoPorSlotId?.(s.id) ?? "",
      s.observacao ?? "",
    ]
      .map((c) => csvEscapeEscala(String(c)))
      .join(";")
  );
  return `\uFEFF${[cabecalho.join(";"), ...linhas].join("\r\n")}`;
}

/** Plantões de uma pessoa dentro da janela (ex.: próximos 28 dias). */
export function slotsDaPessoaNaJanela(db: DB, pessoaId: string, dias: string[]): EscalaSlot[] {
  return slotsNaJanela(db, dias).filter((s) => s.pessoa_id === pessoaId);
}

/**
 * CLT ativos sem nenhum plantão nas datas da janela — precisam de padrão (ex.: 12x36)
 * antes do ponto detectar faltas.
 */
export function listarCltSemPlantaoNaJanela(
  db: Pick<DB, "pessoas" | "escala_slots">,
  dias: string[]
): PessoaRH[] {
  const setDias = new Set(dias);
  const comPlantao = new Set(
    (db.escala_slots ?? []).filter((s) => setDias.has(s.data)).map((s) => s.pessoa_id)
  );
  return (db.pessoas ?? [])
    .filter((p) => p.ativo && p.tipo === "colaborador" && !comPlantao.has(p.id))
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Convocações em rascunho ligadas a plantões da janela (ainda não enviadas no WhatsApp). */
export function listarConvocacoesRascunhoNaJanela(
  db: Pick<DB, "convocacoes" | "escala_slots">,
  dias: string[]
): ConvocacaoIntermitente[] {
  const setDias = new Set(dias);
  const idsSlots = new Set(
    (db.escala_slots ?? []).filter((s) => setDias.has(s.data)).map((s) => s.id)
  );
  return (db.convocacoes ?? [])
    .filter((c) => c.status === "rascunho" && idsSlots.has(c.escala_slot_id))
    .slice()
    .sort((a, b) => {
      const sa = (db.escala_slots ?? []).find((s) => s.id === a.escala_slot_id);
      const sb = (db.escala_slots ?? []).find((s) => s.id === b.escala_slot_id);
      return (sa?.data ?? "").localeCompare(sb?.data ?? "") || a.id.localeCompare(b.id);
    });
}

/** Padrões de escala CLT (ciclo rolante ou calendário). */
export type PadraoEscalaClt = "6x1" | "5x2" | "4x2" | "12x36" | "seg_sex";

export const PADROES_ESCALA_CLT: Array<{ id: PadraoEscalaClt; rotulo: string; descricao: string }> = [
  { id: "12x36", rotulo: "12x36", descricao: "Trabalha um dia, folga o seguinte (mais comum no restaurante)" },
  { id: "6x1", rotulo: "6x1", descricao: "6 dias trabalho · 1 folga (ciclo)" },
  { id: "5x2", rotulo: "5x2", descricao: "5 dias trabalho · 2 folgas (ciclo)" },
  { id: "4x2", rotulo: "4x2", descricao: "4 dias trabalho · 2 folgas (ciclo)" },
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
  quantidadeDias?: number
): string[] {
  const janela =
    quantidadeDias != null
      ? janela28Dias(inicioJanela).slice(0, quantidadeDias)
      : janelaCalendarioEscala(inicioJanela);
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
  const datas = datasTrabalhoPadraoClt(dados.padrao, inicio, referencia);
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
