-- Reversão da migração 002 (remove colunas/tabelas adicionadas e seus dados).
-- Os valores corrigidos pela curadoria permanecem em LIMITE; os valores
-- anteriores ficam registrados em etl.decisao_curadoria até esta reversão.
-- Execute antes a reversão das views (o 001_reverter já remove as views).

BEGIN;

DROP VIEW IF EXISTS vw_alerta_calculado;
DROP VIEW IF EXISTS vw_historico;
DROP VIEW IF EXISTS vw_resultado_conformidade;
DROP VIEW IF EXISTS vw_limite_detalhado;

ALTER TABLE etl.pendencia DROP COLUMN IF EXISTS resolucao;
DROP TABLE IF EXISTS etl.decisao_curadoria;
DROP TABLE IF EXISTS etl.lote_resultados;
DROP INDEX IF EXISTS ux_resultado_amostra_ensaio;
DROP INDEX IF EXISTS ux_amostra_codigo;
ALTER TABLE amostra DROP COLUMN IF EXISTS id_lote;
ALTER TABLE amostra DROP COLUMN IF EXISTS ponto_coleta;
ALTER TABLE amostra DROP COLUMN IF EXISTS codigo_amostra;
ALTER TABLE limite DROP COLUMN IF EXISTS motivo_inativacao;
ALTER TABLE limite DROP COLUMN IF EXISTS ativo;
DELETE FROM etl.migracao WHERE nome = '002_resultados_curadoria';

COMMIT;
