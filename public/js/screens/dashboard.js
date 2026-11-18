/** Dashboard ambiental (RF05) e relatório executivo com IA (RF01). */

import { $, esc, fmtBRL, fmtNum, renderMd, mostrar } from '../components/ui/index.js';
import { dashboardController, mensagemErro } from '../controllers/index.js';
import { atualizarStatus } from './topo.js';

const PERIGOSOS_ALERTA = 3;

const kpi = (label, valor, dica, tom = '') =>
  `<div class="kpi ${tom}"><div class="label">${label}</div><div class="value">${valor}</div><div class="hint">${dica}</div></div>`;

export async function carregarDashboard() {
  try {
    const d = await dashboardController.carregar();
    const i = d.indicadores;
    const t = d.totais;
    $('#empresaNome').textContent = d.empresa;

    $('#kpis').innerHTML = [
      kpi('Taxa de reciclagem', `${i.taxa_reciclagem_atual_pct}%`, `Meta zero waste: ${i.meta_zero_waste_pct}%`),
      kpi('CO₂ evitado / mês', `${fmtNum(i.co2_evitado_kg_mes)} kg`, 'Cálculo sobre destinações corretas'),
      kpi('Economia mensal', fmtBRL(i.economia_mensal_brl), 'Com redução de descarte'),
      kpi('Risco alto', t.materiais_risco_alto, 'materiais químicos em estoque', 'warn'),
      kpi('Resíduos perigosos', t.residuos_perigosos, `${fmtNum(t.kg_residuos)} kg gerados no período`, t.residuos_perigosos > PERIGOSOS_ALERTA ? 'danger' : 'warn'),
    ].join('');

    $('#barsResiduos').innerHTML = d.barras.length
      ? d.barras.map((b) => `<div class="bar-row"><span>${esc(b.categoria)}</span><div class="bar-track"><div class="bar-fill" style="width:${b.pct}%"></div></div><span class="bar-val">${fmtNum(b.kg)}</span></div>`).join('')
      : '<div class="empty">Sem resíduos registrados.</div>';

    $('#tblMov tbody').innerHTML = d.movimentacoes.map((m) => `
      <tr><td>${esc(m.data)}</td><td>${esc(m.material_nome)}</td>
      <td><span class="tag ${m.tipo === 'entrada' ? 'in' : 'out'}">${esc(m.tipo)}</span></td>
      <td>${fmtNum(m.quantidade)} ${esc(m.unidade)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Nenhuma movimentação.</td></tr>';
  } catch (e) {
    console.error(e);
  }
}

async function analisar() {
  const btn = $('#btnAnalise');
  btn.disabled = true;
  btn.textContent = 'Analisando…';
  mostrar($('#analiseSpinner'), true);
  mostrar($('#analiseReport'), false);
  try {
    const r = await dashboardController.analisar();
    const report = $('#analiseReport');
    report.innerHTML = renderMd(r.report) +
      `<div class="meta-line">Fonte: <strong>${esc(r.fonte)}</strong> · ${r.latency_ms} ms · ${r.resumo.materiais} materiais · ${r.resumo.risco_alto} risco alto · ${r.resumo.residuos_perigosos} resíduos perigosos</div>`;
    mostrar(report, true);
    atualizarStatus();
  } catch (e) {
    alert('Erro na análise: ' + mensagemErro(e));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analisar com IA';
    mostrar($('#analiseSpinner'), false);
  }
}

export function montarDashboard() {
  $('#btnRefreshDash').addEventListener('click', carregarDashboard);
  $('#btnAnalise').addEventListener('click', analisar);
}

export function limparDashboard() {
  $('#kpis').innerHTML = '';
  $('#tblMov tbody').innerHTML = '';
  mostrar($('#analiseReport'), false);
  mostrar($('#analiseSpinner'), false);
}
