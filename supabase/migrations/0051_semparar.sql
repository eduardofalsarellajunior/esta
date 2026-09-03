-- =============================================================================
-- 0051_semparar.sql — integração Sem Parar (pagamento por placa, sem cancela)
--
-- Fluxo (ver docs/SEMPARAR.md e o manual do Sem Parar):
--  1. ENTRADA: chama Autoriza pra saber se a placa pode pagar por Sem Parar
--     aqui — guarda o token/status no próprio movimento.
--  2. SAÍDA: se o operador escolher "Sem Parar" nas formas de pagamento,
--     chama Recebe + Confirma. Escolhendo qualquer outra forma, o Sem Parar
--     simplesmente não é usado (não existe endpoint pra "desistir" de uma
--     mera autorização — só de uma transação já confirmada, ver Cancela,
--     não implementado nesta fase).
--
-- Credenciais: a chave da integradora (x-api-key, única, dada pelo Sem Parar
-- pro esta como um todo) fica só em variável de ambiente do Vercel — nunca
-- no banco. Por filial, o código do estabelecimento e o hash ficam em
-- filiais.config.semparar (jsonb já existente, sem precisar de coluna nova).
-- =============================================================================

alter table movimentos
  add column semparar_status         text check (semparar_status in
    ('pendente', 'autorizado', 'negado', 'recebido', 'confirmado', 'nao_utilizado', 'erro')),
  add column semparar_token          text,
  add column semparar_sticker        text,
  add column semparar_nsu            text,
  add column semparar_transaction_id text,
  add column semparar_valor          numeric(10,2);

comment on column movimentos.semparar_status is
  'Estado da integração Sem Parar pra este movimento — autorizado (na entrada, pode pagar aqui), negado, recebido (Recebe ok, aguardando Confirma), confirmado (pago), nao_utilizado (tinha autorização mas saiu por outra forma), erro. NULL = filial sem Sem Parar ligado.';
comment on column movimentos.semparar_token is 'Token da autorização (Autoriza, na entrada) — usado no Recebe da saída.';
comment on column movimentos.semparar_transaction_id is 'ID da transação (devolvido pelo Recebe, usado no Confirma) — guardado assim que o Recebe responde, antes mesmo do Confirma, pra uma tentativa nova (se o Confirma falhar) retomar dali sem repetir o Recebe.';
comment on column movimentos.semparar_nsu is 'NSU gerado (proximo_nsu_semparar) — único, nunca reaproveitado, mesmo em nova tentativa.';
comment on column movimentos.semparar_valor is 'Valor efetivamente cobrado por Sem Parar (pode ser só parte da saída, se dividida entre formas).';

alter table formas_pagamento add column eh_semparar boolean not null default false;
comment on column formas_pagamento.eh_semparar is
  'Forma "Sem Parar" — ver src/lib telas/Patio.jsx: só dispara o fluxo Recebe/Confirma quando o operador escolhe explicitamente esta forma, nunca sozinho.';

-- NSU: 12 caracteres, código do estabelecimento (5 dígitos, zero à esquerda)
-- + sequencial de 7 dígitos — exigido único e NUNCA reaproveitado (diferente
-- do @C#@/controle, que gira). Uma linha por filial, incrementada
-- atomicamente (UPDATE...RETURNING é uma transação só, sob lock de linha —
-- sem a corrida de leitura+escrita separadas que fiscal_sequencias tem).
create table semparar_sequencias (
  filial_id uuid primary key references filiais (id),
  proximo   bigint not null default 1
);
comment on table semparar_sequencias is 'Sequencial do NSU do Sem Parar por filial — ver proximo_nsu_semparar().';

create or replace function proximo_nsu_semparar(p_filial uuid, p_codigo_estabelecimento text)
returns text
language plpgsql
as $$
declare
  v_prox bigint;
begin
  insert into semparar_sequencias (filial_id) values (p_filial)
    on conflict (filial_id) do nothing;
  update semparar_sequencias set proximo = proximo + 1
    where filial_id = p_filial
    returning proximo - 1 into v_prox;
  return lpad(left(p_codigo_estabelecimento, 5), 5, '0') || lpad(v_prox::text, 7, '0');
end;
$$;
comment on function proximo_nsu_semparar is
  'Próximo NSU (12 caracteres) desta filial pro Sem Parar — atômico, nunca repete. Só chamado pelo servidor (api/semparar-saida.js), nunca do navegador.';
