import { http, exigir } from '../client.js';

export const auth = {
  /** Perfis fictícios da tela de login (com a senha de demonstração). */
  perfisDemo: () => http.get('/auth/demo-users', { ignorarSemLogin: true }),

  /** @returns {Promise<{token:string, user:import('../../models/tipos.js').UsuarioPublico}>} */
  entrar(email, senha) {
    exigir(email, 'o e-mail');
    exigir(senha, 'a senha');
    return http.post('/auth/login', { email, password: senha }, { ignorarSemLogin: true });
  },

  /** Confere se o token salvo ainda vale. */
  eu: () => http.get('/auth/me', { ignorarSemLogin: true }),

  sair: () => http.post('/auth/logout', undefined, { ignorarSemLogin: true }),
};
