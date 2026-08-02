"use client";

// Papéis e permissões. Sem Supabase Auth ainda: o papel ativo é escolhido
// no seletor do topo (simulação) e persiste em localStorage.
// Quando o Auth entrar, o papel virá de perfis.papel do usuário logado.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useDB } from "@/lib/data";
import { permissoesEfetivasDoPapel, podeAcessarModulo } from "@/lib/domain/acesso";
import type { ModuloAcesso, Papel, PermissoesModulos } from "@/lib/types";

const STORAGE_KEY = "compraschef-papel";

export const ROTULO_PAPEL: Record<Papel, string> = {
  dono: "Dono",
  gerente: "Gerente",
  lider: "Líder de cozinha",
  caixa: "Caixa",
};

/** Papéis que podem ver preços, boletos, notas e relatórios financeiros. */
export function podeVerValores(papel: Papel): boolean {
  return papel === "dono" || papel === "gerente";
}

/** Só o dono aprova pedidos. */
export function podeAprovar(papel: Papel): boolean {
  return papel === "dono";
}

interface PapelContexto {
  papel: Papel;
  setPapel: (p: Papel) => void;
}

const Contexto = createContext<PapelContexto>({ papel: "dono", setPapel: () => {} });

export function PapelProvider({ children }: { children: ReactNode }) {
  const [papel, setPapelState] = useState<Papel>("dono");

  useEffect(() => {
    const salvo = localStorage.getItem(STORAGE_KEY) as Papel | null;
    if (salvo && ["dono", "gerente", "lider", "caixa"].includes(salvo)) {
      setPapelState(salvo);
    }
  }, []);

  function setPapel(p: Papel) {
    setPapelState(p);
    localStorage.setItem(STORAGE_KEY, p);
  }

  return <Contexto.Provider value={{ papel, setPapel }}>{children}</Contexto.Provider>;
}

export function usePapel(): PapelContexto {
  return useContext(Contexto);
}

/** Permissões do usuário simulado (pessoa RH do papel, ou padrão do papel). */
export function usePermissoes(): PermissoesModulos {
  const { papel } = usePapel();
  const db = useDB();
  return useMemo(() => permissoesEfetivasDoPapel(db, papel), [db, papel]);
}

export function usePodeAcessarModulo(modulo: ModuloAcesso): boolean {
  const perms = usePermissoes();
  return podeAcessarModulo(perms, modulo);
}
