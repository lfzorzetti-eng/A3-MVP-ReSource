/**
 * Sessão de demonstração: token assinado com HMAC, sem estado (serverless).
 *
 * Formato do token: `<payload base64url>.<assinatura base64url>`, com
 * `sub` (e-mail), `iat` e `exp` em segundos.
 */

const crypto = require('crypto');
const { SESSION_SECRET, ADMIN_TOKEN, SESSION_TTL_HOURS } = require('./config');
const { DEMO_USERS, publicUser } = require('../entities/perfis');

// O fallback para ADMIN_TOKEN mantém as sessões estáveis no deploy atual.
const SECRET = SESSION_SECRET || ADMIN_TOKEN || 'resource-demo-session-secret-troque-em-producao';

if (!SESSION_SECRET && !ADMIN_TOKEN) {
  console.warn('[sessao] SESSION_SECRET/ADMIN_TOKEN ausentes - usando segredo de demonstração.');
}

/** Compara em tempo constante, mesmo com tamanhos diferentes. */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const assinar = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('base64url');

function signToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({
    sub: user.email,
    iat: now,
    exp: now + SESSION_TTL_HOURS * 60 * 60,
  })).toString('base64url');
  return `${body}.${assinar(body)}`;
}

/** Devolve o usuário público do token, ou null se inválido/expirado. */
function verifyToken(token) {
  try {
    const [body, signature] = String(token || '').split('.');
    if (!body || !signature) return null;
    if (!safeEqual(signature, assinar(body))) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;

    const user = DEMO_USERS.find((u) => u.email === payload.sub);
    return user ? publicUser(user) : null;
  } catch {
    return null;
  }
}

/** Valida e-mail/senha e devolve { token, user } ou null. */
function login(email, password) {
  const wanted = String(email || '').trim().toLowerCase();
  const user = DEMO_USERS.find((u) => u.email.toLowerCase() === wanted);
  if (!user) return null;
  if (!safeEqual(String(password || ''), user.password)) return null;
  return { token: signToken(user), user: publicUser(user) };
}

/** Token de administrador do reset. Sem ADMIN_TOKEN configurado, qualquer valor passa (dev local). */
function adminTokenValido(informado) {
  if (!ADMIN_TOKEN) return true;
  const a = Buffer.from(String(informado || ''));
  const b = Buffer.from(ADMIN_TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { SESSION_TTL_HOURS, signToken, verifyToken, login, adminTokenValido, safeEqual };
