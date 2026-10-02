"use client";

// Camada de dados mock: banco em memória + persistência em localStorage.
// Quando o Supabase for configurado, estas funções serão trocadas por consultas reais
// mantendo as mesmas assinaturas.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Caixa, ContaPagar, ContaPagarHistorico, DB, Produto, StatusContaPagar } from "@/lib/types";
import { seedDB } from "./seed";
import {
  LOCAL_ESTOQUE_SECO,
  LOCAL_GELADEIRA_2,
  produtosReais,
  UNIDADE_FRASCO,
  UNIDADE_ML,
  UNIDADE_PACOTE,
  UNIDADE_PECA,
  UNIDADE_SACO,
} from "./catalogo";
import { aplicarCardapioItalian } from "./italian-cardapio";
import { PRECOS_FRANQUIA_LONDINA_BOX_G } from "./precos-franquia-londrina";
import { aplicarTabelaFranquiaNasFichas } from "../domain/tabela-precos-venda";
import { compararPrioridadeConsumo, saldoDosLotes } from "../domain/estoque";
import { validarPosicaoFisicaBox, validarTipoBox } from "../domain/estoque-boxes";
import { extrairCnpjEmitenteDaChaveAcesso } from "../domain/nfe-parcelas";
import { associarCategoriasProdutos } from "../domain/produtos";
import { desativarProdutosNomeTitulo } from "../domain/produtos-limpeza-nome";
import { garantirEntraNoCmvProdutos } from "../domain/produto-cmv";
import { aplicarSugestaoContaDreProdutos } from "../domain/sugerir-conta-dre-nome";
import { recuperarVinculosLegadosBoletos } from "../domain/recuperacao-boleto-legado";
import { pessoaParaSeedDePerfil } from "../domain/rh";
import { garantirChecklistDocumentos } from "../domain/documentos-pessoa";
import { garantirContasDre, garantirEquipamentos } from "../domain/dre";

const STORAGE_KEY = "compraschef-db-v1";
const BACKUP_KEY = "compraschef-db-v1-backup";

let current: DB = structuredClone(seedDB);
let loaded = false;
/** Só após o 1º paint no cliente — evita hidratação divergir do seed (SSR) vs localStorage. */
let clientePronto = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((cb) => cb());
}

function contarCadastros(db: Pick<DB, "fornecedores" | "produtos">): { fornecedores: number; produtos: number } {
  return {
    fornecedores: db.fornecedores?.length ?? 0,
    produtos: db.produtos?.length ?? 0,
  };
}

/** Evita gravar o seed de demo por cima de um banco real maior. */
function persistenciaPerigosa(prevRaw: string, next: DB): boolean {
  try {
    const prev = JSON.parse(prevRaw) as DB;
    const a = contarCadastros(prev);
    const b = contarCadastros(next);
    const seed = contarCadastros(seedDB);
    // Sumiram vários fornecedores ou muitos produtos de uma vez → bloqueia.
    if (a.fornecedores >= seed.fornecedores + 2 && b.fornecedores <= seed.fornecedores) return true;
    if (a.produtos >= 150 && b.produtos <= seed.produtos + 30 && b.fornecedores <= seed.fornecedores) return true;
    if (a.fornecedores > b.fornecedores + 3) return true;
    return false;
  } catch {
    return false;
  }
}

function persist() {
  try {
    if (typeof localStorage === "undefined") return;
    const prevRaw = localStorage.getItem(STORAGE_KEY);
    if (prevRaw) {
      // Backup rolante do último estado válido antes de sobrescrever.
      try {
        localStorage.setItem(BACKUP_KEY, prevRaw);
      } catch {
        // quota — segue sem backup
      }
      if (persistenciaPerigosa(prevRaw, current)) {
        console.error(
          "[ComprasChef] Persistência bloqueada: gravaria um banco menor (possível perda de fornecedores/produtos)."
        );
        return;
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // sem localStorage (SSR ou navegação privada) — segue só em memória
  }
}

/** Restaura o backup automático do localStorage, se existir. */
export function recuperarBackupDB(): { ok: boolean; mensagem: string } {
  if (typeof window === "undefined") return { ok: false, mensagem: "Indisponível no servidor." };
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return { ok: false, mensagem: "Nenhum backup encontrado neste navegador." };
    const carregado = carregarBancoPersistido(raw);
    current = carregado.db;
    loaded = true;
    clientePronto = true;
    // Grava sem passar pelo bloqueio de “encolher” (é recuperação explícita).
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    emit();
    const c = contarCadastros(current);
    return {
      ok: true,
      mensagem: `Backup restaurado: ${c.fornecedores} fornecedores, ${c.produtos} produtos.`,
    };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : "Falha ao restaurar backup." };
  }
}

