# Ensaios Ambientais · IST

Banco de dados PostgreSQL, importação de limites legais e dashboard React (paleta bege e marrom) para apoiar a análise de ensaios ambientais do Instituto SENAI de Tecnologia.

A documentação completa (regras, modelo, limitações e próximos passos) está em [`documentacao/documentacao.md`](documentacao/documentacao.md).

## Pré-requisitos

- Node.js 22.9 ou superior
- PostgreSQL com a estrutura de `sql/000_script_original.sql`

## Instalação e execução

```bash
npm install
cp .env.example .env              # preencha as credenciais do banco (o arquivo não vai para o Git)
npm run inspecionar               # diagnóstico somente leitura
npm run migrar -- --confirmar     # ajustes do modelo (001) e views de análise (010)
npm run importar                  # importa os CSVs de data/raw (idempotente)
npm run api                       # terminal 1: API em http://127.0.0.1:3001/api
npm run web                       # terminal 2: dashboard em http://127.0.0.1:5173
```

Ou, em um só processo: `npm start`, que abre em http://127.0.0.1:3001.

## Testes

```bash
npm test          # unitários (sem banco)
npm run test:db   # regras SQL e API no banco, com dados sintéticos desfeitos por ROLLBACK
```

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `data/raw` · `data/processed` | CSVs originais · dados tratados |
| `sql/` | Script original, migração 001 (+ reversão), views de análise, consultas |
| `scripts/` | Extração, inspeção, migração, importação e alertas |
| `server/` · `web/` | API Express (somente leitura, local, sem autenticação) · dashboard React |
| `tests/` | Testes automatizados |
| `reports/` | Inventário, diagnóstico, qualidade e importação |
| `documentacao/` | Documentação do projeto |
