import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import Crud from '../componentes/Crud.jsx';

// Telas de cadastro simples, todas sobre o CRUD genérico.

export function Convenios({ perfil }) {
  const [tabelasOpcoes, setTabelasOpcoes] = useState([]);

  useEffect(() => {
    supabase.from('tabelas_preco').select('tipo, descricao')
      .is('vigencia_fim', null).eq('ativo', true).order('tipo')
      .then(({ data }) => setTabelasOpcoes((data || []).map((t) => ({ valor: t.tipo, rotulo: `${t.tipo} · ${t.descricao}` }))));
  }, []);

  return <Crud perfil={perfil} titulo="Convênios" tabela="convenios" ordem="codigo"
    subtitulo="Descontos aplicados na saída (percentual, valor fixo, tabela alternativa ou grade própria)."
    colunas={[
      { campo: 'codigo', rotulo: 'Código', obrigatorio: true },
      { campo: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: [{ valor: 'C', rotulo: 'Convênio' }, { valor: 'V', rotulo: 'Vale' }] },
      { campo: 'razao', rotulo: 'Razão', obrigatorio: true },
      { campo: 'perc_conv', rotulo: '% desc.', tipo: 'number' },
      { campo: 'vlr_conv', rotulo: 'Vlr fixo', tipo: 'number' },
      { campo: 'tab_conv', rotulo: 'Tabela alt.', tipo: 'select', opcoes: tabelasOpcoes, naTabela: false,
        ajuda: 'Só tabelas de preço já cadastradas em Preços.' },
      { campo: 'tab_horas', rotulo: 'Grade própria (CON)', tipo: 'bool', naTabela: false },
      { campo: 'hor_conv', rotulo: 'Hora corte', tipo: 'hora', naTabela: false },
      { campo: 'pede_hora', rotulo: 'Pede hora', tipo: 'bool', naTabela: false },
      { campo: 'selos', rotulo: 'Selos', tipo: 'number', naTabela: false },
      { campo: 'valor_selo', rotulo: 'Vlr selo', tipo: 'number', naTabela: false },
      { campo: 'so_supervisor', rotulo: 'Só supervisor', tipo: 'bool', naTabela: false },
    ]} />;
}

export function Formas({ perfil }) {
  return <Crud perfil={perfil} titulo="Formas de pagamento" tabela="formas_pagamento" ordem="codigo"
    subtitulo="Dinheiro, débito, crédito, Pix… O % de ajuste altera o valor cobrado na forma."
    colunas={[
      { campo: 'codigo', rotulo: 'Código', obrigatorio: true },
      { campo: 'descricao', rotulo: 'Descrição', obrigatorio: true },
      { campo: 'perc_ajuste', rotulo: '% ajuste', tipo: 'number' },
      { campo: 'eh_dinheiro', rotulo: 'É dinheiro', tipo: 'bool' },
      { campo: 'rps_sempre', rotulo: 'RPS/DPS sempre', tipo: 'bool', naTabela: false },
      { campo: 'ativo', rotulo: 'Ativo', tipo: 'bool' },
    ]} />;
}

export function Vagas({ perfil }) {
  return <Crud perfil={perfil} titulo="Vagas / boxes" tabela="vagas" ordem="codigo"
    colunas={[
      { campo: 'codigo', rotulo: 'Código', obrigatorio: true },
      { campo: 'tipo', rotulo: 'Tipo' },
      { campo: 'ocupada', rotulo: 'Ocupada', tipo: 'bool' },
      { campo: 'placa_atual', rotulo: 'Placa', naTabela: true },
      { campo: 'ativo', rotulo: 'Ativo', tipo: 'bool' },
    ]} />;
}

export function Modelos({ perfil }) {
  return <Crud perfil={perfil} titulo="Modelos de veículo" tabela="modelos_veiculo" ordem="codigo"
    subtitulo="Catálogo de modelos e a tabela de preço padrão de cada um."
    colunas={[
      { campo: 'codigo', rotulo: 'Código', obrigatorio: true },
      { campo: 'nome', rotulo: 'Modelo', obrigatorio: true },
      { campo: 'tabela_tipo', rotulo: 'Tabela padrão' },
      { campo: 'ativo', rotulo: 'Ativo', tipo: 'bool' },
    ]} />;
}

export function Servicos({ perfil }) {
  const [tabelasOpcoes, setTabelasOpcoes] = useState([]);

  useEffect(() => {
    supabase.from('tabelas_preco').select('tipo, descricao')
      .is('vigencia_fim', null).eq('ativo', true).order('tipo')
      .then(({ data }) => setTabelasOpcoes((data || []).map((t) => ({ valor: t.tipo, rotulo: `${t.tipo} · ${t.descricao}` }))));
  }, []);

  return <Crud perfil={perfil} titulo="Serviços" tabela="servicos" ordem="codigo"
    subtitulo="Catálogo de serviços (ex.: lavagem, polimento) e a tabela de preço usada pra cobrar cada um."
    colunas={[
      { campo: 'codigo', rotulo: 'Código', obrigatorio: true },
      { campo: 'descricao', rotulo: 'Descrição', obrigatorio: true },
      { campo: 'tabela_tipo', rotulo: 'Tabela de preço', tipo: 'select', opcoes: tabelasOpcoes, obrigatorio: true,
        ajuda: 'Só tabelas de preço já cadastradas em Preços.' },
      { campo: 'ativo', rotulo: 'Ativo', tipo: 'bool' },
    ]} />;
}