export function temBackupDB(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(localStorage.getItem(BACKUP_KEY));
  } catch {
    return false;
  }
}

/** Garante as coleções de fichas técnicas no banco local (retrocompatível e idempotente). */
export function migrarColecoesFichasTecnicas(db: DB): boolean {
  let mudou = false;

  if (!Array.isArray(db.fichas_tecnicas_receitas)) {
    db.fichas_tecnicas_receitas = [];
    mudou = true;
  }

  if (!Array.isArray(db.fichas_tecnicas_versoes)) {
    db.fichas_tecnicas_versoes = [];
    mudou = true;
  }

  if (!Array.isArray(db.ficha_tecnica_custo_snapshots)) {
    db.ficha_tecnica_custo_snapshots = [];
    mudou = true;
  }

  if (!Array.isArray(db.fichas_tecnicas) || db.fichas_tecnicas.length === 0) {
    for (const receita of db.fichas_tecnicas_receitas) {
      if (!receita.tipo) {
        receita.tipo = "prato";
        mudou = true;
      }
    }
    return mudou;
  }

  for (const fichaLegada of db.fichas_tecnicas) {
    const receitaId = fichaLegada.id;
    const codigoReceita = fichaLegada.codigo_externo?.trim() || `FT-${fichaLegada.id}`;

    if (!db.fichas_tecnicas_receitas.some((r) => r.id === receitaId)) {
      db.fichas_tecnicas_receitas.push({
        id: receitaId,
        codigo: codigoReceita,
        nome: fichaLegada.nome,
        descricao: fichaLegada.descricao,
        tipo: "prato",
        versao_vigente_id: fichaLegada.status === "publicada" ? fichaLegada.id : undefined,
        criado_por: "migração-legado",
        atualizado_por: "migração-legado",
        criado_em: fichaLegada.criado_em,
        atualizado_em: fichaLegada.atualizado_em,
      });
      mudou = true;
    }

    const versaoExiste = db.fichas_tecnicas_versoes.some((v) => v.id === fichaLegada.id);
    if (!versaoExiste) {
      db.fichas_tecnicas_versoes.push({
        id: fichaLegada.id,
        receita_id: receitaId,
        numero_versao: fichaLegada.versao,
        status: fichaLegada.status,
        rendimento_total: fichaLegada.rendimento_quantidade,
        unidade_rendimento: fichaLegada.rendimento_unidade_id,
        configuracoes_porcionamento: fichaLegada.porcoes_config?.quantidade_porcoes
          ? [
              {
                id: "config-legado",
                nome: "Porção padrão",
                quantidade_por_porcao:
                  fichaLegada.rendimento_quantidade / fichaLegada.porcoes_config.quantidade_porcoes,
                unidade:
                  fichaLegada.porcoes_config.unidade_porcao_id ?? fichaLegada.rendimento_unidade_id,
                quantidade_porcoes_teorica: fichaLegada.porcoes_config.quantidade_porcoes,
                ativa: true,
              },
            ]
          : [],
        ficha: structuredClone(fichaLegada),
        criado_por: "migração-legado",
        atualizado_por: "migração-legado",
        publicado_por: fichaLegada.status === "publicada" ? "migração-legado" : undefined,
        publicada_em: fichaLegada.status === "publicada" ? fichaLegada.atualizado_em : undefined,
        criado_em: fichaLegada.criado_em,
        atualizado_em: fichaLegada.atualizado_em,
        historico: [
          {
            id: `hist-legado-${fichaLegada.id}`,
            versao_id: fichaLegada.id,
            acao: "criacao",
            responsavel: "migração-legado",
            em: fichaLegada.criado_em,
            detalhes: "Registro importado do formato legado.",
          },
        ],
      });
      mudou = true;
    }
  }

  for (const receita of db.fichas_tecnicas_receitas) {
    if (!receita.tipo) {
      receita.tipo = "prato";
      mudou = true;
    }
  }

  return mudou;
}

