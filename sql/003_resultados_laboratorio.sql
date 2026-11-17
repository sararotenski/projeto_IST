-- =====================================================================
-- Migração 003 — resultados exportados pelo sistema do laboratório
-- =====================================================================
-- Aditiva e idempotente (reaplicada a cada "npm run migrar").
-- Reverter: sql/003_resultados_laboratorio_reverter.sql
-- =====================================================================

BEGIN;

-- Resultado censurado: "<0,10" é gravado como valor 0.10 com qualificador "<"
-- (valor real abaixo do limite de quantificação). ">" para acima da faixa.
ALTER TABLE resultado ADD COLUMN IF NOT EXISTS qualificador VARCHAR(1);
ALTER TABLE resultado DROP CONSTRAINT IF EXISTS ck_resultado_qualificador;
ALTER TABLE resultado ADD CONSTRAINT ck_resultado_qualificador CHECK (qualificador IS NULL OR qualificador IN ('<', '>'));

-- Texto exatamente como veio do arquivo (rastreabilidade)
ALTER TABLE resultado ADD COLUMN IF NOT EXISTS valor_original VARCHAR(40);

-- Lote que lançou o resultado (um lote pode acrescentar resultados a uma
-- amostra que já existia; desfazer o lote remove só o que ele lançou)
ALTER TABLE resultado ADD COLUMN IF NOT EXISTS id_lote INT;
UPDATE resultado r SET id_lote = a.id_lote FROM amostra a
 WHERE r.id_lote IS NULL AND a.id_amostra = r.fk_id_amostra AND a.id_lote IS NOT NULL;

-- Nova origem de lote: exportação do sistema do laboratório
ALTER TABLE etl.lote_resultados DROP CONSTRAINT IF EXISTS lote_resultados_origem_check;
ALTER TABLE etl.lote_resultados ADD CONSTRAINT lote_resultados_origem_check
    CHECK (origem IN ('csv', 'formulario', 'laboratorio'));
ALTER TABLE etl.lote_resultados ADD COLUMN IF NOT EXISTS relatorio JSONB;

INSERT INTO etl.migracao (nome) VALUES ('003_resultados_laboratorio') ON CONFLICT DO NOTHING;

COMMIT;
