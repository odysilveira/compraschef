"use client";

import { useMemo, useState } from "react";
import { Card, Campo } from "@/components/ui";
import { mutate, useDB } from "@/lib/data";
import {
  calcularCmvTourLondrina,
  configTourLondrinaVazia,
  normalizarConfigTourLondrina,
  type PratoTourLondrina,
} from "@/lib/domain/tour-londrina";
import { calcularCustoFicha, listarConfiguracoesPorcionamento } from "@/lib/domain/fichas-tecnicas";
import { precoDoCanal } from "@/lib/domain/tabela-precos-venda";
import { moeda } from "@/lib/format";
import type { AdicionalTourLondrina } from "@/lib/types";

function custoPorcaoDaReceita(
  db: ReturnType<typeof useDB>,
  receitaId: string
): { nome: string; preco_loja: number; custo_porcao: number } | null {
  const receita = (db.fichas_tecnicas_receitas ?? []).find((r) => r.id === receitaId);
  if (!receita) return null;
  const versoes = (db.fichas_tecnicas_versoes ?? []).filter((v) => v.receita_id === receitaId);
  const vigente = receita.versao_vigente_id
    ? versoes.find((v) => v.id === receita.versao_vigente_id)
    : undefined;
  const versao = vigente ?? versoes.sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em))[0];
  if (!versao) return null;

  const fichas = versoes.map((v) => v.ficha);
  let custoCent = 0;
  try {
    const resultado = calcularCustoFicha(versao.ficha, fichas, db.produtos, db.unidades);
    custoCent = resultado.custo_total;
  } catch {
    custoCent = 0;
  }

  const configs = listarConfiguracoesPorcionamento(versao.ficha);
  const ativa =
    configs.find((c) => c.id === versao.ficha.porcionamento_ativo_id) ??
    configs.find((c) => c.ativa) ??
    configs[0];
  const porcoes = Math.max(1, ativa?.quantidade_porcoes_teorica ?? versao.ficha.porcoes_config?.quantidade_porcoes ?? 1);
  const custoPorcao = custoCent / 100 / porcoes;

  return {
    nome: receita.nome,
    preco_loja: precoDoCanal(versao.ficha.canais_preco, "balcao"),
    custo_porcao: Number(custoPorcao.toFixed(4)),
  };
}

