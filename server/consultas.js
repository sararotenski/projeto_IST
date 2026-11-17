// Consultas de leitura usadas pela API. Todas parametrizadas ($1, $2...).
// Filtro com valor NULL = sem filtro.

import { carregarSeries } from './analise/series.js';
import { PARAMETROS } from './analise/tendencia.js';

export const CATEGORIAS = [
  'Dentro dos limites',
  'Acima do limite máximo',
  'Abaixo do limite mínimo',
  'Inconclusivo',
  'Sem limite aplicável identificado',
  'Pendente de validação',
];

const texto = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const data = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const inteiro = (v) => (v !== undefined && /^\d+$/.test(String(v)) ? Number(v) : null);

export async function saude(db) {
  const { rows } = await db.query(`
    SELECT current_database() AS banco,
           to_regclass('public.vw_resultado_conformidade') IS NOT NULL AS views_ok,
           to_regclass('etl.lote_resultados') IS NOT NULL AS migracao_ok`);
  return rows[0];
}

const resumoSerie = (s) => ({
  serie: s.serie,
  serieValidada: s.serieValidada,
  pontoColeta: s.pontoColeta,
  idEnsaio: s.idEnsaio,
  codigoEnsaio: s.codigoEnsaio,
  ensaio: s.ensaio,
  legislacao: s.legislacao,
  unidade: s.unidade,
  limite: s.limite,
  ultimo: s.ultimo,
  foraDoLimite: s.foraDoLimite,
  n: s.estatisticas.n,
  media: s.estatisticas.media,
  desvioPadrao: s.estatisticas.desvioPadrao,
  coeficienteVariacao: s.estatisticas.coeficienteVariacao,
  tendencia: s.tendencia,
  atipicos: s.atipicos.length,
});

export async function painel(db) {
  const k = (await db.query(`
    SELECT (SELECT count(*) FROM amostra)::int AS amostras,
           (SELECT count(*) FROM resultado)::int AS resultados,
           (SELECT count(DISTINCT ponto_coleta) FROM amostra WHERE ponto_coleta IS NOT NULL)::int AS pontos,
           count(*) FILTER (WHERE categoria = 'Dentro dos limites')::int AS dentro,
           count(*) FILTER (WHERE categoria = 'Acima do limite máximo')::int AS acima,
           count(*) FILTER (WHERE categoria = 'Abaixo do limite mínimo')::int AS abaixo,
           count(*) FILTER (WHERE categoria = 'Sem limite aplicável identificado')::int AS sem_limite,
           count(*) FILTER (WHERE categoria = 'Pendente de validação')::int AS pendentes,
           count(*) FILTER (WHERE categoria = 'Inconclusivo')::int AS inconclusivos,
           (SELECT count(*) FROM limite WHERE ativo)::int AS limites,
           (SELECT count(*) FROM legislacao)::int AS legislacoes
    FROM vw_resultado_conformidade`)).rows[0];

  const series = await carregarSeries(db);
  const aumento = series.filter((s) => s.tendencia.situacao === 'Aumentando');
  const reducao = series.filter((s) => s.tendencia.situacao === 'Diminuindo');
  const comAtipicos = series.filter((s) => s.atipicos.length);

  const fora = (await db.query(`
    SELECT id_resultado, codigo_amostra, ponto_coleta, ensaio, codigo_ensaio, data_resultado, valor, qualificador, valor_original,
           unidade_resultado, valor_minimo, valor_maximo, unidade_limite, legislacao, categoria, percentual_do_maximo, motivo_inconclusivo
    FROM vw_resultado_conformidade
    WHERE categoria IN ('Acima do limite máximo', 'Abaixo do limite mínimo', 'Inconclusivo')
    ORDER BY data_resultado DESC NULLS LAST, id_resultado DESC LIMIT 300`)).rows;

  const TIPO = { 'Acima do limite máximo': 'acima', 'Abaixo do limite mínimo': 'abaixo', Inconclusivo: 'inconclusivo' };
  const atencao = [
    ...fora.map((f) => ({
      tipo: TIPO[f.categoria],
      titulo: f.categoria,
      ensaio: f.ensaio,
      ponto: f.ponto_coleta,
      data: f.data_resultado,
      detalhe: {
        valor: f.valor, qualificador: f.qualificador, original: f.valor_original, unidade: f.unidade_resultado,
        minimo: f.valor_minimo, maximo: f.valor_maximo, unidadeLimite: f.unidade_limite, legislacao: f.legislacao, amostra: f.codigo_amostra,
        motivo: f.motivo_inconclusivo,
      },
    })),
    ...[...aumento, ...reducao].map((s) => ({
      tipo: s.tendencia.situacao === 'Aumentando' ? 'aumento' : 'reducao',
      titulo: s.tendencia.situacao === 'Aumentando' ? 'Tendência de aumento' : 'Tendência de redução',
      ensaio: s.ensaio,
      ponto: s.pontoColeta,
      data: s.ultimo.data,
      serie: s.serie,
      detalhe: { descricao: s.tendencia.descricao, n: s.estatisticas.n },
    })),
    ...comAtipicos.flatMap((s) =>
      s.atipicos.map((a) => ({
        tipo: 'atipico',
        titulo: 'Valor atípico',
        ensaio: s.ensaio,
        ponto: s.pontoColeta,
        data: a.data,
        serie: s.serie,
        detalhe: { valor: a.valor, unidade: s.unidade, media: a.media, z: a.z },
      })),
    ),
  ].sort((a, b) => String(b.data).localeCompare(String(a.data)));

  const lotes = (await db.query(`
    SELECT id_lote, origem, arquivo, criado_em, qtd_amostras, qtd_resultados FROM etl.lote_resultados
    WHERE desfeito_em IS NULL ORDER BY id_lote DESC LIMIT 5`)).rows;

  // Classificação em cada portaria
  const porPortaria = (await db.query(`
    SELECT legislacao,
           count(*) FILTER (WHERE categoria = 'Dentro dos limites')::int AS dentro,
           count(*) FILTER (WHERE categoria = 'Acima do limite máximo')::int AS acima,
           count(*) FILTER (WHERE categoria = 'Abaixo do limite mínimo')::int AS abaixo,
           count(*) FILTER (WHERE categoria = 'Inconclusivo')::int AS inconclusivos,
           count(*) FILTER (WHERE categoria = 'Pendente de validação')::int AS pendentes,
           count(*) FILTER (WHERE categoria = 'Sem limite aplicável identificado')::int AS nao_se_aplica
    FROM vw_resultado_portaria GROUP BY legislacao ORDER BY legislacao`)).rows;

  // Ensaios com mais resultados fora do limite
  const ensaiosFora = (await db.query(`
    SELECT ensaio, codigo_ensaio, count(*)::int AS total,
           count(*) FILTER (WHERE categoria IN ('Acima do limite máximo', 'Abaixo do limite mínimo'))::int AS fora
    FROM vw_resultado_conformidade GROUP BY ensaio, codigo_ensaio
    HAVING count(*) FILTER (WHERE categoria IN ('Acima do limite máximo', 'Abaixo do limite mínimo')) > 0
    ORDER BY fora DESC, ensaio LIMIT 10`)).rows;

  return {
    kpis: { ...k, fora: k.acima + k.abaixo, tendenciaAumento: aumento.length, tendenciaReducao: reducao.length, atipicos: comAtipicos.reduce((s, x) => s + x.atipicos.length, 0), series: series.length },
    atencao,
    totalAtencao: atencao.length,
    porPortaria,
    ensaiosFora,
    lotes,
  };
}

