import type { DB, ModuloAcesso, Papel, PermissoesModulos } from "../types";
import { permissoesPorPapel } from "./rh";

/** Ordem: rotas mais específicas primeiro; `/` por último. */
const ROTAS_MODULO: Array<{ prefixo: string; modulo: ModuloAcesso }> = [
  { prefixo: "/rh", modulo: "rh" },
  { prefixo: "/recebimento", modulo: "recebimento" },
  { prefixo: "/estoque", modulo: "estoque" },
  { prefixo: "/lista-compras", modulo: "lista_compras" },
  { prefixo: "/cotacoes", modulo: "cotacoes" },
  { prefixo: "/pedidos", modulo: "pedidos" },
  { prefixo: "/financeiro", modulo: "financeiro" },
  { prefixo: "/relatorios", modulo: "relatorios" },
  { prefixo: "/cadastros", modulo: "cadastros" },
  { prefixo: "/", modulo: "painel" },
];

export function moduloDaRota(pathname: string): ModuloAcesso | null {
  const path = pathname || "/";
  for (const { prefixo, modulo } of ROTAS_MODULO) {
    if (prefixo === "/") {
      if (path === "/") return modulo;
      continue;
    }
    if (path === prefixo || path.startsWith(`${prefixo}/`)) return modulo;
  }
  return null;
}

/**
 * Permissões efetivas do “usuário” simulado (seletor de papel).
 * Se existir pessoa RH com acesso ligada ao perfil/papel, usa os toggles do perfil;
 * senão, cai no padrão do papel.
 */
export function permissoesEfetivasDoPapel(db: Pick<DB, "perfis" | "pessoas">, papel: Papel): PermissoesModulos {
  const perfil = (db.perfis ?? []).find((p) => p.papel === papel);
  const pessoas = (db.pessoas ?? []).filter((p) => p.ativo && p.tem_acesso_sistema);
  const pessoa =
    (perfil ? pessoas.find((p) => p.perfil_id === perfil.id) : undefined) ??
    pessoas.find((p) => p.papel_sistema === papel);

  if (pessoa?.permissoes) {
    return { ...permissoesVaziasCompletas(), ...pessoa.permissoes };
  }
  return permissoesPorPapel(papel);
}

function permissoesVaziasCompletas(): PermissoesModulos {
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

export function podeAcessarModulo(perms: PermissoesModulos, modulo: ModuloAcesso): boolean {
  return Boolean(perms[modulo]);
}
