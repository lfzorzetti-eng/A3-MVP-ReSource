/* ReSource MVP — frontend */
const SESSION_KEY = 'resource_session';
const ADMIN_TOKEN_KEY = 'resource_admin_token';

let currentUser = null;
let currentSessionToken = '';
let adminResetProtegido = false;
let statusTimer = null;

const adminToken = () => sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
const can = (permission) => !!currentUser &&
  (currentUser.permissions.includes('*') || currentUser.permissions.includes(permission));

const initials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '??';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const fmtBRL = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtNum = (v) => Number(v).toLocaleString('pt-BR');

/* ================= sessão ================= */
function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(token, user) {
  currentSessionToken = token;
  currentUser = user;
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
}

function clearSession() {
  currentSessionToken = '';
  currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

function toast(message, type = 'error') {
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
  setTimeout(() => el.remove(), 4500);
}

const api = async (path, opts = {}) => {
  const { adminToken: admin, skipAuthRedirect, ...fetchOpts } = opts;
  const headers = { 'Content-Type': 'application/json', ...(fetchOpts.headers || {}) };
  if (currentSessionToken) headers.Authorization = `Bearer ${currentSessionToken}`;
  if (admin) headers['x-admin-token'] = admin;

  const res = await fetch(`/api${path}`, {
    ...fetchOpts,
    headers,
    body: fetchOpts.body ? JSON.stringify(fetchOpts.body) : undefined,
  });

  if (res.status === 401 && !skipAuthRedirect) {
    forceLogout('Sua sessão expirou. Entre novamente.');
    throw new Error('sessão expirada');
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    const err = new Error(payload.error || `HTTP ${res.status}`);
    err.status = res.status;
    if (res.status === 403 || res.status === 429) toast(err.message);
    throw err;
  }
  return res.json();
};

/* ================= login / sessão ================= */
function setLoginError(message = '', tone = 'error') {
  const el = $('#loginError');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('hidden', !message);
  el.classList.toggle('notice', tone === 'notice');
}

function showLogin(message = '', tone = 'error') {
  document.body.classList.remove('auth-checking');
  document.body.classList.add('auth-locked');
  setLoginError(message, tone);
  setTimeout(() => $('#loginEmail')?.focus(), 60);
}

function showApp() {
  document.body.classList.remove('auth-checking', 'auth-locked');
}

function clearAppData() {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
  resetChat();
  $('#kpis').innerHTML = '';
  $('#tblMov tbody').innerHTML = '';
  $('#tblMateriais tbody').innerHTML = '';
  $('#gridResiduos').innerHTML = '';
  $('#chatList').innerHTML = '<div class="empty side-empty">Nenhuma conversa ainda.</div>';
  $('#tblAudit tbody').innerHTML = '';
  $('#analiseReport').classList.add('hidden');
  $('#analiseSpinner').classList.add('hidden');
  $('#formMaterial').classList.add('hidden');
  $('#formResiduo').classList.add('hidden');
  $('#formMat').reset();
  $('#formRes').reset();
}

function forceLogout(message) {
  clearSession();
  clearAppData();
  showLogin(message);
}

function applyUserUI() {
  if (!currentUser) return;
  $('#userAvatar').textContent = currentUser.initials || initials(currentUser.name);
  $('#userAvatar').className = `user-avatar role-${currentUser.role}`;
  $('#userName').textContent = currentUser.name;
  $('#userRole').textContent = `${currentUser.roleLabel} · ${currentUser.sector}`;

  const readOnly = !can('materiais:write') && !can('residuos:write');
  $('#readonlyChip').classList.toggle('hidden', !readOnly);

  $('#btnNovoMaterial').classList.toggle('hidden', !can('materiais:write'));
  $('#btnReindex').classList.toggle('hidden', !can('rag:reindex'));
  $('#btnNovoResiduo').classList.toggle('hidden', !can('residuos:write'));
  $('#btnReset').classList.toggle('hidden', !can('demo:reset'));

  if (!can('materiais:write')) $('#formMaterial').classList.add('hidden');
  if (!can('residuos:write')) $('#formResiduo').classList.add('hidden');
}

async function loginWith(email, password) {
  if (!email || !password) {
    setLoginError('Informe e-mail e senha.');
    return;
  }
  const btn = $('#btnLogin');
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  setLoginError('');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    writeSession(data.token, data.user);
    $('#loginPassword').value = '';
    showApp();
    startApp();
  } catch (e) {
    setLoginError(e.message || 'Não foi possível entrar.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

async function loadDemoUsers() {
  const box = $('#demoUsers');
  try {
    const res = await fetch('/api/auth/demo-users');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.session_ttl_hours) $('#sessionTtl').textContent = `${data.session_ttl_hours} h`;

    box.innerHTML = data.users.map((u) => `
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
      </button>`).join('');

    box.querySelectorAll('[data-email]').forEach((btn) => {
      btn.addEventListener('click', () => loginWith(btn.dataset.email, btn.dataset.password));
    });
  } catch {
    box.innerHTML = '<p class="empty">Não foi possível carregar os perfis agora. Use o formulário acima.</p>';
  }
}

function showDashboardView() {
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === 'dashboard'));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-dashboard'));
}

