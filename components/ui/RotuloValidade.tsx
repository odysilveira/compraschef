"use client";

// Rótulo relativo a "hoje" só depois do mount — evita hydration mismatch
// (SSR/Node e browser podem divergir em fuso ou em seed com datas relativas).

import { useEffect, useState } from "react";
import { rotuloValidade } from "@/lib/format";

type Props = {
  iso?: string;
};

export function RotuloValidade({ iso }: Props) {
  const [texto, setTexto] = useState("…");

  useEffect(() => {
    setTexto(rotuloValidade(iso));
  }, [iso]);

  return <span suppressHydrationWarning>{texto}</span>;
}
