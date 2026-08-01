"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  BookOpenText,
  Copy,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  ChefHat,
} from "lucide-react";
import { Badge, Campo, Card, StatCard, TituloPagina, Vazio } from "@/components/ui";
import { uid, useDB } from "@/lib/data";
import { dataHoraBR, moeda, qtd } from "@/lib/format";
import {
  calcularCustoFicha,
  converterUnidadeBasica,
  listarConfiguracoesPorcionamento,
  obterSiglaUnidade,
} from "@/lib/domain/fichas-tecnicas";
import {
  MIDIA_MIME_IMAGENS_PERMITIDOS,
  MIDIA_MIME_VIDEOS_PERMITIDOS,
  criarMidiaUrlExterna,
  sanitizarMidiasPersistiveis,
  substituirMidiaDoPasso,
  substituirMidiaPrincipal,
  validarArquivoMidia,
} from "@/lib/domain/fichas-tecnicas-midias";
import { criarRepositorioFichasTecnicasLocal } from "@/lib/domain/fichas-tecnicas-repositorio-local";
import type {
  CanalVendaFichaTecnica,
  DificuldadeReceitaFichaTecnica,
  FichaTecnica,
  FichaTecnicaCanalPreco,
  FichaTecnicaConfiguracaoPorcionamento,
  FichaTecnicaIngrediente,
  FichaTecnicaMidia,
  FichaTecnicaPasso,
  FichaTecnicaStatus,
  ReceitaFichaTecnica,
  ReceitaFichaTecnicaVersao,
  TipoReceitaFichaTecnica,
} from "@/lib/types";

const ABAS = [
  "Receita",
  "Ingredientes e sub-receitas",
  "Modo de preparo",
  "Porcionamento",
  "Custos e preços",
  "Alergênicos e nutrição",
] as const;

type AbaFicha = (typeof ABAS)[number];

const CANAIS: Array<{ canal: CanalVendaFichaTecnica; nome: string }> = [
  { canal: "salao", nome: "Salão" },
  { canal: "balcao", nome: "Balcão" },
  { canal: "delivery_proprio", nome: "Delivery próprio" },
  { canal: "ifood", nome: "iFood" },
];

const AVISO_PREVIA_LOCAL =
  "Esta prévia local será perdida ao recarregar a página. O armazenamento definitivo será habilitado com o Supabase.";

type MidiaLocalTemporaria = {
  id: string;
  tipo: "FOTO" | "VIDEO";
  objectUrl: string;
  nomeArquivo: string;
  mimeType: string;
  tamanhoBytes: number;
};

function garantirPassoComId(passo: FichaTecnicaPasso, indice: number): FichaTecnicaPasso {
  return {
    ...passo,
    id: passo.id ?? uid("passo-ft"),
    ordem: indice + 1,
  };
}

function midiaPrincipalPersistida(midias: FichaTecnicaMidia[]): FichaTecnicaMidia | undefined {
  return [...midias]
    .filter((midia) => midia.passo_id === undefined && midia.tipo === "FOTO")
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0];
}

function midiaDoPassoPersistida(midias: FichaTecnicaMidia[], passoId: string): FichaTecnicaMidia | undefined {
  return [...midias]
    .filter((midia) => midia.passo_id === passoId)
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0];
}

function formatoAceitoInputMidia(): string {
  return [...MIDIA_MIME_IMAGENS_PERMITIDOS, ...MIDIA_MIME_VIDEOS_PERMITIDOS].join(",");
}

function corStatus(status: FichaTecnicaStatus): "cinza" | "verde" | "laranja" {
  if (status === "publicada") return "verde";
  if (status === "arquivada") return "laranja";
  return "cinza";
}

function textoDificuldade(dificuldade?: DificuldadeReceitaFichaTecnica): string {
  if (dificuldade === "facil") return "Fácil";
  if (dificuldade === "media") return "Média";
  if (dificuldade === "dificil") return "Difícil";
  return "Não definida";
}

function canaisPadrao(): FichaTecnicaCanalPreco[] {
  return [
    { canal: "salao", preco_praticado: 42, taxa_percentual: 0, taxa_fixa: 0, impostos_percentual: 6, cmv_desejado_percentual: 32 },
    { canal: "balcao", preco_praticado: 39, taxa_percentual: 0, taxa_fixa: 0, impostos_percentual: 6, cmv_desejado_percentual: 32 },
    { canal: "delivery_proprio", preco_praticado: 46, taxa_percentual: 5, taxa_fixa: 0, impostos_percentual: 6, cmv_desejado_percentual: 34 },
    { canal: "ifood", preco_praticado: 49, taxa_percentual: 16, taxa_fixa: 2, impostos_percentual: 6, cmv_desejado_percentual: 36 },
  ];
}

function numeroSeguro(valor?: number): number {
  if (valor === undefined || Number.isNaN(valor) || !Number.isFinite(valor)) return 0;
  return valor;
}

function criarEstadoEditavel(receita: ReceitaFichaTecnica, versao: ReceitaFichaTecnicaVersao): FichaTecnica {
  const base = structuredClone(versao.ficha);
  const configuracoes = base.configuracoes_porcionamento?.length
    ? base.configuracoes_porcionamento
    : listarConfiguracoesPorcionamento(base);

  return {
    ...base,
    nome: receita.nome,
    descricao: receita.descricao,
    codigo_externo: receita.codigo,
    tipo_receita: receita.tipo ?? "prato",
    categoria_id: receita.categoria_id,
    dificuldade: base.dificuldade ?? "media",
    tempo_preparo_minutos: numeroSeguro(base.tempo_preparo_minutos),
    tempo_coccao_minutos: numeroSeguro(base.tempo_coccao_minutos),
    equipamentos: base.equipamentos ?? [],
    instrucoes_armazenamento: base.instrucoes_armazenamento ?? "",
    custo_preparacao_centavos: base.custo_preparacao_centavos ?? 0,
    custo_coccao_centavos: base.custo_coccao_centavos ?? 0,
    custo_montagem_centavos: base.custo_montagem_centavos ?? 0,
    canais_preco: base.canais_preco?.length ? base.canais_preco : canaisPadrao(),
    configuracoes_porcionamento: configuracoes,
    porcionamento_ativo_id: base.porcionamento_ativo_id ?? configuracoes.find((cfg) => cfg.ativa)?.id ?? configuracoes[0]?.id,
    ingredientes: base.ingredientes.map((ing) => ({
      ...ing,
      quantidade_bruta: ing.quantidade_bruta ?? ing.quantidade,
      quantidade_liquida: ing.quantidade_liquida ?? ing.quantidade,
      fator_correcao: ing.fator_correcao ?? 1,
      percentual_perda: ing.percentual_perda ?? 0,
    })),
    passos: base.passos.map((passo, indice) => {
      const comId = garantirPassoComId(passo, indice);
      return {
        ...comId,
        titulo: comId.titulo ?? `Etapa ${comId.ordem}`,
        temperatura_celsius: comId.temperatura_celsius,
        itens_ingredientes: comId.itens_ingredientes ?? [],
      };
    }),
    midias: (base.midias ?? []).filter((midia) => midia.versao_id === versao.id),
  };
}

function ordenarPassos(passos: FichaTecnicaPasso[]): FichaTecnicaPasso[] {
  return passos
    .map((passo, indice) => ({ ...passo, id: passo.id ?? uid("passo-ft"), ordem: indice + 1 }))
    .sort((a, b) => a.ordem - b.ordem);
}

function riscoPerda(quantidadeBruta: number, quantidadeLiquida: number): number {
  if (quantidadeBruta <= 0) return 0;
  const perda = ((quantidadeBruta - quantidadeLiquida) / quantidadeBruta) * 100;
  return Math.max(0, perda);
}

function converterQuantidadeProduto(
  ingrediente: FichaTecnicaIngrediente,
  custoUnitarioReais: number,
  unidadeUsoId: string,
  unidadeCompraId: string | undefined,
  fatorConversao: number,
  unidades: Array<{ id: string; nome: string; sigla: string }>
): { custoCentavos: number; custoPerdaCentavos: number } {
  const qtdLiquida = ingrediente.quantidade_liquida ?? ingrediente.quantidade;
  const qtdBruta = ingrediente.quantidade_bruta ?? qtdLiquida;
  const custoUnitarioCent = Math.round(custoUnitarioReais * 100);

  let qtdUsoLiquida = qtdLiquida;
  let qtdUsoBruta = qtdBruta;

  if (ingrediente.unidade_id !== unidadeUsoId) {
    if (unidadeCompraId && ingrediente.unidade_id === unidadeCompraId) {
      qtdUsoLiquida = qtdLiquida * fatorConversao;
      qtdUsoBruta = qtdBruta * fatorConversao;
    } else {
      const siglaOrigem = obterSiglaUnidade(ingrediente.unidade_id, unidades);
      const siglaUso = obterSiglaUnidade(unidadeUsoId, unidades);
      qtdUsoLiquida = converterUnidadeBasica(qtdLiquida, siglaOrigem, siglaUso);
      qtdUsoBruta = converterUnidadeBasica(qtdBruta, siglaOrigem, siglaUso);
    }
  }

  const custoLiquido = Math.round(qtdUsoLiquida * custoUnitarioCent);
  const custoBruto = Math.round(qtdUsoBruta * custoUnitarioCent);
  return {
    custoCentavos: custoLiquido,
    custoPerdaCentavos: Math.max(0, custoBruto - custoLiquido),
  };
}

