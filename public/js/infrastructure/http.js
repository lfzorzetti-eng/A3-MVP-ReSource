/** Transporte real: fetch na API com tempo máximo e erro amigável. */

import { erroApi } from './erros.js';

/** @returns {import('./transporte.js').Transporte} */
export function criarTransporteHttp(baseUrl, { timeoutMs = 120000 } = {}) {
  return {
    async enviar({ metodo = 'GET', endpoint, json, token, cabecalhos = {} }) {
      const headers = { 'Content-Type': 'application/json', ...cabecalhos };
      if (token) headers.Authorization = `Bearer ${token}`;

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res;
      try {
        res = await fetch(`${baseUrl}${endpoint}`, {
          method: metodo,
          headers,
          body: json === undefined ? undefined : JSON.stringify(json),
          signal: ctrl.signal,
        });
      } catch (e) {
        const demorou = e.name === 'AbortError';
        throw erroApi(demorou ? 'O servidor demorou demais para responder.' : 'Sem conexão com o servidor.', { offline: !demorou });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw erroApi(payload.error || `HTTP ${res.status}`, { status: res.status, semLogin: res.status === 401 });
      }
      return res.json();
    },
  };
}
