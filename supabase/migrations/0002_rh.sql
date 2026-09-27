-- ComprasChef — módulo RH (docs/01-banco-de-dados.md, seção "RH")
-- Aplicar no Supabase quando a conta existir: SQL Editor → colar → Run.
-- Depende de 0001_schema.sql já aplicado.

create table colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nome_social text,
  cpf text,
  telefone text,
  categoria text not null check (categoria in ('motoboy', 'freelancer')),
  clt boolean not null default false, -- só relevante quando categoria = 'freelancer'
  tipo_chave text not null check (tipo_chave in ('celular', 'cpf', 'cnpj', 'email', 'aleatoria')),
  chave text not null,
  turnos text[], -- motoboy: subconjunto de {'almoco','jantar'}
  funcao text check (funcao in ('cozinha', 'balcao', 'outros')), -- freelancer
  dias_disponiveis text[], -- subconjunto de {'seg','ter','qua','qui','sex','sab','dom'}
  observacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table bancos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique
);

create table pessoas_acesso (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text,
  nivel text not null check (nivel in ('administrador', 'colaborador', 'consulta')),
  observacao text,
  criado_em timestamptz not null default now()
);

create table pagamentos_rh (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references colaboradores (id), -- nunca agrupar/filtrar relatório pelo nome — sempre por este id
  valor numeric not null,
  data_pagamento date not null,
  banco_id uuid not null references bancos (id),
  origem text check (origem in ('diaria', 'uber', 'adiantamento_salario', 'pagamento_salario', 'outro')),
  dias_trabalhados date[], -- freelancer: datas cobertas por este pagamento (divisão entre dias)
  fechamento_semana_id uuid, -- motoboy: agrupa os pagamentos fechados juntos numa mesma semana
  observacao text,
  criado_em timestamptz not null default now()
);

-- Uma vaga na escala (dia + turno) atribuída a alguém, ou em aberto pra autoatribuição.
create table escala_atribuicoes (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  turno text not null check (turno in ('almoco', 'jantar')),
  colaborador_id uuid references colaboradores (id), -- nulo enquanto for vaga em aberto
  nome text, -- snapshot do nome no momento da atribuição
  vaga_aberta boolean not null default false,
  token_vaga text unique, -- link público de autoatribuição (ver app/vaga-rh/[token])
  nome_reivindicado text,
  reivindicada_em timestamptz,
  criado_em timestamptz not null default now()
);
