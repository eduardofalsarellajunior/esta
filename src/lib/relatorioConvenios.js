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

const dataBR = (iso) => (iso ? String(iso).split('-').reverse().join('/') : '—');

/**
 * Versão em texto puro do relatório, pra WhatsApp/e-mail.
 *
 * `detalhar`: com as estadias uma a uma, ou só os totais. Diferente do BI (que
 * tem tamanho limitado por natureza), aqui a listagem é ilimitada — um convênio
 * movimentado vira centenas de linhas, que no WhatsApp ficam ilegíveis e ainda
 * arriscam estourar o limite da URL do link. Por isso o padrão da tela é o
 * resumo, e o detalhe é uma escolha consciente (útil no e-mail).
 *
 * `fmtBRL` entra por parâmetro só pra esta lib não depender de tempo.js e
 * seguir testável sem o resto do app.
 */
export function textoRelatorioConvenios({
  dados, de, ate, filial, convenioFiltro, grupoFiltro, detalhar = false, fmtBRL,
}) {
  const l = [];
  if (filial?.nome_fantasia) l.push(filial.nome_fantasia);
  if (filial?.endereco) l.push(filial.endereco);
  if (filial?.cnpj) l.push(`CNPJ: ${filial.cnpj}`);
  if (l.length) l.push('');

  l.push('Relatório de convênios');
  l.push(`Saídas de ${dataBR(de)} a ${dataBR(ate)}`);
  if (convenioFiltro) l.push(`Convênio: ${convenioFiltro}`);
  if (grupoFiltro) l.push(`Grupo: ${grupoFiltro}`);
  l.push('');

  if (!dados.grupos.length) {
    l.push('Nenhuma estadia de convênio no período.');
    return l.join('\n');
  }

  for (const g of dados.grupos) {
    if (g.grupo) l.push(`GRUPO ${g.grupo}`);
    for (const conv of g.convenios) {
      l.push(`  ${conv.codigo}${conv.razao ? ` · ${conv.razao}` : ''} — ${conv.qtde} estadia(s): ${fmtBRL(conv.total)}`);
      if (detalhar) {
        for (const m of conv.linhas) {
          const controle = m.controle != null ? String(m.controle).padStart(4, '0') : '—';
          l.push(`    ${controle} ${m.placa || '—'} ${m.modelo || ''}`.trimEnd());
          l.push(`      ${dataBR(m.dt_entrada)} → ${dataBR(m.dt_saida)}: ${fmtBRL(Number(m.valor_convenio || 0))}`);
        }
      }
    }
    if (g.grupo) l.push(`  TOTAL DO GRUPO ${g.grupo} — ${g.qtde} estadia(s): ${fmtBRL(g.total)}`);
    l.push('');
  }

  l.push(`TOTAL GERAL — ${dados.qtde} estadia(s): ${fmtBRL(dados.total)}`);
  return l.join('\n');
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
