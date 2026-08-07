import type { AvaliacaoPessoaRh, DB, NotaAvaliacaoPessoaRh } from "../types";

export interface ResultadoAvaliacaoPessoa {
  sucesso: boolean;
  erros: string[];
  avaliacao?: AvaliacaoPessoaRh;
}

export const NOTAS_AVALIACAO_PESSOA: NotaAvaliacaoPessoaRh[] = [1, 2, 3, 4, 5];

function limparTexto(valor?: string): string {
  return (valor ?? "").trim();
}

function competenciaValida(valor?: string): boolean {
  if (!valor || !/^\d{4}-\d{2}$/.test(valor)) return false;
  const mes = Number(valor.slice(5, 7));
  return mes >= 1 && mes <= 12;
}

function normalizarNota(valor: unknown): NotaAvaliacaoPessoaRh | null {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n as NotaAvaliacaoPessoaRh;
}

/** Rótulo pt-BR curto da competência (ex.: ago/2026). */
export function rotuloCompetenciaAvaliacao(competencia: string): string {
  if (!competenciaValida(competencia)) return competencia || "—";
  const [ano, mes] = competencia.split("-");
  const d = new Date(Number(ano), Number(mes) - 1, 1);
  const mesCurto = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return `${mesCurto}/${ano}`;
}

/** Cor do Badge pela nota: 4–5 verde, 3 azul, 1–2 laranja. */
export function corBadgeNotaAvaliacao(nota: NotaAvaliacaoPessoaRh): "verde" | "azul" | "laranja" {
  if (nota >= 4) return "verde";
  if (nota === 3) return "azul";
  return "laranja";
}

/** Cor do Badge pela média (arredonda para 1–5). */
export function corBadgeMediaAvaliacao(media: number): "verde" | "azul" | "laranja" {
  const arredondada = Math.min(5, Math.max(1, Math.round(media))) as NotaAvaliacaoPessoaRh;
  return corBadgeNotaAvaliacao(arredondada);
}

/** Lista avaliações da pessoa (competência mais recente primeiro). */
export function listarAvaliacoesPessoa(
  db: Pick<DB, "avaliacoes_pessoas">,
  pessoaId: string
): AvaliacaoPessoaRh[] {
  return [...(db.avaliacoes_pessoas ?? [])]
    .filter((a) => a.pessoa_id === pessoaId)
    .sort((a, b) => {
      const porComp = b.competencia.localeCompare(a.competencia);
      if (porComp !== 0) return porComp;
      return b.criado_em.localeCompare(a.criado_em);
    });
}

export interface ResumoAvaliacoesPessoa {
  quantidade: number;
  /** Média aritmética das notas; null se não houver avaliações. */
  media: number | null;
  ultimaNota: NotaAvaliacaoPessoaRh | null;
  ultimaCompetencia: string | null;
}

/** Agrega quantidade, média e última nota (lista já ordenada ou não). */
export function resumirAvaliacoesPessoa(avaliacoes: AvaliacaoPessoaRh[]): ResumoAvaliacoesPessoa {
  if (avaliacoes.length === 0) {
    return { quantidade: 0, media: null, ultimaNota: null, ultimaCompetencia: null };
  }
  const ordenadas = [...avaliacoes].sort((a, b) => {
    const porComp = b.competencia.localeCompare(a.competencia);
    if (porComp !== 0) return porComp;
    return b.criado_em.localeCompare(a.criado_em);
  });
  const soma = avaliacoes.reduce((acc, a) => acc + a.nota, 0);
  const media = Math.round((soma / avaliacoes.length) * 10) / 10;
  const ultima = ordenadas[0];
  return {
    quantidade: avaliacoes.length,
    media,
    ultimaNota: ultima.nota,
    ultimaCompetencia: ultima.competencia,
  };
}

