/** Resíduos e destinações. */

import { $, esc, fmtNum, mostrar } from '../components/ui/index.js';
import { estoqueController } from '../controllers/index.js';
import { atualizarStatus } from './topo.js';

const cartao = (r) => {
  const perigoso = r.classe.includes('Perigoso');
  return `
    <div class="res-card ${perigoso ? 'danger' : ''}">
      <h4>${esc(r.nome)}</h4>
      <div class="kg">${fmtNum(r.quantidade_kg)} kg</div>
      <div class="meta">
        Categoria: <strong>${esc(r.categoria)}</strong><br>
        Classe: <span class="tag ${perigoso ? 'high' : 'low'}">${esc(r.classe)}</span><br>
        Destino: <strong>${esc(r.destino_atual)}</strong><br>
        Parceiro: ${esc(r.fornecedor_destino || '—')}<br>
        Gerado em: ${esc(r.gerado_em)}
      </div>
    </div>`;
};

export async function carregarResiduos() {
  const rows = await estoqueController.listarResiduos();
  $('#gridResiduos').innerHTML = rows.map(cartao).join('') || '<div class="empty">Nenhum resíduo registrado.</div>';
}

export function montarResiduos() {
  $('#btnNovoResiduo').addEventListener('click', () => {
    $('#formRes').reset();
    mostrar($('#formResiduo'), true);
  });
  $('#btnCancelRes').addEventListener('click', () => mostrar($('#formResiduo'), false));
  $('#formRes').addEventListener('submit', async (e) => {
    e.preventDefault();
    await estoqueController.registrarResiduo(Object.fromEntries(new FormData(e.target).entries()));
    mostrar($('#formResiduo'), false);
    carregarResiduos();
    atualizarStatus();
  });
}

export function limparResiduos() {
  $('#gridResiduos').innerHTML = '';
  mostrar($('#formResiduo'), false);
  $('#formRes').reset();
}
