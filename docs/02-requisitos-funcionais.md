# 📋 ITEM 2 — Requisitos Funcionais

```
Módulo: Cadastros
1.  O sistema deve permitir cadastrar fornecedores com nome, CNPJ, WhatsApp, e-mail, contato, prazo de entrega, pedido mínimo, dias/horário de atendimento, forma de pagamento e prazo de boleto
2.  O sistema deve permitir cadastrar produtos com código externo (compartilhado com o ERP parceiro), tipo (comprado/produzido), unidades de compra e uso, fator de conversão, código de barras e estoque mínimo
3.  O sistema deve permitir vincular quais produtos cada fornecedor vende
4.  O sistema deve permitir cadastrar unidades de medida e locais de armazenagem
5.  O sistema deve permitir cadastrar caixas físicas com número e QR code fixo permanente
6.  O sistema deve permitir adicionar novos campos aos cadastros em versões futuras sem perder dados

Módulo: Lista de Compras
7.  O sistema deve gerar automaticamente a lista de compras quando produtos atingirem o estoque mínimo, considerando o consumo médio
8.  O sistema deve permitir editar, acrescentar itens e confirmar a lista antes de cotar
9.  O sistema deve registrar quem criou/confirmou cada lista

Módulo: Cotações
10. O sistema deve gerar uma cotação por fornecedor contendo apenas os itens que ele vende
11. O sistema deve criar um link exclusivo por cotação (token único, com prazo de validade e expiração)
12. O sistema deve enviar o link ao fornecedor por WhatsApp ou e-mail
13. A página do fornecedor deve funcionar no celular, sem login e sem instalação, com preços pré-preenchidos da última cotação
14. A página do fornecedor deve permitir informar preço, prazo de entrega, indisponibilidade e produto substituto
15. O sistema deve enviar lembrete automático ao fornecedor que não respondeu perto do prazo
16. O sistema deve exibir quadro comparativo das respostas em tempo real
17. A IA deve analisar preço, prazo, pedido mínimo e histórico, e recomendar a melhor opção com justificativa
18. O sistema deve alertar em destaque preços fora do padrão histórico do produto

Módulo: Pedidos
19. O sistema deve gerar o pedido a partir da recomendação da IA, editável antes da aprovação
20. Somente o usuário com papel "dono" pode aprovar pedidos
21. O sistema deve enviar o pedido aprovado ao fornecedor por WhatsApp, e-mail ou link
22. O sistema deve acompanhar o status do pedido (aprovado → enviado → confirmado → entregue)

Módulo: Notas Fiscais
23. O sistema deve importar XML de NF-e automaticamente a partir de e-mail monitorado (nível 1)
24. O sistema deve suportar download automático de NF-e da SEFAZ via certificado digital A1 (nível 2)
25. O sistema deve vincular automaticamente cada nota ao pedido correspondente e apontar diferenças de itens/valores
26. O sistema deve extrair as duplicatas/boletos do XML e criar os registros de pagamento

Módulo: Financeiro (Boletos)
27. Boletos devem nascer com status "travado" e só ser liberados após conferência OK da mercadoria
28. O sistema deve verificar CNPJ do beneficiário e valor do boleto contra a nota fiscal, marcando como "suspeito" qualquer divergência (proteção contra golpe do boleto)
29. Em recebimento parcial, o sistema deve indicar liberação proporcional e registrar pendência com o fornecedor
30. O sistema deve exibir agenda semanal de boletos (travados, liberados, pagos) para dono e gerente

Módulo: Recebimento
31. O sistema deve permitir conferência item a item com leitor de código de barras/QR (câmera ou leitor Bluetooth)
32. O sistema deve permitir anexar fotos da mercadoria e de avarias na conferência
33. O sistema deve registrar divergências (falta, sobra, produto errado) e validades dos itens recebidos
34. A conferência OK deve gerar automaticamente a entrada no estoque e registrar o preço pago no histórico
35. O recebimento pode ser feito por gerente, líderes de cozinha ou responsável pelo caixa

Módulo: Estoque por Caixas
36. O sistema deve permitir encher uma caixa (escanear QR da caixa + código de barras do produto + informar quantidade e validade) e esvaziá-la para reuso; uma caixa ativa não mistura produtos ou validades
37. A baixa de estoque deve ser feita escaneando o QR da caixa
38. O sistema deve indicar qual caixa usar primeiro (menor validade — FEFO; em empate, mais antiga — FIFO) e onde ela está, alertando se outra caixa for escaneada
39. O sistema deve alertar validades próximas do vencimento, incluindo produtos de produção própria
40. O sistema deve registrar um lote total de produtos produzidos (bolonhesa, massas, risotos), contado em sacos/porções G ou P, identificar quem porcionou, permitir distribuí-lo entre várias caixas e futuramente consumir insumos conforme a ficha técnica consultada no ERP parceiro
41. O sistema deve manter o estoque em unidade de uso, convertendo automaticamente da unidade de compra

Módulo: Balanço
42. O sistema deve permitir balanço por leitura de QR: semanal (insumos) e a cada 2 dias (produtos acabados)
43. Ao ler cada caixa, o sistema deve permitir informar a quantidade restante, atualizar imediatamente caixa, lote e estoque total, comparar esperado × encontrado e exibir somente as diferenças
44. Ajustes de balanço devem gerar movimentos de estoque auditáveis (quem, quando, quanto)

Módulo: Painel e Relatórios
45. O painel inicial deve exibir: alertas de estoque mínimo, cotações aguardando resposta, pedidos aguardando aprovação, entregas previstas, boletos a vencer e divergências
46. O sistema deve exibir relatórios de consumo médio por produto, gasto total por fornecedor/mês e histórico de preços por produto

Módulo: Usuários e Permissões
47. O sistema deve ter papéis: dono (tudo + aprovação), gerente (tudo exceto aprovação), líder e caixa (operação sem valores)
48. Usuários com papel líder/caixa não devem ver preços, boletos, notas nem relatórios financeiros

Módulo: Integração com ERP Parceiro
49. Produtos, fornecedores e unidades devem usar os mesmos códigos do ERP parceiro (campo codigo_externo); o sistema deve importar as listas iniciais exportadas de lá
50. O sistema deve enviar os totais de estoque ao ERP parceiro a cada movimento (fila de eventos com re-tentativa em caso de falha)
51. O sistema deve consultar fichas técnicas e dados de venda do ERP parceiro para calcular consumo e previsão de falta
52. Toda comunicação entre os sistemas deve ser registrada em integracao_eventos para auditoria

Módulo: Offline
53. As telas de Recebimento, Estoque e Balanço devem funcionar offline (PWA), guardando as ações localmente
54. Ao restaurar a conexão, o sistema deve sincronizar automaticamente as ações pendentes na ordem correta
```
