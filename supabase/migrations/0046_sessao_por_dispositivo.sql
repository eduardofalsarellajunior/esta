-- =============================================================================
-- 0046_sessao_por_dispositivo.sql — cada dispositivo/aba vira uma sessão
-- própria, não mais uma por usuário (perfil).
--
-- Antes (0032): unique(filial_id, perfil_id) — o mesmo login em 2 aparelhos
-- upsertava a MESMA linha, então o Painel de Uso mostrava 1 mesmo com 2
-- pessoas conectadas nesse login, e o limite de usuários simultâneos podia
-- ser furado compartilhando 1 login entre vários operadores. Agora cada
-- sessão (gerada no navegador, ver src/telas/SessoesGate.jsx) tem sua
-- própria linha — o limite passa a valer por CONEXÃO, não por pessoa.
-- =============================================================================

alter table sessoes_ativas add column sessao_id text not null default gen_random_uuid()::text;
alter table sessoes_ativas drop constraint sessoes_ativas_filial_id_perfil_id_key;
alter table sessoes_ativas add constraint sessoes_ativas_filial_perfil_sessao_key
  unique (filial_id, perfil_id, sessao_id);
comment on column sessoes_ativas.sessao_id is
  'Id gerado no navegador (sessionStorage, um por aba/dispositivo — ver SessoesGate.jsx). Sem valor default de verdade pra uso normal: o default aqui é só pra não quebrar linhas antigas ao aplicar esta migration.';
