import type { ConfigRh, DB, NormaRh, ParametroNormaRh } from "../types";

/** Fallback alinhado ao padrão atual da escala (3 dias corridos). */
export const ANTECEDENCIA_MINIMA_PADRAO = 3;

/** Publicações simuladas (demo). Em produção viriam de DOU/eSocial via job diário. */
export type PublicacaoNormaCatalogo = {
  chave_fonte: string;
  titulo: string;
  resumo: string;
  fonte: string;
  url_fonte?: string;
  publicado_em: string;
  vigencia_em?: string;
  relevancia: NormaRh["relevancia"];
  parametro?: ParametroNormaRh;
  valor_proposto?: number | string;
};

/**
 * Catálogo demo de alterações relevantes ao RH do restaurante.
 * A verificação só inclui itens ainda não presentes (por chave_fonte).
 */
export const CATALOGO_PUBLICACOES_RH: PublicacaoNormaCatalogo[] = [
  {
    chave_fonte: "demo-esocial-intermitente-2026-08",
    titulo: "eSocial — reforço sobre registro de contrato intermitente",
    resumo:
      "Orientações sobre marcar contrato assinado e eSocial antes da primeira convocação. Não altera prazo de antecedência; serve como lembrete operacional.",
    fonte: "eSocial (demo)",
    url_fonte: "https://www.gov.br/esocial",
    publicado_em: "2026-08-01",
    vigencia_em: "2026-08-01",
    relevancia: "media",
  },
  {
    chave_fonte: "demo-dou-antecedencia-intermitente-4d",
    titulo: "Proposta demo — antecedência mínima de convocação intermitente",
    resumo:
      "Simulação de alteração normativa: antecedência mínima de 3 para 4 dias corridos entre a convocação e o dia do serviço. Só entra em vigor no sistema se você confirmar.",
    fonte: "DOU (demo)",
    url_fonte: "https://www.in.gov.br/leiturajornal",
    publicado_em: "2026-08-02",
    vigencia_em: "2026-09-01",
    relevancia: "alta",
    parametro: "antecedencia_minima_dias",
    valor_proposto: 4,
  },
];

export function configRhPadrao(agora = new Date().toISOString()): ConfigRh {
  return {
    antecedencia_minima_dias: ANTECEDENCIA_MINIMA_PADRAO,
    aviso_ponto_horas: 24,
    tolerancia_atraso_minutos: 10,
    atualizado_em: agora,
  };
}

export function garantirConfigRh(db: DB, agora = new Date().toISOString()): ConfigRh {
  if (!db.config_rh) {
    db.config_rh = configRhPadrao(agora);
  }
  if (
    !Number.isFinite(db.config_rh.antecedencia_minima_dias) ||
    db.config_rh.antecedencia_minima_dias < 0
  ) {
    db.config_rh.antecedencia_minima_dias = ANTECEDENCIA_MINIMA_PADRAO;
    db.config_rh.atualizado_em = agora;
  }
  if (
    !Number.isFinite(db.config_rh.aviso_ponto_horas) ||
    db.config_rh.aviso_ponto_horas < 1
  ) {
    db.config_rh.aviso_ponto_horas = 24;
    db.config_rh.atualizado_em = agora;
  }
  if (
    !Number.isFinite(db.config_rh.tolerancia_atraso_minutos) ||
    db.config_rh.tolerancia_atraso_minutos < 0
  ) {
    db.config_rh.tolerancia_atraso_minutos = 10;
    db.config_rh.atualizado_em = agora;
  }
  return db.config_rh;
}

/** Dias mínimos vigentes (config confirmada ou padrão 3). */
export function antecedenciaMinimaDoDb(db: Pick<DB, "config_rh"> | null | undefined): number {
  const n = db?.config_rh?.antecedencia_minima_dias;
  if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
  return ANTECEDENCIA_MINIMA_PADRAO;
}

export function rotuloParametroNorma(parametro: ParametroNormaRh): string {
  switch (parametro) {
    case "antecedencia_minima_dias":
      return "Antecedência mínima (dias corridos)";
  }
}

export function rotuloStatusNorma(status: NormaRh["status"]): string {
  switch (status) {
    case "pendente":
      return "Pendente";
    case "aplicada":
      return "Aplicada";
    case "ignorada":
      return "Ignorada";
  }
}

