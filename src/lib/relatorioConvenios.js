// Agregação do relatório de convênios (a tela é src/telas/RelatorioConvenios.jsx).
// Separado aqui porque a conta de subtotais/totais é a parte que precisa estar
// certa — e a única testável sem banco.

/** Evita a sobra de ponto flutuante ao somar valores em reais. */
function centavos(x) {
  return Math.round(x * 100) / 100;
}

/**
 * Organiza as estadias em GRUPO -> CÓDIGO DE CONVÊNIO -> estadias, com
 * subtotal por código e total por grupo.
 *
 * O grupo existe porque um mesmo conveniado costuma ter vários códigos (C1,
 * C2, C3 todos no grupo "C"): o relatório lista e totaliza cada código, e
 * fecha com o total do grupo — que é o que se cobra do conveniado.
 *
 * Convênios sem grupo cadastrado caem todos num bloco de grupo vazio (''),
 * que a tela mostra sem cabeçalho nem total de grupo: cada um já tem o seu
 * subtotal e um "total do grupo" ali seria só a repetição dele.
 *
 * `convenios`: mapa `codigo -> { razao, grupo }`.
 */
export function agruparPorConvenio(movimentos, convenios = {}) {
  const porGrupo = new Map();

  for (const m of movimentos) {
    const conv = convenios[m.convenio_codigo] || {};
    const grupo = String(conv.grupo || '').trim();
    if (!porGrupo.has(grupo)) porGrupo.set(grupo, new Map());
    const porCodigo = porGrupo.get(grupo);
    if (!porCodigo.has(m.convenio_codigo)) {
      porCodigo.set(m.convenio_codigo, {
        codigo: m.convenio_codigo, razao: conv.razao || '', linhas: [], total: 0,
      });
    }
    const bloco = porCodigo.get(m.convenio_codigo);
    bloco.linhas.push(m);
    bloco.total += Number(m.valor_convenio || 0);
  }

  const grupos = [...porGrupo.entries()]
    .map(([grupo, porCodigo]) => {
      const convs = [...porCodigo.values()]
        .map((c) => ({ ...c, total: centavos(c.total), qtde: c.linhas.length }))
        .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
      return {
        grupo,
        convenios: convs,
        total: centavos(convs.reduce((s, c) => s + c.total, 0)),
        qtde: convs.reduce((s, c) => s + c.qtde, 0),
      };
    })
    // Grupos em ordem alfabética; os convênios sem grupo sempre no fim.
    .sort((a, b) => {
      if (a.grupo === '') return 1;
      if (b.grupo === '') return -1;
      return a.grupo.localeCompare(b.grupo);
    });

  return {
    grupos,
    total: centavos(grupos.reduce((s, g) => s + g.total, 0)),
    qtde: grupos.reduce((s, g) => s + g.qtde, 0),
  };
}

/** Grupos distintos cadastrados, pro seletor da tela. */
export function gruposDeConvenios(convenios = []) {
  const nomes = new Set();
  for (const c of convenios) {
    const g = String(c.grupo || '').trim();
    if (g) nomes.add(g);
  }
  return [...nomes].sort((a, b) => a.localeCompare(b));
}
