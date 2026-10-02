"use client";

import { contasDreAtivas, ORDEM_GRUPOS_DRE, ROTULO_GRUPO_DRE } from "@/lib/domain/dre";
import type { DB, GrupoContaDre } from "@/lib/types";

export function SelectContaDre({
  db,
  value,
  onChange,
  grupos,
  opcional = true,
  disabled,
  className = "campo",
}: {
  db: Pick<DB, "contas_dre">;
  value?: string;
  onChange: (contaId: string | undefined) => void;
  /** Se informado, limita os grupos exibidos. */
  grupos?: GrupoContaDre[];
  opcional?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const contas = contasDreAtivas(db).filter((c) => !grupos || grupos.includes(c.grupo));
  const gruposOrd = ORDEM_GRUPOS_DRE.filter((g) => contas.some((c) => c.grupo === g));

  return (
    <select
      className={className}
      disabled={disabled}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
    >
      {opcional ? <option value="">— sem conta DRE —</option> : null}
      {gruposOrd.map((grupo) => (
        <optgroup key={grupo} label={ROTULO_GRUPO_DRE[grupo]}>
          {contas
            .filter((c) => c.grupo === grupo)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}
