/**
 * Peças de interface sem regra de negócio: acesso ao DOM, escape de HTML,
 * formatação, aviso flutuante e markdown simples.
 */

export const $ = (s) => document.querySelector(s);
export const $$ = (s) => document.querySelectorAll(s);

/** Escapa texto para entrar em HTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 18750 → "R$ 18.750". */
export const fmtBRL = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
/** 2450 → "2.450". */
export const fmtNum = (v) => Number(v).toLocaleString('pt-BR');

/** ISO → "18/11/2026, 14:32:00", ou "—" se vazio/inválido. */
export function dataHora(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
}

/** ISO → "18/11 14:32". */
export const dataCurta = (value) => new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** "Marina Alves" → "MA". */
export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '??';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

/** Markdown mínimo do relatório: títulos, negrito e listas. Escapa antes. */
export function renderMd(text) {
  let t = esc(text);
  t = t.replace(/^### (.*)$/gm, '<h3>$1</h3>').replace(/^## (.*)$/gm, '<h3>$1</h3>').replace(/^# (.*)$/gm, '<h3>$1</h3>');
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/^[-•] (.*)$/gm, '• $1');
  return t;
}

/** Tag colorida do risco do material. */
export const riskTag = (r) => `<span class="tag ${r === 'Alto' ? 'high' : r === 'Médio' ? 'mid' : 'low'}">${esc(r)}</span>`;

const TOAST_MS = 4500;

/** Aviso flutuante no canto da tela. */
export function toast(message, type = 'error') {
  let box = document.getElementById('toastBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toastBox';
    box.className = 'toast-box';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), TOAST_MS);
}

/** Mostra ou esconde um elemento pela classe `hidden`. */
export const mostrar = (el, visivel = true) => el?.classList.toggle('hidden', !visivel);

/** Preenche cada `<select data-opcoes="nome">` com a lista `listas[nome]`. */
export function preencherOpcoes(listas) {
  $$('select[data-opcoes]').forEach((sel) => {
    sel.innerHTML = (listas[sel.dataset.opcoes] || []).map((o) => `<option>${esc(o)}</option>`).join('');
  });
}
