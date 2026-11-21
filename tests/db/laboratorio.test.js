// Importação das exportações do laboratório pelo site, com arquivos FICTÍCIOS
// (tests/fixtures). O lote é desfeito e o registro apagado no final.

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
let maxLoteAntes = 0;

const contar = async () => (await pool.query(`SELECT (SELECT count(*) FROM resultado)::int AS r, (SELECT count(*) FROM amostra)::int AS a,
  (SELECT count(*) FROM alerta)::int AS al`)).rows[0];
const post = (caminho, corpo) =>
  fetch(`${base}/${caminho}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-IST-Dashboard': '1' }, body: JSON.stringify(corpo) });
const arquivos = async () => Promise.all(['gerencia_FICTICIO.csv', 'expedicao_FICTICIO.csv'].map(async (nome) => ({
  nome, conteudo: await readFile(new URL(`../fixtures/${nome}`, import.meta.url), 'utf8'),
})));

before(async () => {
  if (!temBanco) return;
  pool = criarPool();
  servidor = criarApp(pool).listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}/api`;
  antes = await contar();
  maxLoteAntes = (await pool.query('SELECT COALESCE(MAX(id_lote), 0)::int AS n FROM etl.lote_resultados')).rows[0].n;
});

after(async () => {
  if (lote) await post(`lotes/${lote}/desfazer`, {}).catch(() => {});
  await pool?.query('DELETE FROM etl.lote_resultados WHERE id_lote > $1 AND desfeito_em IS NOT NULL', [maxLoteAntes]).catch(() => {});
  servidor?.close();
  await pool?.end();
});

test('importa Gerência + Expedição e classifica por portaria', { skip: !temBanco }, async () => {
  const r = await post('resultados/arquivos', { arquivos: await arquivos() });
  const corpo = await r.json();
  assert.equal(r.status, 200, JSON.stringify(corpo.erros));
  lote = corpo.lote;
  const rel = corpo.relatorio;
  assert.equal(rel.importados, 19); // 11 de água + pH (TESTE-02) + 5 do efluente (TESTE-04) + 2 da TESTE-05
  assert.equal(rel.amostrasEfluente, 1); // só TESTE-04: TESTE-05 tem DBO, mas também ensaio de água
  assert.equal(rel.naoAgua.length, 1); // peixe congelado
  assert.equal(rel.invalidos.length, 1); // "abc"
  assert.ok(rel.semLimite >= 2); // DQO e coordenadas

  const cat = (amostra, codigo) => corpo.resultados.find((x) => x.codigo_amostra === amostra && x.codigo_ensaio === codigo);
  assert.equal(cat('TESTE-01.FIC', '231').categoria, 'Acima do limite máximo'); // Fe 0,45 > 0,3
  assert.equal(cat('TESTE-01.FIC', '777').categoria, 'Abaixo do limite mínimo'); // cloro <0,10 < 0,2: certo
  assert.equal(cat('TESTE-01.FIC', '382').categoria, 'Inconclusivo'); // <0,300 com máximo 0,2
  assert.equal(cat('TESTE-01.FIC', '6178').categoria, 'Acima do limite máximo'); // 164,4 µg/L = 0,1644 mg/L > 0,1
  assert.equal(cat('TESTE-02.FIC', '6178').categoria, 'Dentro dos limites'); // <8 µg/L
  assert.equal(Number(cat('TESTE-01.FIC', '60').valor), 4884); // milhar em células/mL
  assert.equal(cat('TESTE-01.FIC', '776').categoria, 'Dentro dos limites'); // Ausente
  assert.equal(cat('TESTE-02.FIC', '776').categoria, 'Acima do limite máximo'); // Presente
  assert.equal(cat('TESTE-01.FIC', '777').valor_original, '<0,10');

  const fe = cat('TESTE-01.FIC', '231').portarias;
  assert.equal(fe['Portaria GM/MS Nº888 5/21'].categoria, 'Acima do limite máximo');
  assert.equal(fe['Portaria SES nº1468/2022'].categoria, 'Sem limite aplicável identificado');
  assert.ok(!corpo.resultados.some((x) => x.codigo_amostra === 'TESTE-03.FIC'));

  // Efluente (TESTE-04): só CONAMA 430 e CONSEMA 299 se aplicam
  const lei = (amostra, codigo, legislacao) => cat(amostra, codigo).portarias[legislacao].categoria;
  const C430 = 'Resolução CONAMA nº 430/2011';
  const C299 = 'Resolução CONSEMA nº 299/2025';
  assert.equal(lei('TESTE-04.FIC', '794', C430), 'Acima do limite máximo'); // pH 9,5 > 9
  assert.equal(lei('TESTE-04.FIC', '794', C299), 'Acima do limite máximo');
  assert.equal(lei('TESTE-04.FIC', '112', C430), 'Acima do limite máximo'); // OGV 60 > 50
  assert.equal(lei('TESTE-04.FIC', '106', C299), 'Acima do limite máximo'); // NA 25 > 20
  assert.equal(lei('TESTE-04.FIC', '119', C430), 'Dentro dos limites'); // S. Sed. <0,3 ≤ 1
  // DBO condicional (60 mg/L OU 80% de remoção): 30 ≤ 60 já cumpre; DBO 90 > 60 fica pendente
  assert.equal(lei('TESTE-04.FIC', '92', C299), 'Dentro dos limites');
  assert.equal(lei('TESTE-04.FIC', '92', C430), 'Dentro dos limites'); // 30 ≤ 120
  // limite de efluente não vale para água; amostra com DBO + ensaio de água é água
  assert.equal(cat('TESTE-02.FIC', '794').categoria, 'Sem limite aplicável identificado');
  assert.equal(cat('TESTE-05.FIC', '92').categoria, 'Sem limite aplicável identificado');
  assert.equal(cat('TESTE-05.FIC', '231').categoria, 'Acima do limite máximo'); // Fe 0,9 > 0,3 (GM/MS 888)
});

