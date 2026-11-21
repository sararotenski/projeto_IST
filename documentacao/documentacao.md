# Documentação: Ensaios Ambientais · IST

## 1. O que o sistema faz

O laboratório lança os resultados das amostras, pelo formulário ou por um arquivo CSV. A partir daí, o site:

1. Compara cada resultado com o limite da legislação correspondente. Ele classifica o resultado como dentro do limite, acima do máximo ou abaixo do mínimo.
2. Destaca no Painel tudo o que estiver fora do limite.
3. Monta séries por ponto de coleta e ensaio. Em cada série, aponta tendência de aumento ou de redução e valores que se desviam da média.
4. Registra alertas para tudo isso, sem duplicar.

É uma ferramenta de apoio. Ela não substitui a avaliação de um profissional.

```
data/raw/legislacoes/*.csv ─► extrair ─► importar ─► curadoria (data/curadoria/decisoes.json)
                                              │
            lançamento (CSV/formulário) ─► PostgreSQL ─► views SQL (conformidade, histórico)
                                              │                 │
                                   análise de tendência (server/analise) ─► alertas
                                              │
                                   API Express ─► site React (web/)
```

| Pasta | Conteúdo |
|---|---|
| `data/raw/legislacoes/` | Listas de limites do UltraLIMS (CSV, usadas na importação), as mesmas listas em PDF e os textos oficiais das legislações. Não são alterados. |
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
npm run relatorio                    # reports/relatorio_importacao_resultados.md (só números agregados)
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

### 3.1 Exportações do sistema do laboratório (`server/laboratorio.js`)

Na aba "Lançar resultados", selecione as exportações **Gerência de Amostra** e, se tiver, **Expedição** (os dois de uma vez). O site detecta o formato pelo cabeçalho e junta os arquivos pelo "Código Amostra Externo".

| Informação | De onde vem |
|---|---|
| Data de coleta e de conclusão | Gerência de Amostra |
| Ponto de coleta, unidade do resultado | Expedição (a unidade de um código de ensaio vale para todas as amostras desse código) |
| Unidade, quando a Expedição não traz | Unidade do limite, se todos os limites do ensaio usam a mesma |
| Legislação, cliente, origem | Não vêm nos arquivos: o resultado é comparado com **todas** as portarias |

Regras de leitura dos valores:

- `<0,10` é gravado como 0,10 com qualificador `<` (abaixo do limite de quantificação). O texto original fica em `resultado.valor_original`.
- `Ausente` = 0 e `Presente` = 1.
- `1.380,00` é formato brasileiro; `6.93` usa ponto decimal (padrão do arquivo); `27.000.000` tem separador de milhar. Em unidades de contagem (células/mL), `4.884` é 4884.
- Entram só ensaios com limite ativo em alguma portaria. Os demais (DBO, DQO, solventes, coordenadas…) aparecem no relatório como "sem limite".
- Amostras cujo ponto indica que não são água (peixe, carne, alimento, solo, lodo, efluente…) ficam de fora. Só é possível identificar isso quando a Expedição traz a descrição do ponto.
- Reenviar arquivos não duplica: resultados da mesma amostra e ensaio são mantidos.

Resultado com `<` ou `>`: o site só classifica quando a conclusão é certa.

| Caso | Classificação |
|---|---|
| `<LQ` e LQ ≤ máximo | Dentro dos limites |
| `<LQ` e LQ > máximo | **Inconclusivo**: o valor real pode estar acima ou abaixo do máximo |
| `<LQ` e LQ ≤ mínimo | Abaixo do limite mínimo (ex.: cloro `<0,10` com mínimo 0,2) |
| `>X` e X ≥ máximo | Acima do limite máximo |

Conversões de unidade: ng/L, µg/L e mg/L entre si (ex.: THM 164,4 µg/L = 0,1644 mg/L).

Os arquivos reais ficam na pasta `docs/`, que está no `.gitignore` e nunca vai para o GitHub. Os testes usam arquivos fictícios em `tests/fixtures/`.

