-- =====================================================================
-- 010 — Funções e views de análise (conformidade, histórico, alertas)
-- =====================================================================
-- Requer a migração 001. Somente cria/substitui funções e views:
-- não altera tabelas nem dados. Uso: npm run migrar -- --confirmar
-- Regras documentadas em documentacao/documentacao.md ("Regras de análise").
-- =====================================================================

BEGIN;

-- Texto para comparação: minúsculas, sem acentos, espaços colapsados.
-- Usado para casar a origem/matriz da amostra com a do limite
-- (ex.: "Agua Tratada" = "Água Tratada"). Não unifica nomes diferentes.
CREATE OR REPLACE FUNCTION fn_normalizar_texto(t TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    -- translate antes de lower: com locale "C", lower() não altera letras acentuadas.
    SELECT NULLIF(
        lower(translate(
            btrim(regexp_replace(t, '\s+', ' ', 'g')),
            'áàâãäÁÀÂÃÄéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇ',
            'aaaaaAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcC'
        )), '')
$$;

-- Unidade para comparação: "ug/L" e "μg/L" (mu grego) = "µg/L".
-- Não converte unidades diferentes (ex.: ppb ≠ µg/L para fins de comparação).
CREATE OR REPLACE FUNCTION fn_normalizar_unidade(u TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT NULLIF(
        lower(regexp_replace(replace(btrim(u), 'μ', 'µ'), '^ug/', 'µg/', 'i')),
        '')
$$;

-- ---------------------------------------------------------------------
-- Limites com nomes de ensaio, legislação e classe
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_limite_detalhado AS
SELECT
    l.id_limite,
    l.fk_id_ensaio        AS id_ensaio,
    e.codigo_origem       AS codigo_ensaio,
    e.nome                AS ensaio,
    l.fk_id_legislacao    AS id_legislacao,
    lg.nome               AS legislacao,
    l.fk_id_classe        AS id_classe,
    c.nome                AS classe,
    l.matriz,
    l.origem_amostra,
    l.valor_minimo,
    l.valor_maximo,
    l.unidade_medida,
    l.versao,
    l.data_inicio_vigencia,
    l.data_fim_vigencia,
    l.requer_validacao,
    l.observacao_validacao,
    l.arquivo_origem,
    l.linhas_origem,
    CASE
        WHEN l.valor_minimo IS NULL AND l.valor_maximo IS NULL THEN 'Sem valores'
        WHEN l.valor_maximo IS NULL THEN 'Somente mínimo'
        WHEN l.valor_minimo IS NULL OR l.valor_minimo = 0 THEN 'Somente máximo'
        ELSE 'Faixa (mínimo e máximo)'
    END AS tipo_limite
FROM limite l
JOIN ensaio e     ON e.id_ensaio = l.fk_id_ensaio
JOIN legislacao lg ON lg.id_legislacao = l.fk_id_legislacao
LEFT JOIN classe c ON c.id_classe = l.fk_id_classe;

-- ---------------------------------------------------------------------
-- Conformidade: cada resultado × limite aplicável
-- Categorias: Dentro dos limites · Abaixo do limite mínimo ·
-- Acima do limite máximo · Sem limite aplicável identificado ·
-- Pendente de validação
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_resultado_conformidade AS
WITH res AS (
    SELECT
        r.id_resultado,
        r.valor,
        r.data_resultado,
        r.unidade_medida AS unidade_resultado,
        r.fk_id_ensaio   AS id_ensaio,
        e.codigo_origem  AS codigo_ensaio,
        e.nome           AS ensaio,
        r.fk_id_amostra  AS id_amostra,
        a.data_coleta,
        a.origem,
        a.matriz,
        a.fk_id_cliente  AS id_cliente,
        a.fk_id_proposta AS id_proposta,
        (SELECT count(*) FROM e__assoc__1_possui p WHERE p.fk_id_proposta = a.fk_id_proposta) AS qtd_legislacoes
    FROM resultado r
    LEFT JOIN amostra a ON a.id_amostra = r.fk_id_amostra
    LEFT JOIN ensaio e  ON e.id_ensaio = r.fk_id_ensaio
),
candidatos AS (
    SELECT res.id_resultado, l.id_limite
    FROM res
    JOIN limite l ON l.fk_id_ensaio = res.id_ensaio
    WHERE l.fk_id_legislacao IN (
            SELECT p.fk_id_legislacao FROM e__assoc__1_possui p WHERE p.fk_id_proposta = res.id_proposta)
      AND (res.origem IS NULL OR l.origem_amostra IS NULL
           OR fn_normalizar_texto(l.origem_amostra) = fn_normalizar_texto(res.origem))
      AND (res.matriz IS NULL OR l.matriz IS NULL
           OR fn_normalizar_texto(l.matriz) = fn_normalizar_texto(res.matriz))
      AND (l.data_inicio_vigencia IS NULL OR res.data_resultado IS NULL OR res.data_resultado >= l.data_inicio_vigencia)
      AND (l.data_fim_vigencia    IS NULL OR res.data_resultado IS NULL OR res.data_resultado <= l.data_fim_vigencia)
),
agregado AS (
    SELECT id_resultado, count(*) AS qtd_limites, min(id_limite) AS id_limite
    FROM candidatos GROUP BY id_resultado
),
base AS (
    SELECT
        res.*,
        COALESCE(ag.qtd_limites, 0) AS qtd_limites_candidatos,
        ld.id_limite,
        ld.legislacao,
        ld.classe,
        ld.valor_minimo,
        ld.valor_maximo,
        ld.unidade_medida AS unidade_limite,
        ld.versao,
        ld.data_inicio_vigencia,
        ld.data_fim_vigencia,
        ld.requer_validacao,
        ld.observacao_validacao
    FROM res
    LEFT JOIN agregado ag ON ag.id_resultado = res.id_resultado
    LEFT JOIN vw_limite_detalhado ld ON ld.id_limite = ag.id_limite AND ag.qtd_limites = 1
),
avaliado AS (
    SELECT
        b.*,
        CASE
            WHEN b.valor IS NULL                        THEN 'Valor do resultado ausente'
            WHEN b.id_ensaio IS NULL                    THEN 'Ensaio do resultado não identificado'
            WHEN b.qtd_legislacoes = 0                  THEN 'Legislação aplicável à amostra não identificada'
            WHEN b.qtd_limites_candidatos = 0           THEN NULL
            WHEN b.qtd_limites_candidatos > 1           THEN 'Mais de um limite candidato (origem, matriz, classe ou legislação ambígua)'
            WHEN b.data_resultado IS NULL               THEN 'Data do resultado ausente'
            WHEN b.unidade_resultado IS NULL OR b.unidade_limite IS NULL THEN 'Unidade não informada no resultado ou no limite'
            WHEN fn_normalizar_unidade(b.unidade_resultado) <> fn_normalizar_unidade(b.unidade_limite)
                                                        THEN 'Unidades incompatíveis (sem conversão validada)'
            WHEN b.valor_minimo IS NULL AND b.valor_maximo IS NULL THEN 'Limite sem valores'
            WHEN b.requer_validacao                     THEN COALESCE(b.observacao_validacao, 'Limite marcado para validação')
            WHEN b.data_inicio_vigencia IS NULL AND b.data_fim_vigencia IS NULL
                                                        THEN 'Vigência do limite não informada'
        END AS motivo_pendencia,
        CASE
            WHEN b.valor IS NULL OR b.qtd_limites_candidatos <> 1 THEN NULL
            WHEN b.unidade_resultado IS NULL OR b.unidade_limite IS NULL
              OR fn_normalizar_unidade(b.unidade_resultado) <> fn_normalizar_unidade(b.unidade_limite) THEN NULL
            WHEN b.valor_minimo IS NULL AND b.valor_maximo IS NULL THEN NULL
            WHEN b.valor_minimo IS NOT NULL AND b.valor < b.valor_minimo THEN 'Abaixo do limite mínimo'
            WHEN b.valor_maximo IS NOT NULL AND b.valor > b.valor_maximo THEN 'Acima do limite máximo'
            ELSE 'Dentro dos limites'
        END AS classificacao_indicativa
    FROM base b
)
SELECT
    a.*,
    CASE
        WHEN a.motivo_pendencia IS NOT NULL THEN 'Pendente de validação'
        WHEN a.qtd_limites_candidatos = 0    THEN 'Sem limite aplicável identificado'
        ELSE a.classificacao_indicativa
    END AS categoria
FROM avaliado a;

-- ---------------------------------------------------------------------
-- Histórico: séries por cliente + origem + matriz + ensaio + unidade.
-- A chave de série é PROVISÓRIA e precisa de validação técnica
-- (não há no modelo um identificador de ponto de coleta).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_historico AS
WITH pontos AS (
    SELECT
        c.*,
        concat_ws(' | ',
            'cliente ' || COALESCE(c.id_cliente::text, '?'),
            COALESCE(c.origem, 'origem ?'),
            COALESCE(c.matriz, 'matriz ?'),
            COALESCE(c.codigo_ensaio, c.id_ensaio::text),
            COALESCE(fn_normalizar_unidade(c.unidade_resultado), 'unidade ?')
        ) AS serie,
        c.categoria IN ('Acima do limite máximo', 'Abaixo do limite mínimo') AS fora_limite
    FROM vw_resultado_conformidade c
    WHERE c.valor IS NOT NULL AND c.data_resultado IS NOT NULL AND c.id_ensaio IS NOT NULL
),
janela AS (
    SELECT
        p.*,
        count(*)     OVER w_total AS qtd_pontos_serie,
        row_number() OVER w       AS posicao,
        lag(p.valor)          OVER w AS valor_anterior,
        lag(p.data_resultado) OVER w AS data_anterior,
        lag(p.fora_limite)    OVER w AS fora_limite_anterior
    FROM pontos p
    WINDOW w AS (PARTITION BY p.serie ORDER BY p.data_resultado, p.id_resultado),
           w_total AS (PARTITION BY p.serie)
)
SELECT
    j.*,
    j.valor - j.valor_anterior AS variacao_absoluta,
    CASE WHEN j.valor_anterior IS NOT NULL AND j.valor_anterior <> 0
         THEN round((j.valor - j.valor_anterior) / abs(j.valor_anterior) * 100, 2) END AS variacao_percentual,
    CASE
        WHEN j.valor_anterior IS NULL       THEN NULL
        WHEN j.valor > j.valor_anterior     THEN 'Aumento'
        WHEN j.valor < j.valor_anterior     THEN 'Redução'
        ELSE 'Sem variação'
    END AS direcao,
    (j.fora_limite AND COALESCE(j.fora_limite_anterior, FALSE)) AS recorrencia_fora_limite,
    (j.qtd_pontos_serie >= 3) AS serie_suficiente
FROM janela j;

-- ---------------------------------------------------------------------
-- Alertas calculados (critérios explícitos; todos exigem avaliação profissional)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_alerta_calculado AS
SELECT c.id_resultado, 'ACIMA_MAXIMO'::varchar(20) AS tipo,
       left(format('%s: %s %s acima do máximo %s %s (%s)', c.ensaio, c.valor, c.unidade_resultado,
                   c.valor_maximo, c.unidade_limite, c.legislacao), 250) AS descricao,
       c.data_resultado AS data_referencia, c.id_ensaio, c.legislacao, TRUE AS requer_avaliacao_profissional
FROM vw_resultado_conformidade c WHERE c.categoria = 'Acima do limite máximo'
UNION ALL
SELECT c.id_resultado, 'ABAIXO_MINIMO',
       left(format('%s: %s %s abaixo do mínimo %s %s (%s)', c.ensaio, c.valor, c.unidade_resultado,
                   c.valor_minimo, c.unidade_limite, c.legislacao), 250),
       c.data_resultado, c.id_ensaio, c.legislacao, TRUE
FROM vw_resultado_conformidade c WHERE c.categoria = 'Abaixo do limite mínimo'
UNION ALL
SELECT h.id_resultado, 'RECORRENCIA',
       left(format('%s: segundo resultado consecutivo fora do limite na série "%s" (anterior em %s)',
                   h.ensaio, h.serie, h.data_anterior), 250),
       h.data_resultado, h.id_ensaio, h.legislacao, TRUE
FROM vw_historico h WHERE h.recorrencia_fora_limite
UNION ALL
SELECT c.id_resultado, 'PENDENTE_VALIDACAO',
       left(format('%s: comparação não realizada — %s', COALESCE(c.ensaio, 'ensaio ?'), c.motivo_pendencia), 250),
       c.data_resultado, c.id_ensaio, c.legislacao, TRUE
FROM vw_resultado_conformidade c WHERE c.categoria = 'Pendente de validação';

INSERT INTO etl.migracao (nome) VALUES ('010_views_analise')
ON CONFLICT (nome) DO UPDATE SET aplicada_em = now();

COMMIT;
