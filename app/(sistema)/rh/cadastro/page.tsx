"use client";

// RH — Cadastro da equipe (motoboys e freelancers/CLT).

import { TituloPagina } from "@/components/ui";
import { AbaColaboradores } from "@/components/rh/AbaColaboradores";

export default function RHCadastroPage() {
  return (
    <div>
      <TituloPagina titulo="Cadastro da equipe" subtitulo="Motoboys, freelancers e colaboradores CLT" />
      <AbaColaboradores />
    </div>
  );
}
