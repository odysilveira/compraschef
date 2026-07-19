# Edge Functions (Supabase)

Esqueletos prontos para deploy quando a conta Supabase existir (`supabase functions deploy <nome>`).
Enquanto isso, o app roda com a camada mock e a página do fornecedor grava direto no banco local.

| Função | O que faz |
|---|---|
| `cotacao-fornecedor` | Valida o token do link público, lê os itens da cotação e grava a resposta do fornecedor. Única porta de entrada do fornecedor — sem login, sem acesso direto ao banco. |
| `processar-nfe` | Recebe o XML da NF-e (upload ou e-mail monitorado), extrai nota + duplicatas, cria boletos travados e vincula ao pedido. |
| `enviar-whatsapp` | Interface de envio de mensagens (cotações, pedidos, lembretes). Mock — o provedor (ex.: Z-API, Twilio) será definido depois. |
