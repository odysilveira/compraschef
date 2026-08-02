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

/** Mantém só dígitos do telefone (DDD + número), no máximo 11. */
export function somenteDigitosTelefone(valor: string): string {
  return valor.replace(/\D+/g, "").slice(0, 11);
}

/** Mantém só dígitos do CPF, no máximo 11. */
export function somenteDigitosCpf(valor: string): string {
  return valor.replace(/\D+/g, "").slice(0, 11);
}

function digitoVerificadorCpf(base: string, pesoInicial: number): number {
  let soma = 0;
  for (let i = 0; i < base.length; i += 1) {
    soma += Number(base[i]) * (pesoInicial - i);
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

/**
 * Valida autenticidade matemática do CPF (dígitos verificadores).
 * Não consulta a Receita Federal — só rejeita números inventados/inválidos.
 */
export function validarCpf(cpf?: string): { valido: boolean; mensagem: string | null } {
  const digitos = somenteDigitosCpf(cpf ?? "");
  if (!digitos) {
    return { valido: true, mensagem: null }; // opcional no cadastro
  }
  if (digitos.length < 11) {
    return { valido: false, mensagem: "CPF incompleto (11 dígitos)." };
  }
  if (/^(\d)\1{10}$/.test(digitos)) {
    return { valido: false, mensagem: "CPF inválido." };
  }
  const d1 = digitoVerificadorCpf(digitos.slice(0, 9), 10);
  const d2 = digitoVerificadorCpf(digitos.slice(0, 10), 11);
  if (d1 !== Number(digitos[9]) || d2 !== Number(digitos[10])) {
    return { valido: false, mensagem: "CPF inválido — dígitos verificadores não conferem." };
  }
  return { valido: true, mensagem: "CPF válido." };
}

export function formatarCpf(cpf?: string): string {
  const digitos = somenteDigitosCpf(cpf ?? "");
  if (digitos.length !== 11) return digitos;
  return digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
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
