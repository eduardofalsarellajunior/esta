-- =============================================================================
-- 0019_esconde_fornecedor.sql — fornecedor não aparece na lista do cliente
--
-- Quem mantém o sistema não é funcionário do estacionamento: não faz sentido
-- o supervisor do cliente ver (nem poder desativar) esse usuário na tela de
-- Usuários. A casa do fornecedor deveria ficar numa filial só dele, mas isso
-- é convenção — esta policy garante o resultado mesmo se um fornecedor for
-- criado dentro da filial de um cliente.
--
-- Depende de 0018_papeis_e_fornecedor.sql.
-- =============================================================================

drop policy if exists perfis_tenant_select on perfis;
create policy perfis_tenant_select on perfis for select to authenticated
  using (
    -- A própria linha, sempre (o fornecedor operando outro cliente depende
    -- disso pra conseguir carregar o próprio perfil no login).
    id = auth.uid()
    or (
      filial_id = filial_do_usuario()
      and (papel <> 'fornecedor' or usuario_eh_fornecedor())
    )
  );
