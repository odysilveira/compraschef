// Edge Function: página do fornecedor (link público /cotacao/[token])
// GET  -> valida token + prazo e devolve os itens da cotação
// POST -> grava preços/prazos/substitutos e marca a cotação como respondida
//
// ESQUELETO — deploy quando o Supabase estiver configurado.

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return Response.json({ erro: "token ausente" }, { status: 400 });

  const { data: cotacao } = await supabase
    .from("cotacoes")
    .select("id, status, prazo_resposta, fornecedor_id")
    .eq("token", token)
    .single();

  if (!cotacao) return Response.json({ erro: "cotação não encontrada" }, { status: 404 });
  if (new Date(cotacao.prazo_resposta) < new Date()) {
    return Response.json({ erro: "prazo expirado" }, { status: 410 });
  }

  if (req.method === "GET") {
    const { data: itens } = await supabase
      .from("cotacao_itens")
      .select("id, produto_id, quantidade, preco_unitario, disponivel")
      .eq("cotacao_id", cotacao.id);
    return Response.json({ cotacao, itens });
  }

  if (req.method === "POST") {
    const corpo = await req.json();
    for (const item of corpo.itens ?? []) {
      await supabase
        .from("cotacao_itens")
        .update({
          preco_unitario: item.preco_unitario,
          prazo_entrega_dias: item.prazo_entrega_dias,
          disponivel: item.disponivel,
          substituto_descricao: item.substituto_descricao,
          substituto_preco: item.substituto_preco,
        })
        .eq("id", item.id)
        .eq("cotacao_id", cotacao.id);
    }
    await supabase
      .from("cotacoes")
      .update({ status: "respondida", respondida_em: new Date().toISOString() })
      .eq("id", cotacao.id);
    return Response.json({ ok: true });
  }

  return Response.json({ erro: "método não suportado" }, { status: 405 });
});
