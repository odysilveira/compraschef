import type { AnotacaoPessoaRh, DB, TipoAnotacaoPessoaRh } from "../types";

export interface ResultadoAnotacaoPessoa {
  sucesso: boolean;
  erros: string[];
  anotacao?: AnotacaoPessoaRh;
}

export const TIPOS_ANOTACAO_PESSOA: { id: TipoAnotacaoPessoaRh; rotulo: string }[] = [
  { id: "elogio", rotulo: "Elogio" },
  { id: "aviso", rotulo: "Aviso" },
  { id: "observacao", rotulo: "Observação" },
];

const TIPOS_VALIDOS = new Set<string>(TIPOS_ANOTACAO_PESSOA.map((t) => t.id));

export function rotuloTipoAnotacaoPessoa(tipo: TipoAnotacaoPessoaRh): string {
  return TIPOS_ANOTACAO_PESSOA.find((t) => t.id === tipo)?.rotulo ?? tipo;
}

/** Cor do Badge: elogio=verde, aviso=laranja, observação=cinza. */
export function corBadgeTipoAnotacao(
  tipo: TipoAnotacaoPessoaRh
): "verde" | "laranja" | "cinza" {
  if (tipo === "elogio") return "verde";
  if (tipo === "aviso") return "laranja";
  return "cinza";
}

export type FiltroTipoAnotacaoPessoa = "todas" | TipoAnotacaoPessoaRh;

export function parseFiltroTipoAnotacaoPessoa(
  valor: string | null | undefined
): FiltroTipoAnotacaoPessoa {
  const t = limparTexto(valor ?? undefined);
  if (t === "elogio" || t === "aviso" || t === "observacao") return t;
  return "todas";
}

export function filtrarAnotacoesPorTipo(
  anotacoes: AnotacaoPessoaRh[],
  filtro: FiltroTipoAnotacaoPessoa
): AnotacaoPessoaRh[] {
  if (filtro === "todas") return anotacoes;
  return anotacoes.filter((a) => (a.tipo ?? "observacao") === filtro);
}

export function contarAnotacoesPorTipo(anotacoes: AnotacaoPessoaRh[]): Record<TipoAnotacaoPessoaRh, number> {
  const contagem: Record<TipoAnotacaoPessoaRh, number> = {
    elogio: 0,
    aviso: 0,
    observacao: 0,
  };
  for (const a of anotacoes) {
    const tipo = a.tipo ?? "observacao";
    contagem[tipo] += 1;
  }
  return contagem;
}

function limparTexto(valor?: string): string {
  return (valor ?? "").trim();
}

function dataIsoValida(valor?: string): boolean {
  return Boolean(valor && /^\d{4}-\d{2}-\d{2}$/.test(valor));
}

function normalizarTipo(valor?: string): TipoAnotacaoPessoaRh | null {
  const t = limparTexto(valor);
  if (!TIPOS_VALIDOS.has(t)) return null;
  return t as TipoAnotacaoPessoaRh;
}

/** Lista anotações da pessoa (mais recente primeiro). */
export function listarAnotacoesPessoa(db: Pick<DB, "anotacoes_pessoas">, pessoaId: string): AnotacaoPessoaRh[] {
  return [...(db.anotacoes_pessoas ?? [])]
    .filter((a) => a.pessoa_id === pessoaId)
    .sort((a, b) => {
      const porData = b.data.localeCompare(a.data);
      if (porData !== 0) return porData;
      return b.criado_em.localeCompare(a.criado_em);
    });
}

/**
 * Acrescenta anotação livre no histórico da pessoa.
 * Não altera status de pagamento/escala — só registra texto.
 */
export function adicionarAnotacaoPessoa(
  db: DB,
  dados: {
    id: string;
    pessoa_id: string;
    texto: string;
    tipo?: TipoAnotacaoPessoaRh | string;
    data?: string;
    autor?: string;
  },
  opcoes?: { agora?: string }
): ResultadoAnotacaoPessoa {
  const pessoaId = limparTexto(dados.pessoa_id);
  if (!pessoaId || !(db.pessoas ?? []).some((p) => p.id === pessoaId)) {
    return { sucesso: false, erros: ["Pessoa não encontrada."] };
  }
  const texto = limparTexto(dados.texto);
  if (!texto) {
    return { sucesso: false, erros: ["Escreva o texto da anotação."] };
  }
  const tipo = normalizarTipo(dados.tipo ?? "observacao");
  if (!tipo) {
    return { sucesso: false, erros: ["Escolha um tipo válido (elogio, aviso ou observação)."] };
  }
  const agora = opcoes?.agora ?? new Date().toISOString();
  const data = limparTexto(dados.data) || agora.slice(0, 10);
  if (!dataIsoValida(data)) {
    return { sucesso: false, erros: ["Informe uma data válida (AAAA-MM-DD)."] };
  }
  const anotacao: AnotacaoPessoaRh = {
    id: limparTexto(dados.id) || `anot-${Date.now()}`,
    pessoa_id: pessoaId,
    data,
    tipo,
    texto,
    autor: limparTexto(dados.autor) || undefined,
    criado_em: agora,
    atualizado_em: agora,
  };
  if (!Array.isArray(db.anotacoes_pessoas)) db.anotacoes_pessoas = [];
  db.anotacoes_pessoas.push(anotacao);
  return { sucesso: true, erros: [], anotacao };
}

/**
 * Atualiza texto/data/tipo de uma anotação existente.
 * Preserva autor e criado_em; atualiza atualizado_em.
 */
export function editarAnotacaoPessoa(
  db: DB,
  anotacaoId: string,
  dados: { texto: string; data?: string; tipo?: TipoAnotacaoPessoaRh | string },
  opcoes?: { agora?: string }
): ResultadoAnotacaoPessoa {
  const id = limparTexto(anotacaoId);
  const lista = db.anotacoes_pessoas ?? [];
  const indice = lista.findIndex((a) => a.id === id);
  if (indice < 0) {
    return { sucesso: false, erros: ["Anotação não encontrada."] };
  }
  const texto = limparTexto(dados.texto);
  if (!texto) {
    return { sucesso: false, erros: ["Escreva o texto da anotação."] };
  }
  const atual = lista[indice];
  const tipo =
    dados.tipo !== undefined ? normalizarTipo(dados.tipo) : (atual.tipo ?? "observacao");
  if (!tipo) {
    return { sucesso: false, erros: ["Escolha um tipo válido (elogio, aviso ou observação)."] };
  }
  const agora = opcoes?.agora ?? new Date().toISOString();
  const data = limparTexto(dados.data) || atual.data;
  if (!dataIsoValida(data)) {
    return { sucesso: false, erros: ["Informe uma data válida (AAAA-MM-DD)."] };
  }
  const anotacao: AnotacaoPessoaRh = {
    ...atual,
    data,
    tipo,
    texto,
    atualizado_em: agora,
  };
  lista[indice] = anotacao;
  return { sucesso: true, erros: [], anotacao };
}

/** Remove anotação pelo id. */
export function excluirAnotacaoPessoa(db: DB, anotacaoId: string): ResultadoAnotacaoPessoa {
  const id = limparTexto(anotacaoId);
  const lista = db.anotacoes_pessoas ?? [];
  const indice = lista.findIndex((a) => a.id === id);
  if (indice < 0) {
    return { sucesso: false, erros: ["Anotação não encontrada."] };
  }
  const [removida] = lista.splice(indice, 1);
  return { sucesso: true, erros: [], anotacao: removida };
}
