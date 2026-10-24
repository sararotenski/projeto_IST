import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerCsvComCabecalho } from '../scripts/lib/csv.js';
import { converterDecimalBR, normalizarUnidade, normalizarClasse, normalizarTexto } from '../scripts/lib/normalizar.js';

test('decimal brasileiro vira string numérica sem perder precisão', () => {
  assert.equal(converterDecimalBR('0,001000'), '0.001000');
  assert.equal(converterDecimalBR('1.234,5'), '1234.5');
  assert.equal(converterDecimalBR('250'), '250');
});

test('vazio é ausente (null), zero é zero', () => {
  assert.equal(converterDecimalBR(''), null);
  assert.equal(converterDecimalBR('   '), null);
  assert.equal(converterDecimalBR('0,000000'), '0.000000');
});

test('valor não numérico gera erro em vez de ser ignorado', () => {
  assert.throws(() => converterDecimalBR('abc'));
  assert.throws(() => converterDecimalBR('1,2,3'));
});

test('unidade: ug/L e mu grego viram µg/L; ppb é preservado; vazio é null', () => {
  assert.equal(normalizarUnidade('ug/L'), 'µg/L');
  assert.equal(normalizarUnidade('\u03bcg/L'), 'µg/L');
  assert.equal(normalizarUnidade('µg/L'), 'µg/L');
  assert.equal(normalizarUnidade('ppb'), 'ppb');
  assert.equal(normalizarUnidade(''), null);
  assert.equal(normalizarUnidade('Aus/Pres em 100mL'), 'Aus/Pres em 100mL');
});

test('"Sem classe" em qualquer grafia significa sem classe; outras classes são mantidas', () => {
  assert.equal(normalizarClasse('Sem classe'), null);
  assert.equal(normalizarClasse('Sem Classe'), null);
  assert.equal(normalizarClasse('ESPECIFICAÇÃO'), 'ESPECIFICAÇÃO');
  assert.equal(normalizarClasse('Àgua tratada'), 'Água tratada'); // correção de grafia registrada
});

test('texto: espaços colapsados, acentos preservados', () => {
  assert.equal(normalizarTexto('  Água   Subterrânea '), 'Água Subterrânea');
  assert.equal(normalizarTexto(''), null);
});

test('CSV: BOM, CRLF, aspas e número da linha de origem', () => {
  const texto = '\ufeffA;B\r\n1;"x;y"\r\n2;"diz ""oi"""\r\n';
  const { colunas, registros } = lerCsvComCabecalho(texto);
  assert.deepEqual(colunas, ['A', 'B']);
  assert.equal(registros.length, 2);
  assert.equal(registros[0].B, 'x;y');
  assert.equal(registros[1].B, 'diz "oi"');
  assert.equal(registros[0]._linha, 2);
  assert.equal(registros[1]._linha, 3);
});

test('CSV: linha com número de colunas errado é sinalizada', () => {
  const { registros } = lerCsvComCabecalho('A;B\n1;2;3\n');
  assert.equal(registros[0]._colunasDivergentes, 3);
});
