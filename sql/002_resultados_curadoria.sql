-- =====================================================================
-- Migração 002 — registro de resultados pelo site e curadoria dos limites
-- =====================================================================
-- Aditiva (nenhuma coluna ou registro existente é removido) e idempotente:
-- é reaplicada a cada "npm run migrar" para incorporar acréscimos.
-- Uso: npm run migrar -- --confirmar
-- Reverter: sql/002_resultados_curadoria_reverter.sql
-- =====================================================================

BEGIN;

-- LIMITE: permite desativar um limite que não se aplica (ex.: a legislação não
-- define VMP para aquele parâmetro) sem apagar o registro original.
ALTER TABLE limite ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE limite ADD COLUMN IF NOT EXISTS motivo_inativacao VARCHAR(250);

-- AMOSTRA: identificação do laboratório e ponto de coleta.
-- O ponto de coleta define as séries históricas (tendências) de forma
-- tecnicamente válida: mesmo ponto + mesmo ensaio + mesma unidade.
ALTER TABLE amostra ADD COLUMN IF NOT EXISTS codigo_amostra VARCHAR(40);
ALTER TABLE amostra ADD COLUMN IF NOT EXISTS ponto_coleta VARCHAR(80);
ALTER TABLE amostra ADD COLUMN IF NOT EXISTS id_lote INT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_amostra_codigo ON amostra (codigo_amostra) WHERE codigo_amostra IS NOT NULL;

-- Um resultado por amostra e ensaio (evita lançamento em duplicidade)
CREATE UNIQUE INDEX IF NOT EXISTS ux_resultado_amostra_ensaio ON resultado (fk_id_amostra, fk_id_ensaio);

-- Lotes de lançamento de resultados (CSV ou formulário): permitem rastrear e
-- desfazer um lançamento inteiro feito por engano.
CREATE TABLE IF NOT EXISTS etl.lote_resultados (
    id_lote        SERIAL PRIMARY KEY,
    origem         VARCHAR(20) NOT NULL CHECK (origem IN ('csv', 'formulario')),
    arquivo        VARCHAR(200),
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    qtd_amostras   INT NOT NULL DEFAULT 0,
    qtd_resultados INT NOT NULL DEFAULT 0,
    desfeito_em    TIMESTAMPTZ
);
-- clientes e propostas criados pelo lote (removidos ao desfazer, se ficarem sem uso)
ALTER TABLE etl.lote_resultados ADD COLUMN IF NOT EXISTS criados JSONB;

-- Decisões de curadoria aplicadas aos limites (trilha de auditoria)
CREATE TABLE IF NOT EXISTS etl.decisao_curadoria (
    id_decisao  SERIAL PRIMARY KEY,
    chave       VARCHAR(120) NOT NULL UNIQUE,
    tipo        VARCHAR(40) NOT NULL,
    descricao   TEXT NOT NULL,
    fonte       TEXT NOT NULL,
    id_limite   INT,
    antes       JSONB,
    depois      JSONB,
    aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE etl.pendencia ADD COLUMN IF NOT EXISTS resolucao TEXT;

INSERT INTO etl.migracao (nome) VALUES ('002_resultados_curadoria') ON CONFLICT DO NOTHING;

COMMIT;
