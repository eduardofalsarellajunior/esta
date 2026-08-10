import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderizarModelo, modeloParaTexto } from './modeloTicket.js';

const dados = {
  ER: 'NOVO GINPARK', EF: '01', CC: 'ABC1D23', CV: 'FIESTA',
  DE: '10/08/2026', HE: '10:43', V: '15,00',
  SERVICOS: 'LAVAGEM', VALORSERVICOS: '30,00', VALORSERVICOS_NUM: 30,
  TIPO_VEIC: 'P', MENSALISTA: '', BONUS: 0, US: 'Eduardo',
};

test('substitui token e mantém o texto ao redor', () => {
  assert.equal(modeloParaTexto('Placa  : @CC@', dados), 'Placa  : ABC1D23');
  assert.equal(modeloParaTexto('@DE@ as @HE@ h.', dados), '10/08/2026 as 10:43 h.');
});

test('token desconhecido ou vazio some (não vira lixo no comprovante)', () => {
  assert.equal(modeloParaTexto('X@NAOEXISTE@Y', dados), 'XY');
  assert.equal(modeloParaTexto('[@MENSALISTA@]', dados), '[]');
});

test('@ARROBA@ escapa um "@" literal', () => {
  assert.equal(modeloParaTexto('Email: edu@ARROBA@gmail.com', dados), 'Email: edu@gmail.com');
});

test('@SE(campo)@: linha só sai quando o campo tem conteúdo', () => {
  assert.equal(modeloParaTexto('@SE(SERVICOS)@Serv.: @SERVICOS@', dados), 'Serv.: LAVAGEM');
  assert.equal(modeloParaTexto('@SE(MENSALISTA)@Mensalista: @MENSALISTA@', dados), '');
});

test('@SE(campo)@: zero conta como vazio (como o <>0 do legado)', () => {
  assert.equal(modeloParaTexto('@SE(BONUS)@Bonus: @BONUS@', dados), '');
  assert.equal(modeloParaTexto('@SE(VALORSERVICOS_NUM)@Tem servico', dados), 'Tem servico');
});

test('@SE(campo=valor)@ e @SE(campo<>valor)@', () => {
  assert.equal(modeloParaTexto('@SE(TIPO_VEIC=P)@TABELA P', dados), 'TABELA P');
  assert.equal(modeloParaTexto('@SE(TIPO_VEIC=G)@TABELA G', dados), '');
  assert.equal(modeloParaTexto('@SE(TIPO_VEIC<>G)@Nao e G', dados), 'Nao e G');
  assert.equal(modeloParaTexto('@SE(TIPO_VEIC<>P)@Nao e P', dados), '');
});

test('@P3@ gera as quebras de linha', () => {
  assert.deepEqual(renderizarModelo('A@P3@B', dados).map((l) => l.map((t) => t.texto).join('')),
    ['A', '', '', 'B']);
});

test('formatação abre e fecha, marcando só o trecho', () => {
  const linha = renderizarModelo('Placa: @PG+@@CC@@PG-@ fim', dados)[0];
  assert.deepEqual(linha, [
    { texto: 'Placa: ', estilos: [] },
    { texto: 'ABC1D23', estilos: ['grande'] },
    { texto: ' fim', estilos: [] },
  ]);
});

test('formatação aninhada mantém os dois estilos', () => {
  const linha = renderizarModelo('@PG+@@PE+@X@PE-@Y@PG-@', dados)[0];
  assert.deepEqual(linha, [
    { texto: 'X', estilos: ['grande', 'negrito'] },
    { texto: 'Y', estilos: ['grande'] },
  ]);
});

test('modelo real do legado (TICKETE.TXT) ponta a ponta', () => {
  const modelo = [
    '@ER@(@EF@)',
    '--------------------------------',
    '@PG+@CONTROLE:@C#@@PG-@',
    'Placa  : @PG+@@CC@@PG-@',
    'Veiculo: @PG+@@CV@@PG-@',
    '@SE(TIPO_VEIC=P)@TABELA P',
    '@SE(TIPO_VEIC=G)@TABELA G',
    '@SE(MENSALISTA)@Mensalista:@MENSALISTA@',
    'Entrada: @DE@ as @HE@ h.',
    '@SE(BONUS)@Bonus : @BONUS@',
    'Voce foi atendido por @US@',
  ].join('\n');

  assert.equal(modeloParaTexto(modelo, { ...dados, 'C#': '1234' }), [
    'NOVO GINPARK(01)',
    '--------------------------------',
    'CONTROLE:1234',
    'Placa  : ABC1D23',
    'Veiculo: FIESTA',
    'TABELA P',
    'Entrada: 10/08/2026 as 10:43 h.',
    'Voce foi atendido por Eduardo',
  ].join('\n'));
});