function startApp() {
  applyUserUI();
  showDashboardView();
  resetChat();
  loadStatus();
  loadDashboard();
  loadChats();
  if (!statusTimer) statusTimer = setInterval(loadStatus, 30000);
}

async function doLogout() {
  try {
    await api('/auth/logout', { method: 'POST', skipAuthRedirect: true });
  } catch {
    // a sessão pode já ter expirado; o logout local continua
  }
  clearSession();
  clearAppData();
  showLogin('Você saiu da plataforma.', 'notice');
}

$('#loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  loginWith($('#loginEmail').value.trim(), $('#loginPassword').value);
});

$('#btnLogout').addEventListener('click', doLogout);

async function boot() {
  loadDemoUsers();
  const saved = readSession();
  if (!saved || !saved.token) {
    showLogin();
    return;
  }

  currentSessionToken = saved.token;
  try {
    const { user } = await api('/auth/me', { skipAuthRedirect: true });
    writeSession(saved.token, user);
    showApp();
    startApp();
  } catch {
    clearSession();
    showLogin('Sessão expirada. Entre novamente.');
  }
}

/* ================= tabs ================= */
$$('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.tab').forEach((b) => b.classList.remove('active'));
    $$('.view').forEach((v) => v.classList.remove('active'));
    btn.classList.add('active');
    $('#view-' + btn.dataset.view).classList.add('active');
    if (btn.dataset.view === 'dashboard') loadDashboard();
    if (btn.dataset.view === 'estoque') loadMateriais();
    if (btn.dataset.view === 'residuos') loadResiduos();
    if (btn.dataset.view === 'chat') loadChats();
    if (btn.dataset.view === 'auditoria') loadAuditoria();
  });
});

/* ================= status ================= */
async function loadStatus() {
  try {
    const h = await api('/health');
    $('#pillMongo').className = h.mongo.degraded ? 'pill off' : 'pill on';
    $('#pillMongo').title = `${h.mongo.simulated ? 'MongoDB simulado (arquivo local)' : `MongoDB (${h.mongo.database})`}${h.mongo.degraded ? ' - DEGRADADO: cluster não respondeu, usando banco simulado' : ''}: ${Object.entries(h.mongo).filter(([k]) => !['simulated', 'database', 'degraded'].includes(k)).map(([k, v]) => `${k}:${v}`).join(', ')}`;
    $('#pillVector').className = 'pill on';
    $('#pillVector').title = `Banco vetorial: ${h.vector.documents} docs, ${h.vector.vocabulary} termos`;
    const st = $('#ollamaStatus');
    if (h.ollama.available) {
      $('#pillOllama').className = 'pill on';
      $('#pillOllama').title = `Ollama: ${h.ollama.model} (${h.ollama.models.join(', ') || 's/ modelos'})`;
      st.textContent = `Ollama online · ${h.ollama.model}${h.ollama.cloud ? ' (cloud)' : ''}`;
      st.classList.add('on');
    } else {
      $('#pillOllama').className = 'pill off';
      $('#pillOllama').title = 'Ollama indisponível — respostas via fallback local';
      st.textContent = 'Ollama offline — usando fallback local';
      st.classList.remove('on');
    }
    const idx = $('#badgeIndex');
    if (idx) idx.textContent = `${h.vector.documents} docs indexados · vocab ${h.vector.vocabulary}`;
    adminResetProtegido = !!(h.admin && h.admin.reset);
  } catch (e) {
    $('#pillMongo').className = 'pill off';
    $('#pillVector').className = 'pill off';
    $('#pillOllama').className = 'pill off';
  }
}

