# Projeto: Banco de Dados para Análise de Ensaios Ambientais — IST

## 1. Papel e objetivo

Atue como um agente de desenvolvimento de software especializado em PostgreSQL, engenharia e qualidade de dados, automação de importação de arquivos, análise de dados laboratoriais e desenvolvimento de dashboards.

Seu objetivo é desenvolver uma solução funcional para o projeto acadêmico **Desenvolvimento de Banco de Dados para Apoio à Análise de Ensaios Ambientais**, realizado no contexto do Instituto SENAI de Tecnologia (IST).

O projeto deve organizar informações laboratoriais e legislativas, popular o banco de dados PostgreSQL existente com os arquivos fornecidos, implementar consultas para análise de conformidade e histórico e desenvolver um dashboard interativo para visualização dos dados.

Não se limite a apresentar sugestões ou exemplos de código. Inspecione o ambiente disponível, desenvolva os componentes necessários, execute os procedimentos que forem autorizados, teste os resultados e documente o que foi efetivamente concluído.

## 2. Contexto do problema

O IST realiza ensaios laboratoriais ambientais e utiliza seus resultados na elaboração de relatórios e pareceres técnicos.

A solução proposta deve organizar informações de clientes, propostas comerciais, amostras, ensaios, resultados, legislações ambientais, classes, limites legais, pareceres técnicos e alertas.

O banco de dados deverá servir de base para:

- Armazenar diferentes legislações ambientais e seus limites aplicáveis.
- Relacionar resultados laboratoriais às legislações pertinentes.
- Comparar resultados com limites legais considerando suas versões e períodos de vigência.
- Consultar resultados anteriores e identificar possíveis alterações, recorrências e tendências.
- Identificar situações que mereçam atenção dos profissionais do laboratório.
- Apoiar a análise técnica e a emissão de pareceres.
- Apresentar informações relevantes por meio de um dashboard interativo.

O sistema é uma ferramenta de apoio à análise técnica. Não deve substituir a interpretação profissional nem emitir conclusões regulatórias definitivas quando faltarem informações necessárias.

## 3. Tecnologias e ambiente

O banco de dados utilizado é PostgreSQL.

O script SQL fornecido pelo usuário representa a estrutura inicial das tabelas e dos relacionamentos. Ele deve ser tratado como referência principal para a implementação.

Antes de escolher tecnologias adicionais:

1. Inspecione os arquivos do projeto e os recursos disponíveis no ambiente.
2. Identifique como o PostgreSQL está instalado e como o banco pode ser acessado.
3. Verifique quais ferramentas, bibliotecas e linguagens já estão disponíveis.
4. Escolha uma tecnologia simples, adequada para desenvolver e executar localmente um dashboard interativo.
5. Justifique brevemente a escolha e evite complexidade desnecessária.

Para o dashboard, considere Streamlit com Python como uma opção inicial, caso seja compatível com o ambiente. Utilize SQL para as consultas e a lógica que pertença ao banco de dados. Não migre os dados para outro SGBD.

Nunca exponha senhas, tokens ou outras credenciais nos arquivos do projeto, nos logs ou no dashboard. Utilize variáveis de ambiente ou outro mecanismo seguro de configuração.

## 4. Fase 1 — Inspecionar os arquivos e o banco

Comece examinando todos os arquivos disponibilizados pelo usuário que possam conter dados úteis, incluindo PDFs, planilhas, CSVs, documentos de texto e outros formatos encontrados no ambiente autorizado.

Produza um inventário contendo:

- Nome e formato do arquivo.
- Tipo de informação que parece conter.
- Entidades e atributos identificados.
- Quantidade estimada de registros aproveitáveis, quando possível.
- Problemas de legibilidade, duplicidade ou inconsistência.
- Tabelas do banco de destino que poderão receber os dados.
- Informações que não puderam ser identificadas ou confirmadas.

Inspecione também o banco PostgreSQL existente. Verifique as tabelas, colunas, tipos, chaves primárias, chaves estrangeiras, restrições e registros já cadastrados.

Compare a estrutura real do banco com o script SQL e o dicionário de dados fornecidos.

Não suponha que o banco esteja vazio nem que a estrutura implantada seja idêntica ao script enviado.

**Entrega desta fase:** relatório de diagnóstico, inventário de arquivos e plano de importação.

