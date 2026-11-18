/** Consultor RAG (RF03): lista de conversas, mensagens e envio. */

import { $, $$, esc, initials, dataCurta } from '../components/ui/index.js';
import { chatController, sessaoController, mensagemErro } from '../controllers/index.js';
import { atualizarStatus } from './topo.js';

const ALTURA_MAX_INPUT = 120;
const VAZIO_LISTA = '<div class="empty side-empty">Nenhuma conversa ainda.</div>';

function boasVindas() {
  const nome = sessaoController.usuario()?.firstName;
  return `Olá${nome ? `, <strong>${esc(nome)}</strong>` : ''}! Sou o agente <strong>ReSource</strong>. Pergunte sobre estoque, destinação de resíduos, políticas internas ou riscos — respondo com base nos dados reais da empresa.`;
}

function nomeFonte(meta) {
  if (meta.source === 'groq') return 'Groq · ' + esc(meta.model || '');
  if (meta.source === 'mock') return 'modo mock (sem servidor)';
  return 'fallback local (Groq offline)';
}

function metaHtml(meta) {
  const fontes = (meta.sources || []).map((s) => `<span class="src-chip">${esc(s.collection)} · ${Number(s.score).toFixed(2)} ${esc(s.label || '')}</span>`).join('');
  return (fontes ? `<div class="sources">${fontes}</div>` : '') + `<div class="latency">${nomeFonte(meta)} · ${meta.latency_ms ?? '—'} ms</div>`;
}

function rolarFim() {
  $('#chatMsgs').scrollTop = $('#chatMsgs').scrollHeight;
}

function addMsg(role, html, meta) {
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  const avatar = role === 'user' ? esc(initials(sessaoController.usuario()?.name)) : 'IA';
  el.innerHTML = `<div class="avatar">${avatar}</div><div class="msg-body">${html}${meta ? metaHtml(meta) : ''}</div>`;
  $('#chatMsgs').appendChild(el);
  rolarFim();
  return el;
}

function desenharConversa(msgs) {
  $('#chatMsgs').innerHTML = '';
  if (!msgs.length) {
    addMsg('bot', boasVindas());
    return;
  }
  for (const m of msgs) addMsg(m.role === 'user' ? 'user' : 'bot', esc(m.content), m.meta);
}

function itemConversa(c, usuario) {
  const outroDono = usuario?.role === 'admin' && c.usuario_email && c.usuario_email !== usuario.email;
  return `
    <div class="chat-item ${c._id === chatController.conversaAtual() ? 'active' : ''}" data-chat="${esc(c._id)}" title="${esc(c.titulo)}">
      <div class="chat-item-main">
        <div class="chat-item-title">${esc(c.titulo)}</div>
        <div class="chat-item-meta">${dataCurta(c.updated_at)} · ${c.mensagens} msg${c.mensagens === 1 ? '' : 's'}${outroDono ? ` · ${esc(c.usuario_nome || c.usuario_email)}` : ''}</div>
      </div>
      <button class="chat-item-del" data-del-chat="${esc(c._id)}" title="Excluir conversa">×</button>
    </div>`;
}

export async function carregarConversas() {
  try {
    const rows = await chatController.conversas();
    const usuario = sessaoController.usuario();
    const list = $('#chatList');
    list.innerHTML = rows.length ? rows.map((c) => itemConversa(c, usuario)).join('') : VAZIO_LISTA;
    $$('#chatList [data-chat]').forEach((el) => el.addEventListener('click', () => abrir(el.dataset.chat)));
    $$('#chatList [data-del-chat]').forEach((b) => b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      excluir(b.dataset.delChat);
    }));
  } catch (e) {
    console.error(e);
  }
}

async function abrir(id) {
  try {
    const msgs = await chatController.abrir(id);
    if (!msgs) return;
    desenharConversa(msgs);
    $$('#chatList .chat-item').forEach((el) => el.classList.toggle('active', el.dataset.chat === id));
  } catch (e) {
    alert('Erro ao abrir conversa: ' + mensagemErro(e));
  }
}

async function excluir(id) {
  if (!confirm('Excluir esta conversa?')) return;
  try {
    if (await chatController.excluir(id)) desenharConversa([]);
    carregarConversas();
  } catch (e) {
    alert('Erro ao excluir conversa: ' + mensagemErro(e));
  }
}

async function enviar(texto) {
  if (!texto.trim()) return;
  addMsg('user', esc(texto));
  const digitando = addMsg('bot', '<span class="typing"><i></i><i></i><i></i></span>');
  try {
    const r = await chatController.enviar(texto);
    digitando.querySelector('.msg-body').innerHTML = esc(r.reply) + metaHtml(r);
    rolarFim();
    carregarConversas();
    atualizarStatus();
  } catch (e) {
    digitando.querySelector('.msg-body').textContent = 'Erro: ' + mensagemErro(e);
  }
}

export function novaConversa() {
  chatController.nova();
  desenharConversa([]);
}

export function montarChat() {
  $('#btnNewChat').addEventListener('click', () => {
    novaConversa();
    carregarConversas();
  });

  $('#chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#chatInput');
    enviar(input.value);
    input.value = '';
    input.style.height = 'auto';
  });
  // a caixa cresce com o texto até um limite
  $('#chatInput').addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, ALTURA_MAX_INPUT) + 'px';
  });
  $('#chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('#chatForm').requestSubmit();
    }
  });
  $$('#suggestions .chip').forEach((c) => c.addEventListener('click', () => enviar(c.textContent)));
}

export function limparChat() {
  novaConversa();
  $('#chatList').innerHTML = VAZIO_LISTA;
}
