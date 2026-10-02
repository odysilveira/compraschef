"use client";

import { useMemo, useState } from "react";
import { TituloPagina, Card } from "@/components/ui";
import { useDB } from "@/lib/data";
import {
  calcularDrePeriodo,
  ORDEM_GRUPOS_DRE,
  ROTULO_GRUPO_DRE,
} from "@/lib/domain/dre";
import { moeda } from "@/lib/format";
import type { GrupoContaDre } from "@/lib/types";

function mesAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function CorStat({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <Card className={destaque ? "border-2 border-primaria/30" : undefined}>
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{rotulo}</p>
      <p className={`mt-1 text-xl font-bold ${destaque ? "text-primaria-escura" : "text-stone-900"}`}>
        {valor}
      </p>
    </Card>
  );
}

export default function DrePage() {
  const db = useDB();
  const [anoMes, setAnoMes] = useState(mesAtual);

  const dre = useMemo(() => calcularDrePeriodo(db, anoMes), [db, anoMes]);

  const linhasPorGrupo = useMemo(() => {
    const mapa = new Map<GrupoContaDre, typeof dre.linhas>();
    for (const g of ORDEM_GRUPOS_DRE) mapa.set(g, []);
    for (const linha of dre.linhas) {
      mapa.get(linha.grupo)?.push(linha);
    }
    return mapa;
  }, [dre.linhas]);

  return (
    <div>
      <TituloPagina
        titulo="DRE gerencial"
        subtitulo="Receitas, deduções, CMV, custos fixos e pessoal variável do período"
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-stone-600">Competência</span>
          <input
            type="month"
            className="campo w-auto"
            value={anoMes}
            onChange={(e) => setAnoMes(e.target.value)}
          />
        </label>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CorStat rotulo="Receita bruta" valor={moeda(dre.receita_bruta)} />
        <CorStat rotulo="Deduções" valor={moeda(dre.deducoes)} />
        <CorStat rotulo="Receita líquida" valor={moeda(dre.receita_liquida)} />
        <CorStat
          rotulo="Resultado do período"
          valor={moeda(dre.resultado)}
          destaque
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CorStat
          rotulo="CMV fichas (teórico)"
          valor={moeda(dre.cmv_fichas)}
        />
        <CorStat
          rotulo="CMV compras food"
          valor={moeda(dre.cmv_compras_food)}
        />
        <CorStat rotulo="Custos variáveis (DRE)" valor={moeda(dre.custos_variaveis)} />
        <CorStat rotulo="Depreciação no mês" valor={moeda(dre.depreciacao_mes)} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CorStat rotulo="Fixo operação" valor={moeda(dre.fixo_operacao)} />
        <CorStat rotulo="Fixo ocupação" valor={moeda(dre.fixo_ocupacao)} />
        <CorStat rotulo="Fixo pessoal" valor={moeda(dre.fixo_pessoal)} />
        <CorStat rotulo="Pessoal variável" valor={moeda(dre.pessoal_variavel)} />
      </div>

      <div className="space-y-5">
        {ORDEM_GRUPOS_DRE.map((grupo) => {
          const linhas = linhasPorGrupo.get(grupo) ?? [];
          const total = dre.totais_por_grupo[grupo] ?? 0;
          if (linhas.length === 0 && total === 0) return null;
          return (
            <Card key={grupo} className="p-0 overflow-hidden">
              <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-3">
                <h2 className="text-sm font-bold text-stone-800">{ROTULO_GRUPO_DRE[grupo]}</h2>
                <span className="text-sm font-semibold">{moeda(total)}</span>
              </div>
              <ul className="divide-y divide-stone-100">
                {linhas.map((linha) => (
                  <li
                    key={linha.conta_id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                  >
                    <span className="text-stone-700">{linha.nome}</span>
                    <span className="font-medium tabular-nums">{moeda(linha.valor)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      {dre.linhas.length === 0 && (
        <p className="mt-4 text-sm text-stone-500">
          Sem lançamentos neste mês. Use o Fechamento do dia, confira NFs com conta DRE, cadastre
          equipamentos e marque contas a pagar com conta DRE.
        </p>
      )}
    </div>
  );
}