export interface ResultadoVerificarNormas {
  sucesso: boolean;
  novas: NormaRh[];
  erros: string[];
}

/**
 * Simula a varredura diária: traz do catálogo só o que ainda não foi detectado.
 * Idempotente por chave_fonte.
 */
export function verificarAtualizacoesNormas(
  db: DB,
  opcoes: { agora?: string; idFactory?: () => string; catalogo?: PublicacaoNormaCatalogo[] } = {}
): ResultadoVerificarNormas {
  const agora = opcoes.agora ?? new Date().toISOString();
  garantirConfigRh(db, agora);
  if (!Array.isArray(db.normas_rh)) db.normas_rh = [];

  const catalogo = opcoes.catalogo ?? CATALOGO_PUBLICACOES_RH;
  const jaTem = new Set(db.normas_rh.map((n) => n.chave_fonte));
  const novas: NormaRh[] = [];

  for (const pub of catalogo) {
    if (jaTem.has(pub.chave_fonte)) continue;
    const valor_anterior =
      pub.parametro === "antecedencia_minima_dias"
        ? antecedenciaMinimaDoDb(db)
        : undefined;
    const norma: NormaRh = {
      id: opcoes.idFactory?.() ?? `norma-${Date.now()}-${novas.length}`,
      chave_fonte: pub.chave_fonte,
      titulo: pub.titulo,
      resumo: pub.resumo,
      fonte: pub.fonte,
      url_fonte: pub.url_fonte,
      publicado_em: pub.publicado_em,
      vigencia_em: pub.vigencia_em,
      relevancia: pub.relevancia,
      status: "pendente",
      parametro: pub.parametro,
      valor_proposto: pub.valor_proposto,
      valor_anterior,
      detectado_em: agora,
      criado_em: agora,
      atualizado_em: agora,
    };
    db.normas_rh.push(norma);
    novas.push(norma);
  }

  return { sucesso: true, novas, erros: [] };
}

export interface ResultadoRevisarNorma {
  sucesso: boolean;
  norma?: NormaRh;
  config?: ConfigRh;
  erros: string[];
}

function aplicarParametro(
  db: DB,
  parametro: ParametroNormaRh,
  valor: number | string | undefined,
  agora: string
): { ok: boolean; erros: string[] } {
  const config = garantirConfigRh(db, agora);
  if (parametro === "antecedencia_minima_dias") {
    const n = typeof valor === "number" ? valor : Number(valor);
    if (!Number.isFinite(n) || n < 0 || n > 30) {
      return { ok: false, erros: ["Valor de antecedência inválido (use 0–30 dias)."] };
    }
    config.antecedencia_minima_dias = Math.round(n);
    config.atualizado_em = agora;
    return { ok: true, erros: [] };
  }
  return { ok: false, erros: ["Parâmetro não suportado."] };
}

/** Confirma e, se houver parâmetro mapeado, aplica no config_rh. */
export function confirmarNorma(
  db: DB,
  normaId: string,
  opcoes: { agora?: string; revisado_por?: string } = {}
): ResultadoRevisarNorma {
  const agora = opcoes.agora ?? new Date().toISOString();
  if (!Array.isArray(db.normas_rh)) db.normas_rh = [];
  const norma = db.normas_rh.find((n) => n.id === normaId);
  if (!norma) return { sucesso: false, erros: ["Norma não encontrada."] };
  if (norma.status !== "pendente") {
    return { sucesso: false, erros: ["Só é possível confirmar norma pendente."], norma };
  }

  if (norma.parametro != null) {
    const aplicado = aplicarParametro(db, norma.parametro, norma.valor_proposto, agora);
    if (!aplicado.ok) return { sucesso: false, erros: aplicado.erros, norma };
  }

  norma.status = "aplicada";
  norma.revisado_em = agora;
  norma.revisado_por = opcoes.revisado_por;
  norma.atualizado_em = agora;
  return { sucesso: true, norma, config: garantirConfigRh(db, agora), erros: [] };
}