/** Acrescenta ao banco salvo itens novos do catálogo (idempotente — nada é sobrescrito). */
export function atualizarComNovidades(db: DB): boolean {
  let mudou = false;

  if (!Array.isArray(db.pessoas)) {
    const agora = new Date().toISOString();
    db.pessoas = (db.perfis ?? []).map((perfil) =>
      pessoaParaSeedDePerfil({
        id: perfil.id,
        nome: perfil.nome,
        papel: perfil.papel,
        agora,
      })
    );
    mudou = true;
  }

  if (!Array.isArray(db.pagamentos_pessoas)) {
    db.pagamentos_pessoas = [];
    mudou = true;
  }

  if (!Array.isArray(db.consumos_pessoas)) {
    db.consumos_pessoas = [];
    mudou = true;
  }

  if (!Array.isArray(db.anotacoes_pessoas)) {
    db.anotacoes_pessoas = [];
    mudou = true;
  } else {
    for (const anotacao of db.anotacoes_pessoas) {
      if (!anotacao.tipo || !["elogio", "aviso", "observacao"].includes(anotacao.tipo)) {
        anotacao.tipo = "observacao";
        mudou = true;
      }
    }
  }

  if (!Array.isArray(db.avaliacoes_pessoas)) {
    db.avaliacoes_pessoas = [];
    mudou = true;
  }

  if (!Array.isArray(db.escala_slots)) {
    db.escala_slots = [];
    mudou = true;
  }

  if (!Array.isArray(db.convocacoes)) {
    db.convocacoes = [];
    mudou = true;
  }

  if (!Array.isArray(db.contas_bancarias)) {
    db.contas_bancarias = [];
    mudou = true;
  }

  if (!Array.isArray(db.extrato_importacoes)) {
    db.extrato_importacoes = [];
    mudou = true;
  }

  if (!Array.isArray(db.extrato_linhas)) {
    db.extrato_linhas = [];
    mudou = true;
  }

  if (!Array.isArray(db.batidas_ponto)) {
    db.batidas_ponto = [];
    mudou = true;
  }

  if (!Array.isArray(db.pendencias_ponto)) {
    db.pendencias_ponto = [];
    mudou = true;
  }

  if (!Array.isArray(db.normas_rh)) {
    db.normas_rh = [];
    mudou = true;
  }

  if (Array.isArray(db.pessoas)) {
    const agoraDocs = new Date().toISOString();
    for (const pessoa of db.pessoas) {
      if (!Array.isArray(pessoa.documentos)) {
        pessoa.documentos = garantirChecklistDocumentos(pessoa, agoraDocs);
        mudou = true;
      }
    }
  }

  if (!db.config_rh) {
    db.config_rh = {
      antecedencia_minima_dias: 3,
      aviso_ponto_horas: 24,
      tolerancia_atraso_minutos: 10,
      atualizado_em: new Date().toISOString(),
    };
    mudou = true;
  } else {
    if (
      typeof db.config_rh.aviso_ponto_horas !== "number" ||
      !Number.isFinite(db.config_rh.aviso_ponto_horas)
    ) {
      db.config_rh.aviso_ponto_horas = 24;
      mudou = true;
    }
    if (
      typeof db.config_rh.antecedencia_minima_dias !== "number" ||
      !Number.isFinite(db.config_rh.antecedencia_minima_dias)
    ) {
      db.config_rh.antecedencia_minima_dias = 3;
      mudou = true;
    }
    if (
      typeof db.config_rh.tolerancia_atraso_minutos !== "number" ||
      !Number.isFinite(db.config_rh.tolerancia_atraso_minutos) ||
      db.config_rh.tolerancia_atraso_minutos < 0
    ) {
      db.config_rh.tolerancia_atraso_minutos = 10;
      mudou = true;
    }
  }


  if (migrarColecoesFichasTecnicas(db)) {
    mudou = true;
  }

  if (!Array.isArray(db.fichas_tecnicas_excluidas_ids)) {
    db.fichas_tecnicas_excluidas_ids = [];
    mudou = true;
  }

  if (!Array.isArray(db.fechamentos_dia)) {
    db.fechamentos_dia = [];
    mudou = true;
  }

  if (garantirContasDre(db)) mudou = true;
  if (garantirEquipamentos(db)) mudou = true;

  {
    const PADROES_TIPO_LOCAL = [
      { id: "tl-freezer", nome: "Freezer", codigo: "freezer", ativo: true },
      { id: "tl-geladeira", nome: "Geladeira", codigo: "geladeira", ativo: true },
      { id: "tl-prateleira", nome: "Prateleira", codigo: "prateleira", ativo: true },
      { id: "tl-despensa", nome: "Despensa", codigo: "despensa", ativo: true },
    ] as const;
    if (!Array.isArray(db.tipos_local)) {
      db.tipos_local = PADROES_TIPO_LOCAL.map((t) => ({ ...t }));
      mudou = true;
    }
    const porCodigo = new Map(db.tipos_local.map((t) => [t.codigo, t]));
    for (const padrao of PADROES_TIPO_LOCAL) {
      if (!porCodigo.has(padrao.codigo)) {
        db.tipos_local.push({ ...padrao });
        porCodigo.set(padrao.codigo, padrao);
        mudou = true;
      }
    }
    for (const local of db.locais ?? []) {
      const codigo = (local.tipo || "").trim();
      if (!codigo) continue;
      if (!porCodigo.has(codigo)) {
        const nome =
          codigo.charAt(0).toUpperCase() + codigo.slice(1).replace(/[-_]/g, " ");
        const novo = { id: uid("tl"), nome, codigo, ativo: true };
        db.tipos_local.push(novo);
        porCodigo.set(codigo, novo);
        mudou = true;
      }
    }
  }

  if (!db.tour_londrina) {
    db.tour_londrina = {
      pratos_elegiveis_ids: [],
      adicionais_padrao: [
        { id: "tour-add-proteina", nome: "Dobrar proteína", preco_venda: 0, custo: 0 },
        { id: "tour-add-sobremesa", nome: "Sobremesa", preco_venda: 0, custo: 0 },
        { id: "tour-add-bebida", nome: "Bebida", preco_venda: 0, custo: 0 },
      ],
    };
    mudou = true;
  }

  // Migração do mock anterior: transforma cada caixa ocupada em um lote canônico,
  // preservando exatamente o saldo que já estava salvo no navegador.
  if (!Array.isArray(db.lotes_estoque)) {
    db.lotes_estoque = db.caixas
      .filter((c) => c.status !== "vazia" && c.produto_id && (c.quantidade ?? 0) > 0)
      .map((c) => ({
        id: `lote-migrado-${c.id}`,
        produto_id: c.produto_id!,
        origem: "manual" as const,
        quantidade_inicial: c.quantidade!,
        quantidade_atual: c.quantidade!,
        data_entrada: c.data_envase ?? c.atualizado_em.slice(0, 10),
        validade: c.validade,
        criado_em: c.atualizado_em,
        atualizado_em: c.atualizado_em,
      }));
    mudou = true;
  }
  for (const lote of db.lotes_estoque) {
    if (!lote.origem) {
      const produto = db.produtos.find((p) => p.id === lote.produto_id);
      lote.origem = lote.recebimento_item_id ? "recebimento" : produto?.tipo === "produzido" ? "producao" : "manual";
      mudou = true;
    }
  }
  if (!Array.isArray(db.alocacoes_caixa)) {
    type LoteLegado = (typeof db.lotes_estoque)[number] & { caixa_id?: string; local_id?: string };
    db.alocacoes_caixa = db.caixas
      .filter((c) => c.status !== "vazia" && c.produto_id && (c.quantidade ?? 0) > 0)
      .map((c) => {
        const legado = db.lotes_estoque.find((l) => (l as LoteLegado).caixa_id === c.id);
        const lote = legado ?? db.lotes_estoque.find(
          (l) => l.produto_id === c.produto_id && l.quantidade_atual === c.quantidade
        );
        return {
          id: `aloc-migrada-${c.id}`,
          lote_id: lote?.id ?? `lote-migrado-${c.id}`,
          caixa_id: c.id,
          quantidade_inicial: c.quantidade!,
          quantidade_atual: c.quantidade!,
          criado_em: c.atualizado_em,
          atualizado_em: c.atualizado_em,
        };
      });
    for (const lote of db.lotes_estoque as LoteLegado[]) {
      delete lote.caixa_id;
      delete lote.local_id;
    }
    mudou = true;
  }
  if (!Array.isArray(db.categorias_produtos)) {
    db.categorias_produtos = [];
    mudou = true;
  }
  if (!Array.isArray(db.produto_codigos_barras)) {
    db.produto_codigos_barras = [];
    for (const produto of db.produtos) {
      if (produto.codigo_barras) {
        db.produto_codigos_barras.push({
          id: uid("pcb"),
          produto_id: produto.id,
          codigo_barras: produto.codigo_barras,
          principal: true,
        });
      }
    }
    mudou = true;
  } else {
    const existente = new Set(db.produto_codigos_barras.map((codigo) => `${codigo.produto_id}|${codigo.codigo_barras}`));
    for (const produto of db.produtos) {
      if (produto.codigo_barras && !existente.has(`${produto.id}|${produto.codigo_barras}`)) {
        db.produto_codigos_barras.push({
          id: uid("pcb"),
          produto_id: produto.id,
          codigo_barras: produto.codigo_barras,
          principal: true,
        });
        mudou = true;
      }
    }
  }
  if (!Array.isArray(db.contas_pagar)) {
    db.contas_pagar = [];
    mudou = true;
  }
  if (!Array.isArray(db.conta_pagar_historico)) {
    db.conta_pagar_historico = [];
    mudou = true;
  }
  if (!Array.isArray(db.documentos_boleto)) {
    db.documentos_boleto = [];
    mudou = true;
  }
  if (!Array.isArray(db.boleto_pagamentos_historico)) {
    db.boleto_pagamentos_historico = [];
    mudou = true;
  }
  if (!Array.isArray(db.movimentos_estoque)) {
    db.movimentos_estoque = [];
    mudou = true;
  }
  if (!Array.isArray(db.balancos)) {
    db.balancos = [];
    mudou = true;
  }
  if (!Array.isArray(db.balanco_itens)) {
    db.balanco_itens = [];
    mudou = true;
  }
  if (!Array.isArray(db.eventos_box_operacional)) {
    db.eventos_box_operacional = [];
    mudou = true;
  }
  if (!Array.isArray(db.precos_historico)) {
    db.precos_historico = [];
    mudou = true;
  }
  if (!Array.isArray(db.integracao_eventos)) {
    db.integracao_eventos = [];
    mudou = true;
  }
  for (const boleto of db.boletos) {
    if (boleto.documento_boleto_id) {
      continue;
    }
    if (!boleto.status_conferencia) {
      boleto.status_conferencia = "aguardando_documento";
      mudou = true;
    }
  }
  const recuperacaoLegado = recuperarVinculosLegadosBoletos(db, {
    responsavelPadrao: "migração legado",
    gerarIdDocumento: () => uid("docbol"),
  });
  if (recuperacaoLegado.alteracoes > 0) {
    mudou = true;
  }
  const boletosPorNota = new Map<string, Array<{ boleto: (typeof db.boletos)[number]; ordemOriginal: number }>>();
  db.boletos.forEach((boleto, indice) => {
    if (!boleto.nota_id) return;
    const grupo = boletosPorNota.get(boleto.nota_id) ?? [];
    grupo.push({ boleto, ordemOriginal: indice });
    boletosPorNota.set(boleto.nota_id, grupo);
  });

  for (const grupo of Array.from(boletosPorNota.values())) {
    const numerosExistentes = new Set<number>();
    for (const { boleto } of grupo) {
      const numeroAtual = boleto.numero_parcela?.trim();
      if (!numeroAtual) continue;
      if (/^\d+$/.test(numeroAtual)) {
        numerosExistentes.add(Number(numeroAtual));
      }
    }

    const semNumero: Array<{ boleto: (typeof db.boletos)[number]; ordemOriginal: number }> = grupo
      .filter(({ boleto }) => !boleto.numero_parcela?.trim())
      .sort((a, b) => {
        const porVencimento = (a.boleto.vencimento || "").localeCompare(b.boleto.vencimento || "");
        if (porVencimento !== 0) return porVencimento;
        return a.ordemOriginal - b.ordemOriginal;
      });

    let proximoNumero = 1;
    for (const { boleto } of semNumero) {
      while (numerosExistentes.has(proximoNumero)) {
        proximoNumero += 1;
      }
      boleto.numero_parcela = String(proximoNumero).padStart(3, "0");
      numerosExistentes.add(proximoNumero);
      proximoNumero += 1;
      mudou = true;
    }
  }

  for (const nota of db.notas_fiscais) {
    if (!Array.isArray(nota.correcoes_fornecedor)) {
      nota.correcoes_fornecedor = [];
      mudou = true;
    }
    if (!nota.cnpj_emitente?.trim()) {
      const cnpjDaChave = extrairCnpjEmitenteDaChaveAcesso(nota.chave_acesso);
      if (cnpjDaChave) {
        nota.cnpj_emitente = cnpjDaChave;
        mudou = true;
      }
    }
  }
  for (const produto of db.produtos) {
    if (produto.controla_lote === undefined) {
      produto.controla_lote = false;
      mudou = true;
    }
    if (produto.controla_validade === undefined) {
      produto.controla_validade = false;
      mudou = true;
    }
  }
  if (garantirEntraNoCmvProdutos(db.produtos, db.contas_dre)) {
    mudou = true;
  }
  if (!db.produtos_sugestao_conta_dre_v1) {
    const sugestao = aplicarSugestaoContaDreProdutos(db, { soSemConta: true });
    if (sugestao.preenchidos > 0) mudou = true;
    db.produtos_sugestao_conta_dre_v1 = true;
    mudou = true;
  }
  for (const caixa of db.caixas) {
    if (!validarTipoBox(caixa.tipo_box as string)) {
      caixa.tipo_box = "NAO_CLASSIFICADO";
      mudou = true;
    }
    if (!validarPosicaoFisicaBox(caixa.posicao_fisica as string)) {
      caixa.posicao_fisica = "NAO_INFORMADA";
      mudou = true;
    }
  }
  for (const unidadePadrao of [UNIDADE_SACO, UNIDADE_PACOTE, UNIDADE_FRASCO, UNIDADE_PECA, UNIDADE_ML]) {
    if (!db.unidades.some((u) => u.id === unidadePadrao.id)) {
      db.unidades.push({ ...unidadePadrao });
      mudou = true;
    }
  }
  if (!Array.isArray(db.fornecedor_produtos)) {
    db.fornecedor_produtos = [];
    mudou = true;
  }
  if (!db.locais.some((l) => l.id === LOCAL_ESTOQUE_SECO.id)) {
    db.locais.push({ ...LOCAL_ESTOQUE_SECO });
    mudou = true;
  }
  const jaTemGeladeira2 = db.locais.some(
    (l) => l.id === LOCAL_GELADEIRA_2.id || l.nome.trim().toLocaleLowerCase("pt-BR") === "geladeira 2"
  );
  if (!jaTemGeladeira2) {
    db.locais.push({ ...LOCAL_GELADEIRA_2 });
    mudou = true;
  }
  for (const produto of produtosReais()) {
    if (!db.produtos.some((p) => p.id === produto.id)) {
      db.produtos.push(produto);
      mudou = true;
    }
  }
  const categoriasAssociadas = associarCategoriasProdutos(db);
  if (categoriasAssociadas.categorias.length > 0) {
    mudou = true;
  }
  // Notas de demonstração que ganharam itens importados/origem depois de salvas:
  // completa nas cópias antigas sem tocar no resto dos dados do usuário.
  for (const semente of seedDB.notas_fiscais) {
    if (!semente.itens_importados) continue;
    const existente = db.notas_fiscais.find((n) => n.id === semente.id);
    if (existente && !existente.itens_importados) {
      existente.itens_importados = semente.itens_importados;
      existente.origem = semente.origem;
      mudou = true;
    }
  }

  // Fornecedores novos do seed (ex.: ADG) — injeta em DBs já persistidos sem sobrescrever.
  for (const semente of seedDB.fornecedores) {
    const cnpjSemente = (semente.cnpj ?? "").replace(/\D/g, "");
    const jaTem = db.fornecedores.some((f) => {
      if (f.id === semente.id) return true;
      const cnpj = (f.cnpj ?? "").replace(/\D/g, "");
      return cnpjSemente.length === 14 && cnpj === cnpjSemente;
    });
    if (!jaTem) {
      db.fornecedores.push(structuredClone(semente));
      mudou = true;
    }
  }
  // Não reinsere NF/boleto de demonstração: se o usuário limpou, permanece vazio.

  if (aplicarCardapioItalian(db)) {
    mudou = true;
  }

  // Fornecedores sem campo `ativo` sumiam da lista (filtro truthy). Corrige legado.
  for (const fornecedor of db.fornecedores ?? []) {
    if (fornecedor.ativo === undefined) {
      fornecedor.ativo = true;
      mudou = true;
    }
  }

  // Reaplica limpeza: Title Case / minúsculas saem; CAIXA ALTA da NF permanece.
  // (Corrige a restauração indevida da v1; não toca fornecedores.)
  if (!db.produtos_limpeza_nome_titulo_v3) {
    desativarProdutosNomeTitulo(db);
    db.produtos_limpeza_nome_titulo_v1 = true;
    db.produtos_limpeza_nome_titulo_v2 = true;
    db.produtos_limpeza_nome_titulo_v3 = true;
    db.produtos_restauracao_nome_titulo_v1 = true;
    mudou = true;
  }

  // Preenche preço de venda (Loja/iFood) da planilha Londrina só onde ainda estiver vazio.
  if (aplicarTabelaFranquiaNasFichas(db, PRECOS_FRANQUIA_LONDINA_BOX_G, { somenteVazios: true }) > 0) {
    mudou = true;
  }

  return mudou;
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined" || !clientePronto) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const carregado = carregarBancoPersistido(raw);
      current = carregado.db;
      if (carregado.migrado) {
        persist();
      }
      emit();
      return;
    }
  } catch (erro) {
    console.error("[ComprasChef] Falha ao carregar banco do localStorage:", erro);
    // Nunca sobrescreve o LS com seed aqui — tenta backup primeiro.
    try {
      const backup = localStorage.getItem(BACKUP_KEY);
      if (backup) {
        current = carregarBancoPersistido(backup).db;
        emit();
        return;
      }
    } catch {
      // ignora
    }
    current = structuredClone(seedDB);
    emit();
    return;
  }
}

