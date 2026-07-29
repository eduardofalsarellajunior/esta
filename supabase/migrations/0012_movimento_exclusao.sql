-- =============================================================================
-- 0012_movimento_exclusao.sql — exclusão (cancelamento) de entrada no pátio
-- Botão "Excluir" na tela do Pátio: operador só pode nos primeiros 5 minutos
-- da entrada (checado no app); supervisor sem restrição. Soft-delete: o
-- movimento sai da listagem "no pátio" mas o registro é mantido (auditoria),
-- com data/hora, motivo e quem excluiu.
-- =============================================================================

alter table movimentos
  add column excluido_em     timestamptz,
  add column excluido_motivo text,
  add column excluido_por    uuid references perfis (id);

comment on column movimentos.excluido_em is
  'Quando preenchido, o movimento foi excluído (cancelamento de entrada) — some da listagem "no pátio", mas o registro fica para auditoria.';
comment on column movimentos.excluido_motivo is 'Motivo informado pelo operador/supervisor ao excluir.';
comment on column movimentos.excluido_por is 'Quem excluiu (perfis.id).';