export default function FichaTecnicaDetalhePage() {
  const params = useParams<{ receitaId: string }>();
  const router = useRouter();
  const db = useDB();
  const [repo] = useState(() => criarRepositorioFichasTecnicasLocal());
  const [abaAtiva, setAbaAtiva] = useState<AbaFicha>("Receita");
  const [fichaEditavel, setFichaEditavel] = useState<FichaTecnica | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [fotoLocalTemporaria, setFotoLocalTemporaria] = useState<MidiaLocalTemporaria | null>(null);
  const [midiasLocaisPorPasso, setMidiasLocaisPorPasso] = useState<Record<string, MidiaLocalTemporaria>>({});

  const receita = params?.receitaId ? repo.buscarReceitaPorId(params.receitaId) : undefined;
  const versoes = receita ? repo.listarVersoesDaReceita(receita.id) : [];
  const versaoAtual = receita?.versao_vigente_id
    ? versoes.find((item) => item.id === receita.versao_vigente_id) ?? versoes[versoes.length - 1]
    : versoes[versoes.length - 1];

  useEffect(() => {
    if (!receita || !versaoAtual) {
      setFichaEditavel(null);
      return;
    }
    setFichaEditavel(criarEstadoEditavel(receita, versaoAtual));
  }, [receita?.id, versaoAtual?.id, versaoAtual?.atualizado_em]);

  useEffect(() => {
    return () => {
      if (fotoLocalTemporaria) {
        URL.revokeObjectURL(fotoLocalTemporaria.objectUrl);
      }
      Object.values(midiasLocaisPorPasso).forEach((midia) => {
        URL.revokeObjectURL(midia.objectUrl);
      });
    };
  }, [fotoLocalTemporaria, midiasLocaisPorPasso]);

  const receitasCatalogo = repo.listarReceitas();
  const versoesPorReceita = new Map<string, ReceitaFichaTecnicaVersao | undefined>(
    receitasCatalogo.map((r) => {
      const vs = repo.listarVersoesDaReceita(r.id);
      const vigente = r.versao_vigente_id ? vs.find((v) => v.id === r.versao_vigente_id) : undefined;
      return [r.id, vigente ?? vs[vs.length - 1]];
    })
  );

  const subReceitasDisponiveis = receitasCatalogo.filter((r) => r.id !== receita?.id);
  const categoriasAtivas = db.categorias_produtos.filter((categoria) => categoria.ativo);
  const unidades = db.unidades;

  const custosIngredientes = useMemo(() => {
    if (!fichaEditavel) {
      return {
        totalIngredientesCent: 0,
        totalPerdasCent: 0,
        linhas: new Map<string, { unitarioCent: number; totalCent: number; perdaCent: number; fornecedor?: string }>(),
      };
    }

    const linhas = new Map<string, { unitarioCent: number; totalCent: number; perdaCent: number; fornecedor?: string }>();
    let totalIngredientesCent = 0;
    let totalPerdasCent = 0;

    for (const ingrediente of fichaEditavel.ingredientes) {
      if (ingrediente.tipo === "PRODUTO" && ingrediente.produto_id) {
        const produto = db.produtos.find((item) => item.id === ingrediente.produto_id);
        if (!produto || !produto.custo_unitario) {
          linhas.set(ingrediente.id, { unitarioCent: 0, totalCent: 0, perdaCent: 0 });
          continue;
        }

        try {
          const { custoCentavos, custoPerdaCentavos } = converterQuantidadeProduto(
            ingrediente,
            produto.custo_unitario,
            produto.unidade_uso_id,
            produto.unidade_compra_id,
            produto.fator_conversao,
            unidades
          );
          const fornecedor = ingrediente.fornecedor_referencia_id
            ? db.fornecedores.find((f) => f.id === ingrediente.fornecedor_referencia_id)?.nome
            : produto.fornecedor_padrao_id
              ? db.fornecedores.find((f) => f.id === produto.fornecedor_padrao_id)?.nome
              : undefined;
          linhas.set(ingrediente.id, {
            unitarioCent: Math.round(produto.custo_unitario * 100),
            totalCent: custoCentavos,
            perdaCent: custoPerdaCentavos,
            fornecedor,
          });
          totalIngredientesCent += custoCentavos;
          totalPerdasCent += custoPerdaCentavos;
        } catch {
          linhas.set(ingrediente.id, { unitarioCent: 0, totalCent: 0, perdaCent: 0 });
        }
        continue;
      }

      if (ingrediente.tipo === "SUB_RECEITA" && ingrediente.sub_receita_id) {
        const versaoSub = versoesPorReceita.get(ingrediente.sub_receita_id);
        if (!versaoSub) {
          linhas.set(ingrediente.id, { unitarioCent: 0, totalCent: 0, perdaCent: 0 });
          continue;
        }

        const fichaSub = versaoSub.ficha;
        const todasFichas = Array.from(versoesPorReceita.values())
          .filter((item): item is ReceitaFichaTecnicaVersao => Boolean(item))
          .map((item) => item.ficha);

        try {
          const resultadoSub = calcularCustoFicha(fichaSub, todasFichas, db.produtos, db.unidades);
          const custoPorUnidadeSub = resultadoSub.custo_total / Math.max(1, fichaSub.rendimento_quantidade);
          const siglaOrigem = obterSiglaUnidade(ingrediente.unidade_id, db.unidades);
          const siglaSub = obterSiglaUnidade(fichaSub.rendimento_unidade_id, db.unidades);
          const qtdLiquida = ingrediente.quantidade_liquida ?? ingrediente.quantidade;
          const qtdBruta = ingrediente.quantidade_bruta ?? qtdLiquida;
          const qtdSubLiquida = converterUnidadeBasica(qtdLiquida, siglaOrigem, siglaSub);
          const qtdSubBruta = converterUnidadeBasica(qtdBruta, siglaOrigem, siglaSub);
          const totalCent = Math.round(qtdSubLiquida * custoPorUnidadeSub);
          const perdaCent = Math.max(0, Math.round(qtdSubBruta * custoPorUnidadeSub) - totalCent);
          linhas.set(ingrediente.id, {
            unitarioCent: Math.round(custoPorUnidadeSub),
            totalCent,
            perdaCent,
          });
          totalIngredientesCent += totalCent;
          totalPerdasCent += perdaCent;
        } catch {
          linhas.set(ingrediente.id, { unitarioCent: 0, totalCent: 0, perdaCent: 0 });
        }
      }
    }

    return { totalIngredientesCent, totalPerdasCent, linhas };
  }, [fichaEditavel, db.fornecedores, db.produtos, db.unidades]);

  const porcionamentoSelecionado = useMemo(() => {
    if (!fichaEditavel) return undefined;
    const configuracoes = fichaEditavel.configuracoes_porcionamento ?? [];
    const ativa = configuracoes.find((cfg) => cfg.id === fichaEditavel.porcionamento_ativo_id);
    return ativa ?? configuracoes[0];
  }, [fichaEditavel]);

  const custosResumo = useMemo(() => {
    if (!fichaEditavel) {
      return {
        custoIngredientesCent: 0,
        custoPerdasCent: 0,
        custoEmbalagensCent: 0,
        custoPreparacaoCent: 0,
        custoCoccaoCent: 0,
        custoMontagemCent: 0,
        custoTotalCent: 0,
        custoPorPorcaoCent: 0,
        porcoesTeoricas: 0,
      };
    }

    const custoIngredientesCent = custosIngredientes.totalIngredientesCent;
    const custoPerdasCent = custosIngredientes.totalPerdasCent;
    const custoPreparacaoCent = numeroSeguro(fichaEditavel.custo_preparacao_centavos);
    const custoCoccaoCent = numeroSeguro(fichaEditavel.custo_coccao_centavos);
    const custoMontagemCent = numeroSeguro(fichaEditavel.custo_montagem_centavos);

    const qtdPorcao = porcionamentoSelecionado?.quantidade_por_porcao ?? fichaEditavel.rendimento_quantidade;
    const porcoesTeoricas = qtdPorcao > 0 ? fichaEditavel.rendimento_quantidade / qtdPorcao : 0;
    const custoEmbalagensCent = Math.round((porcionamentoSelecionado?.custo_embalagem_centavos ?? 0) * porcoesTeoricas);

    const custoTotalCent =
      custoIngredientesCent +
      custoPerdasCent +
      custoEmbalagensCent +
      custoPreparacaoCent +
      custoCoccaoCent +
      custoMontagemCent;

    const custoPorPorcaoCent = porcoesTeoricas > 0 ? Math.round(custoTotalCent / porcoesTeoricas) : custoTotalCent;

    return {
      custoIngredientesCent,
      custoPerdasCent,
      custoEmbalagensCent,
      custoPreparacaoCent,
      custoCoccaoCent,
      custoMontagemCent,
      custoTotalCent,
      custoPorPorcaoCent,
      porcoesTeoricas,
    };
  }, [fichaEditavel, custosIngredientes, porcionamentoSelecionado]);

  const precificacaoPorCanal = useMemo(() => {
    if (!fichaEditavel) return [];

    return (fichaEditavel.canais_preco ?? []).map((canal) => {
      const preco = numeroSeguro(canal.preco_praticado);
      const custo = custosResumo.custoPorPorcaoCent / 100;
      const taxaPercentualReais = preco * (numeroSeguro(canal.taxa_percentual) / 100);
      const impostosReais = preco * (numeroSeguro(canal.impostos_percentual) / 100);
      const taxaFixaReais = numeroSeguro(canal.taxa_fixa);
      const custoTotal = custo + taxaPercentualReais + impostosReais + taxaFixaReais;
      const margemReais = preco - custoTotal;
      const margemPercentual = preco > 0 ? (margemReais / preco) * 100 : 0;
      const cmv = preco > 0 ? (custo / preco) * 100 : 0;
      const cmvDesejado = Math.max(1, numeroSeguro(canal.cmv_desejado_percentual));
      const precoSugerido = custo / (cmvDesejado / 100);

      return {
        ...canal,
        custo,
        custoTotal,
        margemReais,
        margemPercentual,
        cmv,
        precoSugerido,
      };
    });
  }, [fichaEditavel, custosResumo.custoPorPorcaoCent]);

  const fichaVazia = Boolean(
    fichaEditavel &&
      fichaEditavel.ingredientes.length === 0 &&
      fichaEditavel.passos.length === 0 &&
      !fichaEditavel.descricao?.trim()
  );

  function atualizarFicha(parcial: Partial<FichaTecnica>) {
    setFichaEditavel((atual) => (atual ? { ...atual, ...parcial } : atual));
  }

  function atualizarMidias(reescrever: (midiasAtuais: FichaTecnicaMidia[]) => FichaTecnicaMidia[]) {
    setFichaEditavel((atual) => {
      if (!atual || !versaoAtual) return atual;
      const midiasAtuais = atual.midias ?? [];
      const proximas = reescrever(midiasAtuais)
        .filter((midia) => midia.versao_id === versaoAtual.id)
        .map((midia) => ({ ...midia }));
      return { ...atual, midias: proximas };
    });
  }

  function removerFotoPrincipalLocal() {
    setFotoLocalTemporaria((anterior) => {
      if (anterior) {
        URL.revokeObjectURL(anterior.objectUrl);
      }
      return null;
    });
  }

  function onSelecionarFotoPrincipalArquivo(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    evento.currentTarget.value = "";
    if (!arquivo || !versaoAtual) return;

    setErro(null);
    try {
      const tipo = validarArquivoMidia({ name: arquivo.name, type: arquivo.type, size: arquivo.size });
      if (tipo !== "FOTO") {
        throw new Error("A foto principal aceita apenas formatos de imagem.");
      }

      const objectUrl = URL.createObjectURL(arquivo);
      setFotoLocalTemporaria((anterior) => {
        if (anterior) {
          URL.revokeObjectURL(anterior.objectUrl);
        }
        return {
          id: uid("mid-local"),
          tipo: "FOTO",
          objectUrl,
          nomeArquivo: arquivo.name,
          mimeType: arquivo.type,
          tamanhoBytes: arquivo.size,
        };
      });
      setMensagem(AVISO_PREVIA_LOCAL);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Arquivo de foto inválido.");
    }
  }

  function salvarFotoPrincipalUrlExterna(url: string) {
    if (!versaoAtual) return;

    const limpa = url.trim();
    setErro(null);
    if (!limpa) {
      atualizarMidias((midiasAtuais) => substituirMidiaPrincipal(midiasAtuais, undefined));
      return;
    }

    try {
      const nova = criarMidiaUrlExterna({
        id: uid("mid-ft"),
        versaoId: versaoAtual.id,
        tipo: "FOTO",
        url: limpa,
      });
      removerFotoPrincipalLocal();
      atualizarMidias((midiasAtuais) => substituirMidiaPrincipal(midiasAtuais, nova));
    } catch (error) {
      setErro(error instanceof Error ? error.message : "URL de foto inválida.");
    }
  }

  function removerFotoPrincipal() {
    removerFotoPrincipalLocal();
    atualizarMidias((midiasAtuais) => substituirMidiaPrincipal(midiasAtuais, undefined));
    atualizarFicha({ foto_url: undefined });
  }

  function removerMidiaPassoLocal(passoId: string) {
    setMidiasLocaisPorPasso((atuais) => {
      const anterior = atuais[passoId];
      if (anterior) {
        URL.revokeObjectURL(anterior.objectUrl);
      }
      const copia = { ...atuais };
      delete copia[passoId];
      return copia;
    });
  }

  function onSelecionarMidiaPassoArquivo(passoId: string, evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    evento.currentTarget.value = "";
    if (!arquivo) return;

    setErro(null);
    try {
      const tipo = validarArquivoMidia({ name: arquivo.name, type: arquivo.type, size: arquivo.size });
      const objectUrl = URL.createObjectURL(arquivo);
      setMidiasLocaisPorPasso((atuais) => {
        const anterior = atuais[passoId];
        if (anterior) {
          URL.revokeObjectURL(anterior.objectUrl);
        }
        return {
          ...atuais,
          [passoId]: {
            id: uid("mid-local-passo"),
            tipo,
            objectUrl,
            nomeArquivo: arquivo.name,
            mimeType: arquivo.type,
            tamanhoBytes: arquivo.size,
          },
        };
      });
      setMensagem(AVISO_PREVIA_LOCAL);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Arquivo de mídia inválido.");
    }
  }

  function salvarMidiaPassoUrlExterna(passoId: string, url: string) {
    if (!versaoAtual) return;
    const limpa = url.trim();
    setErro(null);

    if (!limpa) {
      atualizarMidias((midiasAtuais) => substituirMidiaDoPasso(midiasAtuais, passoId, undefined));
      return;
    }

    try {
      const tipo: "FOTO" | "VIDEO" = /\.(mp4|webm|mov)(\?.*)?$/i.test(limpa) ? "VIDEO" : "FOTO";
      const nova = criarMidiaUrlExterna({
        id: uid("mid-ft"),
        versaoId: versaoAtual.id,
        tipo,
        url: limpa,
        passoId,
      });
      removerMidiaPassoLocal(passoId);
      atualizarMidias((midiasAtuais) => substituirMidiaDoPasso(midiasAtuais, passoId, nova));
    } catch (error) {
      setErro(error instanceof Error ? error.message : "URL de mídia inválida.");
    }
  }

  function removerMidiaPasso(passoId: string) {
    removerMidiaPassoLocal(passoId);
    atualizarMidias((midiasAtuais) => substituirMidiaDoPasso(midiasAtuais, passoId, undefined));
  }

  function atualizarIngrediente(ingredienteId: string, parcial: Partial<FichaTecnicaIngrediente>) {
    setFichaEditavel((atual) => {
      if (!atual) return atual;
      return {
        ...atual,
        ingredientes: atual.ingredientes.map((ingrediente) => {
          if (ingrediente.id !== ingredienteId) return ingrediente;
          const proximo = { ...ingrediente, ...parcial };
          const bruta = proximo.quantidade_bruta ?? proximo.quantidade;
          const liquida = proximo.quantidade_liquida ?? proximo.quantidade;
          const perda = proximo.percentual_perda ?? riscoPerda(bruta, liquida);
          const fator = liquida > 0 ? bruta / liquida : 1;
          return {
            ...proximo,
            quantidade: liquida,
            quantidade_bruta: bruta,
            quantidade_liquida: liquida,
            percentual_perda: perda,
            fator_correcao: fator,
          };
        }),
      };
    });
  }

  function adicionarIngrediente() {
    const produto = db.produtos.find((p) => p.ativo);
    const unidadePadrao = produto?.unidade_uso_id ?? db.unidades[0]?.id;
    if (!unidadePadrao) return;

    setFichaEditavel((atual) => {
      if (!atual) return atual;
      return {
        ...atual,
        ingredientes: [
          ...atual.ingredientes,
          {
            id: uid("ing-ft"),
            tipo: "PRODUTO",
            produto_id: produto?.id,
            quantidade: 1,
            quantidade_bruta: 1,
            quantidade_liquida: 1,
            fator_correcao: 1,
            percentual_perda: 0,
            unidade_id: unidadePadrao,
          },
        ],
      };
    });
  }

  function removerIngrediente(ingredienteId: string) {
    setFichaEditavel((atual) => {
      if (!atual) return atual;
      return {
        ...atual,
        ingredientes: atual.ingredientes.filter((item) => item.id !== ingredienteId),
      };
    });
  }

  function adicionarPasso() {
    setFichaEditavel((atual) => {
      if (!atual) return atual;
      const proximo: FichaTecnicaPasso = {
        id: uid("passo-ft"),
        ordem: atual.passos.length + 1,
        titulo: `Etapa ${atual.passos.length + 1}`,
        descricao: "",
        tempo_minutos: 0,
        temperatura_celsius: 0,
        itens_ingredientes: [],
      };
      return { ...atual, passos: [...atual.passos, proximo] };
    });
  }

  function atualizarPasso(indice: number, parcial: Partial<FichaTecnicaPasso>) {
    setFichaEditavel((atual) => {
      if (!atual) return atual;
      const passos = [...atual.passos];
      passos[indice] = { ...passos[indice], ...parcial };
      return { ...atual, passos: ordenarPassos(passos) };
    });
  }

  function moverPasso(indice: number, direcao: -1 | 1) {
    setFichaEditavel((atual) => {
      if (!atual) return atual;
      const destino = indice + direcao;
      if (destino < 0 || destino >= atual.passos.length) return atual;
      const passos = [...atual.passos];
      const [item] = passos.splice(indice, 1);
      passos.splice(destino, 0, item);
      return { ...atual, passos: ordenarPassos(passos) };
    });
  }

  function removerPasso(indice: number) {
    const passoIdRemovido = fichaEditavel?.passos[indice]?.id;
    if (passoIdRemovido) {
      removerMidiaPassoLocal(passoIdRemovido);
      atualizarMidias((midiasAtuais) => substituirMidiaDoPasso(midiasAtuais, passoIdRemovido, undefined));
    }
    setFichaEditavel((atual) => {
      if (!atual) return atual;
      const passos = atual.passos.filter((_, i) => i !== indice);
      return { ...atual, passos: ordenarPassos(passos) };
    });
  }

  function adicionarConfiguracaoPorcionamento() {
    const unidade = db.unidades[0]?.id;
    if (!unidade) return;

    setFichaEditavel((atual) => {
      if (!atual) return atual;
      const configs = [...(atual.configuracoes_porcionamento ?? [])];
      const nova: FichaTecnicaConfiguracaoPorcionamento = {
        id: uid("porc"),
        nome: `Porção ${configs.length + 1}`,
        quantidade_por_porcao: Math.max(1, atual.rendimento_quantidade / Math.max(1, configs.length + 1)),
        unidade,
        quantidade_porcoes_teorica: 1,
        ativa: configs.length === 0,
        embalagem_nome: "",
        custo_embalagem_centavos: 0,
      };
      configs.push(nova);
      return {
        ...atual,
        configuracoes_porcionamento: configs,
        porcionamento_ativo_id: atual.porcionamento_ativo_id ?? nova.id,
      };
    });
  }

  function atualizarConfiguracaoPorcionamento(configId: string, parcial: Partial<FichaTecnicaConfiguracaoPorcionamento>) {
    setFichaEditavel((atual) => {
      if (!atual) return atual;
      const configs = (atual.configuracoes_porcionamento ?? []).map((cfg) =>
        cfg.id === configId ? { ...cfg, ...parcial } : cfg
      );
      return { ...atual, configuracoes_porcionamento: configs };
    });
  }

  function removerConfiguracaoPorcionamento(configId: string) {
    setFichaEditavel((atual) => {
      if (!atual) return atual;
      const restantes = (atual.configuracoes_porcionamento ?? []).filter((cfg) => cfg.id !== configId);
      return {
        ...atual,
        configuracoes_porcionamento: restantes,
        porcionamento_ativo_id:
          atual.porcionamento_ativo_id === configId ? restantes[0]?.id : atual.porcionamento_ativo_id,
      };
    });
  }

  function atualizarCanal(canal: CanalVendaFichaTecnica, parcial: Partial<FichaTecnicaCanalPreco>) {
    setFichaEditavel((atual) => {
      if (!atual) return atual;
      return {
        ...atual,
        canais_preco: (atual.canais_preco ?? []).map((item) => (item.canal === canal ? { ...item, ...parcial } : item)),
      };
    });
  }

  function carregarExemploDemo() {
    setFichaEditavel((atual) => {
      if (!atual) return atual;
      const mussarela = db.produtos.find((p) => p.nome.toLowerCase().includes("mussarela")) ?? db.produtos[0];
      const tomate = db.produtos.find((p) => p.nome.toLowerCase().includes("tomate")) ?? db.produtos[1] ?? db.produtos[0];
      const manjericao = db.produtos.find((p) => p.nome.toLowerCase().includes("manjeric")) ?? db.produtos[2] ?? db.produtos[0];
      const unidadeUso = mussarela?.unidade_uso_id ?? db.unidades[0]?.id;
      if (!unidadeUso) return atual;

      const ingredientes: FichaTecnicaIngrediente[] = [
        {
          id: uid("ing-ft"),
          tipo: "PRODUTO",
          produto_id: mussarela?.id,
          quantidade: 0.28,
          quantidade_bruta: 0.3,
          quantidade_liquida: 0.28,
          fator_correcao: 1.07,
          percentual_perda: 6.67,
          unidade_id: unidadeUso,
          fornecedor_referencia_id: mussarela?.fornecedor_padrao_id,
        },
        {
          id: uid("ing-ft"),
          tipo: "PRODUTO",
          produto_id: tomate?.id,
          quantidade: 0.24,
          quantidade_bruta: 0.3,
          quantidade_liquida: 0.24,
          fator_correcao: 1.25,
          percentual_perda: 20,
          unidade_id: tomate?.unidade_uso_id ?? unidadeUso,
          fornecedor_referencia_id: tomate?.fornecedor_padrao_id,
        },
        {
          id: uid("ing-ft"),
          tipo: "PRODUTO",
          produto_id: manjericao?.id,
          quantidade: 0.015,
          quantidade_bruta: 0.018,
          quantidade_liquida: 0.015,
          fator_correcao: 1.2,
          percentual_perda: 16.67,
          unidade_id: manjericao?.unidade_uso_id ?? unidadeUso,
          fornecedor_referencia_id: manjericao?.fornecedor_padrao_id,
        },
      ];

      const passos: FichaTecnicaPasso[] = [
        {
          ordem: 1,
          titulo: "Mise en place",
          descricao: "Separar ingredientes, higienizar tomate e preparar bancada.",
          tempo_minutos: 10,
          temperatura_celsius: 23,
          itens_ingredientes: ingredientes.slice(0, 2).map((ing) => ({ ingrediente_receita_id: ing.id })),
        },
        {
          ordem: 2,
          titulo: "Montagem",
          descricao: "Abrir massa, espalhar molho, distribuir mussarela e tomates fatiados.",
          tempo_minutos: 8,
          temperatura_celsius: 24,
          itens_ingredientes: ingredientes.map((ing) => ({ ingrediente_receita_id: ing.id })),
        },
        {
          ordem: 3,
          titulo: "Forno e finalização",
          descricao: "Assar em forno alto, finalizar com manjericão e azeite.",
          tempo_minutos: 12,
          temperatura_celsius: 320,
          itens_ingredientes: [{ ingrediente_receita_id: ingredientes[2].id }],
        },
      ];

      const unidadeGrama = db.unidades.find((u) => u.sigla.toLowerCase() === "g")?.id ?? unidadeUso;

      return {
        ...atual,
        nome: "Pizza Marguerita",
        codigo_externo: atual.codigo_externo || "FT-PIZZA-MARG",
        descricao: "Pizza clássica de molho de tomate, mussarela e manjericão.",
        dificuldade: "media",
        tempo_preparo_minutos: 20,
        tempo_coccao_minutos: 12,
        instrucoes_armazenamento: "Manter sob refrigeração até 2 dias após pré-preparo.",
        equipamentos: ["forno", "balança", "bancada fria"],
        rendimento_quantidade: 1000,
        rendimento_unidade_id: unidadeGrama,
        ingredientes,
        passos,
        configuracoes_porcionamento: [
          {
            id: uid("porc"),
            nome: "Porção P",
            quantidade_por_porcao: 180,
            unidade: unidadeGrama,
            quantidade_porcoes_teorica: 0,
            ativa: true,
            embalagem_nome: "Caixa pequena",
            custo_embalagem_centavos: 120,
          },
          {
            id: uid("porc"),
            nome: "Porção G",
            quantidade_por_porcao: 250,
            unidade: unidadeGrama,
            quantidade_porcoes_teorica: 0,
            ativa: false,
            embalagem_nome: "Caixa média",
            custo_embalagem_centavos: 180,
          },
          {
            id: uid("porc"),
            nome: "Travessa",
            quantidade_por_porcao: 1000,
            unidade: unidadeGrama,
            quantidade_porcoes_teorica: 0,
            ativa: false,
            embalagem_nome: "Caixa família",
            custo_embalagem_centavos: 320,
          },
        ],
        porcionamento_ativo_id: undefined,
        custo_preparacao_centavos: 450,
        custo_coccao_centavos: 380,
        custo_montagem_centavos: 240,
        canais_preco: canaisPadrao(),
      };
    });
  }

  async function salvarFicha() {
    if (!receita || !versaoAtual || !fichaEditavel) return;
    setErro(null);
    setMensagem(null);
    setSalvando(true);

    try {
      const midiasPersistiveis = sanitizarMidiasPersistiveis(fichaEditavel.midias ?? [], versaoAtual.id);
      const fotoPrincipal = midiaPrincipalPersistida(midiasPersistiveis);
      const passos = ordenarPassos(fichaEditavel.passos).map((passo) => {
        const midiaPasso = passo.id ? midiaDoPassoPersistida(midiasPersistiveis, passo.id) : undefined;
        const fotoPasso = midiaPasso && midiaPasso.tipo === "FOTO" ? midiaPasso.url : undefined;
        return {
          ...passo,
          id: passo.id ?? uid("passo-ft"),
          titulo: passo.titulo?.trim() || undefined,
          descricao: passo.descricao.trim(),
          foto_url: (fotoPasso ?? passo.foto_url?.trim()) || undefined,
          itens_ingredientes: passo.itens_ingredientes?.filter((item) => item.ingrediente_receita_id),
        };
      });

      const ingredientes = fichaEditavel.ingredientes.map((item) => {
        const bruta = Number(item.quantidade_bruta ?? item.quantidade ?? 0);
        const liquida = Number(item.quantidade_liquida ?? item.quantidade ?? 0);
        return {
          ...item,
          quantidade: liquida,
          quantidade_bruta: bruta,
          quantidade_liquida: liquida,
          percentual_perda: item.percentual_perda ?? riscoPerda(bruta, liquida),
          fator_correcao: item.fator_correcao ?? (liquida > 0 ? bruta / liquida : 1),
        };
      });

      repo.atualizarDadosReceita(
        receita.id,
        {
          codigo: fichaEditavel.codigo_externo?.trim() || receita.codigo,
          nome: fichaEditavel.nome.trim(),
          descricao: fichaEditavel.descricao?.trim() || undefined,
          tipo: fichaEditavel.tipo_receita,
          categoria_id: fichaEditavel.categoria_id?.trim() || undefined,
        },
        { responsavel: "interface-local" }
      );

      repo.atualizarRascunho(
        versaoAtual.id,
        {
          nome: fichaEditavel.nome.trim(),
          descricao: fichaEditavel.descricao?.trim() || undefined,
          codigo_externo: fichaEditavel.codigo_externo?.trim() || undefined,
          foto_url: (fotoPrincipal?.url ?? fichaEditavel.foto_url?.trim()) || undefined,
          tipo_receita: fichaEditavel.tipo_receita,
          categoria_id: fichaEditavel.categoria_id?.trim() || undefined,
          dificuldade: fichaEditavel.dificuldade,
          tempo_preparo_minutos: numeroSeguro(fichaEditavel.tempo_preparo_minutos),
          tempo_coccao_minutos: numeroSeguro(fichaEditavel.tempo_coccao_minutos),
          equipamentos: fichaEditavel.equipamentos?.map((item) => item.trim()).filter(Boolean),
          instrucoes_armazenamento: fichaEditavel.instrucoes_armazenamento?.trim() || undefined,
          rendimento_quantidade: Math.max(1, numeroSeguro(fichaEditavel.rendimento_quantidade)),
          rendimento_unidade_id: fichaEditavel.rendimento_unidade_id,
          ingredientes,
          passos,
          midias: midiasPersistiveis,
          configuracoes_porcionamento: (fichaEditavel.configuracoes_porcionamento ?? []).map((cfg) => ({
            ...cfg,
            nome: cfg.nome.trim(),
            quantidade_por_porcao: Math.max(0.0001, Number(cfg.quantidade_por_porcao) || 0.0001),
            embalagem_nome: cfg.embalagem_nome?.trim() || undefined,
            custo_embalagem_centavos: Math.max(0, Number(cfg.custo_embalagem_centavos) || 0),
          })),
          porcionamento_ativo_id: fichaEditavel.porcionamento_ativo_id,
          canais_preco: (fichaEditavel.canais_preco ?? []).map((canal) => ({
            ...canal,
            preco_praticado: Math.max(0, Number(canal.preco_praticado) || 0),
            taxa_percentual: Math.max(0, Number(canal.taxa_percentual) || 0),
            taxa_fixa: Math.max(0, Number(canal.taxa_fixa) || 0),
            impostos_percentual: Math.max(0, Number(canal.impostos_percentual) || 0),
            cmv_desejado_percentual: Math.max(1, Number(canal.cmv_desejado_percentual) || 1),
          })),
          custo_preparacao_centavos: Math.max(0, Number(fichaEditavel.custo_preparacao_centavos) || 0),
          custo_coccao_centavos: Math.max(0, Number(fichaEditavel.custo_coccao_centavos) || 0),
          custo_montagem_centavos: Math.max(0, Number(fichaEditavel.custo_montagem_centavos) || 0),
        },
        { responsavel: "interface-local" }
      );

      setMensagem("Ficha técnica salva com sucesso.");
      setFichaEditavel(criarEstadoEditavel(repo.buscarReceitaPorId(receita.id)!, repo.buscarVersaoPorId(versaoAtual.id)!));
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao salvar a ficha técnica.");
    } finally {
      setSalvando(false);
    }
  }

  async function publicarFichaAtual() {
    if (!receita || !versaoAtual) return;
    setErro(null);
    setMensagem(null);

    try {
      await salvarFicha();
      repo.publicarVersao(receita.id, versaoAtual.id, { responsavel: "interface-local" });
      setMensagem("Versão publicada com sucesso.");
      const receitaAtualizada = repo.buscarReceitaPorId(receita.id);
      if (receitaAtualizada?.versao_vigente_id) {
        const versao = repo.buscarVersaoPorId(receitaAtualizada.versao_vigente_id);
        if (versao) {
          setFichaEditavel(criarEstadoEditavel(receitaAtualizada, versao));
        }
      }
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível publicar a versão.");
    }
  }

  function arquivarFichaAtual() {
    if (!versaoAtual || !fichaEditavel) return;
    setErro(null);
    setMensagem(null);

    try {
      repo.atualizarRascunho(
        versaoAtual.id,
        { status: "arquivada" },
        { responsavel: "interface-local" }
      );
      setMensagem("Ficha arquivada.");
      setFichaEditavel((atual) => (atual ? { ...atual, status: "arquivada" } : atual));
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível arquivar a ficha.");
    }
  }

  function duplicarFicha() {
    if (!fichaEditavel || !receita) return;
    setErro(null);
    setMensagem(null);

    try {
      const codigoBase = (fichaEditavel.codigo_externo || receita.codigo).trim();
      let codigoNovo = `${codigoBase}-COPIA`;
      let contador = 2;
      while (repo.buscarReceitaPorCodigo(codigoNovo)) {
        codigoNovo = `${codigoBase}-COPIA-${contador}`;
        contador += 1;
      }

      const resultado = repo.criarRascunhoBasico({
        nome: `${fichaEditavel.nome} (cópia)`,
        codigo: codigoNovo,
        tipo: fichaEditavel.tipo_receita ?? "prato",
        categoria_id: fichaEditavel.categoria_id,
        descricao: fichaEditavel.descricao,
        criado_por: "interface-local",
        rendimento_unidade_id: fichaEditavel.rendimento_unidade_id,
      });

      repo.atualizarRascunho(
        resultado.versao.id,
        {
          ...fichaEditavel,
          ...(() => {
            const passosAntigos = fichaEditavel.passos;
            const mapaPassos = new Map<string, string>();
            const passosNovos = structuredClone(passosAntigos).map((passo, idx) => {
              const novoId = uid("passo-ft");
              if (passo.id) {
                mapaPassos.set(passo.id, novoId);
              }
              return {
                ...passo,
                id: novoId,
                ordem: idx + 1,
                itens_ingredientes: passo.itens_ingredientes?.map((item) => ({ ...item })),
              };
            });

            const midiasNovas = (fichaEditavel.midias ?? []).map((midia) => ({
              ...midia,
              id: uid("mid-ft"),
              versao_id: resultado.versao.id,
              passo_id: midia.passo_id ? mapaPassos.get(midia.passo_id) : undefined,
              criado_em: new Date().toISOString(),
            }));

            return {
              passos: passosNovos,
              midias: midiasNovas,
            };
          })(),
          nome: `${fichaEditavel.nome} (cópia)`,
          codigo_externo: codigoNovo,
          status: "rascunho",
          ingredientes: structuredClone(fichaEditavel.ingredientes).map((ing) => ({ ...ing, id: uid("ing-ft") })),
          configuracoes_porcionamento: structuredClone(fichaEditavel.configuracoes_porcionamento ?? []).map((cfg) => ({
            ...cfg,
            id: uid("porc"),
          })),
        },
        { responsavel: "interface-local" }
      );

      router.push(`/fichas-tecnicas/${resultado.receita.id}`);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao duplicar ficha técnica.");
    }
  }

  if (!receita || !versaoAtual || !fichaEditavel) {
    return (
      <div className="space-y-4">
        <TituloPagina
          titulo="Ficha técnica"
          subtitulo="A ficha solicitada não foi encontrada no catálogo atual."
          acao={
            <Link href="/fichas-tecnicas" className="btn-secundario">
              <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo
            </Link>
          }
        />
        <Vazio mensagem="Nenhuma ficha técnica encontrada com este identificador." />
      </div>
    );
  }

  const midiasDaVersao = fichaEditavel.midias ?? [];
  const midiaPrincipalAtual = midiaPrincipalPersistida(midiasDaVersao);
  const fotoPrincipalPreviewUrl =
    fotoLocalTemporaria?.objectUrl ?? midiaPrincipalAtual?.url ?? fichaEditavel.foto_url?.trim() ?? undefined;

  const blocosGrafico = [
    { nome: "Ingredientes", valor: custosResumo.custoIngredientesCent, cor: "#f59e0b" },
    { nome: "Perdas", valor: custosResumo.custoPerdasCent, cor: "#fb7185" },
    { nome: "Embalagens", valor: custosResumo.custoEmbalagensCent, cor: "#38bdf8" },
    { nome: "Preparação", valor: custosResumo.custoPreparacaoCent, cor: "#34d399" },
    { nome: "Cocção", valor: custosResumo.custoCoccaoCent, cor: "#a78bfa" },
    { nome: "Montagem", valor: custosResumo.custoMontagemCent, cor: "#f97316" },
  ];
  const somaGrafico = blocosGrafico.reduce((acc, item) => acc + item.valor, 0);
  let anguloAcumulado = 0;
  const gradienteRosca = blocosGrafico
    .map((item) => {
      const fatia = somaGrafico > 0 ? (item.valor / somaGrafico) * 360 : 0;
      const inicio = anguloAcumulado;
      const fim = anguloAcumulado + fatia;
      anguloAcumulado = fim;
      return `${item.cor} ${inicio.toFixed(2)}deg ${fim.toFixed(2)}deg`;
    })
    .join(", ");

  return (
    <div className="space-y-4">
      <TituloPagina
        titulo={fichaEditavel.nome}
        subtitulo={`Versão ${versaoAtual.numero_versao} · Atualizado em ${dataHoraBR(versaoAtual.atualizado_em)}`}
        acao={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secundario" onClick={duplicarFicha}>
              <Copy className="h-4 w-4" /> Duplicar
            </button>
            <button className="btn-secundario" onClick={arquivarFichaAtual}>
              <Archive className="h-4 w-4" /> Arquivar
            </button>
            <button className="btn-secundario" onClick={publicarFichaAtual}>
              <ShieldCheck className="h-4 w-4" /> Publicar
            </button>
            <button className="btn-primario" onClick={salvarFicha} disabled={salvando}>
              <Save className="h-4 w-4" /> {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        }
      />

      <Card className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="rounded-card border border-dashed border-stone-300 p-3">
          {fotoPrincipalPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fotoPrincipalPreviewUrl} alt={fichaEditavel.nome} className="h-40 w-full rounded-card object-cover" />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-card bg-stone-100 text-stone-500">
              <ChefHat className="h-8 w-8" />
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="rotulo">Código</p>
            <p className="font-semibold">{fichaEditavel.codigo_externo ?? receita.codigo}</p>
          </div>
          <div>
            <p className="rotulo">Tipo</p>
            <p className="font-semibold">{fichaEditavel.tipo_receita === "sub_receita" ? "Sub-receita" : "Prato"}</p>
          </div>
          <div>
            <p className="rotulo">Categoria</p>
            <p className="font-semibold">{categoriasAtivas.find((c) => c.id === fichaEditavel.categoria_id)?.nome ?? "Não definida"}</p>
          </div>
          <div>
            <p className="rotulo">Dificuldade</p>
            <p className="font-semibold">{textoDificuldade(fichaEditavel.dificuldade)}</p>
          </div>
          <div>
            <p className="rotulo">Status</p>
            <Badge cor={corStatus(fichaEditavel.status)}>{fichaEditavel.status}</Badge>
          </div>
          <div>
            <p className="rotulo">Rendimento</p>
            <p className="font-semibold">{qtd(fichaEditavel.rendimento_quantidade, db.unidades.find((u) => u.id === fichaEditavel.rendimento_unidade_id)?.sigla)}</p>
          </div>
          <div>
            <p className="rotulo">Tempo preparo</p>
            <p className="font-semibold">{qtd(fichaEditavel.tempo_preparo_minutos, "min")}</p>
          </div>
          <div>
            <p className="rotulo">Tempo cocção</p>
            <p className="font-semibold">{qtd(fichaEditavel.tempo_coccao_minutos, "min")}</p>
          </div>
        </div>
      </Card>

      {mensagem && <p className="rounded-card bg-sucesso-clara px-4 py-3 text-sm font-medium text-primaria-escura">{mensagem}</p>}
      {erro && <p className="rounded-card bg-erro-clara px-4 py-3 text-sm font-medium text-erro">{erro}</p>}

      {fichaVazia && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-amber-300 bg-amber-50/70">
          <p className="text-sm text-amber-900">Esta ficha está vazia. Carregue um exemplo para demonstração visual e operacional.</p>
          <button className="btn-secundario" onClick={carregarExemploDemo}>
            <BookOpenText className="h-4 w-4" /> Carregar exemplo para demonstração
          </button>
        </Card>
      )}

      <Card className="p-2">
        <div className="flex flex-wrap gap-2">
          {ABAS.map((aba) => (
            <button
              key={aba}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                abaAtiva === aba ? "bg-primaria text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"
              }`}
              onClick={() => setAbaAtiva(aba)}
            >
              {aba}
            </button>
          ))}
        </div>
      </Card>

      {abaAtiva === "Receita" && (
        <Card className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Campo rotulo="Nome">
              <input className="campo" value={fichaEditavel.nome} onChange={(e) => atualizarFicha({ nome: e.target.value })} />
            </Campo>
            <Campo rotulo="Código">
              <input className="campo" value={fichaEditavel.codigo_externo ?? ""} onChange={(e) => atualizarFicha({ codigo_externo: e.target.value })} />
            </Campo>
            <Campo rotulo="Categoria">
              <select className="campo" value={fichaEditavel.categoria_id ?? ""} onChange={(e) => atualizarFicha({ categoria_id: e.target.value || undefined })}>
                <option value="">Sem categoria</option>
                {categoriasAtivas.map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Tipo">
              <select className="campo" value={fichaEditavel.tipo_receita ?? "prato"} onChange={(e) => atualizarFicha({ tipo_receita: e.target.value as TipoReceitaFichaTecnica })}>
                <option value="prato">Prato</option>
                <option value="sub_receita">Sub-receita</option>
              </select>
            </Campo>
            <Campo rotulo="Dificuldade">
              <select className="campo" value={fichaEditavel.dificuldade ?? "media"} onChange={(e) => atualizarFicha({ dificuldade: e.target.value as DificuldadeReceitaFichaTecnica })}>
                <option value="facil">Fácil</option>
                <option value="media">Média</option>
                <option value="dificil">Difícil</option>
              </select>
            </Campo>
            <Campo rotulo="Tempo de preparo (min)">
              <input type="number" min={0} className="campo" value={numeroSeguro(fichaEditavel.tempo_preparo_minutos)} onChange={(e) => atualizarFicha({ tempo_preparo_minutos: Number(e.target.value) })} />
            </Campo>
            <Campo rotulo="Tempo de cocção (min)">
              <input type="number" min={0} className="campo" value={numeroSeguro(fichaEditavel.tempo_coccao_minutos)} onChange={(e) => atualizarFicha({ tempo_coccao_minutos: Number(e.target.value) })} />
            </Campo>
            <Campo rotulo="Rendimento total">
              <input type="number" min={0.001} step="0.001" className="campo" value={fichaEditavel.rendimento_quantidade} onChange={(e) => atualizarFicha({ rendimento_quantidade: Math.max(0.001, Number(e.target.value) || 0.001) })} />
            </Campo>
            <Campo rotulo="Unidade do rendimento">
              <select className="campo" value={fichaEditavel.rendimento_unidade_id} onChange={(e) => atualizarFicha({ rendimento_unidade_id: e.target.value })}>
                {db.unidades.map((unidade) => (
                  <option key={unidade.id} value={unidade.id}>{unidade.sigla} — {unidade.nome}</option>
                ))}
              </select>
            </Campo>
          </div>

          <Card className="space-y-3 border border-stone-200 bg-stone-50/60">
            <h3 className="text-sm font-semibold text-stone-800">Foto principal</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <Campo rotulo="Upload local (preview temporária)">
                <input
                  type="file"
                  accept={MIDIA_MIME_IMAGENS_PERMITIDOS.join(",")}
                  className="campo"
                  onChange={onSelecionarFotoPrincipalArquivo}
                />
              </Campo>
              <Campo rotulo="URL externa (persistida)">
                <input
                  className="campo"
                  placeholder="https://..."
                  value={fichaEditavel.foto_url ?? midiaPrincipalAtual?.url ?? ""}
                  onChange={(e) => atualizarFicha({ foto_url: e.target.value })}
                  onBlur={(e) => salvarFotoPrincipalUrlExterna(e.target.value)}
                />
              </Campo>
            </div>
            {fotoLocalTemporaria ? (
              <p className="text-xs text-amber-700">{AVISO_PREVIA_LOCAL}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button className="btn-secundario" onClick={removerFotoPrincipal}>Remover foto principal</button>
            </div>
          </Card>

          <Campo rotulo="Descrição">
            <textarea className="campo min-h-24" value={fichaEditavel.descricao ?? ""} onChange={(e) => atualizarFicha({ descricao: e.target.value })} />
          </Campo>

          <Campo rotulo="Equipamentos (separados por vírgula)">
            <input
              className="campo"
              value={(fichaEditavel.equipamentos ?? []).join(", ")}
              onChange={(e) => atualizarFicha({ equipamentos: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}
            />
          </Campo>

          <Campo rotulo="Instruções de armazenamento">
            <textarea className="campo min-h-24" value={fichaEditavel.instrucoes_armazenamento ?? ""} onChange={(e) => atualizarFicha({ instrucoes_armazenamento: e.target.value })} />
          </Campo>
        </Card>
      )}

      {abaAtiva === "Ingredientes e sub-receitas" && (
        <Card className="space-y-4">
          <div className="flex justify-end">
            <button className="btn-primario" onClick={adicionarIngrediente}>
              <Plus className="h-4 w-4" /> Adicionar linha
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="rotulo px-2 py-2">Ingrediente/Sub-receita</th>
                  <th className="rotulo px-2 py-2">Qtd. bruta</th>
                  <th className="rotulo px-2 py-2">Qtd. líquida</th>
                  <th className="rotulo px-2 py-2">Unidade</th>
                  <th className="rotulo px-2 py-2">Fator correção</th>
                  <th className="rotulo px-2 py-2">Perda %</th>
                  <th className="rotulo px-2 py-2">Custo unitário</th>
                  <th className="rotulo px-2 py-2">Custo total</th>
                  <th className="rotulo px-2 py-2">Fornecedor ref.</th>
                  <th className="rotulo px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fichaEditavel.ingredientes.map((ingrediente) => {
                  const produto = ingrediente.produto_id ? db.produtos.find((item) => item.id === ingrediente.produto_id) : undefined;
                  const custoLinha = custosIngredientes.linhas.get(ingrediente.id);
                  const relacionamentosFornecedor = ingrediente.produto_id
                    ? db.fornecedor_produtos.filter((fp) => fp.produto_id === ingrediente.produto_id)
                    : [];

                  return (
                    <tr key={ingrediente.id}>
                      <td className="px-2 py-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <select
                            className="campo"
                            value={ingrediente.tipo}
                            onChange={(e) =>
                              atualizarIngrediente(ingrediente.id, {
                                tipo: e.target.value as "PRODUTO" | "SUB_RECEITA",
                                produto_id: e.target.value === "PRODUTO" ? ingrediente.produto_id : undefined,
                                sub_receita_id: e.target.value === "SUB_RECEITA" ? ingrediente.sub_receita_id : undefined,
                              })
                            }
                          >
                            <option value="PRODUTO">Produto</option>
                            <option value="SUB_RECEITA">Sub-receita</option>
                          </select>

                          {ingrediente.tipo === "PRODUTO" ? (
                            <select className="campo" value={ingrediente.produto_id ?? ""} onChange={(e) => atualizarIngrediente(ingrediente.id, { produto_id: e.target.value || undefined })}>
                              <option value="">Selecione</option>
                              {db.produtos.filter((p) => p.ativo).map((p) => (
                                <option key={p.id} value={p.id}>{p.nome}</option>
                              ))}
                            </select>
                          ) : (
                            <select className="campo" value={ingrediente.sub_receita_id ?? ""} onChange={(e) => atualizarIngrediente(ingrediente.id, { sub_receita_id: e.target.value || undefined })}>
                              <option value="">Selecione</option>
                              {subReceitasDisponiveis.map((r) => (
                                <option key={r.id} value={r.id}>{r.nome}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.001" min={0} className="campo" value={ingrediente.quantidade_bruta ?? ingrediente.quantidade} onChange={(e) => atualizarIngrediente(ingrediente.id, { quantidade_bruta: Number(e.target.value), quantidade: Number(e.target.value) })} />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.001" min={0} className="campo" value={ingrediente.quantidade_liquida ?? ingrediente.quantidade} onChange={(e) => atualizarIngrediente(ingrediente.id, { quantidade_liquida: Number(e.target.value), quantidade: Number(e.target.value) })} />
                      </td>
                      <td className="px-2 py-2">
                        <select className="campo" value={ingrediente.unidade_id} onChange={(e) => atualizarIngrediente(ingrediente.id, { unidade_id: e.target.value })}>
                          {db.unidades.map((u) => (
                            <option key={u.id} value={u.id}>{u.sigla}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.01" min={0} className="campo" value={(ingrediente.fator_correcao ?? 1).toFixed(2)} onChange={(e) => atualizarIngrediente(ingrediente.id, { fator_correcao: Number(e.target.value) })} />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" step="0.01" min={0} className="campo" value={(ingrediente.percentual_perda ?? 0).toFixed(2)} onChange={(e) => atualizarIngrediente(ingrediente.id, { percentual_perda: Number(e.target.value) })} />
                      </td>
                      <td className="px-2 py-2 font-semibold">{moeda((custoLinha?.unitarioCent ?? 0) / 100)}</td>
                      <td className="px-2 py-2 font-semibold">{moeda((custoLinha?.totalCent ?? 0) / 100)}</td>
                      <td className="px-2 py-2">
                        <select
                          className="campo"
                          value={ingrediente.fornecedor_referencia_id ?? ""}
                          onChange={(e) => atualizarIngrediente(ingrediente.id, { fornecedor_referencia_id: e.target.value || undefined })}
                        >
                          <option value="">{custoLinha?.fornecedor ? `Padrão: ${custoLinha.fornecedor}` : "Sem referência"}</option>
                          {relacionamentosFornecedor.map((fp) => {
                            const fornecedor = db.fornecedores.find((f) => f.id === fp.fornecedor_id);
                            if (!fornecedor) return null;
                            return <option key={fp.id} value={fornecedor.id}>{fornecedor.nome}</option>;
                          })}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <button className="rounded-full p-2 text-red-600 hover:bg-red-50" onClick={() => removerIngrediente(ingrediente.id)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {abaAtiva === "Modo de preparo" && (
        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="flex justify-end">
              <button className="btn-primario" onClick={adicionarPasso}>
                <Plus className="h-4 w-4" /> Adicionar passo
              </button>
            </div>

            {fichaEditavel.passos.length === 0 && <Vazio mensagem="Adicione passos para descrever o modo de preparo." />}

            {fichaEditavel.passos.map((passo, indice) => {
              const passoId = passo.id;
              const midiaLocalPasso = passoId ? midiasLocaisPorPasso[passoId] : undefined;
              const midiaPersistidaPasso = passoId ? midiaDoPassoPersistida(midiasDaVersao, passoId) : undefined;
              const midiaPassoPreview = midiaLocalPasso?.objectUrl ?? midiaPersistidaPasso?.url ?? passo.foto_url?.trim() ?? undefined;
              const tipoMidiaPasso: "FOTO" | "VIDEO" | undefined = midiaLocalPasso?.tipo ?? midiaPersistidaPasso?.tipo;
              return (
              <Card key={passo.id ?? `${passo.ordem}-${indice}`} className="space-y-3 border border-stone-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-stone-800">Passo {passo.ordem}</h3>
                  <div className="flex gap-2">
                    <button className="btn-secundario" onClick={() => moverPasso(indice, -1)} disabled={indice === 0}>↑</button>
                    <button className="btn-secundario" onClick={() => moverPasso(indice, 1)} disabled={indice === fichaEditavel.passos.length - 1}>↓</button>
                    <button className="btn-secundario text-red-600" onClick={() => removerPasso(indice)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-4">
                  <Campo rotulo="Título">
                    <input className="campo" value={passo.titulo ?? ""} onChange={(e) => atualizarPasso(indice, { titulo: e.target.value })} />
                  </Campo>
                  <Campo rotulo="Tempo (min)">
                    <input type="number" min={0} className="campo" value={numeroSeguro(passo.tempo_minutos)} onChange={(e) => atualizarPasso(indice, { tempo_minutos: Number(e.target.value) })} />
                  </Campo>
                  <Campo rotulo="Temperatura (°C)">
                    <input type="number" className="campo" value={numeroSeguro(passo.temperatura_celsius)} onChange={(e) => atualizarPasso(indice, { temperatura_celsius: Number(e.target.value) })} />
                  </Campo>
                  <Campo rotulo="URL externa da mídia">
                    <input
                      className="campo"
                      placeholder="https://..."
                      value={passo.foto_url ?? midiaPersistidaPasso?.url ?? ""}
                      onChange={(e) => atualizarPasso(indice, { foto_url: e.target.value })}
                      onBlur={(e) => {
                        if (!passoId) return;
                        salvarMidiaPassoUrlExterna(passoId, e.target.value);
                      }}
                    />
                  </Campo>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <Campo rotulo="Upload local (foto/vídeo)">
                    <input
                      type="file"
                      accept={formatoAceitoInputMidia()}
                      className="campo"
                      disabled={!passoId}
                      onChange={(e) => {
                        if (!passoId) return;
                        onSelecionarMidiaPassoArquivo(passoId, e);
                      }}
                    />
                  </Campo>
                  <div className="rounded-card border border-dashed border-stone-300 p-3">
                    {midiaPassoPreview ? (
                      tipoMidiaPasso === "VIDEO" ? (
                        <video className="h-36 w-full rounded-card object-cover" controls src={midiaPassoPreview} />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="h-36 w-full rounded-card object-cover" src={midiaPassoPreview} alt={`Mídia do passo ${passo.ordem}`} />
                      )
                    ) : (
                      <p className="text-sm text-stone-500">Sem mídia neste passo.</p>
                    )}
                  </div>
                </div>

                {midiaLocalPasso ? <p className="text-xs text-amber-700">{AVISO_PREVIA_LOCAL}</p> : null}
                <div className="flex justify-end">
                  <button className="btn-secundario text-red-600" onClick={() => passoId && removerMidiaPasso(passoId)} disabled={!passoId}>
                    Remover mídia do passo
                  </button>
                </div>

                <Campo rotulo="Instrução">
                  <textarea className="campo min-h-20" value={passo.descricao} onChange={(e) => atualizarPasso(indice, { descricao: e.target.value })} />
                </Campo>

                <div>
                  <p className="rotulo mb-2">Ingredientes utilizados neste passo</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {fichaEditavel.ingredientes.map((ing) => {
                      const ativo = Boolean(passo.itens_ingredientes?.some((item) => item.ingrediente_receita_id === ing.id));
                      const nomeProduto = ing.produto_id
                        ? db.produtos.find((p) => p.id === ing.produto_id)?.nome
                        : subReceitasDisponiveis.find((sr) => sr.id === ing.sub_receita_id)?.nome;
                      return (
                        <label key={ing.id} className="flex items-center gap-2 rounded-card border border-stone-200 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={ativo}
                            onChange={(e) => {
                              const atuais = passo.itens_ingredientes ?? [];
                              const proximos = e.target.checked
                                ? [...atuais, { ingrediente_receita_id: ing.id }]
                                : atuais.filter((item) => item.ingrediente_receita_id !== ing.id);
                              atualizarPasso(indice, { itens_ingredientes: proximos });
                            }}
                          />
                          <span>{nomeProduto ?? "Ingrediente"}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </Card>
              );
            })}
          </Card>

          <Card className="space-y-3">
            <h3 className="text-sm font-semibold text-stone-800">Visualização operacional (tablet)</h3>
            <div className="grid gap-3 lg:grid-cols-2">
              {fichaEditavel.passos.map((passo) => (
                <div key={`op-${passo.ordem}`} className="rounded-card border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Etapa {passo.ordem}</p>
                  <p className="mt-1 text-lg font-bold text-stone-900">{passo.titulo || `Passo ${passo.ordem}`}</p>
                  <p className="mt-2 text-sm text-stone-700">{passo.descricao || "Sem descrição"}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
                    <span className="rounded-full bg-white px-2 py-1">{qtd(passo.tempo_minutos, "min")}</span>
                    <span className="rounded-full bg-white px-2 py-1">{qtd(passo.temperatura_celsius, "°C")}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {abaAtiva === "Porcionamento" && (
        <Card className="space-y-4">
          <div className="flex justify-end">
            <button className="btn-primario" onClick={adicionarConfiguracaoPorcionamento}>
              <Plus className="h-4 w-4" /> Nova configuração
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="rotulo px-2 py-2">Ativa</th>
                  <th className="rotulo px-2 py-2">Nome</th>
                  <th className="rotulo px-2 py-2">Quantidade</th>
                  <th className="rotulo px-2 py-2">Unidade</th>
                  <th className="rotulo px-2 py-2">Porções teóricas</th>
                  <th className="rotulo px-2 py-2">Embalagem</th>
                  <th className="rotulo px-2 py-2">Custo embalagem</th>
                  <th className="rotulo px-2 py-2">Custo por porção</th>
                  <th className="rotulo px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(fichaEditavel.configuracoes_porcionamento ?? []).map((cfg) => {
                  const porcoesTeoricas = cfg.quantidade_por_porcao > 0 ? fichaEditavel.rendimento_quantidade / cfg.quantidade_por_porcao : 0;
                  const custoPorPorcao =
                    custosResumo.porcoesTeoricas > 0 && porcionamentoSelecionado?.id === cfg.id
                      ? custosResumo.custoPorPorcaoCent / 100
                      : porcoesTeoricas > 0
                        ? (custosResumo.custoTotalCent / 100) / porcoesTeoricas
                        : 0;
                  return (
                    <tr key={cfg.id}>
                      <td className="px-2 py-2">
                        <input type="radio" checked={fichaEditavel.porcionamento_ativo_id === cfg.id} onChange={() => atualizarFicha({ porcionamento_ativo_id: cfg.id })} />
                      </td>
                      <td className="px-2 py-2">
                        <input className="campo" value={cfg.nome} onChange={(e) => atualizarConfiguracaoPorcionamento(cfg.id, { nome: e.target.value })} />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min={0.001} step="0.001" className="campo" value={cfg.quantidade_por_porcao} onChange={(e) => atualizarConfiguracaoPorcionamento(cfg.id, { quantidade_por_porcao: Number(e.target.value) })} />
                      </td>
                      <td className="px-2 py-2">
                        <select className="campo" value={cfg.unidade} onChange={(e) => atualizarConfiguracaoPorcionamento(cfg.id, { unidade: e.target.value })}>
                          {db.unidades.map((unidade) => (
                            <option key={unidade.id} value={unidade.id}>{unidade.sigla}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 font-semibold">{qtd(porcoesTeoricas)}</td>
                      <td className="px-2 py-2">
                        <input className="campo" value={cfg.embalagem_nome ?? ""} onChange={(e) => atualizarConfiguracaoPorcionamento(cfg.id, { embalagem_nome: e.target.value })} />
                      </td>
                      <td className="px-2 py-2">
                        <input type="number" min={0} step="1" className="campo" value={cfg.custo_embalagem_centavos ?? 0} onChange={(e) => atualizarConfiguracaoPorcionamento(cfg.id, { custo_embalagem_centavos: Number(e.target.value) })} />
                      </td>
                      <td className="px-2 py-2 font-semibold">{moeda(custoPorPorcao)}</td>
                      <td className="px-2 py-2">
                        <button className="rounded-full p-2 text-red-600 hover:bg-red-50" onClick={() => removerConfiguracaoPorcionamento(cfg.id)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {abaAtiva === "Custos e preços" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard rotulo="Custo ingredientes" valor={moeda(custosResumo.custoIngredientesCent / 100)} cor="amarelo" />
            <StatCard rotulo="Perdas/desperdício" valor={moeda(custosResumo.custoPerdasCent / 100)} cor="vermelho" />
            <StatCard rotulo="Embalagens" valor={moeda(custosResumo.custoEmbalagensCent / 100)} cor="cinza" />
            <StatCard rotulo="Custo total receita" valor={moeda(custosResumo.custoTotalCent / 100)} cor="verde" subtexto={`Custo por porção: ${moeda(custosResumo.custoPorPorcaoCent / 100)}`} />
          </div>

          <Card className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div className="mx-auto flex w-full max-w-[240px] flex-col items-center gap-3">
              <div className="relative h-44 w-44 rounded-full" style={{ background: `conic-gradient(${gradienteRosca || "#e7e5e4 0deg 360deg"})` }}>
                <div className="absolute inset-6 rounded-full bg-superficie" />
              </div>
              <p className="text-center text-sm text-stone-600">Distribuição de custos da ficha</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {blocosGrafico.map((bloco) => (
                <div key={bloco.nome} className="rounded-card border border-stone-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{bloco.nome}</p>
                  <p className="mt-1 text-lg font-bold text-stone-900">{moeda(bloco.valor / 100)}</p>
                </div>
              ))}
              <Campo rotulo="Custo preparação (centavos)">
                <input type="number" min={0} className="campo" value={numeroSeguro(fichaEditavel.custo_preparacao_centavos)} onChange={(e) => atualizarFicha({ custo_preparacao_centavos: Number(e.target.value) })} />
              </Campo>
              <Campo rotulo="Custo cocção (centavos)">
                <input type="number" min={0} className="campo" value={numeroSeguro(fichaEditavel.custo_coccao_centavos)} onChange={(e) => atualizarFicha({ custo_coccao_centavos: Number(e.target.value) })} />
              </Campo>
              <Campo rotulo="Custo montagem (centavos)">
                <input type="number" min={0} className="campo" value={numeroSeguro(fichaEditavel.custo_montagem_centavos)} onChange={(e) => atualizarFicha({ custo_montagem_centavos: Number(e.target.value) })} />
              </Campo>
            </div>
          </Card>

          <Card className="space-y-3">
            <h3 className="text-sm font-semibold text-stone-800">Formação de preço por canal</h3>
            <div className="overflow-x-auto">
              <table className="min-w-[1150px] w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="rotulo px-2 py-2">Canal</th>
                    <th className="rotulo px-2 py-2">Preço praticado</th>
                    <th className="rotulo px-2 py-2">Taxa %</th>
                    <th className="rotulo px-2 py-2">Taxa fixa</th>
                    <th className="rotulo px-2 py-2">Impostos %</th>
                    <th className="rotulo px-2 py-2">Custo total</th>
                    <th className="rotulo px-2 py-2">CMV</th>
                    <th className="rotulo px-2 py-2">Margem R$</th>
                    <th className="rotulo px-2 py-2">Margem %</th>
                    <th className="rotulo px-2 py-2">CMV desejado %</th>
                    <th className="rotulo px-2 py-2">Preço sugerido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {precificacaoPorCanal.map((linha) => (
                    <tr key={linha.canal}>
                      <td className="px-2 py-2 font-semibold">{CANAIS.find((item) => item.canal === linha.canal)?.nome ?? linha.canal}</td>
                      <td className="px-2 py-2"><input type="number" step="0.01" min={0} className="campo" value={linha.preco_praticado} onChange={(e) => atualizarCanal(linha.canal, { preco_praticado: Number(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input type="number" step="0.01" min={0} className="campo" value={linha.taxa_percentual} onChange={(e) => atualizarCanal(linha.canal, { taxa_percentual: Number(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input type="number" step="0.01" min={0} className="campo" value={linha.taxa_fixa} onChange={(e) => atualizarCanal(linha.canal, { taxa_fixa: Number(e.target.value) })} /></td>
                      <td className="px-2 py-2"><input type="number" step="0.01" min={0} className="campo" value={linha.impostos_percentual} onChange={(e) => atualizarCanal(linha.canal, { impostos_percentual: Number(e.target.value) })} /></td>
                      <td className="px-2 py-2 font-semibold">{moeda(linha.custoTotal)}</td>
                      <td className="px-2 py-2 font-semibold">{linha.cmv.toFixed(1)}%</td>
                      <td className="px-2 py-2 font-semibold">{moeda(linha.margemReais)}</td>
                      <td className="px-2 py-2 font-semibold">{linha.margemPercentual.toFixed(1)}%</td>
                      <td className="px-2 py-2"><input type="number" step="0.1" min={1} className="campo" value={linha.cmv_desejado_percentual} onChange={(e) => atualizarCanal(linha.canal, { cmv_desejado_percentual: Number(e.target.value) })} /></td>
                      <td className="px-2 py-2 font-semibold text-primaria-escura">{moeda(linha.precoSugerido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {abaAtiva === "Alergênicos e nutrição" && (
        <Card className="space-y-3">
          <p className="text-sm text-stone-600">
            Utilize esta aba para revisar alergênicos e informações nutricionais da versão. A consolidação automática por ingredientes
            permanece no domínio já aprovado e pode ser usada no fluxo de publicação.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(fichaEditavel.alergenicos).map(([chave, valor]) => {
              if (chave === "outros") return null;
              return (
                <div key={chave} className="rounded-card border border-stone-200 p-3">
                  <p className="rotulo">{chave}</p>
                  <p className="font-semibold">{String(valor)}</p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap justify-between gap-2 text-sm text-stone-600">
          <Link href="/fichas-tecnicas" className="btn-secundario">
            <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo
          </Link>
          <p>CMV e margens recalculam em tempo real conforme ingredientes, rendimento, porções e canais.</p>
        </div>
      </Card>
    </div>
  );
}