/* ================= dashboard ================= */
async function loadDashboard() {
  try {
    const [empresa, dash] = await Promise.all([api('/empresa'), api('/dashboard')]);
    $('#empresaNome').textContent = `${empresa.nome} · ${empresa.setor} · ${empresa.unidade}`;

    const i = dash.indicadores;
    const t = dash.totais;
    $('#kpis').innerHTML = `
      <div class="kpi"><div class="label">Taxa de reciclagem</div><div class="value">${i.taxa_reciclagem_atual_pct}%</div><div class="hint">Meta zero waste: ${i.meta_zero_waste_pct}%</div></div>
      <div class="kpi"><div class="label">CO₂ evitado / mês</div><div class="value">${fmtNum(i.co2_evitado_kg_mes)} kg</div><div class="hint">Cálculo sobre destinações corretas</div></div>
      <div class="kpi"><div class="label">Economia mensal</div><div class="value">${fmtBRL(i.economia_mensal_brl)}</div><div class="hint">Com redução de descarte</div></div>
      <div class="kpi warn"><div class="label">Risco alto</div><div class="value">${t.materiais_risco_alto}</div><div class="hint">materiais químicos em estoque</div></div>
      <div class="kpi ${t.residuos_perigosos > 3 ? 'danger' : 'warn'}"><div class="label">Resíduos perigosos</div><div class="value">${t.residuos_perigosos}</div><div class="hint">${fmtNum(t.kg_residuos)} kg gerados no período</div></div>`;

    const cats = Object.entries(dash.residuos_por_categoria);
    const max = Math.max(...cats.map(([, v]) => v), 1);
    $('#barsResiduos').innerHTML = cats.length
      ? cats.map(([k, v]) => `<div class="bar-row"><span>${esc(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${(v / max) * 100}%"></div></div><span class="bar-val">${fmtNum(v)}</span></div>`).join('')
      : '<div class="empty">Sem resíduos registrados.</div>';

    $('#tblMov tbody').innerHTML = dash.ultimas_movimentacoes.map((m) => `
      <tr><td>${m.data}</td><td>${esc(m.material_nome)}</td>
      <td><span class="tag ${m.tipo === 'entrada' ? 'in' : 'out'}">${m.tipo}</span></td>
      <td>${fmtNum(m.quantidade)} ${m.unidade}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Nenhuma movimentação.</td></tr>';
  } catch (e) {
    console.error(e);
  }
}

$('#btnRefreshDash').addEventListener('click', loadDashboard);

/* ================= RF01 — análise de estoque ================= */
$('#btnAnalise').addEventListener('click', async () => {
  const btn = $('#btnAnalise');
  btn.disabled = true;
  btn.textContent = 'Analisando…';
  $('#analiseSpinner').classList.remove('hidden');
  $('#analiseReport').classList.add('hidden');
  try {
    const r = await api('/estoque/analise', { method: 'POST' });
    const report = $('#analiseReport');
    report.innerHTML = renderMd(r.report) +
      `<div class="meta-line">Fonte: <strong>${r.source === 'ollama' ? 'Ollama (' + esc(r.model) + ')' : 'fallback local'}</strong> · ${r.latency_ms} ms · ${r.resumo.materiais} materiais · ${r.resumo.risco_alto} risco alto · ${r.resumo.residuos_perigosos} resíduos perigosos</div>`;
    report.classList.remove('hidden');
    loadStatus();
  } catch (e) {
    alert('Erro na análise: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analisar com IA';
    $('#analiseSpinner').classList.add('hidden');
  }
});

function renderMd(text) {
  let t = esc(text);
  t = t.replace(/^### (.*)$/gm, '<h3>$1</h3>').replace(/^## (.*)$/gm, '<h3>$1</h3>').replace(/^# (.*)$/gm, '<h3>$1</h3>');
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/^[-•] (.*)$/gm, '• $1');
  return t;
}

/* ================= estoque ================= */
let editando = false;

async function loadMateriais() {
  const q = $('#buscaMaterial').value.trim();
  const cat = $('#filtroCategoria').value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (cat) params.set('categoria', cat);
  const rows = await api('/materiais?' + params.toString());

  const categorias = [...new Set((await api('/materiais')).map((m) => m.categoria))].sort();
  const sel = $('#filtroCategoria');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todas as categorias</option>' + categorias.map((c) => `<option${c === cur ? ' selected' : ''}>${esc(c)}</option>`).join('');

  const riskTag = (r) => `<span class="tag ${r === 'Alto' ? 'high' : r === 'Médio' ? 'mid' : 'low'}">${esc(r)}</span>`;
  $('#tblMateriais tbody').innerHTML = rows.map((m) => `
    <tr>
      <td><code>${esc(m.codigo)}</code></td>
      <td><strong>${esc(m.nome)}</strong><div class="sub" style="font-size:12px">${esc(m.descricao || '').slice(0, 70)}</div></td>
      <td>${esc(m.categoria)}</td>
      <td>${fmtNum(m.saldo)} ${esc(m.unidade)}</td>
      <td>${m.custo_unitario > 0 ? fmtBRL(m.custo_unitario) : '—'}</td>
      <td>${riskTag(m.risco)}</td>
      <td style="white-space:nowrap">${can('materiais:write') ? `
        <button class="btn sm ghost" data-edit="${m._id}">Editar</button>
        <button class="btn sm danger" data-del="${m._id}">Excluir</button>` : '<span class="sub">—</span>'}
      </td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty">Nenhum material encontrado.</td></tr>';

  $$('#tblMateriais [data-edit]').forEach((b) => b.addEventListener('click', () => editMaterial(b.dataset.edit)));
  $$('#tblMateriais [data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Excluir este material?')) return;
    await api('/materiais/' + b.dataset.del, { method: 'DELETE' });
    loadMateriais(); loadStatus();
  }));
}

