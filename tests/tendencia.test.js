import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analisarSerie, mannKendall, normalAcumulada, inclinacaoSen, valoresAtipicos, estatisticas } from '../server/analise/tendencia.js';
import { converterData, lerCsvResultados, validarLinhas } from '../server/registro.js';

const serie = (valores) => valores.map((valor, i) => ({ data: `2026-${String(i + 1).padStart(2, '0')}-15`, valor, id_resultado: i + 1 }));

test('normal acumulada: valores de referência', () => {
  assert.ok(Math.abs(normalAcumulada(0) - 0.5) < 1e-7);
  assert.ok(Math.abs(normalAcumulada(1.96) - 0.975) < 1e-3);
  assert.ok(Math.abs(normalAcumulada(-1.96) - 0.025) < 1e-3);
});

test('Mann-Kendall: série crescente estrita com n = 8', () => {
  const r = mannKendall([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(r.s, 28);
  assert.equal(r.variancia, (8 * 7 * 21) / 18);
  assert.ok(r.p < 0.001);
});

test('Mann-Kendall: correção de empates e série constante', () => {
  const r = mannKendall([1, 1, 2, 2, 3]);
  // var = [5·4·15 − 2·(2·1·9)]/18 = (300 − 36)/18
  assert.equal(r.variancia, (300 - 36) / 18);
  const c = mannKendall([5, 5, 5, 5, 5]);
  assert.equal(c.variancia, 0);
  assert.equal(c.p, 1);
});

test('aumento significativo é identificado com inclinação positiva', () => {
  const a = analisarSerie(serie([0.08, 0.1, 0.12, 0.15, 0.19, 0.24, 0.29, 0.34]));
  assert.equal(a.tendencia.situacao, 'Aumentando');
  assert.ok(a.tendencia.inclinacaoPorAno > 0);
  assert.equal(a.linhaTendencia.length, 8);
});

test('redução significativa é identificada', () => {
  const a = analisarSerie(serie([1.8, 1.6, 1.5, 1.3, 1.1, 0.9, 0.6, 0.4]));
  assert.equal(a.tendencia.situacao, 'Diminuindo');
  assert.ok(a.tendencia.inclinacaoPorAno < 0);
});

test('oscilação sem direção não é tendência', () => {
  const a = analisarSerie(serie([2.1, 2.3, 2.2, 2.4, 2.2, 2.3, 2.1, 2.2]));
  assert.equal(a.tendencia.situacao, 'Sem tendência significativa');
  assert.equal(a.atipicos.length, 0);
});

test('menos de 5 pontos: dados insuficientes', () => {
  const a = analisarSerie(serie([1, 2, 3, 4]));
  assert.equal(a.tendencia.situacao, 'Dados insuficientes');
  assert.equal(a.tendencia.significativa, false);
});

test('valor atípico (desvio) é detectado sem marcar os demais', () => {
  const pts = serie([0.6, 0.5, 0.7, 0.6, 3.9, 0.5, 0.6, 0.7]);
  const at = valoresAtipicos(pts);
  assert.equal(at.length, 1);
  assert.equal(at[0].valor, 3.9);
  assert.ok(at[0].z > 2);
});

test('inclinação de Sen e estatísticas descritivas', () => {
  const { inclinacao } = inclinacaoSen([0, 1, 2, 3], [1, 3, 5, 7]);
  assert.equal(inclinacao, 2);
  const e = estatisticas([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.equal(e.media, 5);
  assert.ok(Math.abs(e.desvioPadrao - 2.138) < 1e-3);
});

test('datas: aceita DD/MM/AAAA e AAAA-MM-DD; rejeita inválidas', () => {
  assert.equal(converterData('05/03/2026'), '2026-03-05');
  assert.equal(converterData('2026-03-05'), '2026-03-05');
  assert.equal(converterData('31/02/2026'), undefined);
  assert.equal(converterData(''), null);
});

test('CSV de resultados: separador, cabeçalho e validação por linha', () => {
  const csv = 'codigo_amostra;ponto_coleta;cliente;legislacao;origem_amostra;matriz;data_coleta;codigo_ensaio;valor;unidade;data_resultado\n'
    + 'A1;P1;Cliente;888;Agua Tratada;;10/01/2026;10687;0,12;mg/L;\n'
    + 'A1;P1;Cliente;888;Agua Tratada;;10/01/2026;10687;abc;mg/L;\n';
  const { erros, linhas } = lerCsvResultados(csv);
  assert.equal(erros.length, 0);
  const cat = {
    legislacoes: [{ id_legislacao: 1, nome: 'Portaria GM/MS Nº888 5/21' }, { id_legislacao: 2, nome: 'Portaria SES nº1468/2022' }],
    origens: ['Agua Tratada'],
    ensaios: new Map([['10687', { id_ensaio: 9, nome: 'Ferro' }]]),
  };
  const v = validarLinhas(linhas, cat);
  assert.equal(v.linhas[0].valor, '0.12');
  assert.equal(v.linhas[0].id_legislacao, 1);
  assert.equal(v.linhas[0].matriz, 'Água - BNU');
  assert.equal(v.linhas[0].data_resultado, '2026-01-10');
  assert.ok(v.erros.some((e) => e.linha === 3 && /não é numérico/.test(e.mensagem)));
  assert.ok(v.erros.some((e) => e.linha === 3 && /repetido/.test(e.mensagem)));
});

test('CSV sem colunas obrigatórias é rejeitado', () => {
  const { erros } = lerCsvResultados('a;b\n1;2\n');
  assert.match(erros[0].mensagem, /Colunas obrigatórias ausentes/);
});
