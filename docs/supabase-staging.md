# Supabase Staging

Este documento descreve a fundacao local para conectar o ComprasChef a um ambiente Supabase de staging.

## Escopo desta etapa

- Cliente Supabase para navegador.
- Cliente Supabase para servidor.
- Validacao segura de variaveis de ambiente.
- Repositorio inicial somente leitura para tabelas basicas de estoque.
- Documentacao de configuracao.

Fora do escopo nesta etapa:

- migracao de dados do localStorage;
- escrita no Supabase;
- Auth;
- Storage;
- Saipos;
- uso de `service_role`;
- deploy ou migration manual em Production.

## Variaveis de ambiente

Configure apenas valores do ambiente de staging:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Nunca coloque `service_role` em variaveis `NEXT_PUBLIC_*` ou em codigo enviado ao navegador.

## Comportamento sem configuracao

Se `NEXT_PUBLIC_SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY` estiver ausente ou invalida, o cliente Supabase retorna `null`.

Nesse caso, o aplicativo continua usando a camada mock/localStorage existente em `lib/data`.

## Repositorio inicial somente leitura

O arquivo `lib/data/supabase-readonly.ts` fornece leituras iniciais para:

- `caixas`;
- `produtos`;
- `unidades`;
- `locais`.

Ele nao substitui a camada local atual e nao implementa escrita.

## Promocao futura

Antes de qualquer uso real:

1. Validar migrations 0001-0005 no staging.
2. Validar RLS e Security Advisor.
3. Implementar Auth em etapa propria.
4. Migrar telas de forma gradual para repositorios Supabase.
5. Manter rollback para mock/localStorage ate a virada controlada.
