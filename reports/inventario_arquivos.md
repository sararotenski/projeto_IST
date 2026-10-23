# Inventário de arquivos e diagnóstico do ambiente

Levantamento feito em 23/10/2026.

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
| `data/raw/GM888_Agua_Consumo_Humano.csv` | CSV `;`, UTF-8 com BOM, CRLF | Limites da Portaria GM/MS 888/21, água para consumo humano | 268 | LEGISLACAO, ENSAIO, CLASSE, LIMITE | 36 duplicatas exatas, conflitos (Microcistinas ppb × µg/L, Paraquate, Picloram), Cloro Residual Livre com mín. > máx., unidades vazias, classe "Àgua tratada" |
| `data/raw/GM888_Agua_Tratada.csv` | idem | GM/MS 888/21, água tratada | 250 | idem | 11 duplicatas, conflitos (1,2-Diclorobenzeno, Ferro), máximos iguais a 0 |
| `data/raw/SES1468_Agua_Consumo_Humano.csv` | idem | Portaria SES 1468/2022, consumo humano | 69 | idem | "ug/L" e "µg/L" misturados |
| `data/raw/SES1468_Agua_Subterranea.csv` | idem | SES 1468/2022, subterrânea | 70 | idem | idem; Clorpirifós com máx. 0 |
| `data/raw/SES1468_Agua_Superficial.csv` | idem | SES 1468/2022, superficial (água doce) | 66 | idem | idem; Heptacloro com máx. 0 |
| `data/raw/SES1468_Agua_Tratada.csv` | idem | SES 1468/2022, tratada | 71 | idem | idem |

O `SES1468_Agua_Consumo_Humano.csv` estava em `~/Downloads` e foi copiado para `data/raw/`.

Entidades identificadas: legislação, matriz, origem da amostra, código e nome do ensaio, classe, valores mínimo e máximo, unidade. Os arquivos não têm dados de clientes, propostas, amostras, resultados, versão ou vigência.

O detalhamento linha a linha está em `reports/relatorio_qualidade.md`.

## Outros arquivos

| Arquivo | Situação |
|---|---|
| `sql/000_script_original.sql` (cópia de `~/Downloads/Sem Título.sql`) | Estrutura de referência do banco |
| `planejamento.md` | Requisitos do projeto |
| `~/Downloads/listaEnsaiosLegislacaoPdf - *.pdf` (3 PDFs) | Não processados. Parecem ser a versão em PDF das listas dos CSVs. Podem ser usados para resolver as pendências. |
| `~/Downloads/modelagem-paplicado.pdf`, `*.png`, `*.brM3` | Modelos conceitual e lógico (brModelo). Não processados. O script SQL foi usado como referência. |
