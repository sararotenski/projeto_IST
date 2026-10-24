# Documentação: Ensaios Ambientais · IST

## 1. O que o sistema faz

O laboratório lança os resultados das amostras, pelo formulário ou por um arquivo CSV. A partir daí, o site:

1. Compara cada resultado com o limite da legislação correspondente. Ele classifica o resultado como dentro do limite, acima do máximo ou abaixo do mínimo.
2. Destaca no Painel tudo o que estiver fora do limite.
3. Monta séries por ponto de coleta e ensaio. Em cada série, aponta tendência de aumento ou de redução e valores que se desviam da média.
4. Registra alertas para tudo isso, sem duplicar.

É uma ferramenta de apoio. Ela não substitui a avaliação de um profissional.

```
data/raw/*.csv ─► extrair ─► importar ─► curadoria (data/curadoria/decisoes.json)
                                              │
            lançamento (CSV/formulário) ─► PostgreSQL ─► views SQL (conformidade, histórico)
                                              │                 │
                                   análise de tendência (server/analise) ─► alertas
                                              │
                                   API Express ─► site React (web/)
```

| Pasta | Conteúdo |
|---|---|
| `data/raw/` | CSVs originais do laboratório. Não são alterados. |
| `data/processed/` | Dados extraídos e padronizados |
| `data/curadoria/decisoes.json` | Decisões de tratamento dos limites, com fonte oficial |
| `data/exemplos/` | Arquivo de demonstração com dados fictícios |
| `sql/` | Script original, migrações 001 e 002 (com reversão) e views de análise |
| `scripts/` | Extração, importação, curadoria, migração, inspeção e alertas |
| `server/` | API, lançamento de resultados e análise estatística |
| `web/` | Site em React |
| `tests/` | Testes unitários e de banco |
| `reports/` | Relatórios gerados (qualidade, importação, diagnóstico do banco) |

## 2. Como executar

Pré-requisitos: Node.js 22.9 ou superior (testado com a 24.22.1) e PostgreSQL (testado com a 18).

```bash
npm install
cp .env.example .env                 # credenciais do banco (o arquivo não vai para o Git)
npm run migrar -- --confirmar        # estrutura, migrações 001 e 002 e views
npm run importar                     # limites dos CSVs (pode repetir sem duplicar)
npm run curadoria                    # aplica as decisões de tratamento (idempotente)
npm start                            # compila e abre em http://127.0.0.1:3001
```

Para mexer no visual, use dois terminais: `npm run api` e `npm run web`. O site abre em http://127.0.0.1:5173.

Testes: `npm test` roda os unitários, sem banco. `npm run test:db` testa as regras SQL e a API e faz o fluxo completo de lançamento, desfazendo tudo no final.

Segurança: o servidor escuta só em `127.0.0.1` e não tem login. As rotas de escrita exigem o cabeçalho `X-IST-Dashboard`, que protege contra requisições forjadas de outros sites. Para usar em rede, é preciso adicionar autenticação e HTTPS.

## 3. Lançamento de resultados

Colunas do CSV (separador `;`, vírgula decimal e datas no formato DD/MM/AAAA):

| Coluna | Obrigatória | Observação |
|---|---|---|
| `codigo_amostra` | sim | Identificador do laboratório. Uma amostra pode ter vários ensaios. |
| `ponto_coleta` | sim | Define as séries históricas |
| `cliente` | sim | Até 30 caracteres. É criado se ainda não existir. |
| `legislacao` | sim | Nome completo ou atalho ("888", "1468") |
| `origem_amostra` | sim | Agua Tratada, Água Consumo Humano, Água Subterrânea ou Água Superficial (Água doce) |
| `matriz` | não | Padrão: "Água - BNU" |
| `data_coleta` | sim | |
| `codigo_ensaio` | sim | Código do ensaio no laboratório |
| `valor` | sim | Em ensaios de presença/ausência, 0 = ausente e 1 = presente |
| `unidade` | não | Se ficar vazia, usa a unidade do limite, quando há apenas um limite aplicável |
| `data_resultado` | não | Padrão: a data da coleta |

