# Seeds — carga inicial (filial de exemplo `01` = Falsarella e Scarpini)

Gerados a partir dos DBFs reais do legado. Rodar **depois** das migrations
(`0001_core_schema.sql`, `0002_rls.sql`), no SQL Editor do Supabase (como
`service_role`, que ignora a RLS).

| Arquivo | Conteúdo | Versionado? |
|---|---|---|
| `seed_referencia.sql` | Filial, formas de pagamento, tabelas de preço + faixas (ESTAHORA), modelos de veículo (ESTACAR), convênios (ESTACONV) | ✅ sim (sem PII) |
| `local/seed_cadastros.sql` | Mensalistas + placas e clientes/fidelidade (ESTAAUTO) | ❌ **não** (contém dados pessoais — CPF, nome, telefone) |

Ordem de aplicação:

```
1) supabase/migrations/0001_core_schema.sql
2) supabase/migrations/0002_rls.sql
3) supabase/seed/seed_referencia.sql
4) supabase/seed/local/seed_cadastros.sql   (arquivo entregue à parte)
```

Os seeds são **idempotentes**: apagam os dados da filial `…0000f1` e recarregam.
