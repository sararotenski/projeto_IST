CREATE TABLE AMOSTRA (
    id_amostra INT PRIMARY KEY,
    data_coleta DATE,
    origem VARCHAR(30),
    matriz VARCHAR(30),
    fk_id_cliente INT,
    fk_id_proposta INT
);

CREATE TABLE ENSAIO (
    id_ensaio INT PRIMARY KEY,
    nome VARCHAR(30),
    descricao VARCHAR(250),
    atende_nao_atende BOOLEAN
);

CREATE TABLE RESULTADO (
    id_resultado INT PRIMARY KEY,
    valor DECIMAL,
    data_resultado DATE,
    fk_id_amostra INT,
    fk_id_ensaio INT
);

CREATE TABLE LEGISLACAO (
    id_legislacao INT PRIMARY KEY,
    descricao VARCHAR(250),
    nome VARCHAR(30)
);

CREATE TABLE LIMITE (
    id_limite INT PRIMARY KEY,
    valor_minimo DECIMAL,
    valor_maximo DECIMAL,
    unidade_medida VARCHAR(10),
    versao INT,
    data_inicio_vigencia DATE,
    data_fim_vigencia DATE,
    fk_id_ensaio INT,
    fk_id_classe INT,
    fk_id_legislacao INT
);

CREATE TABLE CLASSE (
    id_classe INT PRIMARY KEY,
    nome VARCHAR(30),
    descricao VARCHAR(250),
    fk_id_legislacao INT
);

CREATE TABLE ALERTA (
    id_alerta INT PRIMARY KEY,
    tipo VARCHAR(20),
    descricao VARCHAR(250),
    data_geracao DATE,
    fk_id_resultado INT
);

CREATE TABLE PARECER_TECNICO (
    id_parecer INT PRIMARY KEY,
    conclusao VARCHAR(500),
    data_emissao DATE,
    fk_id_ensaio INT
);

CREATE TABLE CLIENTE (
    id_cliente INT PRIMARY KEY,
    nome VARCHAR(30),
    cpf_cnpj VARCHAR(18),
    email VARCHAR(30),
    telefone VARCHAR(20)
);

CREATE TABLE PROPOSTA_COMERCIAL (
    id_proposta INT PRIMARY KEY,
    qtd_ensaios INT,
    frq_atendimento VARCHAR(20),
    fk_id_cliente INT
);

CREATE TABLE E__Assoc__1_possui (
    fk_id_proposta INT,
    fk_id_legislacao INT
);
 
ALTER TABLE AMOSTRA ADD CONSTRAINT FK_AMOSTRA_2
    FOREIGN KEY (fk_id_cliente)
    REFERENCES CLIENTE (id_cliente)
    ON DELETE RESTRICT;
 
ALTER TABLE AMOSTRA ADD CONSTRAINT FK_AMOSTRA_3
    FOREIGN KEY (fk_id_proposta)
    REFERENCES PROPOSTA_COMERCIAL (id_proposta)
    ON DELETE RESTRICT;
 
ALTER TABLE RESULTADO ADD CONSTRAINT FK_RESULTADO_2
    FOREIGN KEY (fk_id_amostra)
    REFERENCES AMOSTRA (id_amostra)
    ON DELETE RESTRICT;
 
ALTER TABLE RESULTADO ADD CONSTRAINT FK_RESULTADO_3
    FOREIGN KEY (fk_id_ensaio)
    REFERENCES ENSAIO (id_ensaio)
    ON DELETE CASCADE;
 
ALTER TABLE LIMITE ADD CONSTRAINT FK_LIMITE_2
    FOREIGN KEY (fk_id_ensaio)
    REFERENCES ENSAIO (id_ensaio)
    ON DELETE RESTRICT;
 
ALTER TABLE LIMITE ADD CONSTRAINT FK_LIMITE_3
    FOREIGN KEY (fk_id_classe)
    REFERENCES CLASSE (id_classe)
    ON DELETE RESTRICT;
 
ALTER TABLE LIMITE ADD CONSTRAINT FK_LIMITE_4
    FOREIGN KEY (fk_id_legislacao)
    REFERENCES LEGISLACAO (id_legislacao)
    ON DELETE RESTRICT;
 
ALTER TABLE CLASSE ADD CONSTRAINT FK_CLASSE_2
    FOREIGN KEY (fk_id_legislacao)
    REFERENCES LEGISLACAO (id_legislacao)
    ON DELETE RESTRICT;
 
ALTER TABLE ALERTA ADD CONSTRAINT FK_ALERTA_2
    FOREIGN KEY (fk_id_resultado)
    REFERENCES RESULTADO (id_resultado)
    ON DELETE SET NULL;
 
ALTER TABLE PARECER_TECNICO ADD CONSTRAINT FK_PARECER_TECNICO_2
    FOREIGN KEY (fk_id_ensaio)
    REFERENCES ENSAIO (id_ensaio)
    ON DELETE RESTRICT;
 
ALTER TABLE PROPOSTA_COMERCIAL ADD CONSTRAINT FK_PROPOSTA_COMERCIAL_2
    FOREIGN KEY (fk_id_cliente)
    REFERENCES CLIENTE (id_cliente)
    ON DELETE RESTRICT;
 
ALTER TABLE E__Assoc__1_possui ADD CONSTRAINT FK_E__Assoc__1_possui_1
    FOREIGN KEY (fk_id_proposta)
    REFERENCES PROPOSTA_COMERCIAL (id_proposta);
 
ALTER TABLE E__Assoc__1_possui ADD CONSTRAINT FK_E__Assoc__1_possui_2
    FOREIGN KEY (fk_id_legislacao)
    REFERENCES LEGISLACAO (id_legislacao);