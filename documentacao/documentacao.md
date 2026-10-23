# Documentação do projeto: Banco de Dados para Análise de Ensaios Ambientais (IST)

## 1. Visão geral

O sistema organiza limites legais de ensaios ambientais em um banco PostgreSQL, compara resultados laboratoriais com esses limites, acompanha o histórico e gera alertas. Tudo é exibido em um dashboard React, nos tons bege e marrom.

É uma ferramenta de apoio. Ela não substitui a interpretação de um profissional e não emite conclusões regulatórias.

```
data/raw/*.csv ──► scripts/extrair.js ──► data/processed/ + reports/relatorio_qualidade.md
                         │
                         ▼
               scripts/importar.js ──► PostgreSQL (tabelas do modelo + esquema etl)
                                              │
                         sql/010_views_analise.sql (conformidade, histórico, alertas)
                                              │
                         server/ (API Express, somente leitura) ──► web/ (React + Recharts)
```

| Pasta | Conteúdo |
|---|---|
| `data/raw/` | CSVs originais (não alterados) |
| `data/processed/` | Dados tratados: `legislacoes.json`, `ensaios.json`, `classes.json`, `limites.json`/`.csv`, `pendencias.json` |
| `sql/` | Script original, migração 001 e sua reversão, views de análise, consultas de exemplo |
| `scripts/` | Extração, inspeção do banco, migração, importação e geração de alertas |
| `server/` | API HTTP do dashboard |
| `web/` | Dashboard React |
| `tests/` | Testes unitários (`tests/*.test.js`) e de banco (`tests/db/`) |
| `reports/` | Inventário, diagnóstico do banco, qualidade e importação |

## 2. Como executar

Pré-requisitos: Node.js 22.9 ou superior (testado com a 24.22.1) e PostgreSQL com a estrutura de `sql/000_script_original.sql`.

```bash
npm install
cp .env.example .env              # preencha PGDATABASE, PGUSER, PGPASSWORD
npm run inspecionar               # diagnóstico somente leitura → reports/diagnostico_banco.md
npm run migrar                    # simulação: mostra o que seria aplicado
npm run migrar -- --confirmar     # aplica 001 (uma vez) e 010
npm run importar -- --simular     # importa e desfaz, só para conferir
npm run importar                  # importação real (pode repetir sem duplicar)
npm run alertas                   # grava em ALERTA os alertas calculados
```

Para abrir o dashboard em modo de desenvolvimento, use dois terminais:

```bash
npm run api    # API em http://127.0.0.1:3001/api
npm run web    # dashboard em http://127.0.0.1:5173
```

Outra opção é `npm start`, que compila o dashboard e serve tudo em `http://127.0.0.1:3001`.

Testes:

```bash
npm test          # unitários, sem banco
npm run test:db   # regras SQL e API contra o banco. Dados sintéticos com ROLLBACK, nada fica gravado.
```

Segurança: a API escuta só em `127.0.0.1`, não tem autenticação e só faz leituras com consultas parametrizadas. Para usar em rede seria preciso adicionar autenticação e HTTPS. As credenciais ficam só no `.env`, que está no `.gitignore`.

## 3. Tratamento dos dados (Fase 2)

Regras aplicadas pelos scripts `scripts/lib/normalizar.js` e `scripts/lib/extracao.js`:

- Espaços: removidos nas pontas e colapsados no meio. Acentos e caracteres especiais são preservados (Unicode NFC).
- Decimais: "0,001000" vira `0.001000`. Os valores são guardados como texto até o banco (DECIMAL) para não perder precisão.
- Vazio ≠ zero: um campo vazio vira `NULL`. "0,000000" vira `0`.
- Unidades: "ug/L" e "μg/L" (mu grego) viram "µg/L", porque são a mesma unidade escrita de outro jeito. "ppb" fica como está. Não há conversão automática.
- Classe: "Sem classe" ou "Sem Classe" vira `fk_id_classe = NULL`. As demais classes ficam exatamente como na fonte, inclusive "Àgua tratada".
- Duplicatas exatas (após a padronização) viram um único limite, que guarda todas as linhas de origem.
- Conflitos: quando o mesmo ensaio, legislação, origem e classe aparecem com valores ou unidades diferentes, o limite não é importado e vira pendência. Nenhuma versão é escolhida.
- Mínimo maior que o máximo: o limite não é importado (exemplo: Cloro Residual Livre com 0,2 e 0).
- Máximo igual a 0 e unidade ausente: o limite é importado com `requer_validacao = true`. O zero pode significar "ausência exigida" (microbiológicos) ou "limite não informado".
- Mesmo nome com códigos diferentes (exemplo: Ferro 231, 10525 e 10687) continuam como ensaios distintos, porque podem ser métodos diferentes.
- Vigência: os arquivos não informam. O limite fica com `versao = 1` e datas `NULL`. Nenhuma data é inventada.
- Rastreabilidade: cada limite guarda `arquivo_origem` e `linhas_origem`.

