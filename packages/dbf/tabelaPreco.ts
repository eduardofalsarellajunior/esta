// Importação da tabela de preço (ESTAHORA.dbf do legado) — foge do padrão de
// mapeamento coluna-a-coluna do resto da importação (packages/dbf/mapeamento.ts)
// porque o ESTAHORA é "largo": uma linha por tabela de preço, com até 45
// faixas lado a lado (ATE01/HOR01/CON01 .. ATE45/HOR45/CON45) — não dá pra
// escolher isso à mão num formulário de 135 campos, então detecta os grupos
// de coluna direto pelo nome.
//
// Cobre só o que a tabelas_preco/tabela_preco_faixas de hoje tem (ver
// supabase/migrations/0001_core_schema.sql + 0006/0007/0008/0021/0024):
// pernoite/diária/tolerância/por-minuto foram REMOVIDOS do motor numa
// reescrita anterior (0008_remove_pernoite.sql) — mesmo que o ESTAHORA tenha
// campos EPERNOITE/SPERNOITE/VPERNOITE/TOL, eles não têm mais onde entrar,
// então nem são lidos aqui. `tipo_cobranca`/`periodo` das faixas também são
// conceito novo sem equivalente no legado — toda faixa importada nasce
// 'fixo'/1.00 (o comportamento de sempre), ajustável depois em Preços.
import type { RegistroDbf, ValorDbf } from './dbf.ts';

export type FaixaDetectada = {
  ordem: number;
  ate: number;
  valorHora: number;
  valorConvenio: number;
};

export type TabelaPrecoDetectada = {
  tipo: string;
  descricao: string;
  valorAntes: number;
  qtePontos: number;
  faixas: FaixaDetectada[];
};

const PALPITES_TIPO = ['TIPO'];
const PALPITES_DESCRICAO = ['DESCRICAO', 'DESCRI', 'DESCR'];
const PALPITES_VALOR_ANTES = ['VALORANTES'];
const PALPITES_QTE_PONTOS = ['QTEPONTOS'];

function acharCampo(nomes: string[], candidatos: string[]): string | null {
  for (const candidato of candidatos) {
    const achado = nomes.find((n) => n.toUpperCase() === candidato.toUpperCase());
    if (achado) return achado;
  }
  return null;
}

/**
 * Grupos ATEnn/HORnn/CONnn (nn = 1..45, com ou sem zero à esquerda) direto
 * pelos nomes de campo do .dbf carregado — só entra na lista quem tem pelo
 * menos ATE e HOR (CON é opcional, algumas tabelas não têm grade de convênio).
 */
export function detectarColunasFaixa(nomes: string[]): Array<{ ordem: number; ate: string; hor: string; con: string | null }> {
  const porOrdem = new Map<number, { ate?: string; hor?: string; con?: string }>();
  for (const nome of nomes) {
    const m = nome.toUpperCase().match(/^(ATE|HOR|CON)0*(\d{1,2})$/);
    if (!m) continue;
    const ordem = Number(m[2]);
    if (!ordem || ordem > 45) continue;
    const grupo = porOrdem.get(ordem) || {};
    if (m[1] === 'ATE') grupo.ate = nome;
    else if (m[1] === 'HOR') grupo.hor = nome;
    else grupo.con = nome;
    porOrdem.set(ordem, grupo);
  }
  return [...porOrdem.entries()]
    .filter((entrada): entrada is [number, { ate: string; hor: string; con?: string }] => !!(entrada[1].ate && entrada[1].hor))
    .sort(([a], [b]) => a - b)
    .map(([ordem, g]) => ({ ordem, ate: g.ate, hor: g.hor, con: g.con ?? null }));
}

function paraNumero(v: ValorDbf): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).trim());
  return Number.isNaN(n) ? 0 : n;
}

function paraTexto(v: ValorDbf): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

export function detectarTabelasPreco(
  nomesCampos: string[],
  registros: RegistroDbf[],
): { tabelas: TabelaPrecoDetectada[]; colunasFaixa: ReturnType<typeof detectarColunasFaixa> } {
  const colunasFaixa = detectarColunasFaixa(nomesCampos);
  const campoTipo = acharCampo(nomesCampos, PALPITES_TIPO);
  const campoDescricao = acharCampo(nomesCampos, PALPITES_DESCRICAO);
  const campoValorAntes = acharCampo(nomesCampos, PALPITES_VALOR_ANTES);
  const campoQtePontos = acharCampo(nomesCampos, PALPITES_QTE_PONTOS);

  const tabelas: TabelaPrecoDetectada[] = registros
    .map((r): TabelaPrecoDetectada => {
      const faixas: FaixaDetectada[] = [];
      for (const col of colunasFaixa) {
        const ate = paraNumero(r[col.ate]);
        if (!ate) continue; // faixa não usada por essa tabela (ATE zerado/vazio) — pula, sem "buraco" no meio
        faixas.push({
          ordem: faixas.length + 1,
          ate,
          valorHora: paraNumero(r[col.hor]),
          valorConvenio: col.con ? paraNumero(r[col.con]) : 0,
        });
      }
      return {
        tipo: campoTipo ? paraTexto(r[campoTipo]) : '',
        descricao: campoDescricao ? paraTexto(r[campoDescricao]) : '',
        valorAntes: campoValorAntes ? paraNumero(r[campoValorAntes]) : 0,
        qtePontos: campoQtePontos ? paraNumero(r[campoQtePontos]) : 0,
        faixas,
      };
    })
    .filter((t) => t.tipo); // sem código (TIPO vazio), não tem como identificar/importar a tabela

  return { tabelas, colunasFaixa };
}
