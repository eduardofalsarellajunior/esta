// Converte o texto reconhecido por voz (ex.: "a be ce um de dois tres") numa
// placa (ex.: "ABC1D23"). Ditar letra por letra é a única forma confiável de
// falar uma placa pro reconhecimento de voz entender — "abc1d23" corrido não
// funciona (o motor de voz tenta encaixar numa palavra e erra). Cada palavra
// dita vira uma letra/número pelo nome fonético em português; uma palavra já
// de uma letra/dígito só passa direto (alguns navegadores já devolvem assim).
const MAPA = {
  A: 'A', BE: 'B', CE: 'C', DE: 'D', E: 'E', EFE: 'F', GE: 'G', AGA: 'H', I: 'I', JOTA: 'J',
  CA: 'K', KA: 'K', ELE: 'L', EME: 'M', ENE: 'N', O: 'O', PE: 'P', QUE: 'Q', ERRE: 'R', ESSE: 'S',
  TE: 'T', U: 'U', VE: 'V', DABLIU: 'W', DOISVES: 'W', XIS: 'X', IPSILON: 'Y', ZE: 'Z',
  ZERO: '0', UM: '1', UMA: '1', DOIS: '2', TRES: '3', QUATRO: '4', CINCO: '5', SEIS: '6', SETE: '7', OITO: '8', NOVE: '9',
};

// ̀-ͯ = marcas diacríticas combinantes (acentos separados pelo
// normalize('NFD')) — escrito por código, não colado como caractere literal,
// pra não depender de encoding do arquivo/editor.
function semAcento(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Placas têm no máximo 7 caracteres (padrão antigo e Mercosul) — corta com folga de 1. */
const MAX_CARACTERES = 7;

export function normalizarDitadoPlaca(transcript) {
  const limpo = semAcento(String(transcript || '').toUpperCase()).replace(/[^A-Z0-9\s]/g, ' ');
  const tokens = limpo.split(/\s+/).filter(Boolean);
  let resultado = '';
  for (const t of tokens) {
    if (resultado.length >= MAX_CARACTERES) break;
    if (/^[A-Z0-9]$/.test(t)) { resultado += t; continue; }
    if (MAPA[t]) resultado += MAPA[t];
  }
  return resultado.slice(0, MAX_CARACTERES);
}
