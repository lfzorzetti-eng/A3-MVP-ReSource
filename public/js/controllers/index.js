/** Contrato público da camada de controllers. Telas importam só daqui. */

export { sessaoController } from './sessao.js';
export { statusController } from './status.js';
export { dashboardController } from './dashboard.js';
export { estoqueController } from './estoque.js';
export { chatController } from './chat.js';
export { auditoriaController } from './auditoria.js';
export { mensagemErro, configurarClient, MODO_API } from '../infrastructure/index.js';
