"use client";

import { Pencil } from "lucide-react";
import type { DB, Produto } from "@/lib/types";
import {
  conteudoTotalEmbalagem,
  modoMioloEmbalagemAtivo,
} from "@/lib/domain/produto-precos";

function formatarDecimalBr(valor: number | undefined): string {
  if (valor === undefined || !Number.isFinite(valor)) return "";
  return String(valor).replace(".", ",");
}

function textoEmbalagem(db: DB, produto: Produto): string {
  const siglaEmb =
    db.unidades.find((u) => u.id === produto.unidade_compra_id)?.sigla ?? "emb";
  const siglaUso =
    db.unidades.find((u) => u.id === produto.unidade_uso_id)?.sigla ?? "uso";
  if (!produto.unidade_compra_id) {
    return `Uso no estoque: ${siglaUso} (sem embalagem de compra)`;
  }
  if (modoMioloEmbalagemAtivo(produto)) {
    return `1 ${siglaEmb} = ${formatarDecimalBr(produto.quantidade_subunidade)} un × ${formatarDecimalBr(
      produto.conteudo_por_subunidade ?? 1
    )} ${siglaUso} = ${formatarDecimalBr(conteudoTotalEmbalagem(produto))} ${siglaUso}`;
  }
  return `1 ${siglaEmb} = ${formatarDecimalBr(produto.fator_conversao)} ${siglaUso}`;
}

export function ResumoProdutoCasado({
  db,
  produto,
  onEditar,
}: {
  db: DB;
  produto: Produto;
  onEditar: () => void;
}) {
  const contaDre = produto.conta_dre_id
    ? db.contas_dre.find((c) => c.id === produto.conta_dre_id)?.nome
    : undefined;

  return (
    <div className="space-y-2 rounded-card border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="space-y-1 text-sm text-slate-700">
        <p>
          <span className="font-medium text-slate-800">Cadastro:</span>{" "}
          {textoEmbalagem(db, produto)}
        </p>
        <p className="text-xs text-slate-600">
          Conta DRE do produto: {contaDre || "—"}
          {produto.entra_no_cmv === false ? " · fora do CMV" : " · entra no CMV"}
        </p>
      </div>
      <button type="button" className="btn-secundario w-full" onClick={onEditar}>
        <Pencil size={16} /> Ver / editar cadastro
      </button>
    </div>
  );
}
