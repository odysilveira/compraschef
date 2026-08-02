"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileUp, Save, Trash2, Users } from "lucide-react";
import { Badge, Campo, Card, TituloPagina, Vazio } from "@/components/ui";
import { mutate, useDB } from "@/lib/data";
import { validarAdiantamento, TETO_ADIANTAMENTO_PCT } from "@/lib/domain/consumos-pessoas";
import {
  TAMANHO_MAX_CONTRATO_BYTES,
  formatarTamanhoArquivo,
  montarContratoArquivo,
} from "@/lib/domain/contrato-pessoa";
import {
  convocacaoDoSlot,
  janela28Dias,
  montarGradeCalendario,
  pessoaPrecisaConvocacao,
  rotuloStatusConvocacao,
  rotulosCabecalhoSemana,
  slotsDaPessoaNaJanela,
} from "@/lib/domain/escala";
import {
  FUNCOES_OPERACIONAIS,
  MODULOS_ACESSO,
  TIPOS_PESSOA_RH,
  permissoesPorPapel,
  permissoesVazias,
  rotuloFuncao,
  rotuloTipoPessoa,
  somenteDigitosCpf,
  somenteDigitosTelefone,
  validarCpf,
} from "@/lib/domain/rh";
import { podeVerValores, usePapel } from "@/lib/roles";
import { moeda } from "@/lib/format";
import type { FuncaoOperacional, ModuloAcesso, Papel, PessoaRH, TipoPessoaRH } from "@/lib/types";

type AbaPerfil = "dados" | "acesso" | "escala";

