// Uso: npm run inspecionar
// Diagnóstico SOMENTE LEITURA do banco: tabelas, colunas, chaves, restrições,
// contagem de registros, comparação com sql/000_script_original.sql e
// verificação das pré-condições da migração 001.
// Saída: reports/diagnostico_banco.md

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conectar, descreverErroBanco, migracaoAplicada } from './lib/db.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Extrai tabelas/colunas/tipos do script SQL de referência. */
export function lerEstruturaEsperada(sql) {
  const tabelas = {};
  for (const m of sql.matchAll(/CREATE TABLE\s+(\w+)\s*\(([\s\S]*?)\);/gi)) {
    const nome = m[1].toLowerCase();
    tabelas[nome] = {};
    for (const linha of m[2].split('\n')) {
      const c = linha.trim().match(/^(\w+)\s+([A-Z]+(?:\(\d+(?:,\s*\d+)?\))?)/i);
      if (c) tabelas[nome][c[1].toLowerCase()] = c[2].toUpperCase();
    }
  }
  const fks = [...sql.matchAll(/ALTER TABLE\s+(\w+)\s+ADD CONSTRAINT\s+(\w+)\s+FOREIGN KEY\s*\((\w+)\)\s*REFERENCES\s+(\w+)\s*\((\w+)\)(?:\s*ON DELETE\s+(\w+(?:\s+\w+)?))?/gi)].map(
    (m) => ({ tabela: m[1].toLowerCase(), nome: m[2].toLowerCase(), coluna: m[3].toLowerCase(), ref: m[4].toLowerCase(), onDelete: (m[6] ?? 'NO ACTION').toUpperCase() }),
  );
  return { tabelas, fks };
}

const tipoReal = (c) => {
  const t = c.data_type.toUpperCase();
  if (t === 'CHARACTER VARYING') return `VARCHAR(${c.character_maximum_length})`;
  if (t === 'INTEGER') return 'INT';
  if (t === 'NUMERIC') return c.numeric_precision ? `DECIMAL(${c.numeric_precision},${c.numeric_scale})` : 'DECIMAL';
  return t;
};

async function verificacoes(client, existentes) {
  const v = [];
  const q = async (titulo, tabela, sql, interpretar) => {
    if (!existentes.has(tabela)) return v.push({ titulo, resultado: `tabela ${tabela} não existe` });
    // SAVEPOINT: uma verificação com erro não aborta as demais.
    await client.query('SAVEPOINT verificacao');
    try {
      const { rows } = await client.query(sql);
      v.push({ titulo, resultado: interpretar(rows) });
      await client.query('RELEASE SAVEPOINT verificacao');
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT verificacao');
      v.push({ titulo, resultado: `erro: ${descreverErroBanco(e)}` });
    }
  };
  await q('Associações duplicadas em e__assoc__1_possui', 'e__assoc__1_possui',
    `SELECT count(*)::int AS n FROM (SELECT 1 FROM e__assoc__1_possui GROUP BY fk_id_proposta, fk_id_legislacao HAVING count(*) > 1) d`,
    (r) => (r[0].n ? `${r[0].n} pares duplicados — a PK da migração 001 falharia` : 'nenhuma'));
  await q('Nulos em e__assoc__1_possui', 'e__assoc__1_possui',
    `SELECT count(*)::int AS n FROM e__assoc__1_possui WHERE fk_id_proposta IS NULL OR fk_id_legislacao IS NULL`,
    (r) => (r[0].n ? `${r[0].n} linhas com nulos — a PK da migração 001 falharia` : 'nenhum'));
  await q('Legislações com nome repetido', 'legislacao',
    `SELECT count(*)::int AS n FROM (SELECT nome FROM legislacao GROUP BY nome HAVING count(*) > 1) d`,
    (r) => (r[0].n ? `${r[0].n} nomes repetidos — índice único falharia` : 'nenhuma'));
  await q('Classes repetidas na mesma legislação', 'classe',
    `SELECT count(*)::int AS n FROM (SELECT 1 FROM classe GROUP BY fk_id_legislacao, nome HAVING count(*) > 1) d`,
    (r) => (r[0].n ? `${r[0].n} repetições — índice único falharia` : 'nenhuma'));
  await q('Limites com mínimo > máximo', 'limite',
    `SELECT count(*)::int AS n FROM limite WHERE valor_minimo > valor_maximo`, (r) => String(r[0].n));
  await q('Limites com fim de vigência antes do início', 'limite',
    `SELECT count(*)::int AS n FROM limite WHERE data_fim_vigencia < data_inicio_vigencia`, (r) => String(r[0].n));
  await q('Alertas repetidos (resultado + tipo)', 'alerta',
    `SELECT count(*)::int AS n FROM (SELECT 1 FROM alerta GROUP BY fk_id_resultado, tipo HAVING count(*) > 1) d`,
    (r) => (r[0].n ? `${r[0].n} repetições — índice único falharia` : 'nenhum'));
  return v;
}