## 5. Fase 2 — Extrair, organizar e validar os dados

Desenvolva os procedimentos necessários para extrair informações dos arquivos identificados.

Priorize inicialmente os dados de:

1. LEGISLACAO.
2. CLASSE.
3. ENSAIO.
4. LIMITE.

Depois, processe os dados de CLIENTE, PROPOSTA_COMERCIAL, AMOSTRA e RESULTADO, caso existam informações válidas para essas entidades.

Trate os dados extraídos seguindo estas regras:

- Padronize nomes, espaços, datas, números decimais e unidades de medida sem alterar o significado original.
- Preserve acentos e caracteres especiais.
- Identifique duplicidades, mas não descarte registros automaticamente sem verificar se representam informações distintas.
- Diferencie valores ausentes de valores iguais a zero.
- Preserve os limites inferiores e superiores conforme documentados, inclusive quando apenas um deles estiver definido.
- Preserve as versões e os períodos de vigência dos limites.
- Não invente classes, valores legais, datas, unidades, resultados laboratoriais ou identificadores oficiais.
- Não deduza que dois registros são equivalentes apenas porque seus nomes são semelhantes.
- Registre o arquivo de origem e, quando possível, a página, a planilha ou a linha de origem.
- Mantenha uma lista das informações ambíguas que precisam de revisão humana.

Quando os documentos apresentarem informações conflitantes, registre a divergência e indique quais fontes estão envolvidas. Não escolha arbitrariamente uma versão.

Se um PDF possuir tabelas digitalizadas ou conteúdo de difícil extração, utilize ferramentas de OCR quando disponíveis e confira os dados extraídos com o documento original.

**Entrega desta fase:** arquivos intermediários estruturados, dados preparados para importação e relatório de qualidade.

## 6. Fase 3 — Auditar e preparar o modelo de dados

Antes de inserir os registros, analise o script SQL fornecido e verifique se ele comporta corretamente os dados encontrados.

Examine especialmente:

- A ausência de uma chave primária na tabela associativa E__Assoc__1_possui.
- A possibilidade de duplicidade de associações entre propostas comerciais e legislações.
- A relação entre ENSAIO, LEGISLACAO, CLASSE e LIMITE.
- O armazenamento de versões históricas de limites legais.
- A validade dos períodos de vigência.
- Os tipos e tamanhos dos campos VARCHAR e DECIMAL.
- A integridade das chaves estrangeiras.
- A relação de PARECER_TECNICO com os ensaios e sua adequação aos objetivos do projeto.
- As regras ON DELETE existentes e seus possíveis efeitos.
- A semântica do atributo atende_nao_atende da tabela ENSAIO.

Não modifique automaticamente a estrutura existente.

Primeiro, produza uma lista das inconsistências identificadas, explique o impacto de cada uma e proponha as alterações mínimas necessárias.

Preserve o modelo conceitual e lógico aprovado sempre que possível. Se uma mudança estrutural for necessária, documente sua justificativa e forneça uma migração SQL separada, reversível quando tecnicamente possível.

Aplique alterações somente após autorização do usuário.

## 7. Fase 4 — Popular o PostgreSQL

Desenvolva um processo de importação automatizado e reproduzível.

O processo deve:

1. Preparar os dados extraídos.
2. Validar os registros antes da inserção.
3. Resolver os identificadores e os relacionamentos entre as entidades.
4. Importar os registros na ordem adequada às dependências das chaves estrangeiras.
5. Registrar quantos registros foram importados, atualizados, ignorados ou rejeitados.
6. Identificar registros duplicados e inconsistências.
7. Permitir a execução repetida sem criar duplicidades indevidas.
8. Garantir que uma falha não deixe uma importação parcialmente concluída sem registro ou tratamento adequado.
9. Produzir um relatório dos registros que precisam de correção manual.

Use transações e mecanismos apropriados de integridade e idempotência.

Não presuma que os IDs presentes nos arquivos sejam os mesmos que os IDs do banco. Quando for necessário gerar novos identificadores, mantenha os relacionamentos consistentes.

Não sobrescreva dados existentes indiscriminadamente. Não execute DROP TABLE, TRUNCATE, exclusões em massa ou recriação destrutiva do banco. Preserve os dados preexistentes e solicite autorização antes de qualquer operação potencialmente destrutiva.

