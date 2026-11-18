import { http } from '../client.js';

export const sistema = {
  /** Estado do banco, do índice vetorial e do LLM. */
  saude: () => http.get('/health'),

  /** Restaura os dados de demonstração. Em produção exige o token de administrador. */
  restaurar: (tokenAdmin = '') => http.post('/reset', undefined, {
    cabecalhos: tokenAdmin ? { 'x-admin-token': tokenAdmin } : {},
  }),
};
