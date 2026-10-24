# Relatório de qualidade dos dados extraídos

Gerado por `npm run extrair` em 2026-10-24T01:48:17.174Z.

## Arquivos processados

| Arquivo | Linhas de dados | Colunas faltando |
|---|---:|---|
| GM888_Agua_Consumo_Humano.csv | 268 | — |
| GM888_Agua_Tratada.csv | 250 | — |
| SES1468_Agua_Consumo_Humano.csv | 69 | — |
| SES1468_Agua_Subterranea.csv | 70 | — |
| SES1468_Agua_Superficial.csv | 66 | — |
| SES1468_Agua_Tratada.csv | 71 | — |

## Resumo

- Linhas lidas: 794
- Linhas válidas: 794
- Limites consolidados para importação: 732 (25 marcados para validação)
- Legislações: 2 · Classes: 2 · Ensaios: 310

## Pendências por tipo

| Tipo | Qtd. | Registro importado? | Significado |
|---|---:|---|---|
| LINHA_INVALIDA | 0 | não | Linha com estrutura ou valor numérico inválido |
| DUPLICATA_EXATA | 41 | sim | Linhas idênticas consolidadas em um único limite |
| LIMITE_CONFLITANTE | 5 | não | Mesmo ensaio/legislação/origem/classe com valores ou unidades diferentes |
| FAIXA_INCONSISTENTE | 2 | não | Valor mínimo maior que o valor máximo |
| MAXIMO_ZERO | 17 | sim | Valor máximo igual a zero: pode indicar ausência exigida ou limite não informado |
| UNIDADE_AUSENTE | 8 | sim | Unidade de medida não informada na fonte |
| CLASSE_GRAFIA | 2 | sim | Nome de classe com possível erro de grafia (preservado como na fonte) |
| ENSAIO_NOME_DIVERGENTE | 0 | não | Mesmo código de ensaio com nomes diferentes |
| NOME_EM_CODIGOS_DIFERENTES | 77 | sim | Mesmo nome de ensaio com códigos diferentes (mantidos como ensaios distintos) |
| VIGENCIA_NAO_INFORMADA | 2 | sim | Fonte não informa versão nem período de vigência dos limites |
| COMPRIMENTO_EXCEDIDO | 0 | não | Texto maior que o tamanho da coluna de destino |

## Itens que precisam de revisão humana

