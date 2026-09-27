import { describe, expect, it } from "vitest";
import { criarEstoqueSupabaseReadonly } from "./supabase-readonly";

function clienteFake(tabelas: Record<string, unknown[]>) {
  return {
    from(tabela: string) {
      return {
        select(colunas: string) {
          expect(colunas).toBe("*");
          return Promise.resolve({ data: tabelas[tabela] ?? [], error: null });
        },
      };
    },
  };
}

describe("repositorio Supabase somente leitura", () => {
  it("consulta apenas leituras iniciais de estoque", async () => {
    const repo = criarEstoqueSupabaseReadonly(
      clienteFake({
        caixas: [{ id: "cx-1", numero: 1 }],
        produtos: [{ id: "prod-1", nome: "Produto" }],
        unidades: [{ id: "un-1", sigla: "kg" }],
        locais: [{ id: "loc-1", nome: "Freezer 1" }],
      }) as never
    );

    await expect(repo.listarCaixas()).resolves.toEqual([{ id: "cx-1", numero: 1 }]);
    await expect(repo.listarProdutos()).resolves.toEqual([{ id: "prod-1", nome: "Produto" }]);
    await expect(repo.listarUnidades()).resolves.toEqual([{ id: "un-1", sigla: "kg" }]);
    await expect(repo.listarLocais()).resolves.toEqual([{ id: "loc-1", nome: "Freezer 1" }]);
  });

  it("propaga erro de leitura sem implementar escrita", async () => {
    const repo = criarEstoqueSupabaseReadonly({
      from() {
        return {
          select() {
            return Promise.resolve({ data: null, error: { message: "RLS bloqueou leitura" } });
          },
        };
      },
    } as never);

    await expect(repo.listarCaixas()).rejects.toThrow("Falha ao consultar Supabase");
  });
});