O lançamento é tudo ou nada: se uma linha tiver erro, nenhuma é gravada, e o site lista os erros com o número da linha. Um mesmo ensaio não pode ser lançado duas vezes para a mesma amostra.

Cada lançamento forma um lote, e um lote pode ser desfeito na aba "Lançar resultados". Desfazer remove as amostras, os resultados e os alertas do lote, além dos clientes e propostas que ele criou, se ficarem sem uso.

A proposta comercial que liga a amostra à legislação é escolhida assim: o sistema procura uma proposta do cliente associada exatamente àquela legislação e, se não houver, cria uma.

O arquivo `data/exemplos/resultados_DEMONSTRACAO_ficticios.csv` tem dados fictícios do cliente "DEMONSTRACAO - FICTICIO", com casos de tendência de aumento, tendência de redução, resultados fora do limite e um valor atípico. Ele serve para conhecer o site e deve ser desfeito depois.

## 4. Comparação com o limite (`vw_resultado_conformidade`)

O limite aplicado a um resultado precisa ser:

- do mesmo ensaio;
- da legislação associada à amostra;
- da mesma origem e matriz (a comparação ignora acentos e maiúsculas);
- vigente na data do resultado;
- ativo.

A classificação segue a primeira regra que se aplicar:

| Situação | Classificação |
|---|---|
| Valor, ensaio ou legislação ausente; mais de um limite possível; unidade ausente ou incompatível | Pendente de validação |
| Nenhum limite aplicável | Sem limite aplicável identificado |
| Valor < mínimo | Abaixo do limite mínimo |
| Valor > máximo | Acima do limite máximo |
| Caso contrário | Dentro dos limites |

Unidades: "ug/L" e "μg/L" são lidos como "µg/L", e "ppb" como "µg/L", o que vale para amostras aquosas. pH e razões são adimensionais. Não há outras conversões. Limites que só têm máximo ou só têm mínimo comparam apenas o lado definido.

## 5. Tendências e desvios (`server/analise/tendencia.js`)

Uma série reúne os resultados de um mesmo ponto de coleta, do mesmo ensaio e com a mesma unidade, em ordem de data.

| Análise | Método | Critério |
|---|---|---|
| Tendência | Teste de Mann-Kendall, não paramétrico e usual em monitoramento de água, com correção para valores empatados | p < 0,05 com pelo menos 5 resultados → "Aumentando" ou "Diminuindo". Caso contrário, "Sem tendência significativa". Abaixo de 5 resultados, "Dados insuficientes", porque nesse caso o teste não consegue chegar a p < 0,05. |
| Taxa de variação | Inclinação de Sen (mediana das inclinações entre pares de pontos) | Expressa em unidade por ano. Aparece no gráfico como uma linha tracejada. |
| Desvio | Escore z = (valor − média) / desvio-padrão da série | \|z\| > 2 com pelo menos 6 resultados → "Valor atípico". Com 5 resultados ou menos, \|z\| nunca passa de 2. |
| Recorrência | Dois resultados consecutivos fora do limite na mesma série | Gera alerta |

Os parâmetros ficam em `PARAMETROS`, no início do arquivo. Uma tendência estatisticamente significativa é um sinal para investigar, não uma conclusão técnica.

Tipos de alerta (tabela ALERTA, no máximo um por resultado e tipo):

| Tipo | Origem |
|---|---|
| `ACIMA_MAXIMO`, `ABAIXO_MINIMO`, `PENDENTE_VALIDACAO` | Comparação com o limite |
| `RECORRENCIA` | Série histórica |
| `TENDENCIA_AUMENTO`, `TENDENCIA_REDUCAO` | Mann-Kendall. Ligado ao último resultado da série. |
| `VALOR_ATIPICO` | Escore z |

## 6. Tratamento dos limites

### 6.1 Extração (`scripts/lib/extracao.js`)

Foram lidas 794 linhas de 6 arquivos. O tratamento:

