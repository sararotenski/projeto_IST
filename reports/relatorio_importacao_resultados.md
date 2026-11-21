# Relatório de importação dos resultados

Gerado por `npm run relatorio` em 20/11/2026, 23:54:21, a partir do banco. Só traz números agregados: códigos de amostra, clientes e pontos de coleta não aparecem aqui.

## Situação atual

- 978 resultados de 305 amostras (92 identificadas como efluente).
- 349 resultados abaixo do limite de quantificação (valor com "<").

| Classificação geral | Resultados |
|---|---:|
| Dentro dos limites | 685 |
| Acima do limite máximo | 96 |
| Sem limite aplicável identificado | 84 |
| Pendente de validação | 79 |
| Inconclusivo | 18 |
| Abaixo do limite mínimo | 16 |

## Lotes importados

| Lote | Data | Origem | Arquivos | Amostras | Resultados | Ignorados sem limite | Fora (não são água) | Valores não reconhecidos |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 52 | 17/11/2026 | Exportação do laboratório | Tela_Expedição.csv + Tela_GerenciaAmostra_ResultadoColuna-_1_.csv | 182 | 479 | 4.465 | 2 | 0 |
| 69 | 20/11/2026 | Exportação do laboratório | Tela_Expedição.csv + Tela_GerenciaAmostra_ResultadoColuna-_1_.csv | 143 | 499 | 3.964 | 2 | 0 |

"Ignorados sem limite" são resultados de ensaios que não têm limite em nenhuma legislação cadastrada (ex.: DQO, solventes, poeiras). Eles não são gravados.

## Classificação por legislação

| Legislação | Dentro | Acima | Abaixo | Inconclusivo | Pendente | Não se aplica |
|---|---:|---:|---:|---:|---:|---:|
| Portaria GM/MS Nº888 5/21 | 410 | 41 | 10 | 18 | 0 | 499 |
| Portaria SES nº1468/2022 | 0 | 0 | 0 | 0 | 0 | 978 |
| Resolução CONAMA nº 430/2011 | 273 | 55 | 2 | 0 | 45 | 603 |
| Resolução CONSEMA nº 299/2025 | 266 | 50 | 6 | 0 | 79 | 577 |

## Ensaios com resultados fora do limite

Classificação geral (a mais grave entre as legislações).

| Ensaio | Código | Legislação decisiva | Acima | Abaixo | Resultados |
|---|---:|---:|---:|---:|---:|
| Alumínio | 217 | Portaria GM/MS Nº888 5/21 | 6 | 0 | 10 |
| Clorato | 7288 | Portaria GM/MS Nº888 5/21 | 7 | 0 | 17 |
| Cloro Residual Livre | 777 | Portaria GM/MS Nº888 5/21 | 0 | 10 | 44 |
| Coliformes Totais (UFC) | 58 | Portaria GM/MS Nº888 5/21 | 3 | 0 | 30 |
| Cor Aparente | 16 | Portaria GM/MS Nº888 5/21 | 8 | 0 | 39 |
| Escherichia coli (P/A) | 776 | Portaria GM/MS Nº888 5/21 | 1 | 0 | 22 |
| Escherichia coli (UFC) | 62 | Portaria GM/MS Nº888 5/21 | 5 | 0 | 34 |
| Ferro | 231 | Portaria GM/MS Nº888 5/21 | 8 | 0 | 14 |
| Materiais flutuantes | 784 | Resolução CONAMA nº 430/2011 | 1 | 0 | 15 |
| Nitrogênio amoniacal total (NA) | 106 | Resolução CONAMA nº 430/2011 | 27 | 0 | 57 |
| Sólidos sedimentáveis | 119 | Resolução CONAMA nº 430/2011 | 14 | 0 | 46 |
| Trihalometanos | 6178 | Portaria GM/MS Nº888 5/21 | 1 | 0 | 3 |
| Turbidez | 48 | Portaria GM/MS Nº888 5/21 | 2 | 0 | 40 |
| pH (efluente) | 1189 | Resolução CONAMA nº 430/2011 | 1 | 2 | 22 |
| pH (efluente) | 1189 | Resolução CONSEMA nº 299/2025 | 0 | 2 | 2 |
| pH (efluente) | 794 | Resolução CONAMA nº 430/2011 | 2 | 0 | 39 |
| pH (efluente) | 794 | Resolução CONSEMA nº 299/2025 | 0 | 2 | 2 |
| Óleos e graxas totais (OGT) | 111 | Resolução CONAMA nº 430/2011 | 5 | 0 | 14 |
| Óleos vegetais e gorduras animais (OGV) | 112 | Resolução CONAMA nº 430/2011 | 5 | 0 | 25 |

## Precisam de revisão técnica

Resultados que o sistema não classifica sozinho.

| Situação | Ensaio | Código | Motivo | Resultados |
|---|---:|---:|---:|---:|
| Inconclusivo | 2,4,6-triclorofenol | 386 | Limite de quantificação do método maior que o limite permitido: não é possível concluir | 9 |
| Inconclusivo | 2,4-diclorofenol | 382 | Limite de quantificação do método maior que o limite permitido: não é possível concluir | 9 |
| Pendente de validação | DBO 5 dias (por trak) | 92 | Condicional: máximo 120 mg/L, que pode ser ultrapassado se o tratamento remover pelo menos 60% da DBO. Exige o resultado de entrada para avaliar. CONAMA 430, art. 21, I, d. Código do laboratório associado pela equipe, sem validação do IST | 45 |
| Pendente de validação | Fósforo total (efluente) | 101 | Condicional: 4 mg/L ou redução de pelo menos 75% do fósforo. CONSEMA 299, Anexo I. Código do laboratório associado pela equipe, sem validação do IST | 18 |
| Pendente de validação | DBO 5 dias (por trak) | 92 | Condicional: 60 mg/L ou redução de pelo menos 80% da DBO. Exige o resultado de entrada para avaliar. CONSEMA 299, Anexo I. Código do laboratório associado pela equipe, sem validação do IST | 14 |
| Pendente de validação | Fósforo total (efluente) | 936 | Condicional: 4 mg/L ou redução de pelo menos 75% do fósforo. CONSEMA 299, Anexo I. Código do laboratório associado pela equipe, sem validação do IST | 2 |

## Gravados sem limite aplicável

O ensaio tem limite em alguma legislação, mas não para este tipo de amostra (ex.: ensaio de efluente numa amostra de água).

| Ensaio | Código | Resultados |
|---|---:|---:|
| Fósforo total (efluente) | 101 | 26 |
| Temperatura da água (efluente) | 799 | 18 |
| Nitrogênio amoniacal total (NA) | 33 | 9 |
| Fósforo total (efluente) | 28 | 7 |
| DBO 5 dias (por OD) | 15915 | 5 |
| pH (efluente) | 794 | 5 |
| Temperatura da água (efluente) | 800 | 4 |
| DBO 5 dias (por trak) | 19 | 4 |
| Óleos e graxas totais (OGT) | 38 | 2 |
| Sólidos sedimentáveis | 119 | 2 |
| Sólidos sedimentáveis | 46 | 2 |