### 3.2 Aba Evolução (`GET /api/evolucao`)

Conta os resultados de cada classificação por semana (segunda a domingo) ou por mês da **data de coleta** (ou do resultado, quando a coleta não foi informada). Com uma portaria escolhida, usa a classificação naquela portaria; sem, a classificação geral. Resultados sem limite aplicável não entram no total comparado. O "% fora" é (acima + abaixo) ÷ comparados. Semanas sem resultados aparecem com zero. Clicar numa barra abre a aba Resultados filtrada pelo mesmo período. O gráfico é descritivo: não é teste de tendência.

## 4. Comparação com o limite (`vw_resultado_portaria` e `vw_resultado_conformidade`)

Cada resultado é avaliado em cada portaria (`vw_resultado_portaria`): se a amostra tem legislação, só nela; se não tem, em todas. A classificação geral (`vw_resultado_conformidade`) é a mais grave entre as portarias: Acima > Abaixo > Inconclusivo > Pendente > Dentro > Sem limite. O site mostra uma coluna por portaria e a coluna "Geral".

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

**Com os dados reais atuais não há séries.** A exportação Gerência de Amostra não traz o ponto de coleta, e a Expedição traz o ponto de só 6 amostras, cada uma num ponto diferente. A análise foi testada apenas com dados fictícios (`data/exemplos/` e `tests/`). Ela passa a funcionar sozinha quando os resultados importados tiverem o mesmo ponto em pelo menos 5 datas.

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

### 6.3 Legislações de efluente: CONAMA 430/2011 e CONSEMA 299/2025

Os limites vêm dos textos oficiais (`data/raw/legislacoes/textos_oficiais/`) e estão em `data/curadoria/limites_textos_oficiais.csv`: 65 linhas, cada uma com a fonte (artigo ou anexo). A extração lê esse arquivo junto com as listas do UltraLIMS.

**Associação aos códigos do laboratório.** As leis citam parâmetros ("Ferro dissolvido"), e o laboratório usa códigos ("198 - Fe Dis"). A associação foi feita pela equipe, **sem validação do IST**, com base nos pacotes de ensaios das exportações: os códigos escolhidos aparecem quase só em amostras que têm DBO ou DQO. Cada limite traz essa observação, visível na aba Limites legais.

| Parâmetro | Códigos | CONAMA 430 | CONSEMA 299 |
|---|---|---|---|
| pH | 794, 1189 | 5 a 9 | 6 a 9 |
| Temperatura (°C) | 800, 799 | < 40 | < 40 |
| Sólidos sedimentáveis (mL/L) | 119, 46 | ≤ 1 | ≤ 1 |
| Materiais flutuantes | 784 | ausência | ausência (art. 9º) |
| Óleos vegetais e gorduras animais | 112 | 50 mg/L (art. 16) | 50 mg/L |
| Óleos e graxas totais | 111, 38 | 100 mg/L (art. 21, esgoto sanitário) | — |
| DBO 5 dias | 92, 19, 15915 | 120 mg/L ou 60% de remoção (art. 21) | 60 mg/L ou 80% de remoção |
| Fósforo total | 101, 28, 936 | — | 4 mg/L ou 75% de remoção |
| Nitrogênio amoniacal total | 106, 33 | 20 mg/L | 20 mg/L (Anexo I) |
| Sulfeto | 117 | 1 mg/L | 1 mg/L |
| Ferro dissolvido | 198 | 15 mg/L | 15 mg/L |
| Zinco, níquel, cádmio, estanho (assumidos como totais) | 282, 270, 257, 263 | 5 · 2 · 0,2 · 4 mg/L | 1 · 1 · 0,1 · 4 mg/L |
| Cromo hexavalente | 196 | 0,1 mg/L | 0,1 mg/L |

Ficaram de fora: mercúrio (268) e chumbo (259), porque os valores do arquivo não deixam claro se a unidade é mg/L ou µg/L; ferro total (264), porque as leis só limitam o dissolvido; DQO, nitrato, nitrito, E. coli e alumínio dissolvido, que na CONSEMA 299 são só parâmetros de acompanhamento (sem limite); toxicidade, que depende de critério do órgão ambiental.

