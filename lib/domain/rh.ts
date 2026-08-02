import type {
  FuncaoOperacional,
  ModuloAcesso,
  Papel,
  PermissoesModulos,
  PessoaRH,
  TipoPessoaRH,
} from "../types";

export const MODULOS_ACESSO: Array<{ id: ModuloAcesso; rotulo: string }> = [
  { id: "painel", rotulo: "Painel" },
  { id: "recebimento", rotulo: "Recebimento" },
  { id: "estoque", rotulo: "Estoque" },
  { id: "lista_compras", rotulo: "Lista de compras" },
  { id: "cotacoes", rotulo: "Cotações" },
  { id: "pedidos", rotulo: "Pedidos" },
  { id: "financeiro", rotulo: "Financeiro" },
  { id: "relatorios", rotulo: "Relatórios" },
  { id: "cadastros", rotulo: "Cadastros" },
  { id: "rh", rotulo: "RH / Pessoas" },
];

export const TIPOS_PESSOA_RH: Array<{ id: TipoPessoaRH; rotulo: string }> = [
  { id: "colaborador", rotulo: "Colaborador" },
  { id: "intermitente", rotulo: "Intermitente" },
  { id: "entregador", rotulo: "Entregador" },
  { id: "prestador_eventual", rotulo: "Prestador eventual" },
];

export const FUNCOES_OPERACIONAIS: Array<{ id: FuncaoOperacional; rotulo: string }> = [
  { id: "administrador", rotulo: "Administrador" },
  { id: "gerente", rotulo: "Gerente" },
  { id: "cozinha", rotulo: "Cozinha" },
  { id: "balcao", rotulo: "Balcão" },
  { id: "caixa", rotulo: "Caixa" },
  { id: "salao", rotulo: "Salão" },
  { id: "entregador", rotulo: "Entregador" },
  { id: "custom", rotulo: "Outra (informar)" },
];

export function permissoesVazias(): PermissoesModulos {
  return {
    painel: false,
    recebimento: false,
    estoque: false,
    lista_compras: false,
    cotacoes: false,
    pedidos: false,
    financeiro: false,
    relatorios: false,
    cadastros: false,
    rh: false,
  };
}

/** Defaults alinhados ao seletor de papel atual do ComprasChef. */
export function permissoesPorPapel(papel: Papel): PermissoesModulos {
  const base = permissoesVazias();
  base.painel = true;
  base.recebimento = true;
  base.estoque = true;
  base.lista_compras = true;
  base.pedidos = true;

  if (papel === "dono" || papel === "gerente") {
    base.cotacoes = true;
    base.financeiro = true;
    base.relatorios = true;
    base.cadastros = true;
    base.rh = true;
  }

  if (papel === "dono") {
    // dono já tem tudo acima
  }

  return base;
}

export function rotuloTipoPessoa(tipo: TipoPessoaRH): string {
  return TIPOS_PESSOA_RH.find((t) => t.id === tipo)?.rotulo ?? tipo;
}

export function rotuloFuncao(pessoa: Pick<PessoaRH, "funcao" | "funcao_custom">): string {
  if (pessoa.funcao === "custom") {
    return pessoa.funcao_custom?.trim() || "Outra";
  }
  return FUNCOES_OPERACIONAIS.find((f) => f.id === pessoa.funcao)?.rotulo ?? pessoa.funcao;
}

export function pessoaParaSeedDePerfil(input: {
  id: string;
  nome: string;
  papel: Papel;
  agora: string;
}): PessoaRH {
  const funcaoPorPapel: Record<Papel, FuncaoOperacional> = {
    dono: "administrador",
    gerente: "gerente",
    lider: "cozinha",
    caixa: "caixa",
  };

  return {
    id: input.id.replace(/^perfil-/, "pes-"),
    nome: input.nome,
    tipo: "colaborador",
    funcao: funcaoPorPapel[input.papel],
    cargo: input.papel === "dono" ? "Proprietário" : undefined,
    tem_acesso_sistema: true,
    login: input.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "."),
    senha: "demo123",
    perfil_id: input.id,
    papel_sistema: input.papel,
    permissoes: permissoesPorPapel(input.papel),
    ativo: true,
    criado_em: input.agora,
    atualizado_em: input.agora,
  };
}
