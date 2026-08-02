import type {
  CategoriaProduto,
  FichaTecnicaStatus,
  TipoReceitaFichaTecnica,
  Unidade,
} from "../types";
import type {
  NovoRascunhoBasicoFichaTecnica,
  RepositorioFichasTecnicas,
  ResultadoCriacaoRascunhoBasicoFichaTecnica,
} from "./fichas-tecnicas-repositorio";

export interface ItemCatalogoFichaTecnica {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string;
  tipo: TipoReceitaFichaTecnica;
  categoria_id?: string;
  categoria_nome?: string;
  status: FichaTecnicaStatus;
  versao_atual?: string;
  atualizado_em: string;
}

export interface FiltrosCatalogoFichasTecnicas {
  busca: string;
  tipo: "todos" | TipoReceitaFichaTecnica;
  status: "todos" | FichaTecnicaStatus;
}

export interface FormNovoRascunhoFichaTecnica {
  nome: string;
  codigo: string;
  tipo: TipoReceitaFichaTecnica;
  categoria_id: string;
  descricao: string;
}

export interface DependenciasCriacaoRascunhoFichaTecnica {
  repositorio: {
    criarRascunhoBasico(
      novoRascunho: NovoRascunhoBasicoFichaTecnica
    ): ResultadoCriacaoRascunhoBasicoFichaTecnica | Promise<ResultadoCriacaoRascunhoBasicoFichaTecnica>;
  };
  rendimento_unidade_id: string;
  criado_por: string;
}

function clonarDefensivo<T>(valor: T): T {
  return structuredClone(valor);
}

function normalizarTexto(valor: string): string {
  return valor.trim().toLocaleLowerCase("pt-BR");
}

export function criarFormularioNovoRascunhoInicial(): FormNovoRascunhoFichaTecnica {
  return {
    nome: "",
    codigo: "",
    tipo: "prato",
    categoria_id: "",
    descricao: "",
  };
}

export function selecionarUnidadePadraoRascunho(unidades: Pick<Unidade, "id" | "sigla">[]): string {
  if (unidades.length === 0) {
    throw new Error("Nenhuma unidade cadastrada para criar o rascunho básico.");
  }

  const prioridade = ["un", "und", "unid", "kg", "g", "l", "ml"];
  for (const sigla of prioridade) {
    const encontrada = unidades.find((unidade) => normalizarTexto(unidade.sigla) === sigla);
    if (encontrada) {
      return encontrada.id;
    }
  }

  return unidades[0].id;
}

export function listarItensCatalogoFichasTecnicas(
  repositorio: Pick<RepositorioFichasTecnicas, "listarReceitas" | "listarVersoesDaReceita">,
  categorias: Pick<CategoriaProduto, "id" | "nome">[] = []
): ItemCatalogoFichaTecnica[] {
  const categoriasPorId = new Map(categorias.map((categoria) => [categoria.id, categoria.nome]));

  return repositorio
    .listarReceitas()
    .map((receita) => {
      const versoes = repositorio.listarVersoesDaReceita(receita.id);
      const versaoVigente = receita.versao_vigente_id
        ? versoes.find((versao) => versao.id === receita.versao_vigente_id)
        : undefined;
      const ultimaVersao = versoes[versoes.length - 1];
      const versaoAtual = versaoVigente ?? ultimaVersao;

      return {
        id: receita.id,
        codigo: receita.codigo,
        nome: receita.nome,
        descricao: receita.descricao,
        tipo: receita.tipo ?? "prato",
        categoria_id: receita.categoria_id,
        categoria_nome: receita.categoria_id ? categoriasPorId.get(receita.categoria_id) : undefined,
        status: versaoAtual?.status ?? "rascunho",
        versao_atual: versaoAtual?.numero_versao,
        atualizado_em: versaoAtual?.atualizado_em ?? receita.atualizado_em,
      } satisfies ItemCatalogoFichaTecnica;
    })
    .sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em) || a.nome.localeCompare(b.nome, "pt-BR"))
    .map(clonarDefensivo);
}

export function filtrarItensCatalogoFichasTecnicas(
  itens: ItemCatalogoFichaTecnica[],
  filtros: FiltrosCatalogoFichasTecnicas
): ItemCatalogoFichaTecnica[] {
  const busca = normalizarTexto(filtros.busca);

  return itens
    .filter((item) => {
      const correspondeBusca =
        busca.length === 0 ||
        normalizarTexto(item.nome).includes(busca) ||
        normalizarTexto(item.codigo).includes(busca);
      const correspondeTipo = filtros.tipo === "todos" || item.tipo === filtros.tipo;
      const correspondeStatus = filtros.status === "todos" || item.status === filtros.status;
      return correspondeBusca && correspondeTipo && correspondeStatus;
    })
    .map(clonarDefensivo);
}

export function rotuloTipoReceitaFichaTecnica(tipo: TipoReceitaFichaTecnica): string {
  return tipo === "sub_receita" ? "Sub-receita" : "Prato";
}

export function rotuloStatusFichaTecnica(status: FichaTecnicaStatus): string {
  if (status === "publicada") return "Publicada";
  if (status === "arquivada") return "Arquivada";
  return "Rascunho";
}

export function criarCoordenadorNovoRascunhoFichaTecnica(
  dependencias: DependenciasCriacaoRascunhoFichaTecnica
): {
  salvar(formulario: FormNovoRascunhoFichaTecnica): Promise<ResultadoCriacaoRascunhoBasicoFichaTecnica>;
  cancelar(): FormNovoRascunhoFichaTecnica;
} {
  let operacaoPendente: Promise<ResultadoCriacaoRascunhoBasicoFichaTecnica> | undefined;

  return {
    salvar(formulario) {
      if (operacaoPendente) {
        return operacaoPendente;
      }

      const payload: NovoRascunhoBasicoFichaTecnica = {
        nome: formulario.nome,
        codigo: formulario.codigo,
        tipo: formulario.tipo,
        categoria_id: formulario.categoria_id.trim() || undefined,
        descricao: formulario.descricao,
        criado_por: dependencias.criado_por,
        rendimento_unidade_id: dependencias.rendimento_unidade_id,
      };

      let resolver!: (valor: ResultadoCriacaoRascunhoBasicoFichaTecnica) => void;
      let rejeitar!: (erro: unknown) => void;
      operacaoPendente = new Promise<ResultadoCriacaoRascunhoBasicoFichaTecnica>((resolve, reject) => {
        resolver = resolve;
        rejeitar = reject;
      }).finally(() => {
        operacaoPendente = undefined;
      });

      try {
        const retorno = dependencias.repositorio.criarRascunhoBasico(payload);
        Promise.resolve(retorno).then(resolver, rejeitar);
      } catch (erro) {
        rejeitar(erro);
      }

      return operacaoPendente;
    },
    cancelar() {
      return criarFormularioNovoRascunhoInicial();
    },
  };
}