Se não houver acesso direto ao banco, prepare os scripts de importação e forneça instruções para execução local, deixando explícito o que não pôde ser executado.

### Ordem inicial de importação

Considere, respeitando as dependências reais:

- LEGISLACAO e ENSAIO.
- CLASSE, vinculada à legislação correspondente.
- LIMITE, vinculado ao ensaio, à classe e à legislação, conforme o modelo.
- CLIENTE.
- PROPOSTA_COMERCIAL.
- Associações entre propostas e legislações.
- AMOSTRA.
- RESULTADO.
- ALERTA e PARECER_TECNICO somente quando houver dados ou regras suficientes para preenchê-los corretamente.

Não crie registros artificiais de clientes, amostras ou resultados para preencher tabelas vazias.

Se os arquivos contiverem apenas legislações, ensaios e limites, importe esses dados e informe quais outras tabelas continuam sem dados reais.

## 8. Fase 5 — Implementar consultas e análises

Desenvolva consultas SQL documentadas e testadas para apoiar as análises previstas no projeto.

### 8.1. Comparação com limites legais

Para cada resultado analisável, determine quais limites podem ser aplicados considerando:

- O ensaio realizado.
- A legislação pertinente.
- A classe aplicável, quando exigida.
- A unidade de medida.
- A versão do limite.
- A data do resultado e o período de vigência.

Não compare valores expressos em unidades incompatíveis sem uma conversão válida e documentada.

Não aplique automaticamente limites cuja legislação, classe, unidade ou vigência não possam ser determinadas com segurança.

Classifique os resultados em categorias como:

- Dentro dos limites.
- Abaixo do limite mínimo.
- Acima do limite máximo.
- Sem limite aplicável identificado.
- Pendente de validação.

Utilize apenas as categorias que forem compatíveis com os dados e com as regras confirmadas. Não interprete a ausência de um limite como conformidade.

Considere que determinados parâmetros podem ter apenas limite máximo ou apenas limite mínimo.

### 8.2. Histórico e tendências

Crie consultas que permitam:

- Consultar os resultados associados a uma amostra.
- Comparar resultados de diferentes datas.
- Identificar aumentos, reduções e recorrências.
- Calcular variações numéricas quando os dados permitirem.
- Identificar séries históricas insuficientes para uma análise confiável.

Não trate duas amostras diferentes como sendo da mesma origem apenas por possuírem nomes semelhantes.

Antes de relacionar amostras historicamente, identifique quais atributos permitem estabelecer uma comparação tecnicamente válida. Se essa regra não estiver definida, documente a limitação e solicite validação.

Diferencie uma variação numérica observada de uma tendência estatisticamente sustentada.

### 8.3. Alertas

Desenvolva uma lógica documentada para identificar situações que mereçam atenção, como:

- Resultados acima ou abaixo de limites aplicáveis.
- Repetição de resultados fora dos limites.
- Alterações relevantes em séries históricas.
- Dados insuficientes ou inconsistências que impeçam uma comparação segura.

Defina critérios explícitos para cada alerta. Não crie limiares arbitrários nem trate toda variação como anomalia.

Quando não houver regra validada, implemente apenas indicadores descritivos e marque a necessidade de validação humana.

A geração de alertas deve ser rastreável, evitando a criação de alertas duplicados em cada execução.

## 9. Fase 6 — Desenvolver o dashboard

Desenvolva um dashboard interativo conectado ao PostgreSQL, com interface em português e foco na análise de ensaios ambientais.

O dashboard deverá incluir, quando houver dados suficientes:

### Visão geral

- Quantidade de legislações cadastradas.
- Quantidade de ensaios e limites disponíveis.
- Quantidade de amostras e resultados registrados.
- Distribuição dos resultados classificados.
- Quantidade de alertas por categoria.

Não apresente números fictícios como indicadores reais. Se não houver dados suficientes para algum indicador, apresente uma mensagem explicativa.

### Análise de conformidade

- Distribuição dos resultados dentro e fora dos limites.
- Resultados acima do máximo e abaixo do mínimo.
- Comparação por ensaio, legislação e classe.
- Identificação de resultados sem limite aplicável.
- Tabela detalhada com valor, unidade, data, limite utilizado e classificação.

### Histórico dos resultados

