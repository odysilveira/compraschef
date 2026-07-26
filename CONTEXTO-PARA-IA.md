# ComprasChef — Contexto para IA / Handoff técnico

> Cole este arquivo (ou aponte a IA para ele) ao abrir o projeto em outra ferramenta.
> Objetivo: dar a uma IA todo o contexto de produto e arquitetura para continuar o trabalho
> sem re-descobrir tudo. Comentários e UI do código estão em **português (pt-BR)**.

## 1. O que é o produto

**ComprasChef** é o módulo de **compras e estoque de um restaurante**, feito para o dono
(usuário **não-técnico**). Cobre o ciclo completo:

previsão de falta por estoque mínimo → lista de compras → cotação enviada por WhatsApp com
link exclusivo que o fornecedor preenche no celular (sem login) → comparação com recomendação
de "IA" → aprovação exclusiva do dono → pedido ao fornecedor → importação de NF-e →
boletos travados até a conferência da mercadoria (com verificação anti-golpe de CNPJ/valor) →
recebimento com leitor de código, fotos e divergências → entrada no estoque.

**Estoque por CAIXAS físicas com QR fixo**: cada caixa registra produto, quantidade, data,
validade e local (freezer/geladeira/estoque seco). O sistema indica qual caixa usar primeiro
(FEFO por validade; FIFO por antiguidade no desempate) e onde está. Porcionamentos da cozinha são empacotados em **sacos (sc)**; validade
sugerida pelo destino (freezer +3 meses, geladeira +5 dias). Balanço por leitura de QR.
O saldo canônico fica em `lotes_estoque`: recebimento ou produção cria um lote ainda que ele
aguarde separação física. Um lote pode ser dividido entre várias caixas por `alocacoes_caixa`,
sem criar novas entradas. Estoque seco conta unidades; produzidos contam sacos/porções G ou P.
Lotes de produção registram `porcionado_por_id`. No balanço, cada leitura de caixa seguida da
quantidade restante atualiza imediatamente caixa, lote e saldo, gerando ajuste auditável.

**Integração futura com o ERP do parceiro (chamado "EASE EAT", restaurante "Italin House")
pelo Caminho A**: o ComprasChef é a fonte da verdade do estoque e envia totais ao ERP;
consulta fichas técnicas e vendas de lá. Por isso produtos/fornecedores/unidades têm campo
`codigo_externo` (códigos do EaseEat). Esses códigos nunca substituem o `id` interno. O código
`cProd` da NF-e pertence ao catálogo de cada fornecedor e fica em
`fornecedor_produtos.codigo_produto_fornecedor`; EAN/GTIN também é armazenado separadamente.
Ainda não conectado — ver `lib/integracao/`.

## 2. Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript strict**
- **Tailwind CSS** (design system alinhado ao ERP parceiro: cor primária âmbar `#F59E0B`,
  fundo creme `#F7F6F3`, ver `tailwind.config.ts` e `app/globals.css`)
- **lucide-react** (ícones) · **qrcode.react** (etiquetas de QR)
- **Supabase** previsto (migração e Edge Functions escritas, ainda NÃO conectado — roda em mock)

## 3. Arquitetura de dados (IMPORTANTE)

**Não há backend conectado ainda.** O app roda com uma **camada mock em memória +
localStorage**, com a MESMA forma dos tipos do Supabase, para trocar depois sem reescrever a UI.

- `lib/types.ts` — todos os tipos do domínio (espelham o banco).
- `lib/data/seed.ts` — banco de demonstração (um restaurante fictício completo). Datas são
  relativas a "hoje" e **fixadas ao meio-dia** para evitar hydration mismatch do Next.
- `lib/data/catalogo.ts` — catálogo real da cozinha (sabores freezer G/P, massas geladeira G/P,
  estoque seco) que alimenta produtos + página de etiquetas.
- `lib/data/index.ts` — o "banco": `useDB()` (hook reativo via useSyncExternalStore),
  `mutate(fn)` (clona → altera → persiste no localStorage → notifica), `uid(prefixo)`,
  `resetDB()`, e helpers de domínio (`estoqueAtual`, `caixaFifo`, `produtosAbaixoDoMinimo`,
  `consumoMedioDiario`, `precoMedioHistorico`, `precoForaDoPadrao`, `siglaParaItem`, lookups).
  `atualizarComNovidades()` faz "upsert" idempotente de itens novos do catálogo em bancos
  já salvos no navegador (para o demo evoluir sem perder o que o usuário digitou).
- Etapa 1C (fichas técnicas): arquitetura em 3 camadas.
  Domínio puro em `lib/domain/fichas-tecnicas.ts` (sem localStorage),
  contrato em `lib/domain/fichas-tecnicas-repositorio.ts` e adaptador local em
  `lib/domain/fichas-tecnicas-repositorio-local.ts`, usando o mesmo objeto central do banco mock.
  Migração retrocompatível no `lib/data/index.ts` inicializa coleções ausentes de fichas.
- `lib/supabase.ts` — cliente pronto; ativa sozinho quando `.env.local` tiver as chaves
  (`supabaseConfigurado`). Enquanto vazio, usa mock.
- `lib/roles.tsx` — papéis (dono/gerente/lider/caixa) via seletor no rodapé do menu
  (simula auth). `podeVerValores` (lider/caixa NÃO veem preços/boletos/notas),
  `podeAprovar` (só dono aprova pedidos).
