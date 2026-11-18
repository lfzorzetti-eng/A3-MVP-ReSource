/** Consultor RAG (RF03): conversa atual, histórico e lista de conversas. */

import { api } from '../infrastructure/index.js';

let historico = [];
let conversaId = null;

export const chatController = {
  conversaAtual: () => conversaId,
  conversas: () => api.agente.conversas(),

  /** Abre uma conversa salva. Devolve as mensagens, ou null se já está aberta. */
  async abrir(id) {
    if (id === conversaId) return null;
    const doc = await api.agente.abrirConversa(id);
    conversaId = doc._id;
    const msgs = doc.mensagens || [];
    historico = msgs.map((m) => ({ role: m.role, content: m.content }));
    return msgs;
  },

  /** Exclui; devolve true se era a conversa aberta (a tela volta ao início). */
  async excluir(id) {
    await api.agente.excluirConversa(id);
    const eraAtual = conversaId === id;
    if (eraAtual) this.nova();
    return eraAtual;
  },

  nova() {
    conversaId = null;
    historico = [];
  },

  /** Envia a pergunta com o histórico anterior; guarda a resposta no histórico. */
  async enviar(texto) {
    historico.push({ role: 'user', content: texto });
    const r = await api.agente.perguntar(texto, historico.slice(0, -1), conversaId);
    if (r.chatId) conversaId = r.chatId;
    historico.push({ role: 'assistant', content: r.reply });
    return r;
  },
};
