// Testes das regras de conformidade, histórico e alertas (views SQL).
// Usam DADOS SINTÉTICOS, criados dentro de uma transação que é desfeita
// (ROLLBACK) no final: nada fica gravado no banco e os dados reais não são tocados.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { conectar } from '../../scripts/lib/db.js';
import { importarDados } from '../../scripts/lib/importacao.js';
import { executar as extrair } from '../../scripts/extrair.js';

const temBanco = Boolean(process.env.PGDATABASE);
let db;
const ids = {};

const proximo = async (tabela, coluna) => Number((await db.query(`SELECT COALESCE(MAX(${coluna}),0) + 1000 AS id FROM ${tabela}`)).rows[0].id);

before(async () => {
  if (!temBanco) return;
  db = await conectar();
  await db.query('BEGIN');

  ids.leg = await proximo('legislacao', 'id_legislacao');
  ids.cli = await proximo('cliente', 'id_cliente');
  ids.prop = await proximo('proposta_comercial', 'id_proposta');
  ids.am = await proximo('amostra', 'id_amostra');
  const e0 = await proximo('ensaio', 'id_ensaio');
  ids.faixa = e0;
  ids.semLimite = e0 + 1;
  ids.unilateral = e0 + 2;
  const l0 = await proximo('limite', 'id_limite');

  await db.query(`INSERT INTO legislacao (id_legislacao, nome) VALUES ($1, 'SINTETICO-TESTE')`, [ids.leg]);
  await db.query(`INSERT INTO cliente (id_cliente, nome) VALUES ($1, 'Cliente sintético')`, [ids.cli]);
  await db.query(`INSERT INTO proposta_comercial (id_proposta, fk_id_cliente) VALUES ($1, $2)`, [ids.prop, ids.cli]);
  await db.query(`INSERT INTO e__assoc__1_possui VALUES ($1, $2)`, [ids.prop, ids.leg]);
  // origem com acento: deve casar com "Agua Tratada" do limite
  await db.query(`INSERT INTO amostra (id_amostra, data_coleta, origem, matriz, fk_id_cliente, fk_id_proposta)
                  VALUES ($1, '2024-01-01', 'Água Tratada', 'Água - BNU', $2, $3)`, [ids.am, ids.cli, ids.prop]);
  for (const [id, nome] of [[ids.faixa, 'SINT pH'], [ids.semLimite, 'SINT sem limite'], [ids.unilateral, 'SINT chumbo']]) {
    await db.query(`INSERT INTO ensaio (id_ensaio, nome, codigo_origem) VALUES ($1, $2, $3)`, [id, nome, `SINT${id}`]);
  }
  await db.query(`INSERT INTO limite (id_limite, valor_minimo, valor_maximo, unidade_medida, versao, data_inicio_vigencia,
                  fk_id_ensaio, fk_id_legislacao, matriz, origem_amostra)
                  VALUES ($1, 6, 9, 'mg/L', 1, '2020-01-01', $2, $3, 'Água - BNU', 'Agua Tratada'),
                         ($4, NULL, 1, 'µg/L', 1, '2020-01-01', $5, $3, 'Água - BNU', 'Agua Tratada')`,
  [l0, ids.faixa, ids.leg, l0 + 1, ids.unilateral]);

  let r = await proximo('resultado', 'id_resultado');
  const res = async (valor, data, unidade, ensaio) => {
    const id = r++;
    await db.query(`INSERT INTO resultado (id_resultado, valor, data_resultado, fk_id_amostra, fk_id_ensaio, unidade_medida)
                    VALUES ($1, $2, $3, $4, $5, $6)`, [id, valor, data, ids.am, ensaio, unidade]);
    return id;
  };
  ids.dentro = await res(7, '2024-01-10', 'mg/L', ids.faixa);
  ids.acima1 = await res(10, '2024-02-10', 'mg/L', ids.faixa);
  ids.acima2 = await res(11, '2024-03-10', 'mg/L', ids.faixa);
  ids.abaixo = await res(5, '2024-04-10', 'mg/L', ids.faixa);
  ids.unidadeDif = await res(7, '2024-05-10', 'ppb', ids.faixa);
  ids.semValor = await res(null, '2024-05-11', 'mg/L', ids.faixa);
  ids.antesVigencia = await res(7, '2019-06-01', 'mg/L', ids.faixa);
  ids.semLim = await res(3, '2024-01-10', 'mg/L', ids.semLimite);
  ids.uniDentro = await res(0.5, '2024-01-10', 'ug/L', ids.unilateral);
  ids.uniAcima = await res(2, '2024-02-10', 'µg/L', ids.unilateral);
});

