/**
 * Entrada do front (papel das rotas): liga as abas às telas, monta cada tela
 * uma vez e decide entre login e plataforma. Nenhuma regra mora aqui.
 */

import { $$, toast, preencherOpcoes } from './components/ui/index.js';
import { OPCOES } from './entities/catalogo.js';
import { sessaoController, configurarClient } from './controllers/index.js';
import { mostrarLogin, mostrarApp, montarLogin, carregarPerfis } from './screens/login.js';
import { aplicarUsuario, iniciarStatus, pararStatus } from './screens/topo.js';
import { montarDashboard, carregarDashboard, limparDashboard } from './screens/dashboard.js';
import { montarEstoque, carregarMateriais, limparEstoque } from './screens/estoque.js';
import { montarResiduos, carregarResiduos, limparResiduos } from './screens/residuos.js';
import { montarChat, carregarConversas, novaConversa, limparChat } from './screens/chat.js';
import { montarAuditoria, carregarAuditoria, limparAuditoria } from './screens/auditoria.js';

/** O que carregar ao abrir cada aba. */
const AO_ABRIR = {
  dashboard: carregarDashboard,
  estoque: carregarMateriais,
  residuos: carregarResiduos,
  chat: carregarConversas,
  auditoria: carregarAuditoria,
};

function abrirAba(id) {
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === id));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${id}`));
}

function iniciarPlataforma() {
  aplicarUsuario();
  abrirAba('dashboard');
  novaConversa();
  iniciarStatus();
  carregarDashboard();
  carregarConversas();
}

function limparPlataforma() {
  pararStatus();
  limparDashboard();
  limparEstoque();
  limparResiduos();
  limparChat();
  limparAuditoria();
}

function sessaoPerdida(message) {
  sessaoController.encerrarLocal();
  limparPlataforma();
  mostrarLogin(message);
}

async function sair() {
  await sessaoController.sair();
  limparPlataforma();
  mostrarLogin('Você saiu da plataforma.', 'notice');
}

async function boot() {
  configurarClient({ semLogin: sessaoPerdida, negado: (msg) => toast(msg) });
  preencherOpcoes(OPCOES);

  const { entrar } = montarLogin(iniciarPlataforma);
  montarDashboard();
  montarEstoque();
  montarResiduos();
  montarChat();
  montarAuditoria();

  $$('.tab').forEach((btn) => btn.addEventListener('click', () => {
    abrirAba(btn.dataset.view);
    AO_ABRIR[btn.dataset.view]?.();
  }));
  document.getElementById('btnLogout').addEventListener('click', sair);

  carregarPerfis(entrar);
  const r = await sessaoController.restaurar();
  if (r.tipo === 'ok') {
    mostrarApp();
    iniciarPlataforma();
  } else {
    mostrarLogin(r.tipo === 'expirada' ? 'Sessão expirada. Entre novamente.' : '');
  }
}

boot();
