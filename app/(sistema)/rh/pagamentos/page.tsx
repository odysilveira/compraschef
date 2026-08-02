"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleCheckBig, FileUp, Plus, TriangleAlert, WalletCards } from "lucide-react";
import { Badge, Campo, Card, Modal, TituloPagina, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import {
  TIPOS_PAGAMENTO_PESSOA,
  conciliarPagamentoPessoa,
  informarPagamentoPessoa,
  liberarPagamentoPessoa,
  registrarDivergenciaPagamentoPessoa,
  rotuloStatusPagamentoPessoa,
  rotuloTipoPagamentoPessoa,
} from "@/lib/domain/pagamentos-pessoas";
import {
  aplicarDescontosNoPagamento,
  pagamentoUsaConsumoDiario,
  previewFechamentoIntermitente,
  previewFechamentoSalario,
  validarAdiantamento,
} from "@/lib/domain/consumos-pessoas";
import {
  criarPagamentosDaFolha,
  parseRecibosFolhaTexto,
  vincularRecibosAPessoas,
  type ReciboFolhaVinculado,
} from "@/lib/domain/folha-recibo-pdf";
import { extrairTextoPdfBrowser } from "@/lib/domain/folha-recibo-pdf-browser";
import { usePodeAcessarModulo } from "@/lib/roles";
import { dataBR, moeda } from "@/lib/format";
import type { PagamentoPessoa, TipoPagamentoPessoa } from "@/lib/types";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function competenciaAtual(): string {
  return hojeISO().slice(0, 7);
}

type FormNovo = {
  pessoa_id: string;
  tipo: TipoPagamentoPessoa;
  descricao: string;
  competencia: string;
  vencimento: string;
  valor: string;
  horas: string;
  valor_hora: string;
};

type FormInformar = {
  dataPagamento: string;
  valorPago: string;
  bancoConta: string;
  responsavel: string;
  observacao: string;
};

function formNovoVazio(pessoaId = ""): FormNovo {
  return {
    pessoa_id: pessoaId,
    tipo: "salario",
    descricao: "",
    competencia: competenciaAtual(),
    vencimento: hojeISO(),
    valor: "",
    horas: "",
    valor_hora: "",
  };
}

function BadgeStatusPagamento({ pagamento }: { pagamento: PagamentoPessoa }) {
  const cor =
    pagamento.status === "pago"
      ? "verde"
      : pagamento.status === "aguardando_conciliacao"
        ? "azul"
        : pagamento.status === "liberado"
          ? "laranja"
          : "cinza";
  return <Badge cor={cor}>{rotuloStatusPagamentoPessoa(pagamento.status)}</Badge>;
}

export default function RhPagamentosPage() {
  const db = useDB();
  const podeRh = usePodeAcessarModulo("rh");
  const [filtro, setFiltro] = useState<"abertos" | "aguardando" | "pagos" | "todos">("abertos");
  const [formNovo, setFormNovo] = useState<FormNovo | null>(null);
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const [informarId, setInformarId] = useState<string | null>(null);
  const [formInformar, setFormInformar] = useState<FormInformar>({
    dataPagamento: hojeISO(),
    valorPago: "",
    bancoConta: "",
    responsavel: "usuário local",
    observacao: "",
  });
  const [erroInformar, setErroInformar] = useState<string | null>(null);

  const [conciliarId, setConciliarId] = useState<string | null>(null);
  const [dataLiquidacao, setDataLiquidacao] = useState(hojeISO());
  const [erroConciliar, setErroConciliar] = useState<string | null>(null);

  const [divergenciaId, setDivergenciaId] = useState<string | null>(null);
  const [motivoDivergencia, setMotivoDivergencia] = useState("");
  const [erroDivergencia, setErroDivergencia] = useState<string | null>(null);

  const [importAberto, setImportAberto] = useState(false);
  const [importPasso, setImportPasso] = useState<"arquivo" | "revisao">("arquivo");
  const [importLinhas, setImportLinhas] = useState<ReciboFolhaVinculado[]>([]);
  const [importCarregando, setImportCarregando] = useState(false);
  const [erroImport, setErroImport] = useState<string | null>(null);
  const [vencimentoImport, setVencimentoImport] = useState(hojeISO());

  const pessoasAtivas = useMemo(
    () => (db.pessoas ?? []).filter((p) => p.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [db.pessoas]
  );

  const nomePessoa = (id: string) => db.pessoas.find((p) => p.id === id)?.nome ?? "—";

  const lista = useMemo(() => {
    const todos = [...(db.pagamentos_pessoas ?? [])];
    const filtrados = todos.filter((p) => {
      if (filtro === "todos") return true;
      if (filtro === "aguardando") return p.status === "aguardando_conciliacao";
      if (filtro === "pagos") return p.status === "pago";
      return p.status === "previsto" || p.status === "liberado" || p.status === "aguardando_conciliacao";
    });
    return filtrados.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  }, [db.pagamentos_pessoas, filtro]);

  const totais = useMemo(() => {
    const itens = db.pagamentos_pessoas ?? [];
    return {
      aguardando: itens.filter((p) => p.status === "aguardando_conciliacao").reduce((s, p) => s + (p.pagamento_valor ?? p.valor), 0),
      pagos: itens.filter((p) => p.status === "pago").reduce((s, p) => s + (p.pagamento_valor ?? p.valor), 0),
      abertos: itens
        .filter((p) => p.status === "previsto" || p.status === "liberado")
        .reduce((s, p) => s + p.valor, 0),
    };
  }, [db.pagamentos_pessoas]);

  const previewNovo = useMemo(() => {
    if (!formNovo?.pessoa_id) return null;
    const bruto = Number(formNovo.valor.replace(",", "."));
    if (!Number.isFinite(bruto) || bruto <= 0) return null;
    if (formNovo.tipo === "salario") {
      return previewFechamentoSalario(db, formNovo.pessoa_id, formNovo.competencia || competenciaAtual(), bruto);
    }
    if (pagamentoUsaConsumoDiario(formNovo.tipo)) {
      return previewFechamentoIntermitente(db, formNovo.pessoa_id, bruto);
    }
    return null;
  }, [db, formNovo]);

  if (!podeRh) {
    return (
      <div className="mx-auto max-w-lg">
        <TituloPagina titulo="Pagamentos de pessoas" />
        <Card className="py-10 text-center">
          <WalletCards size={40} className="mx-auto text-slate-400" />
          <p className="mt-3 font-bold">Área restrita</p>
        </Card>
      </div>
    );
  }

  function salvarNovo(e: FormEvent) {
    e.preventDefault();
    if (!formNovo) return;
    if (!formNovo.pessoa_id) {
      setErroNovo("Selecione a pessoa.");
      return;
    }
    const pessoa = db.pessoas.find((p) => p.id === formNovo.pessoa_id);
    const valorBruto = Number(formNovo.valor.replace(",", "."));
    if (!Number.isFinite(valorBruto) || valorBruto <= 0) {
      setErroNovo("Informe um valor válido.");
      return;
    }

    if (formNovo.tipo === "adiantamento") {
      const checagem = validarAdiantamento(pessoa?.salario, valorBruto);
      if (!checagem.ok) {
        setErroNovo(checagem.erros.join(" "));
        return;
      }
    }

    const agora = new Date().toISOString();
    const horas = formNovo.horas ? Number(formNovo.horas.replace(",", ".")) : undefined;
    const valorHora = formNovo.valor_hora ? Number(formNovo.valor_hora.replace(",", ".")) : undefined;
    const competencia = formNovo.competencia || undefined;

    mutate((banco) => {
      const id = uid("pagp");
      const pagamento: PagamentoPessoa = {
        id,
        pessoa_id: formNovo.pessoa_id,
        tipo: formNovo.tipo,
        descricao: formNovo.descricao.trim() || undefined,
        competencia,
        vencimento: formNovo.vencimento,
        valor: Number(valorBruto.toFixed(2)),
        valor_bruto: Number(valorBruto.toFixed(2)),
        horas: Number.isFinite(horas) ? horas : undefined,
        valor_hora: Number.isFinite(valorHora) ? valorHora : undefined,
        status: "previsto",
        criado_em: agora,
        atualizado_em: agora,
      };
      banco.pagamentos_pessoas.push(pagamento);

      if (formNovo.tipo === "salario" || pagamentoUsaConsumoDiario(formNovo.tipo)) {
        aplicarDescontosNoPagamento(banco, id);
      }
    });
    setFormNovo(null);
    setErroNovo(null);
    setMensagem("Pagamento lançado como previsto.");
  }

  function aoMudarPessoaOuTipo(pessoaId: string, tipo: TipoPagamentoPessoa) {
    if (!formNovo) return;
    const pessoa = db.pessoas.find((p) => p.id === pessoaId);
    let valor = formNovo.valor;
    let valorHora = formNovo.valor_hora;
    let horas = formNovo.horas;

    if (tipo === "adiantamento" && pessoa?.adiantamento_valor != null) {
      valor = pessoa.adiantamento_valor.toFixed(2);
    } else if (tipo === "salario" && pessoa?.salario != null) {
      valor = pessoa.salario.toFixed(2);
    } else if (pagamentoUsaConsumoDiario(tipo) && pessoa?.valor_hora != null && !formNovo.valor) {
      valorHora = pessoa.valor_hora.toFixed(2);
    }

    setFormNovo({
      ...formNovo,
      pessoa_id: pessoaId,
      tipo,
      valor,
      valor_hora: valorHora,
      horas,
    });
  }

  function abrirInformar(pagamento: PagamentoPessoa) {
    const pessoa = db.pessoas.find((p) => p.id === pagamento.pessoa_id);
    setInformarId(pagamento.id);
    setFormInformar({
      dataPagamento: hojeISO(),
      valorPago: pagamento.valor.toFixed(2),
      bancoConta: pessoa?.chave_pix ? `PIX ${pessoa.chave_pix}` : "",
      responsavel: "usuário local",
      observacao: "",
    });
    setErroInformar(null);
  }

  function confirmarInformar(e: FormEvent) {
    e.preventDefault();
    if (!informarId) return;
    const valorPago = Number(formInformar.valorPago.replace(",", "."));
    const proximo = structuredClone(db);
    const resultado = informarPagamentoPessoa(proximo, informarId, {
      dataPagamento: formInformar.dataPagamento,
      valorPago,
      bancoConta: formInformar.bancoConta,
      responsavel: formInformar.responsavel,
      observacao: formInformar.observacao,
    });
    if (!resultado.sucesso) {
      setErroInformar(resultado.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setInformarId(null);
    setMensagem("Pagamento informado. Aguardando conciliação bancária.");
  }

  function confirmarConciliar(e: FormEvent) {
    e.preventDefault();
    if (!conciliarId) return;
    const proximo = structuredClone(db);
    const resultado = conciliarPagamentoPessoa(proximo, conciliarId, {
      dataLiquidacao,
      responsavel: "usuário local",
    });
    if (!resultado.sucesso) {
      setErroConciliar(resultado.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setConciliarId(null);
    setMensagem("Pagamento conciliado e marcado como pago.");
  }

  function confirmarDivergencia(e: FormEvent) {
    e.preventDefault();
    if (!divergenciaId) return;
    const proximo = structuredClone(db);
    const resultado = registrarDivergenciaPagamentoPessoa(proximo, divergenciaId, {
      motivo: motivoDivergencia,
      responsavel: "usuário local",
    });
    if (!resultado.sucesso) {
      setErroDivergencia(resultado.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setDivergenciaId(null);
    setMotivoDivergencia("");
    setMensagem("Divergência registrada. Segue aguardando conciliação.");
  }

  function abrirImportacao() {
    setImportAberto(true);
    setImportPasso("arquivo");
    setImportLinhas([]);
    setErroImport(null);
    setVencimentoImport(hojeISO());
  }

  async function onArquivoFolha(file: File | null) {
    if (!file) return;
    setImportCarregando(true);
    setErroImport(null);
    try {
      const buffer = await file.arrayBuffer();
      const texto = await extrairTextoPdfBrowser(buffer);
      const recibos = parseRecibosFolhaTexto(texto);
      if (recibos.length === 0) {
        setErroImport("Não encontrei recibos neste PDF. Confira se é o arquivo de Recibos de Salários do contador.");
        return;
      }
      const vinculados = vincularRecibosAPessoas(recibos, db.pessoas ?? [], db.pagamentos_pessoas ?? []);
      setImportLinhas(vinculados);
      setImportPasso("revisao");
    } catch (err) {
      setErroImport(err instanceof Error ? err.message : "Falha ao ler o PDF.");
    } finally {
      setImportCarregando(false);
    }
  }

  function atualizarLinhaImport(idx: number, patch: Partial<ReciboFolhaVinculado>) {
    setImportLinhas((atual) =>
      atual.map((linha, i) => {
        if (i !== idx) return linha;
        const proxima = { ...linha, ...patch };
        if (patch.pessoa_id !== undefined) {
          const pessoa = db.pessoas.find((p) => p.id === patch.pessoa_id);
          proxima.pessoa_nome = pessoa?.nome;
          proxima.alerta = pessoa
            ? proxima.ja_existe
              ? "Já existe pagamento igual nesta competência."
              : undefined
            : "Pessoa não encontrada — selecione manualmente.";
        }
        return proxima;
      })
    );
  }

  function confirmarImportacao() {
    const selecionadas = importLinhas.filter((l) => l.selecionado);
    if (selecionadas.length === 0) {
      setErroImport("Selecione ao menos um recibo para importar.");
      return;
    }
    let resultado = { criados: 0, ignorados: 0, erros: [] as string[] };
    mutate((banco) => {
      resultado = criarPagamentosDaFolha(banco, importLinhas, {
        vencimento: vencimentoImport,
        idFactory: () => uid("pagp"),
      });
    });
    setImportAberto(false);
    setImportLinhas([]);
    setMensagem(
      `Folha importada: ${resultado.criados} pagamento(s) criado(s)${
        resultado.ignorados ? ` · ${resultado.ignorados} ignorado(s)` : ""
      }.`
    );
  }

  const pagamentoInformar = informarId ? db.pagamentos_pessoas.find((p) => p.id === informarId) : null;
  const pagamentoConciliar = conciliarId ? db.pagamentos_pessoas.find((p) => p.id === conciliarId) : null;
  const pagamentoDivergencia = divergenciaId ? db.pagamentos_pessoas.find((p) => p.id === divergenciaId) : null;

  return (
    <div>
      <TituloPagina
        titulo="Pagamentos de pessoas"
        subtitulo="Informar pagamento ≠ pago. A baixa definitiva depende da conciliação bancária."
        acao={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secundario" onClick={abrirImportacao}>
              <FileUp size={16} /> Importar folha PDF
            </button>
            <button type="button" className="btn-primario" onClick={() => setFormNovo(formNovoVazio(pessoasAtivas[0]?.id ?? ""))}>
              <Plus size={16} /> Novo pagamento
            </button>
          </div>
        }
      />

      {mensagem && (
        <div className="mb-4 rounded-card border border-sucesso bg-sucesso-clara px-4 py-3 text-sm font-medium text-primaria-escura">
          {mensagem}
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="py-3">
          <p className="rotulo">Abertos</p>
          <p className="text-xl font-bold">{moeda(totais.abertos)}</p>
        </Card>
        <Card className="py-3">
          <p className="rotulo text-blue-700">Aguardando conciliação</p>
          <p className="text-xl font-bold text-blue-700">{moeda(totais.aguardando)}</p>
        </Card>
        <Card className="py-3">
          <p className="rotulo text-emerald-700">Pagos</p>
          <p className="text-xl font-bold text-emerald-700">{moeda(totais.pagos)}</p>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["abertos", "Abertos"],
            ["aguardando", "Aguardando"],
            ["pagos", "Pagos"],
            ["todos", "Todos"],
          ] as const
        ).map(([id, rotulo]) => (
          <button key={id} type="button" className={filtro === id ? "btn-primario" : "btn-secundario"} onClick={() => setFiltro(id)}>
            {rotulo}
          </button>
        ))}
        <Link href="/rh" className="btn-secundario ml-auto">
          Ver pessoas
        </Link>
        <Link href="/rh/consumos" className="btn-secundario">
          Consumos
        </Link>
      </div>

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhum pagamento neste filtro." />
      ) : (
        <div className="space-y-3">
          {lista.map((pagamento) => (
            <Card key={pagamento.id} className="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-900">{nomePessoa(pagamento.pessoa_id)}</p>
                  <p className="text-sm text-slate-600">
                    {rotuloTipoPagamentoPessoa(pagamento.tipo)}
                    {pagamento.descricao ? ` · ${pagamento.descricao}` : ""}
                    {pagamento.convocacao_id ? " · via convocação" : ""}
                  </p>
                  <p className="text-xl font-bold">{moeda(pagamento.pagamento_valor ?? pagamento.valor)}</p>
                  {(pagamento.desconto_consumo || pagamento.desconto_adiantamento) && (
                    <p className="text-xs text-slate-500">
                      Bruto {moeda(pagamento.valor_bruto ?? pagamento.valor)}
                      {pagamento.desconto_adiantamento
                        ? ` − adiant. ${moeda(pagamento.desconto_adiantamento)}`
                        : ""}
                      {pagamento.desconto_consumo ? ` − consumo ${moeda(pagamento.desconto_consumo)}` : ""}
                    </p>
                  )}
                  <p className="text-sm text-slate-500">Vencimento {dataBR(pagamento.vencimento)}</p>
                  {pagamento.status === "aguardando_conciliacao" && pagamento.pagamento_banco_conta && (
                    <p className="text-sm text-blue-800">
                      Informado em {pagamento.pagamento_data ? dataBR(pagamento.pagamento_data) : "—"} ·{" "}
                      {pagamento.pagamento_banco_conta}
                    </p>
                  )}
                  {pagamento.conciliacao_divergente && pagamento.conciliacao_divergencia_motivo && (
                    <p className="text-sm font-medium text-destaque">Divergência: {pagamento.conciliacao_divergencia_motivo}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <BadgeStatusPagamento pagamento={pagamento} />
                  {pagamento.conciliacao_divergente && pagamento.status === "aguardando_conciliacao" && (
                    <Badge cor="laranja">Divergente</Badge>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {pagamento.status === "previsto" && (
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() => {
                      const proximo = structuredClone(db);
                      const r = liberarPagamentoPessoa(proximo, pagamento.id);
                      if (r.sucesso) {
                        mutate((atual) => Object.assign(atual, proximo));
                        setMensagem("Pagamento liberado.");
                      }
                    }}
                  >
                    Liberar
                  </button>
                )}
                {(pagamento.status === "previsto" || pagamento.status === "liberado") && (
                  <button type="button" className="btn-primario" onClick={() => abrirInformar(pagamento)}>
                    Informar pagamento
                  </button>
                )}
                {pagamento.status === "aguardando_conciliacao" && (
                  <>
                    <button
                      type="button"
                      className="btn-primario"
                      onClick={() => {
                        setConciliarId(pagamento.id);
                        setDataLiquidacao(pagamento.pagamento_data || hojeISO());
                        setErroConciliar(null);
                      }}
                    >
                      <CircleCheckBig size={16} /> Conciliar
                    </button>
                    <button
                      type="button"
                      className="btn-secundario"
                      onClick={() => {
                        setDivergenciaId(pagamento.id);
                        setMotivoDivergencia("");
                        setErroDivergencia(null);
                      }}
                    >
                      <TriangleAlert size={16} /> Divergente
                    </button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal aberto={formNovo !== null} titulo="Novo pagamento" onFechar={() => setFormNovo(null)} fecharAoClicarFundo={false}>
        {formNovo && (
          <form onSubmit={salvarNovo} className="space-y-3">
            <Campo rotulo="Pessoa *">
              <select
                className="campo"
                required
                value={formNovo.pessoa_id}
                onChange={(e) => aoMudarPessoaOuTipo(e.target.value, formNovo.tipo)}
              >
                <option value="">Selecione</option>
                {pessoasAtivas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Tipo *">
                <select
                  className="campo"
                  value={formNovo.tipo}
                  onChange={(e) => aoMudarPessoaOuTipo(formNovo.pessoa_id, e.target.value as TipoPagamentoPessoa)}
                >
                  {TIPOS_PAGAMENTO_PESSOA.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Competência">
                <input
                  type="month"
                  className="campo"
                  value={formNovo.competencia}
                  onChange={(e) => setFormNovo({ ...formNovo, competencia: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Vencimento *">
                <input
                  type="date"
                  className="campo"
                  required
                  value={formNovo.vencimento}
                  onChange={(e) => setFormNovo({ ...formNovo, vencimento: e.target.value })}
                />
              </Campo>
              <Campo
                rotulo={
                  formNovo.tipo === "salario" || pagamentoUsaConsumoDiario(formNovo.tipo)
                    ? "Valor bruto *"
                    : "Valor *"
                }
              >
                <input
                  className="campo"
                  required
                  inputMode="decimal"
                  value={formNovo.valor}
                  onChange={(e) => setFormNovo({ ...formNovo, valor: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Horas (se houver)">
                <input
                  className="campo"
                  inputMode="decimal"
                  value={formNovo.horas}
                  onChange={(e) => setFormNovo({ ...formNovo, horas: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Valor-hora (se houver)">
                <input
                  className="campo"
                  inputMode="decimal"
                  value={formNovo.valor_hora}
                  onChange={(e) => setFormNovo({ ...formNovo, valor_hora: e.target.value })}
                />
              </Campo>
            </div>
            <Campo rotulo="Descrição">
              <input
                className="campo"
                value={formNovo.descricao}
                onChange={(e) => setFormNovo({ ...formNovo, descricao: e.target.value })}
              />
            </Campo>
            {previewNovo && (previewNovo.desconto_consumo > 0 || previewNovo.desconto_adiantamento > 0) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p>
                  Bruto: <strong>{moeda(previewNovo.valor_bruto)}</strong>
                </p>
                {previewNovo.desconto_adiantamento > 0 && (
                  <p>− Adiantamento: {moeda(previewNovo.desconto_adiantamento)}</p>
                )}
                {previewNovo.desconto_consumo > 0 && (
                  <p>
                    − Consumo ({previewNovo.itens_consumo.length} itens): {moeda(previewNovo.desconto_consumo)}
                  </p>
                )}
                <p className="mt-1 font-semibold">A pagar: {moeda(previewNovo.valor_liquido)}</p>
              </div>
            )}
            {formNovo.tipo === "adiantamento" && (
              <p className="text-xs text-slate-500">Teto: 50% do salário cadastrado da pessoa.</p>
            )}
            {erroNovo && <p className="text-sm font-medium text-erro">{erroNovo}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secundario" onClick={() => setFormNovo(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario">
                Salvar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        aberto={Boolean(pagamentoInformar)}
        titulo="Informar pagamento"
        onFechar={() => setInformarId(null)}
        fecharAoClicarFundo={false}
      >
        {pagamentoInformar && (
          <form onSubmit={confirmarInformar} className="space-y-3">
            <div className="rounded-card border border-destaque bg-destaque-clara px-3 py-3 text-sm text-destaque">
              Informar pagamento não dá baixa final. O título fica em aguardando conciliação.
            </div>
            <p className="text-sm text-slate-700">
              {nomePessoa(pagamentoInformar.pessoa_id)} · {moeda(pagamentoInformar.valor)}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Data *">
                <input
                  type="date"
                  className="campo"
                  required
                  value={formInformar.dataPagamento}
                  onChange={(e) => setFormInformar({ ...formInformar, dataPagamento: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Valor pago *">
                <input
                  className="campo"
                  required
                  value={formInformar.valorPago}
                  onChange={(e) => setFormInformar({ ...formInformar, valorPago: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Banco/conta ou PIX *">
                <input
                  className="campo"
                  required
                  value={formInformar.bancoConta}
                  onChange={(e) => setFormInformar({ ...formInformar, bancoConta: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Responsável">
                <input
                  className="campo"
                  value={formInformar.responsavel}
                  onChange={(e) => setFormInformar({ ...formInformar, responsavel: e.target.value })}
                />
              </Campo>
            </div>
            {erroInformar && <p className="text-sm font-medium text-erro">{erroInformar}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secundario" onClick={() => setInformarId(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario">
                Informar pagamento
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal aberto={Boolean(pagamentoConciliar)} titulo="Conciliar pagamento" onFechar={() => setConciliarId(null)}>
        {pagamentoConciliar && (
          <form onSubmit={confirmarConciliar} className="space-y-3">
            <p className="text-sm text-slate-700">
              {nomePessoa(pagamentoConciliar.pessoa_id)} ·{" "}
              {moeda(pagamentoConciliar.pagamento_valor ?? pagamentoConciliar.valor)}
            </p>
            <Campo rotulo="Data da liquidação *">
              <input
                type="date"
                className="campo"
                required
                value={dataLiquidacao}
                onChange={(e) => setDataLiquidacao(e.target.value)}
              />
            </Campo>
            {erroConciliar && <p className="text-sm font-medium text-erro">{erroConciliar}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secundario" onClick={() => setConciliarId(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario">
                Conciliar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal aberto={Boolean(pagamentoDivergencia)} titulo="Registrar divergência" onFechar={() => setDivergenciaId(null)}>
        {pagamentoDivergencia && (
          <form onSubmit={confirmarDivergencia} className="space-y-3">
            <Campo rotulo="Motivo *">
              <textarea
                className="campo min-h-24"
                required
                value={motivoDivergencia}
                onChange={(e) => setMotivoDivergencia(e.target.value)}
              />
            </Campo>
            {erroDivergencia && <p className="text-sm font-medium text-erro">{erroDivergencia}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secundario" onClick={() => setDivergenciaId(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario">
                Registrar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        aberto={importAberto}
        titulo="Importar folha PDF"
        onFechar={() => {
          if (!importCarregando) setImportAberto(false);
        }}
        fecharAoClicarFundo={false}
      >
        {importPasso === "arquivo" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Baixe o PDF de recibos que o contador enviou no WhatsApp e selecione aqui. O sistema lê o líquido,
              adiantamento e consumo de cada pessoa.
            </p>
            <Campo rotulo="Arquivo PDF *">
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="campo"
                disabled={importCarregando}
                onChange={(e) => void onArquivoFolha(e.target.files?.[0] ?? null)}
              />
            </Campo>
            {importCarregando && <p className="text-sm text-slate-600">Lendo PDF…</p>}
            {erroImport && <p className="text-sm font-medium text-destaque">{erroImport}</p>}
            <div className="flex justify-end">
              <button type="button" className="btn-secundario" onClick={() => setImportAberto(false)} disabled={importCarregando}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {importPasso === "revisao" && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Confira os vínculos e o valor líquido. Só as linhas marcadas serão lançadas como pagamento previsto.
            </p>
            <Campo rotulo="Vencimento dos pagamentos">
              <input
                type="date"
                className="campo"
                value={vencimentoImport}
                onChange={(e) => setVencimentoImport(e.target.value)}
              />
            </Campo>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {importLinhas.map((linha, idx) => (
                <div key={`${linha.codigo_funcionario}-${linha.liquido}-${idx}`} className="rounded-lg border border-stone-200 p-3">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={linha.selecionado}
                      onChange={(e) => atualizarLinhaImport(idx, { selecionado: e.target.checked })}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">
                        {linha.codigo_funcionario}-{linha.nome}
                      </p>
                      <p className="text-xs text-slate-500">
                        {linha.tipo_recibo === "pro_labore" ? "Pró-labore" : "Salário"} · {linha.competencia_rotulo}
                      </p>
                      <p className="text-sm">
                        Líquido <strong>{moeda(linha.liquido)}</strong>
                        {linha.adiantamento != null ? ` · Adiant. ${moeda(linha.adiantamento)}` : ""}
                        {linha.consumo != null ? ` · Consumo ${moeda(linha.consumo)}` : ""}
                      </p>
                      <Campo rotulo="Pessoa no ComprasChef">
                        <select
                          className="campo"
                          value={linha.pessoa_id ?? ""}
                          onChange={(e) =>
                            atualizarLinhaImport(idx, {
                              pessoa_id: e.target.value || undefined,
                              selecionado: Boolean(e.target.value) && !linha.ja_existe && linha.liquido > 0,
                            })
                          }
                        >
                          <option value="">Selecione</option>
                          {pessoasAtivas.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome}
                            </option>
                          ))}
                        </select>
                      </Campo>
                      {linha.alerta && <p className="mt-1 text-xs font-medium text-destaque">{linha.alerta}</p>}
                    </div>
                  </label>
                </div>
              ))}
            </div>
            {erroImport && <p className="text-sm font-medium text-destaque">{erroImport}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn-secundario"
                onClick={() => {
                  setImportPasso("arquivo");
                  setImportLinhas([]);
                  setErroImport(null);
                }}
              >
                Outro arquivo
              </button>
              <button type="button" className="btn-primario" onClick={confirmarImportacao}>
                Confirmar importação ({importLinhas.filter((l) => l.selecionado).length})
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
