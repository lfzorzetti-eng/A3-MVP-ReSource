/** Trilha de auditoria (RF06), exclusão de registros e restauração da demo. */

import { api, sessao } from '../infrastructure/index.js';
import { statusController } from './status.js';

/**
 * Roda uma ação que exige o token de administrador em produção.
 * `pedirToken` é chamado só quando a produção exige token e ele ainda não foi informado.
 * @returns {Promise<boolean>} false se a pessoa cancelou
 */
async function comTokenAdmin(pedirToken, acao) {
  if (statusController.resetProtegido() && !sessao.tokenAdmin()) {
    const t = pedirToken();
    if (!t) return false;
    sessao.salvarTokenAdmin(t);
  }
  try {
    await acao(sessao.tokenAdmin());
    return true;
  } catch (e) {
    sessao.limparTokenAdmin();
    throw e;
  }
}

export const auditoriaController = {
  listar: () => api.painel.auditorias(),

  /** Apaga só os registros escolhidos. Devolve false se a pessoa cancelou o token. */
  excluir: (ids, pedirToken) => comTokenAdmin(pedirToken, (token) => api.painel.excluirAuditorias(ids, token)),

  /** Restaura os dados da demonstração. Devolve false se a pessoa cancelou o token. */
  restaurar: (pedirToken) => comTokenAdmin(pedirToken, (token) => api.sistema.restaurar(token)),
};
