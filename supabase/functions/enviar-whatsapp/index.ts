// Edge Function: envio de mensagens WhatsApp (cotações, pedidos, lembretes)
// MOCK — o provedor real (Z-API, Twilio, Meta Cloud API...) será definido depois.
// A interface já é a definitiva: trocar apenas o corpo desta função.

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ erro: "método não suportado" }, { status: 405 });
  }

  const { para, mensagem } = await req.json();

  console.log(`[mock whatsapp] para=${para} mensagem=${mensagem?.slice(0, 80)}...`);

  return Response.json({ ok: true, simulado: true });
});
