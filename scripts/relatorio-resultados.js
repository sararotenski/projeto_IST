// Uso: npm run relatorio
// Gera reports/relatorio_importacao_resultados.md a partir do banco (somente leitura).
// Só traz números agregados e nomes de ensaios: nenhum código de amostra,
// cliente ou ponto de coleta, porque o arquivo vai para o GitHub.

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { conectar, descreverErroBanco } from './lib/db.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const n = (v) => Number(v ?? 0).toLocaleString('pt-BR');
const tabela = (cab, linhas) => [`| ${cab.join(' | ')} |`, `|${cab.map((c, i) => (i ? '---:' : '---')).join('|')}|`, ...linhas.map((l) => `| ${l.join(' | ')} |`)];
const ORIGEM = { laboratorio: 'Exportação do laboratório', csv: 'CSV (modelo do site)', formulario: 'Formulário' };

export async function gerarRelatorio(client) {
  const q = async (sql, p = []) => (await client.query(sql, p)).rows;
  const lotes = await q(`
    SELECT l.id_lote, l.origem, l.arquivo, l.criado_em, l.relatorio,
           count(r.id_resultado)::int AS resultados, count(DISTINCT r.fk_id_amostra)::int AS amostras
    FROM etl.lote_resultados l LEFT JOIN resultado r ON r.id_lote = l.id_lote
    WHERE l.desfeito_em IS NULL GROUP BY l.id_lote ORDER BY l.id_lote`);
  const totais = (await q(`
    SELECT (SELECT count(*) FROM resultado)::int AS resultados, (SELECT count(*) FROM amostra)::int AS amostras,
           (SELECT count(*) FROM amostra WHERE matriz = 'Efluente')::int AS efluente,
           (SELECT count(*) FROM resultado WHERE qualificador = '<')::int AS menor_lq`))[0];
  const geral = await q(`SELECT categoria, count(*)::int AS n FROM vw_resultado_conformidade GROUP BY 1 ORDER BY 2 DESC`);
  const porLei = await q(`
    SELECT legislacao,
           count(*) FILTER (WHERE categoria = 'Dentro dos limites')::int AS dentro,
           count(*) FILTER (WHERE categoria = 'Acima do limite máximo')::int AS acima,
           count(*) FILTER (WHERE categoria = 'Abaixo do limite mínimo')::int AS abaixo,
           count(*) FILTER (WHERE categoria = 'Inconclusivo')::int AS inconclusivo,
           count(*) FILTER (WHERE categoria = 'Pendente de validação')::int AS pendente,
           count(*) FILTER (WHERE categoria = 'Sem limite aplicável identificado')::int AS nao_se_aplica
    FROM vw_resultado_portaria GROUP BY 1 ORDER BY 1`);
  const fora = await q(`
    SELECT ensaio, codigo_ensaio, legislacao, count(*) FILTER (WHERE categoria = 'Acima do limite máximo')::int AS acima,
           count(*) FILTER (WHERE categoria = 'Abaixo do limite mínimo')::int AS abaixo, count(*)::int AS total
    FROM vw_resultado_conformidade GROUP BY 1, 2, 3
    HAVING count(*) FILTER (WHERE categoria IN ('Acima do limite máximo', 'Abaixo do limite mínimo')) > 0
    ORDER BY 4 + 5 DESC, 1`);
  const revisao = await q(`
    SELECT categoria, ensaio, codigo_ensaio, COALESCE(motivo_inconclusivo, motivo_pendencia) AS motivo, count(*)::int AS n
    FROM vw_resultado_conformidade WHERE categoria IN ('Inconclusivo', 'Pendente de validação')
    GROUP BY 1, 2, 3, 4 ORDER BY 1, 5 DESC`);
  const semLimite = await q(`
    SELECT ensaio, codigo_ensaio, count(*)::int AS n FROM vw_resultado_conformidade
    WHERE categoria = 'Sem limite aplicável identificado' GROUP BY 1, 2 ORDER BY 3 DESC`);

  const l = ['# Relatório de importação dos resultados', ''];
  l.push(`Gerado por \`npm run relatorio\` em ${new Date().toLocaleString('pt-BR')}, a partir do banco. Só traz números agregados: códigos de amostra, clientes e pontos de coleta não aparecem aqui.`, '');
  l.push('## Situação atual', '');
  l.push(`- ${n(totais.resultados)} resultados de ${n(totais.amostras)} amostras (${n(totais.efluente)} identificadas como efluente).`);
  l.push(`- ${n(totais.menor_lq)} resultados abaixo do limite de quantificação (valor com "<").`, '');
  l.push(...tabela(['Classificação geral', 'Resultados'], geral.map((g) => [g.categoria, n(g.n)])), '');
  l.push('## Lotes importados', '');
  l.push(...tabela(['Lote', 'Data', 'Origem', 'Arquivos', 'Amostras', 'Resultados', 'Ignorados sem limite', 'Fora (não são água)', 'Valores não reconhecidos'],
    lotes.map((x) => {
      const r = x.relatorio ?? {};
      return [String(x.id_lote), new Date(x.criado_em).toLocaleDateString('pt-BR'), ORIGEM[x.origem] ?? x.origem, x.arquivo ?? '—',
        n(x.amostras), n(x.resultados), r.semLimite === undefined ? '—' : n(r.semLimite), r.naoAgua === undefined ? '—' : n(r.naoAgua),
        r.invalidos === undefined ? '—' : n(r.invalidos)];
    })), '');
  l.push('"Ignorados sem limite" são resultados de ensaios que não têm limite em nenhuma legislação cadastrada (ex.: DQO, solventes, poeiras). Eles não são gravados.', '');
  l.push('## Classificação por legislação', '');
  l.push(...tabela(['Legislação', 'Dentro', 'Acima', 'Abaixo', 'Inconclusivo', 'Pendente', 'Não se aplica'],
    porLei.map((p) => [p.legislacao, n(p.dentro), n(p.acima), n(p.abaixo), n(p.inconclusivo), n(p.pendente), n(p.nao_se_aplica)])), '');
  l.push('## Ensaios com resultados fora do limite', '');
  l.push('Classificação geral (a mais grave entre as legislações).', '');
  l.push(...tabela(['Ensaio', 'Código', 'Legislação decisiva', 'Acima', 'Abaixo', 'Resultados'],
    fora.map((f) => [f.ensaio, f.codigo_ensaio, f.legislacao ?? '—', n(f.acima), n(f.abaixo), n(f.total)])), '');
  l.push('## Precisam de revisão técnica', '');
  l.push('Resultados que o sistema não classifica sozinho.', '');
  l.push(...tabela(['Situação', 'Ensaio', 'Código', 'Motivo', 'Resultados'],
    revisao.map((r) => [r.categoria, r.ensaio, r.codigo_ensaio, String(r.motivo ?? '—').replace(/\|/g, '/'), n(r.n)])), '');
  l.push('## Gravados sem limite aplicável', '');
  l.push('O ensaio tem limite em alguma legislação, mas não para este tipo de amostra (ex.: ensaio de efluente numa amostra de água).', '');
  l.push(...tabela(['Ensaio', 'Código', 'Resultados'], semLimite.map((s) => [s.ensaio, s.codigo_ensaio, n(s.n)])), '');
  return l.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let client;
  try {
    client = await conectar();
    await client.query('BEGIN READ ONLY');
    const texto = await gerarRelatorio(client);
    await client.query('ROLLBACK');
    await mkdir(path.join(raiz, 'reports'), { recursive: true });
    await writeFile(path.join(raiz, 'reports', 'relatorio_importacao_resultados.md'), texto);
    console.log('Relatório: reports/relatorio_importacao_resultados.md');
  } catch (e) {
    console.error(`Erro: ${descreverErroBanco(e)}`);
    process.exitCode = 1;
  } finally {
    await client?.end();
  }
}
