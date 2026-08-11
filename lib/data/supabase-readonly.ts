import type { SupabaseClient } from "@supabase/supabase-js";
import type { Caixa, Local, Produto, Unidade } from "../types";
import { criarSupabaseBrowserClient, criarSupabaseServerClient } from "../supabase";

export interface EstoqueSupabaseReadonly {
  listarCaixas(): Promise<Caixa[]>;
  listarProdutos(): Promise<Produto[]>;
  listarUnidades(): Promise<Unidade[]>;
  listarLocais(): Promise<Local[]>;
}

function erroSupabase(operacao: string, message: string): Error {
  return new Error(`Falha ao consultar Supabase (${operacao}): ${message}`);
}

async function listarTabela<T>(client: SupabaseClient, tabela: string): Promise<T[]> {
  const { data, error } = await client.from(tabela).select("*");
  if (error) throw erroSupabase(tabela, error.message);
  return (data ?? []) as T[];
}

export function criarEstoqueSupabaseReadonly(client: SupabaseClient): EstoqueSupabaseReadonly {
  return {
    listarCaixas: () => listarTabela<Caixa>(client, "caixas"),
    listarProdutos: () => listarTabela<Produto>(client, "produtos"),
    listarUnidades: () => listarTabela<Unidade>(client, "unidades"),
    listarLocais: () => listarTabela<Local>(client, "locais"),
  };
}

export function criarEstoqueSupabaseReadonlyBrowser(): EstoqueSupabaseReadonly | null {
  const client = criarSupabaseBrowserClient();
  return client ? criarEstoqueSupabaseReadonly(client) : null;
}

export function criarEstoqueSupabaseReadonlyServer(): EstoqueSupabaseReadonly | null {
  const client = criarSupabaseServerClient();
  return client ? criarEstoqueSupabaseReadonly(client) : null;
}
