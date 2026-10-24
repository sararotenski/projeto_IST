# Diagnóstico do banco PostgreSQL

Gerado por `npm run inspecionar` em 2026-10-24T01:48:17.441Z (somente leitura).

- Banco: `db-teste` · usuário: `postgres`
- Servidor: PostgreSQL 18.6 on aarch64-apple-darwin24.6.0
- Migração 001 aplicada: sim · Views 010 aplicadas: sim

## Tabelas e registros (esquema public)

| Tabela | Registros | Colunas |
|---|---:|---|
| alerta | 0 | id_alerta INT, tipo VARCHAR(20), descricao VARCHAR(250), data_geracao DATE, fk_id_resultado INT |
| amostra | 0 | id_amostra INT, data_coleta DATE, origem VARCHAR(30), matriz VARCHAR(30), fk_id_cliente INT, fk_id_proposta INT, codigo_amostra VARCHAR(40), ponto_coleta VARCHAR(80), id_lote INT |
| classe | 2 | id_classe INT, nome VARCHAR(30), descricao VARCHAR(250), fk_id_legislacao INT |
| cliente | 0 | id_cliente INT, nome VARCHAR(30), cpf_cnpj VARCHAR(18), email VARCHAR(30), telefone VARCHAR(20) |
| e__assoc__1_possui | 0 | fk_id_proposta INT, fk_id_legislacao INT |
| ensaio | 310 | id_ensaio INT, nome VARCHAR(150), descricao VARCHAR(250), atende_nao_atende BOOLEAN, codigo_origem VARCHAR(20) |
| legislacao | 2 | id_legislacao INT, descricao VARCHAR(250), nome VARCHAR(30) |
| limite | 739 | id_limite INT, valor_minimo DECIMAL, valor_maximo DECIMAL, unidade_medida VARCHAR(30), versao INT, data_inicio_vigencia DATE, data_fim_vigencia DATE, fk_id_ensaio INT, fk_id_classe INT, fk_id_legislacao INT, matriz VARCHAR(30), origem_amostra VARCHAR(60), requer_validacao BOOLEAN, observacao_validacao VARCHAR(250), arquivo_origem VARCHAR(120), linhas_origem VARCHAR(250), ativo BOOLEAN, motivo_inativacao VARCHAR(250) |
| parecer_tecnico | 0 | id_parecer INT, conclusao VARCHAR(500), data_emissao DATE, fk_id_ensaio INT |
| proposta_comercial | 0 | id_proposta INT, qtd_ensaios INT, frq_atendimento VARCHAR(20), fk_id_cliente INT |
| resultado | 0 | id_resultado INT, valor DECIMAL, data_resultado DATE, fk_id_amostra INT, fk_id_ensaio INT, unidade_medida VARCHAR(30) |
| vw_alerta_calculado | 0 | id_resultado INT, tipo VARCHAR(null), descricao TEXT, data_referencia DATE, id_ensaio INT, legislacao VARCHAR(30), requer_avaliacao_profissional BOOLEAN |
| vw_historico | 0 | id_resultado INT, valor DECIMAL, data_resultado DATE, unidade_resultado VARCHAR(30), id_ensaio INT, codigo_ensaio VARCHAR(20), ensaio VARCHAR(150), id_amostra INT, codigo_amostra VARCHAR(40), ponto_coleta VARCHAR(80), id_lote INT, data_coleta DATE, origem VARCHAR(30), matriz VARCHAR(30), id_cliente INT, id_proposta INT, qtd_legislacoes BIGINT, qtd_limites_candidatos BIGINT, id_limite INT, legislacao VARCHAR(30), classe VARCHAR(30), valor_minimo DECIMAL, valor_maximo DECIMAL, unidade_limite VARCHAR(30), versao INT, data_inicio_vigencia DATE, data_fim_vigencia DATE, requer_validacao BOOLEAN, observacao_validacao VARCHAR(250), legislacoes_amostra TEXT, motivo_pendencia VARCHAR(null), classificacao_indicativa TEXT, percentual_do_maximo DECIMAL, categoria TEXT, serie_validada BOOLEAN, serie TEXT, fora_limite BOOLEAN, qtd_pontos_serie BIGINT, posicao BIGINT, valor_anterior DECIMAL, data_anterior DATE, fora_limite_anterior BOOLEAN, variacao_absoluta DECIMAL, variacao_percentual DECIMAL, direcao TEXT, recorrencia_fora_limite BOOLEAN |
| vw_limite_detalhado | 739 | id_limite INT, id_ensaio INT, codigo_ensaio VARCHAR(20), ensaio VARCHAR(150), id_legislacao INT, legislacao VARCHAR(30), id_classe INT, classe VARCHAR(30), matriz VARCHAR(30), origem_amostra VARCHAR(60), valor_minimo DECIMAL, valor_maximo DECIMAL, unidade_medida VARCHAR(30), versao INT, data_inicio_vigencia DATE, data_fim_vigencia DATE, requer_validacao BOOLEAN, observacao_validacao VARCHAR(250), ativo BOOLEAN, motivo_inativacao VARCHAR(250), arquivo_origem VARCHAR(120), linhas_origem VARCHAR(250), tipo_limite TEXT |
| vw_resultado_conformidade | 0 | id_resultado INT, valor DECIMAL, data_resultado DATE, unidade_resultado VARCHAR(30), id_ensaio INT, codigo_ensaio VARCHAR(20), ensaio VARCHAR(150), id_amostra INT, codigo_amostra VARCHAR(40), ponto_coleta VARCHAR(80), id_lote INT, data_coleta DATE, origem VARCHAR(30), matriz VARCHAR(30), id_cliente INT, id_proposta INT, qtd_legislacoes BIGINT, qtd_limites_candidatos BIGINT, id_limite INT, legislacao VARCHAR(30), classe VARCHAR(30), valor_minimo DECIMAL, valor_maximo DECIMAL, unidade_limite VARCHAR(30), versao INT, data_inicio_vigencia DATE, data_fim_vigencia DATE, requer_validacao BOOLEAN, observacao_validacao VARCHAR(250), legislacoes_amostra TEXT, motivo_pendencia VARCHAR(null), classificacao_indicativa TEXT, percentual_do_maximo DECIMAL, categoria TEXT |

