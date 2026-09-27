"use client";

// Pagamento semanal dos motoboys — lote fechado de uma vez, cada linha vira um
// PagamentoRH marcado com o mesmo fechamento_semana_id (ver docs/01-banco-de-dados.md).

import { useState } from "react";
import { QrCode } from "lucide-react";
import { Campo, StatCard, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import { hojeISO } from "@/lib/rh";
import { maskChave } from "@/lib/pix";
import { moeda } from "@/lib/format";
import type { Colaborador } from "@/lib/types";
import { PagamentoQRModal } from "./PagamentoQRModal";

function parseValor(raw: string): number {
  if (!raw) return NaN;
  let s = raw.trim().replace(/[^\d,.-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  return parseFloat(s);
}

export function AbaPagamentosMotoboy() {
  const db = useDB();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [bancoIds, setBancoIds] = useState<Record<string, string>>({});
  const [dataPagamento, setDataPagamento] = useState(hojeISO());
  const [qrColaborador, setQrColaborador] = useState<Colaborador | null>(null);

  const motoboys = db.colaboradores
    .filter((c) => c.ativo && c.categoria === "motoboy")
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const bancos = db.bancos;

  const preenchidos = motoboys.filter((m) => isFinite(parseValor(valores[m.id] || "")) && parseValor(valores[m.id] || "") > 0);
  const totalPrevisto = preenchidos.reduce((s, m) => s + parseValor(valores[m.id] || ""), 0);

  function adicionarBanco() {
    const nome = window.prompt("Nome do novo banco:");
    if (!nome || !nome.trim()) return;
    mutate((banco) => {
      banco.bancos.push({ id: uid("banco"), nome: nome.trim() });
    });
  }

  function fecharSemana() {
    if (preenchidos.length === 0) {
      window.alert("Nenhum valor preenchido ainda.");
      return;
    }
    const semBanco = preenchidos.filter((m) => !bancoIds[m.id]);
    if (semBanco.length > 0) {
      window.alert(`Selecione o banco pago para: ${semBanco.map((m) => m.nome).join(", ")}`);
      return;
    }
    if (
      !window.confirm(
        `Fechar a semana com ${preenchidos.length} pagamento(s) totalizando ${moeda(totalPrevisto)}? Os valores vão para o histórico e o formulário é limpo.`
      )
    ) {
      return;
    }
    const fechamentoId = uid("fech");
    mutate((banco) => {
      for (const m of preenchidos) {
        banco.pagamentos_rh.push({
          id: uid("pag"),
          colaborador_id: m.id,
          valor: parseValor(valores[m.id]),
          data_pagamento: dataPagamento,
          banco_id: bancoIds[m.id],
          fechamento_semana_id: fechamentoId,
          criado_em: new Date().toISOString(),
        });
      }
    });
    setValores({});
    setBancoIds({});
  }

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard rotulo="Motoboys ativos" valor={motoboys.length} cor="cinza" />
        <StatCard rotulo="Com valor preenchido" valor={preenchidos.length} cor="amarelo" />
        <StatCard rotulo="Total previsto" valor={moeda(totalPrevisto)} cor="verde" />
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-xs">
          <Campo rotulo="Data do pagamento">
            <input type="date" className="campo" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
          </Campo>
        </div>
        <button type="button" className="btn-secundario" onClick={adicionarBanco}>
          + Novo banco
        </button>
      </div>

      {motoboys.length === 0 ? (
        <Vazio mensagem="Nenhum motoboy cadastrado ainda." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {motoboys.map((m) => {
            const valor = parseValor(valores[m.id] || "");
            const podeGerarPix = isFinite(valor) && valor > 0;
            return (
              <div key={m.id} className="card">
                <p className="font-semibold">{m.nome}</p>
                <p className="mb-3 text-xs text-stone-500" title={m.chave}>
                  {maskChave(m.tipo_chave, m.chave)}
                </p>
                <div className="mb-2">
                  <Campo rotulo="Valor (R$)">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="campo"
                      placeholder="0,00"
                      value={valores[m.id] ?? ""}
                      onChange={(e) => setValores((v) => ({ ...v, [m.id]: e.target.value }))}
                    />
                  </Campo>
                </div>
                <div className="mb-3">
                  <Campo rotulo="Banco pago">
                    <select className="campo" value={bancoIds[m.id] ?? ""} onChange={(e) => setBancoIds((v) => ({ ...v, [m.id]: e.target.value }))}>
                      <option value="">Selecione…</option>
                      {bancos.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.nome}
                        </option>
                      ))}
                    </select>
                  </Campo>
                </div>
                <button type="button" className="btn-secundario w-full justify-center" disabled={!podeGerarPix} onClick={() => setQrColaborador(m)}>
                  <QrCode size={16} /> Gerar Pix
                </button>
              </div>
            );
          })}
        </div>
      )}

      {motoboys.length > 0 && (
        <div className="mt-5 flex justify-end">
          <button type="button" className="btn-primario" onClick={fecharSemana}>
            Fechar semana
          </button>
        </div>
      )}

      <PagamentoQRModal
        colaborador={qrColaborador}
        valor={qrColaborador ? parseValor(valores[qrColaborador.id] || "") : 0}
        descricao="Pagamento motoboy"
        onFechar={() => setQrColaborador(null)}
      />
    </div>
  );
}
