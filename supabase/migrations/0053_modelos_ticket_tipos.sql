-- =============================================================================
-- 0053_modelos_ticket_tipos.sql — corrige o check de `tipo` em modelos_ticket
--
-- Bug encontrado revisando a importação de modelos de ticket: os tipos
-- "reserva" (0035_reservas.sql) e "divida" (feature do saldo devedor) foram
-- adicionados na lista do app (packages tarifacao/../modelosPadrao.js,
-- TIPOS_TICKET) mas o CHECK do banco nunca foi atualizado — ficou travado
-- nos 5 tipos originais de 0017. Salvar um modelo customizado de Reserva ou
-- Dívida em Modelos de ticket dava erro de constraint, sem ninguém ter
-- reparado ainda (provavelmente porque os dois ainda usam o padrão de
-- fábrica, sem customização, na maioria das filiais).
-- =============================================================================

do $$
declare
  v_nome text;
begin
  select conname into v_nome from pg_constraint
  where conrelid = 'modelos_ticket'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) like '%tipo%';
  if v_nome is not null then
    execute format('alter table modelos_ticket drop constraint %I', v_nome);
  end if;
end $$;

alter table modelos_ticket add constraint modelos_ticket_tipo_check
  check (tipo in ('entrada', 'saida', 'segunda_via', 'mensalidade', 'rps', 'reserva', 'divida'));

comment on column modelos_ticket.tipo is
  'entrada, saida, segunda_via (cliente perdeu o ticket), mensalidade, rps, reserva (reserva de vaga), divida (forma "Devedor").';
