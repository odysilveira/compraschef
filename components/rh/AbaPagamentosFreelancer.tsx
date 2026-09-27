"use client";

// Pagamento de freelancers e CLT — um registro por instância de pagamento,
// podendo cobrir vários dias trabalhados seguidos (ver PagamentoRH.dias_trabalhados).

import { useState, type FormEvent } from "react";
import { QrCode } from "lucide-react";
import { Badge, Campo, Modal, StatCard, Tabela, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import { hojeISO, intervaloDeDias } from "@/lib/rh";
import { maskChave } from "@/lib/pix";
import { moeda } from "@/lib/format";
import type { Colaborador, OrigemPagamento } from "@/lib/types";
import { BarraBusca, contem } from "@/components/cadastros/comum";
import { PagamentoQRModal } from "./PagamentoQRModal";

const ORIGENS: { id: OrigemPagamento; rotulo: string }[] = [
  { id: "diaria", rotulo: "Diária" },
  { id: "uber", rotulo: "Uber" },
  { id: "adiantamento_salario", rotulo: "Adiantamento de salário" },
  { id: "pagamento_salario", rotulo: "Pagamento de salário" },
  { id: "outro", rotulo: "Outro" },
];

interface FormPagamento {
  valor: string;
  trabalho_de: string;
  trabalho_ate: string;
  data_pagamento: string;
  banco_id: string;
  origem: OrigemPagamento | "";
  observacao: string;
}

function formPadrao(colaborador: Colaborador): FormPagamento {
  const hoje = hojeISO();
  return {
    valor: "",
    trabalho_de: hoje,
    trabalho_ate: hoje,
    data_pagamento: hoje,
    banco_id: "",
    origem: colaborador.clt ? "" : "diaria",
    observacao: "",
  };
}

function parseValor(raw: string): number {
  if (!raw) return NaN;
  let s = raw.trim().replace(/[^\d,.-]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  return parseFloat(s);
}

export function AbaPagamentosFreelancer() {
  const db = useDB();
  const [busca, setBusca] = useState("");
  const [pagando, setPagando] = useState<Colaborador | null>(null);
  const [form, setForm] = useState<FormPagamento | null>(null);
  const [qrColaborador, setQrColaborador] = useState<Colaborador | null>(null);

  const lista = db.colaboradores
    .filter((c) => c.ativo && c.categoria === "freelancer")
    .filter((c) => contem(busca, c.nome, c.nome_social, c.cpf))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const total = lista.length;
  const clt = lista.filter((c) => c.clt).length;
  const avulsos = total - clt;

  function abrirPagamento(c: Colaborador) {
    setPagando(c);
    setForm(formPadrao(c));
  }

  function alterar(mudanca: Partial<FormPagamento>) {
    setForm((atual) => (atual ? { ...atual, ...mudanca } : atual));
  }

  const dias = form ? intervaloDeDias(form.trabalho_de, form.trabalho_ate) : [];

  function confirmarPagamento(e: FormEvent) {
    e.preventDefault();
    if (!pagando || !form) return;
    const valor = parseValor(form.valor);
    if (!isFinite(valor) || valor <= 0) {
      window.alert("Informe um valor válido.");
      return;
    }
    if (!form.banco_id) {
      window.alert("Selecione o banco pago.");
      return;
    }
    if (!form.origem) {
      window.alert("Selecione a origem do pagamento.");
      return;
    }
    if (dias.length === 0) {
      window.alert("A data final do trabalho não pode ser antes da inicial.");
      return;
    }
    if (dias.length > 14) {
      window.alert("Intervalo de dias muito grande — confira as datas.");
      return;
    }
    mutate((banco) => {
      banco.pagamentos_rh.push({
        id: uid("pag"),
        colaborador_id: pagando.id,
        valor,
        data_pagamento: form.data_pagamento,
        banco_id: form.banco_id,
        origem: form.origem as OrigemPagamento,
        dias_trabalhados: dias,
        observacao: form.observacao || undefined,
        criado_em: new Date().toISOString(),
      });
    });
    setPagando(null);
    setForm(null);
  }

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard rotulo="Total" valor={total} cor="cinza" />
        <StatCard rotulo="Freelancers avulsos" valor={avulsos} cor="verde" />
        <StatCard rotulo="CLT" valor={clt} cor="laranja" />
      </div>

      <BarraBusca valor={busca} onMudar={setBusca} placeholder="Buscar por nome ou CPF…" />

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhuma pessoa encontrada." />
      ) : (
        <div className="card p-0 sm:p-2">
          <Tabela cabecalho={["Nome", "Vínculo", "Chave Pix", ""]}>
            {lista.map((c) => (
              <tr key={c.id} className="transition-colors hover:bg-stone-50">
                <td className="px-3 py-2.5 font-medium">{c.nome}</td>
                <td className="px-3 py-2.5">{c.clt ? <Badge cor="laranja">CLT</Badge> : <Badge cor="verde">Freelancer</Badge>}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-stone-600" title={c.chave}>
                  {maskChave(c.tipo_chave, c.chave)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button type="button" className="btn-primario" onClick={() => abrirPagamento(c)}>
                    Pagar
                  </button>
                </td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}

      <Modal aberto={pagando !== null} titulo={`Pagar ${pagando?.nome ?? ""}`} onFechar={() => setPagando(null)}>
        {pagando && form && (
          <form onSubmit={confirmarPagamento} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Campo rotulo="Valor total (R$) *">
                <input
                  type="text"
                  inputMode="decimal"
                  className="campo"
                  placeholder="0,00"
                  required
                  value={form.valor}
                  onChange={(e) => alterar({ valor: e.target.value })}
                />
              </Campo>
            </div>
            <Campo rotulo="Trabalhou de *">
              <input type="date" className="campo" required value={form.trabalho_de} onChange={(e) => alterar({ trabalho_de: e.target.value })} />
            </Campo>
            <Campo rotulo="Até *">
              <input type="date" className="campo" required value={form.trabalho_ate} onChange={(e) => alterar({ trabalho_ate: e.target.value })} />
            </Campo>
            {dias.length > 1 && (
              <p className="text-xs text-stone-500 sm:col-span-2">
                {dias.length} dias — {moeda(parseValor(form.valor) / dias.length || 0)} por dia em média.
              </p>
            )}
            <Campo rotulo="Data do pagamento *">
              <input type="date" className="campo" required value={form.data_pagamento} onChange={(e) => alterar({ data_pagamento: e.target.value })} />
            </Campo>
            <Campo rotulo="Banco pago *">
              <select className="campo" required value={form.banco_id} onChange={(e) => alterar({ banco_id: e.target.value })}>
                <option value="">Selecione…</option>
                {db.bancos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="sm:col-span-2">
              <Campo rotulo="Origem do pagamento *">
                <select className="campo" required value={form.origem} onChange={(e) => alterar({ origem: e.target.value as OrigemPagamento })}>
                  <option value="">Selecione…</option>
                  {ORIGENS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <div className="sm:col-span-2">
              <Campo rotulo="Observação">
                <input className="campo" value={form.observacao} onChange={(e) => alterar({ observacao: e.target.value })} />
              </Campo>
            </div>

            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <button
                type="button"
                className="btn-secundario"
                disabled={!(isFinite(parseValor(form.valor)) && parseValor(form.valor) > 0)}
                onClick={() => setQrColaborador(pagando)}
              >
                <QrCode size={16} /> Gerar Pix
              </button>
              <button type="submit" className="btn-primario">
                Confirmar pagamento
              </button>
            </div>
          </form>
        )}
      </Modal>

      <PagamentoQRModal
        colaborador={qrColaborador}
        valor={form ? parseValor(form.valor) : 0}
        descricao="Pagamento freelancer"
        onFechar={() => setQrColaborador(null)}
      />
    </div>
  );
}
