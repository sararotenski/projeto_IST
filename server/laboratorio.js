// Importação das exportações do sistema do laboratório (LIMS):
//
//  - "Gerência de Amostra" (Tela_GerenciaAmostra_ResultadoColuna): uma linha por
//    amostra e uma coluna por ensaio ("231 - Fe"). Traz data de coleta e conclusão.
//  - "Expedição" (Tela_Expedição): uma linha por resultado. Traz ponto de coleta,
//    unidade, limite de quantificação e o VMP aplicado pelo laboratório.
//
// Os arquivos podem ser enviados juntos ou separados. As amostras são ligadas
// pelo "Código Amostra Externo". Só entram resultados de ensaios que têm limite
// ativo em alguma legislação; o resto é contado no relatório como ignorado.
// Legislação, cliente e origem não vêm nos arquivos: o resultado é comparado
// com todas as legislações cadastradas (uma classificação por portaria).

import { lerCsvComCabecalho } from '../scripts/lib/csv.js';
import { normalizarTexto } from '../scripts/lib/normalizar.js';
import { gerarAlertas } from '../scripts/lib/alertas.js';

// Descrições de ponto que indicam amostras que não são água (ficam de fora).
export const TERMOS_NAO_AGUA = [
  'peixe', 'pescado', 'carne', 'frango', 'alimento', 'racao', 'leite', 'queijo',
  'solo', 'lodo', 'sedimento', 'efluente', 'esgoto', 'oleo',
];
// Unidades de contagem (números inteiros): "4.884" é separador de milhar.
const UNIDADES_CONTAGEM = ['celulas/ml'];

const semAcento = (t) => (normalizarTexto(t) ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Lê CSV detectando o separador ("," nas exportações do laboratório, ";" no modelo). */
export function lerArquivo(texto) {
  const primeira = texto.replace(/^\ufeff/, '').split(/\r?\n/, 1)[0] ?? '';
  const separador = (primeira.match(/;/g) ?? []).length > (primeira.match(/,/g) ?? []).length ? ';' : ',';
  return lerCsvComCabecalho(texto, separador);
}

/** "gerencia", "expedicao", "modelo" (CSV do site) ou null. */
export function detectarTipo(colunas) {
  const c = new Set(colunas.map(semAcento));
  if (c.has('codigo amostra externo') && c.has('codigo ensaio') && c.has('resultado')) return 'expedicao';
  if (c.has('codigo amostra') && c.has('data coleta') && colunas.some((x) => /^\d+\s*-/.test(x))) return 'gerencia';
  if (c.has('codigo_amostra') && c.has('codigo_ensaio') && c.has('valor')) return 'modelo';
  return null;
}

/** "14/07/2026 15:00:00" ou "14/07/2026" → "2026-07-14". */
export function dataLab(v) {
  const m = normalizarTexto(v)?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/**
 * Converte o texto do resultado.
 * - "Ausente"/"Presente" → 0/1 (ensaios de presença/ausência)
 * - "<0,10" → { valor: "0.10", qualificador: "<" } (abaixo do limite de quantificação)
 * - "1.380,00" → 1380.00 (formato brasileiro); "27.000.000" → 27000000
 * - "6.93" → 6.93 (ponto decimal, padrão do arquivo), exceto em unidades de
 *   contagem, onde "4.884" = 4884
 * Retorna { valor, qualificador } ou { erro }.
 */
export function converterValorLab(texto, unidade) {
  const t = normalizarTexto(texto);
  if (t === null) return { vazio: true };
  if (/^ausente$/i.test(t)) return { valor: '0', qualificador: null };
  if (/^presente$/i.test(t)) return { valor: '1', qualificador: null };
  const m = t.match(/^([<>])=?\s*(.+)$/);
  const qualificador = m ? m[1] : null;
  const n = (m ? m[2] : t).replace(/\s/g, '');
  let valor;
  if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(n) || /^-?\d+,\d+$/.test(n)) valor = n.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3}){2,}$/.test(n)) valor = n.replace(/\./g, '');
  else if (/^-?[1-9]\d{0,2}\.\d{3}$/.test(n) && UNIDADES_CONTAGEM.includes(semAcento(unidade ?? ''))) valor = n.replace('.', '');
  else if (/^-?\d+(\.\d+)?$/.test(n)) valor = n;
  else return { erro: `valor "${t}" não reconhecido` };
  return { valor, qualificador };
}

