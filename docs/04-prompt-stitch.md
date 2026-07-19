# 🎨 ITEM 4 — Prompt para Google Stitch

> Copie tudo dentro do bloco abaixo e cole no Google Stitch (stitch.withgoogle.com):

````
Crie o design de um sistema web chamado ComprasChef — controle de compras e estoque de
um restaurante. O usuário principal é o dono do restaurante, sem conhecimento técnico:
a interface deve ser extremamente clara, em português (pt-BR), com rótulos diretos e
zero jargão. As telas operacionais serão usadas em tablet/celular na cozinha e no
recebimento de mercadoria: botões grandes, poucos toques, alto contraste.

TELAS A PROTOTIPAR:

1. Painel Inicial (dashboard do dono)
   - Cartões de alerta no topo: "5 produtos abaixo do estoque mínimo", "2 cotações
     aguardando resposta", "1 pedido esperando SUA aprovação", "3 boletos vencem esta
     semana", "1 divergência no recebimento"
   - Lista "Entregas previstas para hoje" com fornecedor e horário
   - Gráfico simples de gastos do mês por fornecedor
   - Ações: clicar em qualquer cartão leva à tela correspondente

2. Cotações
   - Lista de cotações em andamento com status por fornecedor (aguardando / respondeu ✓)
   - Quadro comparativo: produtos nas linhas, fornecedores nas colunas, preços nas
     células, melhor preço destacado em verde; preço fora do padrão destacado em laranja
     com aviso
   - Card "Recomendação da IA" com justificativa em texto e botão "Gerar pedido"
   - Ações: enviar cotação, reenviar lembrete, encerrar prazo

3. Página do Fornecedor (pública, mobile-first)
   - Cabeçalho: "Restaurante X quer cotar 8 itens com você — responda até quinta 12h"
   - Tabela simples: produto, quantidade, campo de preço (pré-preenchido), prazo de
     entrega, botão "não tenho / oferecer substituto"
   - Botão grande "Enviar cotação"

4. Pedidos
   - Lista com status visual em etapas (aguardando aprovação → aprovado → enviado →
     confirmado → entregue)
   - Detalhe do pedido com itens, valores e botão destacado "Aprovar pedido" (só o dono)

5. Recebimento (tablet/celular, botões grandes)
   - Botão gigante "Escanear código"
   - Checklist item a item: esperado × recebido, campo de validade
   - Botões "Anexar foto" e "Registrar divergência"
   - Resumo final: "Tudo certo — liberar boletos" ou "Divergência registrada"

6. Estoque por Caixas (tablet/celular, botões grandes)
   - Botão gigante "Escanear caixa"
   - Resultado do scan: conteúdo, quantidade, validade, local — e aviso destacado
     "Use antes a caixa nº 7 (mais antiga) — Freezer 2, gaveta de cima"
   - Modo balanço: contador de caixas lidas e lista só das diferenças encontradas
   - Alertas de validade próxima

7. Financeiro
   - Agenda da semana com boletos: travado 🔒 / liberado ✓ / pago / suspeito ⚠️
   - Card de alerta para boleto suspeito (CNPJ ou valor não confere com a nota)

8. Relatórios
   - Consumo médio por produto, gasto por fornecedor/mês (gráfico de barras),
     histórico de preço de um produto (gráfico de linha)

9. Cadastros
   - Listas com busca + formulário lateral: fornecedores, produtos, unidades,
     locais, caixas

DESIGN SYSTEM:
- Cor primária: verde escuro #15803D (ações principais, confirmações)
- Cor de fundo: #F8FAFC
- Cor de superfície (cards): #FFFFFF com sombra suave
- Cor de texto principal: #0F172A
- Cor de destaque/ação: laranja #EA580C (alertas, avisos, pendências)
- Erro/suspeito: vermelho #DC2626 · Sucesso: verde #16A34A
- Tipografia: Inter — H1 28px bold, H2 20px semibold, corpo 16px, labels 13px uppercase
- Tom visual: minimalista e profissional, cards com bordas arredondadas (12px),
  espaçamento generoso, ícones de linha, compatível com shadcn/ui

Gere todas as telas de forma navegável e coerente entre si, respeitando o design system
definido. Os componentes devem ser consistentes entre telas. Use o design system como
base para todos os elementos visuais.
````
