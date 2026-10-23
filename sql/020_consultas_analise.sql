-- =====================================================================
-- 020 — Consultas de análise (exemplos documentados, somente leitura)
-- Requer 001 e 010. Execute trechos isolados no pgAdmin ou psql.
-- =====================================================================

-- 1. Limites de um ensaio em todas as legislações e origens
SELECT legislacao, origem_amostra, classe, valor_minimo, valor_maximo, unidade_medida, tipo_limite, requer_validacao
FROM vw_limite_detalhado
WHERE ensaio ILIKE 'Chumbo'
ORDER BY legislacao, origem_amostra;

-- 2. Ensaios cujo máximo difere entre origens da mesma legislação (mesma unidade)
SELECT legislacao, codigo_ensaio, ensaio, unidade_medida,
       min(valor_maximo) AS menor_maximo, max(valor_maximo) AS maior_maximo,
       string_agg(origem_amostra || ': ' || valor_maximo, ' | ' ORDER BY origem_amostra) AS detalhe
FROM vw_limite_detalhado
GROUP BY legislacao, codigo_ensaio, ensaio, unidade_medida
HAVING count(DISTINCT valor_maximo) > 1
ORDER BY legislacao, ensaio;

-- 3. Limites que precisam de validação humana
SELECT legislacao, origem_amostra, codigo_ensaio, ensaio, valor_minimo, valor_maximo, unidade_medida,
       observacao_validacao, arquivo_origem, linhas_origem
FROM vw_limite_detalhado WHERE requer_validacao ORDER BY legislacao, ensaio;

-- 4. Itens rejeitados na importação (não estão em LIMITE)
SELECT tipo, descricao, arquivo_origem, linhas_origem
FROM etl.pendencia WHERE NOT importado AND NOT resolvida ORDER BY tipo, arquivo_origem;

-- 5. Resultados de uma amostra com a classificação
SELECT data_resultado, ensaio, valor, unidade_resultado, valor_minimo, valor_maximo, unidade_limite,
       categoria, motivo_pendencia, classificacao_indicativa
FROM vw_resultado_conformidade WHERE id_amostra = 1 ORDER BY ensaio;

-- 6. Distribuição das classificações por legislação e classe
SELECT COALESCE(legislacao, '(não determinada)') AS legislacao, COALESCE(classe, 'Sem classe') AS classe,
       categoria, count(*) AS resultados
FROM vw_resultado_conformidade GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- 7. Comparação entre datas: variações por série
SELECT serie, data_anterior, valor_anterior, data_resultado, valor, variacao_absoluta, variacao_percentual,
       direcao, serie_suficiente
FROM vw_historico WHERE valor_anterior IS NOT NULL ORDER BY serie, posicao;

-- 8. Recorrências (resultados consecutivos fora do limite)
SELECT serie, data_resultado, valor, categoria FROM vw_historico WHERE recorrencia_fora_limite ORDER BY serie, data_resultado;

-- 9. Séries insuficientes para descrever evolução
SELECT serie, max(qtd_pontos_serie) AS pontos FROM vw_historico WHERE NOT serie_suficiente GROUP BY serie;

-- 10. Alertas calculados ainda não gravados em ALERTA
SELECT c.* FROM vw_alerta_calculado c
WHERE NOT EXISTS (SELECT 1 FROM alerta a WHERE a.fk_id_resultado = c.id_resultado AND a.tipo = c.tipo);

-- 11. Histórico das importações
SELECT id_execucao, iniciado_em, finalizado_em, status, resumo->'limite' AS limites, erro
FROM etl.execucao_importacao ORDER BY id_execucao DESC;
