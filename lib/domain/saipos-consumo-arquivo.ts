import type {
  DivergenciaSaipos,
  FormatoExportSaipos,
  RelatorioItensVendidosSaipos,
  ResultadoConsolidadoSaipos,
} from "./saipos-itens-vendidos";
import { montarTabelas } from "./saipos-itens-vendidos";
import {
  abasVendasSaipos,
  agregarVendasSaipos,
  parseVendasSaipos,
  type VendasSaipos,
} from "./saipos-vendas";

export const SAIPOS_CONSUMO_ARQUIVO_STORAGE_KEY = "integracao-saipos:consumo-arquivo:v1";
/** Cópia do último estado válido — recupera se a chave principal sumir ou for apagada. */
export const SAIPOS_CONSUMO_ARQUIVO_BACKUP_KEY = "integracao-saipos:consumo-arquivo:v1:backup";

export type PeriodoSaiposIso = {
  inicio: string;
  fim: string;
  /** Texto de exibição, ex.: "01/10/2026 a 31/10/2026". */
  rotulo: string;
};

export type BaixaEstoqueArquivoSaipos = {
  aplicada_em: string;
  movimento_ids: string[];
  resumo: { produto_id: string; nome: string; quantidade_kg: number }[];
};

export type ArquivoConsumoSaipos = {
  id: string;
  /** Chave do calendário YYYY-MM. */
  mes_ref: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  periodo_rotulo: string | null;
  nome_arquivo: string;
  formato: FormatoExportSaipos;
  enviado_em: string;
  total_itens: number;
  total_opcoes: number;
  resultado: ResultadoConsolidadoSaipos;
  /** Ausente em arquivos antigos (só consumo teórico). */
  vendas?: VendasSaipos;
  /** Idempotência: baixa de acabados já aplicada neste mês. */
  baixa_estoque?: BaixaEstoqueArquivoSaipos;
};

