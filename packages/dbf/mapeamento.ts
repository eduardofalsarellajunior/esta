// Mapeamento DBF -> colunas do esta, pra importação de Mensalistas e Modelos
// de veículo. Puro (sem Supabase) — a gravação fica em src/lib/importacaoDbf.js.
import type { RegistroDbf, ValorDbf } from './dbf.ts';

export type TipoColuna = 'texto' | 'number' | 'bool' | 'data';
export type ColunaDestino = {
  campo: string;
  rotulo: string;
  tipo?: TipoColuna;      // default: 'texto'
  obrigatorio?: boolean;  // sem valor -> linha rejeitada
  padrao?: ValorDbf;      // aplicado quando a coluna é NOT NULL no banco e o dbf não trouxe valor
  palpites?: string[];    // nomes de campo do dbf tentados automaticamente (case-insensitive)
};

export type Destino = {
  rotulo: string;
  tabela: string;
  colunas: ColunaDestino[];
  placas: ColunaDestino[]; // só usado no destino "mensalistas" (placas inline do legado -> mensalista_veiculos)
};

export const DESTINOS: Record<string, Destino> = {
  mensalistas: {
    rotulo: 'Mensalistas',
    tabela: 'mensalistas',
    colunas: [
      { campo: 'codigo', rotulo: 'Código', obrigatorio: true, palpites: ['NOMECAR', 'CODIGO'] },
      { campo: 'razao', rotulo: 'Nome', obrigatorio: true, palpites: ['RAZAO', 'NOME'] },
      { campo: 'tipo_mens', rotulo: 'Tipo (I/P/H)', palpites: ['TIPOMENS'], padrao: 'I' },
      { campo: 'cpf_cnpj', rotulo: 'CPF/CNPJ', palpites: ['CPF', 'CGC', 'CNPJ'] },
      { campo: 'telefone', rotulo: 'Telefone', palpites: ['TELEFONE', 'FONE'] },
      { campo: 'celular', rotulo: 'Celular', palpites: ['CELULAR'] },
      { campo: 'email', rotulo: 'E-mail', palpites: ['EMAIL'] },
      { campo: 'endereco', rotulo: 'Endereço', palpites: ['ENDERECO'] },
      { campo: 'numero', rotulo: 'Número', palpites: ['NUMERO', 'NUM'] },
      { campo: 'bairro', rotulo: 'Bairro', palpites: ['BAIRRO'] },
      { campo: 'cidade', rotulo: 'Cidade', palpites: ['CIDADE'] },
      { campo: 'uf', rotulo: 'UF', palpites: ['UF', 'ESTADO'] },
      { campo: 'cep', rotulo: 'CEP', palpites: ['CEP'] },
      { campo: 'box', rotulo: 'Box', palpites: ['BOX'] },
      { campo: 'valor_mensalidade', rotulo: 'Valor da mensalidade', tipo: 'number', palpites: ['VALOR', 'VLRMES', 'VLRMES01'], padrao: 0 },
      { campo: 'proximo_pagamento', rotulo: 'Data do próximo pagamento', tipo: 'data', palpites: ['DIA', 'PROXVENC', 'DTVENC', 'DATAVENC', 'VENCIMENTO'] },
      { campo: 'dia_venc', rotulo: 'Dia vencimento', tipo: 'number', palpites: ['DIAVENC'] },
      { campo: 'tolerancia_dias', rotulo: 'Tolerância (dias)', tipo: 'number', palpites: ['TOLERANCIA'], padrao: 0 },
      { campo: 'multa_pct', rotulo: 'Multa %', tipo: 'number', palpites: ['MULTA'], padrao: 0 },
      { campo: 'juros_pct', rotulo: 'Juros %', tipo: 'number', palpites: ['JUROS'], padrao: 0 },
      { campo: 'qte_vagas', rotulo: 'Vagas contratadas', tipo: 'number', palpites: ['QTEVAGAS'], padrao: 1 },
      { campo: 'restr_manha', rotulo: 'Restrição manhã', palpites: ['RESTRM'] },
      { campo: 'restr_tarde', rotulo: 'Restrição tarde', palpites: ['RESTRT'] },
      { campo: 'restr_noite', rotulo: 'Restrição noite', palpites: ['RESTRN'] },
      { campo: 'periodo1', rotulo: 'Período 1', tipo: 'number', palpites: ['PERIODO1'], padrao: 0 },
      { campo: 'periodo2', rotulo: 'Período 2', tipo: 'number', palpites: ['PERIODO2'], padrao: 0 },
      { campo: 'periodo3', rotulo: 'Período 3', tipo: 'number', palpites: ['PERIODO3'], padrao: 0 },
      { campo: 'hora_extra', rotulo: 'Hora extra', tipo: 'bool', palpites: ['HORAEXTRA'], padrao: false },
      { campo: 'ativo', rotulo: 'Ativo', tipo: 'bool', palpites: ['ATIVO'], padrao: true },
    ],
    placas: [
      { campo: 'placa1', rotulo: 'Placa 1', palpites: ['VEICULO'] },
      { campo: 'placa2', rotulo: 'Placa 2', palpites: ['VEICULO1'] },
      { campo: 'placa3', rotulo: 'Placa 3', palpites: ['VEICULO2'] },
    ],
  },
  modelos_veiculo: {
    rotulo: 'Modelos de veículo',
    tabela: 'modelos_veiculo',
    colunas: [
      { campo: 'codigo', rotulo: 'Código', obrigatorio: true, palpites: ['CODIGO'] },
      { campo: 'nome', rotulo: 'Modelo', obrigatorio: true, palpites: ['CARRO'] },
      { campo: 'tabela_tipo', rotulo: 'Tabela padrão', palpites: ['TABELA'] },
      { campo: 'ativo', rotulo: 'Ativo', tipo: 'bool', palpites: ['ATIVO'], padrao: true },
    ],
    placas: [],
  },
};

