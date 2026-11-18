/**
 * ReSource MVP - API Node.js (RNF03: desacoplada da IA).
 * Integração não invasiva (RNF01) sobre o banco legado (MongoDB Atlas ou
 * simulado em arquivo, via backend/infrastructure/db.js).
 *
 * Camadas: routes → controllers → infrastructure (ver ARCHITECTURE.md).
 * Este módulo só monta o Express e exporta o app (sem listen), para servir
 * tanto o servidor local (backend/server.js) quanto a serverless function do
 * Vercel (api/index.js).
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const { PORT } = require('./infrastructure/config');
const db = require('./infrastructure/db');
const vetores = require('./infrastructure/vetores');
const rotas = require('./routes');

const app = express();

// Necessário para rate limit por IP atrás do proxy da Vercel.
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

/** Conecta o banco e reindexa o banco vetorial uma única vez por instância. */
const ready = (async () => {
  await db.init();
  await vetores.rebuild();
})().catch((e) => {
  console.error('[app] falha na inicialização:', e.message);
  throw e;
});

// toda requisição espera o banco estar pronto (evita cold start pagando o seed)
app.use(async (req, res, next) => {
  try {
    await ready;
    next();
  } catch (e) {
    res.status(503).json({ error: `banco indisponível: ${e.message}` });
  }
});

app.use('/api', rotas);

// tratamento de erro (não deixa a request pendurada no Vercel)
app.use((err, req, res, next) => {
  console.error('[erro]', req.method, req.originalUrl, '-', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || 'erro interno' });
});

module.exports = { app, ready, PORT };
