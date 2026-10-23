// Uso: npm run alertas
// Grava em ALERTA os alertas calculados pela view vw_alerta_calculado.
// Idempotente: um alerta por (resultado, tipo); reexecuções não duplicam.
// Alertas já gravados não são apagados nem alterados.

import { conectar, descreverErroBanco } from './lib/db.js';

let client;
try {
  client = await conectar();
  await client.query('BEGIN');
  await client.query('LOCK TABLE alerta IN SHARE ROW EXCLUSIVE MODE');
  const { rowCount } = await client.query(`
    INSERT INTO alerta (id_alerta, tipo, descricao, data_geracao, fk_id_resultado)
    SELECT (SELECT COALESCE(MAX(id_alerta), 0) FROM alerta) + row_number() OVER (ORDER BY c.id_resultado, c.tipo),
           c.tipo, c.descricao, CURRENT_DATE, c.id_resultado
    FROM vw_alerta_calculado c
    WHERE NOT EXISTS (SELECT 1 FROM alerta a WHERE a.fk_id_resultado = c.id_resultado AND a.tipo = c.tipo)`);
  await client.query('COMMIT');
  const total = (await client.query('SELECT count(*)::int AS n FROM alerta')).rows[0].n;
  console.log(`Alertas novos: ${rowCount} · total na tabela: ${total}`);
  if (total === 0) console.log('Nenhum resultado laboratorial cadastrado: não há alertas a gerar.');
} catch (e) {
  await client?.query('ROLLBACK').catch(() => {});
  console.error(`Erro: ${descreverErroBanco(e)}`);
  process.exitCode = 1;
} finally {
  await client?.end();
}
