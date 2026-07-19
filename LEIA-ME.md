# ComprasChef 🍝

Sistema de compras e estoque do restaurante — cotações, pedidos, NF-e/boletos e estoque por caixas com QR code.

## Documentação (pasta `docs/`)

| Arquivo | O que é |
|---|---|
| [docs/01-banco-de-dados.md](docs/01-banco-de-dados.md) | Todas as tabelas do banco (Supabase) e regras de segurança |
| [docs/02-requisitos-funcionais.md](docs/02-requisitos-funcionais.md) | Os 54 requisitos do sistema, por módulo |
| [docs/03-prompt-kickoff.md](docs/03-prompt-kickoff.md) | Prompt para o Claude Code começar a construção |
| [docs/04-prompt-stitch.md](docs/04-prompt-stitch.md) | Prompt para gerar o protótipo visual no Google Stitch |

## Decisões-chave do projeto

- **Stack:** Next.js + Supabase; hospedagem futura em VPS + EasyPanel
- **Integração com o ERP do amigo (Caminho A):** ComprasChef é o cérebro do estoque — envia totais ao ERP e consulta fichas técnicas/vendas de lá. Códigos compartilhados via campo `codigo_externo`
- **Papéis:** dono (aprovação final exclusiva), gerente (tudo menos aprovar), líderes de cozinha e caixa (operação sem valores)
- **Estoque:** caixas físicas com QR fixo, FIFO indicado pelo sistema, balanço semanal (insumos) e a cada 2 dias (produzidos)
- **Boletos:** nascem travados, liberados só após conferência; checagem anti-golpe (CNPJ/valor)
- **Offline (PWA):** só nas telas de operação (baixa, balanço, recebimento)

## Estado atual (19/07/2026)

**A primeira versão do sistema está construída e rodando** — todas as 10 telas: Painel, Lista de compras, Cotações (quadro comparativo + recomendação IA), Pedidos (aprovação exclusiva do dono), Recebimento, Estoque por caixas (QR + FIFO + balanço), Financeiro (boletos travados + anti-golpe), Relatórios, Cadastros e a página pública do fornecedor (`/cotacao/[token]`).

- **Rodar o sistema:** abrir o Claude Code nesta pasta e pedir para iniciar o servidor (`npm run dev`, porta 3010). Obs.: o Node fica em `C:\Program Files\nodejs` (não está no PATH).
- **Dados:** por enquanto o sistema roda com dados de demonstração (salvos no navegador). O banco real do Supabase já está escrito em `supabase/migrations/0001_schema.sql` — é colar no SQL Editor quando a conta existir.
- **Seletor de papel:** no topo da tela dá para alternar entre Dono / Gerente / Líder / Caixa e ver as permissões mudarem (líder e caixa não veem valores).
- **QRs de teste:** as caixas de demonstração usam os códigos `CXCHEF-001` a `CXCHEF-014` (digite na tela Estoque para simular a leitura).

## Checklist pendente

1. ☐ Pedir ao amigo a exportação de produtos/fornecedores/unidades com códigos internos do ERP
2. ☐ Criar conta gratuita no [supabase.com](https://supabase.com) → aplicar `supabase/migrations/0001_schema.sql` e preencher `.env.local` (modelo em `.env.local.example`)
3. ☐ Criar conta gratuita no [github.com](https://github.com) e guardar o código lá
4. ☐ Gerar protótipo no Google Stitch (usar `docs/04-prompt-stitch.md`) → comparar com o sistema e pedir ajustes visuais
5. ☑ Documentação completa em `docs/`
6. ☑ Primeira versão do sistema construída (19/07/2026)
