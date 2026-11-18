/** Login, restauração da sessão salva, logout e checagem de permissão. */

import { api, sessao } from '../infrastructure/index.js';
import { pode } from '../entities/permissoes.js';

export const sessaoController = {
  usuario: () => sessao.usuario(),
  pode: (permissao) => pode(sessao.usuario(), permissao),
  perfisDemo: () => api.auth.perfisDemo(),

  async entrar(email, senha) {
    const { token, user } = await api.auth.entrar(email, senha);
    sessao.salvar(token, user);
    return user;
  },

  /**
   * Confere o token salvo no navegador.
   * @returns {Promise<{tipo:'sem-sessao'}|{tipo:'expirada'}|{tipo:'ok', usuario:object}>}
   */
  async restaurar() {
    if (!sessao.token()) return { tipo: 'sem-sessao' };
    try {
      const { user } = await api.auth.eu();
      sessao.salvar(sessao.token(), user);
      return { tipo: 'ok', usuario: user };
    } catch {
      sessao.limpar();
      return { tipo: 'expirada' };
    }
  },

  async sair() {
    try {
      await api.auth.sair();
    } catch {
      // a sessão pode já ter expirado; o logout local continua
    }
    sessao.limpar();
  },

  /** Sessão caiu no meio do uso (401): só limpa o local. */
  encerrarLocal: () => sessao.limpar(),
};
