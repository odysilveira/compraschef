alter table caixas
  add column if not exists tipo_box text not null default 'NAO_CLASSIFICADO'
  check (tipo_box in ('NAO_CLASSIFICADO', 'RESERVA', 'OPERACIONAL', 'QUARENTENA'));

alter table caixas
  add column if not exists posicao_fisica text not null default 'NAO_INFORMADA'
  check (posicao_fisica in ('FRENTE', 'TRAS', 'ISOLADA', 'OUTRA', 'NAO_INFORMADA'));