/** Marca como ignorada — não altera config_rh. */
export function ignorarNorma(
  db: DB,
  normaId: string,
  opcoes: { agora?: string; revisado_por?: string } = {}
): ResultadoRevisarNorma {
  const agora = opcoes.agora ?? new Date().toISOString();
  if (!Array.isArray(db.normas_rh)) db.normas_rh = [];
  const norma = db.normas_rh.find((n) => n.id === normaId);
  if (!norma) return { sucesso: false, erros: ["Norma não encontrada."] };
  if (norma.status !== "pendente") {
    return { sucesso: false, erros: ["Só é possível ignorar norma pendente."], norma };
  }
  norma.status = "ignorada";
  norma.revisado_em = agora;
  norma.revisado_por = opcoes.revisado_por;
  norma.atualizado_em = agora;
  return { sucesso: true, norma, config: db.config_rh, erros: [] };
}

export function normasPendentes(db: Pick<DB, "normas_rh">): NormaRh[] {
  return (db.normas_rh ?? []).filter((n) => n.status === "pendente");
}

function csvEscapeNorma(valor: string): string {
  if (/[;"\n\r]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

/**
 * CSV das normas (separador `;`, UTF-8 com BOM) para Excel/pt-BR.
 */
export function exportarNormasRhCsv(normas: NormaRh[]): string {
  const cabecalho = [
    "Título",
    "Fonte",
    "Status",
    "Relevância",
    "Publicado em",
    "Vigência",
    "Parâmetro",
    "Valor anterior",
    "Valor proposto",
    "Detectado em",
    "Revisado em",
    "Revisado por",
    "URL",
    "Resumo",
  ];
  const ordenadas = normas
    .slice()
    .sort((a, b) => b.detectado_em.localeCompare(a.detectado_em) || a.titulo.localeCompare(b.titulo, "pt-BR"));
  const linhas = ordenadas.map((n) =>
    [
      n.titulo,
      n.fonte,
      rotuloStatusNorma(n.status),
      n.relevancia,
      n.publicado_em ?? "",
      n.vigencia_em ?? "",
      n.parametro ? rotuloParametroNorma(n.parametro) : "",
      n.valor_anterior != null ? String(n.valor_anterior) : "",
      n.valor_proposto != null ? String(n.valor_proposto) : "",
      n.detectado_em,
      n.revisado_em ?? "",
      n.revisado_por ?? "",
      n.url_fonte ?? "",
      n.resumo,
    ]
      .map((c) => csvEscapeNorma(String(c)))
      .join(";")
  );
  return `\uFEFF${[cabecalho.join(";"), ...linhas].join("\r\n")}`;
}

/**
 * Confirma várias normas pendentes (aplica parâmetros mapeados).
 * Se `ids` for informado, só esses; senão, todas as pendentes.
 */
export function confirmarNormasPendentes(
  db: DB,
  ids?: string[],
  opcoes: { agora?: string; revisado_por?: string } = {}
): { sucesso: boolean; confirmadas: number; erros: string[] } {
  const alvoIds =
    ids && ids.length > 0
      ? ids
      : normasPendentes(db).map((n) => n.id);

  let confirmadas = 0;
  const erros: string[] = [];
  for (const id of alvoIds) {
    const r = confirmarNorma(db, id, opcoes);
    if (r.sucesso) confirmadas += 1;
    else erros.push(...r.erros.map((e) => `${id}: ${e}`));
  }
  return { sucesso: erros.length === 0, confirmadas, erros };
}

/**
 * Ignora várias normas pendentes (não altera config_rh).
 * Se `ids` for informado, só esses; senão, todas as pendentes.
 */
export function ignorarNormasPendentes(
  db: DB,
  ids?: string[],
  opcoes: { agora?: string; revisado_por?: string } = {}
): { sucesso: boolean; ignoradas: number; erros: string[] } {
  const alvoIds =
    ids && ids.length > 0
      ? ids
      : normasPendentes(db).map((n) => n.id);

  let ignoradas = 0;
  const erros: string[] = [];
  for (const id of alvoIds) {
    const r = ignorarNorma(db, id, opcoes);
    if (r.sucesso) ignoradas += 1;
    else erros.push(...r.erros.map((e) => `${id}: ${e}`));
  }
  return { sucesso: erros.length === 0, ignoradas, erros };
}
