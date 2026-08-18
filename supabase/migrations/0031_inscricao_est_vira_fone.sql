-- =============================================================================
-- 0031_inscricao_est_vira_fone.sql — inscricao_est reaproveitada como telefone
--
-- Coluna já existia (nunca foi usada em lugar nenhum do app — estacionamento
-- não tem Inscrição Estadual de verdade). O Eduardo já fazia esse mesmo
-- reaproveitamento no sistema antigo. Token @FONE@ (ver src/lib/dadosTicket.js)
-- e campo "Fone" em Configuracoes.jsx passam a usá-la. @EI@/Inscrição
-- municipal continua em inscricao_mun, sem mudança — essa é usada de verdade
-- no RPS/DPS (ver src/lib/fiscal.js).
-- =============================================================================

comment on column filiais.inscricao_est is
  'Reaproveitada como telefone do estacionamento (token @FONE@) — estacionamento não tem Inscrição Estadual de verdade, e não é usada em nenhum lugar do fiscal (isso é inscricao_mun/@EI@).';