function liberarClienteECarregar() {
  if (typeof window === "undefined") return;
  const jaPronto = clientePronto;
  clientePronto = true;
  ensureLoaded();
  // Se o LS já tinha sido carregado noutro caminho, ainda assim notifica após o mount.
  if (jaPronto) return;
  emit();
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getDB(): DB {
  if (typeof window === "undefined" || !clientePronto) {
    // Mesma base do SSR / 1ª pintura — evita mismatch de hidratação.
    return seedDB;
  }
  ensureLoaded();
  return current;
}

export function carregarBancoPersistido(raw: string): { db: DB; migrado: boolean } {
  const db = JSON.parse(raw) as DB;
  const migrado = atualizarComNovidades(db);
  return { db, migrado };
}

export function sincronizarDBLocalSalvo(): DB {
  if (typeof window === "undefined") return current;
  clientePronto = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return current;
    current = carregarBancoPersistido(raw).db;
    loaded = true;
    emit();
  } catch {
    return current;
  }
  return current;
}

/** Substitui o banco por completo em uma única gravação (persist + notificação). */
export function substituirDB(next: DB): DB {
  liberarClienteECarregar();
  current = next;
  persist();
  emit();
  return current;
}

/** Aplica uma mutação ao banco (clona, altera, persiste e notifica). */
export function mutate(fn: (db: DB) => void): DB {
  liberarClienteECarregar();
  const next = structuredClone(current);
  fn(next);
  current = next;
  persist();
  emit();
  return current;
}

