# Diagnóstico do banco PostgreSQL

Gerado por `npm run inspecionar` em 2026-10-23T15:55:53.975Z (somente leitura).

- Banco: `db-teste` · usuário: `postgres`
- Servidor: PostgreSQL 18.6 on aarch64-apple-darwin24.6.0
- Migração 001 aplicada: não · Views 010 aplicadas: não

## Tabelas e registros (esquema public)

| Tabela | Registros | Colunas |
|---|---:|---|
| alerta | 0 | id_alerta INT, tipo VARCHAR(20), descricao VARCHAR(250), data_geracao DATE, fk_id_resultado INT |
| amostra | 0 | id_amostra INT, data_coleta DATE, origem VARCHAR(30), matriz VARCHAR(30), fk_id_cliente INT, fk_id_proposta INT |
| classe | 0 | id_classe INT, nome VARCHAR(30), descricao VARCHAR(250), fk_id_legislacao INT |
| cliente | 0 | id_cliente INT, nome VARCHAR(30), cpf_cnpj VARCHAR(18), email VARCHAR(30), telefone VARCHAR(20) |
| e__assoc__1_possui | 0 | fk_id_proposta INT, fk_id_legislacao INT |
| ensaio | 0 | id_ensaio INT, nome VARCHAR(30), descricao VARCHAR(250), atende_nao_atende BOOLEAN |
| legislacao | 0 | id_legislacao INT, descricao VARCHAR(250), nome VARCHAR(30) |
| limite | 0 | id_limite INT, valor_minimo DECIMAL, valor_maximo DECIMAL, unidade_medida VARCHAR(10), versao INT, data_inicio_vigencia DATE, data_fim_vigencia DATE, fk_id_ensaio INT, fk_id_classe INT, fk_id_legislacao INT |
| parecer_tecnico | 0 | id_parecer INT, conclusao VARCHAR(500), data_emissao DATE, fk_id_ensaio INT |
| proposta_comercial | 0 | id_proposta INT, qtd_ensaios INT, frq_atendimento VARCHAR(20), fk_id_cliente INT |
| resultado | 0 | id_resultado INT, valor DECIMAL, data_resultado DATE, fk_id_amostra INT, fk_id_ensaio INT |

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
| e__assoc__1_possui | fk_e__assoc__1_possui_1 | FK | `FOREIGN KEY (fk_id_proposta) REFERENCES proposta_comercial(id_proposta)` |
| e__assoc__1_possui | fk_e__assoc__1_possui_2 | FK | `FOREIGN KEY (fk_id_legislacao) REFERENCES legislacao(id_legislacao)` |
| ensaio | ensaio_id_ensaio_not_null | n | `NOT NULL id_ensaio` |
| ensaio | ensaio_pkey | PK | `PRIMARY KEY (id_ensaio)` |
| legislacao | legislacao_id_legislacao_not_null | n | `NOT NULL id_legislacao` |
| legislacao | legislacao_pkey | PK | `PRIMARY KEY (id_legislacao)` |
| limite | fk_limite_2 | FK | `FOREIGN KEY (fk_id_ensaio) REFERENCES ensaio(id_ensaio) ON DELETE RESTRICT` |
| limite | fk_limite_3 | FK | `FOREIGN KEY (fk_id_classe) REFERENCES classe(id_classe) ON DELETE RESTRICT` |
| limite | fk_limite_4 | FK | `FOREIGN KEY (fk_id_legislacao) REFERENCES legislacao(id_legislacao) ON DELETE RESTRICT` |
| limite | limite_id_limite_not_null | n | `NOT NULL id_limite` |
| limite | limite_pkey | PK | `PRIMARY KEY (id_limite)` |
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

- Nenhuma: estrutura idêntica ao script.

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