- padroniza espaços, decimais (vírgula vira ponto) e grafias de unidade;
- trata "Sem classe" como ausência de classe;
- consolida linhas idênticas;
- separa conflitos e faixas inconsistentes para revisão.

O resultado foram 732 limites importados. Cada um guarda o arquivo e as linhas de origem.

### 6.2 Curadoria (`data/curadoria/decisoes.json`, aplicada por `npm run curadoria`)

As 154 ressalvas da importação foram resolvidas com base no texto oficial da Portaria GM/MS nº 888/2021 (DOU de 07/05/2021) e da Portaria SES/SC nº 1468/2022:

| Ressalva | Tratamento |
|---|---|
| Repetições (41 grupos de linhas idênticas) | Já consolidadas na importação |
| Mesmo parâmetro com códigos diferentes (77 casos) | Os códigos continuam separados no banco, porque são métodos do laboratório. No site, aparecem agrupados por parâmetro: 734 registros viram 531 linhas. |
| Conflitos (Microcistinas, Paraquate, Picloram, 1,2-Diclorobenzeno, Ferro) | Adotado o valor oficial: 1 µg/L, 13 µg/L, 60 µg/L, 0,001 mg/L e 0,3 mg/L |
| Cloro residual livre com mínimo > máximo | Faixa de 0,2 a 5 mg/L (art. 32 e Anexo 9) |
| Máximo 0 em coliformes e E. coli | Confirmado: o padrão é ausência em 100 mL |
| Máximo 0 sem valor legal (bactérias heterotróficas, clorofórmio e ácido dicloroacético isolados, Clorpirifós + oxon na SES) | Limite desativado, porque não há VMP para o parâmetro isolado |
| Heptacloro em água superficial com máximo 0 | 0,3 µg/L, conforme a SES 1468 |
| Unidade ausente (pH, gosto e odor, razão nitrito/nitrato) | Adimensional, intensidade e adimensional |
| Códigos com valor diferente do oficial (Amônia 8020, Alumínio 10498, 1,4-Diclorobenzeno 690, 1,2-Diclorobenzeno 691) | Corrigidos para o VMP vigente |
| Classe "Àgua tratada" | Grafia corrigida para "Água tratada" |
| Vigência não informada | GM/MS 888: desde 07/05/2021. SES 1468: desde 21/12/2022, data do ato. A data exata de publicação no DOE/SC ainda precisa ser confirmada. |

Cada decisão guarda os valores anteriores em `etl.decisao_curadoria` e pode ser conferida na aba "Dados e curadoria". Reimportar os CSVs não desfaz as correções. Recomenda-se que um responsável técnico confira as decisões.

## 7. Banco de dados

O modelo original (`sql/000_script_original.sql`) foi preservado. As migrações só acrescentam estruturas e cada uma tem script de reversão.

- 001: amplia `ensaio.nome` e `limite.unidade_medida`. Adiciona o código do laboratório, a origem e a matriz no limite, a rastreabilidade, as chaves naturais, a PK da tabela associativa, a unidade no resultado e o esquema `etl`.
- 002: limite ativo/inativo; código da amostra e ponto de coleta; um resultado por amostra e ensaio; lotes de lançamento; trilha de curadoria.

Pontos que continuam em aberto no modelo:

- `RESULTADO → ENSAIO` usa `ON DELETE CASCADE`. O recomendado é `RESTRICT`.
- `ENSAIO.atende_nao_atende` não é usado, porque a conformidade é calculada para cada resultado.
- `PARECER_TECNICO` está ligado a ENSAIO, quando um parecer normalmente trata de uma amostra.

## 8. Situação em 23/10/2026

- Limites: 739 registros, sendo 734 ativos e 5 desativados. Nenhum tem ressalva em aberto e todos têm vigência.
- Resultados reais: nenhum lançado ainda. O fluxo completo foi testado com o arquivo de demonstração, e o lote foi desfeito em seguida.
- Testes: 30 unitários e 24 de banco/API, todos passando.
- Limitação: a análise de tendência depende de um ponto de coleta informado de forma consistente em todos os lançamentos.
