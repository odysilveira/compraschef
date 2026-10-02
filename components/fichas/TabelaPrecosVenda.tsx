"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { mutate, useDB } from "@/lib/data";
import { PRECOS_FRANQUIA_LONDINA_BOX_G } from "@/lib/data/precos-franquia-londrina";
import {
  analisarPlanilhaPrecosFranquia,
  PRECOS_FRANQUIA_EXTENSAO,
  validarArquivoPrecosFranquia,
} from "@/lib/domain/importar-precos-franquia";
import {
  aplicarTabelaFranquiaNasFichas,
  atualizarPrecosCanaisDaVersao,
  calcularCmvAtualVsSaipos,
  excluirReceitaFichaDoCatalogo,
  formatarCmvAtual,
  formatarPercentualAcimaDoSaipos,
  listarTabelaPrecosPratos,
  mediaCmvAtual,
  reajustarPrecosPratosEmLote,
  rotulosColunasTabelaPrecos,
  type ModoReajustePreco,
} from "@/lib/domain/tabela-precos-venda";
import { moeda } from "@/lib/format";

export function TabelaPrecosVenda() {
  const db = useDB();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});
  const [modoReajuste, setModoReajuste] = useState<ModoReajustePreco>("reais");
  const [valorReajuste, setValorReajuste] = useState("2");
  const [canalLoja, setCanalLoja] = useState(true);
  const [canalIfood, setCanalIfood] = useState(true);
  const [canal99, setCanal99] = useState(true);

  const linhas = useMemo(() => listarTabelaPrecosPratos(db), [db]);
  const colunas = rotulosColunasTabelaPrecos();
  const cmvMedio = useMemo(() => mediaCmvAtual(linhas), [linhas]);
  const idsSelecionados = useMemo(
    () => Object.entries(selecionados).filter(([, ok]) => ok).map(([id]) => id),
    [selecionados]
  );
  const todosSelecionados = linhas.length > 0 && idsSelecionados.length === linhas.length;

  function aplicarLondrina(forcar = false) {
    setErro(null);
    setMensagem(null);
    let aplicados = 0;
    mutate((banco) => {
      aplicados = aplicarTabelaFranquiaNasFichas(banco, PRECOS_FRANQUIA_LONDINA_BOX_G, {
        somenteVazios: !forcar,
      });
    });
    setMensagem(
      aplicados > 0
        ? `Preços Londrina (Box G) aplicados em ${aplicados} prato(s).`
        : forcar
          ? "Nenhum prato correspondente encontrado para aplicar."
          : "Todos os pratos mapeados já tinham preço. Use “Sobrescrever com Londrina” para forçar."
    );
  }

  async function importarExcel(arquivo: File | null | undefined) {
    if (!arquivo) return;
    setErro(null);
    setMensagem(null);

    const erroValidacao = validarArquivoPrecosFranquia({ name: arquivo.name, size: arquivo.size });
    if (erroValidacao) {
      setErro(erroValidacao);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setImportando(true);
    try {
      const buffer = await arquivo.arrayBuffer();
      const analise = analisarPlanilhaPrecosFranquia(buffer);
      if (!analise.ok) {
        setErro(analise.erro);
        return;
      }

      let aplicados = 0;
      mutate((banco) => {
        aplicados = aplicarTabelaFranquiaNasFichas(banco, analise.linhas);
      });

      const avisos = analise.avisos.length ? ` ${analise.avisos.join(" ")}` : "";
      setMensagem(
        aplicados > 0
          ? `Planilha lida (${analise.linhas.length} linha(s)): preços aplicados em ${aplicados} prato(s).${avisos}`
          : `Planilha lida (${analise.linhas.length} linha(s)), mas nenhum prato bateu por código ou nome.${avisos}`
      );
    } catch {
      setErro("Não foi possível ler o Excel. Verifique se o arquivo não está corrompido.");
    } finally {
      setImportando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function salvarLinha(
    versaoId: string,
    campos: { loja: string; ifood: string; noventa: string }
  ) {
    setErro(null);
    mutate((banco) => {
      atualizarPrecosCanaisDaVersao(banco, versaoId, {
        loja: campos.loja === "" ? undefined : Number(campos.loja),
        ifood: campos.ifood === "" ? undefined : Number(campos.ifood),
        noventa: campos.noventa === "" ? undefined : Number(campos.noventa),
      });
    });
  }

  function excluirPrato(receitaId: string, nome: string) {
    if (!window.confirm(`Excluir definitivamente “${nome}” do catálogo de fichas?`)) return;
    setErro(null);
    let ok = false;
    mutate((banco) => {
      ok = excluirReceitaFichaDoCatalogo(banco, receitaId);
    });
    setSelecionados((atual) => {
      const proximo = { ...atual };
      delete proximo[receitaId];
      return proximo;
    });
    setMensagem(ok ? `“${nome}” excluído do catálogo.` : "Não foi possível excluir o prato.");
  }

  function aplicarReajuste() {
    setErro(null);
    setMensagem(null);
    const valor = Number(String(valorReajuste).replace(",", "."));
    if (!Number.isFinite(valor) || valor === 0) {
      setErro("Informe um valor diferente de zero (ex.: 2 ou 10).");
      return;
    }
    if (!canalLoja && !canalIfood && !canal99) {
      setErro("Selecione ao menos um canal (Loja, iFood ou 99).");
      return;
    }

    const alvoIds = idsSelecionados.length > 0 ? idsSelecionados : undefined;
    const escopo =
      alvoIds && alvoIds.length > 0
        ? `${alvoIds.length} prato(s) selecionado(s)`
        : "todos os pratos";
    const rotulo =
      modoReajuste === "reais"
        ? `${valor > 0 ? "+" : ""}R$ ${Math.abs(valor).toFixed(2).replace(".", ",")}`
        : `${valor > 0 ? "+" : ""}${valor}%`;

    if (!window.confirm(`Aplicar ${rotulo} em ${escopo}?`)) return;

    let atualizados = 0;
    mutate((banco) => {
      atualizados = reajustarPrecosPratosEmLote(banco, {
        modo: modoReajuste,
        valor,
        canais: { loja: canalLoja, ifood: canalIfood, noventa: canal99 },
        receitaIds: alvoIds,
      });
    });
    setMensagem(
      atualizados > 0
        ? `Reajuste ${rotulo} aplicado em ${atualizados} prato(s).`
        : "Nenhum preço alterado (verifique se há preços > 0 nos canais escolhidos)."
    );
  }

  function toggleTodos(marcar: boolean) {
    if (!marcar) {
      setSelecionados({});
      return;
    }
    const mapa: Record<string, boolean> = {};
    for (const linha of linhas) mapa[linha.receita_id] = true;
    setSelecionados(mapa);
  }

  if (linhas.length === 0) {
    return (
      <Card className="space-y-2">
        <h3 className="text-sm font-semibold text-stone-800">Tabela de preços de venda</h3>
        <p className="text-sm text-stone-600">Nenhum prato finalizado cadastrado ainda.</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-stone-800">Tabela de preços de venda (CMV)</h3>
          <p className="mt-1 text-sm text-stone-600">
            Exclua pratos, reajuste em lote (+ R$ ou + %) e gerencie Loja / iFood / 99.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primario text-sm" onClick={() => aplicarLondrina(false)}>
            Aplicar preços Londrina
          </button>
          <button type="button" className="btn-secundario text-sm" onClick={() => aplicarLondrina(true)}>
            Sobrescrever com Londrina
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={`${PRECOS_FRANQUIA_EXTENSAO},.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`}
            className="hidden"
            onChange={(e) => void importarExcel(e.target.files?.[0])}
          />
          <button
            type="button"
            className="btn-secundario text-sm"
            disabled={importando}
            onClick={() => inputRef.current?.click()}
          >
            {importando ? "Lendo Excel…" : "Importar Excel"}
          </button>
        </div>
      </div>

      <div className="rounded-card border border-stone-200 bg-stone-50/80 px-3 py-3 space-y-3">
        <p className="text-sm font-semibold text-stone-800">Reajuste em lote</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm text-stone-700">
            <span className="rotulo mb-1 block">Tipo</span>
            <select
              className="campo"
              value={modoReajuste}
              onChange={(e) => setModoReajuste(e.target.value as ModoReajustePreco)}
            >
              <option value="reais">+ R$ (valor fixo)</option>
              <option value="percentual">+ % (percentual)</option>
            </select>
          </label>
          <label className="text-sm text-stone-700">
            <span className="rotulo mb-1 block">
              {modoReajuste === "reais" ? "Valor (R$)" : "Percentual (%)"}
            </span>
            <input
              type="number"
              step="0.01"
              className="campo w-28"
              value={valorReajuste}
              onChange={(e) => setValorReajuste(e.target.value)}
              placeholder={modoReajuste === "reais" ? "2" : "10"}
            />
          </label>
          <div className="flex flex-wrap gap-3 pb-2 text-sm text-stone-700">
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={canalLoja} onChange={(e) => setCanalLoja(e.target.checked)} />
              Loja
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={canalIfood} onChange={(e) => setCanalIfood(e.target.checked)} />
              iFood
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={canal99} onChange={(e) => setCanal99(e.target.checked)} />
              99
            </label>
          </div>
          <button type="button" className="btn-primario text-sm" onClick={aplicarReajuste}>
            {idsSelecionados.length > 0
              ? `Aplicar em ${idsSelecionados.length} selecionado(s)`
              : "Aplicar em todos"}
          </button>
        </div>
        <p className="text-xs text-stone-500">
          Marque linhas para limitar o reajuste; sem seleção, aplica em todos. Use valor negativo para reduzir
          (ex.: -1 ou -5%). Só altera canais que já têm preço &gt; 0.
        </p>
      </div>

      {mensagem && (
        <p className="rounded-card bg-sucesso-clara px-3 py-2 text-sm text-primaria-escura">{mensagem}</p>
      )}
      {erro && <p className="rounded-card bg-erro-clara px-3 py-2 text-sm text-erro">{erro}</p>}

      <div className="overflow-x-auto">
        <table className="min-w-[1180px] w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="rotulo px-2 py-2">
                <input
                  type="checkbox"
                  checked={todosSelecionados}
                  onChange={(e) => toggleTodos(e.target.checked)}
                  title="Selecionar todos"
                />
              </th>
              <th className="rotulo px-2 py-2">Prato</th>
              <th className="rotulo px-2 py-2">{colunas[0]}</th>
              <th className="rotulo px-2 py-2">{colunas[1]}</th>
              <th className="rotulo px-2 py-2" title="Percentual a mais do iFood em relação ao Saipos/Loja">
                % vs Saipos
              </th>
              <th className="rotulo px-2 py-2">{colunas[2]}</th>
              <th className="rotulo px-2 py-2" title="Percentual a mais do 99 em relação ao Saipos/Loja">
                % vs Saipos
              </th>
              <th
                className="rotulo px-2 py-2"
                title="CMV atual = custo da porção ÷ preço Loja/Saipos"
              >
                CMV atual
              </th>
              <th className="rotulo px-2 py-2"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map((linha) => (
              <LinhaPrecoEditavel
                key={linha.receita_id}
                linha={linha}
                selecionado={Boolean(selecionados[linha.receita_id])}
                onSelecionar={(marcado) =>
                  setSelecionados((atual) => ({ ...atual, [linha.receita_id]: marcado }))
                }
                onSalvar={(campos) => salvarLinha(linha.versao_id, campos)}
                onExcluir={() => excluirPrato(linha.receita_id, linha.nome)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-stone-200 bg-stone-50 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Média de todos os pratos
          </p>
          <p className="text-sm text-stone-600">CMV atual médio (custo ÷ preço Saipos)</p>
        </div>
        <p className="text-2xl font-bold text-stone-900">{formatarCmvAtual(cmvMedio)}</p>
      </div>
    </Card>
  );
}

function LinhaPrecoEditavel({
  linha,
  selecionado,
  onSelecionar,
  onSalvar,
  onExcluir,
}: {
  linha: {
    receita_id: string;
    codigo: string;
    nome: string;
    preco_loja: number;
    preco_ifood: number;
    preco_99: number;
    custo_porcao: number;
    cmv_atual: number | null;
  };
  selecionado: boolean;
  onSelecionar: (marcado: boolean) => void;
  onSalvar: (campos: { loja: string; ifood: string; noventa: string }) => void;
  onExcluir: () => void;
}) {
  const [loja, setLoja] = useState(linha.preco_loja ? String(linha.preco_loja) : "");
  const [ifood, setIfood] = useState(linha.preco_ifood ? String(linha.preco_ifood) : "");
  const [noventa, setNoventa] = useState(linha.preco_99 ? String(linha.preco_99) : "");

  useEffect(() => {
    setLoja(linha.preco_loja ? String(linha.preco_loja) : "");
    setIfood(linha.preco_ifood ? String(linha.preco_ifood) : "");
    setNoventa(linha.preco_99 ? String(linha.preco_99) : "");
  }, [linha.preco_loja, linha.preco_ifood, linha.preco_99]);

  const incompleto = !Number(loja) && !Number(ifood);
  const precoLoja = Number(loja) || 0;
  const pctIfood = formatarPercentualAcimaDoSaipos(Number(ifood) || 0, precoLoja);
  const pct99 = formatarPercentualAcimaDoSaipos(Number(noventa) || 0, precoLoja);
  const cmvAtual = formatarCmvAtual(calcularCmvAtualVsSaipos(linha.custo_porcao, precoLoja));

  return (
    <tr>
      <td className="px-2 py-2">
        <input
          type="checkbox"
          checked={selecionado}
          onChange={(e) => onSelecionar(e.target.checked)}
          aria-label={`Selecionar ${linha.nome}`}
        />
      </td>
      <td className="px-2 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/fichas-tecnicas/${linha.receita_id}`} className="font-medium text-primaria hover:underline">
            {linha.nome}
          </Link>
          {incompleto && <Badge cor="laranja">Sem preço</Badge>}
        </div>
        <p className="text-xs text-stone-500">{linha.codigo}</p>
      </td>
      <td className="px-2 py-2">
        <input type="number" min={0} step="0.01" className="campo w-24" value={loja} onChange={(e) => setLoja(e.target.value)} placeholder="0" />
      </td>
      <td className="px-2 py-2">
        <input type="number" min={0} step="0.01" className="campo w-24" value={ifood} onChange={(e) => setIfood(e.target.value)} placeholder="0" />
      </td>
      <td className="px-2 py-2 font-semibold text-stone-700" title="iFood vs Saipos">
        {pctIfood}
      </td>
      <td className="px-2 py-2">
        <input type="number" min={0} step="0.01" className="campo w-24" value={noventa} onChange={(e) => setNoventa(e.target.value)} placeholder="0" />
      </td>
      <td className="px-2 py-2 font-semibold text-stone-700" title="99 vs Saipos">
        {pct99}
      </td>
      <td
        className="px-2 py-2 font-semibold text-stone-800"
        title={
          linha.custo_porcao > 0
            ? `Custo ${moeda(linha.custo_porcao)} ÷ Saipos ${moeda(precoLoja)}`
            : "Custo da ficha indisponível"
        }
      >
        {cmvAtual}
      </td>
      <td className="px-2 py-2">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className="btn-secundario text-xs"
            onClick={() => onSalvar({ loja, ifood, noventa })}
            title={`Salvar (loja atual no banco: ${moeda(linha.preco_loja)})`}
          >
            Salvar
          </button>
          <button
            type="button"
            className="btn-secundario text-xs text-red-600"
            onClick={onExcluir}
            title="Excluir prato do catálogo"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
