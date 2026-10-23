// Uso: npm run extrair
// Lê data/raw/*.csv, valida e padroniza os limites legais e grava:
//   data/processed/*.json, data/processed/limites.csv e reports/relatorio_qualidade.md
// Não acessa o banco de dados.

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extrairLimites, TIPOS_PENDENCIA } from './lib/extracao.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirRaw = path.join(raiz, 'data', 'raw');
const dirProcessed = path.join(raiz, 'data', 'processed');
const dirReports = path.join(raiz, 'reports');

export async function carregarFontes() {
  const nomes = (await readdir(dirRaw)).filter((n) => n.toLowerCase().endsWith('.csv')).sort();
  return Promise.all(nomes.map(async (arquivo) => ({ arquivo, texto: await readFile(path.join(dirRaw, arquivo), 'utf8') })));
}

const csvCampo = (v) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function relatorioQualidade(r) {
  const e = r.estatisticas;
  const linhas = [];
  linhas.push('# Relatório de qualidade dos dados extraídos');
  linhas.push('');
  linhas.push(`Gerado por \`npm run extrair\` em ${new Date().toISOString()}.`);
  linhas.push('');
  linhas.push('## Arquivos processados');
  linhas.push('');
  linhas.push('| Arquivo | Linhas de dados | Colunas faltando |');
  linhas.push('|---|---:|---|');
  for (const a of r.arquivos) linhas.push(`| ${a.arquivo} | ${a.totalLinhas} | ${a.colunasFaltando.join(', ') || '—'} |`);
  linhas.push('');
  linhas.push('## Resumo');
  linhas.push('');
  linhas.push(`- Linhas lidas: ${e.totalLinhas}`);
  linhas.push(`- Linhas válidas: ${e.linhasValidas}`);
  linhas.push(`- Limites consolidados para importação: ${e.limitesConsolidados} (${e.limitesRequerValidacao} marcados para validação)`);
  linhas.push(`- Legislações: ${r.legislacoes.length} · Classes: ${r.classes.length} · Ensaios: ${r.ensaios.length}`);
  linhas.push('');
  linhas.push('## Pendências por tipo');
  linhas.push('');
  linhas.push('| Tipo | Qtd. | Registro importado? | Significado |');
  linhas.push('|---|---:|---|---|');
  for (const [tipo, meta] of Object.entries(TIPOS_PENDENCIA)) {
    linhas.push(`| ${tipo} | ${e.pendenciasPorTipo[tipo]} | ${meta.importado ? 'sim' : 'não'} | ${meta.descricao} |`);
  }
  const relevantes = r.pendencias.filter((p) => !['DUPLICATA_EXATA', 'NOME_EM_CODIGOS_DIFERENTES'].includes(p.tipo));
  linhas.push('');
  linhas.push('## Itens que precisam de revisão humana');
  linhas.push('');
  linhas.push('| Tipo | Arquivo | Linhas | Descrição |');
  linhas.push('|---|---|---|---|');
  for (const p of relevantes) {
    linhas.push(`| ${p.tipo} | ${p.arquivo_origem ?? '—'} | ${p.linhas_origem ?? '—'} | ${p.descricao.replace(/\|/g, '/')} |`);
  }
  linhas.push('');
  linhas.push('Duplicatas exatas e nomes repetidos em códigos diferentes estão em `data/processed/pendencias.json`.');
  linhas.push('');
  return linhas.join('\n');
}

export async function executar() {
  const resultado = extrairLimites(await carregarFontes());
  await mkdir(dirProcessed, { recursive: true });
  await mkdir(dirReports, { recursive: true });

  for (const nome of ['legislacoes', 'classes', 'ensaios', 'limites', 'pendencias']) {
    await writeFile(path.join(dirProcessed, `${nome}.json`), JSON.stringify(resultado[nome], null, 2) + '\n');
  }
  await writeFile(
    path.join(dirProcessed, 'estatisticas.json'),
    JSON.stringify({ arquivos: resultado.arquivos.map(({ colunas, ...a }) => a), ...resultado.estatisticas }, null, 2) + '\n',
  );

  const colunas = Object.keys(resultado.limites[0] ?? {});
  const csv = [colunas.join(';'), ...resultado.limites.map((l) => colunas.map((c) => csvCampo(l[c])).join(';'))].join('\n');
  await writeFile(path.join(dirProcessed, 'limites.csv'), '\ufeff' + csv + '\n');
  await writeFile(path.join(dirReports, 'relatorio_qualidade.md'), relatorioQualidade(resultado));
  return resultado;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await executar();
  const e = r.estatisticas;
  console.log(`Arquivos: ${r.arquivos.length} · linhas lidas: ${e.totalLinhas} · válidas: ${e.linhasValidas}`);
  console.log(`Limites consolidados: ${e.limitesConsolidados} (${e.limitesRequerValidacao} requerem validação)`);
  console.log(`Legislações: ${r.legislacoes.length} · classes: ${r.classes.length} · ensaios: ${r.ensaios.length}`);
  console.log('Pendências:', e.pendenciasPorTipo);
  console.log('Saídas em data/processed/ e reports/relatorio_qualidade.md');
}