/** Mapeamento automático: pra cada coluna de destino, acha o primeiro campo do dbf cujo nome bate com um dos palpites (case-insensitive). */
export function sugerirMapeamento(colunas: ColunaDestino[], camposDbf: string[]): Record<string, string | null> {
  const mapeamento: Record<string, string | null> = {};
  for (const col of colunas) {
    const alvo = (col.palpites || []).map((p) => p.toUpperCase());
    const achado = camposDbf.find((c) => alvo.includes(c.toUpperCase()));
    mapeamento[col.campo] = achado ?? null;
  }
  return mapeamento;
}

export function paraTexto(v: ValorDbf): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export function paraNumero(v: ValorDbf): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).trim());
  return Number.isNaN(n) ? null : n;
}

const REGEX_DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Só aceita uma data ISO 'YYYY-MM-DD' já pronta — é o formato que `lerDbf`
 * devolve pra campos do tipo `D` (Date) do próprio .dbf. Se o campo mapeado
 * não for um campo de data de verdade (ex.: um número de dia isolado, sem
 * mês/ano), fica em branco em vez de gravar uma data inválida — aparece
 * vazio na prévia, sinal de que o mapeamento dessa coluna está errado.
 */
export function paraData(v: ValorDbf): string | null {
  if (typeof v !== 'string') return null;
  return REGEX_DATA_ISO.test(v) ? v : null;
}

export function paraBool(v: ValorDbf): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toUpperCase();
  if (['S', 'T', 'Y', '1'].includes(s)) return true;
  if (['N', 'F', '0'].includes(s)) return false;
  return null;
}

/** Converte um registro do dbf pras colunas de destino, aplicando o mapeamento e os tipos/padrões da coluna. */
export function converterLinha(
  registro: RegistroDbf,
  colunas: ColunaDestino[],
  mapeamento: Record<string, string | null>,
): Record<string, ValorDbf> {
  const linha: Record<string, ValorDbf> = {};
  for (const col of colunas) {
    const campoDbf = mapeamento[col.campo];
    const bruto = campoDbf ? registro[campoDbf] : null;
    const convertido = col.tipo === 'number' ? paraNumero(bruto)
      : col.tipo === 'bool' ? paraBool(bruto)
      : col.tipo === 'data' ? paraData(bruto)
      : paraTexto(bruto);
    linha[col.campo] = convertido ?? col.padrao ?? null;
  }
  return linha;
}
