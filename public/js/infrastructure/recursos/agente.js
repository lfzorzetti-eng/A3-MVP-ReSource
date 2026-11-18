import { http, exigir } from '../client.js';

export const agente = {
  /**
   * Pergunta ao consultor RAG (RF03).
   * `historico` são as mensagens anteriores (sem a pergunta atual); `chatId` null cria conversa nova.
   * @returns {Promise<import('../../models/tipos.js').RespostaChat>}
   */
  perguntar(mensagem, historico = [], chatId = null) {
    exigir(mensagem, 'a pergunta');
    return http.post('/chat', { message: mensagem, history: historico, chatId });
  },

  /** @returns {Promise<import('../../models/tipos.js').ResumoConversa[]>} */
  conversas: () => http.get('/chats'),
  abrirConversa: (id) => http.get(`/chats/${encodeURIComponent(id)}`),
  excluirConversa: (id) => http.delete(`/chats/${encodeURIComponent(id)}`),

  /** Refaz o índice vetorial (RF02). */
  reindexar: () => http.post('/rag/reindex'),
};
