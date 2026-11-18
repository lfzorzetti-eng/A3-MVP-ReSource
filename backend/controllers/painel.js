/** Dashboard (RF05), análise de estoque com IA (RF01) e trilha de auditoria (RF06). */

const db = require('../infrastructure/db');
const groq = require('../infrastructure/groq');
const auditoria = require('../infrastructure/auditoria');
const { PROMPT_ANALISE } = require('../entities/prompts');

const SALDO_BAIXO = 100;
const LIMITE_AUDITORIA = 50;

const ehPerigoso = (r) => r.classe.includes('Perigoso');

/** Totais do dashboard a partir das coleções. Pura, para teste. */
function resumirPainel(materiais, residuos) {
  const porCategoria = {};
  for (const r of residuos) porCategoria[r.categoria] = (porCategoria[r.categoria] || 0) + Number(r.quantidade_kg);
  const valorEstoque = materiais.reduce((s, m) => s + m.saldo * m.custo_unitario, 0);
  return {
    totais: {
      materiais: materiais.length,
      residuos: residuos.length,
      kg_residuos: residuos.reduce((s, r) => s + Number(r.quantidade_kg), 0),
      valor_estoque_brl: Number(valorEstoque.toFixed(2)),
      materiais_risco_alto: materiais.filter((m) => m.risco === 'Alto').length,
      residuos_perigosos: residuos.filter(ehPerigoso).length,
    },
    residuos_por_categoria: porCategoria,
  };
}

async function dashboard(req, res) {
  const materiais = await db.collection('materiais').all();
  const residuos = await db.collection('residuos').all();
  const movimentacoes = await db.collection('movimentacoes').all();
  res.json({
    indicadores: await db.config('indicadores'),
    ...resumirPainel(materiais, residuos),
    ultimas_movimentacoes: movimentacoes.slice(-5).reverse(),
  });
}

async function listarAuditorias(req, res) {
  const rows = (await db.collection('auditorias').all()).slice().reverse().slice(0, LIMITE_AUDITORIA);
  res.json(rows);
}

async function analisarEstoque(req, res) {
  const materiais = await db.collection('materiais').all();
  const residuos = await db.collection('residuos').all();
  const ind = await db.config('indicadores');

  const criticos = materiais.filter((m) => m.risco === 'Alto');
  const baixoEstoque = materiais.filter((m) => m.saldo < SALDO_BAIXO);
  const perigosos = residuos.filter(ehPerigoso);

  const dados = `MATERIAIS (${materiais.length}): ${materiais.map((m) => `${m.nome} [${m.categoria}] saldo=${m.saldo}${m.unidade} risco=${m.risco}`).join('; ')}
RESÍDUOS (${residuos.length}): ${residuos.map((r) => `${r.nome} ${r.quantidade_kg}kg ${r.classe} destino=${r.destino_atual}`).join('; ')}
INDICADORES: taxa reciclagem=${ind.taxa_reciclagem_atual_pct}%, meta zero waste=${ind.meta_zero_waste_pct}%, CO2 evitado=${ind.co2_evitado_kg_mes}kg/mês, economia=R$${ind.economia_mensal_brl}/mês
ALERTAS: ${criticos.length} materiais de risco alto (${criticos.map((m) => m.nome).join(', ')}), ${baixoEstoque.length} materiais com saldo baixo, ${perigosos.length} resíduos perigosos no período.`;

  const t0 = Date.now();
  const result = await groq.chat(
    [{ role: 'system', content: PROMPT_ANALISE }, { role: 'user', content: dados }],
    { temperature: 0.3, timeoutMs: 60000 }
  );
  const latencyMs = Date.now() - t0;

  await auditoria.registrar('Análise de estoque', `Agente analisou ${materiais.length} materiais (${result.source}, ${latencyMs}ms)`, req.user);

  res.json({
    report: result.text,
    source: result.source,
    model: result.model,
    latency_ms: latencyMs,
    resumo: {
      materiais: materiais.length,
      risco_alto: criticos.length,
      saldo_baixo: baixoEstoque.length,
      residuos_perigosos: perigosos.length,
    },
  });
}

module.exports = { resumirPainel, dashboard, listarAuditorias, analisarEstoque };