## Chaves e restrições

| Tabela | Nome | Tipo | Definição |
|---|---|---|---|
| alerta | alerta_id_alerta_not_null | n | `NOT NULL id_alerta` |
| alerta | alerta_pkey | PK | `PRIMARY KEY (id_alerta)` |
| alerta | fk_alerta_2 | FK | `FOREIGN KEY (fk_id_resultado) REFERENCES resultado(id_resultado) ON DELETE SET NULL` |
| amostra | amostra_id_amostra_not_null | n | `NOT NULL id_amostra` |
| amostra | amostra_pkey | PK | `PRIMARY KEY (id_amostra)` |
| amostra | fk_amostra_2 | FK | `FOREIGN KEY (fk_id_cliente) REFERENCES cliente(id_cliente) ON DELETE RESTRICT` |
| amostra | fk_amostra_3 | FK | `FOREIGN KEY (fk_id_proposta) REFERENCES proposta_comercial(id_proposta) ON DELETE RESTRICT` |
| classe | classe_id_classe_not_null | n | `NOT NULL id_classe` |
| classe | classe_pkey | PK | `PRIMARY KEY (id_classe)` |
| classe | fk_classe_2 | FK | `FOREIGN KEY (fk_id_legislacao) REFERENCES legislacao(id_legislacao) ON DELETE RESTRICT` |
| cliente | cliente_id_cliente_not_null | n | `NOT NULL id_cliente` |
| cliente | cliente_pkey | PK | `PRIMARY KEY (id_cliente)` |
| e__assoc__1_possui | e__assoc__1_possui_fk_id_legislacao_not_null | n | `NOT NULL fk_id_legislacao` |
| e__assoc__1_possui | e__assoc__1_possui_fk_id_proposta_not_null | n | `NOT NULL fk_id_proposta` |
| e__assoc__1_possui | fk_e__assoc__1_possui_1 | FK | `FOREIGN KEY (fk_id_proposta) REFERENCES proposta_comercial(id_proposta)` |
| e__assoc__1_possui | fk_e__assoc__1_possui_2 | FK | `FOREIGN KEY (fk_id_legislacao) REFERENCES legislacao(id_legislacao)` |
| e__assoc__1_possui | pk_e__assoc__1_possui | PK | `PRIMARY KEY (fk_id_proposta, fk_id_legislacao)` |
| ensaio | ensaio_id_ensaio_not_null | n | `NOT NULL id_ensaio` |
| ensaio | ensaio_pkey | PK | `PRIMARY KEY (id_ensaio)` |
| legislacao | legislacao_id_legislacao_not_null | n | `NOT NULL id_legislacao` |
| legislacao | legislacao_pkey | PK | `PRIMARY KEY (id_legislacao)` |
| limite | ck_limite_faixa | CHECK | `CHECK (((valor_minimo IS NULL) OR (valor_maximo IS NULL) OR (valor_minimo <= valor_maximo))) NOT VALID` |
| limite | ck_limite_vigencia | CHECK | `CHECK (((data_inicio_vigencia IS NULL) OR (data_fim_vigencia IS NULL) OR (data_fim_vigencia >= data_inicio_vigencia))) NOT VALID` |
| limite | fk_limite_2 | FK | `FOREIGN KEY (fk_id_ensaio) REFERENCES ensaio(id_ensaio) ON DELETE RESTRICT` |
| limite | fk_limite_3 | FK | `FOREIGN KEY (fk_id_classe) REFERENCES classe(id_classe) ON DELETE RESTRICT` |
| limite | fk_limite_4 | FK | `FOREIGN KEY (fk_id_legislacao) REFERENCES legislacao(id_legislacao) ON DELETE RESTRICT` |
| limite | limite_ativo_not_null | n | `NOT NULL ativo` |
| limite | limite_id_limite_not_null | n | `NOT NULL id_limite` |
| limite | limite_pkey | PK | `PRIMARY KEY (id_limite)` |
| limite | limite_requer_validacao_not_null | n | `NOT NULL requer_validacao` |
| parecer_tecnico | fk_parecer_tecnico_2 | FK | `FOREIGN KEY (fk_id_ensaio) REFERENCES ensaio(id_ensaio) ON DELETE RESTRICT` |
| parecer_tecnico | parecer_tecnico_id_parecer_not_null | n | `NOT NULL id_parecer` |
| parecer_tecnico | parecer_tecnico_pkey | PK | `PRIMARY KEY (id_parecer)` |
| proposta_comercial | fk_proposta_comercial_2 | FK | `FOREIGN KEY (fk_id_cliente) REFERENCES cliente(id_cliente) ON DELETE RESTRICT` |
| proposta_comercial | proposta_comercial_id_proposta_not_null | n | `NOT NULL id_proposta` |
| proposta_comercial | proposta_comercial_pkey | PK | `PRIMARY KEY (id_proposta)` |
| resultado | fk_resultado_2 | FK | `FOREIGN KEY (fk_id_amostra) REFERENCES amostra(id_amostra) ON DELETE RESTRICT` |
| resultado | fk_resultado_3 | FK | `FOREIGN KEY (fk_id_ensaio) REFERENCES ensaio(id_ensaio) ON DELETE CASCADE` |
| resultado | resultado_id_resultado_not_null | n | `NOT NULL id_resultado` |
| resultado | resultado_pkey | PK | `PRIMARY KEY (id_resultado)` |

