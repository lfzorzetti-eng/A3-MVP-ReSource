/**
 * Middlewares que protegem as rotas: sessão, permissão, rate limit e o
 * wrapper de handlers async.
 */

const sessao = require('../infrastructure/sessao');
const { can } = require('../entities/perfis');
const { RATE_LIMIT_ATIVO } = require('../infrastructure/config');

/** Express 4 não captura rejeições de handlers async; sem isto a request fica pendurada. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Exige sessão válida e preenche req.user. */
function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const user = sessao.verifyToken(token);
  if (!user) {
    return res.status(401).json({
      error: 'sessão inválida ou expirada - entre novamente',
      code: 'UNAUTHENTICATED',
    });
  }
  req.user = user;
  return next();
}

/** Exige uma permissão específica do perfil. */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!can(req.user, permission)) {
      return res.status(403).json({
        error: `seu perfil (${req.user?.roleLabel || 'sem perfil'}) não tem permissão para esta ação`,
        code: 'FORBIDDEN',
        permission,
      });
    }
    return next();
  };
}

const JANELA_MS = 60000;

/** Limitador simples por IP (protege a cota do Groq em deploy público). */
function rateLimit(maxPorMinuto) {
  const hits = new Map();
  return (req, res, next) => {
    if (!RATE_LIMIT_ATIVO) return next();
    const ip = req.ip || req.socket.remoteAddress || 'desconhecido';
    const agora = Date.now();
    const recentes = (hits.get(ip) || []).filter((t) => agora - t < JANELA_MS);
    if (recentes.length >= maxPorMinuto) {
      return res.status(429).json({ error: 'muitas requisições - aguarde um instante' });
    }
    recentes.push(agora);
    hits.set(ip, recentes);
    if (hits.size > 5000) hits.clear();
    next();
  };
}

module.exports = { wrap, requireAuth, requirePermission, rateLimit };
