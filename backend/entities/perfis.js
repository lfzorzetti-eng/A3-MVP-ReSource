/**
 * Catálogo fixo de perfis e usuários da demonstração.
 *
 * Dados fictícios: as senhas são públicas de propósito, para que qualquer
 * visitante explore as permissões de cada setor. Para produção, troque
 * DEMO_USERS por um provedor de identidade e mantenha o formato de
 * `permissions`.
 */

const congelar = (obj) => Object.freeze(obj);

const DEMO_PASSWORD = 'demo123';

/** Perfis de acesso. `*` concede tudo (administrador). */
const ROLE_DEFS = congelar({
  admin: congelar({
    label: 'Administrador',
    description: 'Acesso total, incluindo operação e restauração da demo.',
    permissions: congelar(['*']),
  }),
  gestor: congelar({
    label: 'Gestor Ambiental',
    description: 'Visão completa: relatórios, estoque, resíduos, auditoria e reindexação.',
    permissions: congelar([
      'dashboard:read', 'empresa:read', 'materiais:read', 'materiais:write',
      'residuos:read', 'residuos:write', 'movimentacoes:read', 'auditoria:read',
      'chat:use', 'analise:run', 'rag:read', 'rag:reindex',
    ]),
  }),
  estoque: congelar({
    label: 'Operador de Estoque',
    description: 'Cadastro, edição e baixa de insumos no almoxarifado.',
    permissions: congelar([
      'dashboard:read', 'empresa:read', 'materiais:read', 'materiais:write',
      'residuos:read', 'movimentacoes:read', 'auditoria:read',
      'chat:use', 'analise:run', 'rag:read',
    ]),
  }),
  residuos: congelar({
    label: 'Analista de Resíduos',
    description: 'Registro de resíduos, destinações e acompanhamento operacional.',
    permissions: congelar([
      'dashboard:read', 'empresa:read', 'materiais:read', 'residuos:read',
      'residuos:write', 'movimentacoes:read', 'auditoria:read',
      'chat:use', 'analise:run', 'rag:read',
    ]),
  }),
  auditor: congelar({
    label: 'Auditor',
    description: 'Somente leitura: consultas, relatórios e trilha de auditoria.',
    permissions: congelar([
      'dashboard:read', 'empresa:read', 'materiais:read', 'residuos:read',
      'movimentacoes:read', 'auditoria:read', 'chat:use', 'analise:run', 'rag:read',
    ]),
  }),
});

/** Um usuário fictício por setor. */
const DEMO_USERS = congelar([
  { email: 'gestor@econova.com', name: 'Marina Alves', role: 'gestor', sector: 'Sustentabilidade', title: 'Gestora Ambiental' },
  { email: 'estoque@econova.com', name: 'Rafael Souza', role: 'estoque', sector: 'Almoxarifado', title: 'Operador de Estoque' },
  { email: 'residuos@econova.com', name: 'Bianca Lima', role: 'residuos', sector: 'Produção', title: 'Analista de Resíduos' },
  { email: 'auditor@econova.com', name: 'Carlos Menezes', role: 'auditor', sector: 'Compliance', title: 'Auditor Interno' },
  { email: 'admin@econova.com', name: 'TI ReSource', role: 'admin', sector: 'Plataforma', title: 'Administrador da Demo' },
].map((u) => congelar({ ...u, password: DEMO_PASSWORD })));

/** "Marina Alves" → "MA". */
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
    permissions: [...role.permissions],
  };
}

/** Lista de perfis para a tela de login. Inclui a senha de demo. */
function demoUsers() {
  return DEMO_USERS.map((u) => ({ ...publicUser(u), password: u.password }));
}

function can(user, permission) {
  if (!user || !Array.isArray(user.permissions)) return false;
  return user.permissions.includes('*') || user.permissions.includes(permission);
}

module.exports = { DEMO_PASSWORD, ROLE_DEFS, DEMO_USERS, initials, publicUser, demoUsers, can };