**Classes.** Cada lei tem dois conjuntos de regras, gravados como classes: CONAMA 430 "Art. 16 - Efluentes em geral" e "Art. 21 - Esgoto sanitário"; CONSEMA 299 "Anexo I - Efluente industrial" e "Art. 9 - Efluente sanitário". O tipo de efluente não vem nos arquivos. Quando as duas classes têm o mesmo limite, o resultado é classificado; quando têm limites diferentes, fica "Pendente de validação"; quando só uma define o parâmetro, vale essa.

**Limites condicionais.** DBO e fósforo podem ser atendidos pela concentração **ou** pela eficiência de remoção do tratamento, que exige o resultado da entrada da ETE. Quem atende a concentração já cumpre a lei, então o resultado é classificado como "Dentro dos limites". Acima da concentração, o resultado aparece como "Pendente de validação", com o motivo, porque ainda pode cumprir pela remoção.

**Quais amostras são efluente.** Os limites de lançamento só valem para amostras marcadas como efluente (`amostra.matriz = 'Efluente'`), e uma amostra de efluente não é comparada com limites de água. Na importação, uma amostra é marcada como efluente quando tem DBO ou DQO e nenhum ensaio com limite de água, ou quando a descrição do ponto fala em efluente ou esgoto. Isso é uma heurística: amostras de rio ou de água bruta com DBO e sem nenhum ensaio de água potável seriam tratadas como efluente.

Vigência: CONAMA 430 desde 16/05/2011 (DOU nº 92); CONSEMA 299 desde 16/12/2025 (DOE/SC nº 22.662-A), com a faixa de pH corrigida pela errata do DOE nº 22.770. A CONSEMA 181/2021, revogada pela 299, não foi cadastrada.

## 7. Banco de dados

O modelo original (`sql/000_script_original.sql`) foi preservado. As migrações só acrescentam estruturas e cada uma tem script de reversão.

- 001: amplia `ensaio.nome` e `limite.unidade_medida`. Adiciona o código do laboratório, a origem e a matriz no limite, a rastreabilidade, as chaves naturais, a PK da tabela associativa, a unidade no resultado e o esquema `etl`.
- 002: limite ativo/inativo; código da amostra e ponto de coleta; um resultado por amostra e ensaio; lotes de lançamento; trilha de curadoria.
- 003: qualificador do resultado (`<` abaixo do limite de quantificação, `>` acima da faixa), valor original como veio do arquivo, lote de cada resultado e origem "laboratorio" nos lotes. Aplicada no `db-teste` sem uma autorização separada da usuária, o que contraria o planejamento; foi registrada aqui e pode ser desfeita com `sql/003_resultados_laboratorio_reverter.sql`.

Pontos que continuam em aberto no modelo:

- `RESULTADO → ENSAIO` usa `ON DELETE CASCADE`. O recomendado é `RESTRICT`.
- `ENSAIO.atende_nao_atende` não é usado, porque a conformidade é calculada para cada resultado.
- `PARECER_TECNICO` está ligado a ENSAIO, quando um parecer normalmente trata de uma amostra.

## 8. Situação em 18/11/2026

- Legislações: 4 (GM/MS 888, SES 1468, CONAMA 430, CONSEMA 299). Limites: 804 registros, 799 ativos. Nenhuma ressalva da importação em aberto; nos 15 limites condicionais (DBO e fósforo), só os resultados acima da concentração ficam para avaliação técnica.
- Resultados reais: 978, de duas importações das exportações do laboratório (Gerência de Amostra e Expedição). 92 amostras foram identificadas como efluente.
- Testes: 37 unitários e 29 de banco/API, todos passando.
- Limitações: a associação dos códigos às leis de efluente não foi validada pelo IST; o tipo de efluente (industrial ou sanitário) não é conhecido; as tendências dependem de um ponto de coleta fixo, que as exportações atuais não trazem.
