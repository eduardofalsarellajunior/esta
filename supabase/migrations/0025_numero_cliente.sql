-- =============================================================================
-- 0025_numero_cliente.sql — número do cliente (Eduardo) no cadastro da filial
--
-- Aparece antes do nome do estacionamento no cabeçalho da tela (ver
-- src/componentes/Layout.jsx). Texto, não numérico — pode ter prefixo/zero à
-- esquerda. Nullable: sem preencher, o cabeçalho continua exatamente como
-- hoje (só o nome).
-- =============================================================================

alter table filiais add column numero_cliente text;
comment on column filiais.numero_cliente is
  'Número do cliente (uso interno do fornecedor) — aparece antes do nome no cabeçalho da tela.';
