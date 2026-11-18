/** Insumos e estoque (RF04) + reindexação do RAG (RF02). */

import { $, $$, esc, fmtBRL, fmtNum, riskTag, mostrar } from '../components/ui/index.js';
import { estoqueController, sessaoController } from '../controllers/index.js';
import { BUSCA_ESPERA_MS } from '../entities/catalogo.js';
import { atualizarStatus } from './topo.js';

const DESCRICAO_MAX = 70;
let esperaBusca = null;

const linha = (m, podeEditar) => `
  <tr>
    <td><code>${esc(m.codigo)}</code></td>
    <td><strong>${esc(m.nome)}</strong><div class="sub sub-sm">${esc(m.descricao || '').slice(0, DESCRICAO_MAX)}</div></td>
    <td>${esc(m.categoria)}</td>
    <td>${fmtNum(m.saldo)} ${esc(m.unidade)}</td>
    <td>${m.custo_unitario > 0 ? fmtBRL(m.custo_unitario) : '—'}</td>
    <td>${riskTag(m.risco)}</td>
    <td class="nowrap">${podeEditar ? `
      <button class="btn sm ghost" data-edit="${esc(m._id)}">Editar</button>
      <button class="btn sm danger" data-del="${esc(m._id)}">Excluir</button>` : '<span class="sub">—</span>'}
    </td>
  </tr>`;

export async function carregarMateriais() {
  const sel = $('#filtroCategoria');
  const atual = sel.value;
  const { rows, categorias } = await estoqueController.listar({ q: $('#buscaMaterial').value.trim(), categoria: atual });

  sel.innerHTML = '<option value="">Todas as categorias</option>' +
    categorias.map((c) => `<option${c === atual ? ' selected' : ''}>${esc(c)}</option>`).join('');

  const podeEditar = sessaoController.pode('materiais:write');
  $('#tblMateriais tbody').innerHTML = rows.map((m) => linha(m, podeEditar)).join('') ||
    '<tr><td colspan="7" class="empty">Nenhum material encontrado.</td></tr>';

  $$('#tblMateriais [data-edit]').forEach((b) => b.addEventListener('click', () => editar(b.dataset.edit)));
  $$('#tblMateriais [data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Excluir este material?')) return;
    await estoqueController.excluir(b.dataset.del);
    carregarMateriais();
    atualizarStatus();
  }));
}

async function editar(id) {
  const m = await estoqueController.editar(id);
  if (!m) return;
  $('#formMaterialTitulo').textContent = 'Editar material — ' + m.codigo;
  const f = $('#formMat');
  for (const [k, v] of Object.entries(m.campos)) if (f[k]) f[k].value = v;
  mostrar($('#formMaterial'), true);
}

export function montarEstoque() {
  $('#buscaMaterial').addEventListener('input', () => {
    clearTimeout(esperaBusca);
    esperaBusca = setTimeout(carregarMateriais, BUSCA_ESPERA_MS);
  });
  $('#filtroCategoria').addEventListener('change', carregarMateriais);

  $('#btnNovoMaterial').addEventListener('click', () => {
    estoqueController.novo();
    $('#formMaterialTitulo').textContent = 'Novo material';
    $('#formMat').reset();
    mostrar($('#formMaterial'), true);
  });
  $('#btnCancelForm').addEventListener('click', () => mostrar($('#formMaterial'), false));

  $('#formMat').addEventListener('submit', async (e) => {
    e.preventDefault();
    await estoqueController.salvar(Object.fromEntries(new FormData(e.target).entries()));
    mostrar($('#formMaterial'), false);
    carregarMateriais();
    atualizarStatus();
  });

  $('#btnReindex').addEventListener('click', async () => {
    const r = await estoqueController.reindexar();
    $('#badgeIndex').textContent = `${r.documents} docs indexados · vocab ${r.vocabulary}`;
    alert(`Reindexado: ${r.documents} documentos, ${r.vocabulary} termos no vocabulário.`);
  });
}

export function limparEstoque() {
  $('#tblMateriais tbody').innerHTML = '';
  mostrar($('#formMaterial'), false);
  $('#formMat').reset();
}
