import { describe, expect, it } from "vitest";
import { criarSupabaseBrowserClient, criarSupabaseServerClient, validarSupabaseEnv } from "./supabase";

describe("fundacao Supabase staging", () => {
  it("mantem Supabase desativado quando variaveis nao existem", () => {
    expect(validarSupabaseEnv({})).toEqual({ configurado: false, motivo: "ausente" });
    expect(criarSupabaseBrowserClient({})).toBeNull();
    expect(criarSupabaseServerClient({})).toBeNull();
  });

  it("rejeita URL invalida sem expor segredos", () => {
    expect(validarSupabaseEnv({ url: "nao-e-url", anonKey: "anon" })).toEqual({
      configurado: false,
      motivo: "url_invalida",
    });
  });

  it("aceita URL http/https e anon key preenchida", () => {
    expect(validarSupabaseEnv({ url: "https://staging.supabase.co", anonKey: "anon" })).toEqual({
      configurado: true,
      url: "https://staging.supabase.co",
      anonKey: "anon",
    });
  });
});