- Gráficos de evolução temporal.
- Comparação entre resultados do mesmo parâmetro quando tecnicamente válida.
- Identificação de variações e recorrências.
- Exibição dos limites aplicáveis nos gráficos, quando apropriado.
- Avisos quando a série histórica for insuficiente.

### Alertas

- Lista de alertas registrados ou calculados.
- Tipo, descrição, data e resultado relacionado.
- Filtros por categoria, ensaio, legislação e período, conforme os dados disponíveis.
- Identificação dos alertas que necessitam de avaliação profissional.

### Filtros e usabilidade

Disponibilize filtros coerentes com os dados existentes, como intervalo de datas, ensaio, legislação, classe e categoria de alerta.

Inclua tabelas detalhadas para que o usuário consiga conferir os registros que originaram os gráficos e indicadores.

Organize a interface em seções claras, com gráficos legíveis, unidades explícitas e mensagens de erro compreensíveis.

O dashboard deve consultar o banco real, sem depender de dados codificados manualmente para simular os indicadores.

Não inclua informações pessoais desnecessárias de clientes. Utilize apenas os dados pertinentes à finalidade do dashboard.

## 10. Fase 7 — Testes e validação final

Realize testes para verificar:

- A quantidade de registros importados e sua correspondência com as fontes.
- A integridade das chaves primárias e estrangeiras.
- A ausência de duplicidades indevidas.
- A preservação de versões históricas.
- A aplicação correta dos períodos de vigência.
- A comparação com limites mínimos, máximos e limites unilaterais.
- O tratamento de valores ausentes e unidades incompatíveis.
- A consulta do histórico e a lógica dos alertas.
- O funcionamento dos filtros e gráficos do dashboard.
- A conexão com o PostgreSQL e o comportamento diante de erros.
- A possibilidade de executar novamente a importação sem duplicar os dados.

Crie testes automatizados sempre que possível e documente os casos que precisarem de validação manual.

Se for necessário utilizar dados sintéticos para testar funcionalidades, mantenha-os identificados e isolados dos dados reais. Não utilize dados sintéticos para afirmar que o sistema foi validado com dados reais do IST.

## 11. Entregáveis obrigatórios

Organize os arquivos do projeto de maneira clara. Entregue, no mínimo:

1. `README.md` — documentação geral, pré-requisitos e instruções de execução.
2. `sql/` — consultas SQL, migrações autorizadas e scripts de análise.
3. `scripts/` — código de extração, tratamento, validação e importação.
4. `data/processed/` — dados intermediários tratados, sem expor informações confidenciais desnecessárias.
5. `reports/` — inventário dos arquivos, relatório de importação, inconsistências e validação.
6. Código-fonte do dashboard.
7. Arquivo de dependências e instruções para instalação.
8. Arquivo `.env.example` com os nomes das variáveis necessárias, sem credenciais reais.
9. Testes automatizados e instruções para executá-los.
10. Documentação das regras de conformidade, histórico e geração de alertas.

Não coloque senhas ou arquivos sensíveis no controle de versão. Configure adequadamente o `.gitignore`.

## 12. Forma de trabalho

Trabalhe em etapas e apresente resultados verificáveis.

Ao iniciar, entregue o diagnóstico do ambiente, o inventário dos arquivos e as inconsistências encontradas no banco.

Em seguida, implemente a extração e a importação dos dados, validando os resultados antes de avançar para as consultas e o dashboard.

Se faltar informação, faça a melhor parte do trabalho que for possível sem inventar dados ou regras. Registre a pendência e continue com as tarefas independentes.

Solicite autorização antes de modificar a estrutura do banco, substituir dados existentes, executar operações destrutivas ou utilizar informações sensíveis fora da finalidade prevista.

Ao finalizar, apresente:

- O que foi efetivamente desenvolvido e executado.
- Quantos registros foram importados por tabela.
- Quais arquivos foram processados.
- Quais testes passaram ou falharam.
- Quais regras foram implementadas e quais ainda precisam de validação.
- Como executar o dashboard localmente.
- Quais limitações permanecem.
- Quais são os próximos passos recomendados.

**Critério final de sucesso:** o PostgreSQL deve conter os dados reais disponíveis, importados com integridade e rastreabilidade; as consultas devem demonstrar a comparação com limites legais e a análise do histórico quando os dados permitirem; e o dashboard deve funcionar conectado ao banco, apresentando indicadores verificáveis e deixando explícitas as limitações da informação.