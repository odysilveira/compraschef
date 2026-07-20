"use client";

// Campo de dinheiro no formato brasileiro. Digitação estilo "centavos"
// (como caixa eletrônico): o valor preenche da direita para a esquerda,
// então sempre aparece com vírgula e dois zeros — ex.: 45,00.

interface Props {
  valor?: number;
  onChange: (novo: number | undefined) => void;
  placeholder?: string;
}

export default function CampoMoeda({ valor, onChange, placeholder }: Props) {
  const display =
    valor === undefined || Number.isNaN(valor)
      ? ""
      : valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-stone-400">R$</span>
      <input
        type="text"
        inputMode="numeric"
        className="campo pl-9"
        value={display}
        placeholder={placeholder}
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, "");
          if (digitos === "") {
            onChange(undefined);
            return;
          }
          onChange(parseInt(digitos, 10) / 100);
        }}
      />
    </div>
  );
}
