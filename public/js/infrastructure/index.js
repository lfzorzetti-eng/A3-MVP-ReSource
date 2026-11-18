/** Contrato público da camada infrastructure. Controllers importam só daqui. */

import { auth } from './recursos/auth.js';
import { sistema } from './recursos/sistema.js';
import { painel } from './recursos/painel.js';
import { materiais, residuos } from './recursos/estoque.js';
import { agente } from './recursos/agente.js';

export const api = { auth, sistema, painel, materiais, residuos, agente };

export { sessao } from './sessao.js';
export { mensagemErro } from './erros.js';
export { configurarClient } from './client.js';
export { MODO_API } from './config.js';