export async function opcoes(db) {
  const legislacoes = (await db.query('SELECT id_legislacao AS id, nome, descricao FROM legislacao ORDER BY nome')).rows;
  const origens = (await db.query(`SELECT DISTINCT origem_amostra AS v FROM limite WHERE ativo ORDER BY 1`)).rows.map((r) => r.v);
  const pontos = (await db.query(`SELECT DISTINCT ponto_coleta AS v FROM amostra WHERE ponto_coleta IS NOT NULL ORDER BY 1`)).rows.map((r) => r.v);
  const clientes = (await db.query(`SELECT nome AS v FROM cliente ORDER BY 1`)).rows.map((r) => r.v);
  // Ensaios com limite ativo, por legislação e origem (para o formulário)
  const ensaios = (await db.query(`
    SELECT legislacao, origem_amostra, id_ensaio AS id, codigo_ensaio AS codigo, ensaio AS nome,
           valor_minimo, valor_maximo, unidade_medida AS unidade, classe
    FROM vw_limite_detalhado WHERE ativo
    ORDER BY ensaio, codigo_ensaio::int`)).rows;
  const todosEnsaios = (await db.query(`SELECT id_ensaio AS id, codigo_origem AS codigo, nome FROM ensaio ORDER BY nome, codigo_origem::int`)).rows;
  return { legislacoes, origens, pontos, clientes, ensaios, todosEnsaios, categorias: CATEGORIAS, parametros: PARAMETROS };
}