- `lib/format.ts` — formatação pt-BR (moeda, qtd, datas, validade).
- `lib/integracao/index.ts` — pontos de integração com o ERP (MOCK: enfileiram eventos).

**Para migrar ao Supabase depois**: aplicar `supabase/migrations/0001_schema.sql`, preencher
`.env.local` (modelo em `.env.local.example`), e trocar as leituras/escritas de `lib/data`
por chamadas ao Supabase mantendo as assinaturas. RLS por papel já está no SQL.

## 4. Telas (rotas)

Dentro do grupo `app/(sistema)/` (com `AppShell` = menu lateral + papéis):
- `/` Painel · `/lista-compras` · `/cotacoes` · `/pedidos` · `/recebimento` · `/estoque`
  · `/financeiro` · `/relatorios` · `/cadastros`

Fora do shell:
- `app/cotacao/[token]/page.tsx` — página **pública** do fornecedor (mobile-first, sem login)
- `app/etiquetas/page.tsx` — folha de etiquetas de QR das caixas (para imprimir)

Componentes por área: `components/cadastros`, `components/compras`, `components/operacao`,
`components/relatorios`, `components/scanner` (leitor QR/código via BarcodeDetector + manual),
`components/shell` (AppShell), `components/ui.tsx` (kit: Card, TituloPagina, Badge, Campo,
Modal, Tabela, Vazio, StatCard).

## 5. Destaques de funcionalidade já prontos

- **Cotações**: quadro comparativo onde a sugestão da "IA" vem marcada em **laranja** e o dono
  marca a dele em **verde** tocando na célula; dois fechamentos ("minha cotação" × "sugestão
  da IA"), cada um com resumo por fornecedor e alerta de pedido mínimo. A "IA" é local
  (`components/compras/recomendacao.ts`) — menor preço penalizando preço fora do padrão;
  substituível por IA real (API Anthropic, modelo `claude-sonnet-5`) mantendo a assinatura.
- **Recebimento**: 3 caminhos — (a) pelo pedido; (b) importar XML da NF-e e confirmar item a
  item; (c) sem XML: ler QR da DANFE (extrai chave/CNPJ/nº) ou preencher à mão (hortifrúti).
  Também lista **DANFEs importadas da Receita** (mock, via `itens_importados` no seed) para
  escolher qual conferir. Na conferência do XML, fornecedor e produtos desconhecidos podem
  ser cadastrados sem sair da nota; o vínculo grava `cProd`, EAN, unidade e conversão para
  reconhecer as próximas notas automaticamente. Conferência OK libera boletos travados;
  boleto suspeito (CNPJ divergente) permanece bloqueado.
- **Estoque**: FEFO/FIFO com aviso ao escanear caixa não prioritária; validade obrigatória
  ao encher; painel de vencimentos com janela configurável (hoje/3/7/15 dias ou data escolhida);
  balanço por QR.
- **Financeiro**: agenda de boletos, proteção anti-golpe do boleto.
  Regra de negócio: "pagamento informado" não significa "pago" definitivo; a baixa final depende da conciliação bancária.

## 6. Como rodar

Requer **Node.js**. Neste projeto foi desenvolvido no Windows com Node em
`C:\Program Files\nodejs` (fora do PATH — ajuste conforme a máquina).

```bash
npm install
npm run dev      # http://localhost:3000 (ou --port 3010)
```

Verificar tipos sem buildar: `npx tsc --noEmit`.
**Cuidado**: NÃO rode `next build` com o `next dev` no ar — os dois brigam pela pasta `.next`
e a página passa a carregar sem CSS. Se acontecer: pare o dev, apague `.next`, suba de novo.

O app roda 100% com dados de demonstração (localStorage). Sem `.env.local`, nada de Supabase
é necessário. Para restaurar o demo, limpar a chave `compraschef-db-v1` do localStorage.

## 7. O que falta (roadmap)

1. Conectar o **Supabase** real (auth + banco + storage + Edge Functions).
2. **Integração com o ERP EASE EAT** (Caminho A): importar produtos/fornecedores/unidades com
   `codigo_externo`; enviar totais de estoque; consultar fichas técnicas e vendas.
3. Provedor real de **WhatsApp** (hoje mock em `supabase/functions/enviar-whatsapp`).
4. **NF-e nível 2**: download automático da SEFAZ via certificado digital A1 (hoje: upload de
   XML + QR da DANFE + lista mock de importadas).
5. **IA real** de recomendação de cotação.
6. **Publicação** (VPS + EasyPanel) e **PWA offline** nas telas de operação.
7. Fase 2 documentada em `docs/`: leilão reverso, curva ABC, CMV, alerta de margem, avaliação
   de fornecedores, cotação recorrente, painel do fornecedor logado, assistente WhatsApp.

## 8. Documentação de referência

- `docs/01-banco-de-dados.md` — todas as tabelas + regras de RLS
- `docs/02-requisitos-funcionais.md` — os 54 requisitos por módulo
- `docs/03-prompt-kickoff.md` / `docs/04-prompt-stitch.md` — prompts originais
- `supabase/migrations/0001_schema.sql` — schema completo pronto para aplicar
- `LEIA-ME.md` — visão geral e checklist para o dono
