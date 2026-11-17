// API do dashboard. Uso: npm run api (porta 3001 por padrão).
// Escuta apenas em 127.0.0.1 e NÃO tem autenticação: uso local.
// Rotas de escrita (lançar e desfazer resultados) exigem o cabeçalho
// X-IST-Dashboard, que um site externo não consegue enviar sem CORS
// (proteção contra CSRF). Para uso em rede: adicionar autenticação e HTTPS.

import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { criarPool, descreverErroBanco } from '../scripts/lib/db.js';
import * as consultas from './consultas.js';
import { COLUNAS_CSV, desfazerLote, lerCsvResultados, registrarResultados } from './registro.js';
import { detectarTipo, importarExportacoes, lerArquivo } from './laboratorio.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const porta = Number(process.env.API_PORT || 3001);

export function criarApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '25mb' }));

  const responder = (res, erro, rota) => {
    if (erro.status) return res.status(erro.status).json({ erro: erro.message });
    console.error(`[api] ${rota}: ${erro.code ?? ''} ${erro.message}`);
    return res.status(503).json({ erro: descreverErroBanco(erro) });
  };
  const leitura = (fn) => async (req, res) => {
    try {
      const r = await fn(db, req.query);
      if (r === null) return res.status(404).json({ erro: 'Não encontrado' });
      res.json(r);
    } catch (erro) {
      responder(res, erro, req.path);
    }
  };
  const escrita = (fn) => async (req, res) => {
    if (req.get('X-IST-Dashboard') !== '1') return res.status(403).json({ erro: 'Requisição recusada (cabeçalho do dashboard ausente).' });
    try {
      const r = await fn(req);
      res.status(r.erros ? 422 : 200).json(r);
    } catch (erro) {
      responder(res, erro, req.path);
    }
  };

  app.get('/api/saude', leitura(consultas.saude));
  app.get('/api/painel', leitura(consultas.painel));
  app.get('/api/opcoes', leitura(consultas.opcoes));
  app.get('/api/resultados', leitura(consultas.resultados));
  app.get('/api/tendencias', leitura(consultas.tendencias));
  app.get('/api/evolucao', leitura(consultas.evolucao));
  app.get('/api/serie', leitura(consultas.serie));
  app.get('/api/limites', leitura(consultas.limites));
  app.get('/api/qualidade', leitura(consultas.qualidade));
  app.get('/api/lotes', leitura(consultas.lotes));

  app.get('/api/exemplo-csv', (req, res) => {
    res.download(path.join(raiz, 'data', 'exemplos', 'resultados_DEMONSTRACAO_ficticios.csv'));
  });

  app.get('/api/modelo-csv', (req, res) => {
    res.type('text/csv; charset=utf-8').attachment('modelo_resultados.csv');
    res.send(`\ufeff${COLUNAS_CSV.join(';')}\n`);
  });

  // Lançamento pelo formulário: { itens: [{ codigo_amostra, ponto_coleta, ... }] }
  app.post('/api/resultados', escrita(async (req) => {
    const itens = Array.isArray(req.body?.itens) ? req.body.itens : [];
    return registrarResultados(db, itens.map((x, i) => ({ ...x, linha: i + 1 })), { origem: 'formulario' });
  }));

  // Lançamento por CSV: { arquivo, conteudo }
  app.post('/api/resultados/csv', escrita(async (req) => {
    const conteudo = typeof req.body?.conteudo === 'string' ? req.body.conteudo : '';
    const arquivo = typeof req.body?.arquivo === 'string' ? req.body.arquivo.slice(0, 200) : null;
    const lido = lerCsvResultados(conteudo);
    if (lido.erros.length) return { erros: lido.erros };
    return registrarResultados(db, lido.linhas, { origem: 'csv', arquivo });
  }));

  // Um ou mais arquivos: { arquivos: [{ nome, conteudo }] }. Detecta o formato:
  // modelo do site (um arquivo) ou exportações do laboratório (Gerência/Expedição).
  app.post('/api/resultados/arquivos', escrita(async (req) => {
    const arquivos = (Array.isArray(req.body?.arquivos) ? req.body.arquivos : [])
      .filter((a) => typeof a?.conteudo === 'string')
      .map((a) => ({ nome: String(a.nome ?? 'arquivo.csv').slice(0, 120), conteudo: a.conteudo }));
    if (!arquivos.length) return { erros: [{ linha: null, mensagem: 'Nenhum arquivo enviado.' }] };
    const tipos = arquivos.map((a) => detectarTipo(lerArquivo(a.conteudo).colunas));
    if (tipos.includes('modelo')) {
      if (arquivos.length > 1) return { erros: [{ linha: null, mensagem: 'O modelo do site deve ser enviado sozinho.' }] };
      const lido = lerCsvResultados(arquivos[0].conteudo);
      if (lido.erros.length) return { erros: lido.erros };
      return registrarResultados(db, lido.linhas, { origem: 'csv', arquivo: arquivos[0].nome });
    }
    return importarExportacoes(db, arquivos);
  }));

  app.post('/api/lotes/:id/desfazer', escrita(async (req) => {
    if (!/^\d+$/.test(req.params.id)) throw Object.assign(new Error('Lote inválido'), { status: 400 });
    return desfazerLote(db, Number(req.params.id));
  }));

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
