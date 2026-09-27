"use client";

// Página PÚBLICA de autoatribuição de vaga em aberto — fora do AppShell, sem login,
// mobile-first, no mesmo molde de app/cotacao/[token]. A pessoa abre o link que
// recebeu por WhatsApp, digita o nome e confirma que vai cobrir aquele turno.
//
// LIMITAÇÃO CONHECIDA: o ComprasChef ainda roda 100% em localStorage por navegador
// (sem Supabase conectado — ver docs/01-banco-de-dados.md e o roadmap do projeto).
// Isso significa que confirmar aqui só atualiza a escala se este link for aberto no
// MESMO navegador/aparelho onde o restaurante administra o sistema. Um motoboy
// abrindo o link no celular dele, em outro navegador, não vai ver a vaga nem
// conseguir confirmar nada de verdade — a tela abaixo funciona, mas fica "isolada"
// até o Supabase ser configurado. Não removemos esse aviso do código: quando o
// backend real existir, esta tela passa a funcionar entre aparelhos sem mudanças.

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { mutate, useDB } from "@/lib/data";
import type { Turno } from "@/lib/types";

const TURNO_LABEL: Record<Turno, string> = { almoco: "Almoço", jantar: "Jantar" };

function dataExtenso(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const texto = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function VagaRHPublicaPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const db = useDB();

  const [pronto, setPronto] = useState(false);
  const [nome, setNome] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => setPronto(true), []);

  const vaga = db.escala_atribuicoes.find((x) => x.token_vaga === token);

  function confirmar() {
    if (!vaga) return;
    if (!nome.trim()) {
      setErro("Escreva seu nome antes de confirmar.");
      return;
    }
    setErro(null);
    const vagaId = vaga.id;
    const nomeFinal = nome.trim();
    mutate((d) => {
      const atual = d.escala_atribuicoes.find((x) => x.id === vagaId);
      if (!atual || !atual.vaga_aberta) return;
      atual.vaga_aberta = false;
      atual.nome = nomeFinal;
      atual.nome_reivindicado = nomeFinal;
      atual.reivindicada_em = new Date().toISOString();
    });
    setConfirmado(true);
  }

  let conteudo: ReactNode;

  if (!pronto) {
    conteudo = null;
  } else if (!vaga) {
    conteudo = (
      <div className="card py-10 text-center">
        <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-destaque" />
        <h2 className="mb-2">Link inválido</h2>
        <p className="text-sm text-slate-600">
          Este link de vaga não existe ou foi removido. Fale com o restaurante para receber um novo link.
        </p>
      </div>
    );
  } else if (!vaga.vaga_aberta && !confirmado) {
    conteudo = (
      <div className="card py-10 text-center">
        <XCircle className="mx-auto mb-3 h-12 w-12 text-slate-400" />
        <h2 className="mb-2">Vaga já preenchida</h2>
        <p className="text-sm text-slate-600">
          A vaga de {dataExtenso(vaga.data)} — {TURNO_LABEL[vaga.turno]} já foi preenchida
          {vaga.nome_reivindicado ? ` por ${vaga.nome_reivindicado}` : ""}. Obrigado por dar uma olhada!
        </p>
      </div>
    );
  } else if (confirmado) {
    conteudo = (
      <div className="card py-10 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-primaria" />
        <h2 className="mb-2">Vaga confirmada!</h2>
        <p className="text-sm text-slate-600">
          {nome}, você está escalado(a) pra {dataExtenso(vaga.data)} — {TURNO_LABEL[vaga.turno]}. Até lá!
        </p>
      </div>
    );
  } else {
    conteudo = (
      <div className="space-y-4">
        <div className="card">
          <p className="text-sm text-slate-500">Vaga em aberto</p>
          <h2 className="mt-1">
            {dataExtenso(vaga.data)} — {TURNO_LABEL[vaga.turno]}
          </h2>
        </div>

        <div className="card">
          <label className="block">
            <span className="rotulo mb-1 block">Como você quer aparecer na escala</span>
            <input
              className="campo"
              placeholder="Seu nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
            />
          </label>
        </div>

        {erro && <div className="rounded-card bg-erro-clara px-4 py-3 text-sm font-medium text-erro">{erro}</div>}

        <button className="btn-gigante" onClick={confirmar}>
          Confirmar — eu vou trabalhar nesse turno
        </button>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-fundo">
      <header className="bg-primaria px-4 py-4 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">ComprasChef · RH</p>
        <h1 className="!text-xl">Cobrir um turno</h1>
      </header>
      <div className="mx-auto max-w-md px-4 py-6">{conteudo}</div>
    </main>
  );
}
