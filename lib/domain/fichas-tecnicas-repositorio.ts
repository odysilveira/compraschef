import type {
  EventoHistoricoReceitaVersao,
  ReceitaFichaTecnica,
  ReceitaFichaTecnicaVersao,
  FichaTecnica,
  TipoReceitaFichaTecnica,
} from "../types";

export interface NovaReceitaFichaTecnica {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string;
  tipo?: TipoReceitaFichaTecnica;
  categoria_id?: string;
  criado_por?: string;
}

export interface NovoRascunhoBasicoFichaTecnica {
  codigo: string;
  nome: string;
  tipo: TipoReceitaFichaTecnica;
  categoria_id?: string;
  descricao?: string;
  criado_por: string;
  rendimento_unidade_id: string;
}

export interface ResultadoCriacaoRascunhoBasicoFichaTecnica {
  receita: ReceitaFichaTecnica;
  versao: ReceitaFichaTecnicaVersao;
}

export interface NovaVersaoRascunhoFichaTecnica {
  id: string;
  receita_id: string;
  numero_versao: string;
  ficha: FichaTecnica;
  criado_por?: string;
}

export interface ContextoOperacaoFichaTecnica {
  responsavel: string;
  em?: string;
}

export interface RepositorioFichasTecnicas {
  listarReceitas(): ReceitaFichaTecnica[];
  buscarReceitaPorId(receitaId: string): ReceitaFichaTecnica | undefined;
  buscarReceitaPorCodigo(codigo: string): ReceitaFichaTecnica | undefined;
  salvarNovaReceita(novaReceita: NovaReceitaFichaTecnica): ReceitaFichaTecnica;
  criarRascunhoBasico(
    novoRascunho: NovoRascunhoBasicoFichaTecnica
  ): ResultadoCriacaoRascunhoBasicoFichaTecnica;
  atualizarRascunho(
    versaoId: string,
    atualizacoes: Partial<Omit<FichaTecnica, "id" | "versao" | "criado_em">>,
    contexto?: ContextoOperacaoFichaTecnica
  ): ReceitaFichaTecnicaVersao;
  listarVersoesDaReceita(receitaId: string): ReceitaFichaTecnicaVersao[];
  buscarVersaoPorId(versaoId: string): ReceitaFichaTecnicaVersao | undefined;
  salvarNovaVersaoRascunho(novaVersao: NovaVersaoRascunhoFichaTecnica): ReceitaFichaTecnicaVersao;
  publicarVersao(
    receitaId: string,
    versaoId: string,
    contexto?: ContextoOperacaoFichaTecnica
  ): ReceitaFichaTecnicaVersao;
  obterVersaoVigenteEmData(receitaId: string, dataIso: string): ReceitaFichaTecnicaVersao | undefined;
  listarHistoricoDaVersao?(versaoId: string): EventoHistoricoReceitaVersao[];
}
