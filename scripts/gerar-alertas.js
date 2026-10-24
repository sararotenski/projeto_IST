// Uso: npm run alertas
// Grava em ALERTA os alertas de conformidade, tendência e valor atípico.
// Idempotente: um alerta por (resultado, tipo). O site chama a mesma rotina
// automaticamente a cada lançamento de resultados.

import { conectar, descreverErroBanco } from './lib/db.js';
import { gerarAlertas } from './lib/alertas.js';

let client;
try {
  client = await conectar();
  await client.query('BEGIN');
  const r = await gerarAlertas(client);
  await client.query('COMMIT');
  const total = (await client.query('SELECT count(*)::int AS n FROM alerta')).rows[0].n;
  console.log(`Alertas novos: ${r.conformidade} de conformidade, ${r.estatisticos} de tendência/desvio · total na tabela: ${total}`);
} catch (e) {
  await client?.query('ROLLBACK').catch(() => {});
  console.error(`Erro: ${descreverErroBanco(e)}`);
  process.exitCode = 1;
} finally {
  await client?.end();
}
