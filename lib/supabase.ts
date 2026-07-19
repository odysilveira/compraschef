// Cliente Supabase — pronto para quando a conta existir.
// Enquanto NEXT_PUBLIC_SUPABASE_URL não estiver definido no .env.local,
// o app usa a camada mock em lib/data e este cliente fica desativado.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigurado = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = supabaseConfigurado
  ? createClient(url as string, anonKey as string)
  : null;
