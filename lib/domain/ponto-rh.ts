import type {
  BatidaPonto,
  ConfigRh,
  DB,
  OrigemBatidaPonto,
  PendenciaPonto,
  PessoaRH,
  StatusPendenciaPonto,
  TipoBatidaPonto,
  TipoFaltaPonto,
} from "../types";
import { somenteDigitosTelefone } from "./rh";

export const AVISO_PONTO_HORAS_PADRAO = 24;
export const TOLERANCIA_ATRASO_MINUTOS_PADRAO = 10;

export function configRhPadrao(agora = new Date().toISOString()): ConfigRh {
  return {
    antecedencia_minima_dias: 3,
    aviso_ponto_horas: AVISO_PONTO_HORAS_PADRAO,
    tolerancia_atraso_minutos: TOLERANCIA_ATRASO_MINUTOS_PADRAO,
    atualizado_em: agora,
  };
}

export function garantirConfigRh(db: DB, agora = new Date().toISOString()): ConfigRh {
  if (!db.config_rh) {
    db.config_rh = configRhPadrao(agora);
  }
  if (
    !Number.isFinite(db.config_rh.aviso_ponto_horas) ||
    db.config_rh.aviso_ponto_horas < 1
  ) {
    db.config_rh.aviso_ponto_horas = AVISO_PONTO_HORAS_PADRAO;
    db.config_rh.atualizado_em = agora;
  }
  if (
    !Number.isFinite(db.config_rh.antecedencia_minima_dias) ||
    db.config_rh.antecedencia_minima_dias < 0
  ) {
    db.config_rh.antecedencia_minima_dias = 3;
    db.config_rh.atualizado_em = agora;
  }
  if (
    !Number.isFinite(db.config_rh.tolerancia_atraso_minutos) ||
    db.config_rh.tolerancia_atraso_minutos < 0
  ) {
    db.config_rh.tolerancia_atraso_minutos = TOLERANCIA_ATRASO_MINUTOS_PADRAO;
    db.config_rh.atualizado_em = agora;
  }
  return db.config_rh;
}

export function avisoPontoHorasDoDb(db: Pick<DB, "config_rh"> | null | undefined): number {
  const n = db?.config_rh?.aviso_ponto_horas;
  if (typeof n === "number" && Number.isFinite(n) && n >= 1) return n;
  return AVISO_PONTO_HORAS_PADRAO;
}

export function toleranciaAtrasoMinutosDoDb(db: Pick<DB, "config_rh"> | null | undefined): number {
  const n = db?.config_rh?.tolerancia_atraso_minutos;
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return Math.floor(n);
  return TOLERANCIA_ATRASO_MINUTOS_PADRAO;
}

export function rotuloStatusPendenciaPonto(status: StatusPendenciaPonto): string {
  switch (status) {
    case "aguardando_aviso":
      return "Aguardando aviso";
    case "aguardando_funcionario":
      return "Aguardando funcionário";
    case "proposta":
      return "Proposta para confirmar";
    case "aprovada":
      return "Aprovada";
    case "recusada":
      return "Recusada";
    case "cancelada":
      return "Cancelada";
  }
}

export function rotuloTipoFaltaPonto(tipo: TipoFaltaPonto): string {
  switch (tipo) {
    case "entrada":
      return "Falta entrada";
    case "saida":
      return "Falta saída";
    case "ambos":
      return "Falta entrada e saída";
  }
}

function parseDataHoraLocal(data: string, hora: string): Date {
  const [y, m, d] = data.slice(0, 10).split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  return new Date(y!, (m ?? 1) - 1, d!, hh ?? 0, mm ?? 0, 0, 0);
}

function formatHora(hora: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!m) return hora;
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

