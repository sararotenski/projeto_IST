// Fluxo completo pelo site: lançar o CSV de DEMONSTRAÇÃO (dados fictícios),
// conferir a comparação automática, tendências e alertas, e desfazer o lote.
// Ao final o banco volta ao estado anterior (o lote fica registrado como desfeito).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { criarPool } from '../../scripts/lib/db.js';
import { criarApp } from '../../server/index.js';

const temBanco = Boolean(process.env.PGDATABASE);
let pool;
let servidor;
let base;
let lote;
let antes;

const contar = async () => (await pool.query(`SELECT (SELECT count(*) FROM resultado)::int AS r, (SELECT count(*) FROM amostra)::int AS a,
  (SELECT count(*) FROM alerta)::int AS al, (SELECT count(*) FROM cliente)::int AS c, (SELECT count(*) FROM proposta_comercial)::int AS p`)).rows[0];
const post = (caminho, corpo, cab = { 'X-IST-Dashboard': '1' }) =>
  fetch(`${base}/${caminho}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cab }, body: JSON.stringify(corpo) });
const get = async (caminho) => (await fetch(`${base}/${caminho}`)).json();

before(async () => {
  if (!temBanco) return;
  pool = criarPool();
  servidor = criarApp(pool).listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}/api`;
  antes = await contar();
});

after(async () => {
  if (lote) await post(`lotes/${lote}/desfazer`, {}).catch(() => {});
  servidor?.close();
  await pool?.end();
});

test('escrita sem o cabeçalho do dashboard é recusada', { skip: !temBanco }, async () => {
  const r = await post('resultados', { itens: [] }, {});
  assert.equal(r.status, 403);
});

test('linha inválida: nada é gravado e o erro aponta a linha', { skip: !temBanco }, async () => {
  const r = await post('resultados', { itens: [{ codigo_amostra: 'X', ponto_coleta: 'P', cliente: 'C', legislacao: '888', origem_amostra: 'Agua Tratada', data_coleta: '10/01/2026', codigo_ensaio: '99999999', valor: '1' }] });
  assert.equal(r.status, 422);
  const corpo = await r.json();
  assert.match(corpo.erros[0].mensagem, /não cadastrado/);
  assert.deepEqual(await contar(), antes);
});

test('CSV de demonstração: comparação automática, tendências, desvios e alertas', { skip: !temBanco }, async () => {
  const conteudo = await readFile(new URL('../../data/exemplos/resultados_DEMONSTRACAO_ficticios.csv', import.meta.url), 'utf8');
  const r = await post('resultados/csv', { arquivo: 'teste-demonstracao.csv', conteudo });
  const corpo = await r.json();
  assert.equal(r.status, 200, JSON.stringify(corpo.erros));
  lote = corpo.lote;
  assert.equal(corpo.resultados.length, 53);
  const cat = (ponto, codigo, amostra) => corpo.resultados.find((x) => x.ponto_coleta === ponto && x.codigo_ensaio === codigo && x.codigo_amostra === amostra).categoria;
  assert.equal(cat('ETA-DEMO-SAIDA', '10687', 'DEMO-ETA-2026-08'), 'Acima do limite máximo'); // Ferro 0,34 > 0,3
  assert.equal(cat('ETA-DEMO-SAIDA', '10687', 'DEMO-ETA-2026-01'), 'Dentro dos limites');
  assert.equal(cat('REDE-DEMO-01', '777', 'DEMO-REDE-2026-08'), 'Abaixo do limite mínimo'); // cloro 0,1 < 0,2
  assert.equal(cat('ETA-DEMO-SAIDA', '1190', 'DEMO-ETA-2026-01'), 'Dentro dos limites'); // pH adimensional
  assert.ok(corpo.resultados.every((x) => x.categoria !== 'Pendente de validação'), 'nenhum resultado deveria ficar pendente');

  const series = await get('tendencias');
  const s = (ponto, nome) => series.find((x) => x.pontoColeta === ponto && x.ensaio === nome);
  assert.equal(s('ETA-DEMO-SAIDA', 'Ferro').tendencia.situacao, 'Aumentando');
  assert.equal(s('ETA-DEMO-SAIDA', 'Cloro Residual Livre').tendencia.situacao, 'Diminuindo');
  assert.equal(s('REDE-DEMO-01', 'Nitrato (NO3-N)').tendencia.situacao, 'Sem tendência significativa');
  assert.equal(s('ETA-DEMO-SAIDA', 'Turbidez').atipicos, 1);
  assert.equal(s('ETA-DEMO-SAIDA', 'Glifosato+AMPA').tendencia.situacao, 'Sem tendência significativa');

  const tipos = (await pool.query(`SELECT tipo, count(*)::int AS n FROM alerta a JOIN resultado r ON r.id_resultado = a.fk_id_resultado
    JOIN amostra m ON m.id_amostra = r.fk_id_amostra WHERE m.id_lote = $1 GROUP BY tipo`, [lote])).rows;
  const n = Object.fromEntries(tipos.map((t) => [t.tipo, t.n]));
  assert.equal(n.ACIMA_MAXIMO, 1);
  assert.equal(n.ABAIXO_MINIMO, 2);
  assert.equal(n.RECORRENCIA, 1);
  assert.ok(n.TENDENCIA_AUMENTO >= 1 && n.TENDENCIA_REDUCAO >= 1 && n.VALOR_ATIPICO === 1);

  const painel = await get('painel');
  assert.equal(painel.kpis.fora, 3);
  assert.ok(painel.atencao.some((a) => a.tipo === 'aumento'));
});

test('relançar o mesmo CSV é recusado (sem duplicar)', { skip: !temBanco }, async () => {
  const conteudo = await readFile(new URL('../../data/exemplos/resultados_DEMONSTRACAO_ficticios.csv', import.meta.url), 'utf8');
  const r = await post('resultados/csv', { arquivo: 'repetido.csv', conteudo });
  assert.equal(r.status, 422);
  assert.match((await r.json()).erros[0].mensagem, /já existe resultado/);
});

test('desfazer o lote devolve o banco ao estado anterior', { skip: !temBanco }, async () => {
  const r = await post(`lotes/${lote}/desfazer`, {});
  assert.equal(r.status, 200);
  lote = null;
  assert.deepEqual(await contar(), antes);
});
