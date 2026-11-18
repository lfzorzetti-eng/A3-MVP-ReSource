/** Tela de entrada: formulário e cartões dos perfis de demonstração. */

import { $, esc, mostrar } from '../components/ui/index.js';
import { sessaoController, mensagemErro } from '../controllers/index.js';

const FOCO_ATRASO_MS = 60;

function erro(message = '', tom = 'error') {
  const el = $('#loginError');
  if (!el) return;
  el.textContent = message;
  mostrar(el, !!message);
  el.classList.toggle('notice', tom === 'notice');
}

export function mostrarLogin(message = '', tom = 'error') {
  document.body.classList.remove('auth-checking');
  document.body.classList.add('auth-locked');
  erro(message, tom);
  setTimeout(() => $('#loginEmail')?.focus(), FOCO_ATRASO_MS);
}

export function mostrarApp() {
  document.body.classList.remove('auth-checking', 'auth-locked');
}

const cartaoPerfil = (u) => `
  <button type="button" class="demo-user role-${esc(u.role)}" data-email="${esc(u.email)}"
          data-password="${esc(u.password)}" title="Entrar como ${esc(u.roleLabel)}">
    <span class="demo-user-top">
      <span class="demo-avatar role-${esc(u.role)}">${esc(u.initials)}</span>
      <span class="demo-user-id">
        <strong>${esc(u.name)}</strong>
        <span>${esc(u.title)} · ${esc(u.sector)}</span>
      </span>
      <span class="role-badge role-${esc(u.role)}">${esc(u.roleLabel)}</span>
    </span>
    <span class="demo-user-meta">
      <span><code>${esc(u.email)}</code></span>
      <span>senha <code>${esc(u.password)}</code></span>
    </span>
    <span class="demo-user-desc">${esc(u.roleDescription || '')}</span>
    <span class="demo-user-action">Entrar como ${esc(u.roleLabel)} →</span>
  </button>`;

/** Liga o formulário. `aoEntrar` roda depois do login bem-sucedido. */
export function montarLogin(aoEntrar) {
  async function entrar(email, senha) {
    const btn = $('#btnLogin');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    erro('');
    try {
      await sessaoController.entrar(email, senha);
      $('#loginPassword').value = '';
      mostrarApp();
      aoEntrar();
    } catch (e) {
      erro(mensagemErro(e, 'Não foi possível entrar.'));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  }

  $('#loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    entrar($('#loginEmail').value.trim(), $('#loginPassword').value);
  });

  return { entrar };
}

export async function carregarPerfis(entrar) {
  const box = $('#demoUsers');
  try {
    const data = await sessaoController.perfisDemo();
    if (data.session_ttl_hours) $('#sessionTtl').textContent = `${data.session_ttl_hours} h`;
    box.innerHTML = data.users.map(cartaoPerfil).join('');
    box.querySelectorAll('[data-email]').forEach((btn) => {
      btn.addEventListener('click', () => entrar(btn.dataset.email, btn.dataset.password));
    });
  } catch {
    box.innerHTML = '<p class="empty">Não foi possível carregar os perfis agora. Use o formulário acima.</p>';
  }
}
