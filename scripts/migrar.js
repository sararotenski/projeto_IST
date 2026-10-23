// Uso:
//   npm run migrar -- --confirmar            aplica 001 (se ainda não aplicada) e 010
//   npm run migrar:reverter -- --confirmar   reverte 001 e remove as views
// Sem --confirmar, apenas mostra o que seria feito.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conectar, descreverErroBanco, migracaoAplicada } from './lib/db.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlDe = (nome) => readFile(path.join(raiz, 'sql', nome), 'utf8');

const reverter = process.argv.includes('--reverter');
const confirmar = process.argv.includes('--confirmar');

async function preCondicoes(client) {
  const problemas = [];
  const checar = async (descricao, sql) => {
    const { rows } = await client.query(sql);
    if (rows[0].n > 0) problemas.push(`${descricao}: ${rows[0].n}`);
  };
  const { rows } = await client.query(`
    SELECT array_agg(t) FILTER (WHERE to_regclass('public.' || t) IS NULL) AS faltando
    FROM unnest(ARRAY['ensaio','limite','legislacao','classe','resultado','amostra','alerta','e__assoc__1_possui']) t`);
  if (rows[0].faltando?.length) {
    problemas.push(`tabelas ausentes: ${rows[0].faltando.join(', ')} (crie a estrutura com sql/000_script_original.sql)`);
    return problemas;
  }
  await checar('associações duplicadas em e__assoc__1_possui',
    `SELECT count(*)::int AS n FROM (SELECT 1 FROM e__assoc__1_possui GROUP BY fk_id_proposta, fk_id_legislacao HAVING count(*) > 1) d`);
  await checar('associações com nulos', `SELECT count(*)::int AS n FROM e__assoc__1_possui WHERE fk_id_proposta IS NULL OR fk_id_legislacao IS NULL`);
  await checar('legislações com nome repetido', `SELECT count(*)::int AS n FROM (SELECT 1 FROM legislacao GROUP BY nome HAVING count(*) > 1) d`);
  await checar('classes repetidas', `SELECT count(*)::int AS n FROM (SELECT 1 FROM classe GROUP BY fk_id_legislacao, nome HAVING count(*) > 1) d`);
  await checar('alertas repetidos', `SELECT count(*)::int AS n FROM (SELECT 1 FROM alerta GROUP BY fk_id_resultado, tipo HAVING count(*) > 1) d`);
  return problemas;
}

let client;
try {
  client = await conectar();
  const aplicada001 = await migracaoAplicada(client, '001_ajustes_modelo');

  if (reverter) {
    if (!confirmar) {
      console.log('Simulação: seria executado sql/001_ajustes_modelo_reverter.sql (remove colunas adicionadas, views e o esquema etl).');
      console.log('Para executar: npm run migrar:reverter -- --confirmar');
    } else {
      await client.query(await sqlDe('001_ajustes_modelo_reverter.sql'));
      console.log('Reversão concluída.');
    }
  } else {
    const passos = [];
    if (!aplicada001) passos.push('001_ajustes_modelo.sql');
    passos.push('010_views_analise.sql');
    if (!confirmar) {
      console.log(`Migração 001 ${aplicada001 ? 'já aplicada' : 'pendente'}.`);
      console.log(`Simulação: seriam executados ${passos.join(', ')}.`);
      console.log('Para executar: npm run migrar -- --confirmar');
    } else {
      const problemas = aplicada001 ? [] : await preCondicoes(client);
      if (problemas.length) {
        console.error('Migração não aplicada. Corrija antes:');
        for (const p of problemas) console.error(`  - ${p}`);
        process.exitCode = 1;
        passos.length = 0;
      }
      for (const p of passos) {
        await client.query(await sqlDe(p));
        console.log(`Aplicado: sql/${p}`);
      }
    }
  }
} catch (e) {
  await client?.query('ROLLBACK').catch(() => {});
  console.error(`Erro (nenhuma alteração parcial foi mantida): ${descreverErroBanco(e)}`);
  process.exitCode = 1;
} finally {
  await client?.end();
}
