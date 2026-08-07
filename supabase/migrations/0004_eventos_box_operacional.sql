alter table caixas
  add column if not exists produto_operacional_alvo_id uuid references produtos (id),
  add column if not exists destinacao_operacional_inicio_em timestamptz,
  add column if not exists destinacao_operacional_responsavel_id uuid references perfis (id);

create table if not exists eventos_box_operacional (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('abertura', 'reposicao', 'fechamento', 'divergencia', 'ajuste_inventario', 'destinacao_operacional_ativada', 'destinacao_operacional_encerrada')),
  box_id uuid not null references caixas (id),
  box_numero integer not null,
  qr_code text not null,
  sessao_id text not null,
  produto_id uuid references produtos (id),
  lote_id uuid references lotes_estoque (id),
  validade date,
  quantidade numeric,
  quantidade_esperada numeric,
  quantidade_contada numeric,
  quantidade_utilizavel numeric,
  necessidade_prevista numeric,
  reposicao_sugerida numeric,
  saldo_anterior numeric,
  saldo_posterior numeric,
  origem_box_id uuid references caixas (id),
  origem_qr_code text,
  destino_box_id uuid references caixas (id),
  destino_qr_code text,
  delta numeric,
  motivo text,
  justificativa text,
  status_divergencia text check (status_divergencia in ('aberta', 'justificada', 'ajustada', 'concluida')),
  evento_referencia_id uuid references eventos_box_operacional (id),
  higienizacao_confirmada boolean,
  encerrado_por_id uuid references perfis (id),
  usuario_id uuid not null references perfis (id),
  criado_em timestamptz not null default now()
);

create index if not exists eventos_box_operacional_box_idx
  on eventos_box_operacional (box_id, criado_em desc);

create index if not exists eventos_box_operacional_tipo_idx
  on eventos_box_operacional (tipo, criado_em desc);

create policy leitura_autenticada on eventos_box_operacional for select using (auth.uid() is not null);
create policy escrita_operacao on eventos_box_operacional for insert with check (papel_atual() is not null);