function formatDataBr(data: string): string {
  const [y, m, d] = data.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Tem batida do tipo no dia (origem relógio/manual/aprovacao). */
export function temBatidaNoDia(
  batidas: BatidaPonto[],
  pessoaId: string,
  data: string,
  tipo: TipoBatidaPonto
): boolean {
  return batidas.some((b) => b.pessoa_id === pessoaId && b.data === data && b.tipo === tipo);
}

export function tipoFaltaDoSlot(
  batidas: BatidaPonto[],
  pessoaId: string,
  data: string
): TipoFaltaPonto | null {
  const temEntrada = temBatidaNoDia(batidas, pessoaId, data, "entrada");
  const temSaida = temBatidaNoDia(batidas, pessoaId, data, "saida");
  if (temEntrada && temSaida) return null;
  if (!temEntrada && !temSaida) return "ambos";
  if (!temEntrada) return "entrada";
  return "saida";
}

const STATUS_ABERTOS: StatusPendenciaPonto[] = [
  "aguardando_aviso",
  "aguardando_funcionario",
  "proposta",
];

export function pendenciaAbertaNoDia(
  pendencias: PendenciaPonto[],
  pessoaId: string,
  data: string
): PendenciaPonto | undefined {
  return pendencias.find(
    (p) => p.pessoa_id === pessoaId && p.data === data && STATUS_ABERTOS.includes(p.status)
  );
}

export interface ResultadoDetectarPonto {
  sucesso: boolean;
  criadas: PendenciaPonto[];
  canceladas: PendenciaPonto[];
  erros: string[];
}

/**
 * Cruza escala CLT × batidas. Após fim do plantão + N horas (padrão 24),
 * cria pendência se faltar digital. Cancela pendência aberta se as batidas aparecerem.
 */
export function detectarPendenciasPonto(
  db: DB,
  opcoes: { agora?: string; idFactory?: () => string } = {}
): ResultadoDetectarPonto {
  const agoraIso = opcoes.agora ?? new Date().toISOString();
  const agora = new Date(agoraIso);
  const config = garantirConfigRh(db, agoraIso);
  const horasAviso = config.aviso_ponto_horas;

  if (!Array.isArray(db.batidas_ponto)) db.batidas_ponto = [];
  if (!Array.isArray(db.pendencias_ponto)) db.pendencias_ponto = [];

  const criadas: PendenciaPonto[] = [];
  const canceladas: PendenciaPonto[] = [];
  const pessoas = new Map((db.pessoas ?? []).map((p) => [p.id, p]));

  for (const slot of db.escala_slots ?? []) {
    const pessoa = pessoas.get(slot.pessoa_id);
    if (!pessoa || pessoa.tipo !== "colaborador" || !pessoa.ativo) continue;

    const fimPlantao = parseDataHoraLocal(slot.data, slot.hora_fim);
    const limiteAviso = new Date(fimPlantao.getTime() + horasAviso * 60 * 60 * 1000);
    if (agora.getTime() < limiteAviso.getTime()) continue;

    const falta = tipoFaltaDoSlot(db.batidas_ponto, slot.pessoa_id, slot.data);
    const aberta = pendenciaAbertaNoDia(db.pendencias_ponto, slot.pessoa_id, slot.data);

    if (!falta) {
      if (aberta) {
        aberta.status = "cancelada";
        aberta.atualizado_em = agoraIso;
        canceladas.push(aberta);
      }
      continue;
    }

    if (aberta) {
      if (aberta.tipo_falta !== falta) {
        aberta.tipo_falta = falta;
        aberta.atualizado_em = agoraIso;
      }
      continue;
    }

    const pendencia: PendenciaPonto = {
      id: opcoes.idFactory?.() ?? `pend-ponto-${Date.now()}-${criadas.length}`,
      pessoa_id: slot.pessoa_id,
      escala_slot_id: slot.id,
      data: slot.data,
      tipo_falta: falta,
      horario_previsto_entrada: slot.hora_inicio,
      horario_previsto_saida: slot.hora_fim,
      status: "aguardando_aviso",
      criado_em: agoraIso,
      atualizado_em: agoraIso,
    };
    db.pendencias_ponto.push(pendencia);
    criadas.push(pendencia);
  }

  return { sucesso: true, criadas, canceladas, erros: [] };
}

export function montarTextoAvisoPontoWhatsApp(input: {
  pessoa: Pick<PessoaRH, "nome">;
  pendencia: PendenciaPonto;
  horasAviso?: number;
}): string {
  const primeiro = input.pessoa.nome.split(/\s+/)[0] ?? input.pessoa.nome;
  const horas = input.horasAviso ?? AVISO_PONTO_HORAS_PADRAO;
  const previsto =
    input.pendencia.horario_previsto_entrada && input.pendencia.horario_previsto_saida
      ? `${input.pendencia.horario_previsto_entrada}–${input.pendencia.horario_previsto_saida}`
      : "conforme escala";
  return [
    `Olá, ${primeiro}.`,
    "",
    `Não encontramos sua digital no relógio ponto do dia ${formatDataBr(input.pendencia.data)} (${rotuloTipoFaltaPonto(input.pendencia.tipo_falta).toLowerCase()}).`,
    `Plantão previsto: ${previsto}.`,
    "",
    `Já passaram cerca de ${horas}h do fim do expediente. Por favor, informe o horário real de entrada e/ou saída para o RH confirmar.`,
    "",
    "Responda neste WhatsApp, por exemplo:",
    "ENTRADA 11:05 SAÍDA 23:00 — esqueci de bater",
    "",
    "Só após a confirmação do gestor o horário entra no espelho de ponto.",
  ].join("\n");
}

export function linkWhatsAppPonto(telefone: string | undefined, texto: string): string | null {
  const digitos = somenteDigitosTelefone(telefone ?? "");
  if (!digitos) return null;
  const comDdi = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${comDdi}?text=${encodeURIComponent(texto)}`;
}

export interface ResultadoPendenciaPonto {
  sucesso: boolean;
  pendencia?: PendenciaPonto;
  batidas?: BatidaPonto[];
  erros: string[];
}

/** Marca aviso enviado e guarda o texto (após copiar / abrir WhatsApp). */
export function marcarAvisoPontoEnviado(
  db: DB,
  pendenciaId: string,
  opcoes: { agora?: string; texto?: string } = {}
): ResultadoPendenciaPonto {
  const agora = opcoes.agora ?? new Date().toISOString();
  if (!Array.isArray(db.pendencias_ponto)) db.pendencias_ponto = [];
  const pendencia = db.pendencias_ponto.find((p) => p.id === pendenciaId);
  if (!pendencia) return { sucesso: false, erros: ["Pendência não encontrada."] };
  if (pendencia.status !== "aguardando_aviso" && pendencia.status !== "aguardando_funcionario") {
    return { sucesso: false, erros: ["Só é possível marcar aviso em pendência aberta."], pendencia };
  }
  const pessoa = db.pessoas.find((p) => p.id === pendencia.pessoa_id);
  pendencia.texto_aviso =
    opcoes.texto ??
    (pessoa
      ? montarTextoAvisoPontoWhatsApp({
          pessoa,
          pendencia,
          horasAviso: avisoPontoHorasDoDb(db),
        })
      : pendencia.texto_aviso);
  pendencia.status = "aguardando_funcionario";
  pendencia.aviso_em = agora;
  pendencia.atualizado_em = agora;
  return { sucesso: true, pendencia, erros: [] };
}

/** Registra o horário informado pelo funcionário (ainda precisa de aprovação). */
export function registrarPropostaPonto(
  db: DB,
  pendenciaId: string,
  dados: { entrada?: string; saida?: string; motivo?: string },
  opcoes: { agora?: string } = {}
): ResultadoPendenciaPonto {
  const agora = opcoes.agora ?? new Date().toISOString();
  if (!Array.isArray(db.pendencias_ponto)) db.pendencias_ponto = [];
  const pendencia = db.pendencias_ponto.find((p) => p.id === pendenciaId);
  if (!pendencia) return { sucesso: false, erros: ["Pendência não encontrada."] };
  if (
    pendencia.status !== "aguardando_aviso" &&
    pendencia.status !== "aguardando_funcionario" &&
    pendencia.status !== "proposta"
  ) {
    return { sucesso: false, erros: ["Pendência já encerrada."], pendencia };
  }

  const erros: string[] = [];
  const precisaEntrada = pendencia.tipo_falta === "entrada" || pendencia.tipo_falta === "ambos";
  const precisaSaida = pendencia.tipo_falta === "saida" || pendencia.tipo_falta === "ambos";

  const entrada = dados.entrada?.trim() ? formatHora(dados.entrada.trim()) : undefined;
  const saida = dados.saida?.trim() ? formatHora(dados.saida.trim()) : undefined;

  if (precisaEntrada && !entrada) erros.push("Informe o horário de entrada proposto.");
  if (precisaSaida && !saida) erros.push("Informe o horário de saída proposto.");
  if (entrada && !/^\d{2}:\d{2}$/.test(entrada)) erros.push("Entrada inválida (use HH:MM).");
  if (saida && !/^\d{2}:\d{2}$/.test(saida)) erros.push("Saída inválida (use HH:MM).");
  if (erros.length) return { sucesso: false, erros, pendencia };

  pendencia.proposta_entrada = precisaEntrada ? entrada : pendencia.proposta_entrada;
  pendencia.proposta_saida = precisaSaida ? saida : pendencia.proposta_saida;
  pendencia.proposta_motivo = dados.motivo?.trim() || undefined;
  pendencia.proposta_em = agora;
  pendencia.status = "proposta";
  pendencia.atualizado_em = agora;
  return { sucesso: true, pendencia, erros: [] };
}

/** Gestor confirma: grava batidas no espelho (origem aprovacao). */
export function aprovarPendenciaPonto(
  db: DB,
  pendenciaId: string,
  opcoes: { agora?: string; revisado_por?: string; idFactory?: () => string } = {}
): ResultadoPendenciaPonto {
  const agora = opcoes.agora ?? new Date().toISOString();
  if (!Array.isArray(db.pendencias_ponto)) db.pendencias_ponto = [];
  if (!Array.isArray(db.batidas_ponto)) db.batidas_ponto = [];
  const pendencia = db.pendencias_ponto.find((p) => p.id === pendenciaId);
  if (!pendencia) return { sucesso: false, erros: ["Pendência não encontrada."] };
  if (pendencia.status !== "proposta") {
    return { sucesso: false, erros: ["Só é possível aprovar quando há proposta do funcionário."], pendencia };
  }

  const batidas: BatidaPonto[] = [];
  const mkId = () => opcoes.idFactory?.() ?? `bat-${Date.now()}-${batidas.length}`;

  if (
    (pendencia.tipo_falta === "entrada" || pendencia.tipo_falta === "ambos") &&
    pendencia.proposta_entrada &&
    !temBatidaNoDia(db.batidas_ponto, pendencia.pessoa_id, pendencia.data, "entrada")
  ) {
    const b: BatidaPonto = {
      id: mkId(),
      pessoa_id: pendencia.pessoa_id,
      data: pendencia.data,
      hora: pendencia.proposta_entrada,
      tipo: "entrada",
      origem: "aprovacao",
      pendencia_id: pendencia.id,
      criado_em: agora,
      atualizado_em: agora,
    };
    db.batidas_ponto.push(b);
    batidas.push(b);
  }

  if (
    (pendencia.tipo_falta === "saida" || pendencia.tipo_falta === "ambos") &&
    pendencia.proposta_saida &&
    !temBatidaNoDia(db.batidas_ponto, pendencia.pessoa_id, pendencia.data, "saida")
  ) {
    const b: BatidaPonto = {
      id: mkId(),
      pessoa_id: pendencia.pessoa_id,
      data: pendencia.data,
      hora: pendencia.proposta_saida,
      tipo: "saida",
      origem: "aprovacao",
      pendencia_id: pendencia.id,
      criado_em: agora,
      atualizado_em: agora,
    };
    db.batidas_ponto.push(b);
    batidas.push(b);
  }

  pendencia.status = "aprovada";
  pendencia.revisado_em = agora;
  pendencia.revisado_por = opcoes.revisado_por;
  pendencia.atualizado_em = agora;
  return { sucesso: true, pendencia, batidas, erros: [] };
}

export function recusarPendenciaPonto(
  db: DB,
  pendenciaId: string,
  opcoes: { agora?: string; revisado_por?: string } = {}
): ResultadoPendenciaPonto {
  const agora = opcoes.agora ?? new Date().toISOString();
  if (!Array.isArray(db.pendencias_ponto)) db.pendencias_ponto = [];
  const pendencia = db.pendencias_ponto.find((p) => p.id === pendenciaId);
  if (!pendencia) return { sucesso: false, erros: ["Pendência não encontrada."] };
  if (!STATUS_ABERTOS.includes(pendencia.status) && pendencia.status !== "proposta") {
    return { sucesso: false, erros: ["Pendência já encerrada."], pendencia };
  }
  // proposta is in STATUS_ABERTOS? No - I didn't include proposta in STATUS_ABERTOS wait I did include proposta
  pendencia.status = "recusada";
  pendencia.revisado_em = agora;
  pendencia.revisado_por = opcoes.revisado_por;
  pendencia.atualizado_em = agora;
  return { sucesso: true, pendencia, erros: [] };
}

/** Importa batidas do relógio (demo / futuro AFD). Idempotente por pessoa+data+tipo+hora. */
export function importarBatidasPonto(
  db: DB,
  batidas: Array<{
    pessoa_id: string;
    data: string;
    hora: string;
    tipo: TipoBatidaPonto;
  }>,
  opcoes: { agora?: string; idFactory?: () => string } = {}
): { sucesso: boolean; importadas: number; erros: string[] } {
  const agora = opcoes.agora ?? new Date().toISOString();
  if (!Array.isArray(db.batidas_ponto)) db.batidas_ponto = [];
  let importadas = 0;
  for (const raw of batidas) {
    const hora = formatHora(raw.hora);
    const existe = db.batidas_ponto.some(
      (b) =>
        b.pessoa_id === raw.pessoa_id &&
        b.data === raw.data &&
        b.tipo === raw.tipo &&
        b.hora === hora
    );
    if (existe) continue;
    db.batidas_ponto.push({
      id: opcoes.idFactory?.() ?? `bat-${Date.now()}-${importadas}`,
      pessoa_id: raw.pessoa_id,
      data: raw.data,
      hora,
      tipo: raw.tipo,
      origem: "relogio",
      criado_em: agora,
      atualizado_em: agora,
    });
    importadas += 1;
  }
  return { sucesso: true, importadas, erros: [] };
}

export function pendenciasPontoAbertas(db: Pick<DB, "pendencias_ponto">): PendenciaPonto[] {
  return (db.pendencias_ponto ?? []).filter((p) => STATUS_ABERTOS.includes(p.status));
}

export function rotuloTipoBatidaPonto(tipo: TipoBatidaPonto): string {
  switch (tipo) {
    case "entrada":
      return "Entrada";
    case "saida":
      return "Saída";
    case "intervalo_inicio":
      return "Início intervalo";
    case "intervalo_fim":
      return "Fim intervalo";
    default:
      return tipo;
  }
}

export function rotuloOrigemBatidaPonto(origem: OrigemBatidaPonto): string {
  switch (origem) {
    case "relogio":
      return "Relógio";
    case "aprovacao":
      return "Aprovado (pendência)";
    case "manual":
      return "Manual";
    default:
      return origem;
  }
}

/** YYYY-MM a partir de Date (fuso local). */
export function competenciaDeData(data = new Date()): string {
  const y = data.getFullYear();
  const m = String(data.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export interface DiaEspelhoPonto {
  pessoa_id: string;
  data: string;
  /** Previsto pela escala (se houver plantão no dia). */
  previsto_entrada?: string;
  previsto_saida?: string;
  entrada?: string;
  saida?: string;
  intervalo_inicio?: string;
  intervalo_fim?: string;
  batidas: BatidaPonto[];
  status: StatusDiaEspelho;
  /** Minutos de atraso na entrada (só se positivo). */
  atraso_entrada_min?: number;
  /** Minutos de saída antecipada (só se positivo). */
  saida_antecipada_min?: number;
  /** Duração prevista (escala), em minutos. */
  previsto_minutos?: number;
  /** Duração realizada (entrada→saída), em minutos. */
  realizado_minutos?: number;
}

export type StatusDiaEspelho =
  | "ok"
  | "atraso"
  | "incompleto"
  | "sem_batida"
  | "sem_escala";

export function rotuloStatusDiaEspelho(status: StatusDiaEspelho): string {
  switch (status) {
    case "ok":
      return "OK";
    case "atraso":
      return "Atraso";
    case "incompleto":
      return "Incompleto";
    case "sem_batida":
      return "Sem digital";
    case "sem_escala":
      return "Sem escala";
    default:
      return status;
  }
}

/** Converte HH:MM em minutos desde 00:00. */
export function minutosDeHora(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Duração em minutos entre duas HH:MM.
 * Se a saída for menor que a entrada, assume plantão que vira a noite (+24h).
 */
export function duracaoMinutosEntreHoras(inicio?: string, fim?: string): number | undefined {
  if (!inicio || !fim) return undefined;
  const a = minutosDeHora(inicio);
  const b = minutosDeHora(fim);
  if (a == null || b == null) return undefined;
  let diff = b - a;
  if (diff < 0) diff += 24 * 60;
  return diff;
}

/** Ex.: 750 → "12:30"; 0 → "0:00". */
export function formatarDuracaoHoras(minutos: number | undefined | null): string {
  if (minutos == null || !Number.isFinite(minutos) || minutos < 0) return "—";
  const m = Math.round(minutos);
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}:${String(min).padStart(2, "0")}`;
}

function enriquecerDuracoes(
  dia: Omit<DiaEspelhoPonto, "status" | "atraso_entrada_min" | "saida_antecipada_min" | "previsto_minutos" | "realizado_minutos">
): Pick<DiaEspelhoPonto, "previsto_minutos" | "realizado_minutos"> {
  return {
    previsto_minutos: duracaoMinutosEntreHoras(dia.previsto_entrada, dia.previsto_saida),
    realizado_minutos: duracaoMinutosEntreHoras(dia.entrada, dia.saida),
  };
}

function classificarDiaEspelho(
  dia: Omit<DiaEspelhoPonto, "status" | "atraso_entrada_min" | "saida_antecipada_min">,
  toleranciaMinutos: number
): {
  status: StatusDiaEspelho;
  atraso_entrada_min?: number;
  saida_antecipada_min?: number;
} {
  const temEscala = Boolean(dia.previsto_entrada && dia.previsto_saida);
  const temEntrada = Boolean(dia.entrada);
  const temSaida = Boolean(dia.saida);
  const tolerancia = Math.max(0, Math.floor(toleranciaMinutos));

  if (!temEscala) {
    return { status: temEntrada || temSaida ? "sem_escala" : "sem_batida" };
  }
  if (!temEntrada && !temSaida) return { status: "sem_batida" };
  if (!temEntrada || !temSaida) return { status: "incompleto" };

  const prevE = minutosDeHora(dia.previsto_entrada!);
  const realE = minutosDeHora(dia.entrada!);
  const prevS = minutosDeHora(dia.previsto_saida!);
  const realS = minutosDeHora(dia.saida!);

  let atrasoBruto = 0;
  let antecipadaBruta = 0;
  if (prevE != null && realE != null && realE > prevE) atrasoBruto = realE - prevE;
  if (prevS != null && realS != null && realS < prevS) antecipadaBruta = prevS - realS;

  const atraso = atrasoBruto > tolerancia ? atrasoBruto : undefined;
  const antecipada = antecipadaBruta > tolerancia ? antecipadaBruta : undefined;

  if (atraso != null || antecipada != null) {
    return {
      status: "atraso",
      atraso_entrada_min: atraso,
      saida_antecipada_min: antecipada,
    };
  }
  return { status: "ok" };
}

/**
 * Espelho oficial: cruza escala (previsto) × batidas (realizado) no mês.
 * Inclui dias com plantão sem digital e dias com batida sem escala.
 */
export function montarEspelhoPonto(
  db: Pick<DB, "batidas_ponto" | "escala_slots" | "config_rh">,
  filtros: { competencia: string; pessoa_id?: string; tolerancia_atraso_minutos?: number } = {
    competencia: competenciaDeData(),
  }
): DiaEspelhoPonto[] {
  const prefixo = filtros.competencia.slice(0, 7);
  const tolerancia =
    filtros.tolerancia_atraso_minutos ?? toleranciaAtrasoMinutosDoDb(db);
  const mapa = new Map<string, Omit<DiaEspelhoPonto, "status" | "atraso_entrada_min" | "saida_antecipada_min">>();

  const garantir = (pessoaId: string, data: string) => {
    const chave = `${pessoaId}|${data}`;
    let dia = mapa.get(chave);
    if (!dia) {
      dia = { pessoa_id: pessoaId, data, batidas: [] };
      mapa.set(chave, dia);
    }
    return dia;
  };

  for (const slot of db.escala_slots ?? []) {
    if (!slot.data.startsWith(prefixo)) continue;
    if (filtros.pessoa_id && slot.pessoa_id !== filtros.pessoa_id) continue;
    const dia = garantir(slot.pessoa_id, slot.data);
    // Se houver mais de um plantão no dia, usa o primeiro início e o último fim.
    if (!dia.previsto_entrada || slot.hora_inicio < dia.previsto_entrada) {
      dia.previsto_entrada = slot.hora_inicio;
    }
    if (!dia.previsto_saida || slot.hora_fim > dia.previsto_saida) {
      dia.previsto_saida = slot.hora_fim;
    }
  }

  const lista = (db.batidas_ponto ?? [])
    .filter((b) => b.data.startsWith(prefixo))
    .filter((b) => !filtros.pessoa_id || b.pessoa_id === filtros.pessoa_id)
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora) || a.tipo.localeCompare(b.tipo));

  for (const b of lista) {
    const dia = garantir(b.pessoa_id, b.data);
    dia.batidas.push(b);
    if (b.tipo === "entrada" && !dia.entrada) dia.entrada = b.hora;
    if (b.tipo === "saida") dia.saida = b.hora;
    if (b.tipo === "intervalo_inicio" && !dia.intervalo_inicio) dia.intervalo_inicio = b.hora;
    if (b.tipo === "intervalo_fim") dia.intervalo_fim = b.hora;
  }

  return Array.from(mapa.values())
    .map((dia) => {
      const classif = classificarDiaEspelho(dia, tolerancia);
      const duracoes = enriquecerDuracoes(dia);
      return { ...dia, ...classif, ...duracoes };
    })
    .sort((a, b) => a.data.localeCompare(b.data) || a.pessoa_id.localeCompare(b.pessoa_id));
}

