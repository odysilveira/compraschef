"use client";

// Relatórios — requisito 46: consumo médio, gasto por fornecedor/mês e histórico de preços.
// Protegido: líder e caixa não veem valores (requisito 48).

import { Lock } from "lucide-react";
import { Card, TituloPagina } from "@/components/ui";
import { podeVerValores, ROTULO_PAPEL, usePapel } from "@/lib/roles";
import { ConsumoMedio } from "@/components/relatorios/ConsumoMedio";
import { GastoFornecedor } from "@/components/relatorios/GastoFornecedor";
import { HistoricoPrecos } from "@/components/relatorios/HistoricoPrecos";

export default function RelatoriosPage() {
  const { papel } = usePapel();

  if (!podeVerValores(papel)) {
    return (
      <div>
        <TituloPagina titulo="Relatórios" />
        <Card className="flex items-start gap-3">
          <Lock size={22} className="mt-0.5 shrink-0 text-slate-400" />
          <div>
            <p className="font-semibold">Acesso restrito</p>
            <p className="mt-1 text-sm text-slate-600">
              O papel <strong>{ROTULO_PAPEL[papel]}</strong> não tem acesso aos relatórios, pois eles mostram preços e
              valores. Peça ao dono ou ao gerente se precisar de alguma informação daqui.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <TituloPagina titulo="Relatórios" />
      <div className="space-y-6">
        <ConsumoMedio />
        <GastoFornecedor />
        <HistoricoPrecos />
      </div>
    </div>
  );
}
