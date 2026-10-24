# Ensaios Ambientais · IST

Site que compara automaticamente o resultado de cada amostra com o limite da legislação correspondente, destaca o que está fora do limite e aponta tendências de aumento ou redução e valores atípicos.

Documentação completa: [`documentacao/documentacao.md`](documentacao/documentacao.md).

## Executar

Requisitos: Node.js 22.9 ou superior e PostgreSQL.

```bash
npm install
cp .env.example .env              # credenciais do banco (fora do Git)
npm run migrar -- --confirmar     # estrutura e views
npm run importar                  # limites legais dos CSVs
npm run curadoria                 # tratamento documentado dos limites
npm start                         # http://127.0.0.1:3001
```

Desenvolvimento: `npm run api` e `npm run web` (http://127.0.0.1:5173).

## Testes

```bash
npm test          # unitários
npm run test:db   # banco, API e fluxo de lançamento (desfeito no final)
```

## Uso

1. **Lançar resultados**: importe um CSV (há um modelo e um arquivo de demonstração fictício) ou use o formulário.
2. **Painel**: indicadores e a lista do que requer atenção (fora do limite, tendências, valores atípicos).
3. **Resultados**: todos os resultados com o limite aplicado e a classificação.
4. **Tendências**: séries por ponto de coleta, com Mann-Kendall, desvio-padrão e gráfico.
5. **Limites legais** e **Dados e curadoria**: limites tratados e a origem de cada decisão.

O servidor é local (127.0.0.1) e não tem login. Para uso em rede, adicione autenticação e HTTPS.
