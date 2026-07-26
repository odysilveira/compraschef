"use client";

// Estoque por caixas (requisitos 36–41) + Modo balanço (42–44).
// Tela operacional: escanear o QR da caixa é o centro de tudo.

import { useMemo, useState } from "react";
import {
  ArrowDownCircle,
  Boxes,
  CircleCheck,
  ClipboardList,
  MapPin,
  PackageOpen,
  Plus,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { Badge, Campo, Card, Modal, TituloPagina, Vazio } from "@/components/ui";
import CodeScanner from "@/components/scanner/CodeScanner";
import CampoQuantidade from "@/components/operacao/CampoQuantidade";
import {
  caixaFifo,
  estoqueAtual,
  mutate,
  nomeLocal,
  nomePerfil,
  nomeProduto,
  siglaUnidadeUso,
  uid,
  useDB,
} from "@/lib/data";
import { enviarEstoqueTotal } from "@/lib/integracao";
import {
  ajustarLoteDaCaixa,
  alocarLoteEmCaixa,
  baixarLoteDaCaixa,
  criarLote,
  loteDaCaixa,
  lotesPendentesDeAlocacao,
  quantidadePendenteLote,
} from "@/lib/domain/estoque";
import { usePapel } from "@/lib/roles";
import { dataBR, diasAte, qtd, rotuloValidade } from "@/lib/format";
import type { Caixa, DB, StatusCaixa } from "@/lib/types";

type Aba = "estoque" | "balanco";

const ROTULO_STATUS_CAIXA: Record<StatusCaixa, string> = {
  vazia: "vazia",
  cheia: "cheia",
  em_uso: "em uso",
};

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function hojeMais(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function esvaziarCampos(c: Caixa) {
  c.status = "vazia";
  c.produto_id = undefined;
  c.quantidade = undefined;
  c.data_envase = undefined;
  c.validade = undefined;
  c.local_id = undefined;
  c.atualizado_em = new Date().toISOString();
}

// ---------- Formulário "Encher caixa" (caixa vazia) ----------

function FormEncher({
  db,
  caixa,
  usuarioId,
  aoConcluir,
}: {
  db: DB;
  caixa: Caixa;
  usuarioId: string;
  aoConcluir: () => void;
}) {
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState(0);
  const [envase, setEnvase] = useState(hoje());
  const [validade, setValidade] = useState("");
  const [localId, setLocalId] = useState("");
  const [lotePendenteId, setLotePendenteId] = useState("");
  const [avisoProduto, setAvisoProduto] = useState<string | null>(null);
  const lotesPendentes = lotesPendentesDeAlocacao(db);
  const saldoPendenteSelecionado = lotePendenteId ? quantidadePendenteLote(db, lotePendenteId) : undefined;

  function escolherLote(id: string) {
    setLotePendenteId(id);
    const lote = db.lotes_estoque.find((l) => l.id === id);
    if (!lote) return;
    setProdutoId(lote.produto_id);
    setQuantidade(quantidadePendenteLote(db, lote.id));
    setEnvase(lote.data_entrada);
    setValidade(lote.validade ?? "");
  }

  function escolherProduto(id: string) {
    setLotePendenteId("");
    setProdutoId(id);
    const produto = db.produtos.find((p) => p.id === id);
    if (produto?.validade_padrao_dias !== undefined) {
      setValidade(hojeMais(produto.validade_padrao_dias));
    }
  }

  function aoLerProduto(codigo: string) {
    const limpo = codigo.trim();
    const vinculoFornecedor = db.fornecedor_produtos.find((fp) => fp.codigo_barras_fornecedor === limpo);
    const produto = db.produtos.find(
      (p) => p.ativo && (p.codigo_barras === limpo || p.id === vinculoFornecedor?.produto_id)
    );
    if (!produto) {
      setAvisoProduto(`Código "${limpo}" não corresponde a um produto cadastrado.`);
      return;
    }
    const pendentesDoProduto = lotesPendentes.filter((l) => l.produto_id === produto.id);
    if (pendentesDoProduto.length === 1) {
      escolherLote(pendentesDoProduto[0].id);
    } else if (pendentesDoProduto.length > 1) {
      setAvisoProduto(`Há ${pendentesDoProduto.length} lotes deste produto. Escolha o lote pela validade.`);
      return;
    } else if (produto.tipo === "produzido") {
      setAvisoProduto("Registre primeiro o lote completo em “Registrar produção” e depois distribua as porções nas caixas.");
      return;
    } else {
      escolherProduto(produto.id);
    }
    setAvisoProduto(null);
  }

  // Regra da casa: o vencimento sugerido depende do destino do saco —
  // freezer = 3 meses, geladeira = 5 dias (o produto dá a sugestão inicial).
  function escolherLocal(id: string) {
    setLocalId(id);
    if (lotePendenteId) return;
    const local = db.locais.find((l) => l.id === id);
    if (!local) return;
    const base = envase || hoje();
    const d = new Date(`${base}T12:00:00`);
    if (local.tipo === "freezer") {
      d.setDate(d.getDate() + 90);
      setValidade(d.toISOString().slice(0, 10));
    } else if (local.tipo === "geladeira") {
      d.setDate(d.getDate() + 5);
      setValidade(d.toISOString().slice(0, 10));
    }
  }

  const categorias = new Map<string, typeof db.produtos>();
  for (const p of db.produtos.filter((x) => x.ativo && x.tipo === "comprado")) {
    const cat = p.categoria ?? "outros";
    categorias.set(cat, [...(categorias.get(cat) ?? []), p]);
  }

  function salvar() {
    if (!produtoId || quantidade <= 0) return;
    const produto = db.produtos.find((p) => p.id === produtoId);
    const agora = new Date().toISOString();
    const dbNovo = mutate((d) => {
      if (lotePendenteId) {
        alocarLoteEmCaixa(d, {
          id: uid("aloc"),
          loteId: lotePendenteId,
          caixaId: caixa.id,
          quantidade,
          localId: localId || undefined,
          agora,
        });
        return;
      }
      const lote = criarLote(d, {
        id: uid("lote"),
        produto_id: produtoId,
        origem: produto?.tipo === "produzido" ? "producao" : "manual",
        quantidade,
        data_entrada: envase || hoje(),
        validade: validade || undefined,
        criado_em: agora,
        atualizado_em: agora,
      });
      alocarLoteEmCaixa(d, {
        id: uid("aloc"),
        loteId: lote.id,
        caixaId: caixa.id,
        quantidade,
        localId: localId || undefined,
        agora,
      });
      d.movimentos_estoque.unshift({
        id: uid("mov"),
        produto_id: produtoId,
        caixa_id: caixa.id,
        tipo: produto?.tipo === "produzido" ? "producao" : "entrada",
        quantidade,
        usuario_id: usuarioId,
        criado_em: agora,
        sincronizado: false,
      });
    });
    enviarEstoqueTotal(produto?.codigo_externo, estoqueAtual(dbNovo, produtoId));
    aoConcluir();
  }

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-lg font-bold">
        <PackageOpen size={22} className="text-primaria" /> Caixa nº {caixa.numero} está vazia — encher agora
      </p>
      {lotesPendentes.length > 0 && (
        <Campo rotulo="Lote recebido aguardando caixa">
          <select className="campo" value={lotePendenteId} onChange={(e) => escolherLote(e.target.value)}>
            <option value="">— criar uma entrada manual —</option>
            {lotesPendentes.map((lote) => (
              <option key={lote.id} value={lote.id}>
                {nomeProduto(db, lote.produto_id)} · {qtd(quantidadePendenteLote(db, lote.id), siglaUnidadeUso(db, lote.produto_id))} aguardando · {lote.validade ? `vence ${dataBR(lote.validade)}` : `entrada ${dataBR(lote.data_entrada)}`}
              </option>
            ))}
          </select>
        </Campo>
      )}
      {lotePendenteId && (
        <p className="rounded-card bg-sucesso-clara px-3 py-2 text-sm text-primaria-escura">
          Este lote já entrou no estoque no recebimento ou na produção. Agora parte dele será vinculada à caixa, sem
          somar a quantidade novamente.
        </p>
      )}
      <CodeScanner rotulo="Ler código de barras do produto" onLeitura={aoLerProduto} />
      {avisoProduto && (
        <p className="rounded-card bg-destaque-clara px-3 py-2 text-sm text-destaque">{avisoProduto}</p>
      )}
      <Campo rotulo="Produto">
        <select className="campo" value={produtoId} disabled={Boolean(lotePendenteId)} onChange={(e) => escolherProduto(e.target.value)}>
          <option value="">Escolha o produto…</option>
          {Array.from(categorias.entries()).map(([categoria, produtos]) => (
            <optgroup key={categoria} label={categoria}>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Campo>
      <Campo rotulo={`Quantidade${produtoId ? ` (${siglaUnidadeUso(db, produtoId)})` : ""}`}>
        <CampoQuantidade valor={quantidade} onChange={setQuantidade} />
      </Campo>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Data de envase">
          <input type="date" className="campo" disabled={Boolean(lotePendenteId)} value={envase} onChange={(e) => setEnvase(e.target.value)} />
        </Campo>
        <Campo rotulo="Validade (obrigatória)">
          <input type="date" className="campo" disabled={Boolean(lotePendenteId)} value={validade} onChange={(e) => setValidade(e.target.value)} />
        </Campo>
      </div>
      <Campo rotulo="Local de armazenagem">
        <select className="campo" value={localId} onChange={(e) => escolherLocal(e.target.value)}>
          <option value="">Escolha o local…</option>
          {db.locais.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nome}
            </option>
          ))}
        </select>
      </Campo>
      {localId && (
        <p className="text-xs text-stone-500">
          Vencimento sugerido pelo destino: freezer = 3 meses · geladeira = 5 dias. Ajuste a validade acima se
          precisar.
        </p>
      )}
      {!validade && produtoId && (
        <p className="rounded-card bg-destaque-clara px-3 py-2 text-sm text-destaque">
          Informe a validade — o sistema recomenda primeiro a caixa que vence antes e, em empate, a mais antiga.
        </p>
      )}
      {saldoPendenteSelecionado !== undefined && quantidade > saldoPendenteSelecionado && (
        <p className="rounded-card bg-erro-clara px-3 py-2 text-sm text-erro">
          Este lote tem somente {qtd(saldoPendenteSelecionado, siglaUnidadeUso(db, produtoId))} aguardando caixa.
        </p>
      )}
      <button
        className="btn-gigante"
        onClick={salvar}
        disabled={!produtoId || quantidade <= 0 || !validade || (saldoPendenteSelecionado !== undefined && quantidade > saldoPendenteSelecionado)}
      >
        Salvar caixa cheia
      </button>
    </div>
  );
}

function FormRegistrarProducao({
  db,
  usuarioId,
  aoConcluir,
}: {
  db: DB;
  usuarioId: string;
  aoConcluir: () => void;
}) {
  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState(0);
  const [dataProducao, setDataProducao] = useState(hoje());
  const [validade, setValidade] = useState("");
  const [porcionadoPorId, setPorcionadoPorId] = useState(usuarioId);
  const produzidos = db.produtos
    .filter((p) => p.ativo && p.tipo === "produzido")
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  function escolherProduto(id: string) {
    setProdutoId(id);
    const produto = db.produtos.find((p) => p.id === id);
    if (produto?.validade_padrao_dias !== undefined) {
      const base = new Date(`${dataProducao || hoje()}T12:00:00`);
      base.setDate(base.getDate() + produto.validade_padrao_dias);
      setValidade(base.toISOString().slice(0, 10));
    }
  }

  function salvar() {
    if (!produtoId || quantidade <= 0 || !validade) return;
    const agora = new Date().toISOString();
    const produto = db.produtos.find((p) => p.id === produtoId);
    const dbNovo = mutate((d) => {
      criarLote(d, {
        id: uid("lote"),
        produto_id: produtoId,
        origem: "producao",
        porcionado_por_id: porcionadoPorId,
        quantidade,
        data_entrada: dataProducao || hoje(),
        validade,
        criado_em: agora,
        atualizado_em: agora,
      });
      d.movimentos_estoque.unshift({
        id: uid("mov"),
        produto_id: produtoId,
        tipo: "producao",
        quantidade,
        usuario_id: usuarioId,
        criado_em: agora,
        sincronizado: false,
      });
    });
    enviarEstoqueTotal(produto?.codigo_externo, estoqueAtual(dbNovo, produtoId));
    aoConcluir();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">
        Registre o total de sacos/porções preparados neste lote. Depois distribua esse total entre as caixas
        vazias usando o QR de cada caixa.
      </p>
      <Campo rotulo="Produto preparado">
        <select className="campo" value={produtoId} onChange={(e) => escolherProduto(e.target.value)}>
          <option value="">Escolha o produto…</option>
          {produzidos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </Campo>
      <Campo rotulo={`Total produzido${produtoId ? ` (${siglaUnidadeUso(db, produtoId)})` : ""}`}>
        <CampoQuantidade valor={quantidade} onChange={setQuantidade} />
      </Campo>
      <Campo rotulo="Quem porcionou">
        <select className="campo" value={porcionadoPorId} onChange={(e) => setPorcionadoPorId(e.target.value)}>
          {db.perfis.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </Campo>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo rotulo="Data de preparo">
          <input type="date" className="campo" value={dataProducao} onChange={(e) => setDataProducao(e.target.value)} />
        </Campo>
        <Campo rotulo="Validade">
          <input type="date" className="campo" value={validade} onChange={(e) => setValidade(e.target.value)} />
        </Campo>
      </div>
      <button className="btn-gigante" disabled={!produtoId || quantidade <= 0 || !validade} onClick={salvar}>
        Registrar lote de produção
      </button>
    </div>
  );
}

// ---------- Página ----------

export default function EstoquePage() {
  const db = useDB();
  const { papel } = usePapel();
  const usuarioId = db.perfis.find((p) => p.papel === papel)?.id ?? "perfil-dono";

  const [aba, setAba] = useState<Aba>("estoque");
  const [caixaAtivaId, setCaixaAtivaId] = useState<string | null>(null);
  const [qrDesconhecido, setQrDesconhecido] = useState<string | null>(null);
  const [modoBaixa, setModoBaixa] = useState(false);
  const [baixaQtd, setBaixaQtd] = useState(1);
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroLocal, setFiltroLocal] = useState("");
  const [registrandoProducao, setRegistrandoProducao] = useState(false);

  // Balanço
  const [tipoNovoBalanco, setTipoNovoBalanco] = useState<"insumos" | "produzidos">("insumos");
  const [conferindoCaixaId, setConferindoCaixaId] = useState<string | null>(null);
  const [qtdEncontrada, setQtdEncontrada] = useState(0);
  const [resumoBalancoId, setResumoBalancoId] = useState<string | null>(null);

  const balancoAtivo = db.balancos.find((b) => b.status === "em_andamento");
  const caixaAtiva = db.caixas.find((c) => c.id === caixaAtivaId);
  const loteCaixaAtiva = caixaAtiva ? loteDaCaixa(db, caixaAtiva.id) : undefined;

  // Janela de vencimentos configurável: atalhos (hoje/3/7/15 dias) ou data escolhida
  const [dataAlvoVencimento, setDataAlvoVencimento] = useState(() => hojeMais(3));
  const vencendo = db.caixas
    .filter((c) => c.status !== "vazia" && c.validade && c.validade <= dataAlvoVencimento)
    .sort((a, b) => (a.validade ?? "").localeCompare(b.validade ?? ""));

  function abrirConferencia(caixa: Caixa) {
    setConferindoCaixaId(caixa.id);
    const jaConferida = balancoAtivo
      ? db.balanco_itens.find((i) => i.balanco_id === balancoAtivo.id && i.caixa_id === caixa.id)
      : undefined;
    setQtdEncontrada(jaConferida ? jaConferida.qtd_encontrada : caixa.quantidade ?? 0);
  }

  function aoLerCodigo(codigo: string) {
    const caixa = db.caixas.find((c) => c.qr_code.toLowerCase() === codigo.trim().toLowerCase());
    if (!caixa) {
      setQrDesconhecido(codigo.trim());
      setCaixaAtivaId(null);
      return;
    }
    setQrDesconhecido(null);
    if (aba === "balanco" && balancoAtivo) {
      abrirConferencia(caixa);
      return;
    }
    setCaixaAtivaId(caixa.id);
    setModoBaixa(false);
    setBaixaQtd(1);
  }

  function darBaixa() {
    if (!caixaAtiva || !caixaAtiva.produto_id || baixaQtd <= 0) return;
    const produtoId = caixaAtiva.produto_id;
    const produto = db.produtos.find((p) => p.id === produtoId);
    const agora = new Date().toISOString();
    const quantidadeBaixa = Math.min(baixaQtd, caixaAtiva.quantidade ?? 0);
    const dbNovo = mutate((d) => {
      const c = d.caixas.find((x) => x.id === caixaAtiva.id);
      if (!c) return;
      baixarLoteDaCaixa(d, caixaAtiva.id, quantidadeBaixa, agora);
      const nova = (c.quantidade ?? 0) - quantidadeBaixa;
      if (nova <= 0) {
        esvaziarCampos(c);
      } else {
        c.quantidade = nova;
        c.status = "em_uso";
        c.atualizado_em = agora;
      }
      d.movimentos_estoque.unshift({
        id: uid("mov"),
        produto_id: produtoId,
        caixa_id: caixaAtiva.id,
        tipo: "baixa",
        quantidade: -quantidadeBaixa,
        usuario_id: usuarioId,
        criado_em: agora,
        sincronizado: false,
      });
    });
    enviarEstoqueTotal(produto?.codigo_externo, estoqueAtual(dbNovo, produtoId));
    setModoBaixa(false);
    setBaixaQtd(1);
  }

  function esvaziarCaixa() {
    if (!caixaAtiva || !caixaAtiva.produto_id) return;
    const restante = caixaAtiva.quantidade ?? 0;
    const ok = window.confirm(
      `Esvaziar a caixa nº ${caixaAtiva.numero}? ${
        restante > 0 ? `Os ${qtd(restante, siglaUnidadeUso(db, caixaAtiva.produto_id))} restantes sairão do estoque.` : ""
      }`
    );
    if (!ok) return;
    const produtoId = caixaAtiva.produto_id;
    const produto = db.produtos.find((p) => p.id === produtoId);
    const agora = new Date().toISOString();
    const dbNovo = mutate((d) => {
      const c = d.caixas.find((x) => x.id === caixaAtiva.id);
      if (!c) return;
      baixarLoteDaCaixa(d, caixaAtiva.id, restante, agora);
      esvaziarCampos(c);
      if (restante > 0) {
        d.movimentos_estoque.unshift({
          id: uid("mov"),
          produto_id: produtoId,
          caixa_id: caixaAtiva.id,
          tipo: "baixa",
          quantidade: -restante,
          usuario_id: usuarioId,
          criado_em: agora,
          sincronizado: false,
        });
      }
    });
    enviarEstoqueTotal(produto?.codigo_externo, estoqueAtual(dbNovo, produtoId));
  }

  // ---------- Balanço ----------

  function iniciarBalanco() {
    mutate((d) => {
      d.balancos.unshift({
        id: uid("bal"),
        tipo: tipoNovoBalanco,
        status: "em_andamento",
        realizado_por: usuarioId,
        iniciado_em: new Date().toISOString(),
      });
    });
    setResumoBalancoId(null);
  }

  function caixasDoBalanco(tipo: "insumos" | "produzidos"): Caixa[] {
    const tipoProduto = tipo === "insumos" ? "comprado" : "produzido";
    return db.caixas.filter((c) => {
      if (c.status === "vazia" || !c.produto_id) return false;
      const produto = db.produtos.find((p) => p.id === c.produto_id);
      return produto?.tipo === tipoProduto;
    });
  }

  function salvarConferencia() {
    if (!balancoAtivo || !conferindoCaixaId) return;
    const caixa = db.caixas.find((c) => c.id === conferindoCaixaId);
    if (!caixa || !caixa.produto_id) return;
    const produtoId = caixa.produto_id;
    const agora = new Date().toISOString();
    const dbNovo = mutate((d) => {
      const caixaAtual = d.caixas.find((c) => c.id === conferindoCaixaId);
      if (!caixaAtual) return;
      const quantidadeAnterior = caixaAtual.quantidade ?? 0;
      const delta = qtdEncontrada - quantidadeAnterior;
      const existente = d.balanco_itens.find(
        (i) => i.balanco_id === balancoAtivo.id && i.caixa_id === conferindoCaixaId
      );
      if (existente) {
        existente.qtd_encontrada = qtdEncontrada;
      } else {
        d.balanco_itens.push({
          id: uid("bi"),
          balanco_id: balancoAtivo.id,
          caixa_id: conferindoCaixaId,
          qtd_esperada: caixa.quantidade ?? 0,
          qtd_encontrada: qtdEncontrada,
        });
      }
      ajustarLoteDaCaixa(d, conferindoCaixaId, qtdEncontrada, agora);
      caixaAtual.quantidade = qtdEncontrada;
      caixaAtual.status = qtdEncontrada < quantidadeAnterior ? "em_uso" : caixaAtual.status;
      caixaAtual.atualizado_em = agora;
      if (delta !== 0) {
        d.movimentos_estoque.unshift({
          id: uid("mov"),
          produto_id: produtoId,
          caixa_id: conferindoCaixaId,
          tipo: "ajuste_balanco",
          quantidade: delta,
          usuario_id: usuarioId,
          criado_em: agora,
          sincronizado: false,
        });
      }
    });
    const produto = dbNovo.produtos.find((p) => p.id === produtoId);
    enviarEstoqueTotal(produto?.codigo_externo, estoqueAtual(dbNovo, produtoId));
    setConferindoCaixaId(null);
  }

  function concluirBalanco() {
    if (!balancoAtivo) return;
    const agora = new Date().toISOString();
    mutate((d) => {
      d.balanco_itens
        .filter((i) => i.balanco_id === balancoAtivo.id && i.qtd_encontrada <= 0)
        .forEach((item) => {
          const caixa = d.caixas.find((c) => c.id === item.caixa_id);
          if (caixa) esvaziarCampos(caixa);
        });
      const bal = d.balancos.find((b) => b.id === balancoAtivo.id);
      if (bal) {
        bal.status = "concluido";
        bal.concluido_em = agora;
      }
    });

    setResumoBalancoId(balancoAtivo.id);
  }

  // ---------- Dados derivados para a lista ----------

  const caixasFiltradas = useMemo(() => {
    const texto = filtroTexto.trim().toLowerCase();
    return [...db.caixas]
      .sort((a, b) => a.numero - b.numero)
      .filter((c) => {
        if (filtroLocal && c.local_id !== filtroLocal) return false;
        if (!texto) return true;
        const alvo = `${c.numero} ${c.qr_code} ${nomeProduto(db, c.produto_id)}`.toLowerCase();
        return alvo.includes(texto);
      });
  }, [db, filtroTexto, filtroLocal]);

  const fifoDaAtiva =
    caixaAtiva && caixaAtiva.produto_id ? caixaFifo(db, caixaAtiva.produto_id) : undefined;
  const avisoFifo = fifoDaAtiva && caixaAtiva && fifoDaAtiva.id !== caixaAtiva.id ? fifoDaAtiva : undefined;

  const caixasBalanco = balancoAtivo ? caixasDoBalanco(balancoAtivo.tipo) : [];
  const itensBalanco = balancoAtivo ? db.balanco_itens.filter((i) => i.balanco_id === balancoAtivo.id) : [];
  const diferencasBalanco = itensBalanco.filter((i) => i.qtd_encontrada !== i.qtd_esperada);
  const caixaConferindo = db.caixas.find((c) => c.id === conferindoCaixaId);
  const lotesPendentes = lotesPendentesDeAlocacao(db);

  const resumoBalanco = resumoBalancoId ? db.balancos.find((b) => b.id === resumoBalancoId) : undefined;
  const resumoDiferencas = resumoBalancoId
    ? db.balanco_itens.filter((i) => i.balanco_id === resumoBalancoId && i.qtd_encontrada !== i.qtd_esperada)
    : [];

  return (
    <div className="space-y-4">
      <TituloPagina titulo="Estoque por caixas" />

      {/* Abas */}
      <div className="flex gap-2">
        <button
          className={aba === "estoque" ? "btn-primario flex-1" : "btn-secundario flex-1"}
          onClick={() => setAba("estoque")}
        >
          <Boxes size={18} /> Estoque
        </button>
        <button
          className={aba === "balanco" ? "btn-primario flex-1" : "btn-secundario flex-1"}
          onClick={() => setAba("balanco")}
        >
          <ClipboardList size={18} /> Balanço
          {balancoAtivo && <Badge cor="laranja">em andamento</Badge>}
        </button>
      </div>

      {aba === "estoque" && (
        <button className="btn-primario w-full sm:w-auto" onClick={() => setRegistrandoProducao(true)}>
          <Plus size={18} /> Registrar produção para distribuir
        </button>
      )}

      {aba === "estoque" && lotesPendentes.length > 0 && (
        <Card className="border-2 border-destaque bg-destaque-clara">
          <p className="flex items-center gap-2 font-bold text-destaque">
            <TriangleAlert size={20} /> {lotesPendentes.length} {lotesPendentes.length === 1 ? "lote aguarda" : "lotes aguardam"} distribuição em caixa
          </p>
          <p className="mt-1 text-sm text-stone-700">
            O saldo já está no estoque. Escaneie uma caixa vazia e escolha o lote para registrar sua
            localização física sem gerar outra entrada.
          </p>
        </Card>
      )}

      {/* Scanner — sempre visível */}
      <Card>
        <CodeScanner
          rotulo={aba === "balanco" && balancoAtivo ? "Escanear caixa do balanço" : "Escanear caixa"}
          onLeitura={aoLerCodigo}
        />
        {qrDesconhecido && (
          <p className="mt-2 rounded-card bg-destaque-clara px-3 py-2 text-sm text-destaque">
            Não conheço o código &quot;{qrDesconhecido}&quot;. Confira se é o QR de uma caixa do restaurante
            (ex.: CXCHEF-003) ou cadastre a caixa primeiro.
          </p>
        )}
      </Card>

      {aba === "estoque" && (
        <>
          {/* Caixa escaneada */}
          {caixaAtiva && (
            <Card className="border-2 border-primaria">
              {caixaAtiva.status === "vazia" ? (
                <FormEncher db={db} caixa={caixaAtiva} usuarioId={usuarioId} aoConcluir={() => setCaixaAtivaId(null)} />
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xl font-bold">
                      Caixa nº {caixaAtiva.numero} — {nomeProduto(db, caixaAtiva.produto_id)}
                    </p>
                    <Badge cor={caixaAtiva.status === "cheia" ? "verde" : "azul"}>
                      {ROTULO_STATUS_CAIXA[caixaAtiva.status]}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <p className="rotulo">Quantidade</p>
                      <p className="text-lg font-bold">
                        {qtd(caixaAtiva.quantidade, siglaUnidadeUso(db, caixaAtiva.produto_id))}
                      </p>
                    </div>
                    <div>
                      <p className="rotulo">Validade</p>
                      <p className="font-semibold">{rotuloValidade(caixaAtiva.validade)}</p>
                      <p className="text-xs text-slate-500">{dataBR(caixaAtiva.validade)}</p>
                    </div>
                    <div>
                      <p className="rotulo">Local</p>
                      <p className="flex items-center gap-1 font-semibold">
                        <MapPin size={14} /> {nomeLocal(db, caixaAtiva.local_id)}
                      </p>
                    </div>
                    <div>
                      <p className="rotulo">{loteCaixaAtiva?.origem === "producao" ? "Preparo" : "Entrada"}</p>
                      <p className="font-semibold">{dataBR(caixaAtiva.data_envase)}</p>
                    </div>
                  </div>
                  {loteCaixaAtiva?.origem === "producao" && (
                    <p className="rounded-card bg-slate-50 px-3 py-2 text-sm">
                      Porcionado por <strong>{nomePerfil(db, loteCaixaAtiva.porcionado_por_id)}</strong>
                    </p>
                  )}

                  {avisoFifo && (
                    <div className="flex items-start gap-2 rounded-card border-2 border-destaque bg-destaque-clara p-3">
                      <TriangleAlert size={24} className="mt-0.5 shrink-0 text-destaque" />
                      <p className="font-semibold text-destaque">
                        Esta não é a caixa prioritária! Use antes a caixa nº {avisoFifo.numero} —{" "}
                        {nomeLocal(db, avisoFifo.local_id)}.
                      </p>
                    </div>
                  )}

                  {modoBaixa ? (
                    <div className="space-y-3 rounded-card bg-slate-50 p-3">
                      <Campo rotulo={`Quantidade a baixar (${siglaUnidadeUso(db, caixaAtiva.produto_id)})`}>
                        <CampoQuantidade valor={baixaQtd} onChange={setBaixaQtd} />
                      </Campo>
                      <div className="flex gap-2">
                        <button className="btn-primario flex-1 py-4 text-lg" onClick={darBaixa}>
                          <ArrowDownCircle size={22} /> Confirmar baixa
                        </button>
                        <button className="btn-secundario" onClick={() => setModoBaixa(false)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-primario flex-1 py-4 text-lg" onClick={() => setModoBaixa(true)}>
                        <ArrowDownCircle size={22} /> Dar baixa
                      </button>
                      <button className="btn-perigo" onClick={esvaziarCaixa}>
                        Esvaziar caixa
                      </button>
                      <button className="btn-secundario" onClick={() => setCaixaAtivaId(null)}>
                        Fechar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {/* Alertas de validade — janela configurável */}
          <Card className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-bold">
                <Timer size={20} className="text-destaque" /> Vencimentos até {dataBR(dataAlvoVencimento)}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { rotulo: "Hoje", dias: 0 },
                  { rotulo: "3 dias", dias: 3 },
                  { rotulo: "7 dias", dias: 7 },
                  { rotulo: "15 dias", dias: 15 },
                ].map((opcao) => (
                  <button
                    key={opcao.dias}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      dataAlvoVencimento === hojeMais(opcao.dias)
                        ? "bg-primaria text-white"
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                    onClick={() => setDataAlvoVencimento(hojeMais(opcao.dias))}
                  >
                    {opcao.rotulo}
                  </button>
                ))}
                <input
                  type="date"
                  className="rounded-full border border-stone-200 px-2 py-0.5 text-xs"
                  value={dataAlvoVencimento}
                  onChange={(e) => e.target.value && setDataAlvoVencimento(e.target.value)}
                  aria-label="Escolher data limite"
                />
              </div>
            </div>
            {vencendo.length === 0 && (
              <p className="py-2 text-sm text-stone-500">
                Nenhuma caixa vence até {dataBR(dataAlvoVencimento)}. 👍
              </p>
            )}
              {vencendo.map((c) => {
                const dias = diasAte(c.validade);
                const vencida = dias !== undefined && dias <= 0;
                return (
                  <button
                    key={c.id}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-card bg-slate-50 px-3 py-2 text-left hover:bg-slate-100"
                    onClick={() => {
                      setCaixaAtivaId(c.id);
                      setModoBaixa(false);
                    }}
                  >
                    <span className="text-sm font-medium">
                      Caixa nº {c.numero} — {nomeProduto(db, c.produto_id)} ·{" "}
                      {qtd(c.quantidade, siglaUnidadeUso(db, c.produto_id))} · {nomeLocal(db, c.local_id)}
                    </span>
                    <Badge cor={vencida ? "vermelho" : "laranja"}>{rotuloValidade(c.validade)}</Badge>
                  </button>
                );
              })}
          </Card>

          {/* Lista de todas as caixas */}
          <Card className="space-y-3">
            <p className="font-bold">Todas as caixas</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className="campo"
                placeholder="Buscar por produto ou nº da caixa…"
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
              />
              <select
                className="campo sm:max-w-[220px]"
                value={filtroLocal}
                onChange={(e) => setFiltroLocal(e.target.value)}
              >
                <option value="">Todos os locais</option>
                {db.locais.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            </div>
            {caixasFiltradas.length === 0 ? (
              <Vazio mensagem="Nenhuma caixa encontrada com esse filtro." />
            ) : (
              <div className="divide-y divide-slate-100">
                {caixasFiltradas.map((c) => (
                  <button
                    key={c.id}
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-1 py-3 text-left hover:bg-slate-50"
                    onClick={() => {
                      setCaixaAtivaId(c.id);
                      setModoBaixa(false);
                      setQrDesconhecido(null);
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        Nº {c.numero} · {c.status === "vazia" ? "— vazia —" : nomeProduto(db, c.produto_id)}
                      </span>
                      {c.status !== "vazia" && (
                        <span className="block text-sm text-slate-600">
                          {qtd(c.quantidade, siglaUnidadeUso(db, c.produto_id))} · {rotuloValidade(c.validade)} ·{" "}
                          {nomeLocal(db, c.local_id)}
                        </span>
                      )}
                    </span>
                    <Badge cor={c.status === "vazia" ? "cinza" : c.status === "cheia" ? "verde" : "azul"}>
                      {ROTULO_STATUS_CAIXA[c.status]}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {aba === "balanco" && (
        <>
          {/* Resumo do balanço recém-concluído */}
          {resumoBalanco && !balancoAtivo && (
            <Card className="space-y-2 border-2 border-sucesso">
              <p className="flex items-center gap-2 text-lg font-bold text-primaria-escura">
                <CircleCheck size={22} className="text-sucesso" /> Balanço concluído!
              </p>
              {resumoDiferencas.length === 0 ? (
                <p className="text-sm text-slate-600">Nenhuma diferença encontrada — estoque batendo certinho.</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-slate-600">Ajustes registrados:</p>
                  {resumoDiferencas.map((i) => {
                    const caixa = db.caixas.find((c) => c.id === i.caixa_id);
                    const delta = i.qtd_encontrada - i.qtd_esperada;
                    return (
                      <p key={i.id} className="text-sm font-medium">
                        Caixa nº {caixa?.numero ?? "?"}: esperado {qtd(i.qtd_esperada)} → encontrado{" "}
                        {qtd(i.qtd_encontrada)}{" "}
                        <span className={delta < 0 ? "text-erro" : "text-primaria"}>
                          ({delta > 0 ? "+" : ""}
                          {qtd(delta)})
                        </span>
                      </p>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {!balancoAtivo ? (
            <Card className="space-y-3">
              <p className="font-bold">Iniciar novo balanço</p>
              <p className="text-sm text-slate-600">
                Escolha o tipo e depois escaneie as caixas uma a uma, digitando a quantidade encontrada.
              </p>
              <div className="flex gap-2">
                <button
                  className={tipoNovoBalanco === "insumos" ? "btn-primario flex-1" : "btn-secundario flex-1"}
                  onClick={() => setTipoNovoBalanco("insumos")}
                >
                  Insumos (semanal)
                </button>
                <button
                  className={tipoNovoBalanco === "produzidos" ? "btn-primario flex-1" : "btn-secundario flex-1"}
                  onClick={() => setTipoNovoBalanco("produzidos")}
                >
                  Produzidos (a cada 2 dias)
                </button>
              </div>
              <button className="btn-gigante" onClick={iniciarBalanco}>
                <ClipboardList size={26} /> Iniciar balanço
              </button>
            </Card>
          ) : (
            <>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold">
                    Balanço de {balancoAtivo.tipo === "insumos" ? "insumos" : "produzidos"} em andamento
                  </p>
                  <p className="text-2xl font-bold text-primaria">
                    {itensBalanco.length} de {caixasBalanco.length} caixas conferidas
                  </p>
                </div>
                <button
                  className="btn-primario py-4 text-lg"
                  onClick={concluirBalanco}
                  disabled={itensBalanco.length === 0}
                >
                  <CircleCheck size={22} /> Concluir balanço
                </button>
              </Card>

              {/* Só as diferenças */}
              {diferencasBalanco.length > 0 && (
                <Card className="space-y-2 border-2 border-destaque">
                  <p className="flex items-center gap-2 font-bold text-destaque">
                    <TriangleAlert size={20} /> Diferenças encontradas ({diferencasBalanco.length})
                  </p>
                  {diferencasBalanco.map((i) => {
                    const caixa = db.caixas.find((c) => c.id === i.caixa_id);
                    const delta = i.qtd_encontrada - i.qtd_esperada;
                    return (
                      <p key={i.id} className="text-sm font-medium">
                        Caixa nº {caixa?.numero ?? "?"} — {nomeProduto(db, caixa?.produto_id)}: esperado{" "}
                        {qtd(i.qtd_esperada)} × encontrado {qtd(i.qtd_encontrada)}{" "}
                        <span className={delta < 0 ? "text-erro" : "text-primaria"}>
                          ({delta > 0 ? "+" : ""}
                          {qtd(delta)})
                        </span>
                      </p>
                    );
                  })}
                </Card>
              )}

              <Card className="space-y-1">
                <p className="mb-2 font-bold">Caixas deste balanço</p>
                {caixasBalanco.length === 0 ? (
                  <Vazio mensagem="Nenhuma caixa com produto deste tipo no momento." />
                ) : (
                  caixasBalanco.map((c) => {
                    const conferida = itensBalanco.find((i) => i.caixa_id === c.id);
                    return (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-2 last:border-0"
                      >
                        <span className="min-w-0">
                          <span className="block font-semibold">
                            Nº {c.numero} · {nomeProduto(db, c.produto_id)}
                          </span>
                          <span className="block text-sm text-slate-600">
                            esperado {qtd(c.quantidade, siglaUnidadeUso(db, c.produto_id))} · {nomeLocal(db, c.local_id)}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          {conferida && (
                            <Badge cor={conferida.qtd_encontrada === conferida.qtd_esperada ? "verde" : "laranja"}>
                              encontrado {qtd(conferida.qtd_encontrada)}
                            </Badge>
                          )}
                          <button className="btn-secundario" onClick={() => abrirConferencia(c)}>
                            {conferida ? "Refazer" : "Conferir"}
                          </button>
                        </span>
                      </div>
                    );
                  })
                )}
              </Card>
            </>
          )}
        </>
      )}

      {/* Modal de conferência do balanço */}
      <Modal
        aberto={Boolean(conferindoCaixaId && caixaConferindo)}
        titulo={`Caixa nº ${caixaConferindo?.numero ?? ""} — ${nomeProduto(db, caixaConferindo?.produto_id)}`}
        onFechar={() => setConferindoCaixaId(null)}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Quantidade registrada antes desta leitura:{" "}
            <span className="font-bold text-texto">
              {qtd(caixaConferindo?.quantidade, siglaUnidadeUso(db, caixaConferindo?.produto_id))}
            </span>
          </p>
          <Campo rotulo="Quantidade restante na caixa">
            <CampoQuantidade valor={qtdEncontrada} onChange={setQtdEncontrada} />
          </Campo>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn-secundario"
              onClick={() => setQtdEncontrada(caixaConferindo?.quantidade ?? 0)}
            >
              Sem alteração
            </button>
            <button className="btn-secundario" onClick={() => setQtdEncontrada(0)}>
              Caixa vazia
            </button>
          </div>
          <p className="text-xs text-stone-500">
            Ao salvar, o saldo da caixa, do lote e do estoque total será atualizado imediatamente.
          </p>
          <button className="btn-gigante" onClick={salvarConferencia}>
            <CircleCheck size={26} /> Atualizar estoque
          </button>
        </div>
      </Modal>

      <Modal
        aberto={registrandoProducao}
        titulo="Novo lote de produção"
        onFechar={() => setRegistrandoProducao(false)}
      >
        <FormRegistrarProducao db={db} usuarioId={usuarioId} aoConcluir={() => setRegistrandoProducao(false)} />
      </Modal>
    </div>
  );
}
