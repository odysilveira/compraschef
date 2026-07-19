"use client";

// Página PÚBLICA do fornecedor (requisitos 13–14) — fora do AppShell, sem login,
// mobile-first. O fornecedor abre o link exclusivo, informa preços e prazos
// (ou marca indisponível com substituto) e envia a cotação.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { mutate, nomeProduto, siglaUnidadeUso, useDB } from "@/lib/data";
import { dataBR, dataHoraBR, qtd } from "@/lib/format";

interface ItemForm {
  disponivel: boolean;
  preco: string;
  prazo: string;
  substitutoDescricao: string;
  substitutoPreco: string;
}

function parseNum(s: string): number {
  const n = parseFloat(s.replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

export default function CotacaoPublicaPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const db = useDB();

  const [pronto, setPronto] = useState(false);
  const [form, setForm] = useState<Record<string, ItemForm> | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cotacao = db.cotacoes.find((c) => c.token === token);
  const fornecedor = db.fornecedores.find((f) => f.id === cotacao?.fornecedor_id);
  const itens = cotacao ? db.cotacao_itens.filter((i) => i.cotacao_id === cotacao.id) : [];

  // Espera o localStorage carregar antes de julgar o link inválido
  useEffect(() => setPronto(true), []);

  // Pré-preenche o formulário com o último preço conhecido do fornecedor
  useEffect(() => {
    if (!pronto || !cotacao || form) return;
    const inicial: Record<string, ItemForm> = {};
    for (const item of itens) {
      const fp = db.fornecedor_produtos.find(
        (x) => x.fornecedor_id === cotacao.fornecedor_id && x.produto_id === item.produto_id
      );
      inicial[item.id] = {
        disponivel: item.disponivel,
        preco:
          item.preco_unitario !== undefined
            ? String(item.preco_unitario)
            : fp?.ultimo_preco !== undefined
              ? String(fp.ultimo_preco)
              : "",
        prazo:
          item.prazo_entrega_dias !== undefined
            ? String(item.prazo_entrega_dias)
            : fornecedor?.prazo_entrega_dias !== undefined
              ? String(fornecedor.prazo_entrega_dias)
              : "",
        substitutoDescricao: item.substituto_descricao ?? "",
        substitutoPreco: item.substituto_preco !== undefined ? String(item.substituto_preco) : "",
      };
    }
    setForm(inicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, cotacao, form]);

  function atualizar(itemId: string, mudancas: Partial<ItemForm>) {
    setForm((f) => (f ? { ...f, [itemId]: { ...f[itemId], ...mudancas } } : f));
  }

  function enviarCotacao() {
    if (!cotacao || !form) return;
    for (const item of itens) {
      const f = form[item.id];
      if (f?.disponivel && parseNum(f.preco) <= 0) {
        setErro('Informe o preço de todos os itens disponíveis (ou toque em "Não tenho / oferecer substituto").');
        return;
      }
    }
    setErro(null);
    const agora = new Date().toISOString();
    const cotacaoId = cotacao.id;
    mutate((d) => {
      for (const item of d.cotacao_itens.filter((i) => i.cotacao_id === cotacaoId)) {
        const f = form[item.id];
        if (!f) continue;
        if (f.disponivel) {
          item.disponivel = true;
          item.preco_unitario = parseNum(f.preco);
          item.prazo_entrega_dias = f.prazo.trim() ? Math.max(0, Math.round(parseNum(f.prazo))) : undefined;
          item.substituto_descricao = undefined;
          item.substituto_preco = undefined;
        } else {
          item.disponivel = false;
          item.preco_unitario = undefined;
          item.prazo_entrega_dias = undefined;
          item.substituto_descricao = f.substitutoDescricao.trim() || undefined;
          item.substituto_preco = f.substitutoPreco.trim() ? parseNum(f.substitutoPreco) : undefined;
        }
      }
      const c = d.cotacoes.find((x) => x.id === cotacaoId);
      if (c) {
        c.status = "respondida";
        c.respondida_em = agora;
      }
    });
    setEnviado(true);
    window.scrollTo({ top: 0 });
  }

  const prazoPassou = cotacao ? new Date(cotacao.prazo_resposta).getTime() < Date.now() : false;
  const encerrada = !!cotacao && !enviado && (cotacao.status === "expirada" || (cotacao.status === "enviada" && prazoPassou));
  const jaRespondida = !!cotacao && !enviado && cotacao.status === "respondida";

  let conteudo: React.ReactNode;

  if (!pronto) {
    conteudo = null;
  } else if (!cotacao) {
    conteudo = (
      <div className="card py-10 text-center">
        <AlertTriangle className="mx-auto mb-3 h-12 w-12 text-destaque" />
        <h2 className="mb-2">Link inválido</h2>
        <p className="text-sm text-slate-600">
          Este link de cotação não existe ou foi removido. Confira a mensagem que você recebeu ou fale com o
          restaurante para receber um novo link.
        </p>
      </div>
    );
  } else if (encerrada) {
    conteudo = (
      <div className="card py-10 text-center">
        <Clock className="mx-auto mb-3 h-12 w-12 text-slate-400" />
        <h2 className="mb-2">Prazo encerrado</h2>
        <p className="text-sm text-slate-600">
          O prazo para responder esta cotação terminou em {dataHoraBR(cotacao.prazo_resposta)}. Fale com o
          restaurante para receber um novo link.
        </p>
      </div>
    );
  } else if (enviado || jaRespondida) {
    conteudo = (
      <div className="card py-10 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-14 w-14 text-primaria" />
        <h2 className="mb-2">{enviado ? "Cotação enviada!" : "Cotação já respondida"}</h2>
        <p className="text-sm text-slate-600">
          {enviado
            ? `Obrigado${fornecedor?.contato_nome ? `, ${fornecedor.contato_nome}` : ""}! O restaurante já recebeu seus preços e retorna em breve com o pedido.`
            : `Esta cotação já foi respondida${cotacao.respondida_em ? ` em ${dataHoraBR(cotacao.respondida_em)}` : ""}. Obrigado!`}
        </p>
      </div>
    );
  } else {
    conteudo = (
      <div className="space-y-4">
        <div className="card">
          <p className="text-sm text-slate-500">
            Olá{fornecedor?.contato_nome ? `, ${fornecedor.contato_nome}` : ""}
            {fornecedor ? ` (${fornecedor.nome})` : ""}!
          </p>
          <h2 className="mt-1">
            O restaurante quer cotar {itens.length} {itens.length === 1 ? "item" : "itens"} com você — responda
            até {dataBR(cotacao.prazo_resposta)}
          </h2>
        </div>

        {itens.map((item) => {
          const f = form?.[item.id];
          if (!f) return null;
          return (
            <div key={item.id} className="card">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <p className="font-semibold">{nomeProduto(db, item.produto_id)}</p>
                <span className="whitespace-nowrap text-sm text-slate-500">
                  {qtd(item.quantidade, siglaUnidadeUso(db, item.produto_id))}
                </span>
              </div>

              {f.disponivel ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="rotulo mb-1 block">Preço unitário (R$)</span>
                    <input
                      className="campo"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={f.preco}
                      onChange={(e) => atualizar(item.id, { preco: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="rotulo mb-1 block">Entrega (dias)</span>
                    <input
                      className="campo"
                      type="number"
                      inputMode="numeric"
                      step="1"
                      min="0"
                      value={f.prazo}
                      onChange={(e) => atualizar(item.id, { prazo: e.target.value })}
                    />
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-destaque">Marcado como indisponível.</p>
                  <label className="block">
                    <span className="rotulo mb-1 block">Substituto (opcional)</span>
                    <input
                      className="campo"
                      placeholder="Ex.: Creme culinário 1L marca própria"
                      value={f.substitutoDescricao}
                      onChange={(e) => atualizar(item.id, { substitutoDescricao: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="rotulo mb-1 block">Preço do substituto (R$)</span>
                    <input
                      className="campo"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={f.substitutoPreco}
                      onChange={(e) => atualizar(item.id, { substitutoPreco: e.target.value })}
                    />
                  </label>
                </div>
              )}

              <button
                type="button"
                className="mt-3 text-sm font-semibold text-destaque underline underline-offset-2"
                onClick={() => atualizar(item.id, { disponivel: !f.disponivel })}
              >
                {f.disponivel ? "Não tenho / oferecer substituto" : "Tenho o produto — informar preço"}
              </button>
            </div>
          );
        })}

        {erro && (
          <div className="rounded-card bg-erro-clara px-4 py-3 text-sm font-medium text-erro">{erro}</div>
        )}

        <button className="btn-gigante" onClick={enviarCotacao}>
          Enviar cotação
        </button>
        <p className="pb-6 text-center text-xs text-slate-400">
          Seus preços vão direto para o comprador do restaurante.
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-fundo">
      <header className="bg-primaria px-4 py-4 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">ComprasChef</p>
        <h1 className="!text-xl">Cotação de compras</h1>
      </header>
      <div className="mx-auto max-w-md px-4 py-6">{conteudo}</div>
    </main>
  );
}
