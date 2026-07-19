"use client";

// Financeiro — agenda de boletos (requisitos 27–30).
// Protegida: líder/caixa não veem nada daqui (podeVerValores).

import { useState } from "react";
import {
  Ban,
  CircleCheck,
  CircleCheckBig,
  Lock,
  Phone,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { Badge, Card, Modal, TituloPagina, Vazio } from "@/components/ui";
import { mutate, nomeFornecedor, useDB } from "@/lib/data";
import { podeVerValores, usePapel } from "@/lib/roles";
import { dataBR, diasAte, moeda } from "@/lib/format";
import type { Boleto, DB, StatusBoleto } from "@/lib/types";

const MARCA_GOLPE = "GOLPE CONFIRMADO";

function fornecedorDoBoleto(db: DB, boleto: Boleto): string {
  const nota = db.notas_fiscais.find((n) => n.id === boleto.nota_id);
  return nomeFornecedor(db, nota?.fornecedor_id);
}

function golpeConfirmado(b: Boleto): boolean {
  return b.status === "suspeito" && Boolean(b.observacao?.startsWith(MARCA_GOLPE));
}

function BadgeStatus({ boleto }: { boleto: Boleto }) {
  if (golpeConfirmado(boleto)) {
    return (
      <Badge cor="cinza">
        <Ban size={14} /> golpe — cancelado
      </Badge>
    );
  }
  switch (boleto.status) {
    case "travado":
      return (
        <Badge cor="cinza">
          <Lock size={14} /> travado
        </Badge>
      );
    case "liberado":
      return (
        <Badge cor="verde">
          <CircleCheck size={14} /> liberado
        </Badge>
      );
    case "pago":
      return (
        <Badge cor="verde">
          <CircleCheckBig size={14} /> pago
        </Badge>
      );
    case "suspeito":
      return (
        <Badge cor="vermelho">
          <TriangleAlert size={14} /> suspeito
        </Badge>
      );
  }
}

export default function FinanceiroPage() {
  const db = useDB();
  const { papel } = usePapel();
  const [confirmandoLiberacao, setConfirmandoLiberacao] = useState<string | null>(null);

  if (!podeVerValores(papel)) {
    return (
      <div className="mx-auto max-w-lg">
        <TituloPagina titulo="Financeiro" />
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Lock size={48} className="text-slate-400" />
          <p className="text-lg font-bold">Área restrita</p>
          <p className="text-sm text-slate-600">
            Boletos, notas e valores são visíveis apenas para o dono e o gerente. Se precisar de algo daqui, fale com
            eles.
          </p>
        </Card>
      </div>
    );
  }

  function mudarBoleto(id: string, mudanca: (b: Boleto) => void) {
    mutate((d) => {
      const b = d.boletos.find((x) => x.id === id);
      if (b) mudanca(b);
    });
  }

  function marcarPago(b: Boleto) {
    mudarBoleto(b.id, (x) => {
      x.status = "pago";
    });
  }

  function liberarMesmoAssim(b: Boleto) {
    mudarBoleto(b.id, (x) => {
      x.status = "liberado";
      x.observacao = "Liberado manualmente antes da conferência da mercadoria";
    });
    setConfirmandoLiberacao(null);
  }

  function confirmarLegitimo(b: Boleto) {
    mudarBoleto(b.id, (x) => {
      x.status = "liberado";
      x.observacao = "Confirmado com o fornecedor por telefone — boleto legítimo";
    });
  }

  function confirmarGolpe(b: Boleto) {
    const ok = window.confirm(
      "Confirmar que este boleto é um golpe? Ele será cancelado e ficará arquivado como fraude. Não pague este boleto."
    );
    if (!ok) return;
    mudarBoleto(b.id, (x) => {
      x.observacao = `${MARCA_GOLPE} — boleto cancelado em ${dataBR(new Date().toISOString())}. Não pagar. Avise o fornecedor e o banco.`;
    });
  }

  const suspeitos = db.boletos.filter((b) => b.status === "suspeito" && !golpeConfirmado(b));

  // Agenda: atrasados + próximos 7 dias
  const naJanela = db.boletos.filter((b) => {
    const dias = diasAte(b.vencimento);
    return dias !== undefined && dias <= 7;
  });
  const depoisDaSemana = db.boletos.filter((b) => {
    const dias = diasAte(b.vencimento);
    return dias !== undefined && dias > 7;
  });

  // Totais da semana por status
  const totais: Record<StatusBoleto, number> = { travado: 0, liberado: 0, pago: 0, suspeito: 0 };
  naJanela.forEach((b) => {
    totais[b.status] += b.valor;
  });

  // Agrupa por dia de vencimento
  const porDia = new Map<string, Boleto[]>();
  [...naJanela]
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .forEach((b) => {
      const lista = porDia.get(b.vencimento) ?? [];
      lista.push(b);
      porDia.set(b.vencimento, lista);
    });

  function rotuloDia(iso: string): string {
    const dias = diasAte(iso);
    if (dias === undefined) return dataBR(iso);
    if (dias < 0) return `Atrasado — venceu ${dataBR(iso)}`;
    if (dias === 0) return `Hoje — ${dataBR(iso)}`;
    if (dias === 1) return `Amanhã — ${dataBR(iso)}`;
    return `${dataBR(iso)} (em ${dias} dias)`;
  }

  function CartaoBoleto({ boleto }: { boleto: Boleto }) {
    const cancelado = golpeConfirmado(boleto);
    const atrasado = (diasAte(boleto.vencimento) ?? 0) < 0 && boleto.status !== "pago";
    return (
      <Card
        className={`space-y-2 ${cancelado ? "opacity-60" : ""} ${
          boleto.status === "suspeito" && !cancelado ? "border-2 border-erro" : ""
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={cancelado ? "line-through" : ""}>
            <p className="font-bold">{fornecedorDoBoleto(db, boleto)}</p>
            <p className="text-xl font-bold">{moeda(boleto.valor)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <BadgeStatus boleto={boleto} />
            {atrasado && !cancelado && <Badge cor="vermelho">atrasado</Badge>}
          </div>
        </div>

        {boleto.status === "travado" && (
          <p className="flex items-center gap-1.5 text-sm text-slate-500">
            <Lock size={14} /> aguardando conferência da mercadoria
          </p>
        )}
        {boleto.observacao && (
          <p className={`text-sm ${boleto.status === "suspeito" && !cancelado ? "font-semibold text-erro" : "text-slate-600"}`}>
            {boleto.observacao}
          </p>
        )}

        {!cancelado && (
          <div className="flex flex-wrap gap-2 pt-1">
            {boleto.status === "liberado" && (
              <button className="btn-primario" onClick={() => marcarPago(boleto)}>
                <CircleCheckBig size={18} /> Marcar como pago
              </button>
            )}
            {boleto.status === "travado" && (
              <button className="btn-secundario" onClick={() => setConfirmandoLiberacao(boleto.id)}>
                Liberar mesmo assim
              </button>
            )}
            {boleto.status === "suspeito" && (
              <>
                <button className="btn-secundario" onClick={() => confirmarLegitimo(boleto)}>
                  <Phone size={18} /> Confirmei — é legítimo
                </button>
                <button className="btn-perigo" onClick={() => confirmarGolpe(boleto)}>
                  <Ban size={18} /> Confirmado golpe — cancelar
                </button>
              </>
            )}
          </div>
        )}
      </Card>
    );
  }

  const boletoLiberando = db.boletos.find((b) => b.id === confirmandoLiberacao);

  return (
    <div className="space-y-4">
      <TituloPagina titulo="Financeiro" />

      {/* Alerta de boleto suspeito */}
      {suspeitos.map((b) => (
        <div key={b.id} className="rounded-card border-2 border-erro bg-erro-clara p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert size={32} className="mt-0.5 shrink-0 text-erro" />
            <div className="space-y-1">
              <p className="text-lg font-bold text-erro">Atenção: possível golpe do boleto!</p>
              <p className="text-sm text-texto">
                Boleto de <span className="font-bold">{moeda(b.valor)}</span> em nome de{" "}
                <span className="font-bold">{fornecedorDoBoleto(db, b)}</span>, vencendo {dataBR(b.vencimento)}.
              </p>
              {b.observacao && <p className="text-sm font-semibold text-erro">{b.observacao}</p>}
              {b.cnpj_beneficiario && (
                <p className="text-sm text-texto">CNPJ do beneficiário no boleto: {b.cnpj_beneficiario}</p>
              )}
              <p className="flex items-center gap-1.5 text-sm font-bold text-erro">
                <Phone size={16} /> NÃO pague — confirme com o fornecedor por telefone antes de qualquer coisa.
              </p>
            </div>
          </div>
        </div>
      ))}

      {/* Totais da semana */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="py-3">
          <p className="rotulo flex items-center gap-1">
            <Lock size={13} /> Travados
          </p>
          <p className="text-xl font-bold text-slate-600">{moeda(totais.travado)}</p>
        </Card>
        <Card className="py-3">
          <p className="rotulo flex items-center gap-1">
            <CircleCheck size={13} /> Liberados
          </p>
          <p className="text-xl font-bold text-primaria">{moeda(totais.liberado)}</p>
        </Card>
        <Card className="py-3">
          <p className="rotulo flex items-center gap-1">
            <CircleCheckBig size={13} /> Pagos
          </p>
          <p className="text-xl font-bold text-primaria-escura">{moeda(totais.pago)}</p>
        </Card>
        <Card className="py-3">
          <p className="rotulo flex items-center gap-1">
            <TriangleAlert size={13} /> Suspeitos
          </p>
          <p className="text-xl font-bold text-erro">{moeda(totais.suspeito)}</p>
        </Card>
      </div>

      {/* Agenda da semana */}
      <section className="space-y-4">
        <h2>Agenda da semana</h2>
        {porDia.size === 0 ? (
          <Vazio mensagem="Nenhum boleto vencendo nos próximos 7 dias. Semana tranquila!" />
        ) : (
          Array.from(porDia.entries()).map(([dia, boletos]) => (
            <div key={dia} className="space-y-2">
              <p className={`rotulo ${(diasAte(dia) ?? 0) < 0 ? "text-erro" : ""}`}>{rotuloDia(dia)}</p>
              {boletos.map((b) => (
                <CartaoBoleto key={b.id} boleto={b} />
              ))}
            </div>
          ))
        )}
      </section>

      {/* Depois da semana */}
      {depoisDaSemana.length > 0 && (
        <section className="space-y-2">
          <h2>Depois desta semana</h2>
          {[...depoisDaSemana]
            .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
            .map((b) => (
              <CartaoBoleto key={b.id} boleto={b} />
            ))}
        </section>
      )}

      {/* Confirmação "Liberar mesmo assim" */}
      <Modal
        aberto={Boolean(boletoLiberando)}
        titulo="Liberar sem conferência?"
        onFechar={() => setConfirmandoLiberacao(null)}
      >
        {boletoLiberando && (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              Este boleto de <span className="font-bold">{moeda(boletoLiberando.valor)}</span> (
              {fornecedorDoBoleto(db, boletoLiberando)}) está travado porque a mercadoria ainda não foi conferida.
            </p>
            <p className="rounded-card bg-destaque-clara p-3 text-sm font-semibold text-destaque">
              Risco: se a entrega vier com falta ou avaria depois do pagamento, fica muito mais difícil negociar o
              desconto ou a devolução com o fornecedor.
            </p>
            <div className="flex gap-2">
              <button className="btn-perigo flex-1" onClick={() => liberarMesmoAssim(boletoLiberando)}>
                Liberar mesmo assim
              </button>
              <button className="btn-secundario flex-1" onClick={() => setConfirmandoLiberacao(null)}>
                Manter travado
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
