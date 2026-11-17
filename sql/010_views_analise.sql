-- =====================================================================
-- 010 — Funções e views de análise (conformidade, histórico, alertas)
-- =====================================================================
-- Requer as migrações 001, 002 e 003. Somente (re)cria funções e views:
-- não altera tabelas nem dados. Uso: npm run migrar -- --confirmar
-- Regras documentadas em documentacao/documentacao.md.
-- A análise de tendência (Mann-Kendall) e de desvios fica em
-- server/analise/tendencia.js, sobre os dados de vw_historico.
-- =====================================================================

BEGIN;

DROP VIEW IF EXISTS vw_alerta_calculado;
DROP VIEW IF EXISTS vw_historico;
DROP VIEW IF EXISTS vw_resultado_conformidade;
DROP VIEW IF EXISTS vw_resultado_portaria;
DROP VIEW IF EXISTS vw_limite_detalhado;

-- Texto para comparação: minúsculas, sem acentos, espaços colapsados.
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

-- Unidade para comparação.
-- - "ug/L" e "μg/L" (mu grego) = "µg/L"; "ppb" = "µg/L" (amostras aquosas).
-- - vazio, "-" e "adimensional" = "adimensional" (pH, razões).
CREATE OR REPLACE FUNCTION fn_normalizar_unidade(u TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
        WHEN u IS NULL THEN NULL
        WHEN lower(btrim(u)) IN ('', '-', 'adimensional') THEN 'adimensional'
        WHEN lower(btrim(u)) = 'ppb' THEN 'µg/l'
        ELSE lower(regexp_replace(replace(btrim(u), 'μ', 'µ'), '^ug/', 'µg/', 'i'))
    END
$$;

-- Fator para converter um valor da unidade "de" para a unidade "para".
-- Somente conversões exatas entre ng/L, µg/L e mg/L. Outras: NULL (incompatível).
CREATE OR REPLACE FUNCTION fn_fator_unidade(de TEXT, para TEXT) RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$
    WITH u AS (SELECT fn_normalizar_unidade(de) AS a, fn_normalizar_unidade(para) AS b),
         escala AS (SELECT * FROM (VALUES ('ng/l', 0.000001::numeric), ('µg/l', 0.001), ('mg/l', 1)) v(un, mg))
    SELECT CASE
        WHEN u.a IS NULL OR u.b IS NULL THEN NULL
        WHEN u.a = u.b THEN 1::numeric
        ELSE (SELECT ea.mg / eb.mg FROM escala ea, escala eb WHERE ea.un = u.a AND eb.un = u.b)
    END
    FROM u
$$;

-- ---------------------------------------------------------------------
-- Limites com nomes de ensaio, legislação e classe
-- ---------------------------------------------------------------------
CREATE VIEW vw_limite_detalhado AS
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
    l.ativo,
    l.motivo_inativacao,
    l.arquivo_origem,
    l.linhas_origem,
    CASE
        WHEN l.valor_minimo IS NULL AND l.valor_maximo IS NULL THEN 'Sem valores'
        WHEN l.valor_maximo IS NULL THEN 'Somente mínimo'
        WHEN l.valor_minimo IS NULL OR l.valor_minimo = 0 THEN 'Somente máximo'
        ELSE 'Faixa (mínimo e máximo)'
    END AS tipo_limite
FROM limite l
JOIN ensaio e      ON e.id_ensaio = l.fk_id_ensaio
JOIN legislacao lg ON lg.id_legislacao = l.fk_id_legislacao
LEFT JOIN classe c ON c.id_classe = l.fk_id_classe;

-- ---------------------------------------------------------------------
-- Conformidade POR PORTARIA: cada resultado × cada legislação avaliada.
-- - Se a amostra tem legislação (via proposta), só ela é avaliada.
-- - Se não tem, o resultado é avaliado em TODAS as legislações cadastradas.
-- - Sem origem/matriz na amostra, aceita qualquer limite da legislação,
--   desde que todos tenham os mesmos valores (senão fica pendente).
-- - Resultado "<X" (abaixo do limite de quantificação) ou ">X":
--   classificado só quando a conclusão é certa; senão "Inconclusivo".
-- Categorias: Dentro dos limites · Acima do limite máximo ·
-- Abaixo do limite mínimo · Inconclusivo · Pendente de validação ·
-- Sem limite aplicável identificado
-- ---------------------------------------------------------------------
CREATE VIEW vw_resultado_portaria AS
WITH res AS (
    SELECT
        r.id_resultado, r.valor, r.qualificador, r.data_resultado,
        r.unidade_medida AS unidade_resultado, r.fk_id_ensaio AS id_ensaio,
        a.origem, a.matriz, a.fk_id_proposta AS id_proposta,
        EXISTS (SELECT 1 FROM e__assoc__1_possui p WHERE p.fk_id_proposta = a.fk_id_proposta) AS legislacao_informada
    FROM resultado r
    LEFT JOIN amostra a ON a.id_amostra = r.fk_id_amostra
),
alvos AS (
    SELECT res.*, lg.id_legislacao, lg.nome AS legislacao
    FROM res
    JOIN legislacao lg ON NOT res.legislacao_informada
                       OR lg.id_legislacao IN (SELECT p.fk_id_legislacao FROM e__assoc__1_possui p WHERE p.fk_id_proposta = res.id_proposta)
),
candidatos AS (
    SELECT a.id_resultado, a.id_legislacao, l.id_limite, l.valor_minimo, l.valor_maximo, fn_normalizar_unidade(l.unidade_medida) AS un
    FROM alvos a
    JOIN limite l ON l.fk_id_ensaio = a.id_ensaio AND l.fk_id_legislacao = a.id_legislacao AND l.ativo
    WHERE (a.origem IS NULL OR l.origem_amostra IS NULL OR fn_normalizar_texto(l.origem_amostra) = fn_normalizar_texto(a.origem))
      AND (a.matriz IS NULL OR l.matriz IS NULL OR fn_normalizar_texto(l.matriz) = fn_normalizar_texto(a.matriz))
      AND (l.data_inicio_vigencia IS NULL OR a.data_resultado IS NULL OR a.data_resultado >= l.data_inicio_vigencia)
      AND (l.data_fim_vigencia    IS NULL OR a.data_resultado IS NULL OR a.data_resultado <= l.data_fim_vigencia)
),
agregado AS (
    SELECT id_resultado, id_legislacao, count(*) AS qtd,
           count(DISTINCT (valor_minimo, valor_maximo, un)) AS variantes, min(id_limite) AS id_limite
    FROM candidatos GROUP BY id_resultado, id_legislacao
),
base AS (
    SELECT a.*, COALESCE(ag.qtd, 0) AS qtd_limites_candidatos, COALESCE(ag.variantes, 0) AS variantes,
           ld.id_limite, ld.classe, ld.valor_minimo, ld.valor_maximo, ld.unidade_medida AS unidade_limite, ld.versao,
           ld.data_inicio_vigencia, ld.data_fim_vigencia, ld.requer_validacao, ld.observacao_validacao,
           fn_fator_unidade(a.unidade_resultado, ld.unidade_medida) AS fator
    FROM alvos a
    LEFT JOIN agregado ag ON ag.id_resultado = a.id_resultado AND ag.id_legislacao = a.id_legislacao
    LEFT JOIN vw_limite_detalhado ld ON ld.id_limite = ag.id_limite AND ag.variantes = 1
),
comparado AS (
    SELECT b.*, b.valor * b.fator AS valor_comparado FROM base b
),
avaliado AS (
    SELECT
        c.*,
        CASE
            WHEN c.valor IS NULL                   THEN 'Valor do resultado ausente'
            WHEN c.id_ensaio IS NULL               THEN 'Ensaio do resultado não identificado'
            WHEN c.qtd_limites_candidatos = 0      THEN NULL
            WHEN c.variantes > 1                   THEN 'Mais de um limite possível nesta legislação (origem, matriz ou classe não informada)'
            WHEN c.data_resultado IS NULL          THEN 'Data do resultado ausente'
            WHEN c.unidade_resultado IS NULL OR c.unidade_limite IS NULL THEN 'Unidade não informada no resultado ou no limite'
            WHEN c.fator IS NULL                   THEN 'Unidades incompatíveis (sem conversão validada)'
            WHEN c.valor_minimo IS NULL AND c.valor_maximo IS NULL THEN 'Limite sem valores'
            WHEN c.requer_validacao                THEN COALESCE(c.observacao_validacao, 'Limite marcado para validação')
            WHEN c.data_inicio_vigencia IS NULL AND c.data_fim_vigencia IS NULL THEN 'Vigência do limite não informada'
        END AS motivo_pendencia,
        CASE
            WHEN c.valor_comparado IS NULL OR c.variantes <> 1 THEN NULL
            WHEN c.valor_minimo IS NULL AND c.valor_maximo IS NULL THEN NULL
            WHEN c.qualificador = '<' THEN CASE
                WHEN c.valor_maximo IS NOT NULL AND c.valor_comparado > c.valor_maximo THEN 'Inconclusivo'
                WHEN c.valor_minimo > 0 AND c.valor_comparado <= c.valor_minimo THEN 'Abaixo do limite mínimo'
                WHEN c.valor_minimo > 0 THEN 'Inconclusivo'
                ELSE 'Dentro dos limites' END
            WHEN c.qualificador = '>' THEN CASE
                WHEN c.valor_maximo IS NOT NULL AND c.valor_comparado >= c.valor_maximo THEN 'Acima do limite máximo'
                WHEN c.valor_maximo IS NOT NULL THEN 'Inconclusivo'
                WHEN c.valor_minimo > 0 AND c.valor_comparado < c.valor_minimo THEN 'Inconclusivo'
                ELSE 'Dentro dos limites' END
            WHEN c.valor_minimo IS NOT NULL AND c.valor_comparado < c.valor_minimo THEN 'Abaixo do limite mínimo'
            WHEN c.valor_maximo IS NOT NULL AND c.valor_comparado > c.valor_maximo THEN 'Acima do limite máximo'
            ELSE 'Dentro dos limites'
        END AS classificacao_indicativa,
        CASE WHEN c.valor_comparado IS NOT NULL AND c.valor_maximo > 0
             THEN round(c.valor_comparado / c.valor_maximo * 100, 1) END AS percentual_do_maximo
    FROM comparado c
)
SELECT
    a.id_resultado, a.id_legislacao, a.legislacao, a.legislacao_informada,
    a.qtd_limites_candidatos, a.id_limite, a.classe, a.valor_minimo, a.valor_maximo, a.unidade_limite,
    a.versao, a.data_inicio_vigencia, a.data_fim_vigencia, a.requer_validacao, a.observacao_validacao,
    a.valor_comparado, a.percentual_do_maximo, a.classificacao_indicativa,
    a.motivo_pendencia,
    CASE WHEN a.motivo_pendencia IS NULL AND a.classificacao_indicativa = 'Inconclusivo'
         THEN CASE WHEN a.qualificador = '<'
                   THEN 'Limite de quantificação do método maior que o limite permitido: não é possível concluir'
                   ELSE 'Resultado acima da faixa do método, mas abaixo do máximo: não é possível concluir' END
    END AS motivo_inconclusivo,
    CASE
        WHEN a.motivo_pendencia IS NOT NULL THEN 'Pendente de validação'
        WHEN a.qtd_limites_candidatos = 0    THEN 'Sem limite aplicável identificado'
        ELSE a.classificacao_indicativa
    END AS categoria
FROM avaliado a;

-- ---------------------------------------------------------------------
-- Conformidade por resultado (resumo de todas as portarias avaliadas).
-- A classificação geral é a mais grave entre as portarias:
-- Acima > Abaixo > Inconclusivo > Pendente > Dentro > Sem limite.
-- "portarias" traz a classificação em cada legislação (JSON).
-- ---------------------------------------------------------------------
CREATE VIEW vw_resultado_conformidade AS
WITH prioridade AS (
    SELECT p.*,
           CASE p.categoria
               WHEN 'Acima do limite máximo'  THEN 1
               WHEN 'Abaixo do limite mínimo' THEN 2
               WHEN 'Inconclusivo'            THEN 3
               WHEN 'Pendente de validação'   THEN 4
               WHEN 'Dentro dos limites'      THEN 5
               ELSE 6
           END AS ordem
    FROM vw_resultado_portaria p
),
decisiva AS (
    SELECT DISTINCT ON (id_resultado) * FROM prioridade ORDER BY id_resultado, ordem, legislacao
),
todas AS (
    SELECT id_resultado,
           jsonb_object_agg(legislacao, jsonb_build_object(
               'categoria', categoria, 'minimo', valor_minimo, 'maximo', valor_maximo, 'unidade', unidade_limite,
               'motivo', COALESCE(motivo_inconclusivo, motivo_pendencia))) AS portarias,
           count(*) FILTER (WHERE qtd_limites_candidatos > 0) AS portarias_com_limite
    FROM vw_resultado_portaria GROUP BY id_resultado
)
SELECT
    r.id_resultado,
    r.valor,
    r.qualificador,
    r.valor_original,
    r.data_resultado,
    r.unidade_medida AS unidade_resultado,
    r.fk_id_ensaio   AS id_ensaio,
    e.codigo_origem  AS codigo_ensaio,
    e.nome           AS ensaio,
    r.fk_id_amostra  AS id_amostra,
    a.codigo_amostra,
    a.ponto_coleta,
    COALESCE(r.id_lote, a.id_lote) AS id_lote,
    a.data_coleta,
    a.origem,
    a.matriz,
    a.fk_id_cliente  AS id_cliente,
    a.fk_id_proposta AS id_proposta,
    d.legislacao_informada,
    d.qtd_limites_candidatos,
    CASE WHEN d.qtd_limites_candidatos > 0 THEN d.legislacao END AS legislacao,
    d.id_limite, d.classe, d.valor_minimo, d.valor_maximo, d.unidade_limite, d.versao,
    d.data_inicio_vigencia, d.data_fim_vigencia, d.requer_validacao, d.observacao_validacao,
    d.valor_comparado, d.percentual_do_maximo, d.classificacao_indicativa,
    d.motivo_pendencia, d.motivo_inconclusivo,
    t.portarias, t.portarias_com_limite,
    COALESCE(d.categoria, 'Sem limite aplicável identificado') AS categoria
FROM resultado r
LEFT JOIN amostra a  ON a.id_amostra = r.fk_id_amostra
LEFT JOIN ensaio e   ON e.id_ensaio = r.fk_id_ensaio
LEFT JOIN decisiva d ON d.id_resultado = r.id_resultado
LEFT JOIN todas t    ON t.id_resultado = r.id_resultado;

-- ---------------------------------------------------------------------
-- Histórico: séries por PONTO DE COLETA + ensaio + unidade.
-- Resultados sem ponto de coleta não formam série (não há como saber se
-- duas amostras vêm do mesmo local).
-- Resultados "<LQ" entram na série com o valor do limite de quantificação.
-- ---------------------------------------------------------------------
CREATE VIEW vw_historico AS
WITH pontos AS (
    SELECT
        c.*,
        TRUE AS serie_validada,
        concat_ws(' | ',
            'Ponto ' || c.ponto_coleta,
            COALESCE(c.ensaio, c.id_ensaio::text) || ' (cód. ' || COALESCE(c.codigo_ensaio, '?') || ')',
            COALESCE(fn_normalizar_unidade(c.unidade_resultado), 'unidade ?')
        ) AS serie,
        c.categoria IN ('Acima do limite máximo', 'Abaixo do limite mínimo') AS fora_limite
    FROM vw_resultado_conformidade c
    WHERE c.valor IS NOT NULL AND c.data_resultado IS NOT NULL AND c.id_ensaio IS NOT NULL
      AND c.ponto_coleta IS NOT NULL
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
    (j.fora_limite AND COALESCE(j.fora_limite_anterior, FALSE)) AS recorrencia_fora_limite
FROM janela j;

-- ---------------------------------------------------------------------
-- Alertas de conformidade (critérios explícitos; todos exigem avaliação
-- profissional). Tendência e desvio: server/analise/tendencia.js.
-- ---------------------------------------------------------------------
CREATE VIEW vw_alerta_calculado AS
SELECT c.id_resultado, 'ACIMA_MAXIMO'::varchar(20) AS tipo,
       left(format('%s: %s%s %s acima do máximo %s %s (%s)', c.ensaio, COALESCE(c.qualificador, ''), c.valor, c.unidade_resultado,
                   c.valor_maximo, c.unidade_limite, c.legislacao), 250) AS descricao,
       c.data_resultado AS data_referencia, c.id_ensaio, c.legislacao, TRUE AS requer_avaliacao_profissional
FROM vw_resultado_conformidade c WHERE c.categoria = 'Acima do limite máximo'
UNION ALL
SELECT c.id_resultado, 'ABAIXO_MINIMO',
       left(format('%s: %s%s %s abaixo do mínimo %s %s (%s)', c.ensaio, COALESCE(c.qualificador, ''), c.valor, c.unidade_resultado,
                   c.valor_minimo, c.unidade_limite, c.legislacao), 250),
       c.data_resultado, c.id_ensaio, c.legislacao, TRUE
FROM vw_resultado_conformidade c WHERE c.categoria = 'Abaixo do limite mínimo'
UNION ALL
SELECT c.id_resultado, 'INCONCLUSIVO',
       left(format('%s: %s%s %s — %s (%s)', c.ensaio, COALESCE(c.qualificador, ''), c.valor, c.unidade_resultado,
                   c.motivo_inconclusivo, c.legislacao), 250),
       c.data_resultado, c.id_ensaio, c.legislacao, TRUE
FROM vw_resultado_conformidade c WHERE c.categoria = 'Inconclusivo'
UNION ALL
SELECT h.id_resultado, 'RECORRENCIA',
       left(format('%s: segundo resultado consecutivo fora do limite (anterior em %s)', h.ensaio, h.data_anterior), 250),
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
