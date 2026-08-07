"use client";

// Painel inicial (requisito 45): alertas clicáveis, entregas previstas
// e gastos do mês por fornecedor (só dono/gerente).

import {
  Banknote,
  CalendarClock,
  CircleCheckBig,
  ClipboardCheck,
  MessageSquare,
  PackageX,
  Timer,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { Badge, Card, Vazio } from "@/components/ui";
import CartaoAlerta from "@/components/operacao/CartaoAlerta";
import { caixasVencendo, nomeFornecedor, produtosAbaixoDoMinimo, useDB } from "@/lib/data";
import { hrefFinanceiro } from "@/lib/domain/financeiro";
import { hrefPagamentosRh, resumirOperacionalRh } from "@/lib/domain/resumo-rh";
import { podeVerValores, usePapel, usePodeAcessarModulo } from "@/lib/roles";
import { dataBR, diasAte, moeda } from "@/lib/format";
import type { DB, Pedido, StatusPedido } from "@/lib/types";

const ROTULO_STATUS_PEDIDO: Record<StatusPedido, string> = {
  aguardando_aprovacao: "aguardando aprovação",
  aprovado: "aprovado",
  enviado: "enviado",
  confirmado: "confirmado",
  entregue: "entregue",
  cancelado: "cancelado",
};

function previsaoEntrega(db: DB, pedido: Pedido): string | undefined {
  const fornecedor = db.fornecedores.find((f) => f.id === pedido.fornecedor_id);
  if (fornecedor?.prazo_entrega_dias === undefined) return undefined;
  const d = new Date(pedido.criado_em);
  d.setDate(d.getDate() + fornecedor.prazo_entrega_dias);
  return d.toISOString().slice(0, 10);
}

function rotuloPrevisao(iso?: string): string {
  if (!iso) return "prazo não informado";
  const dias = diasAte(iso);
  if (dias === undefined) return dataBR(iso);
  if (dias < 0) return `previsto para ${dataBR(iso)} — atrasado`;
  if (dias === 0) return "chega hoje";
  if (dias === 1) return "chega amanhã";
  return `chega em ${dias} dias (${dataBR(iso)})`;
}

export default function PainelPage() {
  const db = useDB();
  const { papel } = usePapel();
  const financeiro = podeVerValores(papel);
  const podeRh = usePodeAcessarModulo("rh");
  const resumoRh = podeRh ? resumirOperacionalRh(db) : null;

  const abaixoMinimo = produtosAbaixoDoMinimo(db).length;
  const cotacoesAguardando = db.cotacoes.filter((c) => c.status === "enviada").length;
  const pedidosAprovacao = db.pedidos.filter((p) => p.status === "aguardando_aprovacao").length;
  const boletosVencendo = db.boletos.filter((b) => {
    if (b.status === "pago" || b.status === "aguardando_conciliacao") return false;
    const dias = diasAte(b.vencimento);
    return dias !== undefined && dias > 0 && dias <= 7;
  }).length;
  const divergencias = db.recebimentos.filter((r) => r.status === "divergente" || r.status === "parcial").length;
  const caixasValidade = caixasVencendo(db, 3).length;

  const entregas = db.pedidos.filter((p) => p.status === "confirmado" || p.status === "enviado");

  // Gastos do mês corrente por fornecedor (pedidos não cancelados)
  const mesAtual = new Date().toISOString().slice(0, 7);
  const gastosPorFornecedor = new Map<string, number>();
  db.pedidos
    .filter((p) => p.status !== "cancelado" && p.criado_em.slice(0, 7) === mesAtual)
    .forEach((p) => {
      gastosPorFornecedor.set(p.fornecedor_id, (gastosPorFornecedor.get(p.fornecedor_id) ?? 0) + p.valor_total);
    });
  const gastos = Array.from(gastosPorFornecedor.entries()).sort((a, b) => b[1] - a[1]);
  const maiorGasto = gastos.length > 0 ? gastos[0][1] : 0;

  return (
    <div className="space-y-6">
      <h1>Painel</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <CartaoAlerta
          href="/estoque"
          titulo="Produtos abaixo do estoque mínimo"
          numero={abaixoMinimo}
          icone={PackageX}
          cor="vermelho"
        />
        {financeiro && (
          <CartaoAlerta
            href="/cotacoes"
            titulo="Cotações aguardando resposta"
            numero={cotacoesAguardando}
            icone={MessageSquare}
            cor="azul"
          />
        )}
        <CartaoAlerta
          href="/pedidos"
          titulo="Pedidos esperando sua aprovação"
          numero={pedidosAprovacao}
          icone={ClipboardCheck}
          cor="laranja"
        />
        {financeiro && (
          <CartaoAlerta
            href={hrefFinanceiro({ aba: "boletos", vencimento: "proximos_7_dias" })}
            titulo="Boletos que vencem em 7 dias"
            numero={boletosVencendo}
            icone={CalendarClock}
            cor="laranja"
          />
        )}
        {podeRh && resumoRh && (
          <CartaoAlerta
            href={hrefPagamentosRh("liberado")}
            titulo="Pagamentos RH liberados (a informar)"
            numero={resumoRh.pagamentos_liberados}
            icone={Banknote}
            cor="laranja"
          />
        )}
        {podeRh && resumoRh && (
          <CartaoAlerta
            href={hrefPagamentosRh("aguardando")}
            titulo="Pagamentos RH aguardando conciliação"
            numero={resumoRh.pagamentos_aguardando}
            icone={CircleCheckBig}
            cor="azul"
          />
        )}
        <CartaoAlerta
          href="/recebimento"
          titulo="Divergências de recebimento"
          numero={divergencias}
          icone={TriangleAlert}
          cor="vermelho"
        />
        <CartaoAlerta
          href="/estoque"
          titulo="Caixas com validade em 3 dias"
          numero={caixasValidade}
          icone={Timer}
          cor="laranja"
        />
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2">
          <Truck size={20} className="text-primaria" /> Entregas previstas
        </h2>
        {entregas.length === 0 ? (
          <Vazio mensagem="Nenhuma entrega prevista no momento." />
        ) : (
          <div className="space-y-3">
            {entregas.map((pedido) => (
              <Card key={pedido.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{nomeFornecedor(db, pedido.fornecedor_id)}</p>
                  <p className="text-sm text-slate-600">
                    Pedido de {dataBR(pedido.criado_em)} · {rotuloPrevisao(previsaoEntrega(db, pedido))}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {financeiro && <span className="text-sm font-semibold">{moeda(pedido.valor_total)}</span>}
                  <Badge cor={pedido.status === "confirmado" ? "verde" : "azul"}>
                    {ROTULO_STATUS_PEDIDO[pedido.status]}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {financeiro && (
        <section>
          <h2 className="mb-3">Gastos do mês por fornecedor</h2>
          {gastos.length === 0 ? (
            <Vazio mensagem="Nenhum pedido neste mês ainda." />
          ) : (
            <Card className="space-y-3">
              {gastos.map(([fornecedorId, total]) => (
                <div key={fornecedorId}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{nomeFornecedor(db, fornecedorId)}</span>
                    <span className="font-semibold">{moeda(total)}</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-primaria"
                      style={{ width: `${maiorGasto > 0 ? Math.max(4, (total / maiorGasto) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
