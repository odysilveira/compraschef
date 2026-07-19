# 🚀 ITEM 3 — Prompt de Kickoff para Claude Code

> Copie tudo dentro do bloco abaixo e cole no Claude Code quando for começar a construir.
> Onde estiver indicado, complete com o conteúdo dos arquivos `01-banco-de-dados.md` e `02-requisitos-funcionais.md`.

````
Você é um desenvolvedor senior. Implemente o sistema ComprasChef do zero.
Stack: Next.js 14 App Router + Tailwind + Supabase.
Não me explique — apenas implemente.

## Sistema
ComprasChef é o módulo de compras e estoque de um restaurante. Cobre o ciclo completo:
previsão de falta por estoque mínimo → lista de compras → cotação enviada por WhatsApp
com link exclusivo que o fornecedor preenche no celular (sem login) → comparação com
recomendação de IA (preço, prazo, pedido mínimo, histórico) → aprovação exclusiva do dono
→ pedido ao fornecedor → importação automática de NF-e (XML) → boletos travados até a
conferência da mercadoria (com verificação anti-golpe de CNPJ/valor) → recebimento com
leitor de código, fotos e divergências → entrada no estoque.

O estoque é controlado por CAIXAS FÍSICAS com QR code fixo: cada caixa registra produto,
quantidade, data, validade e local (freezer/gaveta/prateleira). O sistema indica qual
caixa usar primeiro (FIFO) e onde está. Balanço por leitura de QR: semanal para insumos,
a cada 2 dias para produtos de produção própria. Produtos têm tipo 'comprado' ou
'produzido'.

Usuários: dono (tudo + aprovação final), gerente (tudo exceto aprovar), líder de cozinha
e caixa (telas operacionais SEM valores/preços). Interface em português (pt-BR),
responsiva (desktop, tablet e celular), com botões grandes nas telas operacionais.
Leitura de QR/código de barras pela câmera (usar biblioteca de scan no navegador) e
compatível com leitor Bluetooth (entrada como teclado).

Integração futura com um ERP parceiro (Caminho A): este sistema é a fonte da verdade do
estoque e envia totais ao ERP; consulta fichas técnicas e vendas de lá. Por isso produtos,
fornecedores e unidades têm campo codigo_externo com os códigos compartilhados. Implemente
a fila integracao_eventos e deixe os pontos de integração como funções isoladas em
/lib/integracao (com implementação mock por enquanto).

Telas: Painel inicial (alertas de estoque mínimo, cotações aguardando, pedidos a aprovar,
entregas do dia, boletos a vencer, divergências) · Cotações (quadro comparativo +
recomendação IA) · Pedidos · Recebimento (scanner, checklist, foto, divergência) ·
Estoque por caixas (scanner, FIFO, locais, balanço) · Financeiro (agenda de boletos) ·
Relatórios (consumo médio, gasto por fornecedor/mês, histórico de preços) · Cadastros
(fornecedores, produtos, unidades, locais, caixas) · Página pública do fornecedor
(/cotacao/[token]: mobile-first, sem login, preços pré-preenchidos, campos de preço,
prazo, indisponível e substituto).

## Banco de Dados (Supabase)
[Colar aqui o ITEM 1 completo — todas as tabelas e observações de RLS]

## Requisitos Funcionais
[Colar aqui o ITEM 2 completo — requisitos 1 a 54]

## Configuração Supabase
- Auth: email + senha; tabela perfis com papel ('dono'|'gerente'|'lider'|'caixa')
- RLS: conforme observações do banco — lider/caixa sem acesso a preços/financeiro
  (views operacionais sem colunas de valor); aprovação de pedido restrita ao dono
- Storage: buckets para fotos de recebimento e XMLs de NF-e
- Edge Functions: (1) página do fornecedor — valida token, lê/grava apenas os itens
  daquela cotação, respeita expiração; (2) processamento de XML de NF-e (parse do XML,
  criação de nota + boletos, vínculo com pedido); (3) envio de mensagens WhatsApp
  (deixar como interface com mock — provedor será definido depois)
- IA de análise de cotações: usar a API da Anthropic (modelo claude-sonnet-5) para gerar
  a recomendação com justificativa em português, gravada em pedidos.analise_ia
- PWA: service worker com fila offline apenas para as rotas de recebimento, estoque e
  balanço; sincronização automática ao reconectar

## Fora de escopo desta versão (NÃO implementar agora)
Leilão reverso, curva ABC, CMV, alerta de margem no cardápio, avaliação de fornecedores,
cotação recorrente agendada, painel do fornecedor logado, assistente via WhatsApp,
download automático da SEFAZ via certificado A1 (deixar apenas a importação por
upload/e-mail de XML preparada).

Use componentes visuais fiéis ao protótipo do Stitch (referência será fornecida).
Comece pelo setup: criar projeto Next.js, instalar dependências e configurar o cliente
Supabase.
````