/** Formata média com 1 casa (pt-BR). */
export function formatarMediaAvaliacao(media: number | null): string {
  if (media == null) return "—";
  return media.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export type FiltroNotaAvaliacaoPessoa = "todas" | NotaAvaliacaoPessoaRh;

export function parseFiltroNotaAvaliacaoPessoa(
  valor: string | null | undefined
): FiltroNotaAvaliacaoPessoa {
  const n = Number((valor ?? "").trim());
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n;
  return "todas";
}

export function filtrarAvaliacoesPorNota(
  avaliacoes: AvaliacaoPessoaRh[],
  filtro: FiltroNotaAvaliacaoPessoa
): AvaliacaoPessoaRh[] {
  if (filtro === "todas") return avaliacoes;
  return avaliacoes.filter((a) => a.nota === filtro);
}

export function contarAvaliacoesPorNota(
  avaliacoes: AvaliacaoPessoaRh[]
): Record<NotaAvaliacaoPessoaRh, number> {
  const contagem: Record<NotaAvaliacaoPessoaRh, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const a of avaliacoes) {
    contagem[a.nota] += 1;
  }
  return contagem;
}

/**
 * Registra avaliação formal (nota 1–5) por competência.
 * Não altera anotações livres nem pagamentos.
 */
export function adicionarAvaliacaoPessoa(
  db: DB,
  dados: {
    id: string;
    pessoa_id: string;
    competencia: string;
    nota: number;
    comentario?: string;
    avaliador?: string;
  },
  opcoes?: { agora?: string }
): ResultadoAvaliacaoPessoa {
  const pessoaId = limparTexto(dados.pessoa_id);
  if (!pessoaId || !(db.pessoas ?? []).some((p) => p.id === pessoaId)) {
    return { sucesso: false, erros: ["Pessoa não encontrada."] };
  }
  const competencia = limparTexto(dados.competencia);
  if (!competenciaValida(competencia)) {
    return { sucesso: false, erros: ["Informe a competência (AAAA-MM)."] };
  }
  const nota = normalizarNota(dados.nota);
  if (!nota) {
    return { sucesso: false, erros: ["A nota deve ser de 1 a 5."] };
  }
  const agora = opcoes?.agora ?? new Date().toISOString();
  const avaliacao: AvaliacaoPessoaRh = {
    id: limparTexto(dados.id) || `aval-${Date.now()}`,
    pessoa_id: pessoaId,
    competencia,
    nota,
    comentario: limparTexto(dados.comentario) || undefined,
    avaliador: limparTexto(dados.avaliador) || undefined,
    criado_em: agora,
    atualizado_em: agora,
  };
  if (!Array.isArray(db.avaliacoes_pessoas)) db.avaliacoes_pessoas = [];
  db.avaliacoes_pessoas.push(avaliacao);
  return { sucesso: true, erros: [], avaliacao };
}

/**
 * Atualiza competência/nota/comentário de uma avaliação existente.
 * Preserva avaliador e criado_em; atualiza atualizado_em.
 */
export function editarAvaliacaoPessoa(
  db: DB,
  avaliacaoId: string,
  dados: {
    competencia: string;
    nota: number;
    comentario?: string;
  },
  opcoes?: { agora?: string }
): ResultadoAvaliacaoPessoa {
  const id = limparTexto(avaliacaoId);
  const lista = db.avaliacoes_pessoas ?? [];
  const indice = lista.findIndex((a) => a.id === id);
  if (indice < 0) {
    return { sucesso: false, erros: ["Avaliação não encontrada."] };
  }
  const competencia = limparTexto(dados.competencia);
  if (!competenciaValida(competencia)) {
    return { sucesso: false, erros: ["Informe a competência (AAAA-MM)."] };
  }
  const nota = normalizarNota(dados.nota);
  if (!nota) {
    return { sucesso: false, erros: ["A nota deve ser de 1 a 5."] };
  }
  const atual = lista[indice];
  const agora = opcoes?.agora ?? new Date().toISOString();
  const avaliacao: AvaliacaoPessoaRh = {
    ...atual,
    competencia,
    nota,
    comentario: limparTexto(dados.comentario) || undefined,
    atualizado_em: agora,
  };
  lista[indice] = avaliacao;
  return { sucesso: true, erros: [], avaliacao };
}

/** Remove avaliação pelo id. */
export function excluirAvaliacaoPessoa(db: DB, avaliacaoId: string): ResultadoAvaliacaoPessoa {
  const id = limparTexto(avaliacaoId);
  const lista = db.avaliacoes_pessoas ?? [];
  const indice = lista.findIndex((a) => a.id === id);
  if (indice < 0) {
    return { sucesso: false, erros: ["Avaliação não encontrada."] };
  }
  const [removida] = lista.splice(indice, 1);
  return { sucesso: true, erros: [], avaliacao: removida };
}
