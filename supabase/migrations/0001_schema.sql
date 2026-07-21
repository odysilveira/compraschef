-- ComprasChef — esquema completo (docs/01-banco-de-dados.md)
-- Aplicar no Supabase quando a conta existir: SQL Editor → colar → Run.

create table perfis (
  id uuid primary key references auth.users (id),
  nome text not null,
  papel text not null check (papel in ('dono', 'gerente', 'lider', 'caixa')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table unidades (
  id uuid primary key default gen_random_uuid(),
  codigo_externo text unique,
  nome text not null,
  sigla text not null unique
);

create table fornecedores (
  id uuid primary key default gen_random_uuid(),
  codigo_externo text unique,
  nome text not null,
  cnpj text not null unique,
  whatsapp text,
  telefone text,
  email text,
  contato_nome text,
  prazo_entrega_dias integer,
  pedido_minimo numeric,
  dias_atendimento text,
  horario_atendimento text,
  forma_pagamento text check (forma_pagamento in ('boleto', 'pix')),
  prazo_boleto_dias integer,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table produtos (
  id uuid primary key default gen_random_uuid(),
  codigo_externo text unique,
  nome text not null,
  categoria text,
  tipo text not null check (tipo in ('comprado', 'produzido')),
  unidade_compra_id uuid references unidades (id),
  unidade_uso_id uuid not null references unidades (id),
  fator_conversao numeric not null default 1 check (fator_conversao > 0),
  codigo_barras text,
  estoque_minimo numeric not null default 0,
  validade_padrao_dias integer,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table fornecedor_produtos (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references fornecedores (id),
  produto_id uuid not null references produtos (id),
  codigo_produto_fornecedor text,
  codigo_barras_fornecedor text,
  unidade_compra_id uuid references unidades (id),
  fator_conversao numeric check (fator_conversao > 0),
  ultimo_preco numeric,
  ultimo_preco_unidade_id uuid references unidades (id),
  atualizado_em timestamptz,
  unique (fornecedor_id, produto_id),
  unique (fornecedor_id, codigo_produto_fornecedor)
);

create table locais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text check (tipo in ('freezer', 'geladeira', 'prateleira', 'despensa'))
);

create table caixas (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique,
  qr_code text not null unique,
  status text not null default 'vazia' check (status in ('vazia', 'cheia', 'em_uso')),
  produto_id uuid references produtos (id),
  quantidade numeric,
  data_envase date,
  validade date,
  local_id uuid references locais (id),
  atualizado_em timestamptz not null default now()
);

create table listas_compras (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'rascunho' check (status in ('rascunho', 'confirmada', 'em_cotacao', 'finalizada')),
  gerada_automaticamente boolean not null default false,
  criada_por uuid references perfis (id),
  criada_em timestamptz not null default now()
);

create table lista_itens (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references listas_compras (id),
  produto_id uuid not null references produtos (id),
  quantidade numeric not null,
  unidade_id uuid references unidades (id),
  observacao text
);

create table cotacoes (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references listas_compras (id),
  fornecedor_id uuid not null references fornecedores (id),
  token text unique not null,
  status text not null default 'enviada' check (status in ('enviada', 'respondida', 'expirada')),
  prazo_resposta timestamptz not null,
  canal text check (canal in ('whatsapp', 'email')),
  enviada_em timestamptz,
  respondida_em timestamptz
);

create table cotacao_itens (
  id uuid primary key default gen_random_uuid(),
  cotacao_id uuid not null references cotacoes (id),
  produto_id uuid not null references produtos (id),
  quantidade numeric not null,
  unidade_id uuid references unidades (id),
  preco_unitario numeric,
  prazo_entrega_dias integer,
  disponivel boolean not null default true,
  substituto_descricao text,
  substituto_preco numeric
);

create table pedidos (
  id uuid primary key default gen_random_uuid(),
  cotacao_id uuid references cotacoes (id),
  fornecedor_id uuid not null references fornecedores (id),
  status text not null default 'aguardando_aprovacao'
    check (status in ('aguardando_aprovacao', 'aprovado', 'enviado', 'confirmado', 'entregue', 'cancelado')),
  valor_total numeric,
  analise_ia text,
  aprovado_por uuid references perfis (id),
  aprovado_em timestamptz,
  criado_em timestamptz not null default now()
);

create table pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos (id),
  produto_id uuid not null references produtos (id),
  quantidade numeric not null,
  unidade_id uuid references unidades (id),
  preco_unitario numeric not null
);

create table notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references fornecedores (id),
  pedido_id uuid references pedidos (id),
  numero text not null,
  chave_acesso text unique,
  xml_url text,
  valor_total numeric not null,
  emitida_em date,
  importada_em timestamptz not null default now(),
  status text not null default 'aguardando_conferencia'
    check (status in ('aguardando_conferencia', 'conferida', 'divergente')),
  origem text default 'manual' check (origem in ('manual', 'receita')),
  itens_importados jsonb
);

create table boletos (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references notas_fiscais (id),
  valor numeric not null,
  vencimento date not null,
  cnpj_beneficiario text,
  linha_digitavel text,
  status text not null default 'travado' check (status in ('travado', 'liberado', 'pago', 'suspeito')),
  observacao text
);

create table recebimentos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos (id),
  nota_id uuid references notas_fiscais (id),
  status text check (status in ('ok', 'parcial', 'divergente')),
  recebido_por uuid references perfis (id),
  recebido_em timestamptz not null default now()
);

