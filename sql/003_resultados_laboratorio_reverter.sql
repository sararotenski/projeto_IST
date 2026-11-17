-- Reversão da migração 003. Remove as colunas adicionadas e seus valores.
-- Falha se houver lotes com origem 'laboratorio' (desfaça e apague-os antes).
BEGIN;

DROP VIEW IF EXISTS vw_alerta_calculado;
DROP VIEW IF EXISTS vw_historico;
DROP VIEW IF EXISTS vw_resultado_conformidade;
DROP VIEW IF EXISTS vw_resultado_portaria;
DROP FUNCTION IF EXISTS fn_fator_unidade(TEXT, TEXT);

ALTER TABLE etl.lote_resultados DROP COLUMN IF EXISTS relatorio;
ALTER TABLE etl.lote_resultados DROP CONSTRAINT IF EXISTS lote_resultados_origem_check;
ALTER TABLE etl.lote_resultados ADD CONSTRAINT lote_resultados_origem_check CHECK (origem IN ('csv', 'formulario'));
ALTER TABLE resultado DROP COLUMN IF EXISTS id_lote;
ALTER TABLE resultado DROP COLUMN IF EXISTS valor_original;
ALTER TABLE resultado DROP CONSTRAINT IF EXISTS ck_resultado_qualificador;
ALTER TABLE resultado DROP COLUMN IF EXISTS qualificador;
DELETE FROM etl.migracao WHERE nome = '003_resultados_laboratorio';

COMMIT;
