"use client";

// Campo numérico grande para uso operacional (tablet/celular na cozinha):
// botões +/− generosos e dígitos grandes, mínimo de toques.

import { Minus, Plus } from "lucide-react";

interface Props {
  valor: number;
  onChange: (novo: number) => void;
  passo?: number;
  min?: number;
  casasDecimais?: number;
  disabled?: boolean;
}

export default function CampoQuantidade({ valor, onChange, passo = 1, min = 0, casasDecimais = 2, disabled = false }: Props) {
  function ajustar(delta: number) {
    const fator = 10 ** casasDecimais;
    const novo = Math.max(min, Math.round((valor + delta) * fator) / fator);
    onChange(novo);
  }

  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        disabled={disabled}
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
        disabled={disabled}
        className="campo min-w-0 flex-1 py-3 text-center text-2xl font-bold"
        value={Number.isFinite(valor) ? valor : ""}
        onChange={(e) => {
          const n = e.target.value === "" ? 0 : Number(e.target.value);
          onChange(Number.isNaN(n) ? 0 : Math.max(min, n));
        }}
      />
      <button
        type="button"
        disabled={disabled}
        className="btn-secundario min-w-[56px] px-0 py-3"
        onClick={() => ajustar(passo)}
        aria-label="Aumentar"
      >
        <Plus size={26} />
      </button>
    </div>
  );
}