export type SaiposConsumoArquivoState = {
  version: 1;
  arquivos: ArquivoConsumoSaipos[];
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

const MAPAS_NUMERICOS: (keyof ResultadoConsolidadoSaipos)[] = [
  "molhoMassa",
  "molhoTamanho",
  "massaTamanho",
  "risotos",
  "extrasPrato",
  "extras",
  "bebidas",
  "bebidasProduto",
  "sobremesas",
  "saches",
  "observacoes",
  "combos",
  "promocoes",
  "naoClassificado",
];

function storageBrowser(): StorageLike | null {
  try {
    if (typeof globalThis === "undefined") return null;
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (!ls || typeof ls.getItem !== "function" || typeof ls.setItem !== "function") return null;
    return ls;
  } catch {
    return null;
  }
}

function ddMmYyyyParaIso(valor: string): string | null {
  const m = valor.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const iso = `${yyyy}-${mm}-${dd}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = Number(dd);
  const mo = Number(mm);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return iso;
}

/** Converte texto "dd/mm/yyyy" ou "dd/mm/yyyy a dd/mm/yyyy" em ISO. */
export function parsePeriodoSaiposRotulo(periodo: string | null | undefined): PeriodoSaiposIso | null {
  if (!periodo?.trim()) return null;
  const partes = periodo
    .trim()
    .split(/\s+a\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length === 0) return null;
  const inicio = ddMmYyyyParaIso(partes[0]);
  if (!inicio) return null;
  const fim = partes[1] ? ddMmYyyyParaIso(partes[1]) : inicio;
  if (!fim) return null;
  const [a, b] = inicio <= fim ? [inicio, fim] : [fim, inicio];
  const rotulo =
    a === b
      ? isoParaDdMmYyyy(a)
      : `${isoParaDdMmYyyy(a)} a ${isoParaDdMmYyyy(b)}`;
  return { inicio: a, fim: b, rotulo };
}

export function isoParaDdMmYyyy(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Sugere YYYY-MM a partir do fim do período (ou início). */
export function mesRefDoPeriodo(periodo: PeriodoSaiposIso | null, fallback = new Date()): string {
  const base = periodo?.fim || periodo?.inicio;
  if (base && /^\d{4}-\d{2}/.test(base)) return base.slice(0, 7);
  const y = fallback.getFullYear();
  const m = String(fallback.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function mesRefValido(mesRef: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mesRef);
}

export function rotuloMesRef(mesRef: string): string {
  if (!mesRefValido(mesRef)) return mesRef;
  const [y, m] = mesRef.split("-");
  const nomes = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  return `${nomes[Number(m) - 1]} ${y}`;
}

export function resultadoConsolidadoVazio(): ResultadoConsolidadoSaipos {
  return {
    molhoMassa: {},
    molhoTamanho: {},
    massaTamanho: {},
    risotos: {},
    extrasPrato: {},
    extras: {},
    bebidas: {},
    bebidasProduto: {},
    sobremesas: {},
    saches: {},
    observacoes: {},
    combos: {},
    promocoes: {},
    naoClassificado: {},
    divergencias: [],
    exatoMolhoMassa: true,
    semCruzamento: false,
    qtdRateada: 0,
  };
}

function somarMapa(destino: Record<string, number>, origem: Record<string, number>) {
  for (const [k, v] of Object.entries(origem ?? {})) {
    const n = Number(v);
    if (!Number.isFinite(n) || n === 0) continue;
    destino[k] = (destino[k] ?? 0) + n;
  }
}

/** Soma vários consolidados (intervalo de meses). */
export function agregarResultadosConsumoSaipos(
  resultados: ResultadoConsolidadoSaipos[]
): ResultadoConsolidadoSaipos {
  const out = resultadoConsolidadoVazio();
  if (resultados.length === 0) return out;

  const divergencias: DivergenciaSaipos[] = [];
  let exato = true;
  let qtdRateada = 0;

  for (const r of resultados) {
    for (const chave of MAPAS_NUMERICOS) {
      const mapa = r[chave];
      if (mapa && typeof mapa === "object" && !Array.isArray(mapa)) {
        somarMapa(out[chave] as Record<string, number>, mapa as Record<string, number>);
      }
    }
    if (Array.isArray(r.divergencias)) divergencias.push(...r.divergencias);
    if (!r.exatoMolhoMassa) exato = false;
    qtdRateada += Number(r.qtdRateada) || 0;
  }

  out.divergencias = divergencias;
  out.exatoMolhoMassa = exato;
  out.semCruzamento = resultados.every((r) => r.semCruzamento);
  out.qtdRateada = qtdRateada;
  return out;
}

export function criarEstadoArquivoConsumoVazio(): SaiposConsumoArquivoState {
  return { version: 1, arquivos: [] };
}

function ehResultado(v: unknown): v is ResultadoConsolidadoSaipos {
  return Boolean(v && typeof v === "object" && "molhoMassa" in (v as object));
}

export function parseEstadoArquivoConsumo(raw: unknown): SaiposConsumoArquivoState {
  if (!raw || typeof raw !== "object") return criarEstadoArquivoConsumoVazio();
  const o = raw as Partial<SaiposConsumoArquivoState>;
  const lista = Array.isArray(o.arquivos) ? o.arquivos : [];
  const arquivos: ArquivoConsumoSaipos[] = [];
  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const a = item as Partial<ArquivoConsumoSaipos>;
    if (!a.mes_ref || !mesRefValido(String(a.mes_ref))) continue;
    if (!ehResultado(a.resultado)) continue;
    const vendas = parseVendasSaipos(a.vendas);
    const baixaRaw = a.baixa_estoque;
    let baixa_estoque: BaixaEstoqueArquivoSaipos | undefined;
    if (baixaRaw && typeof baixaRaw === "object" && Array.isArray(baixaRaw.movimento_ids)) {
      baixa_estoque = {
        aplicada_em: String(baixaRaw.aplicada_em || ""),
        movimento_ids: baixaRaw.movimento_ids.map(String),
        resumo: Array.isArray(baixaRaw.resumo)
          ? baixaRaw.resumo.map((r) => ({
              produto_id: String((r as { produto_id?: string }).produto_id || ""),
              nome: String((r as { nome?: string }).nome || ""),
              quantidade_kg: Number((r as { quantidade_kg?: number }).quantidade_kg) || 0,
            }))
          : [],
      };
    }
    arquivos.push({
      id: String(a.id || `saipos-${a.mes_ref}`),
      mes_ref: String(a.mes_ref),
      periodo_inicio: a.periodo_inicio ? String(a.periodo_inicio).slice(0, 10) : null,
      periodo_fim: a.periodo_fim ? String(a.periodo_fim).slice(0, 10) : null,
      periodo_rotulo: a.periodo_rotulo ? String(a.periodo_rotulo) : null,
      nome_arquivo: String(a.nome_arquivo || "planilha.xlsx"),
      formato: a.formato === "plano" ? "plano" : "hierarquico",
      enviado_em: String(a.enviado_em || new Date().toISOString()),
      total_itens: Number(a.total_itens) || 0,
      total_opcoes: Number(a.total_opcoes) || 0,
      resultado: a.resultado,
      ...(vendas ? { vendas } : {}),
      ...(baixa_estoque ? { baixa_estoque } : {}),
    });
  }
  // Um arquivo por mês (último ganha se houver duplicata).
  const porMes = new Map<string, ArquivoConsumoSaipos>();
  for (const a of arquivos.sort((x, y) => x.enviado_em.localeCompare(y.enviado_em))) {
    porMes.set(a.mes_ref, a);
  }
  return { version: 1, arquivos: [...porMes.values()].sort((a, b) => a.mes_ref.localeCompare(b.mes_ref)) };
}

export function relatorioParaArquivoMes(
  relatorio: RelatorioItensVendidosSaipos,
  mesRef: string,
  agora = new Date()
): ArquivoConsumoSaipos {
  if (!mesRefValido(mesRef)) {
    throw new Error(`Mês de referência inválido: ${mesRef}`);
  }
  const periodo = parsePeriodoSaiposRotulo(relatorio.periodo);
  return {
    id: `saipos-${mesRef}`,
    mes_ref: mesRef,
    periodo_inicio: periodo?.inicio ?? null,
    periodo_fim: periodo?.fim ?? null,
    periodo_rotulo: periodo?.rotulo ?? relatorio.periodo,
    nome_arquivo: relatorio.nomeArquivo,
    formato: relatorio.formato,
    enviado_em: agora.toISOString(),
    total_itens: relatorio.totalItens,
    total_opcoes: relatorio.totalOpcoes,
    resultado: relatorio.resultado,
    ...(relatorio.vendas ? { vendas: relatorio.vendas } : {}),
  };
}

export function arquivoParaRelatorio(
  arquivo: ArquivoConsumoSaipos,
  db?: Parameters<typeof montarTabelas>[4]
): RelatorioItensVendidosSaipos {
  const periodo = arquivo.periodo_rotulo;
  const vendas = arquivo.vendas;
  const abasTeoricas = montarTabelas(arquivo.resultado, arquivo.nome_arquivo, arquivo.formato, periodo, db);
  return {
    resultado: arquivo.resultado,
    vendas,
    formato: arquivo.formato,
    periodo,
    totalItens: arquivo.total_itens,
    totalOpcoes: arquivo.total_opcoes,
    abas: [...(vendas ? abasVendasSaipos(vendas) : []), ...abasTeoricas],
    nomeArquivo: arquivo.nome_arquivo,
  };
}

export function listarArquivosAno(state: SaiposConsumoArquivoState, ano: number): ArquivoConsumoSaipos[] {
  const prefix = `${ano}-`;
  return state.arquivos.filter((a) => a.mes_ref.startsWith(prefix));
}

export function obterArquivoMes(
  state: SaiposConsumoArquivoState,
  mesRef: string
): ArquivoConsumoSaipos | undefined {
  return state.arquivos.find((a) => a.mes_ref === mesRef);
}

/** Arquivos cujo mes_ref está em [mesInicio, mesFim] inclusive (YYYY-MM). */
export function arquivosNoIntervaloMes(
  state: SaiposConsumoArquivoState,
  mesInicio: string,
  mesFim: string
): ArquivoConsumoSaipos[] {
  if (!mesRefValido(mesInicio) || !mesRefValido(mesFim)) return [];
  const [de, ate] = mesInicio <= mesFim ? [mesInicio, mesFim] : [mesFim, mesInicio];
  return state.arquivos.filter((a) => a.mes_ref >= de && a.mes_ref <= ate);
}

export type RelatorioAgregadoSaipos = RelatorioItensVendidosSaipos & {
  mesesIncluidos: string[];
};

export function agregarArquivosConsumoSaipos(
  arquivos: ArquivoConsumoSaipos[],
  db?: Parameters<typeof montarTabelas>[4]
): RelatorioAgregadoSaipos | null {
  if (arquivos.length === 0) return null;
  const ordenados = [...arquivos].sort((a, b) => a.mes_ref.localeCompare(b.mes_ref));
  const resultado = agregarResultadosConsumoSaipos(ordenados.map((a) => a.resultado));
  const vendasLista = ordenados.map((a) => a.vendas).filter((v): v is VendasSaipos => Boolean(v));
  const vendas = vendasLista.length ? agregarVendasSaipos(vendasLista) : undefined;
  const mesesIncluidos = ordenados.map((a) => a.mes_ref);
  const periodo =
    ordenados.length === 1
      ? ordenados[0].periodo_rotulo
      : `${rotuloMesRef(mesesIncluidos[0])} → ${rotuloMesRef(mesesIncluidos[mesesIncluidos.length - 1])}`;
  const nomeArquivo =
    ordenados.length === 1
      ? ordenados[0].nome_arquivo
      : `Agregado ${mesesIncluidos[0]} a ${mesesIncluidos[mesesIncluidos.length - 1]}`;
  const totalItens = ordenados.reduce((s, a) => s + a.total_itens, 0);
  const totalOpcoes = ordenados.reduce((s, a) => s + a.total_opcoes, 0);
  const abasTeoricas = montarTabelas(resultado, nomeArquivo, ordenados[0].formato, periodo, db);
  return {
    resultado,
    vendas,
    formato: ordenados[0].formato,
    periodo,
    totalItens,
    totalOpcoes,
    abas: [...(vendas ? abasVendasSaipos(vendas) : []), ...abasTeoricas],
    nomeArquivo,
    mesesIncluidos,
  };
}

export function criarSaiposConsumoArquivoRepository(storage?: StorageLike | null) {
  /** Resolve na hora (nunca “prende” localStorage=null do SSR). */
  function resolveStorage(): StorageLike | null {
    if (storage !== undefined) return storage;
    return storageBrowser();
  }

  function lerBruto(s: StorageLike): string | null {
    const principal = s.getItem(SAIPOS_CONSUMO_ARQUIVO_STORAGE_KEY);
    if (principal) return principal;
    return s.getItem(SAIPOS_CONSUMO_ARQUIVO_BACKUP_KEY);
  }

  function carregar(): SaiposConsumoArquivoState {
    const s = resolveStorage();
    if (!s) return criarEstadoArquivoConsumoVazio();
    try {
      const raw = lerBruto(s);
      if (!raw) return criarEstadoArquivoConsumoVazio();
      const parsed = parseEstadoArquivoConsumo(JSON.parse(raw) as unknown);
      // Se só o backup tinha dados, reinsere na chave principal.
      if (parsed.arquivos.length > 0 && !s.getItem(SAIPOS_CONSUMO_ARQUIVO_STORAGE_KEY)) {
        try {
          s.setItem(SAIPOS_CONSUMO_ARQUIVO_STORAGE_KEY, JSON.stringify(parsed));
        } catch {
          // quota — segue com o que leu do backup
        }
      }
      return parsed;
    } catch {
      return criarEstadoArquivoConsumoVazio();
    }
  }

  function persistir(state: SaiposConsumoArquivoState) {
    const s = resolveStorage();
    if (!s) {
      throw new Error(
        "Armazenamento local indisponível neste navegador. Os meses não serão guardados após recarregar."
      );
    }
    const nextRaw = JSON.stringify(state);
    const prevRaw = s.getItem(SAIPOS_CONSUMO_ARQUIVO_STORAGE_KEY);
    if (prevRaw && state.arquivos.length === 0) {
      try {
        const prev = parseEstadoArquivoConsumo(JSON.parse(prevRaw) as unknown);
        if (prev.arquivos.length > 0) {
          throw new Error(
            "Bloqueado: gravar arquivo vazio apagaria meses já salvos. Use Remover mês a mês se for intencional."
          );
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("Bloqueado:")) throw e;
      }
    }
    // Guarda o estado anterior no backup antes de sobrescrever (se a nova gravação falhar).
    if (prevRaw) {
      try {
        s.setItem(SAIPOS_CONSUMO_ARQUIVO_BACKUP_KEY, prevRaw);
      } catch {
        // quota — segue sem backup intermediário
      }
    }
    try {
      s.setItem(SAIPOS_CONSUMO_ARQUIVO_STORAGE_KEY, nextRaw);
    } catch {
      throw new Error(
        "Espaço do navegador cheio ao salvar o arquivo Saipos. Exporte um backup JSON e libere espaço, ou arquive menos meses."
      );
    }
    // Cópia espelhada do estado atual — recupera se a chave principal for apagada.
    try {
      s.setItem(SAIPOS_CONSUMO_ARQUIVO_BACKUP_KEY, nextRaw);
    } catch {
      // quota — principal já gravou
    }
  }

  function listar(): ArquivoConsumoSaipos[] {
    return carregar().arquivos;
  }

  function obter(mesRef: string): ArquivoConsumoSaipos | undefined {
    return obterArquivoMes(carregar(), mesRef);
  }

  function salvar(arquivo: ArquivoConsumoSaipos): SaiposConsumoArquivoState {
    const state = carregar();
    const demais = state.arquivos.filter((a) => a.mes_ref !== arquivo.mes_ref);
    const next: SaiposConsumoArquivoState = {
      version: 1,
      arquivos: [...demais, arquivo].sort((a, b) => a.mes_ref.localeCompare(b.mes_ref)),
    };
    persistir(next);
    return next;
  }

  function remover(mesRef: string): SaiposConsumoArquivoState {
    const state = carregar();
    const next: SaiposConsumoArquivoState = {
      version: 1,
      arquivos: state.arquivos.filter((a) => a.mes_ref !== mesRef),
    };
    // Remover o último mês é permitido (lista vazia intencional).
    const s = resolveStorage();
    if (!s) {
      throw new Error("Armazenamento local indisponível neste navegador.");
    }
    const nextRaw = JSON.stringify(next);
    const prevRaw = s.getItem(SAIPOS_CONSUMO_ARQUIVO_STORAGE_KEY);
    if (prevRaw) {
      try {
        s.setItem(SAIPOS_CONSUMO_ARQUIVO_BACKUP_KEY, prevRaw);
      } catch {
        /* quota */
      }
    }
    try {
      s.setItem(SAIPOS_CONSUMO_ARQUIVO_STORAGE_KEY, nextRaw);
    } catch {
      throw new Error("Não foi possível salvar após remover o mês (espaço do navegador?).");
    }
    try {
      s.setItem(SAIPOS_CONSUMO_ARQUIVO_BACKUP_KEY, nextRaw);
    } catch {
      /* quota */
    }
    return next;
  }

  function exportarJson(): string {
    return JSON.stringify(carregar(), null, 2);
  }

  function importarJson(raw: string, modo: "mesclar" | "substituir" = "mesclar"): SaiposConsumoArquivoState {
    const entrante = parseEstadoArquivoConsumo(JSON.parse(raw) as unknown);
    if (entrante.arquivos.length === 0) {
      throw new Error("JSON sem meses arquivados válidos.");
    }
    if (modo === "substituir") {
      persistir(entrante);
      return entrante;
    }
    const atual = carregar();
    const porMes = new Map<string, ArquivoConsumoSaipos>();
    for (const a of atual.arquivos) porMes.set(a.mes_ref, a);
    for (const a of entrante.arquivos) porMes.set(a.mes_ref, a);
    const next: SaiposConsumoArquivoState = {
      version: 1,
      arquivos: [...porMes.values()].sort((a, b) => a.mes_ref.localeCompare(b.mes_ref)),
    };
    persistir(next);
    return next;
  }

  return { carregar, listar, obter, salvar, remover, persistir, exportarJson, importarJson };
}
