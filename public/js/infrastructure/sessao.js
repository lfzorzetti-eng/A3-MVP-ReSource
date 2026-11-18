/** Token e usuário da sessão no navegador; token de admin só na aba atual. */

import { local, sessaoNavegador } from './armazenamento.js';

const CHAVE_SESSAO = 'resource_session';
const CHAVE_ADMIN = 'resource_admin_token';

function ler() {
  try {
    const raw = local.getItem(CHAVE_SESSAO);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let atual = ler();

export const sessao = {
  token: () => atual?.token || '',
  /** @returns {import('../models/tipos.js').UsuarioPublico|null} */
  usuario: () => atual?.user || null,
  salvar(token, user) {
    atual = { token, user };
    local.setItem(CHAVE_SESSAO, JSON.stringify(atual));
  },
  limpar() {
    atual = null;
    local.removeItem(CHAVE_SESSAO);
    sessaoNavegador.removeItem(CHAVE_ADMIN);
  },
  tokenAdmin: () => sessaoNavegador.getItem(CHAVE_ADMIN) || '',
  salvarTokenAdmin: (t) => sessaoNavegador.setItem(CHAVE_ADMIN, t),
  limparTokenAdmin: () => sessaoNavegador.removeItem(CHAVE_ADMIN),
};
