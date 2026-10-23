-- =====================================================================
-- Migração 001 — ajustes mínimos no modelo para receber os dados reais
-- =====================================================================
-- APLICAR SOMENTE COM AUTORIZAÇÃO. Uso: npm run migrar -- --confirmar
-- Reverter: npm run migrar:reverter -- --confirmar (sql/001_ajustes_modelo_reverter.sql)
--
-- Todas as alterações são aditivas: nenhuma tabela, coluna ou registro existente
-- é removido. Restrições novas que poderiam falhar com dados preexistentes
-- (CHECK) são criadas como NOT VALID. Se qualquer comando falhar, a transação
-- inteira é desfeita.
--
-- Justificativa de cada item: documentacao/documentacao.md, seção
-- "Inconsistências do modelo e migração 001".
-- =====================================================================

BEGIN;

-- Esquema separado para controle da importação (não mistura com o modelo aprovado)
CREATE SCHEMA IF NOT EXISTS etl;

-- ---------------------------------------------------------------------
-- ENSAIO
-- (1) nome VARCHAR(30) não comporta os nomes reais (até 106 caracteres).
-- (2) o código do ensaio no sistema do laboratório é necessário para
--     rastreabilidade e para a importação ser idempotente.
-- ---------------------------------------------------------------------
ALTER TABLE ensaio ALTER COLUMN nome TYPE VARCHAR(150);
ALTER TABLE ensaio ADD COLUMN IF NOT EXISTS codigo_origem VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS ux_ensaio_codigo_origem ON ensaio (codigo_origem);

-- ---------------------------------------------------------------------
-- LIMITE
-- (3) unidade_medida VARCHAR(10) não comporta "Aus/Pres em 100mL" (17).
-- (4) os limites variam pela origem da amostra (consumo humano, tratada,
--     subterrânea, superficial) e pela matriz, informação ausente no modelo.
-- (5) rastreabilidade: arquivo e linhas de origem.
-- (6) marcação de limites que exigem validação humana.
-- (7) chave natural para evitar duplicidade e permitir reexecução.
-- (8) coerência de faixa e de vigência.
-- ---------------------------------------------------------------------
ALTER TABLE limite ALTER COLUMN unidade_medida TYPE VARCHAR(30);
ALTER TABLE limite ADD COLUMN IF NOT EXISTS matriz VARCHAR(30);
ALTER TABLE limite ADD COLUMN IF NOT EXISTS origem_amostra VARCHAR(60);
ALTER TABLE limite ADD COLUMN IF NOT EXISTS requer_validacao BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE limite ADD COLUMN IF NOT EXISTS observacao_validacao VARCHAR(250);
ALTER TABLE limite ADD COLUMN IF NOT EXISTS arquivo_origem VARCHAR(120);
ALTER TABLE limite ADD COLUMN IF NOT EXISTS linhas_origem VARCHAR(250);

CREATE UNIQUE INDEX IF NOT EXISTS ux_limite_chave_natural ON limite (
    fk_id_ensaio,
    fk_id_legislacao,
    COALESCE(fk_id_classe, -1),
    COALESCE(matriz, ''),
    COALESCE(origem_amostra, ''),
    COALESCE(versao, 1)
);

ALTER TABLE limite DROP CONSTRAINT IF EXISTS ck_limite_faixa;
ALTER TABLE limite ADD CONSTRAINT ck_limite_faixa
    CHECK (valor_minimo IS NULL OR valor_maximo IS NULL OR valor_minimo <= valor_maximo) NOT VALID;

ALTER TABLE limite DROP CONSTRAINT IF EXISTS ck_limite_vigencia;
ALTER TABLE limite ADD CONSTRAINT ck_limite_vigencia
    CHECK (data_inicio_vigencia IS NULL OR data_fim_vigencia IS NULL OR data_fim_vigencia >= data_inicio_vigencia) NOT VALID;

-- ---------------------------------------------------------------------
-- LEGISLACAO e CLASSE — chaves naturais (idempotência da importação)
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_legislacao_nome ON legislacao (nome);
CREATE UNIQUE INDEX IF NOT EXISTS ux_classe_legislacao_nome ON classe (fk_id_legislacao, nome);

-- ---------------------------------------------------------------------
-- RESULTADO
-- (9) sem unidade no resultado não é possível verificar compatibilidade
--     com a unidade do limite.
-- ---------------------------------------------------------------------
ALTER TABLE resultado ADD COLUMN IF NOT EXISTS unidade_medida VARCHAR(30);

-- ---------------------------------------------------------------------
-- E__Assoc__1_possui
-- (10) tabela associativa sem chave primária permite associações duplicadas.
--      Falha (e desfaz tudo) se já houver duplicatas ou nulos: rode
--      npm run inspecionar antes para conferir.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'e__assoc__1_possui'::regclass AND contype = 'p'
    ) THEN
        ALTER TABLE e__assoc__1_possui
            ADD CONSTRAINT pk_e__assoc__1_possui PRIMARY KEY (fk_id_proposta, fk_id_legislacao);
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- ALERTA
-- (11) evita alerta duplicado a cada execução do gerador.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_alerta_resultado_tipo ON alerta (fk_id_resultado, tipo);

-- ---------------------------------------------------------------------
-- Controle da importação
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS etl.execucao_importacao (
    id_execucao   SERIAL PRIMARY KEY,
    iniciado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalizado_em TIMESTAMPTZ,
    status        VARCHAR(20) NOT NULL CHECK (status IN ('em_andamento', 'concluida', 'falhou', 'simulacao')),
    resumo        JSONB,
    erro          TEXT
);

CREATE TABLE IF NOT EXISTS etl.pendencia (
    id_pendencia   SERIAL PRIMARY KEY,
    chave          TEXT NOT NULL UNIQUE,
    tipo           VARCHAR(40) NOT NULL,
    importado      BOOLEAN NOT NULL,
    descricao      TEXT NOT NULL,
    arquivo_origem VARCHAR(120),
    linhas_origem  VARCHAR(250),
    dados          JSONB,
    resolvida      BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS etl.migracao (
    nome        VARCHAR(60) PRIMARY KEY,
    aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO etl.migracao (nome) VALUES ('001_ajustes_modelo') ON CONFLICT DO NOTHING;

COMMIT;