/**
 * Junta os arquivos em amostras e resultados (sem acessar o banco).
 * @param {{nome: string, conteudo: string}[]} arquivos
 */
export function lerExportacoes(arquivos) {
  const erros = [];
  const tipos = [];
  const amostras = new Map(); // externo → { externo, interno, data_coleta, data_conclusao, ponto }
  const resultados = new Map(); // externo|codigo → { externo, codigo, nome, bruto, unidade, data, fonte }
  const unidadesPorCodigo = new Map();
  const statusNaoConferido = [];

  const amostra = (externo) => {
    if (!amostras.has(externo)) amostras.set(externo, { externo, interno: null, data_coleta: null, data_conclusao: null, ponto: null });
    return amostras.get(externo);
  };

  // Gerência primeiro e Expedição depois: a Expedição tem unidade e prevalece.
  const lidos = arquivos.map((a) => {
    const { colunas, registros } = lerArquivo(a.conteudo ?? '');
    return { ...a, colunas, registros, tipo: detectarTipo(colunas) };
  }).sort((a, b) => (a.tipo === 'expedicao') - (b.tipo === 'expedicao'));

  for (const a of lidos) {
    tipos.push({ nome: a.nome, tipo: a.tipo, linhas: a.registros.length });
    if (a.tipo === 'gerencia') {
      const ensaios = a.colunas.map((c, i) => [i, c.match(/^(\d+)\s*-\s*(.*)$/)]).filter(([, m]) => m);
      for (const r of a.registros) {
        const externo = normalizarTexto(r['Código Amostra Externo']) ?? normalizarTexto(r['Código Amostra']);
        if (!externo) continue;
        const am = amostra(externo);
        am.interno ??= normalizarTexto(r['Código Amostra']);
        am.data_coleta ??= dataLab(r['Data Coleta']);
        am.data_conclusao ??= dataLab(r['Data Conclusão']);
        for (const [, m] of ensaios) {
          const bruto = normalizarTexto(r[m[0]]);
          if (!bruto) continue;
          resultados.set(`${externo}|${m[1]}`, { externo, codigo: m[1], nome: normalizarTexto(m[2]), bruto, unidade: null, data: null, linha: r._linha, arquivo: a.nome });
        }
      }
    } else if (a.tipo === 'expedicao') {
      for (const r of a.registros) {
        const externo = normalizarTexto(r['Código Amostra Externo']);
        const codigo = normalizarTexto(r['Código Ensaio']);
        if (!externo || !codigo) continue;
        const am = amostra(externo);
        am.interno ??= normalizarTexto(r['Código Amostra Interno']);
        am.ponto ??= normalizarTexto(r['Descrição Ponto']);
        const unidade = normalizarTexto(r['Un Med Trab']);
        if (unidade && !unidadesPorCodigo.has(codigo)) unidadesPorCodigo.set(codigo, unidade === '-' ? 'adimensional' : unidade);
        const status = normalizarTexto(r.Status);
        if (status && semAcento(status) !== 'conferido') statusNaoConferido.push({ externo, codigo, status });
        const bruto = normalizarTexto(r.Resultado);
        if (!bruto) continue;
        resultados.set(`${externo}|${codigo}`, {
          externo, codigo, nome: normalizarTexto(r['Descrição Ensaio']), bruto, unidade: unidade === '-' ? 'adimensional' : unidade,
          data: dataLab(r['Data Conclusão Ensaio']), linha: r._linha, arquivo: a.nome,
        });
      }
    } else {
      erros.push({ linha: null, mensagem: `${a.nome}: formato não reconhecido. Envie a exportação "Gerência de Amostra" ou "Expedição" do sistema do laboratório, ou o modelo do site.` });
    }
  }
  return { erros, tipos, amostras, resultados: [...resultados.values()], unidadesPorCodigo, statusNaoConferido };
}