/**
 * Zera notas fiscais, boletos, documentos de boleto e histórico de pagamento.
 * Estoque, cadastros e caixa de entrada não são alterados.
 */
export function limparNotasEBoletos(): { notas: number; boletos: number; documentos: number } {
  liberarClienteECarregar();
  const notas = current.notas_fiscais?.length ?? 0;
  const boletos = current.boletos?.length ?? 0;
  const documentos = current.documentos_boleto?.length ?? 0;

  mutate((db) => {
    db.notas_fiscais = [];
    db.boletos = [];
    db.documentos_boleto = [];
    db.boleto_pagamentos_historico = [];
  });

  if (typeof indexedDB !== "undefined") {
    try {
      indexedDB.deleteDatabase("compraschef-documentos-boleto");
    } catch {
      // ignore
    }
  }

  return { notas, boletos, documentos };
}

export function calcularValorFinal(valorOriginal: number, juros = 0, desconto = 0): number {
  return Number((valorOriginal + (juros || 0) - (desconto || 0)).toFixed(2));
}

export function criarContaManual(db: DB, conta: Omit<ContaPagar, "id" | "criado_em" | "atualizado_em" | "valor_final">): ContaPagar {
  const criadoEm = new Date().toISOString();
  const novaConta: ContaPagar = {
    ...conta,
    id: uid("cp"),
    valor_final: calcularValorFinal(conta.valor_original, conta.juros, conta.desconto),
    criado_em: criadoEm,
    atualizado_em: criadoEm,
  };
  db.contas_pagar.push(novaConta);
  db.conta_pagar_historico.push({
    id: uid("cph"),
    conta_pagar_id: novaConta.id,
    acao: "Conta criada manualmente",
    status_anterior: null,
    status_novo: novaConta.status,
    data: criadoEm,
    responsavel: "usuário local",
  });
  return novaConta;
}