export function TourLondrinaCmv() {
  const db = useDB();
  const config = normalizarConfigTourLondrina(db.tour_londrina ?? configTourLondrinaVazia());
  const pratos = useMemo(
    () =>
      (db.fichas_tecnicas_receitas ?? [])
        .filter((r) => (r.tipo ?? "prato") === "prato")
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [db.fichas_tecnicas_receitas]
  );

  const [pagoId, setPagoId] = useState(config.pratos_elegiveis_ids[0] ?? "");
  const [ganhoId, setGanhoId] = useState(config.pratos_elegiveis_ids[1] ?? "");
  const [adicionais, setAdicionais] = useState<AdicionalTourLondrina[]>(config.adicionais_padrao);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const elegiveis = config.pratos_elegiveis_ids
    .map((id) => pratos.find((p) => p.id === id))
    .filter((p): p is (typeof pratos)[number] => Boolean(p));

  function salvarConfig(parcial: Partial<typeof config>) {
    mutate((banco) => {
      const atual = normalizarConfigTourLondrina(banco.tour_londrina);
      banco.tour_londrina = {
        ...atual,
        ...parcial,
        atualizado_em: new Date().toISOString(),
      };
    });
    setMensagem("Configuração Tour Londrina salva.");
  }

  function toggleElegivel(receitaId: string) {
    const set = new Set(config.pratos_elegiveis_ids);
    if (set.has(receitaId)) set.delete(receitaId);
    else if (set.size < 3) set.add(receitaId);
    const ids = [...set];
    salvarConfig({ pratos_elegiveis_ids: ids });
  }

  const pagoInfo = pagoId ? custoPorcaoDaReceita(db, pagoId) : null;
  const ganhoInfo = ganhoId ? custoPorcaoDaReceita(db, ganhoId) : null;

  const resultado = useMemo(() => {
    if (!pagoInfo || !ganhoInfo || !pagoId || !ganhoId) return null;
    const pago: PratoTourLondrina = {
      receita_id: pagoId,
      nome: pagoInfo.nome,
      preco_loja: pagoInfo.preco_loja,
      custo_porcao: pagoInfo.custo_porcao,
    };
    const ganho: PratoTourLondrina = {
      receita_id: ganhoId,
      nome: ganhoInfo.nome,
      preco_loja: ganhoInfo.preco_loja,
      custo_porcao: ganhoInfo.custo_porcao,
    };
    return calcularCmvTourLondrina(
      pago,
      ganho,
      adicionais.filter((a) => a.preco_venda > 0 || a.custo > 0)
    );
  }, [pagoId, ganhoId, pagoInfo, ganhoInfo, adicionais]);

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-stone-800">Tour Londrina — CMV do combo</h3>
        <p className="mt-1 text-sm text-stone-600">
          Cliente paga 1 prato e leva outro igual ou mais barato. O CMV aqui usa receita do prato pago (+
          adicionais) e custo dos <strong>dois</strong> pratos — separado do CMV por canal.
        </p>
      </div>

      {mensagem && (
        <p className="rounded-card bg-sucesso-clara px-3 py-2 text-sm text-primaria-escura">{mensagem}</p>
      )}

      <div>
        <p className="rotulo mb-2">Pratos elegíveis (até 3)</p>
        <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-card border border-stone-200 p-2">
          {pratos.map((prato) => {
            const marcado = config.pratos_elegiveis_ids.includes(prato.id);
            return (
              <button
                key={prato.id}
                type="button"
                className={marcado ? "btn-primario text-xs" : "btn-secundario text-xs"}
                onClick={() => toggleElegivel(prato.id)}
                disabled={!marcado && config.pratos_elegiveis_ids.length >= 3}
              >
                {prato.nome}
              </button>
            );
          })}
        </div>
        {elegiveis.length === 0 && (
          <p className="mt-2 text-xs text-stone-500">Selecione os 3 pratos da promoção.</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Prato pago">
          <select className="campo" value={pagoId} onChange={(e) => setPagoId(e.target.value)}>
            <option value="">Selecione</option>
            {(elegiveis.length ? elegiveis : pratos).map((p) => (
              <option key={p!.id} value={p!.id}>
                {p!.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Prato ganho (≤ preço do pago)">
          <select className="campo" value={ganhoId} onChange={(e) => setGanhoId(e.target.value)}>
            <option value="">Selecione</option>
            {(elegiveis.length ? elegiveis : pratos).map((p) => (
              <option key={p!.id} value={p!.id}>
                {p!.nome}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <div className="space-y-2">
        <p className="rotulo">Adicionais do QR (opcional)</p>
        {adicionais.map((adic, index) => (
          <div key={adic.id} className="grid gap-2 sm:grid-cols-3">
            <input
              className="campo"
              value={adic.nome}
              onChange={(e) => {
                const proximo = [...adicionais];
                proximo[index] = { ...adic, nome: e.target.value };
                setAdicionais(proximo);
              }}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              className="campo"
              placeholder="Preço cobrado"
              value={adic.preco_venda || ""}
              onChange={(e) => {
                const proximo = [...adicionais];
                proximo[index] = { ...adic, preco_venda: Number(e.target.value) || 0 };
                setAdicionais(proximo);
              }}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              className="campo"
              placeholder="Custo"
              value={adic.custo || ""}
              onChange={(e) => {
                const proximo = [...adicionais];
                proximo[index] = { ...adic, custo: Number(e.target.value) || 0 };
                setAdicionais(proximo);
              }}
            />
          </div>
        ))}
        <button
          type="button"
          className="btn-secundario text-xs"
          onClick={() => {
            salvarConfig({ adicionais_padrao: adicionais });
          }}
        >
          Salvar adicionais padrão
        </button>
      </div>

      {resultado && (
        <div className="rounded-card border border-stone-200 bg-stone-50 p-3 text-sm">
          {!resultado.valido && (
            <ul className="mb-2 list-disc space-y-1 pl-5 text-destaque">
              {resultado.erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="rotulo">Receita do ticket</p>
              <p className="font-semibold">{moeda(resultado.receita)}</p>
            </div>
            <div>
              <p className="rotulo">Custo (2 pratos + add)</p>
              <p className="font-semibold">{moeda(resultado.custo)}</p>
            </div>
            <div>
              <p className="rotulo">CMV Tour</p>
              <p className="font-semibold">
                {resultado.cmv_percentual === null ? "—" : `${resultado.cmv_percentual.toFixed(1)}%`}
              </p>
            </div>
            <div>
              <p className="rotulo">Margem</p>
              <p className="font-semibold">
                {resultado.margem_reais === null
                  ? "—"
                  : `${moeda(resultado.margem_reais)} (${resultado.margem_percentual?.toFixed(1)}%)`}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Pago {moeda(resultado.preco_pago)} · ganho {moeda(resultado.preco_ganho)} (não entra na
            receita) · custo pratos {moeda(resultado.custo_pratos)}
          </p>
        </div>
      )}
    </Card>
  );
}