export async function resultados(db, p) {
  const { rows } = await db.query(
    `SELECT id_resultado, id_amostra, codigo_amostra, ponto_coleta, codigo_ensaio, ensaio, data_coleta, data_resultado,
            valor, qualificador, valor_original, unidade_resultado,
            legislacao, classe, valor_minimo, valor_maximo, unidade_limite, percentual_do_maximo,
            categoria, classificacao_indicativa, motivo_pendencia, motivo_inconclusivo, portarias, legislacao_informada
     FROM vw_resultado_conformidade
     -- período pela data de coleta (ou do resultado, se a coleta não foi informada)
     WHERE ($1::date IS NULL OR COALESCE(data_coleta, data_resultado) >= $1)
       AND ($2::date IS NULL OR COALESCE(data_coleta, data_resultado) <= $2)
       -- legislação: resultados que têm limite nessa portaria
       AND ($3::text IS NULL OR (portarias -> $3 ->> 'categoria') NOT IN ('Sem limite aplicável identificado'))
       AND ($4::int  IS NULL OR id_ensaio = $4)
       AND ($5::text IS NULL OR categoria = $5)
       AND ($6::text IS NULL OR ponto_coleta = $6)
       AND ($7::text IS NULL OR codigo_amostra ILIKE '%' || $7 || '%' OR ensaio ILIKE '%' || $7 || '%')
     ORDER BY COALESCE(data_coleta, data_resultado) DESC NULLS LAST, id_resultado DESC
     LIMIT 5000`,
    [data(p.inicio), data(p.fim), texto(p.legislacao), inteiro(p.ensaio), texto(p.categoria), texto(p.ponto), texto(p.busca)],
  );
  return rows;
}

/**
 * Evolução ao longo do tempo: quantos resultados ficaram em cada classificação
 * por semana (segunda a domingo) ou mês de COLETA (ou do resultado, se não houver coleta).
 * Com portaria escolhida, usa a classificação naquela portaria; sem, a classificação geral.
 * Resultados sem limite aplicável não entram no total comparado.
 * Períodos sem resultados aparecem com zero, para o eixo do tempo ser contínuo.
 */
export async function evolucao(db, p) {
  const unidade = p.agrupamento === 'mes' ? 'month' : 'week';
  const { rows } = await db.query(
    `WITH base AS (
       SELECT COALESCE(c.data_coleta, c.data_resultado) AS data,
              CASE WHEN $2::text IS NULL THEN c.categoria ELSE c.portarias -> $2 ->> 'categoria' END AS categoria
       FROM vw_resultado_conformidade c
       WHERE ($3::int IS NULL OR c.id_ensaio = $3)
         AND COALESCE(c.data_coleta, c.data_resultado) IS NOT NULL
         AND ($4::date IS NULL OR COALESCE(c.data_coleta, c.data_resultado) >= $4)
         AND ($5::date IS NULL OR COALESCE(c.data_coleta, c.data_resultado) <= $5)
     ),
     agrupado AS (
       SELECT date_trunc($1, data)::date AS inicio,
              count(*) FILTER (WHERE categoria = 'Dentro dos limites')::int AS dentro,
              count(*) FILTER (WHERE categoria = 'Acima do limite máximo')::int AS acima,
              count(*) FILTER (WHERE categoria = 'Abaixo do limite mínimo')::int AS abaixo,
              count(*) FILTER (WHERE categoria = 'Inconclusivo')::int AS inconclusivos,
              count(*) FILTER (WHERE categoria = 'Pendente de validação')::int AS pendentes,
              count(*) FILTER (WHERE categoria IS NULL OR categoria = 'Sem limite aplicável identificado')::int AS sem_limite
       FROM base GROUP BY 1
     ),
     periodos AS (
       SELECT generate_series(min(inicio), max(inicio), ('1 ' || $1)::interval)::date AS inicio FROM agrupado
     )
     SELECT p.inicio,
            (p.inicio + ('1 ' || $1)::interval - interval '1 day')::date AS fim,
            COALESCE(a.dentro, 0) AS dentro, COALESCE(a.acima, 0) AS acima, COALESCE(a.abaixo, 0) AS abaixo,
            COALESCE(a.inconclusivos, 0) AS inconclusivos, COALESCE(a.pendentes, 0) AS pendentes,
            COALESCE(a.sem_limite, 0) AS sem_limite
     FROM periodos p LEFT JOIN agrupado a ON a.inicio = p.inicio
     ORDER BY p.inicio`,
    [unidade, texto(p.legislacao), inteiro(p.ensaio), data(p.inicio), data(p.fim)],
  );
  const periodos = rows.map((r) => {
    const comparados = r.dentro + r.acima + r.abaixo + r.inconclusivos + r.pendentes;
    return { ...r, comparados, fora: r.acima + r.abaixo, percentualFora: comparados ? Math.round(((r.acima + r.abaixo) / comparados) * 1000) / 10 : null };
  });
  const soma = (k) => periodos.reduce((s, x) => s + x[k], 0);
  const comparados = soma('comparados');
  return {
    agrupamento: p.agrupamento === 'mes' ? 'mes' : 'semana',
    periodos,
    total: {
      comparados, dentro: soma('dentro'), acima: soma('acima'), abaixo: soma('abaixo'),
      inconclusivos: soma('inconclusivos'), pendentes: soma('pendentes'), semLimite: soma('sem_limite'),
      percentualFora: comparados ? Math.round(((soma('acima') + soma('abaixo')) / comparados) * 1000) / 10 : null,
    },
  };
}

