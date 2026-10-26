/**
 * Autenticação de demonstração do ReSource.
 *
 * Este módulo NÃO é um sistema de identidade de produção: os usuários são
 * fictícios e as senhas são públicas de propósito, para que qualquer visitante
 * da demo consiga explorar os diferentes perfis e permissões.
 *
 * O que ele entrega de verdade:
 *  - sessão assinada (HMAC) e sem estado, compatível com serverless;
 *  - perfis por setor com permissões declarativas;
 *  - identidade real do usuário na auditoria e nas conversas;
 *  - rotas de escrita protegidas por permissão.
 *
 * Para produção, troque DEMO_USERS por um provedor de identidade (Auth0,
 * Clerk, Cognito, etc.) e mantenha a mesma interface req.user/permissions.
 */

const crypto = require('crypto');

const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);
const DEMO_PASSWORD = 'demo123';

// Segredo da assinatura da sessão. Em produção, defina SESSION_SECRET.
// O fallback para ADMIN_TOKEN mantém as sessões estáveis no deploy atual.
const SECRET = String(
  process.env.SESSION_SECRET ||
  process.env.ADMIN_TOKEN ||
  'resource-demo-session-secret-troque-em-producao'
).trim();

if (!process.env.SESSION_SECRET && !process.env.ADMIN_TOKEN) {
  console.warn('[auth] SESSION_SECRET/ADMIN_TOKEN ausentes - usando segredo de demonstração.');
}

/**
 * Perfis de acesso. `*` concede tudo (administrador).
 * As permissões também são devolvidas ao frontend para esconder ações.
 */
const ROLE_DEFS = {
  admin: {
    label: 'Administrador',
    description: 'Acesso total, incluindo operação e restauração da demo.',
    permissions: ['*'],
  },
  gestor: {
    label: 'Gestor Ambiental',
    description: 'Visão completa: relatórios, estoque, resíduos, auditoria e reindexação.',
    permissions: [
      'dashboard:read', 'empresa:read', 'materiais:read', 'materiais:write',
      'residuos:read', 'residuos:write', 'movimentacoes:read', 'auditoria:read',
      'chat:use', 'analise:run', 'rag:read', 'rag:reindex',
    ],
  },
  estoque: {
    label: 'Operador de Estoque',
    description: 'Cadastro, edição e baixa de insumos no almoxarifado.',
    permissions: [
      'dashboard:read', 'empresa:read', 'materiais:read', 'materiais:write',
      'residuos:read', 'movimentacoes:read', 'auditoria:read',
      'chat:use', 'analise:run', 'rag:read',
    ],
  },
  residuos: {
    label: 'Analista de Resíduos',
    description: 'Registro de resíduos, destinações e acompanhamento operacional.',
    permissions: [
      'dashboard:read', 'empresa:read', 'materiais:read', 'residuos:read',
      'residuos:write', 'movimentacoes:read', 'auditoria:read',
      'chat:use', 'analise:run', 'rag:read',
    ],
  },
  auditor: {
    label: 'Auditor',
    description: 'Somente leitura: consultas, relatórios e trilha de auditoria.',
    permissions: [
      'dashboard:read', 'empresa:read', 'materiais:read', 'residuos:read',
      'movimentacoes:read', 'auditoria:read', 'chat:use', 'analise:run', 'rag:read',
    ],
  },
};

/**
 * Usuários fictícios da demo, um por setor.
 * A senha é exibida na tela de login de propósito.
 */
const DEMO_USERS = [
  {
    email: 'gestor@econova.com',
    password: DEMO_PASSWORD,
    name: 'Marina Alves',
    role: 'gestor',
    sector: 'Sustentabilidade',
    title: 'Gestora Ambiental',
  },
  {
    email: 'estoque@econova.com',
    password: DEMO_PASSWORD,
    name: 'Rafael Souza',
    role: 'estoque',
    sector: 'Almoxarifado',
    title: 'Operador de Estoque',
  },
  {
    email: 'residuos@econova.com',
    password: DEMO_PASSWORD,
    name: 'Bianca Lima',
    role: 'residuos',
    sector: 'Produção',
    title: 'Analista de Resíduos',
  },
  {
    email: 'auditor@econova.com',
    password: DEMO_PASSWORD,
    name: 'Carlos Menezes',
    role: 'auditor',
    sector: 'Compliance',
    title: 'Auditor Interno',
  },
  {
    email: 'admin@econova.com',
    password: DEMO_PASSWORD,
    name: 'TI ReSource',
    role: 'admin',
    sector: 'Plataforma',
    title: 'Administrador da Demo',
  },
];

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '??';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

/** Usuário seguro para devolver ao cliente (sem a senha). */
function publicUser(user) {
  const role = ROLE_DEFS[user.role] || { label: user.role, description: '', permissions: [] };
  return {
    email: user.email,
    name: user.name,
    firstName: user.name.split(/\s+/)[0],
    role: user.role,
    roleLabel: role.label,
    roleDescription: role.description,
    sector: user.sector,
    title: user.title,
    initials: initials(user.name),
    permissions: role.permissions,
  };
}

/** Lista de perfis para a tela de login. Inclui a senha de demo. */
function demoUsers() {
  return DEMO_USERS.map((u) => ({ ...publicUser(u), password: u.password }));
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.email,
    iat: now,
    exp: now + SESSION_TTL_HOURS * 60 * 60,
  };
  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const [body, signature] = String(token || '').split('.');
    if (!body || !signature) return null;

    const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    if (!safeEqual(signature, expected)) return null;

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

/** Middleware: exige sessão válida. */
function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({
      error: 'sessão inválida ou expirada - entre novamente',
      code: 'UNAUTHENTICATED',
    });
  }
  req.user = user;
  return next();
}

function can(user, permission) {
  if (!user || !Array.isArray(user.permissions)) return false;
  return user.permissions.includes('*') || user.permissions.includes(permission);
}

/** Middleware: exige uma permissão específica do perfil. */
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

module.exports = {
  DEMO_USERS,
  DEMO_PASSWORD,
  ROLE_DEFS,
  SESSION_TTL_HOURS,
  demoUsers,
  publicUser,
  login,
  verifyToken,
  requireAuth,
  requirePermission,
  can,
};
