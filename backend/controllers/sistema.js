/** Saúde da plataforma, reconexão do LLM e restauração da demo. */

const db = require('../infrastructure/db');
const vetores = require('../infrastructure/vetores');
const groq = require('../infrastructure/groq');
const sessao = require('../infrastructure/sessao');
const auditoria = require('../infrastructure/auditoria');
const { ADMIN_TOKEN } = require('../infrastructure/config');
const { ROLE_DEFS } = require('../entities/perfis');

async function health(req, res) {
  const groqUp = await groq.checkHealth();
  const models = groqUp ? await groq.listModels() : [];
  res.json({
    ok: true,
    mongo: {
      simulated: !db.isMongo(),
      degraded: db.isDegraded(),
      database: db.MONGO_DB,
      ...(await db.stats()),
    },
    vector: vetores.stats(),
    llm: {
      provider: 'groq',
      url: groq.GROQ_URL,
      model: groq.GROQ_MODEL,
      available: groqUp,
      models,
    },
    auth: {
      demo: true,
      session_ttl_hours: sessao.SESSION_TTL_HOURS,
      profiles: Object.keys(ROLE_DEFS),
    },
    admin: { reset: !!ADMIN_TOKEN },
  });
}

function reconectarLlm(req, res) {
  groq.invalidateCache();
  res.json({ ok: true });
}

async function reset(req, res) {
  const informado = req.get('x-admin-token') || (req.body && req.body.token) || '';
  // Em produção (ADMIN_TOKEN definido) o token continua obrigatório mesmo
  // para o perfil admin; sem ele a demo não pode ser apagada por visitantes.
  if (ADMIN_TOKEN && !sessao.adminTokenValido(informado)) {
    return res.status(403).json({ error: 'token de administrador inválido - informe o header x-admin-token' });
  }
  await db.reset();
  const info = await vetores.rebuild();
  await auditoria.registrar('Restauração de dados', 'Dados de demonstração restaurados', req.user);
  res.json({ ok: true, vector: info });
}

module.exports = { health, reconectarLlm, reset };
