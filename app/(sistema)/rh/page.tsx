"use client";

// Painel resumo do RH: equipe ativa, pagamentos do mês e vagas em aberto próximas.

import { Search } from "lucide-react";
import { StatCard, Vazio } from "@/components/ui";
import CartaoAlerta from "@/components/operacao/CartaoAlerta";
import { useDB } from "@/lib/data";
import { copiarLinkVaga, hojeISO } from "@/lib/rh";
import { moeda, dataBR } from "@/lib/format";
import type { Colaborador } from "@/lib/types";

const TURNO_LABEL = { almoco: "Almoço", jantar: "Jantar" } as const;

function categoria(c?: Colaborador): "motoboy" | "freelancer" | "clt" | "outro" {
  if (!c) return "outro";
  if (c.categoria === "motoboy") return "motoboy";
  return c.clt ? "clt" : "freelancer";
}

export default function RHPainelPage() {
  const db = useDB();
  const hoje = hojeISO();

  const ativos = db.colaboradores.filter((c) => c.ativo);
  const motoboys = ativos.filter((c) => c.categoria === "motoboy").length;
  const freelancers = ativos.filter((c) => c.categoria === "freelancer" && !c.clt).length;
  const clt = ativos.filter((c) => c.categoria === "freelancer" && c.clt).length;

  const mesAtual = hoje.slice(0, 7);
  const pagamentosMes = db.pagamentos_rh.filter((p) => p.data_pagamento.slice(0, 7) === mesAtual);
  const colaboradorPorId = new Map(db.colaboradores.map((c) => [c.id, c]));
  const totalMes = pagamentosMes.reduce((s, p) => s + p.valor, 0);
  const totalMesMotoboy = pagamentosMes.filter((p) => categoria(colaboradorPorId.get(p.colaborador_id)) === "motoboy").reduce((s, p) => s + p.valor, 0);
  const totalMesEquipe = totalMes - totalMesMotoboy;

  const vagasAbertas = db.escala_atribuicoes
    .filter((x) => x.vaga_aberta && x.data >= hoje)
    .sort((a, b) => a.data.localeCompare(b.data) || a.turno.localeCompare(b.turno));

  return (
    <div className="space-y-6">
      <h1>RH</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard rotulo="Equipe ativa" valor={ativos.length} cor="cinza" />
        <StatCard rotulo="Motoboys" valor={motoboys} cor="amarelo" />
        <StatCard rotulo="Freelancers" valor={freelancers} cor="verde" />
        <StatCard rotulo="CLT" valor={clt} cor="laranja" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard rotulo="Pago este mês" valor={moeda(totalMes)} cor="cinza" />
        <StatCard rotulo="Motoboys este mês" valor={moeda(totalMesMotoboy)} cor="amarelo" />
        <StatCard rotulo="Freelancers/CLT este mês" valor={moeda(totalMesEquipe)} cor="verde" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <CartaoAlerta href="/rh/escala" titulo="Vagas em aberto pra cobrir" numero={vagasAbertas.length} icone={Search} cor="vermelho" />
      </div>

      <section>
        <h2 className="mb-3">Vagas em aberto</h2>
        {vagasAbertas.length === 0 ? (
          <Vazio mensagem="Nenhuma vaga em aberto no momento." />
        ) : (
          <div className="card divide-y divide-stone-100 p-0">
            {vagasAbertas.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <p className="font-semibold">
                    {dataBR(v.data)} — {TURNO_LABEL[v.turno]}
                  </p>
                </div>
                {v.token_vaga && (
                  <button type="button" className="btn-secundario" onClick={() => copiarLinkVaga(v.token_vaga!)}>
                    Copiar link
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