| Tipo | Arquivo | Linhas | Descrição |
|---|---|---|---|
| CLASSE_GRAFIA | GM888_Agua_Consumo_Humano.csv | 72 | Classe "Àgua tratada" (1,2-Diclorobenzeno, código 691): grafia corrigida para "Água tratada" |
| FAIXA_INCONSISTENTE | GM888_Agua_Consumo_Humano.csv | 74 | Cloro Residual Livre (código 777) em Água Consumo Humano: mínimo 0.200000 maior que máximo 0.000000 |
| UNIDADE_AUSENTE | GM888_Agua_Consumo_Humano.csv | 75 | pH (código 793) em Água Consumo Humano |
| LIMITE_CONFLITANTE | GM888_Agua_Consumo_Humano.csv | 84,85 | Microcistinas (código 1108) em Água Consumo Humano: mín 0.000000 / máx 1.000000 ppb (linhas 84) × mín 0.000000 / máx 1.000000 µg/L (linhas 85). Nenhuma versão foi escolhida. |
| UNIDADE_AUSENTE | GM888_Agua_Consumo_Humano.csv | 89 | pH (código 1190) em Água Consumo Humano |
| FAIXA_INCONSISTENTE | GM888_Agua_Consumo_Humano.csv | 90 | Cloro Residual Livre (código 1207) em Água Consumo Humano: mínimo 0.200000 maior que máximo 0.000000 |
| UNIDADE_AUSENTE | GM888_Agua_Consumo_Humano.csv | 139 | SUB - Gosto e Odor (código 7138) em Água Consumo Humano |
| LIMITE_CONFLITANTE | GM888_Agua_Consumo_Humano.csv | 157,158 | Paraquate (código 7282) em Água Consumo Humano: mín 0.000000 / máx 13.000000 µg/L (linhas 157) × mín 0.000000 / máx 0.000000 µg/L (linhas 158). Nenhuma versão foi escolhida. |
| LIMITE_CONFLITANTE | GM888_Agua_Consumo_Humano.csv | 159,160 | Picloram (código 7283) em Água Consumo Humano: mín 0.000000 / máx 60.000000 µg/L (linhas 159) × mín 0.000000 / máx 0.000000 µg/L (linhas 160). Nenhuma versão foi escolhida. |
| UNIDADE_AUSENTE | GM888_Agua_Consumo_Humano.csv | 177 | Razão de Nitrito e Nitrato (código 7865) em Água Consumo Humano |
| MAXIMO_ZERO | GM888_Agua_Consumo_Humano.csv | 264 | SUB - Coliformes Totais (NMP) (código 16700) em Água Consumo Humano: máximo 0 NMP/100 mL |
| MAXIMO_ZERO | GM888_Agua_Consumo_Humano.csv | 265 | SUB - Escherichia coli - Determinação quantitativa pela técnica de tubos múltiplos (NMP) (código 16702) em Água Consumo Humano: máximo 0 NMP/100 mL |
| MAXIMO_ZERO | GM888_Agua_Consumo_Humano.csv | 266 | SUB - Escherichia coli (P/A) (código 17104) em Água Consumo Humano: máximo 0 Aus/Pres em 100mL |
| MAXIMO_ZERO | GM888_Agua_Consumo_Humano.csv | 267 | SUB - Coliformes Totais (P/A) (código 17105) em Água Consumo Humano: máximo 0 Aus/Pres em 100mL |
| MAXIMO_ZERO | GM888_Agua_Consumo_Humano.csv | 268 | SUB - Coliformes Totais - Determinação qualitativa pela técnica de tubos múltiplos modificados (código 17120) em Água Consumo Humano: máximo 0 Aus/Pres em 100mL |
| MAXIMO_ZERO | GM888_Agua_Consumo_Humano.csv | 269 | SUB - Escherichia coli - Determinação qualitativa pela técnica de tubos múltiplos modificados (código 17121) em Água Consumo Humano: máximo 0 Aus/Pres em 100mL |
| CLASSE_GRAFIA | GM888_Agua_Tratada.csv | 15 | Classe "Àgua tratada" (Odor, código 36): grafia corrigida para "Água tratada" |
| MAXIMO_ZERO | GM888_Agua_Tratada.csv | 61 | Clorofórmio (código 669) em Agua Tratada: máximo 0 mg/L |
| UNIDADE_AUSENTE | GM888_Agua_Tratada.csv | 73 | pH (código 793) em Agua Tratada |
| UNIDADE_AUSENTE | GM888_Agua_Tratada.csv | 86 | pH (código 1190) em Agua Tratada |
| MAXIMO_ZERO | GM888_Agua_Tratada.csv | 109 | SUB - Bactérias Heterotróficas (código 6014) em Agua Tratada: máximo 0 UFC/100mL |
| LIMITE_CONFLITANTE | GM888_Agua_Tratada.csv | 115,116,117 | 1,2-Diclorobenzeno (código 7001) em Agua Tratada: mín 0.000000 / máx 0.001000 mg/L (linhas 115,116) × mín 0.000000 / máx 0.000000 mg/L (linhas 117). Nenhuma versão foi escolhida. |
| UNIDADE_AUSENTE | GM888_Agua_Tratada.csv | 120 | SUB - Gosto e Odor (código 7138) em Agua Tratada |
| UNIDADE_AUSENTE | GM888_Agua_Tratada.csv | 148 | Razão de Nitrito e Nitrato (código 7865) em Agua Tratada |
| LIMITE_CONFLITANTE | GM888_Agua_Tratada.csv | 185,186,187 | Ferro (código 10687) em Agua Tratada: mín 0.000000 / máx 0.300000 mg/L (linhas 185,186) × mín 0.000000 / máx 0.000000 mg/L (linhas 187). Nenhuma versão foi escolhida. |
| MAXIMO_ZERO | GM888_Agua_Tratada.csv | 233 | Ácido Dicloroacético (DCAA) (código 15198) em Agua Tratada: máximo 0 mg/L |
| MAXIMO_ZERO | GM888_Agua_Tratada.csv | 247 | SUB - Coliformes Totais (UFC) (código 17079) em Agua Tratada: máximo 0 UFC/100mL |
| MAXIMO_ZERO | GM888_Agua_Tratada.csv | 248 | SUB - Escherichia coli (P/A) (código 17104) em Agua Tratada: máximo 0 Aus/Pres em 100mL |
| MAXIMO_ZERO | GM888_Agua_Tratada.csv | 249 | SUB - Coliformes Totais (P/A) (código 17105) em Agua Tratada: máximo 0 Aus/Pres em 100mL |
| MAXIMO_ZERO | GM888_Agua_Tratada.csv | 250 | SUB - Coliformes Totais - Determinação qualitativa pela técnica de tubos múltiplos modificados (código 17120) em Agua Tratada: máximo 0 Aus/Pres em 100mL |
| MAXIMO_ZERO | GM888_Agua_Tratada.csv | 251 | SUB - Escherichia coli - Determinação qualitativa pela técnica de tubos múltiplos modificados (código 17121) em Agua Tratada: máximo 0 Aus/Pres em 100mL |
| MAXIMO_ZERO | SES1468_Agua_Subterranea.csv | 23 | Clorpirifós + Clorpirifós-Oxon (código 7172) em Água Subterrânea: máximo 0 µg/L |
| MAXIMO_ZERO | SES1468_Agua_Superficial.csv | 2 | Heptacloro (código 397) em Água Superficial (Água doce): máximo 0 µg/L |
| MAXIMO_ZERO | SES1468_Agua_Tratada.csv | 24 | Clorpirifós + Clorpirifós-Oxon (código 7172) em Agua Tratada: máximo 0 µg/L |
| VIGENCIA_NAO_INFORMADA | — | — | Portaria GM/MS Nº888 5/21: arquivos não trazem versão nem datas de vigência. Limites importados com versão 1 e vigência vazia; confirmar no texto oficial. |
| VIGENCIA_NAO_INFORMADA | — | — | Portaria SES nº1468/2022: arquivos não trazem versão nem datas de vigência. Limites importados com versão 1 e vigência vazia; confirmar no texto oficial. |

Duplicatas exatas e nomes repetidos em códigos diferentes estão em `data/processed/pendencias.json`.
