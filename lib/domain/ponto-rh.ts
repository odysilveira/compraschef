import type {
  BatidaPonto,
  ConfigRh,
  DB,
  PendenciaPonto,
  PessoaRH,
  StatusPendenciaPonto,
  TipoBatidaPonto,
  TipoFaltaPonto,
} from "../types";
import { somenteDigitosTelefone } from "./rh";

export const AVISO_PONTO_HORAS_PADRAO = 24;

export function configRhPadrao(agora = new Date().toISOString()): ConfigRh {
  return {
    antecedencia_minima_dias: 3,
    aviso_ponto_horas: AVISO_PONTO_HORAS_PADRAO,
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
  return db.config_rh;
}

export function avisoPontoHorasDoDb(db: Pick<DB, "config_rh"> | null | undefined): number {
  const n = db?.config_rh?.aviso_ponto_horas;
  if (typeof n === "number" && Number.isFinite(n) && n >= 1) return n;
  return AVISO_PONTO_HORAS_PADRAO;
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
