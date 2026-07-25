import { useState } from 'react';
import Crud from '../componentes/Crud.jsx';
import { supabase } from '../lib/supabase.js';
import { hojeISO } from '../lib/tempo.js';

const COLS_RECEBER = [
  { campo: 'descricao', rotulo: 'Descrição', obrigatorio: true },
  { campo: 'cliente_nome', rotulo: 'Cliente' },
  { campo: 'valor', rotulo: 'Valor', tipo: 'number', obrigatorio: true },
  { campo: 'vencimento', rotulo: 'Vencimento', obrigatorio: true, ajuda: 'AAAA-MM-DD' },
  { campo: 'origem', rotulo: 'Origem', tipo: 'select', opcoes: [
    { valor: 'manual', rotulo: 'Manual' }, { valor: 'mensalidade', rotulo: 'Mensalidade' },
    { valor: 'convenio', rotulo: 'Convênio' }, { valor: 'avulso', rotulo: 'Avulso' }] },
  { campo: 'pago', rotulo: 'Pago', tipo: 'bool' },
  { campo: 'dt_pagamento', rotulo: 'Dt. pagto', ajuda: 'AAAA-MM-DD', naTabela: false },
  { campo: 'valor_pago', rotulo: 'Vlr pago', tipo: 'number', naTabela: false },
];

export function Receber({ perfil }) {
  const [versao, setVersao] = useState(0);
  const [msg, setMsg] = useState('');

  async function gerarDeMensalidades() {
    setMsg('');
    const { data: mens, error } = await supabase.from('mensalidades').select('*').eq('pago', false);
    if (error) { setMsg(error.message); return; }
    if (!mens?.length) { setMsg('Nenhuma mensalidade em aberto para gerar.'); return; }
    // Dedup simples: não recria título já existente para o mesmo mensalista+vencimento.
    const { data: existentes } = await supabase.from('titulos_receber').select('mensalista_id,vencimento').eq('origem', 'mensalidade');
    const chave = new Set((existentes || []).map((t) => `${t.mensalista_id}|${t.vencimento}`));
    const novos = mens.filter((m) => !chave.has(`${m.mensalista_id}|${m.vencimento}`)).map((m) => ({
      filial_id: perfil.filial_id, descricao: `Mensalidade ${m.competencia}`,
      mensalista_id: m.mensalista_id, valor: m.valor, vencimento: m.vencimento, origem: 'mensalidade',
    }));
    if (!novos.length) { setMsg('Títulos já estavam gerados.'); return; }
    const { error: e2 } = await supabase.from('titulos_receber').insert(novos);
    if (e2) setMsg(e2.message); else { setMsg(`${novos.length} título(s) gerado(s).`); setVersao((v) => v + 1); }
  }

  return (
    <>
      <div className="card">
        <div className="card-cab">
          <div><h2>Contas a receber</h2><p className="suave">Ponte automática: gera títulos a partir das mensalidades em aberto.</p></div>
          <button className="btn-primary" onClick={gerarDeMensalidades}>Gerar de mensalidades</button>
        </div>
        {msg && <div className="suave">{msg}</div>}
      </div>
      <Crud key={versao} perfil={perfil} titulo="Títulos a receber" tabela="titulos_receber" ordem="vencimento" colunas={COLS_RECEBER} />
    </>
  );
}

export function Pagar({ perfil }) {
  return (
    <>
      <Crud perfil={perfil} titulo="Fornecedores" tabela="fornecedores" ordem="nome"
        colunas={[
          { campo: 'nome', rotulo: 'Nome', obrigatorio: true },
          { campo: 'cnpj_cpf', rotulo: 'CNPJ/CPF' },
          { campo: 'telefone', rotulo: 'Telefone', naTabela: false },
          { campo: 'email', rotulo: 'E-mail', naTabela: false },
          { campo: 'ativo', rotulo: 'Ativo', tipo: 'bool' },
        ]} />
      <Crud perfil={perfil} titulo="Contas a pagar" tabela="titulos_pagar" ordem="vencimento"
        colunas={[
          { campo: 'descricao', rotulo: 'Descrição', obrigatorio: true },
          { campo: 'valor', rotulo: 'Valor', tipo: 'number', obrigatorio: true },
          { campo: 'vencimento', rotulo: 'Vencimento', obrigatorio: true, ajuda: 'AAAA-MM-DD' },
          { campo: 'pago', rotulo: 'Pago', tipo: 'bool' },
          { campo: 'dt_pagamento', rotulo: 'Dt. pagto', ajuda: 'AAAA-MM-DD', naTabela: false },
        ]} />
    </>
  );
}

export function Banco({ perfil }) {
  return (
    <>
      <Crud perfil={perfil} titulo="Contas bancárias" tabela="contas_bancarias" ordem="nome"
        colunas={[
          { campo: 'nome', rotulo: 'Nome', obrigatorio: true },
          { campo: 'banco', rotulo: 'Banco' },
          { campo: 'agencia', rotulo: 'Agência' },
          { campo: 'conta', rotulo: 'Conta' },
          { campo: 'saldo_inicial', rotulo: 'Saldo inicial', tipo: 'number' },
          { campo: 'ativo', rotulo: 'Ativo', tipo: 'bool' },
        ]} />
      <Crud perfil={perfil} titulo="Lançamentos" tabela="lancamentos_banco" ordem="data" ascending={false}
        subtitulo="Valor positivo = crédito; negativo = débito."
        colunas={[
          { campo: 'data', rotulo: 'Data', obrigatorio: true, ajuda: 'AAAA-MM-DD' },
          { campo: 'historico', rotulo: 'Histórico', obrigatorio: true },
          { campo: 'valor', rotulo: 'Valor', tipo: 'number', obrigatorio: true },
          { campo: 'centro_custo', rotulo: 'C. custo' },
          { campo: 'conciliado', rotulo: 'Concil.', tipo: 'bool' },
        ]} />
    </>
  );
}
