// Uso:
//   npm run importar                 importa (transação única; tudo ou nada)
//   npm run importar -- --simular    executa e desfaz (ROLLBACK), só para conferir
// Pode ser executado várias vezes: registros existentes não são duplicados nem sobrescritos.

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executar as extrair } from './extrair.js';
import { importarDados } from './lib/importacao.js';
import { conectar, descreverErroBanco, migracaoAplicada } from './lib/db.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const simular = process.argv.includes('--simular');

function relatorio(resumo, contagens, simulacao) {
  const l = ['# Relatório de importação', ''];
  l.push(`Gerado por \`npm run importar${simulacao ? ' -- --simular' : ''}\` em ${new Date().toISOString()}.`);
  if (simulacao) l.push('', '**Simulação: nenhuma alteração foi gravada (ROLLBACK).**');
  l.push('', '| Tabela | Inseridos | Já existentes (iguais) | Corrigidos pela curadoria | Divergentes (não sobrescritos) |', '|---|---:|---:|---:|---:|');
  for (const t of ['legislacao', 'ensaio', 'classe', 'limite']) {
    l.push(`| ${t} | ${resumo[t].inseridos} | ${resumo[t].existentes} | ${resumo[t].curados} | ${resumo[t].divergentes} |`);
  }
  l.push(`| etl.pendencia | ${resumo.pendencia.inseridas} | ${resumo.pendencia.existentes} | — | — |`);
  l.push('', '## Registros por tabela após a importação', '', '| Tabela | Registros |', '|---|---:|');
  for (const [t, n] of Object.entries(contagens)) l.push(`| ${t} | ${n} |`);
  l.push('', 'Tabelas sem dados reais nos arquivos fornecidos (não foram preenchidas): cliente, proposta_comercial,');
  l.push('e__assoc__1_possui, amostra, resultado, alerta e parecer_tecnico.', '');
  if (resumo.divergencias.length) {
    l.push('## Divergências com dados já existentes no banco', '');
    for (const d of resumo.divergencias) l.push(`- ${d.descricao}`);
    l.push('');
  }
  l.push('Itens rejeitados e que precisam de correção manual: ver `reports/relatorio_qualidade.md`.', '');
  return l.join('\n');
}

let client;
let log;
let idExecucao;
try {
  const dados = await extrair();
  client = await conectar();
  if (!(await migracaoAplicada(client, '001_ajustes_modelo'))) {
    throw new Error('A migração 001 não foi aplicada. Rode: npm run migrar -- --confirmar');
  }

  // Log em conexão separada: sobrevive a um ROLLBACK da importação.
  log = await conectar();
  idExecucao = (await log.query(
    `INSERT INTO etl.execucao_importacao (status) VALUES ('em_andamento') RETURNING id_execucao`,
  )).rows[0].id_execucao;

  await client.query('BEGIN');
  const resumo = await importarDados(client, dados);
  const contagens = {};
  for (const t of ['legislacao', 'classe', 'ensaio', 'limite', 'cliente', 'proposta_comercial', 'amostra', 'resultado', 'alerta', 'parecer_tecnico']) {
    contagens[t] = (await client.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n;
  }
  contagens['etl.pendencia'] = (await client.query('SELECT count(*)::int AS n FROM etl.pendencia')).rows[0].n;
  await client.query(simular ? 'ROLLBACK' : 'COMMIT');

  const { divergencias, ...semDivergencias } = resumo;
  await log.query(
    `UPDATE etl.execucao_importacao SET status = $2, finalizado_em = now(), resumo = $3 WHERE id_execucao = $1`,
    [idExecucao, simular ? 'simulacao' : 'concluida', JSON.stringify({ ...semDivergencias, divergencias: divergencias.length, contagens })],
  );
  await mkdir(path.join(raiz, 'reports'), { recursive: true });
  await writeFile(path.join(raiz, 'reports', 'relatorio_importacao.md'), relatorio(resumo, contagens, simular));

  console.log(simular ? 'SIMULAÇÃO (nada gravado):' : 'Importação concluída:');
  for (const t of ['legislacao', 'ensaio', 'classe', 'limite']) {
    console.log(`  ${t}: ${resumo[t].inseridos} inseridos, ${resumo[t].existentes} já existentes, ${resumo[t].curados} corrigidos pela curadoria, ${resumo[t].divergentes} divergentes`);
  }
  console.log(`  pendências: ${resumo.pendencia.inseridas} novas, ${resumo.pendencia.existentes} já registradas`);
  console.log('Relatório: reports/relatorio_importacao.md');
} catch (e) {
  await client?.query('ROLLBACK').catch(() => {});
  const msg = descreverErroBanco(e);
  if (log && idExecucao) {
    await log.query(
      `UPDATE etl.execucao_importacao SET status = 'falhou', finalizado_em = now(), erro = $2 WHERE id_execucao = $1`,
      [idExecucao, msg],
    ).catch(() => {});
  }
  console.error(`Importação não realizada (nada foi gravado): ${msg}`);
  process.exitCode = 1;
} finally {
  await client?.end();
  await log?.end();
}
