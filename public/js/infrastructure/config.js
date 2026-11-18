/**
 * Escolhe de onde vêm os dados: `http` (API real em /api) ou `mock` (back
 * falso no navegador). Troque pela URL: `?api=mock` ou `?api=http`. A escolha
 * fica salva no navegador até ser trocada de novo. Padrão: http.
 */

import { local } from './armazenamento.js';

const CHAVE = 'resource_api_modo';
const MODOS = ['http', 'mock'];

function lerModo() {
  const pedido = new URLSearchParams(globalThis.location?.search || '').get('api');
  if (MODOS.includes(pedido)) {
    local.setItem(CHAVE, pedido);
    return pedido;
  }
  const salvo = local.getItem(CHAVE);
  return MODOS.includes(salvo) ? salvo : 'http';
}

export const MODO_API = lerModo();
export const BASE_URL = '/api';

/** Tempo máximo de uma chamada HTTP (a função da Vercel vai até 120 s). */
export const TIMEOUT_MS = 120000;
