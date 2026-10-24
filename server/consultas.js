// Consultas de leitura usadas pela API. Todas parametrizadas ($1, $2...).
// Filtro com valor NULL = sem filtro.

import { carregarSeries } from './analise/series.js';
import { PARAMETROS } from './analise/tendencia.js';

export const CATEGORIAS = [
  'Dentro dos limites',
  'Acima do limite máximo',
  'Abaixo do limite mínimo',
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
           (SELECT count(*) FROM limite WHERE ativo)::int AS limites,
           (SELECT count(*) FROM legislacao)::int AS legislacoes
    FROM vw_resultado_conformidade`)).rows[0];

  const series = await carregarSeries(db);
  const aumento = series.filter((s) => s.tendencia.situacao === 'Aumentando');
  const reducao = series.filter((s) => s.tendencia.situacao === 'Diminuindo');
  const comAtipicos = series.filter((s) => s.atipicos.length);

  const fora = (await db.query(`
    SELECT id_resultado, codigo_amostra, ponto_coleta, ensaio, codigo_ensaio, data_resultado, valor, unidade_resultado,
           valor_minimo, valor_maximo, unidade_limite, legislacao, categoria, percentual_do_maximo
    FROM vw_resultado_conformidade
    WHERE categoria IN ('Acima do limite máximo', 'Abaixo do limite mínimo')
    ORDER BY data_resultado DESC, id_resultado DESC LIMIT 50`)).rows;

  const atencao = [
    ...fora.map((f) => ({
      tipo: f.categoria === 'Acima do limite máximo' ? 'acima' : 'abaixo',
      titulo: f.categoria,
      ensaio: f.ensaio,
      ponto: f.ponto_coleta,
      data: f.data_resultado,
      detalhe: { valor: f.valor, unidade: f.unidade_resultado, minimo: f.valor_minimo, maximo: f.valor_maximo, legislacao: f.legislacao, amostra: f.codigo_amostra },
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

  return {
    kpis: { ...k, fora: k.acima + k.abaixo, tendenciaAumento: aumento.length, tendenciaReducao: reducao.length, atipicos: comAtipicos.reduce((s, x) => s + x.atipicos.length, 0), series: series.length },
    atencao,
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
    `SELECT id_resultado, id_amostra, codigo_amostra, ponto_coleta, codigo_ensaio, ensaio, data_resultado, valor, unidade_resultado,
            legislacao, classe, valor_minimo, valor_maximo, unidade_limite, percentual_do_maximo,
            categoria, classificacao_indicativa, motivo_pendencia
     FROM vw_resultado_conformidade
     WHERE ($1::date IS NULL OR data_resultado >= $1)
       AND ($2::date IS NULL OR data_resultado <= $2)
       AND ($3::text IS NULL OR legislacao = $3)
       AND ($4::int  IS NULL OR id_ensaio = $4)
       AND ($5::text IS NULL OR categoria = $5)
       AND ($6::text IS NULL OR ponto_coleta = $6)
       AND ($7::text IS NULL OR codigo_amostra ILIKE '%' || $7 || '%' OR ensaio ILIKE '%' || $7 || '%')
     ORDER BY data_resultado DESC NULLS LAST, id_resultado DESC
     LIMIT 5000`,
    [data(p.inicio), data(p.fim), texto(p.legislacao), inteiro(p.ensaio), texto(p.categoria), texto(p.ponto), texto(p.busca)],
  );
  return rows;
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