create table recebimento_itens (
  id uuid primary key default gen_random_uuid(),
  recebimento_id uuid not null references recebimentos (id),
  produto_id uuid not null references produtos (id),
  qtd_esperada numeric,
  qtd_recebida numeric,
  qtd_esperada_origem numeric,
  qtd_recebida_origem numeric,
  unidade_origem_id uuid references unidades (id),
  fator_conversao_aplicado numeric check (fator_conversao_aplicado > 0),
  validade date,
  divergencia text,
  foto_url text
);

-- O lote é o saldo canônico de uma compra ou produção. Um mesmo lote pode ser
-- distribuído entre várias caixas sem gerar novas entradas de estoque.
create table lotes_estoque (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos (id),
  recebimento_item_id uuid unique references recebimento_itens (id),
  origem text not null check (origem in ('recebimento', 'producao', 'manual')),
  porcionado_por_id uuid references perfis (id),
  quantidade_inicial numeric not null check (quantidade_inicial > 0),
  quantidade_atual numeric not null check (quantidade_atual >= 0),
  data_entrada date not null,
  validade date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table alocacoes_caixa (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references lotes_estoque (id),
  caixa_id uuid not null references caixas (id),
  quantidade_inicial numeric not null check (quantidade_inicial > 0),
  quantidade_atual numeric not null check (quantidade_atual >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  finalizado_em timestamptz
);

create unique index uma_alocacao_ativa_por_caixa
  on alocacoes_caixa (caixa_id)
  where finalizado_em is null;

create table movimentos_estoque (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos (id),
  caixa_id uuid references caixas (id),
  tipo text not null check (tipo in ('entrada', 'baixa', 'producao', 'perda', 'ajuste_balanco')),
  quantidade numeric not null,
  recebimento_id uuid references recebimentos (id),
  usuario_id uuid references perfis (id),
  criado_em timestamptz not null default now(),
  sincronizado boolean not null default false
);

create table balancos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('insumos', 'produzidos')),
  status text not null default 'em_andamento' check (status in ('em_andamento', 'concluido')),
  realizado_por uuid references perfis (id),
  iniciado_em timestamptz not null default now(),
  concluido_em timestamptz
);

create table balanco_itens (
  id uuid primary key default gen_random_uuid(),
  balanco_id uuid not null references balancos (id),
  caixa_id uuid not null references caixas (id),
  qtd_esperada numeric,
  qtd_encontrada numeric
);

create table precos_historico (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos (id),
  fornecedor_id uuid not null references fornecedores (id),
  preco numeric not null,
  origem text check (origem in ('cotacao', 'nota')),
  data date not null default now()
);

create table integracao_eventos (
  id uuid primary key default gen_random_uuid(),
  direcao text not null check (direcao in ('enviado', 'recebido')),
  tipo text not null,
  payload jsonb,
  status text not null default 'pendente' check (status in ('pendente', 'ok', 'erro')),
  tentativas integer not null default 0,
  criado_em timestamptz not null default now()
);

-- ============================================================
-- RLS (segurança por papel)
-- ============================================================

-- Papel do usuário logado
create or replace function papel_atual() returns text
language sql stable security definer as $$
  select papel from perfis where id = auth.uid() and ativo
$$;

-- Habilita RLS em todas as tabelas
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Leitura geral (autenticados) nas tabelas operacionais sem valores
create policy leitura_autenticada on unidades for select using (auth.uid() is not null);
create policy leitura_autenticada on locais for select using (auth.uid() is not null);
create policy leitura_autenticada on produtos for select using (auth.uid() is not null);
create policy leitura_autenticada on caixas for select using (auth.uid() is not null);
create policy leitura_autenticada on lotes_estoque for select using (auth.uid() is not null);
create policy leitura_autenticada on alocacoes_caixa for select using (auth.uid() is not null);
create policy leitura_autenticada on perfis for select using (auth.uid() is not null);
create policy leitura_autenticada on fornecedores for select using (auth.uid() is not null);
create policy leitura_autenticada on listas_compras for select using (auth.uid() is not null);
create policy leitura_autenticada on lista_itens for select using (auth.uid() is not null);
create policy leitura_autenticada on recebimentos for select using (auth.uid() is not null);
create policy leitura_autenticada on recebimento_itens for select using (auth.uid() is not null);
create policy leitura_autenticada on movimentos_estoque for select using (auth.uid() is not null);
create policy leitura_autenticada on balancos for select using (auth.uid() is not null);
create policy leitura_autenticada on balanco_itens for select using (auth.uid() is not null);

