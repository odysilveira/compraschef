"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Copy, Download, FileUp, Save, Trash2, Users } from "lucide-react";
import { Badge, Campo, Card, Modal, TituloPagina, Vazio } from "@/components/ui";
import { mutate, uid, useDB } from "@/lib/data";
import { SeletorContaOrigem } from "@/components/financeiro/SeletorContaOrigem";
import { contaPadraoOrigem } from "@/lib/domain/contas-pagamento";
import {
  adicionarAnotacaoPessoa,
  listarAnotacoesPessoa,
} from "@/lib/domain/anotacoes-pessoa";
import {
  validarAdiantamento,
  TETO_ADIANTAMENTO_PCT,
  rotuloStatusConsumo,
} from "@/lib/domain/consumos-pessoas";
import {
  TAMANHO_MAX_CONTRATO_BYTES,
  formatarTamanhoArquivo,
  montarContratoArquivo,
} from "@/lib/domain/contrato-pessoa";
import {
  alertaDocumentosPessoa,
  atualizarDocumentoNaLista,
  exportarDocumentosPessoasCsv,
  garantirChecklistDocumentos,
  hojeIsoLocal,
  resumirDocumentos,
  rotuloCurtoAlertaDocumentos,
  rotuloStatusDocumento,
  sincronizarFlagsDocumentos,
  statusDocumento,
  diasRestantesValidade,
  formatarDiasRestantesDocumento,
} from "@/lib/domain/documentos-pessoa";
import {
  convocacaoDoSlot,
  janelaCalendarioEscala,
  montarGradeCalendario,
  nomeMesAno,
  pessoaPrecisaConvocacao,
  rotuloPeriodoJanela,
  rotuloStatusConvocacao,
  rotulosCabecalhoSemana,
  slotsDaPessoaNaJanela,
} from "@/lib/domain/escala";
import {
  conciliarPagamentoPessoa,
  informarPagamentoPessoa,
  liberarPagamentoPessoa,
  rotuloStatusPagamentoPessoa,
  rotuloTipoPagamentoPessoa,
} from "@/lib/domain/pagamentos-pessoas";
import {
  chavePixDaPessoa,
  linkWhatsAppReciboPagamento,
  montarTextoConfirmacaoRecebimento,
  montarTextoReciboPagamentoPessoa,
} from "@/lib/domain/recibo-pagamento-pessoa";
import { filaAgendaFinanceiroDeStatusPagamento, hrefFinanceiro } from "@/lib/domain/financeiro";
import { hrefConsumosRh, hrefEscalaRh, filtroConsumosRhDeStatus, filtroPagamentosRhDeStatus, hrefPagamentosRh, hrefPontoRh } from "@/lib/domain/resumo-rh";
import {
  FUNCOES_OPERACIONAIS,
  MODULOS_ACESSO,
  TIPOS_PESSOA_RH,
  parseAbaPerfilRh,
  permissoesPorPapel,
  permissoesVazias,
  rotuloFuncao,
  rotuloTipoPessoa,
  somenteDigitosCpf,
  somenteDigitosTelefone,
  validarCpf,
  type AbaPerfilRh,
} from "@/lib/domain/rh";
import { usePodeAcessarModulo } from "@/lib/roles";
import { dataBR, moeda } from "@/lib/format";
import type {
  DocumentoPessoa,
  FuncaoOperacional,
  ModuloAcesso,
  PagamentoPessoa,
  Papel,
  PessoaRH,
  TipoPessoaRH,
} from "@/lib/types";