## Diferenças em relação a sql/000_script_original.sql

- `amostra.codigo_amostra` existe no banco e não no script
- `amostra.ponto_coleta` existe no banco e não no script
- `amostra.id_lote` existe no banco e não no script
- `ensaio.nome`: script VARCHAR(30), banco VARCHAR(150)
- `ensaio.codigo_origem` existe no banco e não no script
- `resultado.unidade_medida` existe no banco e não no script
- `limite.unidade_medida`: script VARCHAR(10), banco VARCHAR(30)
- `limite.matriz` existe no banco e não no script
- `limite.origem_amostra` existe no banco e não no script
- `limite.requer_validacao` existe no banco e não no script
- `limite.observacao_validacao` existe no banco e não no script
- `limite.arquivo_origem` existe no banco e não no script
- `limite.linhas_origem` existe no banco e não no script
- `limite.ativo` existe no banco e não no script
- `limite.motivo_inativacao` existe no banco e não no script
- Tabela `vw_alerta_calculado` existe no banco e não no script
- Tabela `vw_historico` existe no banco e não no script
- Tabela `vw_limite_detalhado` existe no banco e não no script
- Tabela `vw_resultado_conformidade` existe no banco e não no script

## Pré-condições da migração 001 e integridade

| Verificação | Resultado |
|---|---|
| Associações duplicadas em e__assoc__1_possui | nenhuma |
| Nulos em e__assoc__1_possui | nenhum |
| Legislações com nome repetido | nenhuma |
| Classes repetidas na mesma legislação | nenhuma |
| Limites com mínimo > máximo | 0 |
| Limites com fim de vigência antes do início | 0 |
| Alertas repetidos (resultado + tipo) | nenhum |
