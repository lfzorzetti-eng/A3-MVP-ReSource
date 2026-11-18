/**
 * Servidor local do ReSource MVP.
 * A aplicação Express vive em app.js (compartilhada com a serverless function
 * do Vercel em api/index.js). Este arquivo apenas sobe o listener.
 */

const { app, ready, PORT } = require('./app');
const db = require('./db');
const groq = require('./groq');

ready
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[ReSource] API em http://localhost:${PORT}`);
      console.log(`[ReSource] Banco: ${db.isMongo() ? `MongoDB (${db.MONGO_DB})` : 'simulado em data/db.json'}`);
      console.log(`[ReSource] Groq: ${groq.GROQ_URL} | modelo: ${groq.GROQ_MODEL}${groq.GROQ_API_KEY ? '' : ' (sem GROQ_API_KEY: usando fallback)'}`);
    });
  })
  .catch((e) => {
    console.error('[ReSource] falha ao iniciar:', e.message);
    process.exit(1);
  });