export function registrarHistorico(db: DB, contaPagarId: string, acao: string, statusAnterior: StatusContaPagar | null, statusNovo: StatusContaPagar, observacao?: string) {
  db.conta_pagar_historico.push({
    id: uid("cph"),
    conta_pagar_id: contaPagarId,
    acao,
    status_anterior: statusAnterior,
    status_novo: statusNovo,
    data: new Date().toISOString(),
    responsavel: "usuário local",
    observacao,
  });
}

export function alterarStatusConta(db: DB, contaPagarId: string, status: StatusContaPagar, observacao?: string): ContaPagar | undefined {
  const conta = db.contas_pagar.find((c) => c.id === contaPagarId);
  if (!conta) return undefined;
  const statusAnterior = conta.status;
  conta.status = status;
  conta.observacoes = observacao ?? conta.observacoes;
  conta.atualizado_em = new Date().toISOString();
  registrarHistorico(db, conta.id, `Status alterado para ${status}`, statusAnterior, status, observacao);
  return conta;
}

export function informarPagamento(db: DB, contaPagarId: string, observacao?: string): ContaPagar | undefined {
  return alterarStatusConta(db, contaPagarId, "aguardando_conciliacao", observacao ?? "Pagamento informado e aguardando conciliação");
}

/** Volta o banco aos dados de demonstração originais. */
export function resetDB() {
  current = structuredClone(seedDB);
  persist();
  emit();
}

