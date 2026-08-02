import type {
  ReceitaFichaTecnica,
  ReceitaFichaTecnicaVersao,
  FichaTecnica,
} from "../types";

export interface NovaReceitaFichaTecnica {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string;
}

export interface NovaVersaoRascunhoFichaTecnica {
  id: string;
  receita_id: string;
  numero_versao: string;
  ficha: FichaTecnica;
}

export interface RepositorioFichasTecnicas {
  listarReceitas(): ReceitaFichaTecnica[];
  buscarReceitaPorId(receitaId: string): ReceitaFichaTecnica | undefined;
  buscarReceitaPorCodigo(codigo: string): ReceitaFichaTecnica | undefined;
  salvarNovaReceita(novaReceita: NovaReceitaFichaTecnica): ReceitaFichaTecnica;
  atualizarRascunho(
    versaoId: string,
    atualizacoes: Partial<Omit<FichaTecnica, "id" | "versao" | "criado_em">>
  ): ReceitaFichaTecnicaVersao;
  listarVersoesDaReceita(receitaId: string): ReceitaFichaTecnicaVersao[];
  buscarVersaoPorId(versaoId: string): ReceitaFichaTecnicaVersao | undefined;
  salvarNovaVersaoRascunho(novaVersao: NovaVersaoRascunhoFichaTecnica): ReceitaFichaTecnicaVersao;
  publicarVersao(receitaId: string, versaoId: string): ReceitaFichaTecnicaVersao;
  obterVersaoVigenteEmData(receitaId: string, dataIso: string): ReceitaFichaTecnicaVersao | undefined;
}
