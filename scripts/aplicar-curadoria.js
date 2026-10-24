// Uso:
//   npm run curadoria                aplica as decisões de data/curadoria/decisoes.json
//   npm run curadoria -- --simular   aplica e desfaz (ROLLBACK), para conferir
// Idempotente: decisões já aplicadas são ignoradas.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aplicarCuradoria } from './lib/curadoria.js';
import { conectar, descreverErroBanco, migracaoAplicada } from './lib/db.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const simular = process.argv.includes('--simular');

let client;
try {
  const decisoes = JSON.parse(await readFile(path.join(raiz, 'data', 'curadoria', 'decisoes.json'), 'utf8'));
  client = await conectar();
  if (!(await migracaoAplicada(client, '002_resultados_curadoria'))) {
    throw new Error('A migração 002 não foi aplicada. Rode: npm run migrar -- --confirmar');
  }
  await client.query('BEGIN');
  const r = await aplicarCuradoria(client, decisoes);
  await client.query(simular ? 'ROLLBACK' : 'COMMIT');
  console.log(simular ? 'SIMULAÇÃO (nada gravado):' : 'Curadoria aplicada:');
  console.log(`  decisões aplicadas: ${r.aplicadas} · já aplicadas antes: ${r.jaAplicadas}`);
  console.log(`  limites alterados: ${r.limitesAlterados} · inseridos: ${r.limitesInseridos} · pendências resolvidas: ${r.pendenciasResolvidas}`);
  for (const d of r.detalhes) console.log(`    ${d.chave} (${d.acao}): ${d.registros} registro(s), ${d.pendencias} pendência(s)`);
} catch (e) {
  await client?.query('ROLLBACK').catch(() => {});
  console.error(`Curadoria não aplicada (nada foi gravado): ${descreverErroBanco(e)}`);
  process.exitCode = 1;
} finally {
  await client?.end();
}
