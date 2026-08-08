-- Hardening seguro pos-Fase 2.
-- Nao altera colunas, dados ou politicas existentes.

alter table public.eventos_box_operacional
  enable row level security;

alter view public.pedidos_operacional
  set (security_invoker = true);

create or replace function public.papel_atual() returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.papel
  from public.perfis p
  where p.id = auth.uid()
    and p.ativo
$$;
