/** Auditoria do agente (RF06) e restauração da demo. */

import { $, esc, dataHora } from '../components/ui/index.js';
import { auditoriaController, sessaoController, mensagemErro } from '../controllers/index.js';
import { atualizarStatus } from './topo.js';
import { novaConversa, carregarConversas } from './chat.js';

const linha = (a) => `
  <tr><td>${dataHora(a.data || a.created_at)}</td>
  <td><strong>${esc(a.evento)}</strong></td>
  <td>${esc(a.detalhe)}</td>
  <td title="${esc(a.usuario_email || '')}">
    ${esc(a.usuario || 'sistema')}
    ${a.usuario_role ? `<div class="sub sub-xs">${esc(a.usuario_role)}${a.usuario_setor ? ' · ' + esc(a.usuario_setor) : ''}</div>` : ''}
  </td></tr>`;

export async function carregarAuditoria() {
  const rows = await auditoriaController.listar();
  $('#tblAudit tbody').innerHTML = rows.map(linha).join('') || '<tr><td colspan="4" class="empty">Sem registros.</td></tr>';
}

async function restaurar() {
  if (!sessaoController.pode('demo:reset')) return;
  if (!confirm('Restaurar todos os dados para o estado inicial da demonstração?')) return;
  try {
    const feito = await auditoriaController.restaurar(() => prompt('Token de administrador (header x-admin-token):'));
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
  $('#btnReset').addEventListener('click', restaurar);
}

export function limparAuditoria() {
  $('#tblAudit tbody').innerHTML = '';
}
