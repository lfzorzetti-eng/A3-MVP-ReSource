/** Pílulas de status do topo: banco, índice vetorial e agente de IA. */

import { api } from '../infrastructure/index.js';

let resetProtegido = false;

/** Texto do banco: modo, se está degradado e a contagem por coleção. */
function tituloBanco(m) {
  const nome = m.simulated ? 'MongoDB simulado (arquivo local)' : `MongoDB (${m.database})`;
  const aviso = m.degraded ? ' - DEGRADADO: cluster não respondeu, usando banco simulado' : '';
  const contagem = Object.entries(m)
    .filter(([k]) => !['simulated', 'database', 'degraded'].includes(k))
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');
  return `${nome}${aviso}: ${contagem}`;
}

/** Converte o /health em dados prontos para a tela. Pura, para teste. */
export function resumirSaude(h) {
  const llmOn = !!h.llm.available;
  let llmTexto = llmOn ? `Groq online · ${h.llm.model}` : 'Groq offline — usando fallback local';
  if (h.mock) llmTexto = 'Modo mock — sem servidor e sem IA';
  return {
    banco: { on: !h.mongo.degraded, titulo: h.mock ? 'Banco mock no navegador' : tituloBanco(h.mongo) },
    vetor: { on: true, titulo: `Banco vetorial: ${h.vector.documents} docs, ${h.vector.vocabulary} termos` },
    llm: { on: llmOn, titulo: llmOn ? `Groq: ${h.llm.model}` : 'Groq indisponível — respostas via fallback local', texto: llmTexto },
    indice: `${h.vector.documents} docs indexados · vocab ${h.vector.vocabulary}`,
  };
}

export const statusController = {
  /** @returns {Promise<ReturnType<typeof resumirSaude>|null>} null se a API não respondeu */
  async carregar() {
    try {
      const h = await api.sistema.saude();
      resetProtegido = !!(h.admin && h.admin.reset);
      return resumirSaude(h);
    } catch {
      return null;
    }
  },
  resetProtegido: () => resetProtegido,
};