export async function tendencias(db, p) {
  const series = await carregarSeries(db, { ensaio: inteiro(p.ensaio) });
  const situacao = texto(p.situacao);
  return series.map(resumoSerie).filter((s) => !situacao || s.tendencia.situacao === situacao || (situacao === 'Valor atípico' && s.atipicos > 0));
}

export async function serie(db, p) {
  const nome = texto(p.serie);
  if (!nome) return null;
  const [s] = await carregarSeries(db, { serie: nome });
  if (!s) return null;
  return { ...resumoSerie(s), pontos: s.linhas, atipicosDetalhe: s.atipicos, linhaTendencia: s.linhaTendencia, parametros: s.parametros };
}

/** Limites agrupados por parâmetro: códigos com o mesmo nome e os mesmos valores viram uma linha. */
export async function limites(db, p) {
  const { rows } = await db.query(
    `SELECT legislacao, origem_amostra, COALESCE(classe, 'Sem classe') AS classe, ensaio AS parametro,
            valor_minimo, valor_maximo, unidade_medida, tipo_limite, data_inicio_vigencia,
            bool_or(requer_validacao) AS requer_validacao,
            string_agg(DISTINCT observacao_validacao, ' · ') AS observacao,
            array_agg(codigo_ensaio ORDER BY codigo_ensaio::int) AS codigos,
            count(*)::int AS qtd_codigos
     FROM vw_limite_detalhado
     WHERE ativo
       AND ($1::text IS NULL OR legislacao = $1)
       AND ($2::text IS NULL OR origem_amostra = $2)
       AND ($3::text IS NULL OR ensaio ILIKE '%' || $3 || '%' OR codigo_ensaio = $3)
     GROUP BY legislacao, origem_amostra, classe, ensaio, valor_minimo, valor_maximo, unidade_medida, tipo_limite, data_inicio_vigencia
     ORDER BY lower(ensaio), legislacao, origem_amostra`,
    [texto(p.legislacao), texto(p.origem), texto(p.busca)],
  );
  return rows;
}

export async function qualidade(db) {
  const contagens = (await db.query(`
    SELECT (SELECT count(*) FROM limite)::int AS limites,
           (SELECT count(*) FROM limite WHERE ativo)::int AS ativos,
           (SELECT count(*) FROM limite WHERE NOT ativo)::int AS inativos,
           (SELECT count(*) FROM limite WHERE requer_validacao)::int AS requer_validacao,
           (SELECT count(*) FROM etl.pendencia)::int AS pendencias,
           (SELECT count(*) FROM etl.pendencia WHERE NOT resolvida)::int AS abertas,
           (SELECT count(*) FROM etl.decisao_curadoria)::int AS decisoes,
           (SELECT count(*) FROM (SELECT 1 FROM vw_limite_detalhado WHERE ativo
              GROUP BY legislacao, origem_amostra, classe, lower(ensaio), valor_minimo, valor_maximo, unidade_medida) g)::int AS parametros`)).rows[0];
  const decisoes = (await db.query(`SELECT chave, tipo, descricao, fonte, aplicada_em FROM etl.decisao_curadoria ORDER BY id_decisao`)).rows;
  const abertas = (await db.query(`SELECT tipo, descricao, arquivo_origem, linhas_origem FROM etl.pendencia WHERE NOT resolvida ORDER BY tipo, id_pendencia`)).rows;
  const inativos = (await db.query(`SELECT codigo_ensaio, ensaio, legislacao, origem_amostra, motivo_inativacao FROM vw_limite_detalhado WHERE NOT ativo ORDER BY ensaio`)).rows;
  const porTipo = (await db.query(`SELECT tipo, count(*)::int AS total, count(*) FILTER (WHERE resolvida)::int AS resolvidas FROM etl.pendencia GROUP BY tipo ORDER BY total DESC`)).rows;
  return { contagens, decisoes, abertas, inativos, porTipo };
}

export async function lotes(db) {
  return (await db.query(`SELECT id_lote, origem, arquivo, criado_em, qtd_amostras, qtd_resultados, desfeito_em FROM etl.lote_resultados ORDER BY id_lote DESC LIMIT 50`)).rows;
}
