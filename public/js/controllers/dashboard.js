/** Dashboard (RF05) e relatório executivo do agente (RF01). */

import { api } from '../infrastructure/index.js';

/** Barras de resíduos por categoria, com largura relativa ao maior valor. */
export function barras(porCategoria) {
  const cats = Object.entries(porCategoria || {});
  const max = Math.max(...cats.map(([, v]) => v), 1);
  return cats.map(([categoria, kg]) => ({ categoria, kg, pct: (kg / max) * 100 }));
}

/** "Groq (modelo)", "mock" ou "fallback local". */
export function nomeFonte(source, model) {
  if (source === 'groq') return `Groq (${model})`;
  if (source === 'mock') return 'modo mock';
  return 'fallback local';
}

export const dashboardController = {
  async carregar() {
    const [empresa, dash] = await Promise.all([api.painel.empresa(), api.painel.dashboard()]);
    return {
      empresa: `${empresa.nome} · ${empresa.setor} · ${empresa.unidade}`,
      indicadores: dash.indicadores,
      totais: dash.totais,
      barras: barras(dash.residuos_por_categoria),
      movimentacoes: dash.ultimas_movimentacoes,
    };
  },

  async analisar() {
    const r = await api.painel.analisarEstoque();
    return { ...r, fonte: nomeFonte(r.source, r.model) };
  },
};
