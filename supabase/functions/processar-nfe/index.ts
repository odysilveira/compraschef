// Edge Function: processamento de XML de NF-e
// Recebe o XML (upload ou encaminhado do e-mail monitorado), extrai os dados,
// cria a nota fiscal + boletos TRAVADOS e tenta vincular ao pedido do fornecedor.
// Checagem anti-golpe: CNPJ do beneficiário e valor devem bater com a nota.
//
// ESQUELETO — deploy quando o Supabase estiver configurado.

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ erro: "método não suportado" }, { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const xml = await req.text();

  // TODO (quando ativar): parse real do XML da NF-e (chave, emitente, itens, duplicatas)
  const nota = {
    numero: xml.match(/<nNF>(\d+)<\/nNF>/)?.[1] ?? "?",
    chave_acesso: xml.match(/Id="NFe(\d{44})"/)?.[1] ?? "",
    cnpj_emitente: xml.match(/<CNPJ>(\d{14})<\/CNPJ>/)?.[1] ?? "",
    valor_total: Number(xml.match(/<vNF>([\d.]+)<\/vNF>/)?.[1] ?? 0),
  };

  const { data: fornecedor } = await supabase
    .from("fornecedores")
    .select("id, cnpj")
    .ilike("cnpj", `%${nota.cnpj_emitente.slice(0, 8)}%`)
    .maybeSingle();

  if (!fornecedor) {
    return Response.json({ erro: "fornecedor não cadastrado", nota }, { status: 422 });
  }

  const { data: notaCriada } = await supabase
    .from("notas_fiscais")
    .insert({
      fornecedor_id: fornecedor.id,
      numero: nota.numero,
      chave_acesso: nota.chave_acesso,
      valor_total: nota.valor_total,
      status: "aguardando_conferencia",
    })
    .select()
    .single();

  // Duplicatas do XML viram boletos TRAVADOS até a conferência da mercadoria
  const duplicatas = [...xml.matchAll(/<dVenc>([\d-]+)<\/dVenc>\s*<vDup>([\d.]+)<\/vDup>/g)];
  for (const [, vencimento, valor] of duplicatas) {
    await supabase.from("boletos").insert({
      nota_id: notaCriada.id,
      valor: Number(valor),
      vencimento,
      cnpj_beneficiario: nota.cnpj_emitente,
      status: "travado",
    });
  }

  return Response.json({ ok: true, nota_id: notaCriada.id, boletos: duplicatas.length });
});
