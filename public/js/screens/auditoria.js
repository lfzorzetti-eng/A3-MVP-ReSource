/** Auditoria do agente (RF06), exclusão de registros e restauração da demo. */

import { $, $$, esc, dataHora, toast } from '../components/ui/index.js';
import { auditoriaController, sessaoController, mensagemErro } from '../controllers/index.js';
import { atualizarStatus } from './topo.js';
import { novaConversa, carregarConversas } from './chat.js';

const pedirToken = () => prompt('Token de administrador (header x-admin-token):');

const marcados = () => [...$$('#tblAudit [data-audit]:checked')].map((c) => c.dataset.audit);

/** Botão e "selecionar todos" acompanham o que está marcado. */
function atualizarSelecao() {
  const total = $$('#tblAudit [data-audit]').length;
  const n = marcados().length;
  $('#btnExcluirAudit').disabled = !n;
  $('#btnExcluirAudit').textContent = n ? `Excluir selecionados (${n})` : 'Excluir selecionados';
  $('#chkAuditTodos').checked = total > 0 && n === total;
  $('#chkAuditTodos').indeterminate = n > 0 && n < total;
}

const linha = (a, podeExcluir) => `
  <tr>${podeExcluir ? `<td><input type="checkbox" class="check" data-audit="${esc(a._id)}" aria-label="Selecionar ${esc(a.evento)}" /></td>` : ''}
  <td>${dataHora(a.data || a.created_at)}</td>
  <td><strong>${esc(a.evento)}</strong></td>
  <td>${esc(a.detalhe)}</td>
  <td title="${esc(a.usuario_email || '')}">
    ${esc(a.usuario || 'sistema')}
    ${a.usuario_role ? `<div class="sub sub-xs">${esc(a.usuario_role)}${a.usuario_setor ? ' · ' + esc(a.usuario_setor) : ''}</div>` : ''}
  </td></tr>`;

export async function carregarAuditoria() {
  const rows = await auditoriaController.listar();
  const podeExcluir = sessaoController.pode('auditoria:delete');
  $('#tblAudit tbody').innerHTML = rows.map((a) => linha(a, podeExcluir)).join('') ||
    `<tr><td colspan="${podeExcluir ? 5 : 4}" class="empty">Sem registros.</td></tr>`;
  atualizarSelecao();
}

async function excluirSelecionados() {
  const ids = marcados();
  if (!ids.length) return;
  if (!confirm(`Excluir ${ids.length} registro(s) da auditoria? Não dá para desfazer.`)) return;
  $('#btnExcluirAudit').disabled = true;
  try {
    const feito = await auditoriaController.excluir(ids, pedirToken);
    if (!feito) return;
    toast(`${ids.length} registro(s) excluído(s).`, 'success');
    await carregarAuditoria();
    atualizarStatus();
  } catch (e) {
    alert(`Não foi possível excluir os registros: ${mensagemErro(e)}`);
  } finally {
    atualizarSelecao();
  }
}

async function restaurar() {
  if (!sessaoController.pode('demo:reset')) return;
  if (!confirm('Restaurar todos os dados para o estado inicial da demonstração?')) return;
  try {
    const feito = await auditoriaController.restaurar(pedirToken);
    if (!feito) return;
    novaConversa();
    atualizarStatus();
    carregarAuditoria();
    carregarConversas();
  } catch (e) {
    alert(`Não foi possível restaurar os dados: ${mensagemErro(e)}`);
  }
}

export function montarAuditoria() {
  $('#btnRefreshAudit').addEventListener('click', carregarAuditoria);
  $('#btnExcluirAudit').addEventListener('click', excluirSelecionados);
  $('#chkAuditTodos').addEventListener('change', (e) => {
    $$('#tblAudit [data-audit]').forEach((c) => { c.checked = e.target.checked; });
    atualizarSelecao();
  });
  $('#tblAudit tbody').addEventListener('change', atualizarSelecao);
  $('#btnReset').addEventListener('click', restaurar);
}

export function limparAuditoria() {
  $('#tblAudit tbody').innerHTML = '';
  atualizarSelecao();
}