Resultado com os arquivos atuais: 794 linhas lidas e 732 limites importados, dos quais 25 estão marcados para validação. As 794 linhas se dividem em 780 que formam os limites (incluindo as duplicatas consolidadas) e 14 rejeitadas: 12 em 5 conflitos e 2 com faixa inconsistente. Ao todo são 154 pendências registradas. O detalhe está em `reports/relatorio_qualidade.md` e na aba "Qualidade dos dados".

## 4. Inconsistências do modelo e migração 001 (Fase 3)

O script `sql/001_ajustes_modelo.sql` foi aplicado com autorização em 23/10/2026. Ele só adiciona: não remove dados nem colunas. Para desfazer existe `sql/001_ajustes_modelo_reverter.sql`.

| # | Problema no modelo original | Impacto | Ajuste |
|---|---|---|---|
| 1 | `ensaio.nome VARCHAR(30)` | Nomes reais têm até 106 caracteres | `VARCHAR(150)` |
| 2 | ENSAIO não guarda o código do laboratório | Sem rastreabilidade e sem importação idempotente | `codigo_origem` com índice único |
| 3 | `limite.unidade_medida VARCHAR(10)` | "Aus/Pres em 100mL" tem 17 caracteres | `VARCHAR(30)` |
| 4 | LIMITE não tem origem da amostra nem matriz | O mesmo ensaio tem limites diferentes para água tratada, subterrânea etc. | `origem_amostra`, `matriz` |
| 5 | Sem rastreabilidade nem marcação de revisão | Não dá para auditar nem sinalizar valores duvidosos | `arquivo_origem`, `linhas_origem`, `requer_validacao`, `observacao_validacao` |
| 6 | LIMITE sem chave natural | Reimportar duplicaria registros | Índice único (ensaio, legislação, classe, matriz, origem, versão) |
| 7 | Sem verificação de faixa e de vigência | Permite mínimo > máximo e fim antes do início | `CHECK ... NOT VALID` |
| 8 | LEGISLACAO e CLASSE sem chave natural | Duplicidade na reimportação | Índices únicos `nome` e `(legislação, nome)` |
| 9 | RESULTADO sem unidade | Não dá para verificar se a unidade do resultado bate com a do limite | `resultado.unidade_medida` |
| 10 | `E__Assoc__1_possui` sem PK | Permite associações duplicadas | PK (proposta, legislação) |
| 11 | ALERTA sem chave natural | Cada execução duplicaria alertas | Índice único (resultado, tipo) |
| 12 | IDs `INT` sem sequência | Quem insere precisa gerar o ID | O importador usa MAX+1 com `LOCK TABLE` dentro da transação. Não foi alterado no modelo. |

Pontos que foram só documentados, sem mudança, e precisam de decisão:

- `RESULTADO → ENSAIO` com `ON DELETE CASCADE`: apagar um ensaio apaga os resultados dele. O recomendado é `RESTRICT`.
- `ENSAIO.atende_nao_atende`: conformidade é uma característica do resultado comparado a um limite, não do ensaio. A coluna ficou `NULL`, e a classificação é calculada na view.
- `PARECER_TECNICO → ENSAIO`: um parecer costuma tratar de uma amostra ou proposta, não de um ensaio isolado. Vale rever no modelo conceitual.
- O modelo não tem um ponto de coleta, o que limita a análise de histórico (ver seção 5.2).

Também existe o esquema `etl`, com `execucao_importacao` (log de cada execução), `pendencia` (itens para revisão humana) e `migracao` (controle das migrações).

## 5. Regras de análise (Fase 5)

As regras ficam em `sql/010_views_analise.sql`. Exemplos de uso estão em `sql/020_consultas_analise.sql`.

### 5.1 Conformidade: `vw_resultado_conformidade`

Um limite é candidato para um resultado quando todas estas condições valem:

1. É do mesmo ensaio do resultado.
2. A legislação está associada à proposta da amostra (`e__assoc__1_possui`).
3. A origem e a matriz são iguais às da amostra. A comparação ignora maiúsculas e acentos, então "Agua Tratada" é igual a "Água Tratada". Se a amostra não informar origem ou matriz, aceita qualquer uma, o que pode gerar mais de um candidato.
4. A data do resultado está dentro da vigência. Uma data `NULL` no limite significa que aquele lado não tem restrição.

A classificação segue a primeira regra que se aplicar:

| Situação | Categoria |
|---|---|
| Valor ausente, ensaio ausente ou legislação da amostra não identificada | Pendente de validação |
| Nenhum limite candidato | Sem limite aplicável identificado |
| Mais de um candidato (ambiguidade de classe, origem ou legislação) | Pendente de validação |
| Data ausente, unidade ausente ou unidades diferentes (sem conversão) | Pendente de validação |
| Limite marcado `requer_validacao` ou sem vigência informada | Pendente de validação, mostrando a classificação indicativa |
| Valor < mínimo | Abaixo do limite mínimo |
| Valor > máximo | Acima do limite máximo |
| Caso contrário | Dentro dos limites |