export interface ResumoEspelhoPonto {
  total: number;
  ok: number;
  atraso: number;
  incompleto: number;
  sem_batida: number;
  sem_escala: number;
  previsto_minutos: number;
  realizado_minutos: number;
}

export function resumirEspelhoPonto(dias: DiaEspelhoPonto[]): ResumoEspelhoPonto {
  const r: ResumoEspelhoPonto = {
    total: dias.length,
    ok: 0,
    atraso: 0,
    incompleto: 0,
    sem_batida: 0,
    sem_escala: 0,
    previsto_minutos: 0,
    realizado_minutos: 0,
  };
  for (const d of dias) {
    r[d.status] += 1;
    if (d.previsto_minutos != null) r.previsto_minutos += d.previsto_minutos;
    if (d.realizado_minutos != null) r.realizado_minutos += d.realizado_minutos;
  }
  return r;
}

function csvEscape(valor: string): string {
  if (/[;"\n\r]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

/**
 * CSV do espelho (separador `;`, UTF-8 com BOM) para Excel/pt-BR.
 * `nomePorId` resolve o nome da pessoa.
 */
export function exportarEspelhoCsv(
  dias: DiaEspelhoPonto[],
  nomePorId: (pessoaId: string) => string
): string {
  const cabecalho = [
    "Data",
    "Pessoa",
    "Previsto entrada",
    "Previsto saída",
    "Horas previstas",
    "Realizado entrada",
    "Realizado saída",
    "Horas realizadas",
    "Status",
    "Atraso entrada (min)",
    "Saída antecipada (min)",
    "Origem",
  ];
  const linhas = dias.map((d) => {
    const origens = Array.from(new Set(d.batidas.map((b) => rotuloOrigemBatidaPonto(b.origem)))).join(
      ", "
    );
    return [
      d.data,
      nomePorId(d.pessoa_id),
      d.previsto_entrada ?? "",
      d.previsto_saida ?? "",
      formatarDuracaoHoras(d.previsto_minutos) === "—" ? "" : formatarDuracaoHoras(d.previsto_minutos),
      d.entrada ?? "",
      d.saida ?? "",
      formatarDuracaoHoras(d.realizado_minutos) === "—" ? "" : formatarDuracaoHoras(d.realizado_minutos),
      rotuloStatusDiaEspelho(d.status),
      d.atraso_entrada_min != null ? String(d.atraso_entrada_min) : "",
      d.saida_antecipada_min != null ? String(d.saida_antecipada_min) : "",
      origens,
    ]
      .map((c) => csvEscape(c))
      .join(";");
  });
  return `\uFEFF${[cabecalho.join(";"), ...linhas].join("\r\n")}`;
}
