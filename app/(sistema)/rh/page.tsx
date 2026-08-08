"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Plus, Users } from "lucide-react";
import { Badge, Campo, Card, Modal, StatCard, TituloPagina, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import {
  FUNCOES_OPERACIONAIS,
  TIPOS_PESSOA_RH,
  abaDestinoHubPessoaRh,
  hrefPerfilRh,
  permissoesPorPapel,
  permissoesVazias,
  rotuloFuncao,
  rotuloTipoPessoa,
  somenteDigitosCpf,
  somenteDigitosTelefone,
  validarCpf,
} from "@/lib/domain/rh";
import { validarAdiantamento } from "@/lib/domain/consumos-pessoas";
import {
  alertaDocumentosPessoa,
  exportarDocumentosPessoasCsv,
  garantirChecklistDocumentos,
  rotuloCurtoAlertaDocumentos,
} from "@/lib/domain/documentos-pessoa";
import {
  corBadgeMediaAvaliacao,
  formatarMediaAvaliacao,
  listarAvaliacoesPessoa,
  resumirAvaliacoesPessoa,
} from "@/lib/domain/avaliacoes-pessoa";
import { hrefConsumosRh, hrefEscalaRh, hrefNormasRh, hrefPagamentosRh, hrefPessoasRh, hrefPontoRh, filtroConvocacaoEscalaRhPrioritario, filtroDocsRhPrioritario, filtroPontoRhPrioritario, parseFiltroDocsRh, pessoaCorrespondeFiltroDocsRh, resumirOperacionalRh, type FiltroDocsRh } from "@/lib/domain/resumo-rh";
import { usePodeAcessarModulo } from "@/lib/roles";
import type { FuncaoOperacional, Papel, PessoaRH, TipoPessoaRH } from "@/lib/types";

type FormNovaPessoa = {
  nome: string;
  tipo: TipoPessoaRH;
  funcao: FuncaoOperacional;
  funcao_custom: string;
  cargo: string;
  telefone: string;
  cpf: string;
  salario: string;
  adiantamento_valor: string;
  valor_hora: string;
  chave_pix: string;
  contrato_assinado: boolean;
  esocial_ok: boolean;
  observacao: string;
  tem_acesso_sistema: boolean;
  login: string;
  senha: string;
  papel_sistema: Papel;
};

function formVazio(): FormNovaPessoa {
  return {
    nome: "",
    tipo: "colaborador",
    funcao: "salao",
    funcao_custom: "",
    cargo: "",
    telefone: "",
    cpf: "",
    salario: "",
    adiantamento_valor: "",
    valor_hora: "",
    chave_pix: "",
    contrato_assinado: false,
    esocial_ok: false,
    observacao: "",
    tem_acesso_sistema: false,
    login: "",
    senha: "demo123",
    papel_sistema: "lider",
  };
}

function precisaDadosConvocacao(tipo: TipoPessoaRH): boolean {
  return tipo === "intermitente" || tipo === "entregador";
}

function BadgeTipo({ tipo }: { tipo: TipoPessoaRH }) {
  const cor =
    tipo === "colaborador" ? "verde" : tipo === "intermitente" ? "azul" : tipo === "entregador" ? "laranja" : "cinza";
  return <Badge cor={cor}>{rotuloTipoPessoa(tipo)}</Badge>;
}

function RhPessoasConteudo() {
  const db = useDB();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<TipoPessoaRH | "todos">("todos");
  const [filtroDocs, setFiltroDocs] = useState<FiltroDocsRh>(() =>
    parseFiltroDocsRh(searchParams.get("docs"))
  );
  const [form, setForm] = useState<FormNovaPessoa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const podeGerirRh = usePodeAcessarModulo("rh");

  useEffect(() => {
    setFiltroDocs(parseFiltroDocsRh(searchParams.get("docs")));
  }, [searchParams]);

  function irParaFiltroDocs(proximo: FiltroDocsRh) {
    setFiltroDocs(proximo);
    router.replace(hrefPessoasRh({ docs: proximo }), { scroll: false });
  }

  const contagemAlertaDocs = useMemo(() => {
    return (db.pessoas ?? []).filter((p) => p.ativo && alertaDocumentosPessoa(p).tem_alerta).length;
  }, [db.pessoas]);

  const resumoOp = useMemo(() => resumirOperacionalRh(db), [db]);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (db.pessoas ?? [])
      .filter((p) => p.ativo)
      .filter((p) => (filtroTipo === "todos" ? true : p.tipo === filtroTipo))
      .filter((p) => pessoaCorrespondeFiltroDocsRh(p, filtroDocs))
      .filter((p) => {
        if (!termo) return true;
        return [p.nome, p.cargo, p.telefone, p.cpf, p.login, rotuloFuncao(p), rotuloTipoPessoa(p.tipo)]
          .filter(Boolean)
          .some((campo) => String(campo).toLowerCase().includes(termo));
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [busca, db.pessoas, filtroDocs, filtroTipo]);

  if (!podeGerirRh) {
    return (
      <div className="mx-auto max-w-lg">
        <TituloPagina titulo="RH — Pessoas" />
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Users size={48} className="text-slate-400" />
          <p className="text-lg font-bold">Área restrita</p>
          <p className="text-sm text-slate-600">Somente dono e gerente podem gerenciar o RH nesta fase.</p>
        </Card>
      </div>
    );
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const nome = form.nome.trim();
    if (!nome) {
      setErro("Informe o nome.");
      return;
    }
    if (form.tem_acesso_sistema && !form.login.trim()) {
      setErro("Informe o login para quem terá acesso ao sistema.");
      return;
    }
    const checagemCpf = validarCpf(form.cpf);
    if (form.cpf.trim() && !checagemCpf.valido) {
      setErro(checagemCpf.mensagem ?? "CPF inválido.");
      return;
    }

    const salario = form.salario ? Number(form.salario.replace(",", ".")) : undefined;
    const adiantamento = form.adiantamento_valor ? Number(form.adiantamento_valor.replace(",", ".")) : undefined;
    if (adiantamento != null && adiantamento > 0) {
      const checagemAdiant = validarAdiantamento(salario, adiantamento);
      if (!checagemAdiant.ok) {
        setErro(checagemAdiant.erros.join(" "));
        return;
      }
    }

    const ehConvocavel = precisaDadosConvocacao(form.tipo);
    const valorHora = form.valor_hora ? Number(form.valor_hora.replace(",", ".")) : undefined;
    if (ehConvocavel) {
      if (!form.telefone.trim()) {
        setErro("Informe o telefone / WhatsApp para convocar.");
        return;
      }
      if (!Number.isFinite(valorHora) || !(valorHora as number > 0)) {
        setErro("Informe o valor-hora (necessário para a escala).");
        return;
      }
    }

    const agora = new Date().toISOString();
    const permissoes = form.tem_acesso_sistema ? permissoesPorPapel(form.papel_sistema) : permissoesVazias();

    mutate((banco) => {
      const pessoa: PessoaRH = {
        id: uid("pes"),
        nome,
        tipo: form.tipo,
        funcao: form.funcao,
        funcao_custom: form.funcao === "custom" ? form.funcao_custom.trim() || undefined : undefined,
        cargo: form.cargo.trim() || undefined,
        telefone: form.telefone.trim() || undefined,
        cpf: form.cpf.trim() ? somenteDigitosCpf(form.cpf) : undefined,
        salario: Number.isFinite(salario) && (salario as number) > 0 ? salario : undefined,
        adiantamento_valor:
          Number.isFinite(adiantamento) && (adiantamento as number) > 0 ? adiantamento : undefined,
        valor_hora:
          ehConvocavel && Number.isFinite(valorHora) && (valorHora as number) > 0 ? valorHora : undefined,
        chave_pix: ehConvocavel && form.chave_pix.trim() ? form.chave_pix.trim() : undefined,
        observacao: form.observacao.trim() || undefined,
        tem_acesso_sistema: form.tem_acesso_sistema,
        login: form.tem_acesso_sistema ? form.login.trim().toLowerCase() : undefined,
        senha: form.tem_acesso_sistema ? form.senha || "demo123" : undefined,
        papel_sistema: form.tem_acesso_sistema ? form.papel_sistema : undefined,
        permissoes,
        ativo: true,
        criado_em: agora,
        atualizado_em: agora,
        contrato_assinado: form.tipo === "colaborador" ? true : form.contrato_assinado,
        esocial_ok: form.tipo === "colaborador" ? true : form.esocial_ok,
      };
      pessoa.documentos = garantirChecklistDocumentos(pessoa, agora);

      if (form.tem_acesso_sistema) {
        const perfilId = uid("perfil");
        banco.perfis.push({
          id: perfilId,
          nome,
          papel: form.papel_sistema,
          ativo: true,
        });
        pessoa.perfil_id = perfilId;
      }

      banco.pessoas.push(pessoa);
    });

    setForm(null);
    setErro(null);
  }

  function baixarDocumentosCsv() {
    if (lista.length === 0) {
      setErro("Nenhuma pessoa neste filtro para exportar.");
      setMensagem(null);
      return;
    }
    const csv = exportarDocumentosPessoasCsv(lista);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rh-documentos${
      filtroDocs === "todos" ? "" : `-${filtroDocs}`
    }.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMensagem(`CSV baixado (${lista.length} pessoa(s)).`);
    setErro(null);
  }

  return (
    <div>
      <TituloPagina
        titulo="RH — Pessoas"
        subtitulo="Cadastro do time — escala em Escala e valores em Pagamentos."
        acao={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secundario"
              disabled={lista.length === 0}
              onClick={baixarDocumentosCsv}
              title={
                lista.length === 0
                  ? "Nada para exportar neste filtro"
                  : "Exportar checklist de documentos (CSV)"
              }
            >
              <Download size={16} /> Exportar docs
            </button>
            <button type="button" className="btn-primario" onClick={() => setForm(formVazio())}>
              <Plus size={16} /> Nova pessoa
            </button>
          </div>
        }
      />

      {mensagem && (
        <div className="mb-4 rounded-card border border-sucesso bg-sucesso-clara px-4 py-3 text-sm font-medium text-primaria-escura">
          {mensagem}
        </div>
      )}
      {erro && !form && (
        <div className="mb-4 rounded-card border border-erro bg-erro-clara px-4 py-3 text-sm font-medium text-erro">
          {erro}
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <button
          type="button"
          className="text-left"
          onClick={() => {
            irParaFiltroDocs("todos");
            setFiltroTipo("todos");
            setBusca("");
          }}
        >
          <StatCard rotulo="Pessoas ativas" valor={String(resumoOp.pessoas_ativas)} cor="cinza" />
        </button>
        <button
          type="button"
          className="text-left"
          onClick={() => {
            irParaFiltroDocs(filtroDocsRhPrioritario(resumoOp));
            setBusca("");
          }}
        >
          <StatCard
            rotulo="Docs com alerta"
            valor={String(resumoOp.docs_alerta)}
            subtexto={
              resumoOp.docs_vencido > 0
                ? `${resumoOp.docs_vencido} vencido(s)${
                    resumoOp.docs_a_vencer > 0 ? ` · ${resumoOp.docs_a_vencer} a vencer` : ""
                  }`
                : resumoOp.docs_a_vencer > 0
                  ? `${resumoOp.docs_a_vencer} a vencer (30 dias)`
                  : "Clique para filtrar"
            }
            cor={
              resumoOp.docs_vencido > 0
                ? "laranja"
                : resumoOp.docs_a_vencer > 0
                  ? "amarelo"
                  : resumoOp.docs_alerta > 0
                    ? "laranja"
                    : "verde"
            }
          />
        </button>
        <Link
          href={hrefPontoRh({
            aba: "pendencias",
            filtro: filtroPontoRhPrioritario(resumoOp),
          })}
          className="block"
        >
          <StatCard
            rotulo="Pendências de ponto"
            valor={String(resumoOp.ponto_abertas)}
            subtexto={
              resumoOp.ponto_propostas > 0
                ? `${resumoOp.ponto_propostas} proposta(s) · Abrir`
                : resumoOp.ponto_a_avisar > 0
                  ? `${resumoOp.ponto_a_avisar} a avisar · Abrir`
                  : "Abrir ponto"
            }
            cor={
              resumoOp.ponto_propostas > 0
                ? "laranja"
                : resumoOp.ponto_abertas > 0
                  ? "amarelo"
                  : "verde"
            }
          />
        </Link>
        <Link
          href={hrefEscalaRh({
            convocacao: filtroConvocacaoEscalaRhPrioritario(resumoOp),
          })}
          className="block"
        >
          <StatCard
            rotulo="Convocações"
            valor={String(
              resumoOp.convocacoes_enviadas + resumoOp.convocacoes_rascunho
            )}
            subtexto={
              resumoOp.convocacoes_sem_resposta > 0
                ? `${resumoOp.convocacoes_sem_resposta} sem resposta · Abrir escala`
                : resumoOp.convocacoes_rascunho > 0
                  ? `${resumoOp.convocacoes_rascunho} a enviar · Abrir escala`
                  : resumoOp.convocacoes_enviadas > 0
                    ? `${resumoOp.convocacoes_enviadas} enviada(s) · Abrir escala`
                    : "Abrir escala"
            }
            cor={
              resumoOp.convocacoes_sem_resposta > 0
                ? "laranja"
                : resumoOp.convocacoes_rascunho > 0
                  ? "amarelo"
                  : resumoOp.convocacoes_enviadas > 0
                    ? "amarelo"
                    : "cinza"
            }
          />
        </Link>
        <Link
          href={
            resumoOp.clt_sem_plantao > 0 ? hrefEscalaRh({ clt: "sem" }) : hrefEscalaRh()
          }
          className="block"
        >
          <StatCard
            rotulo="CLT sem escala"
            valor={String(resumoOp.clt_sem_plantao)}
            subtexto={
              resumoOp.clt_sem_plantao > 0
                ? "Sem plantão na janela · Abrir escala"
                : "Todos com plantão na janela"
            }
            cor={resumoOp.clt_sem_plantao > 0 ? "amarelo" : "verde"}
          />
        </Link>
        <Link href={hrefPagamentosRh("aguardando")} className="block">
          <StatCard
            rotulo="Aguardando conciliação"
            valor={String(resumoOp.pagamentos_aguardando)}
            subtexto={
              resumoOp.pagamentos_abertos > 0
                ? `${resumoOp.pagamentos_abertos} ainda a pagar`
                : "Pagamentos RH"
            }
            cor={resumoOp.pagamentos_aguardando > 0 ? "laranja" : "verde"}
          />
        </Link>
        <Link
          href={hrefPagamentosRh(
            resumoOp.pagamentos_liberados > 0
              ? "liberado"
              : resumoOp.pagamentos_previstos > 0
                ? "previsto"
                : "abertos"
          )}
          className="block"
        >
          <StatCard
            rotulo="Pagamentos abertos"
            valor={String(resumoOp.pagamentos_abertos)}
            subtexto={
              resumoOp.pagamentos_liberados > 0
                ? `${resumoOp.pagamentos_liberados} a informar · Abrir`
                : resumoOp.pagamentos_previstos > 0
                  ? `${resumoOp.pagamentos_previstos} a liberar · Abrir`
                  : "Previstos + liberados"
            }
            cor={
              resumoOp.pagamentos_liberados > 0
                ? "laranja"
                : resumoOp.pagamentos_abertos > 0
                  ? "amarelo"
                  : "cinza"
            }
          />
        </Link>
        <Link href={hrefConsumosRh("pendentes")} className="block">
          <StatCard
            rotulo="Consumos pendentes"
            valor={String(resumoOp.consumos_pendentes)}
            subtexto="A descontar no pagamento"
            cor={resumoOp.consumos_pendentes > 0 ? "laranja" : "verde"}
          />
        </Link>
        <Link href={hrefNormasRh("pendente")} className="block">
          <StatCard
            rotulo="Normas a revisar"
            valor={String(resumoOp.normas_pendentes)}
            subtexto={
              resumoOp.normas_pendentes > 0
                ? "Confirmar ou ignorar · Abrir"
                : "Nenhuma pendente"
            }
            cor={resumoOp.normas_pendentes > 0 ? "laranja" : "verde"}
          />
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <Campo rotulo="Buscar">
            <input
              className="campo"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, cargo, telefone, login…"
            />
          </Campo>
        </div>
        <div className="w-full sm:w-56">
          <Campo rotulo="Tipo">
            <select
              className="campo"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value as TipoPessoaRH | "todos")}
            >
              <option value="todos">Todos</option>
              {TIPOS_PESSOA_RH.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <div className="w-full sm:w-56">
          <Campo rotulo="Documentos">
            <select
              className="campo"
              value={filtroDocs}
              onChange={(e) => irParaFiltroDocs(e.target.value as FiltroDocsRh)}
            >
              <option value="todos">Todos</option>
              <option value="alerta">Com alerta ({contagemAlertaDocs})</option>
              <option value="vencido">Vencidos ({resumoOp.docs_vencido})</option>
              <option value="a_vencer">A vencer ({resumoOp.docs_a_vencer})</option>
            </select>
          </Campo>
        </div>
      </div>

      {lista.length === 0 ? (
        <Vazio mensagem="Nenhuma pessoa encontrada." />
      ) : (
        <div className="grid gap-3">
          {lista.map((pessoa) => {
            const alertaDocs = alertaDocumentosPessoa(pessoa);
            const resumoAvaliacoes = resumirAvaliacoesPessoa(listarAvaliacoesPessoa(db, pessoa.id));
            return (
            <Link
              key={pessoa.id}
              href={hrefPerfilRh(pessoa.id, {
                aba: abaDestinoHubPessoaRh({
                  temAlertaDocs: alertaDocs.tem_alerta,
                  temAvaliacoes: resumoAvaliacoes.quantidade > 0,
                }),
              })}
              className="block"
            >
              <Card className="transition-colors hover:border-primaria/40 hover:bg-amber-50/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-slate-900">{pessoa.nome}</p>
                    <p className="text-sm text-slate-600">
                      {rotuloFuncao(pessoa)}
                      {pessoa.cargo ? ` · ${pessoa.cargo}` : ""}
                    </p>
                    {pessoa.telefone && <p className="text-sm text-slate-500">{pessoa.telefone}</p>}
                    {alertaDocs.tem_alerta && (
                      <p className="mt-1 text-xs text-amber-800">{alertaDocs.rotulo}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <BadgeTipo tipo={pessoa.tipo} />
                    {resumoAvaliacoes.quantidade > 0 && resumoAvaliacoes.media != null && (
                      <Badge cor={corBadgeMediaAvaliacao(resumoAvaliacoes.media)}>
                        Média {formatarMediaAvaliacao(resumoAvaliacoes.media)}
                      </Badge>
                    )}
                    {alertaDocs.tem_alerta ? (
                      <Badge
                        cor={
                          alertaDocs.vencido > 0
                            ? "laranja"
                            : alertaDocs.a_vencer > 0
                              ? "azul"
                              : "cinza"
                        }
                      >
                        {rotuloCurtoAlertaDocumentos(alertaDocs)}
                      </Badge>
                    ) : (
                      <Badge cor="verde">Docs OK</Badge>
                    )}
                    {pessoa.tem_acesso_sistema ? (
                      <Badge cor="verde">Acesso ao sistema</Badge>
                    ) : (
                      <Badge cor="cinza">Sem login</Badge>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
            );
          })}
        </div>
      )}

      <Modal aberto={form !== null} titulo="Nova pessoa" onFechar={() => setForm(null)} fecharAoClicarFundo={false}>
        {form && (
          <form onSubmit={salvar} className="space-y-3">
            <Campo rotulo="Nome *">
              <input
                className="campo"
                required
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Tipo *">
                <select
                  className="campo"
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoPessoaRH })}
                >
                  {TIPOS_PESSOA_RH.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Função *">
                <select
                  className="campo"
                  value={form.funcao}
                  onChange={(e) => setForm({ ...form, funcao: e.target.value as FuncaoOperacional })}
                >
                  {FUNCOES_OPERACIONAIS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            {form.funcao === "custom" && (
              <Campo rotulo="Função personalizada *">
                <input
                  className="campo"
                  required
                  value={form.funcao_custom}
                  onChange={(e) => setForm({ ...form, funcao_custom: e.target.value })}
                />
              </Campo>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Cargo">
                <input className="campo" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
              </Campo>
              <Campo rotulo="Telefone / WhatsApp (com DDD)">
                <input
                  className="campo"
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: somenteDigitosTelefone(e.target.value) })}
                  placeholder="43999990000"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="tel-national"
                />
              </Campo>
              <Campo rotulo="CPF">
                <input
                  className="campo"
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: somenteDigitosCpf(e.target.value) })}
                  placeholder="00000000000"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                />
                {form.cpf && (
                  <p
                    className={`mt-1 text-xs font-medium ${
                      validarCpf(form.cpf).valido && form.cpf.length === 11 ? "text-emerald-700" : "text-destaque"
                    }`}
                  >
                    {validarCpf(form.cpf).mensagem}
                  </p>
                )}
              </Campo>
              {form.tipo === "colaborador" && (
                <>
                  <Campo rotulo="Salário">
                    <input
                      className="campo"
                      inputMode="decimal"
                      value={form.salario}
                      onChange={(e) => setForm({ ...form, salario: e.target.value })}
                    />
                  </Campo>
                  <Campo rotulo="Adiantamento (valor fixo)">
                    <input
                      className="campo"
                      inputMode="decimal"
                      value={form.adiantamento_valor}
                      onChange={(e) => setForm({ ...form, adiantamento_valor: e.target.value })}
                    />
                  </Campo>
                </>
              )}
              {precisaDadosConvocacao(form.tipo) && (
                <>
                  <Campo rotulo="Valor-hora *">
                    <input
                      className="campo"
                      inputMode="decimal"
                      required
                      value={form.valor_hora}
                      onChange={(e) => setForm({ ...form, valor_hora: e.target.value })}
                      placeholder="12,50"
                    />
                  </Campo>
                  <Campo rotulo="Chave PIX">
                    <input
                      className="campo"
                      value={form.chave_pix}
                      onChange={(e) => setForm({ ...form, chave_pix: e.target.value })}
                      placeholder="CPF, e-mail ou chave aleatória"
                    />
                  </Campo>
                </>
              )}
            </div>
            {precisaDadosConvocacao(form.tipo) && (
              <div className="space-y-2 rounded-card border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs font-medium text-slate-600">
                  Necessários antes da primeira convocação na escala (WhatsApp não substitui o contrato).
                </p>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.contrato_assinado}
                    onChange={(e) => setForm({ ...form, contrato_assinado: e.target.checked })}
                  />
                  <span>Contrato intermitente assinado</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.esocial_ok}
                    onChange={(e) => setForm({ ...form, esocial_ok: e.target.checked })}
                  />
                  <span>eSocial OK</span>
                </label>
              </div>
            )}
            <Campo rotulo="Observação">
              <textarea
                className="campo min-h-20"
                value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              />
            </Campo>

            <label className="flex items-start gap-2 rounded-card border border-slate-200 bg-white px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={form.tem_acesso_sistema}
                onChange={(e) => setForm({ ...form, tem_acesso_sistema: e.target.checked })}
              />
              <span>Criar login para acessar o ComprasChef (credenciais de demonstração)</span>
            </label>

            {form.tem_acesso_sistema && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Login *">
                  <input
                    className="campo"
                    required
                    value={form.login}
                    onChange={(e) => setForm({ ...form, login: e.target.value })}
                  />
                </Campo>
                <Campo rotulo="Senha (demo)">
                  <input
                    className="campo"
                    type="text"
                    value={form.senha}
                    onChange={(e) => setForm({ ...form, senha: e.target.value })}
                  />
                </Campo>
                <Campo rotulo="Papel no sistema">
                  <select
                    className="campo"
                    value={form.papel_sistema}
                    onChange={(e) => setForm({ ...form, papel_sistema: e.target.value as Papel })}
                  >
                    <option value="dono">Dono</option>
                    <option value="gerente">Gerente</option>
                    <option value="lider">Líder</option>
                    <option value="caixa">Caixa</option>
                  </select>
                </Campo>
              </div>
            )}

            {erro && (
              <p className="rounded-card border border-erro bg-erro-clara px-3 py-2 text-sm font-medium text-erro">{erro}</p>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secundario" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario">
                Salvar
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

export default function RhPage() {
  return (
    <Suspense
      fallback={
        <div>
          <TituloPagina titulo="RH — Pessoas" subtitulo="Carregando…" />
          <p className="text-sm text-slate-500">Carregando pessoas…</p>
        </div>
      }
    >
      <RhPessoasConteudo />
    </Suspense>
  );
}