$('#buscaMaterial').addEventListener('input', () => clearTimeout(window._t1) || (window._t1 = setTimeout(loadMateriais, 250)));
$('#filtroCategoria').addEventListener('change', loadMateriais);

$('#btnNovoMaterial').addEventListener('click', () => {
  editando = false;
  $('#formMaterialTitulo').textContent = 'Novo material';
  $('#formMat').reset();
  $('#formMat')._id.value = '';
  $('#formMaterial').classList.remove('hidden');
});

$('#btnCancelForm').addEventListener('click', () => $('#formMaterial').classList.add('hidden'));

async function editMaterial(id) {
  const m = await api('/materiais');
  const doc = m.find((x) => x._id === id);
  if (!doc) return;
  editando = true;
  $('#formMaterialTitulo').textContent = 'Editar material — ' + doc.codigo;
  const f = $('#formMat');
  for (const k of ['nome', 'categoria', 'unidade', 'saldo', 'custo_unitario', 'fornecedor', 'localizacao', 'risco', 'descricao']) {
    if (f[k]) f[k].value = doc[k] ?? '';
  }
  f._id.value = doc._id;
  $('#formMaterial').classList.remove('hidden');
}

$('#formMat').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = Object.fromEntries(new FormData(f).entries());
  for (const k of ['saldo', 'custo_unitario']) body[k] = Number(body[k]) || 0;
  if (editando && body._id) {
    delete body._id;
    await api('/materiais/' + f._id.value, { method: 'PUT', body });
  } else {
    delete body._id;
    await api('/materiais', { method: 'POST', body });
  }
  $('#formMaterial').classList.add('hidden');
  loadMateriais(); loadStatus();
});

$('#btnReindex').addEventListener('click', async () => {
  const r = await api('/rag/reindex', { method: 'POST' });
  $('#badgeIndex').textContent = `${r.documents} docs indexados · vocab ${r.vocabulary}`;
  alert(`Reindexado: ${r.documents} documentos, ${r.vocabulary} termos no vocabulário.`);
});