export default function RhPerfilPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const db = useDB();
  const { papel } = usePapel();
  const [aba, setAba] = useState<AbaPerfil>("dados");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<PessoaRH | null>(null);
  const [enviandoContrato, setEnviandoContrato] = useState(false);

  const pessoa = useMemo(
    () => (db.pessoas ?? []).find((p) => p.id === params.id) ?? null,
    [db.pessoas, params.id]
  );

  const diasJanela = useMemo(() => janela28Dias(), []);
  const plantaoesPessoa = useMemo(
    () => (pessoa ? slotsDaPessoaNaJanela(db, pessoa.id, diasJanela) : []),
    [db, pessoa, diasJanela]
  );
  const porDiaPessoa = useMemo(() => {
    const map = new Map<string, typeof plantaoesPessoa>();
    for (const dia of diasJanela) map.set(dia, []);
    for (const slot of plantaoesPessoa) {
      const lista = map.get(slot.data);
      if (lista) lista.push(slot);
    }
    return map;
  }, [diasJanela, plantaoesPessoa]);
  const semanasPessoa = useMemo(() => montarGradeCalendario(diasJanela, 1), [diasJanela]);
  const cabecalhoSemana = useMemo(() => rotulosCabecalhoSemana(1), []);
  const hojeISO = diasJanela[0] ?? "";

  useEffect(() => {
    if (pessoa) setForm({ ...pessoa, permissoes: { ...pessoa.permissoes } });
    else setForm(null);
  }, [pessoa]);

  if (!podeVerValores(papel)) {
    return (
      <div className="mx-auto max-w-lg">
        <TituloPagina titulo="Perfil" />
        <Card className="py-10 text-center">
          <Users size={40} className="mx-auto text-slate-400" />
          <p className="mt-3 font-bold">Área restrita</p>
        </Card>
      </div>
    );
  }

  if (!pessoa || !form) {
    return (
      <div>
        <Link href="/rh" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-primaria-escura">
          <ArrowLeft size={16} /> Voltar para pessoas
        </Link>
        <Vazio mensagem="Pessoa não encontrada." />
      </div>
    );
  }

  const editando = form;

  function atualizar<K extends keyof PessoaRH>(campo: K, valor: PessoaRH[K]) {
    setForm((atual) =>
      atual
        ? {
            ...atual,
            [campo]: valor,
            atualizado_em: new Date().toISOString(),
          }
        : atual
    );
    setMensagem(null);
    setErro(null);
  }

  async function aoEscolherContrato(arquivo: File | null) {
    if (!arquivo) return;
    setErro(null);
    setMensagem(null);
    setEnviandoContrato(true);
    try {
      const resultado = await montarContratoArquivo(arquivo);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      setForm((atual) =>
        atual
          ? {
              ...atual,
              contrato_arquivo: resultado.contrato,
              contrato_assinado: true,
              atualizado_em: new Date().toISOString(),
            }
          : atual
      );
      setMensagem("Contrato anexado. Marque eSocial OK se já registrou, e salve os dados.");
    } finally {
      setEnviandoContrato(false);
    }
  }

  function removerContrato() {
    setForm((atual) =>
      atual
        ? {
            ...atual,
            contrato_arquivo: undefined,
            atualizado_em: new Date().toISOString(),
          }
        : atual
    );
    setMensagem("Arquivo removido. Salve os dados para confirmar.");
  }

  function salvarDados(e: FormEvent) {
    e.preventDefault();
    if (!editando.nome.trim()) {
      setErro("Nome é obrigatório.");
      return;
    }
    const checagemCpf = validarCpf(editando.cpf);
    if (editando.cpf?.trim() && !checagemCpf.valido) {
      setErro(checagemCpf.mensagem ?? "CPF inválido.");
      return;
    }
    if (editando.adiantamento_valor != null && editando.adiantamento_valor > 0) {
      const checagemAdiant = validarAdiantamento(editando.salario, editando.adiantamento_valor);
      if (!checagemAdiant.ok) {
        setErro(checagemAdiant.erros.join(" "));
        return;
      }
    }
    mutate((banco) => {
      const i = banco.pessoas.findIndex((p) => p.id === editando.id);
      if (i < 0) return;
      banco.pessoas[i] = {
        ...banco.pessoas[i],
        ...editando,
        nome: editando.nome.trim(),
        cargo: editando.cargo?.trim() || undefined,
        telefone: editando.telefone?.trim() || undefined,
        cpf: editando.cpf?.trim() ? somenteDigitosCpf(editando.cpf) : undefined,
        observacao: editando.observacao?.trim() || undefined,
        chave_pix: editando.chave_pix?.trim() || undefined,
        funcao_custom: editando.funcao === "custom" ? editando.funcao_custom?.trim() || undefined : undefined,
        atualizado_em: new Date().toISOString(),
      };

      if (banco.pessoas[i].perfil_id) {
        const perfil = banco.perfis.find((p) => p.id === banco.pessoas[i].perfil_id);
        if (perfil) {
          perfil.nome = banco.pessoas[i].nome;
          if (banco.pessoas[i].papel_sistema) perfil.papel = banco.pessoas[i].papel_sistema!;
          perfil.ativo = banco.pessoas[i].ativo;
        }
      }
    });
    setMensagem("Dados salvos.");
    setErro(null);
  }

  function salvarAcesso(e: FormEvent) {
    e.preventDefault();
    if (editando.tem_acesso_sistema && !editando.login?.trim()) {
      setErro("Informe o login.");
      return;
    }
    mutate((banco) => {
      const i = banco.pessoas.findIndex((p) => p.id === editando.id);
      if (i < 0) return;
      const atual = banco.pessoas[i];
      let perfilId = atual.perfil_id;

      if (editando.tem_acesso_sistema) {
        if (!perfilId) {
          perfilId = `perfil-${editando.id}`;
          banco.perfis.push({
            id: perfilId,
            nome: editando.nome,
            papel: editando.papel_sistema ?? "lider",
            ativo: true,
          });
        } else {
          const perfil = banco.perfis.find((p) => p.id === perfilId);
          if (perfil) {
            perfil.nome = editando.nome;
            perfil.papel = editando.papel_sistema ?? perfil.papel;
            perfil.ativo = editando.ativo;
          }
        }
      }

      banco.pessoas[i] = {
        ...atual,
        ...editando,
        tem_acesso_sistema: editando.tem_acesso_sistema,
        login: editando.tem_acesso_sistema ? editando.login?.trim().toLowerCase() : undefined,
        senha: editando.tem_acesso_sistema ? editando.senha || "demo123" : undefined,
        papel_sistema: editando.tem_acesso_sistema ? editando.papel_sistema : undefined,
        perfil_id: editando.tem_acesso_sistema ? perfilId : atual.perfil_id,
        permissoes: editando.tem_acesso_sistema ? editando.permissoes : permissoesVazias(),
        atualizado_em: new Date().toISOString(),
      };
    });
    setMensagem("Acesso e permissões salvos.");
    setErro(null);
  }

  function aplicarPapelNasPermissoes(papelEscolhido: Papel) {
    setForm((atual) =>
      atual
        ? {
            ...atual,
            papel_sistema: papelEscolhido,
            permissoes: permissoesPorPapel(papelEscolhido),
            atualizado_em: new Date().toISOString(),
          }
        : atual
    );
  }

  function alternarModulo(modulo: ModuloAcesso) {
    setForm((atual) => {
      if (!atual) return atual;
      return {
        ...atual,
        permissoes: {
          ...atual.permissoes,
          [modulo]: !atual.permissoes[modulo],
        },
        atualizado_em: new Date().toISOString(),
      };
    });
  }

  return (
    <div>
      <Link href="/rh" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-600 hover:text-primaria-escura">
        <ArrowLeft size={16} /> Voltar para pessoas
      </Link>

      <TituloPagina
        titulo={pessoa.nome}
        subtitulo={`${rotuloTipoPessoa(pessoa.tipo)} · ${rotuloFuncao(pessoa)}`}
        acao={
          <div className="flex flex-wrap gap-2">
            <Link href="/rh/escala" className="btn-secundario">
              Ver na escala
            </Link>
            <Badge cor={pessoa.ativo ? "verde" : "cinza"}>{pessoa.ativo ? "Ativo" : "Inativo"}</Badge>
            <Badge cor="azul">{rotuloTipoPessoa(pessoa.tipo)}</Badge>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["dados", "Dados"],
            ["acesso", "Acesso"],
            ["escala", "Escala"],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            className={aba === id ? "btn-primario" : "btn-secundario"}
            onClick={() => setAba(id)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {mensagem && (
        <div className="mb-4 rounded-card border border-sucesso bg-sucesso-clara px-4 py-3 text-sm font-medium text-primaria-escura">
          {mensagem}
        </div>
      )}
      {erro && (
        <div className="mb-4 rounded-card border border-erro bg-erro-clara px-4 py-3 text-sm font-medium text-erro">{erro}</div>
      )}

      {aba === "dados" && (
        <form onSubmit={salvarDados} className="space-y-4">
          <Card className="space-y-3">
            <h2 className="text-base font-bold">Dados pessoais e profissionais</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Nome *">
                <input
                  className="campo"
                  required
                  value={editando.nome}
                  onChange={(e) => atualizar("nome", e.target.value)}
                />
              </Campo>
              <Campo rotulo="Tipo">
                <select
                  className="campo"
                  value={editando.tipo}
                  onChange={(e) => atualizar("tipo", e.target.value as TipoPessoaRH)}
                >
                  {TIPOS_PESSOA_RH.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Função">
                <select
                  className="campo"
                  value={editando.funcao}
                  onChange={(e) => atualizar("funcao", e.target.value as FuncaoOperacional)}
                >
                  {FUNCOES_OPERACIONAIS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
              {editando.funcao === "custom" && (
                <Campo rotulo="Função personalizada">
                  <input
                    className="campo"
                    value={editando.funcao_custom ?? ""}
                    onChange={(e) => atualizar("funcao_custom", e.target.value)}
                  />
                </Campo>
              )}
              <Campo rotulo="Cargo">
                <input
                  className="campo"
                  value={editando.cargo ?? ""}
                  onChange={(e) => atualizar("cargo", e.target.value)}
                />
              </Campo>
              <Campo rotulo="Telefone / WhatsApp (com DDD)">
                <input
                  className="campo"
                  value={editando.telefone ?? ""}
                  onChange={(e) => atualizar("telefone", somenteDigitosTelefone(e.target.value))}
                  placeholder="43999990000"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="tel-national"
                />
              </Campo>
              <Campo rotulo="CPF">
                <input
                  className="campo"
                  value={editando.cpf ?? ""}
                  onChange={(e) => atualizar("cpf", somenteDigitosCpf(e.target.value))}
                  placeholder="00000000000"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                />
                {editando.cpf && (
                  <p
                    className={`mt-1 text-xs font-medium ${
                      validarCpf(editando.cpf).valido && editando.cpf.length === 11
                        ? "text-emerald-700"
                        : "text-destaque"
                    }`}
                  >
                    {validarCpf(editando.cpf).mensagem}
                  </p>
                )}
              </Campo>
              <Campo rotulo="Admissão">
                <input
                  type="date"
                  className="campo"
                  value={editando.data_admissao ?? ""}
                  onChange={(e) => atualizar("data_admissao", e.target.value || undefined)}
                />
              </Campo>
              <Campo rotulo="Salário (mensalista)">
                <input
                  type="number"
                  step="0.01"
                  className="campo"
                  value={editando.salario ?? ""}
                  onChange={(e) => atualizar("salario", e.target.value ? Number(e.target.value) : undefined)}
                />
              </Campo>
              <Campo rotulo="Adiantamento (valor fixo)">
                <input
                  type="number"
                  step="0.01"
                  className="campo"
                  value={editando.adiantamento_valor ?? ""}
                  onChange={(e) =>
                    atualizar("adiantamento_valor", e.target.value ? Number(e.target.value) : undefined)
                  }
                />
                {editando.salario != null && editando.salario > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Teto {TETO_ADIANTAMENTO_PCT}% = {moeda((editando.salario * TETO_ADIANTAMENTO_PCT) / 100)}
                  </p>
                )}
                {editando.adiantamento_valor != null && editando.adiantamento_valor > 0 && (
                  <p
                    className={`mt-1 text-xs font-medium ${
                      validarAdiantamento(editando.salario, editando.adiantamento_valor).ok
                        ? "text-emerald-700"
                        : "text-destaque"
                    }`}
                  >
                    {validarAdiantamento(editando.salario, editando.adiantamento_valor).ok
                      ? "Dentro do limite."
                      : validarAdiantamento(editando.salario, editando.adiantamento_valor).erros.join(" ")}
                  </p>
                )}
              </Campo>
              <Campo rotulo="Valor-hora (intermitente/entregador)">
                <input
                  type="number"
                  step="0.01"
                  className="campo"
                  value={editando.valor_hora ?? ""}
                  onChange={(e) => atualizar("valor_hora", e.target.value ? Number(e.target.value) : undefined)}
                />
              </Campo>
              <Campo rotulo="Chave PIX">
                <input
                  className="campo"
                  value={editando.chave_pix ?? ""}
                  onChange={(e) => atualizar("chave_pix", e.target.value)}
                />
              </Campo>
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(editando.contrato_assinado)}
                    onChange={(e) => atualizar("contrato_assinado", e.target.checked)}
                  />
                  Contrato assinado
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(editando.esocial_ok)}
                    onChange={(e) => atualizar("esocial_ok", e.target.checked)}
                  />
                  eSocial OK
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editando.ativo}
                    onChange={(e) => atualizar("ativo", e.target.checked)}
                  />
                  Ativo
                </label>
              </div>
              {(editando.tipo === "intermitente" || editando.tipo === "entregador") && (
                <p className="text-xs text-slate-600">
                  Para convocar na escala, contrato assinado e eSocial OK são obrigatórios. O WhatsApp só avisa o
                  período — não substitui o contrato escrito.
                </p>
              )}
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 space-y-2">
                <p className="text-sm font-semibold">Cópia do contrato</p>
                <p className="text-xs text-slate-600">
                  PDF ou foto do contrato assinado (máx. {formatarTamanhoArquivo(TAMANHO_MAX_CONTRATO_BYTES)}).
                  Ao anexar, marcamos “Contrato assinado” automaticamente.
                </p>
                {editando.contrato_arquivo ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <a
                      href={editando.contrato_arquivo.data_url}
                      download={editando.contrato_arquivo.nome_arquivo}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primaria-escura underline"
                    >
                      {editando.contrato_arquivo.nome_arquivo}
                    </a>
                    <span className="text-slate-500">
                      ({formatarTamanhoArquivo(editando.contrato_arquivo.tamanho_bytes)})
                    </span>
                    <button type="button" className="btn-secundario text-xs" onClick={removerContrato}>
                      <Trash2 size={14} /> Remover
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-primaria-escura">
                    <FileUp size={16} />
                    {enviandoContrato ? "Lendo arquivo…" : "Anexar PDF ou foto"}
                    <input
                      type="file"
                      className="sr-only"
                      accept=".pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      disabled={enviandoContrato}
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        void aoEscolherContrato(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
            <Campo rotulo="Observação">
              <textarea
                className="campo min-h-24"
                value={editando.observacao ?? ""}
                onChange={(e) => atualizar("observacao", e.target.value)}
              />
            </Campo>
          </Card>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secundario" onClick={() => router.push("/rh")}>
              Cancelar
            </button>
            <button type="submit" className="btn-primario">
              <Save size={16} /> Salvar dados
            </button>
          </div>
        </form>
      )}

      {aba === "acesso" && (
        <form onSubmit={salvarAcesso} className="space-y-4">
          <Card className="space-y-3">
            <h2 className="text-base font-bold">Credenciais</h2>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={editando.tem_acesso_sistema}
                onChange={(e) => {
                  const ligado = e.target.checked;
                  setForm((atual) =>
                    atual
                      ? {
                          ...atual,
                          tem_acesso_sistema: ligado,
                          permissoes: ligado
                            ? atual.permissoes || permissoesPorPapel(atual.papel_sistema ?? "lider")
                            : permissoesVazias(),
                          papel_sistema: ligado ? atual.papel_sistema ?? "lider" : undefined,
                          atualizado_em: new Date().toISOString(),
                        }
                      : atual
                  );
                }}
              />
              Tem acesso ao sistema (login/senha de demonstração)
            </label>
            {editando.tem_acesso_sistema && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo="Login *">
                  <input
                    className="campo"
                    required
                    value={editando.login ?? ""}
                    onChange={(e) => atualizar("login", e.target.value)}
                  />
                </Campo>
                <Campo rotulo="Senha (demo)">
                  <input
                    className="campo"
                    value={editando.senha ?? ""}
                    onChange={(e) => atualizar("senha", e.target.value)}
                  />
                </Campo>
                <Campo rotulo="Papel no seletor atual">
                  <select
                    className="campo"
                    value={editando.papel_sistema ?? "lider"}
                    onChange={(e) => aplicarPapelNasPermissoes(e.target.value as Papel)}
                  >
                    <option value="dono">Dono</option>
                    <option value="gerente">Gerente</option>
                    <option value="lider">Líder</option>
                    <option value="caixa">Caixa</option>
                  </select>
                </Campo>
              </div>
            )}
          </Card>

          {editando.tem_acesso_sistema && (
            <Card className="space-y-3">
              <div>
                <h2 className="text-base font-bold">Módulos de acesso</h2>
                <p className="text-sm text-slate-600">
                  Clique para autorizar ou negar. Na fase 1 isso fica registrado no perfil; o menu ainda segue o seletor
                  de papel do rodapé.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {MODULOS_ACESSO.map((modulo) => {
                  const ligado = editando.permissoes[modulo.id];
                  return (
                    <button
                      key={modulo.id}
                      type="button"
                      onClick={() => alternarModulo(modulo.id)}
                      className={`flex items-center justify-between rounded-card border px-3 py-2 text-left text-sm ${
                        ligado
                          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      <span className="font-medium">{modulo.rotulo}</span>
                      <span className="text-xs font-bold uppercase">{ligado ? "autorizado" : "negado"}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          <div className="flex justify-end gap-2">
            <button type="submit" className="btn-primario">
              <Save size={16} /> Salvar acesso
            </button>
          </div>
        </form>
      )}

      {aba === "escala" && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-bold">Próximos 28 dias</h2>
              <p className="text-sm text-slate-600">
                {plantaoesPessoa.length === 0
                  ? "Nenhum plantão lançado ainda."
                  : `${plantaoesPessoa.length} plantão(ões) nesta janela.`}
              </p>
            </div>
            <Link href="/rh/escala" className="btn-secundario text-sm">
              Ver calendário da equipe
            </Link>
          </div>

          {pessoaPrecisaConvocacao(pessoa.tipo) && (
            <p className="text-xs text-slate-600">
              Intermitente/entregador: a convocação por WhatsApp aparece em cada dia com plantão (quando houver).
            </p>
          )}

          <div className="overflow-x-auto">
            <div className="min-w-[520px]">
              <div className="mb-1 grid grid-cols-7 gap-1">
                {cabecalhoSemana.map((rotulo) => (
                  <div key={rotulo} className="px-1 py-1 text-center text-xs font-semibold uppercase text-slate-500">
                    {rotulo}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                {semanasPessoa.map((semana, idx) => (
                  <div key={idx} className="grid grid-cols-7 gap-1">
                    {semana.map((dia, col) => {
                      if (!dia) {
                        return <div key={`vazio-${idx}-${col}`} className="min-h-[4.5rem] rounded-lg bg-stone-50/80" />;
                      }
                      const lista = porDiaPessoa.get(dia) ?? [];
                      const ehHoje = dia === hojeISO;
                      return (
                        <div
                          key={dia}
                          className={`min-h-[4.5rem] rounded-lg border p-1.5 ${
                            ehHoje
                              ? "border-primaria bg-primaria/5"
                              : lista.length > 0
                                ? "border-emerald-200 bg-emerald-50/60"
                                : "border-dashed border-stone-200 bg-stone-50"
                          }`}
                        >
                          <p className={`text-sm font-bold ${ehHoje ? "text-primaria-escura" : "text-slate-900"}`}>
                            {dia.slice(8, 10)}
                          </p>
                          {lista.length === 0 ? (
                            <p className="text-[10px] text-slate-400">Livre</p>
                          ) : (
                            lista.map((slot) => {
                              const conv = convocacaoDoSlot(db, slot.id);
                              return (
                                <div key={slot.id} className="mt-0.5">
                                  <p className="text-[11px] font-medium text-slate-800">
                                    {slot.hora_inicio}–{slot.hora_fim}
                                  </p>
                                  {conv && (
                                    <p className="text-[10px] text-slate-500">{rotuloStatusConvocacao(conv.status)}</p>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            No calendário da equipe (RH → Escala) você vê os nomes de todo mundo em cada dia. Avaliações e
            histórico entram depois neste perfil.
          </p>
        </Card>
      )}
    </div>
  );
}
