"use client";

// Recebimento pela NOTA FISCAL (XML da NF-e):
// importa o arquivo → o sistema lê fornecedor, itens e boletos → o operador
// toca ✓ Confirmar ou ✗ Recusar em cada item → entrada no estoque, nota no
// financeiro (boletos liberados se tudo OK) e vínculo com o pedido do fornecedor.

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, CircleCheck, CircleX, FileUp, FlaskConical, PackagePlus, ReceiptText } from "lucide-react";
import { Badge, Campo, Card, Modal, Vazio } from "@/components/ui";
import CampoQuantidade from "@/components/operacao/CampoQuantidade";
import CodeScanner from "@/components/scanner/CodeScanner";
import { estoqueAtual, mutate, nomeFornecedor, uid } from "@/lib/data";
import { enviarEstoqueTotal } from "@/lib/integracao";
import {
  converterParaUnidadeUso,
  codigoDeBarrasValido,
  identificarProduto,
  precoPorUnidadeUso,
  registrarVinculoDaNota,
  unidadePorSigla,
} from "@/lib/domain/produtos";
import {
  localizarNotaFiscalPorChave,
  normalizarDuplicatasLidas,
  registrarNotaEParcelasIdempotente,
} from "@/lib/domain/nfe-parcelas";
import { avaliarCompletudeNfeEntrada } from "@/lib/domain/nfe-completude";
import { criarLote } from "@/lib/domain/estoque";
import { moeda, dataBR, qtd } from "@/lib/format";
import type { DB, DuplicataNotaTemporaria, Fornecedor, StatusRecebimento } from "@/lib/types";

interface ItemNota {
  indice: number;
  cProd: string;
  cEAN: string;
  xProd: string;
  uCom: string;
  qCom: number;
  vUnCom: number;
}

interface NotaLida {
  emitCnpj: string;
  emitNome: string;
  numero: string;
  chave: string;
  valorTotal: number;
  duplicatas: DuplicataNotaTemporaria[];
  itens: ItemNota[];
}

interface DecisaoItem {
  decisao: "pendente" | "confirmado" | "recusado";
  quantidade: number;
  validade: string;
  produtoId: string; // "" = não reconhecido / ignorar
}

interface CadastroProdutoNota {
  indice: number;
  nome: string;
  codigoExterno: string;
  categoriaId?: string;
  categoria: string;
  codigoBarras: string;
  unidadeCompraId: string;
  unidadeUsoId: string;
  fatorConversao: number | "";
  estoqueMinimo: number | "";
  validadePadraoDias: number | "";
  controla_lote?: boolean;
  controla_validade?: boolean;
  ncm?: string;
  cest?: string;
  origemMercadoria?: string;
  cfopPadrao?: string;
  pontoPedido?: number | "";
  estoqueMaximo?: number | "";
  consumoMedioMensal?: number | "";
}

export interface ResultadoNota {
  status: StatusRecebimento;
  fornecedorNome: string;
  boletos: number;
  boletosLiberados: number;
  vinculouPedido: boolean;
}

function somenteDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

