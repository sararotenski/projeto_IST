import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { converterValorLab, dataLab, detectarTipo, lerArquivo, lerExportacoes } from '../server/laboratorio.js';

const fixture = (nome) => readFile(new URL(`./fixtures/${nome}`, import.meta.url), 'utf8');

test('valores do laboratório: qualificador, decimais e presença/ausência', () => {
  assert.deepEqual(converterValorLab('<0,10'), { valor: '0.10', qualificador: '<' });
  assert.deepEqual(converterValorLab('> 2,5'), { valor: '2.5', qualificador: '>' });
  assert.deepEqual(converterValorLab('6.93'), { valor: '6.93', qualificador: null });
  assert.deepEqual(converterValorLab('1.380,00'), { valor: '1380.00', qualificador: null });
  assert.deepEqual(converterValorLab('27.000.000'), { valor: '27000000', qualificador: null });
  assert.deepEqual(converterValorLab('Ausente'), { valor: '0', qualificador: null });
  assert.deepEqual(converterValorLab('Presente'), { valor: '1', qualificador: null });
  assert.ok(converterValorLab('Sim').erro);
  assert.ok(converterValorLab('').vazio);
  assert.ok(converterValorLab('________').vazio); // campo em branco do laboratório
});

test('"4.884" é milhar só em unidades de contagem; nas demais, ponto decimal', () => {
  assert.equal(converterValorLab('4.884', 'células/mL').valor, '4884');
  assert.equal(converterValorLab('1.098', 'mg/L').valor, '1.098');
  assert.equal(converterValorLab('0.004', 'células/mL').valor, '0.004');
});

test('datas do laboratório', () => {
  assert.equal(dataLab('14/07/2026 15:00:00'), '2026-07-14');
  assert.equal(dataLab('1/2/2026'), '2026-02-01');
  assert.equal(dataLab('31/02/2026'), null);
});

test('detecta os formatos de arquivo', async () => {
  assert.equal(detectarTipo(lerArquivo(await fixture('gerencia_FICTICIO.csv')).colunas), 'gerencia');
  assert.equal(detectarTipo(lerArquivo(await fixture('expedicao_FICTICIO.csv')).colunas), 'expedicao');
  assert.equal(detectarTipo(['codigo_amostra', 'codigo_ensaio', 'valor']), 'modelo');
  assert.equal(detectarTipo(['a', 'b']), null);
});

test('junta Gerência e Expedição pelo código externo', async () => {
  const r = lerExportacoes([
    { nome: 'e.csv', conteudo: await fixture('expedicao_FICTICIO.csv') },
    { nome: 'g.csv', conteudo: await fixture('gerencia_FICTICIO.csv') },
  ]);
  assert.equal(r.erros.length, 0);
  assert.equal(r.amostras.size, 5);
  const a1 = r.amostras.get('TESTE-01.FIC');
  assert.equal(a1.data_coleta, '2026-07-01'); // da Gerência
  assert.equal(a1.ponto, 'Poço Teste (tratada)'); // da Expedição
  const thm = r.resultados.find((x) => x.externo === 'TESTE-01.FIC' && x.codigo === '6178');
  assert.equal(thm.unidade, 'µg/L'); // a Expedição prevalece
  assert.equal(r.unidadesPorCodigo.get('6178'), 'µg/L');
});

test('arquivo de formato desconhecido gera erro', () => {
  const r = lerExportacoes([{ nome: 'x.csv', conteudo: 'a,b\n1,2\n' }]);
  assert.match(r.erros[0].mensagem, /formato não reconhecido/);
});
