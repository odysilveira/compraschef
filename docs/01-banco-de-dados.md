# 📦 ITEM 1 — Banco de Dados (Supabase)

```
tabela: perfis
  - id: uuid, PK, FK → auth.users.id
  - nome: text, obrigatório
  - papel: text, obrigatório ('dono' | 'gerente' | 'lider' | 'caixa')
  - ativo: boolean, default true
  - criado_em: timestamptz, default now()

tabela: unidades
  - id: uuid, PK, default gen_random_uuid()
  - nome: text, obrigatório (ex: quilograma, litro, caixa, fardo, unidade)
  - sigla: text, obrigatório, único (kg, L, cx, fd, un)

tabela: fornecedores
  - id: uuid, PK, default gen_random_uuid()
  - codigo_externo: text, opcional (código no ERP parceiro)
  - nome: text, obrigatório
  - cnpj: text, obrigatório, único
  - whatsapp: text, opcional
  - telefone: text, opcional (segundo contato, para ligações)
  - email: text, opcional
  - contato_nome: text, opcional
  - prazo_entrega_dias: integer, opcional
  - pedido_minimo: numeric, opcional
  - dias_atendimento: text, opcional
  - horario_atendimento: text, opcional
  - forma_pagamento: text ('boleto' | 'pix')
  - prazo_boleto_dias: integer, opcional
  - ativo: boolean, default true
  - criado_em: timestamptz, default now()

tabela: produtos
  - id: uuid, PK, default gen_random_uuid()
  - codigo_externo: text, único (MESMO código do ERP parceiro — chave da integração)
  - nome: text, obrigatório
  - categoria: text (hortifrúti, carnes, laticínios, bebidas, limpeza, produção...)
  - tipo: text, obrigatório ('comprado' | 'produzido')
  - unidade_compra_id: uuid, FK → unidades.id
  - unidade_uso_id: uuid, FK → unidades.id, obrigatório
  - fator_conversao: numeric, default 1 (1 unid. de compra = X unid. de uso)
  - codigo_barras: text, opcional
  - estoque_minimo: numeric, default 0 (na unidade de uso; dispara alerta)
  - validade_padrao_dias: integer, opcional
  - ativo: boolean, default true
  - criado_em: timestamptz, default now()

tabela: fornecedor_produtos          (quem vende o quê)
  - id: uuid, PK
  - fornecedor_id: uuid, FK → fornecedores.id
  - produto_id: uuid, FK → produtos.id
  - ultimo_preco: numeric, opcional
  - atualizado_em: timestamptz
  - único: (fornecedor_id, produto_id)

tabela: locais
  - id: uuid, PK
  - nome: text, obrigatório (Freezer 1, Gaveta A, Prateleira seca...)
  - tipo: text ('freezer' | 'geladeira' | 'prateleira' | 'despensa')

tabela: caixas
  - id: uuid, PK
  - numero: integer, obrigatório, único
  - qr_code: text, obrigatório, único (QR fixo da caixa física)
  - status: text, default 'vazia' ('vazia' | 'cheia' | 'em_uso')
  - produto_id: uuid, FK → produtos.id, opcional (conteúdo atual)
  - quantidade: numeric, opcional (na unidade de uso)
  - data_envase: date, opcional
  - validade: date, opcional
  - local_id: uuid, FK → locais.id, opcional
  - atualizado_em: timestamptz, default now()

tabela: listas_compras
  - id: uuid, PK
  - status: text, default 'rascunho' ('rascunho' | 'confirmada' | 'em_cotacao' | 'finalizada')
  - gerada_automaticamente: boolean, default false
  - criada_por: uuid, FK → perfis.id
  - criada_em: timestamptz, default now()

tabela: lista_itens
  - id: uuid, PK
  - lista_id: uuid, FK → listas_compras.id
  - produto_id: uuid, FK → produtos.id
  - quantidade: numeric, obrigatório
  - unidade_id: uuid, FK → unidades.id, opcional (troca a unidade do produto neste pedido; herdada por cotacao_itens e pedido_itens)
  - observacao: text, opcional

tabela: cotacoes                     (uma por fornecedor, por lista)
  - id: uuid, PK
  - lista_id: uuid, FK → listas_compras.id
  - fornecedor_id: uuid, FK → fornecedores.id
  - token: text, único (link exclusivo do fornecedor)
  - status: text, default 'enviada' ('enviada' | 'respondida' | 'expirada')
  - prazo_resposta: timestamptz, obrigatório
  - canal: text ('whatsapp' | 'email')
  - enviada_em: timestamptz
  - respondida_em: timestamptz, opcional

tabela: cotacao_itens
  - id: uuid, PK
  - cotacao_id: uuid, FK → cotacoes.id
  - produto_id: uuid, FK → produtos.id
  - quantidade: numeric, obrigatório
  - preco_unitario: numeric, opcional (preenchido pelo fornecedor)
  - prazo_entrega_dias: integer, opcional
  - disponivel: boolean, default true
  - substituto_descricao: text, opcional
  - substituto_preco: numeric, opcional

tabela: pedidos
  - id: uuid, PK
  - cotacao_id: uuid, FK → cotacoes.id, opcional
  - fornecedor_id: uuid, FK → fornecedores.id
  - status: text, default 'aguardando_aprovacao'
    ('aguardando_aprovacao' | 'aprovado' | 'enviado' | 'confirmado' | 'entregue' | 'cancelado')
  - valor_total: numeric
  - analise_ia: text, opcional (justificativa da recomendação)
  - aprovado_por: uuid, FK → perfis.id, opcional (sempre o dono)
  - aprovado_em: timestamptz, opcional
  - criado_em: timestamptz, default now()

tabela: pedido_itens
  - id: uuid, PK
  - pedido_id: uuid, FK → pedidos.id
  - produto_id: uuid, FK → produtos.id
  - quantidade: numeric, obrigatório
  - preco_unitario: numeric, obrigatório

tabela: notas_fiscais
  - id: uuid, PK
  - fornecedor_id: uuid, FK → fornecedores.id
  - pedido_id: uuid, FK → pedidos.id, opcional
  - numero: text, obrigatório
  - chave_acesso: text, único (44 dígitos da NF-e)
  - xml_url: text, opcional (arquivo no Supabase Storage)
  - valor_total: numeric, obrigatório
  - emitida_em: date
  - importada_em: timestamptz, default now()
  - status: text, default 'aguardando_conferencia'
    ('aguardando_conferencia' | 'conferida' | 'divergente')

tabela: boletos
  - id: uuid, PK
  - nota_id: uuid, FK → notas_fiscais.id
  - valor: numeric, obrigatório
  - vencimento: date, obrigatório
  - cnpj_beneficiario: text
  - linha_digitavel: text, opcional
  - status: text, default 'travado' ('travado' | 'liberado' | 'pago' | 'suspeito')
  - observacao: text, opcional

tabela: recebimentos
  - id: uuid, PK
  - pedido_id: uuid, FK → pedidos.id
  - nota_id: uuid, FK → notas_fiscais.id, opcional
  - status: text ('ok' | 'parcial' | 'divergente')
  - recebido_por: uuid, FK → perfis.id
  - recebido_em: timestamptz, default now()

tabela: recebimento_itens
  - id: uuid, PK
  - recebimento_id: uuid, FK → recebimentos.id
  - produto_id: uuid, FK → produtos.id
  - qtd_esperada: numeric
  - qtd_recebida: numeric
  - validade: date, opcional
  - divergencia: text, opcional
  - foto_url: text, opcional (Supabase Storage)

tabela: movimentos_estoque
  - id: uuid, PK
  - produto_id: uuid, FK → produtos.id
  - caixa_id: uuid, FK → caixas.id, opcional
  - tipo: text ('entrada' | 'baixa' | 'producao' | 'perda' | 'ajuste_balanco')
  - quantidade: numeric, obrigatório (na unidade de uso; negativo = saída)
  - recebimento_id: uuid, FK → recebimentos.id, opcional
  - usuario_id: uuid, FK → perfis.id
  - criado_em: timestamptz, default now()
  - sincronizado: boolean, default false (já enviado ao ERP parceiro?)

tabela: balancos
  - id: uuid, PK
  - tipo: text ('insumos' | 'produzidos')
  - status: text, default 'em_andamento' ('em_andamento' | 'concluido')
  - realizado_por: uuid, FK → perfis.id
  - iniciado_em: timestamptz, default now()
  - concluido_em: timestamptz, opcional

tabela: balanco_itens
  - id: uuid, PK
  - balanco_id: uuid, FK → balancos.id
  - caixa_id: uuid, FK → caixas.id
  - qtd_esperada: numeric
  - qtd_encontrada: numeric

tabela: precos_historico
  - id: uuid, PK
  - produto_id: uuid, FK → produtos.id
  - fornecedor_id: uuid, FK → fornecedores.id
  - preco: numeric, obrigatório
  - origem: text ('cotacao' | 'nota')
  - data: date, default now()

tabela: integracao_eventos           (fila de comunicação com o ERP parceiro)
  - id: uuid, PK
  - direcao: text ('enviado' | 'recebido')
  - tipo: text (ex: 'estoque_total', 'ficha_tecnica', 'consumo_vendas')
  - payload: jsonb
  - status: text, default 'pendente' ('pendente' | 'ok' | 'erro')
  - tentativas: integer, default 0
  - criado_em: timestamptz, default now()

-- ---------- RH (pagamento e escala da equipe — motoboys, freelancers e CLT) ----------

tabela: colaboradores
  - id: uuid, PK, default gen_random_uuid()
  - nome: text, obrigatório
  - nome_social: text, opcional
  - cpf: text, opcional
  - telefone: text, opcional
  - categoria: text, obrigatório ('motoboy' | 'freelancer')
  - clt: boolean, default false (só relevante quando categoria = 'freelancer': funcionário registrado x freela avulso)
  - tipo_chave: text, obrigatório ('celular' | 'cpf' | 'cnpj' | 'email' | 'aleatoria')
  - chave: text, obrigatório (chave Pix)
  - turnos: text[], opcional (motoboy: subconjunto de 'almoco'/'jantar')
  - funcao: text, opcional ('cozinha' | 'balcao' | 'outros' — freelancer)
  - dias_disponiveis: text[], opcional (subconjunto de 'seg'..'dom')
  - observacao: text, opcional
  - ativo: boolean, default true
  - criado_em: timestamptz, default now()

tabela: bancos
  - id: uuid, PK, default gen_random_uuid()
  - nome: text, obrigatório, único (ex.: Sicoob, Itaú)

tabela: pessoas_acesso                (registro de referência — não controla o acesso de verdade)
  - id: uuid, PK, default gen_random_uuid()
  - nome: text, obrigatório
  - email: text, opcional
  - nivel: text, obrigatório ('administrador' | 'colaborador' | 'consulta')
  - observacao: text, opcional
  - criado_em: timestamptz, default now()

tabela: pagamentos_rh
  - id: uuid, PK, default gen_random_uuid()
  - colaborador_id: uuid, FK → colaboradores.id (nunca agrupar/filtrar relatório pelo nome — sempre por este id)
  - valor: numeric, obrigatório
  - data_pagamento: date, obrigatório
  - banco_id: uuid, FK → bancos.id
  - origem: text, opcional ('diaria' | 'uber' | 'adiantamento_salario' | 'pagamento_salario' | 'outro')
  - dias_trabalhados: date[], opcional (freelancer: datas cobertas por este pagamento, quando dividido entre dias)
  - fechamento_semana_id: uuid, opcional (motoboy: agrupa os pagamentos fechados juntos numa mesma semana)
  - observacao: text, opcional
  - criado_em: timestamptz, default now()

tabela: escala_atribuicoes            (uma vaga na escala — dia + turno — atribuída ou em aberto)
  - id: uuid, PK, default gen_random_uuid()
  - data: date, obrigatório
  - turno: text, obrigatório ('almoco' | 'jantar')
  - colaborador_id: uuid, FK → colaboradores.id, opcional (ausente enquanto for vaga em aberto)
  - nome: text, opcional (snapshot do nome no momento da atribuição)
  - vaga_aberta: boolean, default false
  - token_vaga: text, opcional, único (link público de autoatribuição — ver app/vaga-rh/[token])
  - nome_reivindicado: text, opcional
  - reivindicada_em: timestamptz, opcional
  - criado_em: timestamptz, default now()
```

**Observações de RLS (segurança do Supabase):**
- Todas as tabelas exigem usuário autenticado; papéis vêm de `perfis.papel`.
- Papéis `lider` e `caixa`: **sem acesso** a `cotacoes`, `cotacao_itens`, `boletos`, `notas_fiscais`, `precos_historico` e às colunas de valor de `pedidos` — usar *views* operacionais sem preços para essas telas.
- Mesma regra vale para o módulo de RH: `pagamentos_rh` e `pessoas_acesso` ficam fora do alcance de `lider`/`caixa` (mesmo gate hoje aplicado em `precisaVerValores`); `colaboradores` (cadastro, sem valores) e `escala_atribuicoes` continuam visíveis a todos os papéis.
- Aprovação de pedido: policy de UPDATE do status `aguardando_aprovacao → aprovado` restrita ao papel `dono`.
- Link do fornecedor: **nenhum acesso direto ao banco** — uma Edge Function valida o `token` da cotação e lê/grava apenas os itens daquela cotação, com prazo de validade.
- Link de vaga em aberto (RH): mesmo padrão do link do fornecedor — Edge Function valida `token_vaga` e só grava `nome_reivindicado`/`reivindicada_em` daquela vaga específica, com prazo de validade.
