/**
 * Servidor local do ReSource MVP.
 * A aplicação Express vive em app.js (compartilhada com a serverless function
 * do Vercel em api/index.js). Este arquivo apenas sobe o listener.
 */

const { app, ready, PORT } = require('./app');
const db = require('./db');
const ollama = require('./ollama');

ready
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[ReSource] API em http://localhost:${PORT}`);
      console.log(`[ReSource] Banco: ${db.isMongo() ? `MongoDB (${db.MONGO_DB})` : 'simulado em data/db.json'}`);
      console.log(`[ReSource] Ollama: ${ollama.OLLAMA_URL} | modelo: ${ollama.OLLAMA_MODEL}${ollama.isCloud() ? ' (cloud)' : ''}`);
    });
  })
  .catch((e) => {
    console.error('[ReSource] falha ao iniciar:', e.message);
    process.exit(1);
  });
