"use client";

import type { NotaFiscal } from "@/lib/types";
import { cnpjBR, dataBR, moeda, qtd } from "@/lib/format";

type Props = {
  nota: NotaFiscal;
  fornecedorNome?: string;
};

function totalItem(quantidade: number, preco: number): number {
  return Number((quantidade * preco).toFixed(2));
}

/** Reconstituição legível da nota a partir dos dados importados (não é o PDF oficial). */
export function VistaNotaEstiloDanfe({ nota, fornecedorNome }: Props) {
  const itens = Array.isArray(nota.itens_importados) ? nota.itens_importados : [];
  const tipoRotulo = nota.tipo === "nfse" ? "NFS-e" : "NF-e";
  const somaItens = itens.reduce((acc, item) => acc + totalItem(item.quantidade, item.preco_unitario), 0);

  return (
    <div className="overflow-hidden rounded-lg border-2 border-slate-800 bg-white text-slate-900">
      <div className="border-b-2 border-slate-800 bg-slate-100 px-3 py-2 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
          Documento auxiliar — visão do sistema
        </p>
        <p className="text-base font-bold tracking-wide">
          {tipoRotulo === "NFS-e" ? "NOTA FISCAL DE SERVIÇO" : "DANFE"}
        </p>
        <p className="text-xs text-slate-600">
          {tipoRotulo} nº {nota.numero || "—"}
        </p>
      </div>

      <div className="grid gap-0 border-b border-slate-300 sm:grid-cols-2">
        <div className="space-y-1 border-b border-slate-300 px-3 py-2 sm:border-b-0 sm:border-r">
          <p className="text-[10px] font-semibold uppercase text-slate-500">Emitente</p>
          <p className="text-sm font-semibold leading-snug">
            {nota.razao_social_emitente?.trim() || fornecedorNome || "—"}
          </p>
          <p className="text-xs text-slate-700">CNPJ: {cnpjBR(nota.cnpj_emitente)}</p>
          {nota.municipio_emissao ? (
            <p className="text-xs text-slate-600">Município: {nota.municipio_emissao}</p>
          ) : null}
        </div>
        <div className="space-y-1 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-slate-500">Destinatário / vínculo</p>
          <p className="text-sm font-semibold leading-snug">{fornecedorNome || "—"}</p>
          <p className="text-xs text-slate-700">
            Emissão: {nota.emitida_em ? dataBR(nota.emitida_em) : "—"}
          </p>
          <p className="text-xs text-slate-700">Valor total: {moeda(nota.valor_total)}</p>
        </div>
      </div>

      {nota.chave_acesso ? (
        <div className="border-b border-slate-300 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-slate-500">Chave de acesso</p>
          <p className="break-all font-mono text-[11px] leading-relaxed tracking-wide text-slate-800">
            {nota.chave_acesso}
          </p>
        </div>
      ) : null}

      {nota.tipo === "nfse" && nota.descricao_servico ? (
        <div className="border-b border-slate-300 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase text-slate-500">Descrição do serviço</p>
          <p className="text-sm text-slate-800 whitespace-pre-wrap">{nota.descricao_servico}</p>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-400 bg-slate-50 text-[10px] uppercase text-slate-600">
              <th className="px-2 py-1.5 font-semibold">Cód.</th>
              <th className="px-2 py-1.5 font-semibold">Descrição</th>
              <th className="px-2 py-1.5 font-semibold">Un</th>
              <th className="px-2 py-1.5 font-semibold text-right">Qtd</th>
              <th className="px-2 py-1.5 font-semibold text-right">Vl. unit.</th>
              <th className="px-2 py-1.5 font-semibold text-right">Vl. total</th>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-slate-500">
                  Nenhum item importado nesta nota.
                  {nota.arquivo_pdf_nome ? ` Arquivo original: ${nota.arquivo_pdf_nome}.` : ""}
                </td>
              </tr>
            ) : (
              itens.map((item, index) => (
                <tr key={`${item.codigo ?? item.descricao}-${index}`} className="border-b border-slate-200 align-top">
                  <td className="px-2 py-1.5 font-mono text-[11px] text-slate-600">
                    {item.codigo?.trim() || "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="font-medium text-slate-900">{item.descricao}</span>
                    {item.ean ? (
                      <span className="mt-0.5 block font-mono text-[10px] text-slate-500">EAN {item.ean}</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 uppercase text-slate-700">{item.unidade || "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{qtd(item.quantidade)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{moeda(item.preco_unitario)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                    {moeda(totalItem(item.quantidade, item.preco_unitario))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {itens.length > 0 ? (
            <tfoot>
              <tr className="bg-slate-50 text-sm">
                <td colSpan={5} className="px-2 py-2 text-right font-semibold text-slate-700">
                  Soma dos itens
                </td>
                <td className="px-2 py-2 text-right font-bold tabular-nums">{moeda(somaItens)}</td>
              </tr>
              <tr className="border-t border-slate-400 text-sm">
                <td colSpan={5} className="px-2 py-2 text-right font-semibold text-slate-700">
                  Total da nota
                </td>
                <td className="px-2 py-2 text-right font-bold tabular-nums">{moeda(nota.valor_total)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <p className="border-t border-slate-300 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-950">
        Esta é uma reconstituição dos dados importados no ComprasChef — não substitui o DANFE/PDF
        oficial da SEFAZ ou do fornecedor.
      </p>
    </div>
  );
}