const proximo = async (client, tabela, coluna) => Number((await client.query(`SELECT COALESCE(MAX(${coluna}),0)+1 AS id FROM ${tabela}`)).rows[0].id);

/**
 * Importa as exportações. Resultados já existentes (mesma amostra e ensaio)
 * são mantidos e contados como "já importados". Valores não reconhecidos são
 * listados no relatório. { simular: true } executa e desfaz (ROLLBACK).
 */
export async function importarExportacoes(pool, arquivos, { simular = false } = {}) {
  const lido = lerExportacoes(arquivos);
  if (lido.erros.length) return { erros: lido.erros };
  if (!lido.resultados.length) return { erros: [{ linha: null, mensagem: 'Nenhum resultado encontrado nos arquivos.' }] };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE amostra, resultado IN SHARE ROW EXCLUSIVE MODE');

    // Ensaios com limite ativo e a unidade dos limites (quando única)
    const ensaios = new Map((await client.query(`
      SELECT e.codigo_origem AS codigo, e.id_ensaio, e.nome,
             array_agg(DISTINCT fn_normalizar_unidade(l.unidade_medida)) AS unidades_norm,
             min(l.unidade_medida) AS unidade
      FROM ensaio e JOIN limite l ON l.fk_id_ensaio = e.id_ensaio AND l.ativo
      GROUP BY e.codigo_origem, e.id_ensaio, e.nome`)).rows.map((e) => [e.codigo, e]));

    const rel = {
      arquivos: lido.tipos,
      amostrasNoArquivo: lido.amostras.size,
      resultadosNoArquivo: lido.resultados.length,
      importados: 0,
      jaImportados: 0,
      semLimite: 0,
      ensaiosSemLimite: new Map(),
      naoAgua: [],
      invalidos: [],
      semUnidade: 0,
      statusNaoConferido: lido.statusNaoConferido.length,
    };

    const excluidas = new Set();
    for (const am of lido.amostras.values()) {
      const p = semAcento(am.ponto ?? '');
      const termo = TERMOS_NAO_AGUA.find((t) => p.includes(t));
      if (termo) {
        excluidas.add(am.externo);
        rel.naoAgua.push({ amostra: am.externo, ponto: am.ponto });
      }
    }

    const lote = (await client.query(
      `INSERT INTO etl.lote_resultados (origem, arquivo) VALUES ('laboratorio', $1) RETURNING id_lote`,
      [arquivos.map((a) => a.nome).join(' + ').slice(0, 200)],
    )).rows[0].id_lote;

    const idsAmostra = new Map();
    const novasAmostras = new Set();
    const inseridos = [];
    let idAmostra = await proximo(client, 'amostra', 'id_amostra');
    let idResultado = await proximo(client, 'resultado', 'id_resultado');

    for (const r of lido.resultados) {
      if (excluidas.has(r.externo)) continue;
      const ensaio = ensaios.get(r.codigo);
      if (!ensaio) {
        rel.semLimite++;
        const k = `${r.codigo} - ${r.nome ?? ''}`.trim();
        rel.ensaiosSemLimite.set(k, (rel.ensaiosSemLimite.get(k) ?? 0) + 1);
        continue;
      }
      // Unidade: a do resultado (Expedição) → a do método (Expedição, mesmo código) → a do limite (se única)
      const unidade = r.unidade ?? lido.unidadesPorCodigo.get(r.codigo) ?? (ensaio.unidades_norm.length === 1 ? ensaio.unidade : null);
      if (!unidade) rel.semUnidade++;
      const conv = converterValorLab(r.bruto, unidade);
      if (conv.erro) {
        rel.invalidos.push({ amostra: r.externo, ensaio: `${r.codigo} - ${ensaio.nome}`, valor: r.bruto, motivo: conv.erro });
        continue;
      }
      const am = lido.amostras.get(r.externo);
      if (!idsAmostra.has(r.externo)) {
        const ex = await client.query('SELECT id_amostra FROM amostra WHERE codigo_amostra = $1', [r.externo]);
        if (ex.rowCount) {
          idsAmostra.set(r.externo, ex.rows[0].id_amostra);
          await client.query(
            `UPDATE amostra SET data_coleta = COALESCE(data_coleta, $2), ponto_coleta = COALESCE(ponto_coleta, $3) WHERE id_amostra = $1`,
            [ex.rows[0].id_amostra, am.data_coleta, am.ponto?.slice(0, 80) ?? null],
          );
        } else {
          const id = idAmostra++;
          await client.query(
            `INSERT INTO amostra (id_amostra, data_coleta, codigo_amostra, ponto_coleta, id_lote) VALUES ($1, $2, $3, $4, $5)`,
            [id, am.data_coleta, r.externo, am.ponto?.slice(0, 80) ?? null, lote],
          );
          idsAmostra.set(r.externo, id);
          novasAmostras.add(r.externo);
        }
      }
      const fk = idsAmostra.get(r.externo);
      const dup = await client.query('SELECT 1 FROM resultado WHERE fk_id_amostra = $1 AND fk_id_ensaio = $2', [fk, ensaio.id_ensaio]);
      if (dup.rowCount) {
        rel.jaImportados++;
        continue;
      }
      const id = idResultado++;
      await client.query(
        `INSERT INTO resultado (id_resultado, valor, qualificador, valor_original, data_resultado, fk_id_amostra, fk_id_ensaio, unidade_medida, id_lote)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, conv.valor, conv.qualificador, r.bruto.slice(0, 40), r.data ?? am.data_conclusao ?? am.data_coleta, fk, ensaio.id_ensaio, unidade, lote],
      );
      inseridos.push(id);
    }
    rel.importados = inseridos.length;
    rel.amostrasNovas = novasAmostras.size;
    rel.amostrasComResultado = new Set(lido.resultados.filter((r) => !excluidas.has(r.externo) && ensaios.has(r.codigo)).map((r) => r.externo)).size;
    rel.ensaiosSemLimite = [...rel.ensaiosSemLimite.entries()].sort((a, b) => b[1] - a[1]).map(([ensaio, n]) => ({ ensaio, resultados: n }));

    if (!inseridos.length) {
      await client.query('ROLLBACK');
      return { lote: null, relatorio: rel, resultados: [], porPortaria: [], aviso: rel.jaImportados ? 'Todos os resultados destes arquivos já tinham sido importados.' : 'Nenhum resultado com limite legal foi encontrado nos arquivos.' };
    }

    const alertas = await gerarAlertas(client);
    const porPortaria = (await client.query(
      `SELECT legislacao, categoria, count(*)::int AS n FROM vw_resultado_portaria WHERE id_resultado = ANY($1) GROUP BY 1, 2 ORDER BY 1, 2`,
      [inseridos],
    )).rows;
    const resultados = (await client.query(
      `SELECT id_resultado, codigo_amostra, ponto_coleta, codigo_ensaio, ensaio, valor, qualificador, valor_original, unidade_resultado,
              data_resultado, valor_minimo, valor_maximo, unidade_limite, legislacao, categoria, motivo_pendencia, motivo_inconclusivo, portarias
       FROM vw_resultado_conformidade WHERE id_resultado = ANY($1)
       ORDER BY CASE categoria WHEN 'Acima do limite máximo' THEN 1 WHEN 'Abaixo do limite mínimo' THEN 2 WHEN 'Inconclusivo' THEN 3 ELSE 4 END, id_resultado`,
      [inseridos],
    )).rows;
    const resumo = {};
    for (const r of resultados) resumo[r.categoria] = (resumo[r.categoria] ?? 0) + 1;
    rel.porCategoria = resumo;

    await client.query(
      `UPDATE etl.lote_resultados SET qtd_amostras = $2, qtd_resultados = $3, relatorio = $4 WHERE id_lote = $1`,
      [lote, new Set(resultados.map((r) => r.codigo_amostra)).size, inseridos.length,
        JSON.stringify({ ...rel, invalidos: rel.invalidos.length, naoAgua: rel.naoAgua.length, ensaiosSemLimite: rel.ensaiosSemLimite.length })],
    );
    await client.query(simular ? 'ROLLBACK' : 'COMMIT');
    return { lote: simular ? null : lote, simulacao: simular, relatorio: rel, porPortaria, resultados, alertas };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
