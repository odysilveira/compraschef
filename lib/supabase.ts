// Fundacao de conexao Supabase para staging.
// Mantem o app em modo mock/localStorage quando as variaveis nao existem.
// Nunca use service_role no frontend.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseEnv {
  url?: string;
  anonKey?: string;
}

export type SupabaseEnvValidation =
  | {
      configurado: true;
      url: string;
      anonKey: string;
    }
  | {
      configurado: false;
      motivo: "ausente" | "url_invalida";
    };

export function lerSupabaseEnv(env: NodeJS.ProcessEnv = process.env): SupabaseEnv {
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export function validarSupabaseEnv(env: SupabaseEnv = lerSupabaseEnv()): SupabaseEnvValidation {
  const url = env.url?.trim();
  const anonKey = env.anonKey?.trim();

  if (!url || !anonKey) {
    return { configurado: false, motivo: "ausente" };
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { configurado: false, motivo: "url_invalida" };
    }
  } catch {
    return { configurado: false, motivo: "url_invalida" };
  }

  return { configurado: true, url, anonKey };
}

export function criarSupabaseBrowserClient(env: SupabaseEnv = lerSupabaseEnv()): SupabaseClient | null {
  const validacao = validarSupabaseEnv(env);
  if (!validacao.configurado) return null;
  return createClient(validacao.url, validacao.anonKey);
}

export function criarSupabaseServerClient(env: SupabaseEnv = lerSupabaseEnv()): SupabaseClient | null {
  const validacao = validarSupabaseEnv(env);
  if (!validacao.configurado) return null;
  return createClient(validacao.url, validacao.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export const supabaseConfigurado = validarSupabaseEnv().configurado;

export const supabase: SupabaseClient | null = criarSupabaseBrowserClient();