let seq = 0;
export function uid(prefixo: string): string {
  seq += 1;
  return `${prefixo}-${Date.now().toString(36)}-${seq}`;
}

/**
 * Hook reativo: re-renderiza quando o banco muda.
 * Até o 1º mount no cliente devolve o seed (igual ao SSR), e só então
 * carrega o localStorage — evita hydration mismatch em navegações SPA.
 */
export function useDB(): DB {
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    liberarClienteECarregar();
    setMontado(true);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => {
      if (!montado) return seedDB;
      ensureLoaded();
      return current;
    },
    () => seedDB
  );
}

// ---------- Helpers de domínio ----------

/** Estoque atual de um produto (soma dos lotes, alocados ou ainda pendentes), na unidade de uso. */
export function estoqueAtual(db: DB, produtoId: string): number {
  return saldoDosLotes(db, produtoId);
}

/** Produtos com estoque abaixo do mínimo. */
export function produtosAbaixoDoMinimo(db: DB): { produto: Produto; estoque: number }[] {
  return db.produtos
    .filter((p) => p.ativo && p.estoque_minimo > 0)
    .map((produto) => ({ produto, estoque: estoqueAtual(db, produto.id) }))
    .filter(({ produto, estoque }) => estoque < produto.estoque_minimo);
}