/* ================= resíduos ================= */
async function loadResiduos() {
  const rows = await api('/residuos');
  $('#gridResiduos').innerHTML = rows.map((r) => `
    <div class="res-card ${r.classe.includes('Perigoso') ? 'danger' : ''}">
      <h4>${esc(r.nome)}</h4>
      <div class="kg">${fmtNum(r.quantidade_kg)} kg</div>
      <div class="meta">
        Categoria: <strong>${esc(r.categoria)}</strong><br>
        Classe: <span class="tag ${r.classe.includes('Perigoso') ? 'high' : 'low'}">${esc(r.classe)}</span><br>
        Destino: <strong>${esc(r.destino_atual)}</strong><br>
        Parceiro: ${esc(r.fornecedor_destino || '—')}<br>
        Gerado em: ${esc(r.gerado_em)}
      </div>
    </div>`).join('') || '<div class="empty">Nenhum resíduo registrado.</div>';
}

$('#btnNovoResiduo').addEventListener('click', () => {
  $('#formRes').reset();
  $('#formResiduo').classList.remove('hidden');
});
$('#btnCancelRes').addEventListener('click', () => $('#formResiduo').classList.add('hidden'));
$('#formRes').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  body.quantidade_kg = Number(body.quantidade_kg) || 0;
  await api('/residuos', { method: 'POST', body });
  $('#formResiduo').classList.add('hidden');
  loadResiduos(); loadStatus();
});

/* ================= chat RAG ================= */
let history = [];
let currentChatId = null;

const welcomeHtml = () => `Olá${currentUser?.firstName ? `, <strong>${esc(currentUser.firstName)}</strong>` : ''}! Sou o agente <strong>ReSource</strong>. Pergunte sobre estoque, destinação de resíduos, políticas internas ou riscos — respondo com base nos dados reais da empresa.`;

function addMsg(role, html, meta) {
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  const avatar = role === 'user' ? esc(initials(currentUser?.name)) : 'IA';
  el.innerHTML = `<div class="avatar">${avatar}</div><div class="msg-body">${html}${meta ? metaHtml(meta) : ''}</div>`;
  $('#chatMsgs').appendChild(el);
  $('#chatMsgs').scrollTop = $('#chatMsgs').scrollHeight;
  return el;
}

function metaHtml(meta) {
  const sources = (meta.sources || []).map((s) => `<span class="src-chip">${esc(s.collection)} · ${Number(s.score).toFixed(2)} ${esc(s.label || '')}</span>`).join('');
  const fonte = meta.source === 'ollama' ? 'Ollama · ' + esc(meta.model || '') : 'fallback local (Ollama offline)';
  return (sources ? `<div class="sources">${sources}</div>` : '') + `<div class="latency">${fonte} · ${meta.latency_ms ?? '—'} ms</div>`;
}

function renderConversation(msgs) {
  const box = $('#chatMsgs');
  box.innerHTML = '';
  if (!msgs.length) {
    addMsg('bot', welcomeHtml());
    return;
  }
  for (const m of msgs) addMsg(m.role === 'user' ? 'user' : 'bot', esc(m.content), m.meta);
}

async function loadChats() {
  try {
    const rows = await api('/chats');
    const list = $('#chatList');
    list.innerHTML = rows.length
      ? rows.map((c) => `
        <div class="chat-item ${c._id === currentChatId ? 'active' : ''}" data-chat="${c._id}" title="${esc(c.titulo)}">
          <div class="chat-item-main">
            <div class="chat-item-title">${esc(c.titulo)}</div>
            <div class="chat-item-meta">${new Date(c.updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${c.mensagens} msg${c.mensagens === 1 ? '' : 's'}${
              currentUser?.role === 'admin' && c.usuario_email && c.usuario_email !== currentUser.email
                ? ` · ${esc(c.usuario_nome || c.usuario_email)}`
                : ''
            }</div>
          </div>
          <button class="chat-item-del" data-del-chat="${c._id}" title="Excluir conversa">×</button>
        </div>`).join('')
      : '<div class="empty side-empty">Nenhuma conversa ainda.</div>';
    $$('#chatList [data-chat]').forEach((el) => el.addEventListener('click', () => openChat(el.dataset.chat)));
    $$('#chatList [data-del-chat]').forEach((b) => b.addEventListener('click', (ev) => { ev.stopPropagation(); deleteChat(b.dataset.delChat); }));
  } catch (e) {
    console.error(e);
  }
}

