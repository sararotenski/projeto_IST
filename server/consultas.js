// Consultas SQL usadas pela API. Todas são parametrizadas ($1, $2...)
// e somente leitura. Filtros opcionais: parâmetro NULL = sem filtro.

export const CATEGORIAS = [
  'Dentro dos limites',
  'Abaixo do limite mínimo',
  'Acima do limite máximo',
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
           to_regclass('etl.pendencia') IS NOT NULL AS migracao_ok`);
  return rows[0];
}

export async function resumo(db) {
  const contagens = (await db.query(`
    SELECT (SELECT count(*) FROM legislacao)::int  AS legislacoes,
           (SELECT count(*) FROM classe)::int      AS classes,
           (SELECT count(*) FROM ensaio)::int      AS ensaios,
           (SELECT count(*) FROM limite)::int      AS limites,
           (SELECT count(*) FROM limite WHERE requer_validacao)::int AS limites_requer_validacao,
           (SELECT count(*) FROM amostra)::int     AS amostras,
           (SELECT count(*) FROM resultado)::int   AS resultados,
           (SELECT count(*) FROM alerta)::int      AS alertas,
           (SELECT count(*) FROM etl.pendencia WHERE NOT resolvida)::int AS pendencias`)).rows[0];
  const limitesPorOrigem = (await db.query(`
    SELECT legislacao, origem_amostra, count(*)::int AS limites,
           count(*) FILTER (WHERE requer_validacao)::int AS requer_validacao
    FROM vw_limite_detalhado GROUP BY 1, 2 ORDER BY 1, 2`)).rows;
  const classificacao = (await db.query(`
    SELECT categoria, count(*)::int AS quantidade FROM vw_resultado_conformidade GROUP BY 1`)).rows;
  const alertasPorTipo = (await db.query(`
    SELECT tipo, count(*)::int AS quantidade FROM alerta GROUP BY 1 ORDER BY 2 DESC`)).rows;
  const pendenciasPorTipo = (await db.query(`
    SELECT tipo, importado, count(*)::int AS quantidade FROM etl.pendencia WHERE NOT resolvida
    GROUP BY 1, 2 ORDER BY 3 DESC`)).rows;
  const ultimaImportacao = (await db.query(`
    SELECT id_execucao, iniciado_em, finalizado_em, status FROM etl.execucao_importacao
    WHERE status = 'concluida' ORDER BY id_execucao DESC LIMIT 1`)).rows[0] ?? null;
  return { contagens, limitesPorOrigem, classificacao, alertasPorTipo, pendenciasPorTipo, ultimaImportacao };
}

export async function filtros(db) {
  const q = async (sql) => (await db.query(sql)).rows.map((r) => r.v);
  return {
    legislacoes: await q('SELECT nome AS v FROM legislacao ORDER BY 1'),
    origens: await q('SELECT DISTINCT origem_amostra AS v FROM limite WHERE origem_amostra IS NOT NULL ORDER BY 1'),
    classes: await q('SELECT DISTINCT nome AS v FROM classe ORDER BY 1'),
    unidades: await q('SELECT DISTINCT unidade_medida AS v FROM limite WHERE unidade_medida IS NOT NULL ORDER BY 1'),
    categorias: CATEGORIAS,
    tiposAlerta: ['ACIMA_MAXIMO', 'ABAIXO_MINIMO', 'RECORRENCIA', 'PENDENTE_VALIDACAO'],
    ensaios: (await db.query(`SELECT id_ensaio AS id, codigo_origem AS codigo, nome FROM ensaio ORDER BY nome, codigo_origem::int`)).rows,
  };
}

export async function limites(db, p) {
  const { rows } = await db.query(
    `SELECT id_limite, codigo_ensaio, ensaio, legislacao, classe, matriz, origem_amostra,
            valor_minimo, valor_maximo, unidade_medida, tipo_limite, versao,
            data_inicio_vigencia, data_fim_vigencia, requer_validacao, observacao_validacao,
            arquivo_origem, linhas_origem
     FROM vw_limite_detalhado
     WHERE ($1::text IS NULL OR legislacao = $1)
       AND ($2::text IS NULL OR origem_amostra = $2)
       AND ($3::text IS NULL OR classe = $3 OR ($3 = '(sem classe)' AND classe IS NULL))
       AND ($4::text IS NULL OR ensaio ILIKE '%' || $4 || '%' OR codigo_ensaio = $4)
       AND ($5::int IS NULL OR id_ensaio = $5)
       AND ($6::boolean IS NULL OR requer_validacao = $6)
     ORDER BY ensaio, codigo_ensaio::int, legislacao, origem_amostra`,
    [texto(p.legislacao), texto(p.origem), texto(p.classe), texto(p.busca), inteiro(p.ensaio),
      p.validacao === 'sim' ? true : p.validacao === 'nao' ? false : null],
  );
  return rows;
}

export async function conformidade(db, p) {
  const { rows } = await db.query(
    `SELECT id_resultado, id_amostra, codigo_ensaio, ensaio, data_resultado, valor, unidade_resultado,
            legislacao, classe, valor_minimo, valor_maximo, unidade_limite, versao,
            categoria, classificacao_indicativa, motivo_pendencia, qtd_limites_candidatos
     FROM vw_resultado_conformidade
     WHERE ($1::date IS NULL OR data_resultado >= $1)
       AND ($2::date IS NULL OR data_resultado <= $2)
       AND ($3::text IS NULL OR legislacao = $3)
       AND ($4::int  IS NULL OR id_ensaio = $4)
       AND ($5::text IS NULL OR classe = $5)
       AND ($6::text IS NULL OR categoria = $6)
     ORDER BY data_resultado DESC NULLS LAST, id_resultado DESC
     LIMIT 5000`,
    [data(p.inicio), data(p.fim), texto(p.legislacao), inteiro(p.ensaio), texto(p.classe), texto(p.categoria)],
  );
  return rows;
}

export async function historico(db, p) {
  const series = (await db.query(
    `SELECT serie, ensaio, codigo_ensaio, max(qtd_pontos_serie)::int AS pontos,
            min(data_resultado) AS primeira, max(data_resultado) AS ultima,
            count(*) FILTER (WHERE fora_limite)::int AS fora_limite
     FROM vw_historico
     WHERE ($1::int IS NULL OR id_ensaio = $1)
     GROUP BY 1, 2, 3 ORDER BY 2, 1`,
    [inteiro(p.ensaio)],
  )).rows;
  const serie = texto(p.serie);
  const pontos = serie
    ? (await db.query(
      `SELECT id_resultado, id_amostra, data_resultado, valor, unidade_resultado, valor_minimo, valor_maximo,
              categoria, valor_anterior, variacao_absoluta, variacao_percentual, direcao,
              recorrencia_fora_limite, serie_suficiente, qtd_pontos_serie
       FROM vw_historico WHERE serie = $1 ORDER BY posicao`,
      [serie],
    )).rows
    : [];
  return { series, pontos };
}

export async function alertas(db, p) {
  const params = [texto(p.tipo), inteiro(p.ensaio), texto(p.legislacao), data(p.inicio), data(p.fim)];
  const filtro = `($1::text IS NULL OR tipo = $1) AND ($2::int IS NULL OR id_ensaio = $2)
                  AND ($3::text IS NULL OR legislacao = $3)
                  AND ($4::date IS NULL OR data_referencia >= $4) AND ($5::date IS NULL OR data_referencia <= $5)`;
  const registrados = (await db.query(
    `SELECT a.id_alerta, a.tipo, a.descricao, a.data_geracao, a.fk_id_resultado AS id_resultado,
            c.ensaio, c.legislacao, c.data_resultado AS data_referencia, c.id_ensaio
     FROM alerta a LEFT JOIN vw_resultado_conformidade c ON c.id_resultado = a.fk_id_resultado`,
  )).rows;
  const calculados = (await db.query(
    `SELECT c.*, EXISTS (SELECT 1 FROM alerta a WHERE a.fk_id_resultado = c.id_resultado AND a.tipo = c.tipo) AS registrado
     FROM vw_alerta_calculado c WHERE ${filtro} ORDER BY data_referencia DESC NULLS LAST LIMIT 5000`,
    params,
  )).rows;
  const f = (r) =>
    (!params[0] || r.tipo === params[0]) && (!params[1] || r.id_ensaio === params[1]) && (!params[2] || r.legislacao === params[2]) &&
    (!params[3] || (r.data_referencia && r.data_referencia >= params[3])) && (!params[4] || (r.data_referencia && r.data_referencia <= params[4]));
  return { registrados: registrados.filter(f), calculados };
}

export async function pendencias(db, p) {
  const { rows } = await db.query(
    `SELECT id_pendencia, tipo, importado, descricao, arquivo_origem, linhas_origem, resolvida, criado_em
     FROM etl.pendencia
     WHERE ($1::text IS NULL OR tipo = $1) AND NOT resolvida
     ORDER BY CASE WHEN importado THEN 1 ELSE 0 END, tipo, arquivo_origem NULLS FIRST, id_pendencia`,
    [texto(p.tipo)],
  );
  return rows;
}