after(async () => {
  if (!db) return;
  await db.query('ROLLBACK');
  await db.end();
});

const categoria = async (id) =>
  (await db.query('SELECT categoria, motivo_pendencia, classificacao_indicativa FROM vw_resultado_conformidade WHERE id_resultado = $1', [id])).rows[0];

test('dentro, acima e abaixo de limite com mínimo e máximo', { skip: !temBanco }, async () => {
  assert.equal((await categoria(ids.dentro)).categoria, 'Dentro dos limites');
  assert.equal((await categoria(ids.acima1)).categoria, 'Acima do limite máximo');
  assert.equal((await categoria(ids.abaixo)).categoria, 'Abaixo do limite mínimo');
});

test('limite unilateral (só máximo) e unidade ug/L = µg/L', { skip: !temBanco }, async () => {
  assert.equal((await categoria(ids.uniDentro)).categoria, 'Dentro dos limites');
  assert.equal((await categoria(ids.uniAcima)).categoria, 'Acima do limite máximo');
});

test('unidades incompatíveis não são comparadas', { skip: !temBanco }, async () => {
  const c = await categoria(ids.unidadeDif);
  assert.equal(c.categoria, 'Pendente de validação');
  assert.match(c.motivo_pendencia, /Unidades incompatíveis/);
  assert.equal(c.classificacao_indicativa, null);
});

test('valor ausente é pendente, não conforme', { skip: !temBanco }, async () => {
  const c = await categoria(ids.semValor);
  assert.equal(c.categoria, 'Pendente de validação');
  assert.match(c.motivo_pendencia, /Valor do resultado ausente/);
});

test('ausência de limite não é tratada como conformidade', { skip: !temBanco }, async () => {
  assert.equal((await categoria(ids.semLim)).categoria, 'Sem limite aplicável identificado');
  // resultado anterior ao início da vigência: o limite não se aplica
  assert.equal((await categoria(ids.antesVigencia)).categoria, 'Sem limite aplicável identificado');
});

test('limite real sem vigência informada fica pendente, com classificação indicativa', { skip: !temBanco }, async () => {
  const real = (await db.query(`SELECT l.fk_id_ensaio, l.fk_id_legislacao, l.origem_amostra, l.matriz, l.valor_maximo, l.unidade_medida
                                FROM limite l WHERE NOT l.requer_validacao AND l.valor_maximo > 0 AND l.unidade_medida = 'mg/L'
                                AND l.data_inicio_vigencia IS NULL
                                AND NOT EXISTS (SELECT 1 FROM limite o WHERE o.id_limite <> l.id_limite AND o.fk_id_ensaio = l.fk_id_ensaio
                                                AND o.fk_id_legislacao = l.fk_id_legislacao AND o.origem_amostra = l.origem_amostra)
                                ORDER BY l.id_limite LIMIT 1`)).rows[0];
  const prop = ids.prop + 1;
  const am = ids.am + 1;
  await db.query(`INSERT INTO proposta_comercial (id_proposta, fk_id_cliente) VALUES ($1, $2)`, [prop, ids.cli]);
  await db.query(`INSERT INTO e__assoc__1_possui VALUES ($1, $2)`, [prop, real.fk_id_legislacao]);
  await db.query(`INSERT INTO amostra (id_amostra, origem, matriz, fk_id_cliente, fk_id_proposta) VALUES ($1, $2, $3, $4, $5)`,
    [am, real.origem_amostra.slice(0, 30), real.matriz, ids.cli, prop]);
  const idRes = Number((await db.query('SELECT MAX(id_resultado) + 1 AS id FROM resultado')).rows[0].id);
  await db.query(`INSERT INTO resultado (id_resultado, valor, data_resultado, fk_id_amostra, fk_id_ensaio, unidade_medida)
                  VALUES ($1, $2::numeric * 2, '2025-01-01', $3, $4, 'mg/L')`, [idRes, real.valor_maximo, am, real.fk_id_ensaio]);
  const c = await categoria(idRes);
  assert.equal(c.categoria, 'Pendente de validação');
  assert.equal(c.motivo_pendencia, 'Vigência do limite não informada');
  assert.equal(c.classificacao_indicativa, 'Acima do limite máximo');
});

