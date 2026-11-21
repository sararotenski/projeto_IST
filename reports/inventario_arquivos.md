# Inventário de arquivos e diagnóstico do ambiente

Levantamento feito em 23/10/2026 e atualizado em 21/11/2026.

## Ambiente

| Item | Situação |
|---|---|
| Sistema | macOS (Apple Silicon), zsh |
| Node.js | v24.22.1 via nvm (`~/.nvm`) |
| PostgreSQL | 18, em `/Library/PostgreSQL/18`, rodando em `localhost:5432`, autenticação por senha |
| Banco usado | `db-teste`. Estava vazio. A estrutura de `sql/000_script_original.sql` foi criada pela usuária e conferida por `npm run inspecionar`, com 0 diferenças. |
| Locale do banco | `C`. `lower()` não altera letras acentuadas, por isso a função `fn_normalizar_texto` remove os acentos antes. |
| Python | 3.9, das Command Line Tools. Usado só na inspeção inicial dos dados. |

O planejamento sugere Streamlit, mas a usuária pediu React. Por isso o projeto usa uma API Node/Express somente leitura e um dashboard React (Vite + Recharts).

## Arquivos de dados

| Arquivo | Formato | Conteúdo | Linhas | Destino | Problemas |
|---|---|---|---:|---|---|
| `data/raw/legislacoes/GM888_Agua_Consumo_Humano.csv` | CSV `;`, UTF-8 com BOM, CRLF | Limites da Portaria GM/MS 888/21, água para consumo humano | 268 | LEGISLACAO, ENSAIO, CLASSE, LIMITE | 36 duplicatas exatas, conflitos (Microcistinas ppb × µg/L, Paraquate, Picloram), Cloro Residual Livre com mín. > máx., unidades vazias, classe "Àgua tratada" |
| `data/raw/legislacoes/GM888_Agua_Tratada.csv` | idem | GM/MS 888/21, água tratada | 250 | idem | 11 duplicatas, conflitos (1,2-Diclorobenzeno, Ferro), máximos iguais a 0 |
| `data/raw/legislacoes/SES1468_Agua_Consumo_Humano.csv` | idem | Portaria SES 1468/2022, consumo humano | 69 | idem | "ug/L" e "µg/L" misturados |
| `data/raw/legislacoes/SES1468_Agua_Subterranea.csv` | idem | SES 1468/2022, subterrânea | 70 | idem | idem; Clorpirifós com máx. 0 |
| `data/raw/legislacoes/SES1468_Agua_Superficial.csv` | idem | SES 1468/2022, superficial (água doce) | 66 | idem | idem; Heptacloro com máx. 0 |
| `data/raw/legislacoes/SES1468_Agua_Tratada.csv` | idem | SES 1468/2022, tratada | 71 | idem | idem |

O `SES1468_Agua_Consumo_Humano.csv` estava em `~/Downloads` e foi copiado para `data/raw/legislacoes/`.

Entidades identificadas: legislação, matriz, origem da amostra, código e nome do ensaio, classe, valores mínimo e máximo, unidade. Os arquivos não têm dados de clientes, propostas, amostras, resultados, versão ou vigência.

O detalhamento linha a linha está em `reports/relatorio_qualidade.md`.

## Outros arquivos

| Arquivo | Situação |
|---|---|
| `sql/000_script_original.sql` (cópia de `~/Downloads/Sem Título.sql`) | Estrutura de referência do banco |
| `planejamento.md` | Requisitos do projeto |
| `~/Downloads/listaEnsaiosLegislacaoPdf - *.pdf` (3 PDFs) | Não processados. Parecem ser a versão em PDF das listas dos CSVs. Podem ser usados para resolver as pendências. |
| `~/Downloads/modelagem-paplicado.pdf`, `*.png`, `*.brM3` | Modelos conceitual e lógico (brModelo). Não processados. O script SQL foi usado como referência. |

## Arquivos adicionados depois (novembro/2026)

### Exportações do laboratório (pasta `docs/`, privada, fora do Git)

| Arquivo | Formato | Conteúdo | Linhas | Uso |
|---|---|---|---:|---|
| `Tela_GerenciaAmostra_ResultadoColuna-_1_.csv` | CSV `,`, uma linha por amostra e uma coluna por ensaio | Resultados de amostras coletadas entre 01/06 e 29/07/2026, com datas de coleta e conclusão | 673 amostras · 323 ensaios | Importado pelo site (aba Lançar resultados) |
| `Tela_Expedição.csv` | CSV `,`, uma linha por resultado | Ponto de coleta, unidade, limite de quantificação e VMP aplicado pelo laboratório | 15 resultados de 6 amostras | Importado junto com a Gerência, ligado pelo código externo da amostra |
| `extratoUltraLIMS.txt` | Log técnico do UltraLIMS 5.32 | 12 segundos de uso da tela de conferência de resultados: comandos SQL e a sessão do usuário, **com senhas e tokens** | 307 linhas | Só para entender a estrutura do UltraLIMS. Não é importado |

Problemas encontrados nas exportações: sem legislação, cliente nem origem da amostra; sem unidades na Gerência; valores com `<`, `Ausente`/`Presente`, vírgula e ponto misturados; campos `________` em branco; amostras que não são água (peixe). O tratamento está na seção 3.1 da documentação, e os números da importação em `relatorio_importacao_resultados.md`.

### Legislações (pasta `data/raw/legislacoes/`)

| Pasta | Arquivos | Uso |
|---|---|---|
| raiz | 6 listas de limites do UltraLIMS em CSV (GM/MS 888 e SES 1468) | Importadas |
| `listas_ultralims_pdf/` | As mesmas 6 listas em PDF | Comprovante da fonte; conferidas e idênticas aos CSVs |
| `textos_oficiais/` | CONAMA 357/2005, 396/2008, 420/2009 e 430/2011; CONSEMA 119/2017, 181/2021 (revogada), 182/2021 e 299/2025 | A 430 e a 299 deram origem a `data/curadoria/limites_textos_oficiais.csv` (65 limites, importados). As demais não foram cadastradas: dependem de classe do corpo d'água, uso, vazão da ETE ou tipo de amostra que os arquivos não trazem |

Foram removidas 4 cópias idênticas (byte a byte): uma da CONAMA 396, uma da lista SES 1468 de água superficial e duas listas em PDF repetidas em `docs/`.
