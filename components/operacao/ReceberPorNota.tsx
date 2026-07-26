"use client";

// Recebimento pela NOTA FISCAL (XML da NF-e):
// importa o arquivo → o sistema lê fornecedor, itens e boletos → o operador
// toca ✓ Confirmar ou ✗ Recusar em cada item → entrada no estoque, nota no
// financeiro (boletos liberados se tudo OK) e vínculo com o pedido do fornecedor.

import { useState, type FormEvent } from "react";
import { ArrowLeft, Building2, CircleCheck, CircleX, FileUp, FlaskConical, PackagePlus, ReceiptText } from "lucide-react";
import { Badge, Campo, Card, Modal, Vazio } from "@/components/ui";
import CampoQuantidade from "@/components/operacao/CampoQuantidade";
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
import { criarLote } from "@/lib/domain/estoque";
import { moeda, dataBR, qtd } from "@/lib/format";
import type { DB, Fornecedor, StatusRecebimento } from "@/lib/types";

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
  duplicatas: { vencimento: string; valor: number }[];
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
  categoria: string;
  codigoBarras: string;
  unidadeCompraId: string;
  unidadeUsoId: string;
  fatorConversao: number;
  estoqueMinimo: number;
  validadePadraoDias: number;
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

    const duplicatas = Array.from(doc.querySelectorAll("dup")).map((dup) => ({
      vencimento: texto("dVenc", dup),
      valor: Number(texto("vDup", dup)) || 0,
    }));

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
function daNotaImportada(db: DB, notaId: string): { lida: NotaLida; decisoes: Record<number, DecisaoItem> } | null {
  const nf = db.notas_fiscais.find((n) => n.id === notaId);
  if (!nf || !nf.itens_importados) return null;
  const forn = db.fornecedores.find((f) => f.id === nf.fornecedor_id);
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
    emitCnpj: forn ? somenteDigitos(forn.cnpj) : "",
    emitNome: forn?.nome ?? "",
    numero: nf.numero,
    chave: nf.chave_acesso,
    valorTotal: nf.valor_total,
    duplicatas: [],
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
  return { lida, decisoes };
}