function RhPerfilConteudo() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const db = useDB();
  const podeRh = usePodeAcessarModulo("rh");
  const [aba, setAba] = useState<AbaPerfilRh>(() => parseAbaPerfilRh(searchParams.get("aba")));
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<PessoaRH | null>(null);
  const [enviandoContrato, setEnviandoContrato] = useState(false);
  const [enviandoDocId, setEnviandoDocId] = useState<string | null>(null);
  const [informarId, setInformarId] = useState<string | null>(null);
  const [formInformar, setFormInformar] = useState({
    dataPagamento: hojeIsoLocal(),
    valorPago: "",
    bancoConta: "",
    responsavel: "usuário local",
  });
  const [erroInformar, setErroInformar] = useState<string | null>(null);
  const [conciliarId, setConciliarId] = useState<string | null>(null);
  const [dataLiquidacao, setDataLiquidacao] = useState(hojeIsoLocal());
  const [erroConciliar, setErroConciliar] = useState<string | null>(null);
  const [textoAnotacao, setTextoAnotacao] = useState("");
  const [dataAnotacao, setDataAnotacao] = useState(hojeIsoLocal());
  const [erroAnotacao, setErroAnotacao] = useState<string | null>(null);

  const pessoa = useMemo(
    () => (db.pessoas ?? []).find((p) => p.id === params.id) ?? null,
    [db.pessoas, params.id]
  );

  const diasJanela = useMemo(() => janelaCalendarioEscala(), []);
  const periodoRotulo = useMemo(() => rotuloPeriodoJanela(diasJanela), [diasJanela]);
  const plantaoesPessoa = useMemo(
    () => (pessoa ? slotsDaPessoaNaJanela(db, pessoa.id, diasJanela) : []),
    [db, pessoa, diasJanela]
  );
  const pagamentosPessoa = useMemo(() => {
    if (!pessoa) return [];
    return [...(db.pagamentos_pessoas ?? [])]
      .filter((p) => p.pessoa_id === pessoa.id)
      .sort((a, b) => b.vencimento.localeCompare(a.vencimento));
  }, [db.pagamentos_pessoas, pessoa]);
  const consumosPessoa = useMemo(() => {
    if (!pessoa) return [];
    return [...(db.consumos_pessoas ?? [])]
      .filter((c) => c.pessoa_id === pessoa.id)
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [db.consumos_pessoas, pessoa]);
  const anotacoesPessoa = useMemo(
    () => (pessoa ? listarAnotacoesPessoa(db, pessoa.id) : []),
    [db, pessoa]
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
  const alertaDocs = useMemo(
    () => (pessoa ? alertaDocumentosPessoa(pessoa) : null),
    [pessoa]
  );

  useEffect(() => {
    if (pessoa) {
      const docs = garantirChecklistDocumentos(pessoa);
      setForm({
        ...pessoa,
        permissoes: { ...pessoa.permissoes },
        documentos: docs,
      });
    } else setForm(null);
  }, [pessoa]);

  useEffect(() => {
    setAba(parseAbaPerfilRh(searchParams.get("aba")));
  }, [searchParams]);

  function irParaAba(proxima: AbaPerfilRh) {
    setAba(proxima);
    const base = `/rh/${params.id}`;
    router.replace(proxima === "dados" ? base : `${base}?aba=${proxima}`, { scroll: false });
  }

  if (!podeRh) {
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

  function patchDocumento(
    documentoId: string,
    patch: Partial<Pick<DocumentoPessoa, "presente" | "validade" | "arquivo" | "rotulo">>
  ) {
    setForm((atual) => {
      if (!atual) return atual;
      const documentos = atualizarDocumentoNaLista(
        garantirChecklistDocumentos(atual),
        documentoId,
        patch
      );
      const flags = sincronizarFlagsDocumentos({ ...atual, documentos });
      return {
        ...atual,
        documentos,
        ...flags,
        atualizado_em: new Date().toISOString(),
      };
    });
    setMensagem(null);
    setErro(null);
  }

  async function aoEscolherArquivoDocumento(documentoId: string, arquivo: File | null) {
    if (!arquivo) return;
    setErro(null);
    setMensagem(null);
    setEnviandoDocId(documentoId);
    try {
      const resultado = await montarContratoArquivo(arquivo);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      patchDocumento(documentoId, { presente: true, arquivo: resultado.contrato });
      setMensagem("Arquivo anexado. Salve os documentos para confirmar.");
    } finally {
      setEnviandoDocId(null);
    }
  }

  function salvarDocumentos(e: FormEvent) {
    e.preventDefault();
    const docs = garantirChecklistDocumentos(editando);
    const flags = sincronizarFlagsDocumentos({ ...editando, documentos: docs });
    mutate((banco) => {
      const i = banco.pessoas.findIndex((p) => p.id === editando.id);
      if (i < 0) return;
      banco.pessoas[i] = {
        ...banco.pessoas[i],
        documentos: docs,
        ...flags,
        atualizado_em: new Date().toISOString(),
      };
    });
    setMensagem("Documentos salvos.");
    setErro(null);
  }

  function baixarDocumentosCsv() {
    if (!editando) return;
    const csv = exportarDocumentosPessoasCsv([editando]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug =
      editando.nome
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || editando.id;
    a.href = url;
    a.download = `rh-documentos-${slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMensagem("CSV baixado (checklist desta pessoa).");
    setErro(null);
  }

  async function copiarChavePixPerfil() {
    const chave = chavePixDaPessoa(pessoa ?? undefined);
    if (!chave) {
      setErro("Esta pessoa não tem chave PIX cadastrada.");
      setMensagem(null);
      return;
    }
    try {
      await navigator.clipboard.writeText(chave);
      setErro(null);
      setMensagem(`PIX de ${pessoa?.nome ?? "pessoa"} copiado.`);
    } catch {
      setErro("Não foi possível copiar a chave PIX neste navegador.");
    }
  }

  async function copiarReciboPerfil(
    pagamento: PagamentoPessoa,
    variante: "recibo" | "confirmacao"
  ) {
    if (!pessoa) return;
    const texto =
      variante === "confirmacao"
        ? montarTextoConfirmacaoRecebimento({ pessoa, pagamento })
        : montarTextoReciboPagamentoPessoa({
            pessoa,
            pagamento,
            consumos: db.consumos_pessoas ?? [],
          });
    try {
      await navigator.clipboard.writeText(texto);
      setErro(null);
      setMensagem(
        variante === "confirmacao"
          ? "Confirmação copiada — envie para responder no WhatsApp."
          : "Recibo discriminado copiado — pode colar no WhatsApp ou arquivar."
      );
    } catch {
      setErro("Não foi possível copiar neste navegador.");
    }
  }

  function abrirWhatsAppReciboPerfil(
    pagamento: PagamentoPessoa,
    variante: "recibo" | "confirmacao"
  ) {
    if (!pessoa) return;
    const texto =
      variante === "confirmacao"
        ? montarTextoConfirmacaoRecebimento({ pessoa, pagamento })
        : montarTextoReciboPagamentoPessoa({
            pessoa,
            pagamento,
            consumos: db.consumos_pessoas ?? [],
          });
    const url = linkWhatsAppReciboPagamento(pessoa.telefone, texto);
    if (!url) {
      setErro("Cadastre o telefone desta pessoa nos dados para abrir o WhatsApp.");
      setMensagem(null);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    setErro(null);
    setMensagem(
      variante === "confirmacao"
        ? "WhatsApp aberto com a confirmação."
        : "WhatsApp aberto com o recibo."
    );
  }

  function abrirInformarPerfil(pagamento: PagamentoPessoa) {
    setInformarId(pagamento.id);
    setFormInformar({
      dataPagamento: hojeIsoLocal(),
      valorPago: pagamento.valor.toFixed(2),
      bancoConta: contaPadraoOrigem(db),
      responsavel: "usuário local",
    });
    setErroInformar(null);
  }

  function confirmarInformarPerfil(e: FormEvent) {
    e.preventDefault();
    if (!informarId) return;
    const valorPago = Number(formInformar.valorPago.replace(",", "."));
    const proximo = structuredClone(db);
    const resultado = informarPagamentoPessoa(proximo, informarId, {
      dataPagamento: formInformar.dataPagamento,
      valorPago,
      bancoConta: formInformar.bancoConta,
      responsavel: formInformar.responsavel,
    });
    if (!resultado.sucesso) {
      setErroInformar(resultado.erros.join(" "));
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setInformarId(null);
    setErro(null);
    setMensagem("Pagamento informado. Aguardando conciliação bancária.");
  }

  function abrirConciliarPerfil(pagamento: PagamentoPessoa) {
    setConciliarId(pagamento.id);
    setDataLiquidacao(pagamento.pagamento_data || hojeIsoLocal());
    setErroConciliar(null);
  }

  function confirmarConciliarPerfil(e: FormEvent) {
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
    setErro(null);
    setMensagem("Pagamento conciliado e marcado como pago.");
  }

  function salvarAnotacao(e: FormEvent) {
    e.preventDefault();
    if (!pessoa) return;
    const proximo = structuredClone(db);
    const r = adicionarAnotacaoPessoa(proximo, {
      id: uid("anot"),
      pessoa_id: pessoa.id,
      texto: textoAnotacao,
      data: dataAnotacao,
      autor: "usuário local",
    });
    if (!r.sucesso) {
      setErroAnotacao(r.erros.join(" "));
      setMensagem(null);
      return;
    }
    mutate((atual) => Object.assign(atual, proximo));
    setTextoAnotacao("");
    setDataAnotacao(hojeIsoLocal());
    setErroAnotacao(null);
    setErro(null);
    setMensagem("Anotação salva no histórico.");
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
      const docs = garantirChecklistDocumentos(editando);
      const docsAlinhados = docs.map((d) => {
        if (d.tipo === "contrato") {
          return {
            ...d,
            presente: Boolean(editando.contrato_assinado),
            arquivo: editando.contrato_arquivo ?? d.arquivo,
          };
        }
        if (d.tipo === "esocial") {
          return { ...d, presente: Boolean(editando.esocial_ok) };
        }
        return d;
      });
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
        documentos: docsAlinhados,
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
          <div className="flex flex-wrap items-center gap-2">
            <Link href={hrefEscalaRh({ pessoa: pessoa.id })} className="btn-secundario">
              Ver na escala
            </Link>
            <Link
              href={hrefPontoRh({ aba: "espelho", pessoa: pessoa.id })}
              className="btn-secundario"
            >
              Ver ponto
            </Link>
            <Badge cor={pessoa.ativo ? "verde" : "cinza"}>{pessoa.ativo ? "Ativo" : "Inativo"}</Badge>
            <Badge cor="azul">{rotuloTipoPessoa(pessoa.tipo)}</Badge>
            {alertaDocs && (
              <button
                type="button"
                className="inline-flex"
                title={alertaDocs.rotulo}
                onClick={() => irParaAba("documentos")}
              >
                <Badge
                  cor={
                    !alertaDocs.tem_alerta
                      ? "verde"
                      : alertaDocs.vencido > 0
                        ? "laranja"
                        : alertaDocs.a_vencer > 0
                          ? "azul"
                          : "cinza"
                  }
                >
                  {rotuloCurtoAlertaDocumentos(alertaDocs)}
                </Badge>
              </button>
            )}
          </div>
        }
      />
      {alertaDocs?.tem_alerta && (
        <p className="mb-4 text-sm text-amber-800">
          {alertaDocs.rotulo}.{" "}
          <button
            type="button"
            className="underline font-medium text-primaria-escura"
            onClick={() => irParaAba("documentos")}
          >
            Abrir documentos
          </button>
        </p>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ["dados", "Dados"],
            ["documentos", "Documentos"],
            ["acesso", "Acesso"],
            ["escala", "Escala"],
            ["pagamentos", "Pagamentos"],
            ["consumos", "Consumos"],
            ["anotacoes", "Anotações"],
          ] as const satisfies ReadonlyArray<readonly [AbaPerfilRh, string]>
        ).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            className={aba === id ? "btn-primario" : "btn-secundario"}
            onClick={() => irParaAba(id)}
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

      {aba === "documentos" &&
        (() => {
          const docs = garantirChecklistDocumentos(editando);
          const hoje = hojeIsoLocal();
          const resumo = resumirDocumentos(docs, hoje);
          return (
            <form onSubmit={salvarDocumentos} className="space-y-4">
              <Card className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-bold">Checklist de documentos</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge cor="verde">Presente ({resumo.presente})</Badge>
                      <Badge cor="cinza">Ausente ({resumo.ausente})</Badge>
                      <Badge cor="azul">A vencer ({resumo.a_vencer})</Badge>
                      <Badge cor="laranja">Vencido ({resumo.vencido})</Badge>
                    </div>
                    <button
                      type="button"
                      className="btn-secundario text-sm"
                      onClick={baixarDocumentosCsv}
                      title="Exportar checklist desta pessoa (CSV)"
                    >
                      <Download size={14} /> Exportar CSV
                    </button>
                  </div>
                </div>
                <p className="text-sm text-slate-600">
                  Marque o que já tem em mão. Contrato e eSocial alimentam a convocação na escala.
                  Validade (ASO/CNH): avisa a vencer nos próximos 30 dias e marca vencido quando a data passa.
                </p>
                <ul className="space-y-3">
                  {docs.map((doc) => {
                    const status = statusDocumento(doc, hoje);
                    const dias = diasRestantesValidade(doc.validade, hoje);
                    const detalheDias =
                      status === "a_vencer" || status === "vencido"
                        ? formatarDiasRestantesDocumento(dias)
                        : "";
                    const corBadge =
                      status === "presente"
                        ? "verde"
                        : status === "vencido"
                          ? "laranja"
                          : status === "a_vencer"
                            ? "azul"
                            : "cinza";
                    return (
                      <li
                        key={doc.id}
                        className="rounded-lg border border-stone-200 bg-stone-50 p-3 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-900">{doc.rotulo}</span>
                            <Badge cor={corBadge}>{rotuloStatusDocumento(status)}</Badge>
                            {detalheDias && (
                              <span className="text-xs text-slate-600">{detalheDias}</span>
                            )}
                          </div>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={doc.presente}
                              onChange={(e) =>
                                patchDocumento(doc.id, { presente: e.target.checked })
                              }
                            />
                            Em mãos
                          </label>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Campo rotulo="Validade (opcional)">
                            <input
                              type="date"
                              className="campo"
                              value={doc.validade ?? ""}
                              onChange={(e) =>
                                patchDocumento(doc.id, { validade: e.target.value || undefined })
                              }
                            />
                          </Campo>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-slate-600">Anexo (opcional)</p>
                            {doc.arquivo ? (
                              <div className="flex flex-wrap items-center gap-2 text-sm">
                                <a
                                  href={doc.arquivo.data_url}
                                  download={doc.arquivo.nome_arquivo}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primaria-escura underline"
                                >
                                  {doc.arquivo.nome_arquivo}
                                </a>
                                <button
                                  type="button"
                                  className="btn-secundario text-xs"
                                  onClick={() =>
                                    patchDocumento(doc.id, { arquivo: undefined })
                                  }
                                >
                                  <Trash2 size={14} /> Remover
                                </button>
                              </div>
                            ) : (
                              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-primaria-escura">
                                <FileUp size={16} />
                                {enviandoDocId === doc.id
                                  ? "Lendo…"
                                  : `Anexar (máx. ${formatarTamanhoArquivo(TAMANHO_MAX_CONTRATO_BYTES)})`}
                                <input
                                  type="file"
                                  className="sr-only"
                                  accept=".pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                                  disabled={enviandoDocId === doc.id}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0] ?? null;
                                    void aoEscolherArquivoDocumento(doc.id, f);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secundario" onClick={() => router.push("/rh")}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primario">
                  <Save size={16} /> Salvar documentos
                </button>
              </div>
            </form>
          );
        })()}

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
                  Clique para autorizar ou negar. Esses toggles controlam o menu lateral quando essa pessoa está
                  ligada ao papel escolhido no rodapé (demo).
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
              <h2 className="text-base font-bold">Escala no calendário</h2>
              <p className="text-sm text-slate-600">
                {periodoRotulo}
                {plantaoesPessoa.length === 0
                  ? " — nenhum plantão lançado ainda."
                  : ` — ${plantaoesPessoa.length} plantão(ões).`}
              </p>
            </div>
            <Link href={hrefEscalaRh({ pessoa: pessoa.id })} className="btn-secundario text-sm">
              Ver calendário da equipe
            </Link>
            {pessoa.tipo === "colaborador" && (
              <Link
                href={hrefPontoRh({ aba: "espelho", pessoa: pessoa.id })}
                className="btn-secundario text-sm"
              >
                Abrir espelho de ponto
              </Link>
            )}
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
                {semanasPessoa.map((semana, idx) => {
                  const primeiroDiaMes = semana.find((d) => d && d.slice(8, 10) === "01") ?? null;
                  const rotuloMes =
                    idx === 0 || primeiroDiaMes
                      ? primeiroDiaMes ?? (idx === 0 ? semana.find(Boolean) : null)
                      : null;
                  return (
                    <div key={idx}>
                      {rotuloMes && (
                        <p className="px-1 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                          {nomeMesAno(rotuloMes)}
                        </p>
                      )}
                      <div className="grid grid-cols-7 gap-1">
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
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            No calendário da equipe (RH → Escala) você vê os nomes de todo mundo em cada dia.{" "}
            <button
              type="button"
              className="font-medium text-primaria-escura underline"
              onClick={() => irParaAba("anotacoes")}
            >
              Anotações
            </button>{" "}
            registram o histórico livre; avaliações formais entram depois.
          </p>
        </Card>
      )}

      {aba === "pagamentos" && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold">Pagamentos desta pessoa</h2>
            <Link
              href={hrefPagamentosRh({ pessoa: pessoa.id })}
              className="btn-secundario text-sm"
            >
              Abrir pagamentos
            </Link>
          </div>
          {pagamentosPessoa.length === 0 ? (
            <Vazio mensagem="Nenhum pagamento lançado para esta pessoa." />
          ) : (
            <div className="space-y-2">
              {pagamentosPessoa.map((pagamento) => {
                const filaFinanceiro = filaAgendaFinanceiroDeStatusPagamento(pagamento.status);
                return (
                <div
                  key={pagamento.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {rotuloTipoPagamentoPessoa(pagamento.tipo)}
                        {pagamento.descricao ? ` · ${pagamento.descricao}` : ""}
                      </p>
                      <p className="text-lg font-bold">{moeda(pagamento.pagamento_valor ?? pagamento.valor)}</p>
                      <p className="text-xs text-slate-500">
                        Venc. {dataBR(pagamento.vencimento)}
                        {pagamento.competencia ? ` · ${pagamento.competencia}` : ""}
                      </p>
                      <Link
                        href={hrefPagamentosRh({
                          filtro: filtroPagamentosRhDeStatus(pagamento.status),
                          pessoa: pessoa.id,
                          competencia: pagamento.competencia || undefined,
                          tipo: pagamento.tipo,
                        })}
                        className="mt-1 inline-block text-sm text-primaria-escura underline"
                      >
                        Ver na lista
                      </Link>
                      {filaFinanceiro && (
                        <Link
                          href={hrefFinanceiro({ aba: "boletos", fila: filaFinanceiro })}
                          className="mt-1 ml-3 inline-block text-sm text-primaria-escura underline"
                          title="Abre a agenda do Financeiro na fila deste pagamento"
                        >
                          Ver no Financeiro
                        </Link>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {pagamento.status === "previsto" && (
                        <button
                          type="button"
                          className="btn-secundario text-sm"
                          onClick={() => {
                            const proximo = structuredClone(db);
                            const r = liberarPagamentoPessoa(proximo, pagamento.id);
                            if (!r.sucesso) {
                              setErro(r.erros.join(" "));
                              setMensagem(null);
                              return;
                            }
                            mutate((atual) => Object.assign(atual, proximo));
                            setErro(null);
                            setMensagem("Pagamento liberado.");
                          }}
                        >
                          Liberar
                        </button>
                      )}
                      {(pagamento.status === "previsto" || pagamento.status === "liberado") &&
                        chavePixDaPessoa(pessoa) && (
                          <button
                            type="button"
                            className="btn-secundario text-sm"
                            onClick={() => void copiarChavePixPerfil()}
                            title="Copia a chave PIX cadastrada no perfil"
                          >
                            <Copy size={14} /> Copiar PIX
                          </button>
                        )}
                      {pagamento.status === "liberado" && (
                        <button
                          type="button"
                          className="btn-primario text-sm"
                          onClick={() => abrirInformarPerfil(pagamento)}
                          title="Informa o pagamento sem sair do perfil"
                        >
                          Informar pagamento
                        </button>
                      )}
                      {pagamento.status === "aguardando_conciliacao" && (
                        <button
                          type="button"
                          className="btn-primario text-sm"
                          onClick={() => abrirConciliarPerfil(pagamento)}
                          title="Concilia o pagamento sem sair do perfil"
                        >
                          Conciliar
                        </button>
                      )}
                      {(pagamento.status === "aguardando_conciliacao" ||
                        pagamento.status === "pago") && (
                        <>
                          <button
                            type="button"
                            className="btn-secundario text-sm"
                            onClick={() => void copiarReciboPerfil(pagamento, "recibo")}
                          >
                            <Copy size={14} /> Copiar recibo
                          </button>
                          <button
                            type="button"
                            className="btn-secundario text-sm"
                            onClick={() => abrirWhatsAppReciboPerfil(pagamento, "recibo")}
                            title="Abre o WhatsApp com o recibo"
                          >
                            WhatsApp recibo
                          </button>
                          <button
                            type="button"
                            className="btn-secundario text-sm"
                            onClick={() => void copiarReciboPerfil(pagamento, "confirmacao")}
                          >
                            <Copy size={14} /> Confirmação
                          </button>
                          <button
                            type="button"
                            className="btn-secundario text-sm"
                            onClick={() => abrirWhatsAppReciboPerfil(pagamento, "confirmacao")}
                            title="Abre o WhatsApp com a confirmação"
                          >
                            WhatsApp confirmação
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge
                    cor={
                      pagamento.status === "pago"
                        ? "verde"
                        : pagamento.status === "aguardando_conciliacao"
                          ? "azul"
                          : "laranja"
                    }
                  >
                    {rotuloStatusPagamentoPessoa(pagamento.status)}
                  </Badge>
                </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <Modal
        aberto={Boolean(informarId)}
        titulo="Informar pagamento"
        onFechar={() => setInformarId(null)}
        fecharAoClicarFundo={false}
      >
        {informarId &&
          (() => {
            const pagamentoInformar = pagamentosPessoa.find((p) => p.id === informarId);
            if (!pagamentoInformar) return null;
            return (
              <form onSubmit={confirmarInformarPerfil} className="space-y-3">
                <div className="rounded-card border border-destaque bg-destaque-clara px-3 py-3 text-sm text-destaque">
                  Informar pagamento não dá baixa final. O título fica em aguardando conciliação.
                </div>
                <p className="text-sm text-slate-700">
                  {rotuloTipoPagamentoPessoa(pagamentoInformar.tipo)} · {moeda(pagamentoInformar.valor)}
                </p>
                {chavePixDaPessoa(pessoa) && (
                  <div className="flex flex-wrap items-center gap-2 rounded-card border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <p className="min-w-0 flex-1">
                      Destino (PIX):{" "}
                      <span className="font-medium text-slate-700">{chavePixDaPessoa(pessoa)}</span>
                    </p>
                    <button
                      type="button"
                      className="btn-secundario shrink-0"
                      onClick={() => void copiarChavePixPerfil()}
                    >
                      <Copy size={14} /> Copiar PIX
                    </button>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo rotulo="Data *">
                    <input
                      type="date"
                      className="campo"
                      required
                      value={formInformar.dataPagamento}
                      onChange={(e) =>
                        setFormInformar({ ...formInformar, dataPagamento: e.target.value })
                      }
                    />
                  </Campo>
                  <Campo rotulo="Valor pago *">
                    <input
                      className="campo"
                      required
                      value={formInformar.valorPago}
                      onChange={(e) =>
                        setFormInformar({ ...formInformar, valorPago: e.target.value })
                      }
                    />
                  </Campo>
                  <div className="sm:col-span-2 space-y-2">
                    <Campo rotulo="De qual banco/conta saiu o pagamento? *">
                      <SeletorContaOrigem
                        db={db}
                        valor={formInformar.bancoConta}
                        onChange={(bancoConta) => setFormInformar({ ...formInformar, bancoConta })}
                        listId="contas-origem-rh-perfil"
                      />
                    </Campo>
                    <p className="text-xs text-slate-500">
                      Facilita achar o débito no extrato na hora de conciliar.
                    </p>
                  </div>
                  <Campo rotulo="Responsável">
                    <input
                      className="campo"
                      value={formInformar.responsavel}
                      onChange={(e) =>
                        setFormInformar({ ...formInformar, responsavel: e.target.value })
                      }
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
            );
          })()}
      </Modal>

      <Modal
        aberto={Boolean(conciliarId)}
        titulo="Conciliar pagamento"
        onFechar={() => setConciliarId(null)}
      >
        {conciliarId &&
          (() => {
            const pagamentoConciliar = pagamentosPessoa.find((p) => p.id === conciliarId);
            if (!pagamentoConciliar) return null;
            return (
              <form onSubmit={confirmarConciliarPerfil} className="space-y-3">
                <p className="text-sm text-slate-700">
                  {rotuloTipoPagamentoPessoa(pagamentoConciliar.tipo)} ·{" "}
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
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() => setConciliarId(null)}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="btn-primario">
                    Conciliar
                  </button>
                </div>
              </form>
            );
          })()}
      </Modal>

      {aba === "consumos" && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold">Consumos no restaurante</h2>
            <Link
              href={hrefConsumosRh({ pessoa: pessoa.id })}
              className="btn-secundario text-sm"
            >
              Lançar consumo
            </Link>
          </div>
          {consumosPessoa.length === 0 ? (
            <Vazio mensagem="Nenhum consumo lançado para esta pessoa." />
          ) : (
            <div className="space-y-2">
              {consumosPessoa.map((consumo) => (
                <div
                  key={consumo.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{consumo.descricao}</p>
                    <p className="text-sm text-slate-600">
                      {dataBR(consumo.data)} · qtd {consumo.quantidade} · líquido{" "}
                      {moeda(consumo.valor_liquido)}
                    </p>
                    <Link
                      href={hrefConsumosRh({
                        filtro: filtroConsumosRhDeStatus(consumo.status),
                        pessoa: pessoa.id,
                      })}
                      className="mt-1 inline-block text-sm text-primaria-escura underline"
                    >
                      Ver na lista
                    </Link>
                  </div>
                  <Badge cor={consumo.status === "pendente" ? "laranja" : "verde"}>
                    {rotuloStatusConsumo(consumo.status)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {aba === "anotacoes" && (
        <div className="space-y-4">
          <Card className="space-y-3">
            <h2 className="text-base font-bold">Nova anotação</h2>
            <p className="text-sm text-slate-600">
              Histórico livre (elogios, avisos, observações). Avaliações formais entram depois.
            </p>
            <form onSubmit={salvarAnotacao} className="space-y-3">
              <Campo rotulo="Data">
                <input
                  type="date"
                  className="campo"
                  required
                  value={dataAnotacao}
                  onChange={(e) => setDataAnotacao(e.target.value)}
                />
              </Campo>
              <Campo rotulo="Texto *">
                <textarea
                  className="campo min-h-24"
                  required
                  value={textoAnotacao}
                  onChange={(e) => setTextoAnotacao(e.target.value)}
                  placeholder="Ex.: aviso verbal por atraso; elogio do serviço de sexta…"
                />
              </Campo>
              {erroAnotacao && <p className="text-sm font-medium text-erro">{erroAnotacao}</p>}
              <div className="flex justify-end">
                <button type="submit" className="btn-primario">
                  Salvar anotação
                </button>
              </div>
            </form>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-base font-bold">Histórico</h2>
            {anotacoesPessoa.length === 0 ? (
              <Vazio mensagem="Nenhuma anotação neste perfil." />
            ) : (
              <div className="space-y-2">
                {anotacoesPessoa.map((anotacao) => (
                  <div
                    key={anotacao.id}
                    className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2"
                  >
                    <p className="text-xs text-slate-500">
                      {dataBR(anotacao.data)}
                      {anotacao.autor ? ` · ${anotacao.autor}` : ""}
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-slate-900">{anotacao.texto}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

export default function RhPerfilPage() {
  return (
    <Suspense
      fallback={
        <div>
          <TituloPagina titulo="Perfil" subtitulo="Carregando…" />
          <p className="text-sm text-slate-500">Carregando perfil…</p>
        </div>
      }
    >
      <RhPerfilConteudo />
    </Suspense>
  );
}