test('reenviar os mesmos arquivos não duplica', { skip: !temBanco }, async () => {
  const r = await post('resultados/arquivos', { arquivos: await arquivos() });
  const corpo = await r.json();
  assert.equal(corpo.lote, null);
  assert.equal(corpo.relatorio.jaImportados, 19);
  assert.match(corpo.aviso, /já tinham sido importados/);
});

test('resultados da API trazem a classificação de cada portaria', { skip: !temBanco }, async () => {
  const lista = await (await fetch(`${base}/resultados?busca=TESTE-01.FIC`)).json();
  assert.equal(lista.length, 6);
  const legislacoes = (await pool.query('SELECT count(*)::int AS n FROM legislacao')).rows[0].n;
  assert.ok(lista.every((x) => x.portarias && Object.keys(x.portarias).length === legislacoes));
  const so888 = await (await fetch(`${base}/resultados?busca=TESTE-0&legislacao=${encodeURIComponent('Portaria GM/MS Nº888 5/21')}`)).json();
  assert.equal(so888.length, 12); // 11 + Fe da TESTE-05
  const so1468 = await (await fetch(`${base}/resultados?busca=TESTE-0&legislacao=${encodeURIComponent('Portaria SES nº1468/2022')}`)).json();
  assert.equal(so1468.length, 0);
});

test('evolução por semana e por mês conta as classificações pela data de coleta', { skip: !temBanco }, async () => {
  // as amostras fictícias foram coletadas em 01/07 e 02/07/2026 (mesma semana, que começa na segunda 29/06)
  const filtro = 'inicio=2026-07-01&fim=2026-07-02';
  const semana = await (await fetch(`${base}/evolucao?agrupamento=semana&${filtro}`)).json();
  assert.equal(semana.periodos.length, 1);
  const p = semana.periodos[0];
  assert.equal(p.inicio, '2026-06-29');
  assert.equal(p.fim, '2026-07-05');
  assert.deepEqual([p.comparados, p.dentro, p.acima, p.abaixo, p.inconclusivos], [11, 6, 3, 1, 1]);
  assert.equal(p.percentualFora, 36.4);

  const mes = await (await fetch(`${base}/evolucao?agrupamento=mes&${filtro}`)).json();
  assert.equal(mes.periodos[0].inicio, '2026-07-01');
  assert.equal(mes.periodos[0].fim, '2026-07-31');

  const ses = await (await fetch(`${base}/evolucao?${filtro}&legislacao=${encodeURIComponent('Portaria SES nº1468/2022')}`)).json();
  assert.equal(ses.total.comparados, 0);
  assert.equal(ses.total.semLimite, 12); // 11 + o pH de efluente lançado numa amostra de água

  // o clique leva à aba Resultados com o mesmo período: as contagens batem
  const lista = await (await fetch(`${base}/resultados?inicio=${p.inicio}&fim=${p.fim}&busca=TESTE-0`)).json();
  assert.equal(lista.length, 12); // 11 comparados + 1 sem limite
});

test('desfazer remove tudo o que o lote lançou', { skip: !temBanco }, async () => {
  const r = await post(`lotes/${lote}/desfazer`, {});
  assert.equal(r.status, 200);
  lote = null;
  assert.deepEqual(await contar(), antes);
});
