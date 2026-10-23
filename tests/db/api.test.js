// Testes da API contra o banco real (somente leitura).
// Rodar com: npm run test:db  (exige .env válido e migração aplicada)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../../server/index.js';
import { criarPool } from '../../scripts/lib/db.js';

const temBanco = Boolean(process.env.PGDATABASE);
let pool;
let servidor;
let base;

before(async () => {
  if (!temBanco) return;
  pool = criarPool();
  servidor = criarApp(pool).listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}/api`;
});

after(async () => {
  servidor?.close();
  await pool?.end();
});

const get = async (caminho) => {
  const r = await fetch(`${base}/${caminho}`);
  return { status: r.status, corpo: await r.json() };
};

test('saude indica banco com migração e views', { skip: !temBanco }, async () => {
  const { status, corpo } = await get('saude');
  assert.equal(status, 200);
  assert.equal(corpo.views_ok, true);
  assert.equal(corpo.migracao_ok, true);
});

test('resumo bate com as contagens das tabelas', { skip: !temBanco }, async () => {
  const { corpo } = await get('resumo');
  const real = (await pool.query('SELECT (SELECT count(*) FROM limite)::int AS l, (SELECT count(*) FROM ensaio)::int AS e')).rows[0];
  assert.equal(corpo.contagens.limites, real.l);
  assert.equal(corpo.contagens.ensaios, real.e);
  const soma = corpo.limitesPorOrigem.reduce((s, x) => s + x.limites, 0);
  assert.equal(soma, real.l);
});

test('filtros de limites funcionam e são parametrizados', { skip: !temBanco }, async () => {
  const todos = (await get('limites')).corpo;
  const leg = todos[0].legislacao;
  const filtrados = (await get(`limites?legislacao=${encodeURIComponent(leg)}`)).corpo;
  assert.ok(filtrados.length > 0 && filtrados.length < todos.length);
  assert.ok(filtrados.every((l) => l.legislacao === leg));
  const injecao = (await get(`limites?busca=${encodeURIComponent("'; DROP TABLE limite; --")}`));
  assert.equal(injecao.status, 200);
  assert.equal(injecao.corpo.length, 0);
  const validacao = (await get('limites?validacao=sim')).corpo;
  assert.ok(validacao.every((l) => l.requer_validacao));
});

test('rotas de análise respondem mesmo sem resultados', { skip: !temBanco }, async () => {
  for (const rota of ['conformidade', 'historico', 'alertas', 'pendencias', 'filtros']) {
    const { status } = await get(rota);
    assert.equal(status, 200, rota);
  }
});

test('rota inexistente devolve 404 em JSON', { skip: !temBanco }, async () => {
  const { status, corpo } = await get('nao-existe');
  assert.equal(status, 404);
  assert.ok(corpo.erro);
});
