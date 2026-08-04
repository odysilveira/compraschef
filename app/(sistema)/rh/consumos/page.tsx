"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, UtensilsCrossed } from "lucide-react";
import { Badge, Campo, Card, Modal, TituloPagina, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import {
  DESCONTO_CONSUMO_PADRAO,
  calcularLinhaConsumo,
  criarConsumoPessoa,
  rotuloStatusConsumo,
} from "@/lib/domain/consumos-pessoas";
import {
  hrefConsumosRh,
  parseFiltroConsumosRh,
  parsePessoaPontoRh,
  type FiltroConsumosRh,
} from "@/lib/domain/resumo-rh";
import { usePodeAcessarModulo } from "@/lib/roles";
import { dataBR, moeda } from "@/lib/format";
import type { ConsumoPessoa } from "@/lib/types";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

type FormNovo = {
  pessoa_id: string;
  data: string;
  descricao: string;
  quantidade: string;
  preco_unitario: string;
};

function formVazio(pessoaId = ""): FormNovo {
  return {
    pessoa_id: pessoaId,
    data: hojeISO(),
    descricao: "",
    quantidade: "1",
    preco_unitario: "",
  };
}

function RhConsumosConteudo() {
  const db = useDB();
  const router = useRouter();
  const searchParams = useSearchParams();
  const podeRh = usePodeAcessarModulo("rh");
  const [filtro, setFiltro] = useState<FiltroConsumosRh>(() =>
    parseFiltroConsumosRh(searchParams.get("filtro"))
  );
  const [filtroPessoa, setFiltroPessoa] = useState<string>(() => {
    const pessoa = parsePessoaPontoRh(searchParams.get("pessoa"));
    return pessoa || "todos";
  });
  const [form, setForm] = useState<FormNovo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    setFiltro(parseFiltroConsumosRh(searchParams.get("filtro")));
    const pessoaUrl = parsePessoaPontoRh(searchParams.get("pessoa"));
    if (!pessoaUrl) {
      setFiltroPessoa("todos");
      return;
    }
    const existe = (db.pessoas ?? []).some((p) => p.id === pessoaUrl);
    setFiltroPessoa(existe ? pessoaUrl : "todos");
  }, [db.pessoas, searchParams]);

  function irParaFiltros(proximoFiltro: FiltroConsumosRh, proximaPessoa: string = filtroPessoa) {
    setFiltro(proximoFiltro);
    setFiltroPessoa(proximaPessoa);
    router.replace(
      hrefConsumosRh({
        filtro: proximoFiltro,
        pessoa: proximaPessoa !== "todos" ? proximaPessoa : undefined,
      }),
      { scroll: false }
    );
  }

  function irParaFiltro(proximo: FiltroConsumosRh) {
    irParaFiltros(proximo);
  }

  function aoMudarFiltroPessoa(proximaPessoa: string) {
    irParaFiltros(filtro, proximaPessoa);
  }

  const pessoasAtivas = useMemo(
    () => (db.pessoas ?? []).filter((p) => p.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [db.pessoas]
  );

  const nomePessoa = (id: string) => db.pessoas.find((p) => p.id === id)?.nome ?? "—";

  const lista = useMemo(() => {
    const todos = [...(db.consumos_pessoas ?? [])];
    const filtrados = todos.filter((c) => {
      if (filtroPessoa !== "todos" && c.pessoa_id !== filtroPessoa) return false;
      if (filtro === "todos") return true;
      if (filtro === "descontados") return c.status === "descontado";
      return c.status === "pendente";
    });
    return filtrados.sort((a, b) => b.data.localeCompare(a.data) || b.criado_em.localeCompare(a.criado_em));
  }, [db.consumos_pessoas, filtro, filtroPessoa]);

  const totais = useMemo(() => {
    const itens = db.consumos_pessoas ?? [];
    const pendentes = itens.filter((c) => c.status === "pendente");
    return {
      brutoPend: pendentes.reduce((s, c) => s + c.valor_bruto, 0),
      liquidoPend: pendentes.reduce((s, c) => s + c.valor_liquido, 0),
      brutoTodos: itens.reduce((s, c) => s + c.valor_bruto, 0),
    };
  }, [db.consumos_pessoas]);

  const preview = useMemo(() => {
    if (!form) return null;
    const qtd = Number(form.quantidade.replace(",", "."));
    const preco = Number(form.preco_unitario.replace(",", "."));
    if (!Number.isFinite(qtd) || !Number.isFinite(preco)) return null;
    return calcularLinhaConsumo(qtd, preco, DESCONTO_CONSUMO_PADRAO);
  }, [form]);

  if (!podeRh) {
    return (
      <div className="mx-auto max-w-lg">
        <TituloPagina titulo="Consumos" />
        <Card className="py-10 text-center">
          <UtensilsCrossed size={40} className="mx-auto text-slate-400" />
          <p className="mt-3 font-bold">Área restrita</p>
        </Card>
      </div>
    );
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const quantidade = Number(form.quantidade.replace(",", "."));
    const preco_unitario = Number(form.preco_unitario.replace(",", "."));
    const proximo = structuredClone(db);
    const resultado = criarConsumoPessoa(
      proximo,
      {
        pessoa_id: form.pessoa_id,
        data: form.data,
        descricao: form.descricao,
        quantidade,
        preco_unitario,
      },
      { id: uid("cons") }
    );
    if (!resultado.sucesso) {
      setErro(resultado.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setForm(null);
    setErro(null);
    setMensagem("Consumo lançado. Será descontado no salário (CLT) ou no pagamento do dia (intermitente).");
  }

  function BadgeStatus({ consumo }: { consumo: ConsumoPessoa }) {
    return (
      <Badge cor={consumo.status === "pendente" ? "laranja" : "verde"}>
        {rotuloStatusConsumo(consumo.status)}
      </Badge>
    );
  }

  return (
    <div>
      <TituloPagina
        titulo="Consumo no restaurante"
        subtitulo={`Item a item com ${DESCONTO_CONSUMO_PADRAO}% de desconto. CLT desconta no fim do mês; intermitente no pagamento do dia.`}
        acao={
          <button
            type="button"
            className="btn-primario"
            onClick={() => {
              setForm(
                formVazio(
                  filtroPessoa !== "todos" ? filtroPessoa : pessoasAtivas[0]?.id ?? ""
                )
              );
              setErro(null);
            }}
          >
            <Plus size={16} /> Novo lançamento
          </button>
        }
      />

      {mensagem && (
        <div className="mb-4 rounded-card border border-sucesso bg-sucesso-clara px-4 py-3 text-sm font-medium text-primaria-escura">
          {mensagem}
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="py-3">
          <p className="rotulo">Pendente (preço cheio)</p>
          <p className="text-xl font-bold">{moeda(totais.brutoPend)}</p>
        </Card>
        <Card className="py-3">
          <p className="rotulo text-amber-800">A descontar (com {DESCONTO_CONSUMO_PADRAO}%)</p>
          <p className="text-xl font-bold text-amber-900">{moeda(totais.liquidoPend)}</p>
        </Card>
        <Card className="py-3">
          <p className="rotulo">Total lançado (bruto)</p>
          <p className="text-xl font-bold">{moeda(totais.brutoTodos)}</p>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        {(
          [
            ["pendentes", "Pendentes"],
            ["descontados", "Descontados"],
            ["todos", "Todos"],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            className={filtro === id ? "btn-primario" : "btn-secundario"}
            onClick={() => irParaFiltro(id)}
          >
            {rotulo}
          </button>
        ))}
        <label className="block min-w-[12rem] flex-1 sm:max-w-xs">
          <span className="rotulo mb-1 block">Pessoa</span>
          <select
            className="input w-full"
            value={filtroPessoa}
            onChange={(e) => aoMudarFiltroPessoa(e.target.value)}
          >
            <option value="todos">Todas</option>
            {pessoasAtivas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <Link href="/rh/pagamentos" className="btn-secundario sm:ml-auto">
          Ver pagamentos
        </Link>
      </div>

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhum consumo neste filtro." />
      ) : (
        <div className="space-y-3">
          {lista.map((consumo) => (
            <Card key={consumo.id} className="space-y-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{nomePessoa(consumo.pessoa_id)}</p>
                  <p className="text-sm text-slate-700">
                    {consumo.descricao} · {consumo.quantidade} × {moeda(consumo.preco_unitario)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {dataBR(consumo.data)} · cheio {moeda(consumo.valor_bruto)} → com desconto{" "}
                    <span className="font-semibold text-slate-800">{moeda(consumo.valor_liquido)}</span>
                  </p>
                </div>
                <BadgeStatus consumo={consumo} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal aberto={form !== null} titulo="Novo consumo" onFechar={() => setForm(null)} fecharAoClicarFundo={false}>
        {form && (
          <form onSubmit={salvar} className="space-y-3">
            <Campo rotulo="Pessoa *">
              <select
                className="campo"
                required
                value={form.pessoa_id}
                onChange={(e) => setForm({ ...form, pessoa_id: e.target.value })}
              >
                <option value="">Selecione</option>
                {pessoasAtivas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({p.tipo})
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Data *">
              <input
                type="date"
                className="campo"
                required
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Item / descrição *">
              <input
                className="campo"
                required
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Ex.: Almoço executivo"
              />
            </Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Quantidade *">
                <input
                  className="campo"
                  required
                  inputMode="decimal"
                  value={form.quantidade}
                  onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Preço unitário (cheio) *">
                <input
                  className="campo"
                  required
                  inputMode="decimal"
                  value={form.preco_unitario}
                  onChange={(e) => setForm({ ...form, preco_unitario: e.target.value })}
                />
              </Campo>
            </div>
            {preview && (
              <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
                <p>
                  Preço cheio: <strong>{moeda(preview.valor_bruto)}</strong>
                </p>
                <p>
                  Com {DESCONTO_CONSUMO_PADRAO}%: <strong>{moeda(preview.valor_liquido)}</strong> (a descontar)
                </p>
              </div>
            )}
            {erro && <p className="text-sm font-medium text-destaque">{erro}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secundario" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario">
                Lançar
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

export default function RhConsumosPage() {
  return (
    <Suspense
      fallback={
        <div>
          <TituloPagina titulo="RH — Consumos" subtitulo="Carregando…" />
          <p className="text-sm text-slate-500">Carregando consumos…</p>
        </div>
      }
    >
      <RhConsumosConteudo />
    </Suspense>
  );
}
