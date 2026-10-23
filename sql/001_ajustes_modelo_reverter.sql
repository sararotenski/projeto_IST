-- =====================================================================
-- Reversão da migração 001
-- =====================================================================
-- ATENÇÃO: remove as colunas adicionadas (e os valores gravados nelas),
-- o esquema etl (log de importação e pendências) e as views de análise.
-- Os registros importados em LEGISLACAO, CLASSE, ENSAIO e LIMITE permanecem.
-- A volta de ensaio.nome para VARCHAR(30) e de limite.unidade_medida para
-- VARCHAR(10) FALHA (e nada é desfeito) se houver valores maiores — nesse caso
-- a reversão completa exigiria apagar dados e precisa de decisão explícita.
-- Uso: npm run migrar:reverter -- --confirmar
-- =====================================================================

BEGIN;

DROP VIEW IF EXISTS vw_alerta_calculado;
DROP VIEW IF EXISTS vw_historico;
DROP VIEW IF EXISTS vw_resultado_conformidade;
DROP VIEW IF EXISTS vw_limite_detalhado;
DROP FUNCTION IF EXISTS fn_normalizar_unidade(TEXT);
DROP FUNCTION IF EXISTS fn_normalizar_texto(TEXT);

DROP INDEX IF EXISTS ux_alerta_resultado_tipo;
ALTER TABLE e__assoc__1_possui DROP CONSTRAINT IF EXISTS pk_e__assoc__1_possui;
ALTER TABLE resultado DROP COLUMN IF EXISTS unidade_medida;
DROP INDEX IF EXISTS ux_classe_legislacao_nome;
DROP INDEX IF EXISTS ux_legislacao_nome;

ALTER TABLE limite DROP CONSTRAINT IF EXISTS ck_limite_vigencia;
ALTER TABLE limite DROP CONSTRAINT IF EXISTS ck_limite_faixa;
DROP INDEX IF EXISTS ux_limite_chave_natural;
ALTER TABLE limite DROP COLUMN IF EXISTS linhas_origem;
ALTER TABLE limite DROP COLUMN IF EXISTS arquivo_origem;
ALTER TABLE limite DROP COLUMN IF EXISTS observacao_validacao;
ALTER TABLE limite DROP COLUMN IF EXISTS requer_validacao;
ALTER TABLE limite DROP COLUMN IF EXISTS origem_amostra;
ALTER TABLE limite DROP COLUMN IF EXISTS matriz;
ALTER TABLE limite ALTER COLUMN unidade_medida TYPE VARCHAR(10);

DROP INDEX IF EXISTS ux_ensaio_codigo_origem;
ALTER TABLE ensaio DROP COLUMN IF EXISTS codigo_origem;
ALTER TABLE ensaio ALTER COLUMN nome TYPE VARCHAR(30);

DROP SCHEMA IF EXISTS etl CASCADE;

COMMIT;
