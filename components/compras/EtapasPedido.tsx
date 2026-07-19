"use client";

// Stepper compacto do status do pedido:
// aguardando aprovação → aprovado → enviado → confirmado → entregue (cancelado à parte)

import { Check } from "lucide-react";
import { Badge } from "@/components/ui";
import type { StatusPedido } from "@/lib/types";

export const ROTULO_STATUS_PEDIDO: Record<StatusPedido, string> = {
  aguardando_aprovacao: "Aguardando aprovação",
  aprovado: "Aprovado",
  enviado: "Enviado",
  confirmado: "Confirmado",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

const ETAPAS: StatusPedido[] = ["aguardando_aprovacao", "aprovado", "enviado", "confirmado", "entregue"];
const ROTULO_CURTO = ["Aprovação", "Aprovado", "Enviado", "Confirmado", "Entregue"];

export function EtapasPedido({ status }: { status: StatusPedido }) {
  if (status === "cancelado") {
    return <Badge cor="vermelho">Cancelado</Badge>;
  }
  const atual = ETAPAS.indexOf(status);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ETAPAS.map((etapa, i) => (
        <div key={etapa} className="flex items-center gap-1">
          {i > 0 && <div className={`h-0.5 w-3 rounded ${i <= atual ? "bg-primaria" : "bg-slate-200"}`} />}
          <span
            title={ROTULO_STATUS_PEDIDO[etapa]}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              i < atual
                ? "bg-sucesso-clara text-primaria-escura"
                : i === atual
                  ? "bg-primaria text-white"
                  : "bg-slate-100 text-slate-400"
            }`}
          >
            {i < atual && <Check className="h-3 w-3" />}
            {ROTULO_CURTO[i]}
          </span>
        </div>
      ))}
    </div>
  );
}
