import { normalizar } from './texto.js';

// Consulta pública de CNPJ via BrasilAPI (https://brasilapi.com.br) — dados
// cadastrais de empresa (razão social, endereço) são públicos, ao contrário
// de CPF, protegido por sigilo fiscal (não existe consulta livre equivalente
// pra pessoa física — a Receita só libera isso pro próprio CPF logado via
// gov.br, o que não serve pro operador digitando o documento de outra
// pessoa). Só pré-preenche formulário — quem usa sempre revisa antes de
// salvar. Sem chave/autenticação: é uma API pública, sem dado sensível.
/**
 * A base da Receita costuma trazer o número junto do logradouro (ex.:
 * "PAULISTA 37"), duplicando o campo Número (que já vem separado) — tira se
 * for exatamente esse sufixo.
 */
export function limparLogradouro(logradouro, numero) {
  const lg = String(logradouro || '').trim();
  const nr = String(numero || '').trim();
  if (nr && lg.endsWith(nr)) return lg.slice(0, -nr.length).trim();
  return lg;
}

export async function buscarCnpj(documento) {
  const limpo = String(documento || '').replace(/\D/g, '');
  if (limpo.length !== 14) return { erro: 'Preencha um CNPJ válido (14 dígitos) para buscar.' };

  let resp;
  try {
    resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${limpo}`);
  } catch {
    return { erro: 'Falha ao consultar o CNPJ — sem conexão.' };
  }
  if (!resp.ok) {
    return { erro: resp.status === 404 ? 'CNPJ não encontrado.' : `Falha ao consultar o CNPJ (${resp.status}).` };
  }
  const d = await resp.json();
  const numero = String(d.numero || '').trim();
  return {
    nome: d.razao_social || d.nome_fantasia || '',
    endereco: [d.descricao_tipo_de_logradouro, limparLogradouro(d.logradouro, numero)].filter(Boolean).join(' ').trim(),
    numero,
    bairro: d.bairro || '',
    cidade: d.municipio || '',
    uf: d.uf || '',
    cep: d.cep || '',
  };
}

/**
 * Acha o município (com código IBGE) pelo nome + UF vindos da consulta de
 * CNPJ acima — mesma base de dados da tela (CidadeBusca.jsx), só que
 * casamento exato em vez de busca digitada.
 */
export async function municipioIbgeDe(cidade, uf) {
  if (!cidade) return null;
  const { default: municipios } = await import('./municipiosIbge.json');
  const alvo = normalizar(cidade);
  return municipios.find((m) => normalizar(m.nome) === alvo && (!uf || m.uf === uf)) || null;
}