Limites que só têm mínimo ou só têm máximo comparam apenas o lado definido. A ausência de limite nunca é tratada como conformidade.

Os limites importados hoje não têm vigência. Por isso, qualquer resultado comparado a eles fica "Pendente de validação" até que as datas sejam confirmadas no texto oficial e preenchidas em `limite.data_inicio_vigencia`. A coluna `classificacao_indicativa` mostra o que a comparação daria.

### 5.2 Histórico: `vw_historico`

- Uma série reúne resultados do mesmo cliente, origem, matriz, ensaio e unidade. Essa regra é provisória: sem um ponto de coleta no modelo, duas amostras do mesmo cliente podem vir de locais diferentes. Precisa de validação técnica.
- Para cada ponto, a view calcula o valor anterior, a variação absoluta e percentual (quando o valor anterior é diferente de 0) e a direção (aumento, redução ou sem variação).
- Uma série com menos de 3 pontos é marcada `serie_suficiente = false`. Esse critério é descritivo e provisório.
- A view mostra variação observada. Ela não testa tendência estatística, o que exigiria mais pontos e um método definido.

### 5.3 Alertas: `vw_alerta_calculado` e `npm run alertas`

| Tipo | Critério |
|---|---|
| `ACIMA_MAXIMO` | Categoria "Acima do limite máximo" |
| `ABAIXO_MINIMO` | Categoria "Abaixo do limite mínimo" |
| `RECORRENCIA` | Resultado fora do limite logo depois de outro fora do limite na mesma série |
| `PENDENTE_VALIDACAO` | A comparação não pôde ser feita (o motivo aparece na descrição) |

Todos os alertas exigem avaliação profissional. Variações dentro dos limites não geram alerta, porque não há limiar validado para isso. A gravação em ALERTA é idempotente: um alerta por resultado e tipo, e alertas existentes não são alterados.

## 6. Dashboard (Fase 6)

| Aba | Conteúdo |
|---|---|
| Visão geral | Contagens de legislações, ensaios, limites, amostras, resultados, alertas e pendências; limites por origem e legislação; distribuição das classificações; alertas por tipo |
| Limites legais | Filtros por legislação, origem, classe, situação e busca; gráfico por unidade; comparação de um ensaio entre origens; tabela com a fonte (arquivo e linha) |
| Conformidade | Filtros por período, legislação, ensaio, classe e classificação; distribuição; classificação por ensaio; tabela com valor, unidade, data, limite usado e classificação |
| Histórico | Escolha de ensaio e série; gráfico de linha com os limites; variações; aviso de série insuficiente |
| Alertas | Filtros por categoria, ensaio, legislação e período; tabela de alertas calculados e se já estão gravados |
| Qualidade dos dados | Pendências da importação, por tipo, com arquivo e linhas |

Todas as abas consultam o banco pela API. Não há números fixos no código. Quando falta dado, a aba mostra uma mensagem explicando o motivo. A interface não exibe nome, CPF/CNPJ, e-mail ou telefone de clientes.

Acessibilidade: a interface tem link "pular para o conteúdo", navegação com `aria-current`, rótulos em todos os filtros, tabelas com `caption` e ordenação anunciada (`aria-sort`), e foco visível. Os gráficos têm descrição textual e tabela equivalente. O contraste do texto principal é de aproximadamente 14:1. Uma validação completa de WCAG exige teste manual com tecnologias assistivas.

## 7. Situação em 23/10/2026

| Tabela | Registros | Origem |
|---|---:|---|
| legislacao | 2 | CSVs |
| ensaio | 310 | CSVs |
| classe | 2 | CSVs ("ESPECIFICAÇÃO" e "Àgua tratada", da GM/MS 888) |
| limite | 732 | CSVs (25 requerem validação) |
| etl.pendencia | 154 | Extração |
| cliente, proposta_comercial, e__assoc__1_possui, amostra, resultado, alerta, parecer_tecnico | 0 | Os arquivos fornecidos não têm esses dados. Nada foi inventado. |

Testes: 18 unitários e 15 de banco/API, todos passando. A reimportação foi testada e não cria duplicatas.

Limitações:

- Sem resultados reais, as abas de conformidade, histórico e alertas foram validadas apenas com dados sintéticos, isolados e desfeitos no final. Não há validação com dados reais do IST.
- A vigência dos limites não foi informada, e por isso toda comparação fica pendente.
- A regra de série do histórico é provisória.
- Os PDFs das listas de ensaios não foram processados.

Próximos passos recomendados:

1. Resolver as pendências da aba "Qualidade dos dados" com o texto oficial das portarias: conflitos, máximos iguais a 0, Cloro Residual Livre e unidades ausentes.
2. Preencher a vigência e a versão dos limites.
3. Cadastrar clientes, propostas, associações proposta–legislação, amostras e resultados reais, informando a unidade do resultado.
4. Definir um identificador de ponto de coleta para validar as séries históricas.
5. Decidir sobre `ON DELETE CASCADE` em RESULTADO e sobre a semântica de `atende_nao_atende`.
