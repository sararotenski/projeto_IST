// API somente leitura do dashboard. Uso: npm run api (porta 3001 por padrão).
// Escuta apenas em 127.0.0.1 e NÃO tem autenticação: uso local.
// Para expor em rede seria necessário adicionar autenticação e HTTPS.

import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { criarPool, descreverErroBanco } from '../scripts/lib/db.js';
import * as consultas from './consultas.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const porta = Number(process.env.API_PORT || 3001);

export function criarApp(db) {
  const app = express();
  app.disable('x-powered-by');

  const rota = (fn) => async (req, res) => {
    try {
      res.json(await fn(db, req.query));
    } catch (erro) {
      console.error(`[api] ${req.path}: ${erro.code ?? ''} ${erro.message}`);
      res.status(503).json({ erro: descreverErroBanco(erro) });
    }
  };

  app.get('/api/saude', rota(consultas.saude));
  app.get('/api/resumo', rota(consultas.resumo));
  app.get('/api/filtros', rota(consultas.filtros));
  app.get('/api/limites', rota(consultas.limites));
  app.get('/api/conformidade', rota(consultas.conformidade));
  app.get('/api/historico', rota(consultas.historico));
  app.get('/api/alertas', rota(consultas.alertas));
  app.get('/api/pendencias', rota(consultas.pendencias));
  app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

  // Em produção (npm start) serve o dashboard compilado.
  const dist = path.join(raiz, 'web', 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let pool;
  try {
    pool = criarPool();
  } catch (erro) {
    console.error(erro.message);
    process.exit(1);
  }
  pool.on('error', (e) => console.error(`[db] ${descreverErroBanco(e)}`));
  criarApp(pool).listen(porta, '127.0.0.1', () => {
    console.log(`API em http://127.0.0.1:${porta}/api (somente local, sem autenticação)`);
  });
}
