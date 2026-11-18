/** Login de demonstração: perfis fictícios, exibidos na tela de entrada de propósito. */

const sessao = require('../infrastructure/sessao');
const auditoria = require('../infrastructure/auditoria');
const { DEMO_PASSWORD, ROLE_DEFS, demoUsers } = require('../entities/perfis');

function perfisDemo(req, res) {
  res.json({
    demo: true,
    password: DEMO_PASSWORD,
    session_ttl_hours: sessao.SESSION_TTL_HOURS,
    roles: Object.entries(ROLE_DEFS).map(([role, def]) => ({ role, ...def })),
    users: demoUsers(),
  });
}

async function login(req, res) {
  const { email, password } = req.body || {};
  const session = sessao.login(email, password);
  if (!session) {
    await auditoria.registrar('Tentativa de login malsucedida', `e-mail: ${String(email || '(vazio)').slice(0, 120)}`);
    return res.status(401).json({ error: 'e-mail ou senha inválidos' });
  }
  await auditoria.registrar('Login', `${session.user.name} entrou como ${session.user.roleLabel}`, session.user);
  res.json(session);
}

function eu(req, res) {
  res.json({ user: req.user });
}

async function logout(req, res) {
  await auditoria.registrar('Logout', `${req.user.name} saiu da plataforma`, req.user);
  res.json({ ok: true });
}

module.exports = { perfisDemo, login, eu, logout };
