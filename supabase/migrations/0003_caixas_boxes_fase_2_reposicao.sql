alter table movimentos_estoque
  drop constraint if exists movimentos_estoque_tipo_check;

alter table movimentos_estoque
  add constraint movimentos_estoque_tipo_check
  check (tipo in ('entrada', 'baixa', 'producao', 'perda', 'ajuste_balanco', 'transferencia_boxes'));

alter table movimentos_estoque
  add column if not exists caixa_origem_id uuid references caixas (id),
  add column if not exists caixa_destino_id uuid references caixas (id),
  add column if not exists lote_id uuid references lotes_estoque (id),
  add column if not exists motivo text,
  add column if not exists saldo_fisico_origem_antes numeric,
  add column if not exists saldo_fisico_origem_depois numeric,
  add column if not exists saldo_fisico_destino_antes numeric,
  add column if not exists saldo_fisico_destino_depois numeric;

alter table movimentos_estoque
  drop constraint if exists movimentos_estoque_motivo_reposicao_check;

alter table movimentos_estoque
  add constraint movimentos_estoque_motivo_reposicao_check
  check (motivo is null or motivo in ('REPOSICAO_OPERACIONAL'));
