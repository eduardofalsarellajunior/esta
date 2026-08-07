// Validação de CPF/CNPJ (dígito verificador). Usada nos pontos onde o
// documento vai parar numa nota fiscal — documento inválido é um dos motivos
// clássicos de rejeição pela prefeitura, e é barato pegar isso na digitação.

export function apenasDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

/** Dígito verificador padrão da Receita: soma ponderada, módulo 11. */
function digitoVerificador(digitos, pesos) {
  const soma = pesos.reduce((total, peso, i) => total + Number(digitos[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCpf(valor) {
  const d = apenasDigitos(valor);
  if (d.length !== 11) return false;
  // 111.111.111-11 e afins passam no cálculo, mas não são CPF válido.
  if (/^(\d)\1{10}$/.test(d)) return false;
  const dv1 = digitoVerificador(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = digitoVerificador(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv1 === Number(d[9]) && dv2 === Number(d[10]);
}

export function validarCnpj(valor) {
  const d = apenasDigitos(valor);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  const dv1 = digitoVerificador(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = digitoVerificador(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv1 === Number(d[12]) && dv2 === Number(d[13]);
}

/**
 * Valida um campo que aceita CPF **ou** CNPJ, decidindo pelo tamanho.
 * Vazio é `{ vazio: true }` e não é erro — tomador sem documento é caso
 * legítimo (cliente avulso, que vira `cNaoNIF`/tomador em branco na nota).
 */
export function validarCpfCnpj(valor) {
  const d = apenasDigitos(valor);
  if (!d) return { vazio: true, valido: true, tipo: null };
  if (d.length === 11) return { vazio: false, valido: validarCpf(d), tipo: 'CPF' };
  if (d.length === 14) return { vazio: false, valido: validarCnpj(d), tipo: 'CNPJ' };
  return { vazio: false, valido: false, tipo: null };
}

/** Mensagem pronta pra mostrar embaixo do campo (null quando está tudo certo). */
export function erroCpfCnpj(valor) {
  const r = validarCpfCnpj(valor);
  if (r.vazio || r.valido) return null;
  if (!r.tipo) return 'Deve ter 11 dígitos (CPF) ou 14 (CNPJ).';
  return `${r.tipo} inválido — confira os números.`;
}

/** "12345678909" -> "123.456.789-09" / "12345678000195" -> "12.345.678/0001-95". */
export function formatarCpfCnpj(valor) {
  const d = apenasDigitos(valor);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return String(valor ?? '');
}
