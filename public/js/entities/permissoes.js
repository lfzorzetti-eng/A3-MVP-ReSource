/** Regra de permissão do perfil, igual à do back (backend/entities/perfis.js). */

/** true se a permissão está na lista do perfil (`*` concede tudo). */
export function pode(usuario, permissao) {
  if (!usuario || !Array.isArray(usuario.permissions)) return false;
  return usuario.permissions.includes('*') || usuario.permissions.includes(permissao);
}