test('histórico calcula variação e recorrência', { skip: !temBanco }, async () => {
  const h = (await db.query('SELECT * FROM vw_historico WHERE id_resultado = $1', [ids.acima2])).rows[0];
  assert.equal(Number(h.valor_anterior), 10);
  assert.equal(Number(h.variacao_absoluta), 1);
  assert.equal(Number(h.variacao_percentual), 10);
  assert.equal(h.direcao, 'Aumento');
  assert.equal(h.recorrencia_fora_limite, true);
  assert.equal(h.serie_suficiente, true);
  const primeiro = (await db.query('SELECT recorrencia_fora_limite FROM vw_historico WHERE id_resultado = $1', [ids.acima1])).rows[0];
  assert.equal(primeiro.recorrencia_fora_limite, false);
});

test('alertas calculados e gravação idempotente', { skip: !temBanco }, async () => {
  const tipos = (await db.query('SELECT tipo FROM vw_alerta_calculado WHERE id_resultado = $1 ORDER BY tipo', [ids.acima2])).rows.map((r) => r.tipo);
  assert.deepEqual(tipos, ['ACIMA_MAXIMO', 'RECORRENCIA']);
  const inserir = `INSERT INTO alerta (id_alerta, tipo, descricao, data_geracao, fk_id_resultado)
    SELECT (SELECT COALESCE(MAX(id_alerta),0) FROM alerta) + row_number() OVER (), c.tipo, c.descricao, CURRENT_DATE, c.id_resultado
    FROM vw_alerta_calculado c WHERE NOT EXISTS (SELECT 1 FROM alerta a WHERE a.fk_id_resultado = c.id_resultado AND a.tipo = c.tipo)`;
  const primeira = await db.query(inserir);
  const segunda = await db.query(inserir);
  assert.ok(primeira.rowCount > 0);
  assert.equal(segunda.rowCount, 0);
});

test('reimportação não duplica registros', { skip: !temBanco }, async () => {
  const dados = await extrair();
  const antes = (await db.query('SELECT (SELECT count(*) FROM limite)::int AS l, (SELECT count(*) FROM ensaio)::int AS e')).rows[0];
  await importarDados(db, dados);
  const segunda = await importarDados(db, dados);
  const depois = (await db.query('SELECT (SELECT count(*) FROM limite)::int AS l, (SELECT count(*) FROM ensaio)::int AS e')).rows[0];
  assert.equal(segunda.limite.inseridos, 0);
  assert.equal(segunda.ensaio.inseridos, 0);
  assert.equal(segunda.limite.existentes, dados.limites.length);
  // os dados reais já estavam importados: nenhuma das duas execuções acrescenta linhas
  assert.equal(depois.l, antes.l);
  assert.equal(depois.e, antes.e);
  const dup = (await db.query(`SELECT count(*)::int AS n FROM (SELECT 1 FROM limite GROUP BY fk_id_ensaio, fk_id_legislacao,
    COALESCE(fk_id_classe,-1), matriz, origem_amostra, versao HAVING count(*) > 1) d`)).rows[0].n;
  assert.equal(dup, 0);
});

test('integridade: todo limite aponta para ensaio e legislação existentes', { skip: !temBanco }, async () => {
  const orf = (await db.query(`SELECT count(*)::int AS n FROM limite l
    LEFT JOIN ensaio e ON e.id_ensaio = l.fk_id_ensaio LEFT JOIN legislacao g ON g.id_legislacao = l.fk_id_legislacao
    WHERE e.id_ensaio IS NULL OR g.id_legislacao IS NULL`)).rows[0].n;
  assert.equal(orf, 0);
});
