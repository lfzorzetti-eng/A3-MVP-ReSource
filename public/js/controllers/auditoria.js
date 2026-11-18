/** Trilha de auditoria (RF06) e restauração da demo. */

import { api, sessao } from '../infrastructure/index.js';
import { statusController } from './status.js';

export const auditoriaController = {
  listar: () => api.painel.auditorias(),

  /**
   * Restaura os dados da demonstração.
   * `pedirToken` é chamado só quando a produção exige token e ele ainda não foi informado.
   * @returns {Promise<boolean>} false se a pessoa cancelou
   */
  async restaurar(pedirToken) {
    if (statusController.resetProtegido() && !sessao.tokenAdmin()) {
      const t = pedirToken();
      if (!t) return false;
      sessao.salvarTokenAdmin(t);
    }
    try {
      await api.sistema.restaurar(sessao.tokenAdmin());
      return true;
    } catch (e) {
      sessao.limparTokenAdmin();
      throw e;
    }
  },
};