export default function ReceberPorNota({
  db,
  usuarioId,
  notaImportadaId,
  onVoltar,
  aoFinalizar,
}: {
  db: DB;
  usuarioId: string;
  /** Quando vem de uma DANFE já baixada da Receita: pula o upload e usa os itens da nota. */
  notaImportadaId?: string;
  onVoltar: () => void;
  aoFinalizar: (resultado: ResultadoNota) => void;
}) {
  const inicial = notaImportadaId ? daNotaImportada(db, notaImportadaId) : null;
  const [nota, setNota] = useState<NotaLida | null>(inicial?.lida ?? null);
  const [decisoes, setDecisoes] = useState<Record<number, DecisaoItem>>(inicial?.decisoes ?? {});
  const [erro, setErro] = useState<string | null>(null);
  const [fornecedorForm, setFornecedorForm] = useState<Fornecedor | null>(null);
  const [produtoForm, setProdutoForm] = useState<CadastroProdutoNota | null>(null);

  const fornecedor = nota
    ? db.fornecedores.find((f) => somenteDigitos(f.cnpj) === somenteDigitos(nota.emitCnpj))
    : undefined;

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
    setProdutoForm({
      indice: item.indice,
      nome: item.xProd,
      codigoExterno: "",
      categoria: "",
      codigoBarras: codigoDeBarrasValido(item.cEAN) ?? "",
      unidadeCompraId: unidadePadrao,
      unidadeUsoId: unidadePadrao,
      fatorConversao: 1,
      estoqueMinimo: 0,
      validadePadraoDias: 30,
    });
  }

  function salvarProduto(e: FormEvent) {
    e.preventDefault();
    if (!nota || !produtoForm) return;
    const item = nota.itens.find((i) => i.indice === produtoForm.indice);
    if (!item) return;
    const produtoId = uid("prod");
    const agora = new Date().toISOString();
    mutate((d) => {
      d.produtos.push({
        id: produtoId,
        codigo_externo: produtoForm.codigoExterno.trim() || undefined,
        nome: produtoForm.nome.trim(),
        categoria: produtoForm.categoria.trim() || undefined,
        tipo: "comprado",
        unidade_compra_id: produtoForm.unidadeCompraId || undefined,
        unidade_uso_id: produtoForm.unidadeUsoId,
        fator_conversao: produtoForm.fatorConversao,
        codigo_barras: produtoForm.codigoBarras.trim() || undefined,
        estoque_minimo: produtoForm.estoqueMinimo,
        validade_padrao_dias: produtoForm.validadePadraoDias,
        ativo: true,
      });
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
          fatorConversao: produtoForm.fatorConversao,
          ultimoPreco: item.vUnCom,
          atualizadoEm: agora,
        });
      }
    });
    alterar(item.indice, {
      produtoId,
      validade: hojeMais(produtoForm.validadePadraoDias),
      decisao: "pendente",
    });
    setProdutoForm(null);
  }

  function finalizar() {
    if (!nota) return;
    const agora = new Date().toISOString();
    const hoje = agora.slice(0, 10);

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

    const dbNovo = mutate((d) => {
      if (notaImportadaId) {
        // Nota já existe (baixada da Receita): só atualiza o status e libera os boletos.
        const nf = d.notas_fiscais.find((n) => n.id === notaImportadaId);
        if (nf) nf.status = tudoOk ? "conferida" : "divergente";
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
        d.notas_fiscais.unshift({
          id: notaId,
          fornecedor_id: fornecedor?.id ?? "",
          pedido_id: pedido?.id,
          numero: nota.numero || "s/n",
          chave_acesso: nota.chave || uid("chave"),
          valor_total: nota.valorTotal,
          emitida_em: hoje,
          importada_em: agora,
          status: tudoOk ? "conferida" : "divergente",
          origem: "manual",
        });

        for (const dup of nota.duplicatas) {
          const liberado = tudoOk;
          if (liberado) boletosLiberados += 1;
          d.boletos.push({
            id: uid("bol"),
            nota_id: notaId,
            valor: dup.valor,
            vencimento: dup.vencimento || hojeMais(fornecedor?.prazo_boleto_dias ?? 28),
            cnpj_beneficiario: nota.emitCnpj,
            status: liberado ? "liberado" : "travado",
            observacao: liberado
              ? "Liberado após conferência OK da mercadoria (nota importada no recebimento)"
              : "Divergência no recebimento — liberação proporcional pendente de acerto com o fornecedor",
          });
        }
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
            <p className="text-lg font-bold">
              Nota nº {nota.numero} — {fornecedor ? nomeFornecedor(db, fornecedor.id) : nota.emitNome}
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
        <button className="btn-gigante" onClick={finalizar}>
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
              Nome e CNPJ vieram do XML. O código do EaseEat pode ficar vazio e ser informado depois.
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

      <Modal aberto={produtoForm !== null} titulo="Cadastrar produto da nota" onFechar={() => setProdutoForm(null)}>
        {produtoForm && (
          <form onSubmit={salvarProduto} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Campo rotulo="Nome *">
                <input
                  className="campo"
                  required
                  value={produtoForm.nome}
                  onChange={(e) => setProdutoForm({ ...produtoForm, nome: e.target.value })}
                />
              </Campo>
            </div>
            <Campo rotulo="Categoria">
              <input
                className="campo"
                placeholder="ex.: mercearia"
                value={produtoForm.categoria}
                onChange={(e) => setProdutoForm({ ...produtoForm, categoria: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Código no EaseEat">
              <input
                className="campo"
                placeholder="opcional"
                value={produtoForm.codigoExterno}
                onChange={(e) => setProdutoForm({ ...produtoForm, codigoExterno: e.target.value })}
              />
            </Campo>
            <Campo rotulo="Código de barras">
              <input
                className="campo"
                value={produtoForm.codigoBarras}
                onChange={(e) => setProdutoForm({ ...produtoForm, codigoBarras: e.target.value })}
              />
            </Campo>
            <Campo rotulo={`Unidade de compra (XML: ${nota.itens.find((i) => i.indice === produtoForm.indice)?.uCom || "—"}) *`}>
              <select
                className="campo"
                required
                value={produtoForm.unidadeCompraId}
                onChange={(e) => setProdutoForm({ ...produtoForm, unidadeCompraId: e.target.value })}
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
                onChange={(e) => setProdutoForm({ ...produtoForm, fatorConversao: Number(e.target.value) })}
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
                onChange={(e) => setProdutoForm({ ...produtoForm, estoqueMinimo: Number(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Validade padrão (dias) *">
              <input
                type="number"
                min={0}
                required
                className="campo"
                value={produtoForm.validadePadraoDias}
                onChange={(e) => setProdutoForm({ ...produtoForm, validadePadraoDias: Number(e.target.value) })}
              />
            </Campo>
            <p className="text-xs text-slate-500 sm:col-span-2">
              O código do item no fornecedor ({nota.itens.find((i) => i.indice === produtoForm.indice)?.cProd || "não informado"}) será vinculado automaticamente. O fator indica quantas unidades de uso entram no estoque para cada unidade comprada.
            </p>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <button type="button" className="btn-secundario" onClick={() => setProdutoForm(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primario">
                <PackagePlus size={18} /> Salvar produto
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