-- Tabelas com valores: só dono e gerente
create policy leitura_gestao on cotacoes for select using (papel_atual() in ('dono', 'gerente'));
create policy leitura_gestao on cotacao_itens for select using (papel_atual() in ('dono', 'gerente'));
create policy leitura_gestao on notas_fiscais for select using (papel_atual() in ('dono', 'gerente'));
create policy leitura_gestao on boletos for select using (papel_atual() in ('dono', 'gerente'));
create policy leitura_gestao on precos_historico for select using (papel_atual() in ('dono', 'gerente'));
create policy leitura_gestao on fornecedor_produtos for select using (papel_atual() in ('dono', 'gerente'));
create policy leitura_gestao on integracao_eventos for select using (papel_atual() in ('dono', 'gerente'));

-- Pedidos: todos leem (a interface esconde valores de lider/caixa via view),
-- mas a APROVAÇÃO é exclusiva do dono
create policy leitura_autenticada on pedidos for select using (auth.uid() is not null);
create policy escrita_gestao on pedidos for insert with check (papel_atual() in ('dono', 'gerente'));
create policy aprovacao_dono on pedidos for update
  using (papel_atual() = 'dono' or (papel_atual() = 'gerente' and status <> 'aguardando_aprovacao'))
  with check (
    case when status = 'aprovado' then papel_atual() = 'dono' else papel_atual() in ('dono', 'gerente') end
  );

-- Escrita operacional (recebimento, estoque, balanço): qualquer papel ativo
create policy escrita_operacao on caixas for update using (papel_atual() is not null);
create policy escrita_operacao on lotes_estoque for insert with check (papel_atual() is not null);
create policy atualiza_operacao on lotes_estoque for update using (papel_atual() is not null);
create policy escrita_operacao on alocacoes_caixa for insert with check (papel_atual() is not null);
create policy atualiza_operacao on alocacoes_caixa for update using (papel_atual() is not null);
create policy escrita_operacao on recebimentos for insert with check (papel_atual() is not null);
create policy escrita_operacao on recebimento_itens for insert with check (papel_atual() is not null);
create policy escrita_operacao on movimentos_estoque for insert with check (papel_atual() is not null);
create policy escrita_operacao on balancos for insert with check (papel_atual() is not null);
create policy escrita_operacao_upd on balancos for update using (papel_atual() is not null);
create policy escrita_operacao on balanco_itens for insert with check (papel_atual() is not null);

-- Escrita de gestão (cadastros, listas, cotações, notas, boletos): dono e gerente
create policy escrita_gestao on fornecedores for all using (papel_atual() in ('dono', 'gerente'));
create policy escrita_gestao on produtos for all using (papel_atual() in ('dono', 'gerente'));
create policy escrita_gestao on unidades for all using (papel_atual() in ('dono', 'gerente'));
create policy escrita_gestao on locais for all using (papel_atual() in ('dono', 'gerente'));
create policy escrita_gestao_cx on caixas for insert with check (papel_atual() in ('dono', 'gerente'));
create policy escrita_gestao on fornecedor_produtos for all using (papel_atual() in ('dono', 'gerente'));
create policy escrita_gestao on listas_compras for all using (papel_atual() in ('dono', 'gerente'));
create policy escrita_gestao on lista_itens for all using (papel_atual() in ('dono', 'gerente'));
create policy escrita_gestao on cotacoes for all using (papel_atual() in ('dono', 'gerente'));
create policy escrita_gestao on cotacao_itens for all using (papel_atual() in ('dono', 'gerente'));
create policy escrita_gestao on notas_fiscais for all using (papel_atual() in ('dono', 'gerente'));
create policy escrita_gestao on boletos for all using (papel_atual() in ('dono', 'gerente'));
create policy escrita_gestao on precos_historico for all using (papel_atual() in ('dono', 'gerente'));

-- View operacional de pedidos SEM valores (para telas de lider/caixa)
create view pedidos_operacional as
  select id, fornecedor_id, status, criado_em from pedidos;

-- Fornecedor (link público): NENHUM acesso direto ao banco.
-- A Edge Function 'cotacao-fornecedor' usa a service role e valida o token.
