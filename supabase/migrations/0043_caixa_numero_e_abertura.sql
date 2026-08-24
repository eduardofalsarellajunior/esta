-- =============================================================================
-- 0043_caixa_numero_e_abertura.sql — numeração sequencial de caixa por filial.
--
-- Cada caixa passa a ter um número (1, 2, 3...) sequencial DENTRO da filial
-- (não global), preenchido sozinho na abertura — não depende de o app saber
-- calcular, então vale tanto pro botão "Abrir caixa" de sempre quanto pro
-- fluxo novo de abrir caixa embutido num recebimento (ver
-- src/componentes/AbrirCaixaInline.jsx) sem precisar de lógica extra ali.
--
-- Contexto do "abrir embutido": até aqui, receber algo (antecipado, venda de
-- produto, mensalidade, saída do pátio) sem caixa aberto só gravava o
-- pagamento fora do fechamento de caixa, com um aviso passivo. Agora esses
-- fluxos pedem o troco inicial na hora e abrem o caixa ali mesmo, então
-- "sem caixa aberto" deixa de acontecer na prática.
-- =============================================================================

alter table caixas add column numero integer;

create or replace function caixas_definir_numero() returns trigger as $$
begin
  if new.numero is null then
    new.numero := coalesce((select max(numero) from caixas where filial_id = new.filial_id), 0) + 1;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger caixas_numero_trigger before insert on caixas
  for each row execute function caixas_definir_numero();

-- Numera os caixas já existentes na ordem em que foram abertos, por filial.
with numerados as (
  select id, row_number() over (partition by filial_id order by aberto_em) as rn
  from caixas
)
update caixas c set numero = n.rn from numerados n where n.id = c.id;

alter table caixas alter column numero set not null;
comment on column caixas.numero is
  'Sequencial por filial (1, 2, 3...), preenchido sozinho na abertura (ver caixas_definir_numero()) — não é o mesmo número em filiais diferentes.';
