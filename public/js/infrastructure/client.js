/**
 * Escolhe o transporte (http ou mock), injeta o token e trata sessão perdida
 * (401) e ação negada (403/429). Os recursos usam só os helpers daqui.
 */

import { MODO_API, BASE_URL, TIMEOUT_MS } from './config.js';
import { criarTransporteHttp } from './http.js';
import { transporteMock } from './mock.js';
import { sessao } from './sessao.js';
import { erroApi } from './erros.js';

const transporte = MODO_API === 'mock' ? transporteMock : criarTransporteHttp(BASE_URL, { timeoutMs: TIMEOUT_MS });

let avisos = { semLogin: () => {}, negado: () => {} };

/** A camada de cima diz o que fazer quando a sessão cai ou a ação é negada. */
export function configurarClient({ semLogin, negado } = {}) {
  avisos = { semLogin: semLogin || avisos.semLogin, negado: negado || avisos.negado };
}

/**
 * @param {object} [opts]
 * @param {object} [opts.json]
 * @param {Record<string,string>} [opts.cabecalhos]
 * @param {boolean} [opts.ignorarSemLogin]  401 vira só erro (login, verificação de sessão)
 */
async function request(metodo, endpoint, { json, cabecalhos, ignorarSemLogin = false } = {}) {
  try {
    return await transporte.enviar({ metodo, endpoint, json, cabecalhos, token: sessao.token() });
  } catch (e) {
    if (e.semLogin && !ignorarSemLogin) avisos.semLogin('Sua sessão expirou. Entre novamente.');
    else if (e.status === 403 || e.status === 429) avisos.negado(e.message);
    throw e;
  }
}

export const http = {
  get: (endpoint, opts) => request('GET', endpoint, opts),
  post: (endpoint, json, opts) => request('POST', endpoint, { ...opts, json }),
  put: (endpoint, json, opts) => request('PUT', endpoint, { ...opts, json }),
  delete: (endpoint, opts) => request('DELETE', endpoint, opts),
};

/** { q: 'pead', categoria: '' } → "?q=pead" (ignora vazios). */
export function qs(params = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Valida antes de mandar: campo obrigatório. */
export function exigir(valor, nome) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    throw erroApi(`Informe ${nome}.`, { status: 400 });
  }
  return valor;
}
