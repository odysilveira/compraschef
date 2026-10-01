"use client";

import Link from "next/link";
import { opcoesOrigemPagamento, temContasCadastradas } from "@/lib/domain/contas-pagamento";
import type { DB } from "@/lib/types";

type Props = {
  db: Pick<DB, "contas_bancarias">;
  valor: string;
  onChange: (valor: string) => void;
  /** id do datalist (único na página) */
  listId: string;
  classNameInput?: string;
};

/** Escolha da conta de origem do restaurante (cadastro ou atalhos). */
export function SeletorContaOrigem({ db, valor, onChange, listId, classNameInput = "campo" }: Props) {
  const opcoes = opcoesOrigemPagamento(db);
  const cadastradas = temContasCadastradas(db);

  return (
    <div className="space-y-2">
      <input
        className={classNameInput}
        required
        list={listId}
        placeholder="Ex.: Itaú — conta corrente"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {opcoes.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <div className="flex flex-wrap gap-1.5">
        {opcoes.map((conta) => (
          <button
            key={conta}
            type="button"
            className={`rounded-full border px-2.5 py-1 text-xs ${
              valor === conta
                ? "border-primaria bg-primaria/10 font-semibold text-primaria-escura"
                : "border-stone-200 bg-white text-slate-600 hover:border-primaria/40"
            }`}
            onClick={() => onChange(conta)}
          >
            {conta.split("—")[0]?.trim()}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        {cadastradas ? (
          <>
            Contas do Cadastros.{" "}
            <Link href="/cadastros?aba=contas" className="font-medium text-primaria-escura underline-offset-2 hover:underline">
              Gerenciar
            </Link>
          </>
        ) : (
          <>
            Ainda sem contas cadastradas — usando atalhos.{" "}
            <Link href="/cadastros?aba=contas" className="font-medium text-primaria-escura underline-offset-2 hover:underline">
              Cadastrar contas do restaurante
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