export async function inspecionar(client) {
  const esperado = lerEstruturaEsperada(await readFile(path.join(raiz, 'sql', '000_script_original.sql'), 'utf8'));
  const info = (await client.query(`SELECT current_database() AS banco, current_user AS usuario, version() AS versao`)).rows[0];

  const colunas = (await client.query(`
    SELECT table_name, column_name, data_type, character_maximum_length, numeric_precision, numeric_scale, is_nullable
    FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`)).rows;
  const restricoes = (await client.query(`
    SELECT rel.relname AS tabela, con.conname AS nome, con.contype AS tipo, pg_get_constraintdef(con.oid) AS definicao
    FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' ORDER BY 1, 2`)).rows;

  const tabelasReais = {};
  for (const c of colunas) (tabelasReais[c.table_name] ??= {})[c.column_name] = tipoReal(c);
  const existentes = new Set(Object.keys(tabelasReais));

  const contagens = {};
  for (const t of existentes) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM public."${t.replace(/"/g, '""')}"`);
    contagens[t] = rows[0].n;
  }

  const diferencas = [];
  for (const [t, cols] of Object.entries(esperado.tabelas)) {
    if (!existentes.has(t)) { diferencas.push(`Tabela \`${t}\` do script não existe no banco`); continue; }
    for (const [c, tipo] of Object.entries(cols)) {
      const real = tabelasReais[t][c];
      if (!real) diferencas.push(`\`${t}.${c}\` do script não existe no banco`);
      else if (real !== tipo) diferencas.push(`\`${t}.${c}\`: script ${tipo}, banco ${real}`);
    }
    for (const c of Object.keys(tabelasReais[t])) {
      if (!(c in cols)) diferencas.push(`\`${t}.${c}\` existe no banco e não no script`);
    }
  }
  for (const t of existentes) if (!(t in esperado.tabelas)) diferencas.push(`Tabela \`${t}\` existe no banco e não no script`);
  for (const fk of esperado.fks) {
    const r = restricoes.find((x) => x.tabela === fk.tabela && x.tipo === 'f' && x.definicao.toLowerCase().includes(`(${fk.coluna})`));
    if (!r) diferencas.push(`FK \`${fk.nome}\` (${fk.tabela}.${fk.coluna} → ${fk.ref}) não encontrada no banco`);
  }

  return {
    info,
    esperado,
    tabelasReais,
    restricoes,
    contagens,
    diferencas,
    verificacoes: await verificacoes(client, existentes),
    migracao001: await migracaoAplicada(client, '001_ajustes_modelo'),
    views010: await migracaoAplicada(client, '010_views_analise'),
  };
}

function relatorio(d) {
  const l = [];
  l.push('# Diagnóstico do banco PostgreSQL', '');
  l.push(`Gerado por \`npm run inspecionar\` em ${new Date().toISOString()} (somente leitura).`, '');
  l.push(`- Banco: \`${d.info.banco}\` · usuário: \`${d.info.usuario}\``);
  l.push(`- Servidor: ${d.info.versao.split(',')[0]}`);
  l.push(`- Migração 001 aplicada: ${d.migracao001 ? 'sim' : 'não'} · Views 010 aplicadas: ${d.views010 ? 'sim' : 'não'}`, '');
  l.push('## Tabelas e registros (esquema public)', '', '| Tabela | Registros | Colunas |', '|---|---:|---|');
  for (const t of Object.keys(d.tabelasReais).sort()) {
    l.push(`| ${t} | ${d.contagens[t]} | ${Object.entries(d.tabelasReais[t]).map(([c, tp]) => `${c} ${tp}`).join(', ')} |`);
  }
  if (!Object.keys(d.tabelasReais).length) l.push('| (nenhuma tabela) | | |');
  l.push('', '## Chaves e restrições', '', '| Tabela | Nome | Tipo | Definição |', '|---|---|---|---|');
  const tipos = { p: 'PK', f: 'FK', u: 'UNIQUE', c: 'CHECK' };
  for (const r of d.restricoes) l.push(`| ${r.tabela} | ${r.nome} | ${tipos[r.tipo] ?? r.tipo} | \`${r.definicao}\` |`);
  l.push('', '## Diferenças em relação a sql/000_script_original.sql', '');
  l.push(...(d.diferencas.length ? d.diferencas.map((x) => `- ${x}`) : ['- Nenhuma: estrutura idêntica ao script.']));
  l.push('', '## Pré-condições da migração 001 e integridade', '', '| Verificação | Resultado |', '|---|---|');
  for (const v of d.verificacoes) l.push(`| ${v.titulo} | ${v.resultado} |`);
  l.push('');
  return l.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let client;
  try {
    client = await conectar();
    await client.query('BEGIN READ ONLY');
    const d = await inspecionar(client);
    await client.query('ROLLBACK');
    await mkdir(path.join(raiz, 'reports'), { recursive: true });
    await writeFile(path.join(raiz, 'reports', 'diagnostico_banco.md'), relatorio(d));
    console.log(`Banco ${d.info.banco}: ${Object.keys(d.tabelasReais).length} tabelas.`);
    for (const [t, n] of Object.entries(d.contagens).sort()) console.log(`  ${t}: ${n} registros`);
    console.log(`Diferenças em relação ao script: ${d.diferencas.length}`);
    for (const x of d.diferencas) console.log(`  - ${x}`);
    for (const v of d.verificacoes) console.log(`  [verificação] ${v.titulo}: ${v.resultado}`);
    console.log(`Migração 001: ${d.migracao001 ? 'aplicada' : 'não aplicada'} · Views 010: ${d.views010 ? 'aplicadas' : 'não aplicadas'}`);
    console.log('Relatório: reports/diagnostico_banco.md');
  } catch (e) {
    console.error(`Erro: ${descreverErroBanco(e)}`);
    process.exitCode = 1;
  } finally {
    await client?.end();
  }
}
