// Leitor de .DBF (dBASE III / Clipper) — puro, sem dependências, roda no
// navegador (client-side) ou no Node. Formato: header fixo de 32 bytes,
// descritores de campo de 32 bytes cada (até o terminador 0x0D), registros de
// tamanho fixo (1 byte de exclusão + campos concatenados).
//
// O texto do legado está em CP850 (confirmado em docs/ANALISE-E-ARQUITETURA.md
// — codepage de DOS/PT-BR). O `TextDecoder` do navegador não suporta CP850
// nativamente, por isso a tabela abaixo — conferida byte a byte contra a
// tabela oficial da Unicode.org
// (unicode.org/Public/MAPPINGS/VENDORS/MICSFT/PC/CP850.TXT).

// Bytes 0x80–0xFF -> código Unicode (índice 0 = byte 0x80). 0x00–0x7F é igual ao ASCII.
const CP850_ALTA: number[] = [
  0x00c7, 0x00fc, 0x00e9, 0x00e2, 0x00e4, 0x00e0, 0x00e5, 0x00e7,
  0x00ea, 0x00eb, 0x00e8, 0x00ef, 0x00ee, 0x00ec, 0x00c4, 0x00c5,
  0x00c9, 0x00e6, 0x00c6, 0x00f4, 0x00f6, 0x00f2, 0x00fb, 0x00f9,
  0x00ff, 0x00d6, 0x00dc, 0x00f8, 0x00a3, 0x00d8, 0x00d7, 0x0192,
  0x00e1, 0x00ed, 0x00f3, 0x00fa, 0x00f1, 0x00d1, 0x00aa, 0x00ba,
  0x00bf, 0x00ae, 0x00ac, 0x00bd, 0x00bc, 0x00a1, 0x00ab, 0x00bb,
  0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x00c1, 0x00c2, 0x00c0,
  0x00a9, 0x2563, 0x2551, 0x2557, 0x255d, 0x00a2, 0x00a5, 0x2510,
  0x2514, 0x2534, 0x252c, 0x251c, 0x2500, 0x253c, 0x00e3, 0x00c3,
  0x255a, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256c, 0x00a4,
  0x00f0, 0x00d0, 0x00ca, 0x00cb, 0x00c8, 0x0131, 0x00cd, 0x00ce,
  0x00cf, 0x2518, 0x250c, 0x2588, 0x2584, 0x00a6, 0x00cc, 0x2580,
  0x00d3, 0x00df, 0x00d4, 0x00d2, 0x00f5, 0x00d5, 0x00b5, 0x00fe,
  0x00de, 0x00da, 0x00db, 0x00d9, 0x00fd, 0x00dd, 0x00af, 0x00b4,
  0x00ad, 0x00b1, 0x2017, 0x00be, 0x00b6, 0x00a7, 0x00f7, 0x00b8,
  0x00b0, 0x00a8, 0x00b7, 0x00b9, 0x00b3, 0x00b2, 0x25a0, 0x00a0,
];

/** Decodifica bytes em CP850 pra string JS. */
export function decodificarCp850(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    s += String.fromCodePoint(b < 0x80 ? b : CP850_ALTA[b - 0x80]);
  }
  return s;
}

export type CampoDbf = { nome: string; tipo: string; tamanho: number; decimais: number };
export type ValorDbf = string | number | boolean | null;
export type RegistroDbf = Record<string, ValorDbf>;

function converterValor(texto: string, tipo: string): ValorDbf {
  switch (tipo) {
    case 'N':
    case 'F': {
      const t = texto.trim();
      if (!t) return null;
      const n = Number(t);
      return Number.isNaN(n) ? null : n;
    }
    case 'L': {
      const c = texto.trim();
      if (c === 'T' || c === 't' || c === 'Y' || c === 'y') return true;
      if (c === 'F' || c === 'f' || c === 'N' || c === 'n') return false;
      return null;
    }
    case 'D': {
      const t = texto.trim();
      if (t.length !== 8) return null;
      return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
    }
    case 'M':
      return null; // memo (.DBT) não suportado — não usado nos cadastros importados
    default: // 'C' e demais tipos de texto: só remove o padding de espaços à direita
      return texto.replace(/ +$/, '');
  }
}

/** Lê um .DBF (dBASE III/Clipper) de um ArrayBuffer. Registros excluídos (flag 0x2A) são descartados. */
export function lerDbf(buffer: ArrayBuffer): { campos: CampoDbf[]; registros: RegistroDbf[] } {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const numRegistros = view.getUint32(4, true);
  const tamanhoHeader = view.getUint16(8, true);
  const tamanhoRegistro = view.getUint16(10, true);

  const campos: CampoDbf[] = [];
  let offset = 32;
  while (offset < tamanhoHeader - 1 && bytes[offset] !== 0x0d) {
    const nomeBytes = bytes.subarray(offset, offset + 11);
    const fimNome = nomeBytes.indexOf(0);
    const nome = decodificarCp850(nomeBytes.subarray(0, fimNome === -1 ? 11 : fimNome));
    const tipo = String.fromCharCode(bytes[offset + 11]);
    const tamanho = bytes[offset + 16];
    const decimais = bytes[offset + 17];
    campos.push({ nome, tipo, tamanho, decimais });
    offset += 32;
  }

  const registros: RegistroDbf[] = [];
  for (let i = 0; i < numRegistros; i++) {
    const inicio = tamanhoHeader + i * tamanhoRegistro;
    if (inicio >= bytes.length) break;
    if (bytes[inicio] === 0x2a) continue; // excluído no legado

    const registro: RegistroDbf = {};
    let pos = inicio + 1;
    for (const campo of campos) {
      const brutos = bytes.subarray(pos, pos + campo.tamanho);
      registro[campo.nome] = converterValor(decodificarCp850(brutos), campo.tipo);
      pos += campo.tamanho;
    }
    registros.push(registro);
  }

  return { campos, registros };
}