function formatarCnpj(valor: string): string {
  const n = somenteDigitos(valor).slice(0, 14);
  if (n.length !== 14) return valor;
  return n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function diasAte(data?: string): number | undefined {
  if (!data) return undefined;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const vencimento = new Date(`${data}T00:00:00`);
  const dias = Math.round((vencimento.getTime() - hoje.getTime()) / 86_400_000);
  return Number.isFinite(dias) && dias >= 0 ? dias : undefined;
}

function hojeMais(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Lê o XML da NF-e no navegador (DOMParser) e extrai o essencial. */
function lerNFe(xmlTexto: string): NotaLida | null {
  try {
    const doc = new DOMParser().parseFromString(xmlTexto, "text/xml");
    if (doc.querySelector("parsererror")) return null;
    const texto = (seletor: string, base: Element | Document = doc) =>
      base.querySelector(seletor)?.textContent?.trim() ?? "";

    const emit = doc.querySelector("emit");
    if (!emit) return null;

    const infNFe = doc.querySelector("infNFe");
    const chave = (infNFe?.getAttribute("Id") ?? "").replace(/^NFe/, "");

    const itens: ItemNota[] = Array.from(doc.querySelectorAll("det")).map((det, indice) => ({
      indice,
      cProd: texto("prod > cProd", det),
      cEAN: texto("prod > cEAN", det),
      xProd: texto("prod > xProd", det),
      uCom: texto("prod > uCom", det),
      qCom: Number(texto("prod > qCom", det)) || 0,
      vUnCom: Number(texto("prod > vUnCom", det)) || 0,
    }));
    if (itens.length === 0) return null;

    const duplicatas = normalizarDuplicatasLidas(
      Array.from(doc.querySelectorAll("dup")).map((dup) => ({
        numero_parcela: texto("nDup", dup) || undefined,
        vencimento: texto("dVenc", dup),
        valor: Number(texto("vDup", dup)) || 0,
      }))
    );

    return {
      emitCnpj: texto("CNPJ", emit),
      emitNome: texto("xNome", emit),
      numero: texto("ide > nNF"),
      chave,
      valorTotal: Number(texto("ICMSTot > vNF")) || 0,
      duplicatas,
      itens,
    };
  } catch {
    return null;
  }
}

/** Identifica sem confundir o cProd do fornecedor com o código do EaseEat. */
function casarProduto(db: DB, item: ItemNota, fornecedorId?: string): string {
  return identificarProduto(db, {
    fornecedorId,
    codigoFornecedor: item.cProd,
    ean: item.cEAN,
    nome: item.xProd,
  }).produto?.id ?? "";
}

// Nota de demonstração: Frigorífico Boi Feliz entregando o filé mignon do pedido em aberto
const XML_EXEMPLO = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc><NFe><infNFe Id="NFe35260723456789000101550010000129051000129051">
<ide><nNF>12905</nNF></ide>
<emit><CNPJ>23456789000101</CNPJ><xNome>FRIGORIFICO BOI FELIZ LTDA</xNome></emit>
<det nItem="1"><prod><cProd>FBF-0101</cProd><cEAN>7891000200201</cEAN>
<xProd>FILE MIGNON BOVINO RESFRIADO KG</xProd><uCom>KG</uCom><qCom>20.000</qCom><vUnCom>62.00</vUnCom></prod></det>
<total><ICMSTot><vNF>1240.00</vNF></ICMSTot></total>
<cobr><dup><nDup>001</nDup><dVenc>${hojeMais(28)}</dVenc><vDup>1240.00</vDup></dup></cobr>
</infNFe></NFe></nfeProc>`;

/** Converte uma nota já importada (Receita) para o formato de leitura + decisões iniciais. */
function daNotaImportada(db: DB, notaId: string): {
  lida: NotaLida;
  decisoes: Record<number, DecisaoItem>;
  semDuplicatasConfirmado: boolean;
} | null {
  const nf = db.notas_fiscais.find((n) => n.id === notaId);
  if (!nf || !nf.itens_importados) return null;
  const forn = db.fornecedores.find((f) => f.id === nf.fornecedor_id);
  const duplicatas = db.boletos
    .filter((boleto) => boleto.nota_id === nf.id)
    .map((boleto) => ({
      numero_parcela: boleto.numero_parcela,
      vencimento: boleto.vencimento,
      valor: boleto.valor,
    }));
  const itens: ItemNota[] = nf.itens_importados.map((it, indice) => ({
    indice,
    cProd: it.codigo ?? "",
    cEAN: it.ean ?? "",
    xProd: it.descricao,
    uCom: it.unidade,
    qCom: it.quantidade,
    vUnCom: it.preco_unitario,
  }));
  const lida: NotaLida = {
    emitCnpj: nf.cnpj_emitente ?? (forn ? somenteDigitos(forn.cnpj) : ""),
    emitNome: nf.razao_social_emitente ?? "",
    numero: nf.numero,
    chave: nf.chave_acesso,
    valorTotal: nf.valor_total,
    duplicatas,
    itens,
  };
  const decisoes: Record<number, DecisaoItem> = {};
  for (const item of itens) {
    const produtoId = casarProduto(db, item, nf.fornecedor_id);
    const produto = db.produtos.find((p) => p.id === produtoId);
    decisoes[item.indice] = {
      decisao: "pendente",
      quantidade: item.qCom,
      validade: hojeMais(produto?.validade_padrao_dias ?? 30),
      produtoId,
    };
  }
  return {
    lida,
    decisoes,
    semDuplicatasConfirmado: Boolean(nf.sem_duplicatas_confirmado_em && nf.sem_duplicatas_confirmado_por),
  };
}

export default function ReceberPorNota({
  db,
  usuarioId,
  notaImportadaId,
  arquivoInicial,
  onVoltar,
  aoFinalizar,
}: {
  db: DB;
  usuarioId: string;
  /** Quando vem de uma DANFE já baixada da Receita: pula o upload e usa os itens da nota. */
  notaImportadaId?: string;
  /** XML já escolhido na triagem de lote. */
  arquivoInicial?: File | null;
  onVoltar: () => void;
  aoFinalizar: (resultado: ResultadoNota) => void;
}) {
  const inicial = notaImportadaId ? daNotaImportada(db, notaImportadaId) : null;
  const [nota, setNota] = useState<NotaLida | null>(inicial?.lida ?? null);
  const [decisoes, setDecisoes] = useState<Record<number, DecisaoItem>>(inicial?.decisoes ?? {});
  const [erro, setErro] = useState<string | null>(null);
  const [alertaCompletude, setAlertaCompletude] = useState<string | null>(null);
  const [fornecedorForm, setFornecedorForm] = useState<Fornecedor | null>(null);
  const [produtoForm, setProdutoForm] = useState<CadastroProdutoNota | null>(null);
  const [confirmacaoSemDuplicatas, setConfirmacaoSemDuplicatas] = useState<boolean>(inicial?.semDuplicatasConfirmado ?? false);
  const router = useRouter();

  const fornecedor = nota
    ? db.fornecedores.find((f) => somenteDigitos(f.cnpj) === somenteDigitos(nota.emitCnpj))
    : undefined;

  useEffect(() => {
    if (!arquivoInicial || notaImportadaId) return;
    void arquivoInicial.text().then((texto) => carregarNota(texto));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carrega só o arquivo inicial do lote
  }, [arquivoInicial, notaImportadaId]);

  function carregarNota(xmlTexto: string) {
    const lida = lerNFe(xmlTexto);
    if (!lida) {
      setErro("Não consegui ler este arquivo — confira se é o XML da NF-e (não o PDF/DANFE).");
      return;
    }
    const jaExiste = lida.chave && db.notas_fiscais.some((n) => n.chave_acesso === lida.chave);
    if (jaExiste) {
      setErro(`A nota ${lida.numero} já foi importada antes — confira no Financeiro.`);
      return;
    }
    setErro(null);
    setAlertaCompletude(null);
    setConfirmacaoSemDuplicatas(false);
    const iniciais: Record<number, DecisaoItem> = {};
    const fornecedorLido = db.fornecedores.find(
      (f) => somenteDigitos(f.cnpj) === somenteDigitos(lida.emitCnpj)
    );
    for (const item of lida.itens) {
      const produtoId = casarProduto(db, item, fornecedorLido?.id);
      const produto = db.produtos.find((p) => p.id === produtoId);
      iniciais[item.indice] = {
        decisao: "pendente",
        quantidade: item.qCom,
        validade: hojeMais(produto?.validade_padrao_dias ?? 30),
        produtoId,
      };
    }
    setDecisoes(iniciais);
    setNota(lida);
  }

  async function aoEscolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    carregarNota(await arquivo.text());
  }

  function alterar(indice: number, mudanca: Partial<DecisaoItem>) {
    setDecisoes((atual) => ({ ...atual, [indice]: { ...atual[indice], ...mudanca } }));
  }

  function abrirCadastroFornecedor() {
    if (!nota) return;
    setFornecedorForm({
      id: "",
      nome: nota.emitNome,
      cnpj: formatarCnpj(nota.emitCnpj),
      forma_pagamento: "boleto",
      prazo_boleto_dias: diasAte(nota.duplicatas[0]?.vencimento),
      ativo: true,
    });
  }

  function salvarFornecedor(e: FormEvent) {
    e.preventDefault();
    if (!nota || !fornecedorForm) return;
    const fornecedorId = uid("forn");
    const agora = new Date().toISOString();
    mutate((d) => {
      d.fornecedores.push({ ...fornecedorForm, id: fornecedorId });
      for (const item of nota.itens) {
        const produtoId = decisoes[item.indice]?.produtoId;
        if (!produtoId) continue;
        const unidadeOrigem = unidadePorSigla(d, item.uCom);
        const produto = d.produtos.find((p) => p.id === produtoId);
        registrarVinculoDaNota(d, {
          idNovo: uid("fp"),
          fornecedorId,
          produtoId,
          codigoFornecedor: item.cProd,
          ean: item.cEAN,
          unidadeCompraId: unidadeOrigem?.id,
          fatorConversao:
            produto && produto.unidade_compra_id === unidadeOrigem?.id ? produto.fator_conversao : undefined,
          ultimoPreco: item.vUnCom,
          atualizadoEm: agora,
        });
      }
    });
    setFornecedorForm(null);
  }

  function abrirCadastroProduto(item: ItemNota) {
    const unidadeXml = unidadePorSigla(db, item.uCom);
    const unidadePadrao = unidadeXml?.id ?? db.unidades[0]?.id ?? "";
    const categorias = Array.isArray(db.categorias_produtos) ? db.categorias_produtos : [];
    const categoriaPadrao = categorias.find((c) => c.codigo === "sem-categoria")?.id;
    setProdutoForm({
      indice: item.indice,
      nome: item.xProd,
      codigoExterno: "",
      categoriaId: categoriaPadrao,
      categoria: "",
      codigoBarras: codigoDeBarrasValido(item.cEAN) ?? "",
      unidadeCompraId: unidadePadrao,
      unidadeUsoId: unidadePadrao,
      fatorConversao: 1,
      estoqueMinimo: 0,
      validadePadraoDias: 30,
      controla_lote: false,
      controla_validade: false,
      ncm: undefined,
      cest: undefined,
      origemMercadoria: undefined,
      cfopPadrao: undefined,
      pontoPedido: "",
      estoqueMaximo: "",
      consumoMedioMensal: "",
    });
  }

  function salvarProdutoInterno(): string | undefined {
    if (!nota || !produtoForm) return undefined;
    const item = nota.itens.find((i) => i.indice === produtoForm.indice);
    if (!item) return undefined;
    const produtoId = uid("prod");
    const agora = new Date().toISOString();
    const fatorConversao = typeof produtoForm.fatorConversao === "number" ? produtoForm.fatorConversao : 0;
    const estoqueMinimo = typeof produtoForm.estoqueMinimo === "number" ? produtoForm.estoqueMinimo : 0;
    const validadePadraoDias = typeof produtoForm.validadePadraoDias === "number" ? produtoForm.validadePadraoDias : 0;
    mutate((d) => {
      d.produtos.push({
        id: produtoId,
        codigo_externo: produtoForm.codigoExterno.trim() || undefined,
        nome: produtoForm.nome.trim(),
        categoria: undefined,
        categoria_id: produtoForm.categoriaId || undefined,
        tipo: "comprado",
        unidade_compra_id: produtoForm.unidadeCompraId || undefined,
        unidade_uso_id: produtoForm.unidadeUsoId,
        fator_conversao: fatorConversao,
        codigo_barras: produtoForm.codigoBarras.trim() || undefined,
        estoque_minimo: estoqueMinimo,
        validade_padrao_dias: validadePadraoDias,
        controla_lote: produtoForm.controla_lote,
        controla_validade: produtoForm.controla_validade,
        ncm: produtoForm.ncm?.trim() || undefined,
        cest: produtoForm.cest?.trim() || undefined,
        origem_mercadoria: produtoForm.origemMercadoria?.trim() || undefined,
        cfop_padrao: produtoForm.cfopPadrao?.trim() || undefined,
        ponto_pedido: typeof produtoForm.pontoPedido === "number" ? produtoForm.pontoPedido : undefined,
        estoque_maximo: typeof produtoForm.estoqueMaximo === "number" ? produtoForm.estoqueMaximo : undefined,
        consumo_medio_mensal:
          typeof produtoForm.consumoMedioMensal === "number" ? produtoForm.consumoMedioMensal : undefined,
        ativo: true,
      });
      if (!Array.isArray(d.produto_codigos_barras)) {
        d.produto_codigos_barras = [];
      }
      if (produtoForm.codigoBarras.trim()) {
        d.produto_codigos_barras.push({
          id: uid("pcb"),
          produto_id: produtoId,
          codigo_barras: produtoForm.codigoBarras.trim(),
          principal: true,
        });
      }
      const fornecedorAtual = d.fornecedores.find(
        (f) => somenteDigitos(f.cnpj) === somenteDigitos(nota.emitCnpj)
      );
      if (fornecedorAtual) {
        registrarVinculoDaNota(d, {
          idNovo: uid("fp"),
          fornecedorId: fornecedorAtual.id,
          produtoId,
          codigoFornecedor: item.cProd,
          ean: item.cEAN,
          unidadeCompraId: produtoForm.unidadeCompraId || undefined,
          fatorConversao,
          ultimoPreco: item.vUnCom,
          atualizadoEm: agora,
        });
      }
    });
    alterar(item.indice, {
      produtoId,
      validade: hojeMais(validadePadraoDias),
      decisao: "pendente",
    });
    setProdutoForm(null);
    return produtoId;
  }

  function salvarProduto(e: FormEvent) {
    e.preventDefault();
    if (!nota || !produtoForm) return;
    const form = e.currentTarget as HTMLFormElement;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    salvarProdutoInterno();
  }

  function salvarECompletarCadastro() {
    if (!nota || !produtoForm) return;
    if (
      !produtoForm.nome.trim() ||
      !produtoForm.unidadeCompraId ||
      !produtoForm.unidadeUsoId ||
      produtoForm.fatorConversao === "" ||
      produtoForm.estoqueMinimo === "" ||
      produtoForm.validadePadraoDias === ""
    ) {
      return;
    }
    const produtoId = salvarProdutoInterno();
    if (produtoId) {
      router.push(`/cadastros?aba=produtos&produtoId=${produtoId}`);
    }
  }

  function finalizar() {
    if (!nota) return;

    if (!notaImportadaId) {
      const existente = localizarNotaFiscalPorChave(db, nota.chave || "");
      if (existente) {
        setErro("NF-e já importada");
        return;
      }
    }

    const agora = new Date().toISOString();
    const hoje = agora.slice(0, 10);

    const completude = avaliarCompletudeNfeEntrada(db, {
      nota_id: notaImportadaId ?? "nfe-em-recebimento",
      fornecedor_id: fornecedor?.id,
      chave_acesso: nota.chave,
      cnpj_emitente: nota.emitCnpj,
      valor_total: nota.valorTotal,
      parcelas: nota.duplicatas,
      sem_duplicatas_confirmado_em: nota.duplicatas.length === 0 && confirmacaoSemDuplicatas ? agora : undefined,
      sem_duplicatas_confirmado_por: nota.duplicatas.length === 0 && confirmacaoSemDuplicatas ? "usuário local" : undefined,
    });

    if (!completude.completa) {
      setErro(completude.pendencias.map((pendencia) => pendencia.mensagem).join(" "));
      return;
    }
    setErro(null);
    setAlertaCompletude(completude.alertas[0] ?? null);

    const confirmados = nota.itens.filter((i) => decisoes[i.indice]?.decisao === "confirmado");
    const recusados = nota.itens.filter((i) => decisoes[i.indice]?.decisao === "recusado");
    const houveAjusteQtd = confirmados.some((i) => decisoes[i.indice].quantidade !== i.qCom);
    const status: StatusRecebimento =
      recusados.length > 0 ? "divergente" : houveAjusteQtd ? "parcial" : "ok";
    const tudoOk = status === "ok";

    // Pedido em aberto do mesmo fornecedor (para vincular a entrega)
    const pedido = fornecedor
      ? db.pedidos.find(
          (p) => p.fornecedor_id === fornecedor.id && (p.status === "enviado" || p.status === "confirmado")
        )
      : undefined;

    const notaId = notaImportadaId ?? uid("nf");
    const recebimentoId = uid("rec");
    let boletosLiberados = 0;
    let falhaImportacao: string | null = null;

    const dbNovo = mutate((d) => {
      if (notaImportadaId) {
        // Nota já existe (baixada da Receita): só atualiza o status e libera os boletos.
        const nf = d.notas_fiscais.find((n) => n.id === notaImportadaId);
        if (nf) {
          nf.status = tudoOk ? "conferida" : "divergente";
          if (nota.emitCnpj?.trim()) {
            nf.cnpj_emitente = nota.emitCnpj.trim();
          }
          if (nota.emitNome?.trim()) {
            nf.razao_social_emitente = nota.emitNome.trim();
          }
          if (nota.duplicatas.length === 0 && confirmacaoSemDuplicatas) {
            nf.sem_duplicatas_confirmado_em = agora;
            nf.sem_duplicatas_confirmado_por = "usuário local";
          }
        }
        d.boletos.forEach((b) => {
          if (b.nota_id !== notaImportadaId || b.status !== "travado") return;
          if (tudoOk) {
            b.status = "liberado";
            b.observacao = "Liberado após conferência OK da mercadoria";
            boletosLiberados += 1;
          } else {
            b.observacao = "Divergência no recebimento — liberação proporcional pendente de acerto com o fornecedor";
          }
        });
      } else {
        const resultadoRegistro = registrarNotaEParcelasIdempotente(
          d,
          {
            fornecedor_id: fornecedor?.id ?? "",
            pedido_id: pedido?.id,
            numero: nota.numero || "s/n",
            chave_acesso: nota.chave || uid("chave"),
            cnpj_emitente: nota.emitCnpj || undefined,
            razao_social_emitente: nota.emitNome || undefined,
            valor_total: nota.valorTotal,
            emitida_em: hoje,
            importada_em: agora,
            status: tudoOk ? "conferida" : "divergente",
            origem: "manual",
            itens_importados: nota.itens.map((item) => ({
              descricao: item.xProd,
              codigo: item.cProd || undefined,
              ean: codigoDeBarrasValido(item.cEAN) || undefined,
              unidade: item.uCom,
              quantidade: item.qCom,
              preco_unitario: item.vUnCom,
            })),
            parcelas: nota.duplicatas,
            status_boleto: tudoOk ? "liberado" : "travado",
            cnpj_beneficiario: nota.emitCnpj,
            observacao_boleto: tudoOk
              ? "Liberado após conferência OK da mercadoria (nota importada no recebimento)"
              : "Divergência no recebimento — liberação proporcional pendente de acerto com o fornecedor",
            vencimento_padrao: hojeMais(fornecedor?.prazo_boleto_dias ?? 28),
            sem_duplicatas_confirmado_em: nota.duplicatas.length === 0 && confirmacaoSemDuplicatas ? agora : undefined,
            sem_duplicatas_confirmado_por: nota.duplicatas.length === 0 && confirmacaoSemDuplicatas ? "usuário local" : undefined,
            sem_duplicatas_justificativa:
              nota.duplicatas.length === 0 && confirmacaoSemDuplicatas
                ? "Operador confirmou ausência de duplicatas no recebimento da NF-e."
                : undefined,
          },
          {
            notaId,
            gerarIdBoleto: () => uid("bol"),
          }
        );

        if (!resultadoRegistro.sucesso) {
          falhaImportacao = resultadoRegistro.mensagem ?? "NF-e já importada";
          return;
        }

        boletosLiberados += resultadoRegistro.boletosCriados;
      }

      d.recebimentos.unshift({
        id: recebimentoId,
        pedido_id: pedido?.id ?? "",
        nota_id: notaId,
        status,
        recebido_por: usuarioId,
        recebido_em: agora,
      });

      for (const item of nota.itens) {
        const dec = decisoes[item.indice];
        if (!dec || (dec.decisao === "pendente" && !dec.produtoId)) continue;
        const recusado = dec.decisao === "recusado";
        const quantidade = recusado ? 0 : dec.quantidade;
        if (!dec.produtoId) continue; // item sem produto vinculado e não recusado: ignorado
        const unidadeOrigem = unidadePorSigla(d, item.uCom);
        if (fornecedor) {
          const produto = d.produtos.find((p) => p.id === dec.produtoId);
          registrarVinculoDaNota(d, {
            idNovo: uid("fp"),
            fornecedorId: fornecedor.id,
            produtoId: dec.produtoId,
            codigoFornecedor: item.cProd,
            ean: item.cEAN,
            unidadeCompraId: unidadeOrigem?.id,
            fatorConversao:
              produto && produto.unidade_compra_id === unidadeOrigem?.id ? produto.fator_conversao : undefined,
            ultimoPreco: item.vUnCom,
            atualizadoEm: agora,
          });
        }
        const esperadaConvertida = converterParaUnidadeUso(d, dec.produtoId, item.qCom, {
          unidadeOrigemId: unidadeOrigem?.id,
          fornecedorId: fornecedor?.id,
        });
        const recebidaConvertida = converterParaUnidadeUso(d, dec.produtoId, quantidade, {
          unidadeOrigemId: unidadeOrigem?.id,
          fornecedorId: fornecedor?.id,
        });
        const recebimentoItemId = uid("ri");
        d.recebimento_itens.push({
          id: recebimentoItemId,
          recebimento_id: recebimentoId,
          produto_id: dec.produtoId,
          qtd_esperada: esperadaConvertida.quantidadeUso,
          qtd_recebida: recebidaConvertida.quantidadeUso,
          qtd_esperada_origem: item.qCom,
          qtd_recebida_origem: quantidade,
          unidade_origem_id: unidadeOrigem?.id,
          fator_conversao_aplicado: recebidaConvertida.fator,
          validade: recusado ? undefined : dec.validade || undefined,
          divergencia: recusado ? `Recusado no recebimento (${item.xProd})` : undefined,
        });
        if (recebidaConvertida.quantidadeUso > 0) {
          criarLote(d, {
            id: uid("lote"),
            produto_id: dec.produtoId,
            recebimento_item_id: recebimentoItemId,
            origem: "recebimento",
            quantidade: recebidaConvertida.quantidadeUso,
            data_entrada: hoje,
            validade: dec.validade || undefined,
            criado_em: agora,
            atualizado_em: agora,
          });
          d.movimentos_estoque.unshift({
            id: uid("mov"),
            produto_id: dec.produtoId,
            tipo: "entrada",
            quantidade: recebidaConvertida.quantidadeUso,
            recebimento_id: recebimentoId,
            usuario_id: usuarioId,
            criado_em: agora,
            sincronizado: false,
          });
          if (fornecedor && item.vUnCom > 0) {
            d.precos_historico.push({
              id: uid("ph"),
              produto_id: dec.produtoId,
              fornecedor_id: fornecedor.id,
              preco: precoPorUnidadeUso(d, dec.produtoId, item.vUnCom, {
                unidadeOrigemId: unidadeOrigem?.id,
                fornecedorId: fornecedor.id,
              }),
              origem: "nota",
              data: hoje,
            });
          }
        }
      }

      if (pedido) {
        const ped = d.pedidos.find((p) => p.id === pedido.id);
        if (ped) ped.status = "entregue";
      }
    });

    // Novo total ao ERP parceiro
    if (falhaImportacao) {
      setErro(falhaImportacao);
      return;
    }

    for (const item of nota.itens) {
      const dec = decisoes[item.indice];
      if (!dec?.produtoId || dec.decisao !== "confirmado" || dec.quantidade <= 0) continue;
      const produto = dbNovo.produtos.find((p) => p.id === dec.produtoId);
      enviarEstoqueTotal(produto?.codigo_externo, estoqueAtual(dbNovo, dec.produtoId));
    }

    const totalBoletos = notaImportadaId
      ? db.boletos.filter((b) => b.nota_id === notaImportadaId).length
      : nota.duplicatas.length;

    aoFinalizar({
      status,
      fornecedorNome: fornecedor ? nomeFornecedor(db, fornecedor.id) : nota.emitNome,
      boletos: totalBoletos,
      boletosLiberados,
      vinculouPedido: Boolean(pedido),
    });
  }

  // ---------- Passo A: escolher o arquivo ----------
  if (!nota) {
    return (
      <div className="space-y-4">
        <Card className="space-y-3">
          <p className="flex items-center gap-2 text-lg font-bold">
            <ReceiptText size={22} className="text-primaria" /> Receber pela nota fiscal
          </p>
          <p className="text-sm text-slate-600">
            Escolha o <strong>arquivo XML da NF-e</strong> (o que o fornecedor manda por e-mail junto com o
            PDF). O sistema lê os itens e você confere um a um.
          </p>
          <label className="btn-gigante cursor-pointer">
            <FileUp size={28} /> Escolher arquivo XML
            <input
              type="file"
              accept=".xml,text/xml"
              className="hidden"
              onChange={(e) => aoEscolherArquivo(e.target.files?.[0])}
            />
          </label>
          <button className="btn-secundario w-full" onClick={() => carregarNota(XML_EXEMPLO)}>
            <FlaskConical size={18} /> Testar com uma nota de exemplo
          </button>
          {erro && <p className="rounded-card bg-erro-clara px-3 py-2 text-sm text-erro">{erro}</p>}
        </Card>
        <button className="btn-secundario w-full" onClick={onVoltar}>
          <ArrowLeft size={18} /> Voltar
        </button>
      </div>
    );
  }

  // ---------- Passo B: conferir item a item ----------
  const pendentes = nota.itens.filter((i) => decisoes[i.indice]?.decisao === "pendente").length;
  const semProduto = nota.itens.filter((i) => !decisoes[i.indice]?.produtoId);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-lg font-bold">Nota nº {nota.numero}</p>
            <p className="text-sm text-slate-700">Emitente fiscal (XML): {nota.emitNome || "—"}</p>
            <p className="text-sm text-slate-700">CNPJ emitente (XML): {nota.emitCnpj || "—"}</p>
            <p className="text-sm text-slate-600">
              Fornecedor vinculado: {fornecedor ? nomeFornecedor(db, fornecedor.id) : "não cadastrado"}
            </p>
            <p className="text-sm text-slate-600">
              {nota.itens.length} {nota.itens.length === 1 ? "item" : "itens"} · total {moeda(nota.valorTotal)}
              {nota.duplicatas.length > 0 &&
                ` · ${nota.duplicatas.length} boleto${nota.duplicatas.length === 1 ? "" : "s"} (${nota.duplicatas
                  .map((dup) => dataBR(dup.vencimento))
                  .join(", ")})`}
            </p>
          </div>
          {!fornecedor && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge cor="laranja">Fornecedor não cadastrado (CNPJ {nota.emitCnpj || "?"})</Badge>
              <button type="button" className="btn-secundario" onClick={abrirCadastroFornecedor}>
                <Building2 size={17} /> Cadastrar fornecedor
              </button>
            </div>
          )}
        </div>
      </Card>

      {alertaCompletude && (
        <p className="rounded-card border border-destaque bg-destaque-clara px-3 py-2 text-sm text-destaque">{alertaCompletude}</p>
      )}

      {nota.duplicatas.length === 0 && (
        <Card className="space-y-2 border border-destaque py-3">
          <p className="text-sm font-semibold text-destaque">Esta NF-e não possui duplicatas importadas.</p>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={confirmacaoSemDuplicatas}
              onChange={(event) => setConfirmacaoSemDuplicatas(event.target.checked)}
            />
            Confirmo que revisei a NF-e e que esta operação deve seguir sem criação de parcelas/boletos.
          </label>
        </Card>
      )}

      {semProduto.length > 0 && (
        <p className="rounded-card bg-destaque-clara px-3 py-2 text-sm text-destaque">
          {semProduto.length === 1 ? "1 item da nota não foi reconhecido" : `${semProduto.length} itens da nota não foram reconhecidos`}{" "}
          — escolha um produto, cadastre-o como novo ou recuse o item.
        </p>
      )}

      <div className="space-y-3">
        {nota.itens.map((item) => {
          const dec = decisoes[item.indice];
          if (!dec) return null;
          const confirmado = dec.decisao === "confirmado";
          const recusado = dec.decisao === "recusado";
          return (
            <Card
              key={item.indice}
              className={`space-y-3 border-2 ${
                confirmado ? "border-sucesso" : recusado ? "border-erro opacity-80" : "border-transparent"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">{item.xProd}</p>
                  <p className="text-sm text-slate-600">
                    {qtd(item.qCom)} {item.uCom} × {moeda(item.vUnCom)}
                  </p>
                </div>
                {confirmado && (
                  <Badge cor="verde">
                    <CircleCheck size={14} /> confirmado
                  </Badge>
                )}
                {recusado && (
                  <Badge cor="vermelho">
                    <CircleX size={14} /> recusado
                  </Badge>
                )}
              </div>

              <Campo rotulo="Produto no ComprasChef">
                <select
                  className="campo"
                  value={dec.produtoId}
                  onChange={(e) => {
                    const produto = db.produtos.find((p) => p.id === e.target.value);
                    alterar(item.indice, {
                      produtoId: e.target.value,
                      validade: hojeMais(produto?.validade_padrao_dias ?? 30),
                    });
                  }}
                >
                  <option value="">— não reconhecido (escolha ou recuse) —</option>
                  {db.produtos
                    .filter((p) => p.ativo)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                </select>
              </Campo>

              {!dec.produtoId && !recusado && (
                <button type="button" className="btn-secundario w-full" onClick={() => abrirCadastroProduto(item)}>
                  <PackagePlus size={18} /> Cadastrar como novo produto
                </button>
              )}

              {!recusado && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Campo rotulo="Quantidade recebida">
                    <CampoQuantidade
                      valor={dec.quantidade}
                      onChange={(v) => alterar(item.indice, { quantidade: v })}
                    />
                  </Campo>
                  <Campo rotulo="Validade">
                    <input
                      type="date"
                      className="campo"
                      value={dec.validade}
                      onChange={(e) => alterar(item.indice, { validade: e.target.value })}
                    />
                  </Campo>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  className={confirmado ? "btn-primario" : "btn-secundario"}
                  disabled={!dec.produtoId}
                  onClick={() => alterar(item.indice, { decisao: confirmado ? "pendente" : "confirmado" })}
                >
                  <CircleCheck size={18} /> Confirmar
                </button>
                <button
                  className={recusado ? "btn-perigo" : "btn-secundario"}
                  onClick={() => alterar(item.indice, { decisao: recusado ? "pendente" : "recusado" })}
                >
                  <CircleX size={18} /> Recusar
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      {pendentes > 0 ? (
        <p className="rounded-card bg-stone-100 px-3 py-2 text-center text-sm text-stone-600">
          {pendentes === 1 ? "Falta decidir 1 item" : `Faltam decidir ${pendentes} itens`} — toque em Confirmar ou
          Recusar em cada um.
        </p>
      ) : (
        <button
          className="btn-gigante"
          onClick={finalizar}
          disabled={nota.duplicatas.length === 0 && !confirmacaoSemDuplicatas}
        >
          <CircleCheck size={28} /> Finalizar recebimento da nota
        </button>
      )}

      <button className="btn-secundario w-full" onClick={onVoltar}>
        <ArrowLeft size={18} /> Cancelar
      </button>

      <Modal aberto={fornecedorForm !== null} titulo="Cadastrar fornecedor da nota" onFechar={() => setFornecedorForm(null)}>
        {fornecedorForm && (
          <form onSubmit={salvarFornecedor} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Campo rotulo="Nome *">
                <input
                  className="campo"
                  required
                  value={fornecedorForm.nome}
                  onChange={(e) => setFornecedorForm({ ...fornecedorForm, nome: e.target.value })}
                />
              </Campo>
            </div>
            <Campo rotulo="CNPJ *">
              <input
                className="campo"
                required
                value={fornecedorForm.cnpj}
                onChange={(e) => setFornecedorForm({ ...fornecedorForm, cnpj: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Código no EaseEat">
              <input
                className="campo"
                placeholder="opcional"
                value={fornecedorForm.codigo_externo ?? ""}
                onChange={(e) =>
                  setFornecedorForm({ ...fornecedorForm, codigo_externo: e.target.value || undefined })
                }
              />
            </Campo>
            <Campo rotulo="Forma de pagamento *">
              <select
                className="campo"
                value={fornecedorForm.forma_pagamento}
                onChange={(e) =>
                  setFornecedorForm({
                    ...fornecedorForm,
                    forma_pagamento: e.target.value as Fornecedor["forma_pagamento"],
                    ...(e.target.value === "pix" ? { prazo_boleto_dias: undefined } : {}),
                  })
                }
              >
                <option value="boleto">Boleto</option>
                <option value="pix">Pix</option>
              </select>
            </Campo>
            {fornecedorForm.forma_pagamento === "boleto" && (
              <Campo rotulo="Prazo do boleto (dias)">
                <input
                  type="number"
                  min={0}
                  className="campo"
                  value={fornecedorForm.prazo_boleto_dias ?? ""}
                  onChange={(e) =>
                    setFornecedorForm({
                      ...fornecedorForm,
                      prazo_boleto_dias: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </Campo>
            )}
            <p className="text-xs text-slate-500 sm:col-span-2">
              Nome e CNPJ vieram do XML. WhatsApp, telefone, e-mail, contato e demais dados podem ser completados depois em Cadastros &gt; Fornecedores.
            </p>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" className="btn-secundario" onClick={() => setFornecedorForm(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario">
                <Building2 size={18} /> Salvar fornecedor
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal aberto={produtoForm !== null} titulo="Cadastrar produto da nota" onFechar={() => setProdutoForm(null)} fecharAoClicarFundo={false}>
        {produtoForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              salvarProduto(e);
            }}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            <div className="sm:col-span-2">
              <Campo rotulo="Nome *">
                <input
                  className="campo"
                  required
                  value={produtoForm.nome}
                  onChange={(e) => setProdutoForm({ ...produtoForm, nome: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
                />
              </Campo>
            </div>
            <Campo rotulo="Categoria">
              <select
                className="campo"
                value={produtoForm.categoriaId ?? ""}
                onChange={(e) => setProdutoForm({ ...produtoForm, categoriaId: e.target.value || undefined, categoria: "" })}
              >
                {(Array.isArray(db.categorias_produtos) ? db.categorias_produtos : []).map((categoria) => (
                  <option key={categoria.id} value={categoria.id}>
                    {categoria.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Código no EaseEat">
              <input
                className="campo"
                placeholder="opcional"
                value={produtoForm.codigoExterno}
                onChange={(e) => setProdutoForm({ ...produtoForm, codigoExterno: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              />
            </Campo>
            <Campo rotulo="Código de barras">
              <input
                className="campo"
                value={produtoForm.codigoBarras}
                onChange={(e) => setProdutoForm({ ...produtoForm, codigoBarras: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              />
            </Campo>
            {!produtoForm.codigoBarras && (
              <div className="sm:col-span-2 rounded-card border border-dashed border-slate-300 p-3">
                <p className="mb-2 text-sm text-slate-600">Se o XML não trouxe um EAN válido, você pode ler o código de barras agora.</p>
                <CodeScanner
                  rotulo="Ler código de barras"
                  onLeitura={(codigo) => setProdutoForm({ ...produtoForm, codigoBarras: codigo })}
                />
              </div>
            )}
            <Campo rotulo={`Unidade de compra (XML: ${nota.itens.find((i) => i.indice === produtoForm.indice)?.uCom || "—"}) *`}>
              <select
                className="campo"
                required
                value={produtoForm.unidadeCompraId}
                onChange={(e) => setProdutoForm({ ...produtoForm, unidadeCompraId: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              >
                {db.unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome} ({u.sigla})</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Unidade de uso no estoque *">
              <select
                className="campo"
                required
                value={produtoForm.unidadeUsoId}
                onChange={(e) => setProdutoForm({ ...produtoForm, unidadeUsoId: e.target.value })}
              >
                {db.unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome} ({u.sigla})</option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Fator de conversão *">
              <input
                type="number"
                min="0.000001"
                step="any"
                required
                className="campo"
                value={produtoForm.fatorConversao}
                onChange={(e) =>
                  setProdutoForm({
                    ...produtoForm,
                    fatorConversao: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </Campo>
            <Campo rotulo="Estoque mínimo *">
              <input
                type="number"
                min={0}
                step="any"
                required
                className="campo"
                value={produtoForm.estoqueMinimo}
                onChange={(e) =>
                  setProdutoForm({
                    ...produtoForm,
                    estoqueMinimo: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </Campo>
            <Campo rotulo="Validade padrão (dias) *">
              <input
                type="number"
                min={0}
                required
                className="campo"
                value={produtoForm.validadePadraoDias}
                onChange={(e) =>
                  setProdutoForm({
                    ...produtoForm,
                    validadePadraoDias: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </Campo>
            <Campo rotulo="Dados fiscais">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  className="campo"
                  placeholder="NCM"
                  value={produtoForm.ncm ?? ""}
                  onChange={(e) => setProdutoForm({ ...produtoForm, ncm: e.target.value || undefined })}
                />
                <input
                  className="campo"
                  placeholder="CEST"
                  value={produtoForm.cest ?? ""}
                  onChange={(e) => setProdutoForm({ ...produtoForm, cest: e.target.value || undefined })}
                />
                <input
                  className="campo"
                  placeholder="Origem da mercadoria"
                  value={produtoForm.origemMercadoria ?? ""}
                  onChange={(e) => setProdutoForm({ ...produtoForm, origemMercadoria: e.target.value || undefined })}
                />
                <input
                  className="campo"
                  placeholder="CFOP padrão"
                  value={produtoForm.cfopPadrao ?? ""}
                  onChange={(e) => setProdutoForm({ ...produtoForm, cfopPadrao: e.target.value || undefined })}
                />
              </div>
            </Campo>
            <Campo rotulo="Controle de lote e validade">
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={produtoForm.controla_lote ?? false}
                    onChange={(e) => setProdutoForm({ ...produtoForm, controla_lote: e.target.checked })}
                  />
                  Controla lote
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={produtoForm.controla_validade ?? false}
                    onChange={(e) => setProdutoForm({ ...produtoForm, controla_validade: e.target.checked })}
                  />
                  Controla validade
                </label>
              </div>
            </Campo>
            <Campo rotulo="Ponto de pedido">
              <input
                type="number"
                min={0}
                className="campo"
                value={produtoForm.pontoPedido ?? ""}
                onChange={(e) =>
                  setProdutoForm({
                    ...produtoForm,
                    pontoPedido: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </Campo>
            <Campo rotulo="Estoque máximo">
              <input
                type="number"
                min={0}
                className="campo"
                value={produtoForm.estoqueMaximo ?? ""}
                onChange={(e) =>
                  setProdutoForm({
                    ...produtoForm,
                    estoqueMaximo: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </Campo>
            <Campo rotulo="Consumo médio mensal">
              <input
                type="number"
                min={0}
                className="campo"
                value={produtoForm.consumoMedioMensal ?? ""}
                onChange={(e) =>
                  setProdutoForm({
                    ...produtoForm,
                    consumoMedioMensal: e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </Campo>
            <p className="text-xs text-slate-500 sm:col-span-2">
              O código do item no fornecedor ({nota.itens.find((i) => i.indice === produtoForm.indice)?.cProd || "não informado"}) será vinculado automaticamente. O fator indica quantas unidades de uso entram no estoque para cada unidade comprada.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:col-span-2">
              <button type="button" className="btn-secundario w-full sm:w-auto" onClick={() => setProdutoForm(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-secundario w-full sm:w-auto"
                onClick={salvarECompletarCadastro}
              >
                <PackagePlus size={18} /> Salvar e completar cadastro
              </button>
              <button type="submit" className="btn-primario w-full sm:w-auto">
                <PackagePlus size={18} /> Salvar produto
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
