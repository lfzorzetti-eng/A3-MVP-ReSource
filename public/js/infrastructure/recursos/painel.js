import { http } from '../client.js';

export const painel = {
  empresa: () => http.get('/empresa'),
  dashboard: () => http.get('/dashboard'),
  /** Relatório executivo do agente (RF01). Pode levar até ~60 s com o LLM. */
  analisarEstoque: () => http.post('/estoque/analise'),
  /** @returns {Promise<import('../../models/tipos.js').Auditoria[]>} */
  auditorias: () => http.get('/auditorias'),
};
