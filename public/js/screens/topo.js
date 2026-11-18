/** Topo da plataforma: pílulas de status, usuário logado e ações por permissão. */

import { $, initials, mostrar } from '../components/ui/index.js';
import { sessaoController, statusController, MODO_API } from '../controllers/index.js';
import { STATUS_INTERVALO_MS } from '../entities/catalogo.js';

let timer = null;

const pilula = (el, on, titulo) => {
  el.className = on ? 'pill on' : 'pill off';
  if (titulo) el.title = titulo;
};

export async function atualizarStatus() {
  const s = await statusController.carregar();
  if (!s) {
    pilula($('#pillMongo'), false);
    pilula($('#pillVector'), false);
    pilula($('#pillLlm'), false);
    return;
  }
  pilula($('#pillMongo'), s.banco.on, s.banco.titulo);
  pilula($('#pillVector'), s.vetor.on, s.vetor.titulo);
  pilula($('#pillLlm'), s.llm.on, s.llm.titulo);
  const st = $('#llmStatus');
  st.textContent = s.llm.texto;
  st.classList.toggle('on', s.llm.on);
  const idx = $('#badgeIndex');
  if (idx) idx.textContent = s.indice;
}

export function iniciarStatus() {
  atualizarStatus();
  if (!timer) timer = setInterval(atualizarStatus, STATUS_INTERVALO_MS);
}

export function pararStatus() {
  clearInterval(timer);
  timer = null;
}

/** Nome, perfil e botões visíveis conforme as permissões do usuário. */
export function aplicarUsuario() {
  const u = sessaoController.usuario();
  if (!u) return;
  const pode = sessaoController.pode;
  $('#userAvatar').textContent = u.initials || initials(u.name);
  $('#userAvatar').className = `user-avatar role-${u.role}`;
  $('#userName').textContent = u.name;
  $('#userRole').textContent = `${u.roleLabel} · ${u.sector}`;

  mostrar($('#readonlyChip'), !pode('materiais:write') && !pode('residuos:write'));
  mostrar($('#mockChip'), MODO_API === 'mock');
  mostrar($('#btnNovoMaterial'), pode('materiais:write'));
  mostrar($('#btnReindex'), pode('rag:reindex'));
  mostrar($('#btnNovoResiduo'), pode('residuos:write'));
  mostrar($('#btnReset'), pode('demo:reset'));

  if (!pode('materiais:write')) mostrar($('#formMaterial'), false);
  if (!pode('residuos:write')) mostrar($('#formResiduo'), false);
}