async function openChat(id) {
  if (id === currentChatId) return;
  try {
    const doc = await api('/chats/' + id);
    currentChatId = doc._id;
    const msgs = doc.mensagens || [];
    history = msgs.map((m) => ({ role: m.role, content: m.content }));
    renderConversation(msgs);
    $$('#chatList .chat-item').forEach((el) => el.classList.toggle('active', el.dataset.chat === currentChatId));
  } catch (e) {
    alert('Erro ao abrir conversa: ' + e.message);
  }
}

async function deleteChat(id) {
  if (!confirm('Excluir esta conversa?')) return;
  try {
    await api('/chats/' + id, { method: 'DELETE' });
    if (currentChatId === id) resetChat();
    loadChats();
  } catch (e) {
    alert('Erro ao excluir conversa: ' + e.message);
  }
}

function resetChat() {
  currentChatId = null;
  history = [];
  renderConversation([]);
}

$('#btnNewChat').addEventListener('click', () => {
  resetChat();
  loadChats();
});

async function sendChat(text) {
  if (!text.trim()) return;
  addMsg('user', esc(text));
  history.push({ role: 'user', content: text });

  const typing = addMsg('bot', '<span class="typing"><i></i><i></i><i></i></span>');
  try {
    const r = await api('/chat', { method: 'POST', body: { message: text, history: history.slice(0, -1), chatId: currentChatId } });
    if (r.chatId) currentChatId = r.chatId;
    history.push({ role: 'assistant', content: r.reply });
    typing.querySelector('.msg-body').innerHTML = esc(r.reply) + metaHtml({ source: r.source, model: r.model, latency_ms: r.latency_ms, sources: r.sources });
    $('#chatMsgs').scrollTop = $('#chatMsgs').scrollHeight;
    loadChats();
    loadStatus();
  } catch (e) {
    typing.querySelector('.msg-body').textContent = 'Erro: ' + e.message;
  }
}

$('#chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#chatInput');
  sendChat(input.value);
  input.value = '';
  input.style.height = 'auto';
});
$('#chatInput').addEventListener('input', (e) => {
  e.target.style.height = 'auto';
  e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
});
$('#chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('#chatForm').requestSubmit();
  }
});
$$('#suggestions .chip').forEach((c) => c.addEventListener('click', () => sendChat(c.textContent)));

/* ================= auditoria ================= */
function auditDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
}

async function loadAuditoria() {
  const rows = await api('/auditorias');
  $('#tblAudit tbody').innerHTML = rows.map((a) => `
    <tr><td>${auditDate(a.data || a.created_at)}</td>
    <td><strong>${esc(a.evento)}</strong></td>
    <td>${esc(a.detalhe)}</td>
    <td title="${esc(a.usuario_email || '')}">
      ${esc(a.usuario || 'sistema')}
      ${a.usuario_role ? `<div class="sub" style="font-size:11px">${esc(a.usuario_role)}${a.usuario_setor ? ' · ' + esc(a.usuario_setor) : ''}</div>` : ''}
    </td></tr>`).join('') || '<tr><td colspan="4" class="empty">Sem registros.</td></tr>';
}
$('#btnRefreshAudit').addEventListener('click', loadAuditoria);

$('#btnReset').addEventListener('click', async () => {
  if (!can('demo:reset')) return;
  if (!confirm('Restaurar todos os dados para o estado inicial da demonstração?')) return;
  try {
    if (adminResetProtegido && !adminToken()) {
      const t = prompt('Token de administrador (header x-admin-token):');
      if (!t) return;
      sessionStorage.setItem(ADMIN_TOKEN_KEY, t);
    }
    await api('/reset', { method: 'POST', adminToken: adminToken() });
    resetChat();
    loadStatus(); loadAuditoria(); loadChats();
  } catch (e) {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    alert(`Não foi possível restaurar os dados: ${e.message}`);
  }
});

/* ================= init ================= */
boot();
