"use client";

// Recebimento pela NOTA FISCAL (XML da NF-e):
// importa o arquivo → o sistema lê fornecedor, itens e boletos → o operador
// toca ✓ Confirmar ou ✗ Recusar em cada item → entrada no estoque, nota no
// financeiro (boletos liberados se tudo OK) e vínculo com o pedido do fornecedor.

import { useState } from "react";
import { ArrowLeft, CircleCheck, CircleX, FileUp, FlaskConical, ReceiptText } from "lucide-react";
import { Badge, Campo, Card, Vazio } from "@/components/ui";
import CampoQuantidade from "@/components/operacao/CampoQuantidade";
import { estoqueAtual, mutate, nomeFornecedor, uid } from "@/lib/data";
import { enviarEstoqueTotal } from "@/lib/integracao";
import { moeda, dataBR, qtd } from "@/lib/format";
import type { DB, StatusRecebimento } from "@/lib/types";

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

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
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

/** Tenta casar um item do XML com um produto cadastrado (EAN → código externo → nome). */
function casarProduto(db: DB, item: ItemNota): string {
  const porEan = item.cEAN && db.produtos.find((p) => p.ativo && p.codigo_barras === item.cEAN);
  if (porEan) return porEan.id;
  const porCodigo = item.cProd && db.produtos.find((p) => p.ativo && p.codigo_externo === item.cProd);
  if (porCodigo) return porCodigo.id;
  const nomeXml = normalizar(item.xProd);
  const porNome = db.produtos.find((p) => {
    if (!p.ativo) return false;
    const nome = normalizar(p.nome);
    return nome === nomeXml || nomeXml.includes(nome) || nome.includes(nomeXml);
  });
  return porNome?.id ?? "";
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

export default function ReceberPorNota({
  db,
  usuarioId,
  onVoltar,
  aoFinalizar,
}: {
  db: DB;
  usuarioId: string;
  onVoltar: () => void;
  aoFinalizar: (resultado: ResultadoNota) => void;
}) {
  const [nota, setNota] = useState<NotaLida | null>(null);
  const [decisoes, setDecisoes] = useState<Record<number, DecisaoItem>>({});
  const [erro, setErro] = useState<string | null>(null);

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
    for (const item of lida.itens) {
      const produtoId = casarProduto(db, item);
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

    const notaId = uid("nf");
    const recebimentoId = uid("rec");
    let boletosLiberados = 0;

    const dbNovo = mutate((d) => {
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
        d.recebimento_itens.push({
          id: uid("ri"),
          recebimento_id: recebimentoId,
          produto_id: dec.produtoId,
          qtd_esperada: item.qCom,
          qtd_recebida: quantidade,
          validade: recusado ? undefined : dec.validade || undefined,
          divergencia: recusado ? `Recusado no recebimento (${item.xProd})` : undefined,
        });
        if (quantidade > 0) {
          d.movimentos_estoque.unshift({
            id: uid("mov"),
            produto_id: dec.produtoId,
            tipo: "entrada",
            quantidade,
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
              preco: item.vUnCom,
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
      enviarEstoqueTotal(produto?.codigo_externo, estoqueAtual(dbNovo, dec.produtoId) + dec.quantidade);
    }

    aoFinalizar({
      status,
      fornecedorNome: fornecedor ? nomeFornecedor(db, fornecedor.id) : nota.emitNome,
      boletos: nota.duplicatas.length,
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
            <Badge cor="laranja">Fornecedor não cadastrado (CNPJ {nota.emitCnpj || "?"})</Badge>
          )}
        </div>
      </Card>

      {semProduto.length > 0 && (
        <p className="rounded-card bg-destaque-clara px-3 py-2 text-sm text-destaque">
          {semProduto.length === 1 ? "1 item da nota não foi reconhecido" : `${semProduto.length} itens da nota não foram reconhecidos`}{" "}
          — escolha o produto correspondente ou recuse o item.
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
    </div>
  );
}
