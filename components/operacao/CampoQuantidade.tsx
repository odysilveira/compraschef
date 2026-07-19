"use client";

// Campo numérico grande para uso operacional (tablet/celular na cozinha):
// botões +/− generosos e dígitos grandes, mínimo de toques.

import { Minus, Plus } from "lucide-react";

interface Props {
  valor: number;
  onChange: (novo: number) => void;
  passo?: number;
  min?: number;
}

export default function CampoQuantidade({ valor, onChange, passo = 1, min = 0 }: Props) {
  function ajustar(delta: number) {
    const novo = Math.max(min, Math.round((valor + delta) * 100) / 100);
    onChange(novo);
  }

  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        className="btn-secundario min-w-[56px] px-0 py-3"
        onClick={() => ajustar(-passo)}
        aria-label="Diminuir"
      >
        <Minus size={26} />
      </button>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        min={min}
        className="campo min-w-0 flex-1 py-3 text-center text-2xl font-bold"
        value={Number.isFinite(valor) ? valor : ""}
        onChange={(e) => {
          const n = e.target.value === "" ? 0 : Number(e.target.value);
          onChange(Number.isNaN(n) ? 0 : Math.max(min, n));
        }}
      />
      <button
        type="button"
        className="btn-secundario min-w-[56px] px-0 py-3"
        onClick={() => ajustar(passo)}
        aria-label="Aumentar"
      >
        <Plus size={26} />
      </button>
    </div>
  );
}