/** Caixa que deve ser usada primeiro: menor validade (FEFO), depois preparo/entrada mais antigo (FIFO). */
export function caixaFifo(db: DB, produtoId: string): Caixa | undefined {
  return db.caixas
    .filter(
      (c) =>
        c.produto_id === produtoId &&
        c.status !== "vazia" &&
        (c.quantidade ?? 0) > 0 &&
        c.tipo_box !== "QUARENTENA"
    )
    .sort(compararPrioridadeConsumo)[0];
}

/** Caixas com validade nos próximos `dias` dias (inclui vencidas). */
export function caixasVencendo(db: DB, dias: number): Caixa[] {
  const limite = new Date();
  limite.setDate(limite.getDate() + dias);
  const limiteISO = limite.toISOString().slice(0, 10);
  return db.caixas
    .filter((c) => c.status !== "vazia" && c.validade && c.validade <= limiteISO)
    .sort((a, b) => (a.validade ?? "").localeCompare(b.validade ?? ""));
}

/** Consumo médio diário de um produto (baixas dos últimos 30 dias). */
export function consumoMedioDiario(db: DB, produtoId: string): number {
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 30);
  const inicioISO = inicio.toISOString();
  const baixas = db.movimentos_estoque.filter(
    (m) => m.produto_id === produtoId && m.criado_em >= inicioISO && (m.tipo === "baixa" || m.tipo === "perda")
  );
  const total = baixas.reduce((soma, m) => soma + Math.abs(m.quantidade), 0);
  return total / 30;
}

/** Preço médio histórico de um produto (para detectar preço fora do padrão). */
export function precoMedioHistorico(db: DB, produtoId: string): number | undefined {
  const precos = db.precos_historico.filter((p) => p.produto_id === produtoId);
  if (precos.length === 0) return undefined;
  return precos.reduce((s, p) => s + p.preco, 0) / precos.length;
}

/** Um preço está "fora do padrão" se estiver 15%+ acima da média histórica. */
export function precoForaDoPadrao(db: DB, produtoId: string, preco: number): boolean {
  const media = precoMedioHistorico(db, produtoId);
  if (media === undefined) return false;
  return preco > media * 1.15;
}

// ---------- Lookups simples ----------

export function nomeProduto(db: DB, id?: string): string {
  return db.produtos.find((p) => p.id === id)?.nome ?? "—";
}

export function nomeFornecedor(db: DB, id?: string): string {
  return db.fornecedores.find((f) => f.id === id)?.nome ?? "—";
}

export function siglaUnidadeUso(db: DB, produtoId?: string): string {
  const produto = db.produtos.find((p) => p.id === produtoId);
  return db.unidades.find((u) => u.id === produto?.unidade_uso_id)?.sigla ?? "";
}

/** Sigla de um item de lista/cotação/pedido: usa a unidade trocada no item, senão a do produto. */
export function siglaParaItem(db: DB, produtoId?: string, unidadeId?: string): string {
  if (unidadeId) return db.unidades.find((u) => u.id === unidadeId)?.sigla ?? "";
  return siglaUnidadeUso(db, produtoId);
}

export function nomeLocal(db: DB, id?: string): string {
  return db.locais.find((l) => l.id === id)?.nome ?? "sem local";
}

export function nomePerfil(db: DB, id?: string): string {
  return db.perfis.find((p) => p.id === id)?.nome ?? "—";
}
