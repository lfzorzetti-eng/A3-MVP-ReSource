/**
 * ReSource MVP - API Node.js (RNF03: desacoplada da IA)
 * Integração não invasiva (RNF01) sobre o banco legado (MongoDB Atlas ou
 * simulado em arquivo, via backend/db.js).
 *
 * Este módulo exporta o app Express (sem listen) para funcionar tanto no
 * servidor local (backend/server.js) quanto na serverless function do Vercel
 * (api/index.js).
 */

// Carrega o .env local ANTES de qualquer módulo que leia process.env.
// Na Vercel as variáveis vêm do dashboard (dotenv não sobrescreve o que já existe).
require('dotenv').config({ quiet: true });

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const db = require('./db');
const vectorstore = require('./vectorstore');
const ollama = require('./ollama');
const auth = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || '').trim();

// Necessário para rate limit por IP atrás do proxy da Vercel.
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const FRONTEND = path.join(__dirname, '..', 'public');
app.use(express.static(FRONTEND));

/** Conecta o banco e reindexa o banco vetorial uma única vez por instância. */
const ready = (async () => {
  await db.init();
  await vectorstore.rebuild();
})().catch((e) => {
  console.error('[app] falha na inicialização:', e.message);
  throw e;
});

// toda requisição espera o banco estar pronto (evita cold start pagando o seed)
app.use(async (req, res, next) => {
  try {
    await ready;
    next();
  } catch (e) {
    res.status(503).json({ error: `banco indisponível: ${e.message}` });
  }
});

/** Express 4 não captura rejeições de handlers async - este wrapper evita request pendurado. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Limitador simples por IP (protege a cota do Ollama Cloud em deploy público). */
const rateLimit = (maxPorMinuto) => {
  const hits = new Map();
  return (req, res, next) => {
    if (!process.env.RATE_LIMIT || process.env.RATE_LIMIT === 'off') return next();
    const ip = req.ip || req.socket.remoteAddress || 'desconhecido';
    const agora = Date.now();
    const janela = 60000;
    const registro = hits.get(ip) || [];
    const recentes = registro.filter((t) => agora - t < janela);
    if (recentes.length >= maxPorMinuto) {
      return res.status(429).json({ error: 'muitas requisições - aguarde um instante' });
    }
    recentes.push(agora);
    hits.set(ip, recentes);
    if (hits.size > 5000) hits.clear();
    next();
  };
};

// ---------- auditoria (RF06) ----------
/**
 * Registra um evento com a identidade de quem o praticou.
 * `usuario` pode ser o objeto req.user (perfil autenticado) ou uma string
 * para eventos de sistema.
 */
async function audit(evento, detalhe, usuario = null) {
  try {
    const doc = {
      evento,
      detalhe,
      data: new Date().toISOString(),
      usuario: typeof usuario === 'string'
        ? usuario
        : (usuario?.name || usuario?.email || 'sistema'),
    };
    if (usuario && typeof usuario === 'object') {
      doc.usuario_email = usuario.email;
      doc.usuario_setor = usuario.sector;
      doc.usuario_role = usuario.role;
    }
    await db.collection('auditorias').insertOne(doc);
  } catch (e) {
    console.warn('[audit]', e.message);
  }
}

// ---------- health / status ----------
app.get('/api/health', wrap(async (req, res) => {
  const ollamaUp = await ollama.checkHealth();
  const models = ollamaUp ? await ollama.listModels() : [];
  res.json({
    ok: true,
    mongo: {
      simulated: !db.isMongo(),
      degraded: db.isDegraded(),
      database: db.MONGO_DB,
      ...(await db.stats()),
    },
    vector: vectorstore.stats(),
    ollama: {
      url: ollama.OLLAMA_URL,
      model: ollama.OLLAMA_MODEL,
      available: ollamaUp,
      cloud: ollama.isCloud(),
      models,
    },
    auth: {
      demo: true,
      session_ttl_hours: auth.SESSION_TTL_HOURS,
      profiles: Object.keys(auth.ROLE_DEFS),
    },
    admin: { reset: !!ADMIN_TOKEN },
  });
}));

// ---------- autenticação (demo) ----------
// Perfis e senhas fictícios, exibidos na tela de login de propósito.
app.get('/api/auth/demo-users', (req, res) => {
  res.json({
    demo: true,
    password: auth.DEMO_PASSWORD,
    session_ttl_hours: auth.SESSION_TTL_HOURS,
    roles: Object.entries(auth.ROLE_DEFS).map(([role, def]) => ({ role, ...def })),
    users: auth.demoUsers(),
  });
});

app.post('/api/auth/login', rateLimit(Number(process.env.RATE_LIMIT_LOGIN || 20)), wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const session = auth.login(email, password);
  if (!session) {
    await audit('Tentativa de login malsucedida', `e-mail: ${String(email || '(vazio)').slice(0, 120)}`);
    return res.status(401).json({ error: 'e-mail ou senha inválidos' });
  }
  await audit('Login', `${session.user.name} entrou como ${session.user.roleLabel}`, session.user);
  res.json(session);
}));

app.get('/api/auth/me', auth.requireAuth, (req, res) => res.json({ user: req.user }));

app.post('/api/auth/logout', auth.requireAuth, wrap(async (req, res) => {
  await audit('Logout', `${req.user.name} saiu da plataforma`, req.user);
  res.json({ ok: true });
}));

// Atalhos para deixar as rotas protegidas legíveis.
const loginRequired = auth.requireAuth;
const allow = auth.requirePermission;

app.post('/api/ollama/reconnect', loginRequired, allow('admin:ops'), (req, res) => {
  ollama.invalidateCache();
  res.json({ ok: true });
});

// ---------- dados da empresa ----------
app.get('/api/empresa', loginRequired, wrap(async (req, res) => res.json(await db.config('empresa'))));
app.get('/api/indicadores', loginRequired, wrap(async (req, res) => res.json(await db.config('indicadores'))));
app.get('/api/politicas', loginRequired, wrap(async (req, res) => res.json(await db.collection('politicas').all())));

// ---------- materiais (RF04) ----------
app.get('/api/materiais', loginRequired, wrap(async (req, res) => {
  const { categoria, q } = req.query;
  let rows = await db.collection('materiais').all();
  if (categoria) rows = rows.filter((r) => r.categoria.toLowerCase() === categoria.toLowerCase());
  if (q) rows = rows.filter((r) => `${r.nome} ${r.codigo} ${r.descricao}`.toLowerCase().includes(q.toLowerCase()));
  res.json(rows);
}));

app.post('/api/materiais', loginRequired, allow('materiais:write'), wrap(async (req, res) => {
  const { nome, categoria, unidade, saldo, custo_unitario, fornecedor, localizacao, risco, descricao } = req.body || {};
  if (!nome || !categoria) return res.status(400).json({ error: 'nome e categoria são obrigatórios' });
  const total = await db.collection('materiais').count();
  const doc = await db.collection('materiais').insertOne({
    codigo: `INS-${String(total + 1).padStart(3, '0')}`,
    nome, categoria, unidade: unidade || 'un', saldo: Number(saldo) || 0,
    custo_unitario: Number(custo_unitario) || 0, fornecedor: fornecedor || '',
    localizacao: localizacao || '', risco: risco || 'Baixo', descricao: descricao || '',
  });
  await vectorstore.rebuild();
  await audit('Cadastro de material', `Novo material ${doc.codigo} - ${nome}`, req.user);
  res.status(201).json(doc);
}));

app.put('/api/materiais/:id', loginRequired, allow('materiais:write'), wrap(async (req, res) => {
  const allowed = ['nome', 'categoria', 'unidade', 'saldo', 'custo_unitario', 'fornecedor', 'localizacao', 'risco', 'descricao'];
  const $set = {};
  for (const k of allowed) if (req.body[k] !== undefined) $set[k] = req.body[k];
  const doc = await db.collection('materiais').updateOne({ _id: req.params.id }, { $set });
  if (!doc) return res.status(404).json({ error: 'material não encontrado' });
  await vectorstore.rebuild();
  await audit('Atualização de material', `${doc.codigo} atualizado`, req.user);
  res.json(doc);
}));

app.delete('/api/materiais/:id', loginRequired, allow('materiais:write'), wrap(async (req, res) => {
  const ok = await db.collection('materiais').deleteOne({ _id: req.params.id });
  if (!ok) return res.status(404).json({ error: 'material não encontrado' });
  await vectorstore.rebuild();
  await audit('Exclusão de material', `id ${req.params.id}`, req.user);
  res.json({ ok: true });
}));

// ---------- resíduos ----------
app.get('/api/residuos', loginRequired, wrap(async (req, res) => res.json(await db.collection('residuos').all())));

app.post('/api/residuos', loginRequired, allow('residuos:write'), wrap(async (req, res) => {
  const { nome, categoria, quantidade_kg, classe, destino_atual, fornecedor_destino } = req.body || {};
  if (!nome) return res.status(400).json({ error: 'nome é obrigatório' });
  const doc = await db.collection('residuos').insertOne({
    nome, categoria: categoria || 'Geral', quantidade_kg: Number(quantidade_kg) || 0,
    classe: classe || 'Não perigoso', destino_atual: destino_atual || 'Triagem pendente',
    gerado_em: new Date().toISOString().slice(0, 10), fornecedor_destino: fornecedor_destino || '',
  });
  await vectorstore.rebuild();
  await audit('Registro de resíduo', `${nome} (${doc.quantidade_kg} kg)`, req.user);
  res.status(201).json(doc);
}));

// ---------- movimentações ----------
app.get('/api/movimentacoes', loginRequired, wrap(async (req, res) => {
  const materiais = await db.collection('materiais').all();
  const porId = new Map(materiais.map((m) => [m._id, m]));
  const rows = (await db.collection('movimentacoes').all()).map((mv) => {
    const mat = porId.get(mv.material_id);
    return { ...mv, material_nome: mat?.nome || '—', material_codigo: mat?.codigo || '—' };
  });
  res.json(rows.sort((a, b) => b.data.localeCompare(a.data)));
}));

// ---------- dashboard (RF05) ----------
app.get('/api/dashboard', loginRequired, wrap(async (req, res) => {
  const materiais = await db.collection('materiais').all();
  const residuos = await db.collection('residuos').all();
  const ind = await db.config('indicadores');

  const porCategoria = {};
  for (const r of residuos) porCategoria[r.categoria] = (porCategoria[r.categoria] || 0) + Number(r.quantidade_kg);

  const valorEstoque = materiais.reduce((s, m) => s + m.saldo * m.custo_unitario, 0);
  const criticos = materiais.filter((m) => m.risco === 'Alto');
  const perigosos = residuos.filter((r) => r.classe.includes('Perigoso'));
  const movimentacoes = await db.collection('movimentacoes').all();

  res.json({
    indicadores: ind,
    totais: {
      materiais: materiais.length,
      residuos: residuos.length,
      kg_residuos: residuos.reduce((s, r) => s + Number(r.quantidade_kg), 0),
      valor_estoque_brl: Number(valorEstoque.toFixed(2)),
      materiais_risco_alto: criticos.length,
      residuos_perigosos: perigosos.length,
    },
    residuos_por_categoria: porCategoria,
    ultimas_movimentacoes: movimentacoes.slice(-5).reverse(),
  });
}));

// ---------- auditoria (RF06) ----------
app.get('/api/auditorias', loginRequired, wrap(async (req, res) => {
  const rows = (await db.collection('auditorias').all()).slice().reverse().slice(0, 50);
  res.json(rows);
}));

// ---------- RF02: vetorização ----------
app.post('/api/rag/reindex', loginRequired, allow('rag:reindex'), wrap(async (req, res) => {
  const info = await vectorstore.rebuild();
  await audit('Reindexação vetorial', `${info.documents} documentos, ${info.vocabulary} termos`, req.user);
  res.json({ ok: true, ...info });
}));

app.get('/api/rag/search', loginRequired, wrap(async (req, res) => {
  const { q, k } = req.query;
  if (!q) return res.status(400).json({ error: 'q é obrigatório' });
  const hits = await vectorstore.search(q, Math.min(Number(k) || 4, 10));
  res.json(hits.map((h) => ({ id: h.id, collection: h.collection, score: Number(h.score.toFixed(4)), text: h.text, payload: h.payload })));
}));

// ---------- histórico de conversas do Agente IA ----------
function chatTitle(message) {
  const t = String(message || '').trim().replace(/\s+/g, ' ');
  if (!t) return 'Nova conversa';
  return t.length > 48 ? t.slice(0, 48) + '…' : t;
}

/** Dono da conversa: cada perfil só vê as próprias; admin pode auditar todas. */
function canAccessChat(chat, user) {
  if (!chat) return false;
  if (user?.role === 'admin') return true;
  return !!chat.usuario_email && chat.usuario_email === user?.email;
}

app.get('/api/chats', loginRequired, wrap(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const rows = (await db.collection('conversas').all())
    .filter((c) => isAdmin || c.usuario_email === req.user.email)
    .map((c) => ({
      _id: c._id,
      titulo: c.titulo || 'Nova conversa',
      mensagens: (c.mensagens || []).length,
      created_at: c.created_at,
      updated_at: c.updated_at || c.created_at,
      usuario_nome: c.usuario_nome || '',
      usuario_email: c.usuario_email || '',
    }));
  res.json(rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))));
}));

app.post('/api/chats', loginRequired, wrap(async (req, res) => {
  const { titulo } = req.body || {};
  const doc = await db.collection('conversas').insertOne({
    titulo: String(titulo || 'Nova conversa').slice(0, 60),
    mensagens: [],
    usuario_email: req.user.email,
    usuario_nome: req.user.name,
    usuario_role: req.user.role,
  });
  res.status(201).json(doc);
}));

app.get('/api/chats/:id', loginRequired, wrap(async (req, res) => {
  const doc = await db.collection('conversas').findOne({ _id: req.params.id });
  if (!doc) return res.status(404).json({ error: 'conversa não encontrada' });
  if (!canAccessChat(doc, req.user)) {
    return res.status(403).json({ error: 'esta conversa pertence a outro perfil' });
  }
  res.json(doc);
}));

app.delete('/api/chats/:id', loginRequired, wrap(async (req, res) => {
  const doc = await db.collection('conversas').findOne({ _id: req.params.id });
  if (!doc) return res.status(404).json({ error: 'conversa não encontrada' });
  if (!canAccessChat(doc, req.user)) {
    return res.status(403).json({ error: 'esta conversa pertence a outro perfil' });
  }
  await db.collection('conversas').deleteOne({ _id: req.params.id });
  await audit('Exclusão de conversa', `"${doc.titulo || doc._id}"`, req.user);
  res.json({ ok: true });
}));

// ---------- RF03: chat RAG com Ollama ----------
async function buildContext(question) {
  const hits = await vectorstore.search(question, 6);
  if (!hits.length) return { context: '', hits: [] };
  const lines = hits.map((h, i) => {
    const p = h.payload || {};
    const bits = [];
    const titulo = p.nome || p.titulo || '';
    if (titulo) bits.push(titulo);
    if (p.categoria) bits.push(`categoria ${p.categoria}`);
    if (p.codigo) bits.push(`código ${p.codigo}`);
    if (p.descricao || p.texto || p.motivo) bits.push(p.descricao || p.texto || p.motivo);
    if (p.saldo !== undefined) bits.push(`saldo em estoque: ${p.saldo} ${p.unidade}`);
    if (p.custo_unitario > 0) bits.push(`custo unitário R$ ${p.custo_unitario}`);
    if (p.risco) bits.push(`risco ${p.risco}`);
    if (p.classe) bits.push(`classe: ${p.classe}`);
    if (p.quantidade_kg) bits.push(`quantidade: ${p.quantidade_kg} kg`);
    if (p.destino_atual) bits.push(`destino atual: ${p.destino_atual}`);
    return `[${i + 1}] (${h.collection}) ${bits.join(' | ')}`;
  });
  return { context: lines.join('\n'), hits };
}

app.post('/api/chat', loginRequired, allow('chat:use'), rateLimit(Number(process.env.RATE_LIMIT_CHAT || 20)), wrap(async (req, res) => {
  const { message, history = [], chatId = null } = req.body || {};
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message é obrigatório' });

  const { context, hits } = await buildContext(message);

  const system = `Você é o agente de IA da plataforma ReSource, especialista em gestão de resíduos e Zero Waste da empresa EcoNova Indústria.
Responda SEMPRE em português do Brasil, de forma objetiva e prática, citando os dados quando usados.
Você é um consultor: sugira destinações sustentáveis, aponte riscos de resíduos perigosos e relacione com o estoque.

CONTEXTO DA EMPRESA (recuperado via busca semântica no banco vetorial):
${context || '(nenhum documento relevante encontrado)'}

Regras para usar o contexto:
- Os documentos podem ser parcialmente relacionados à pergunta; ainda assim, se algum deles contém o dado pedido (saldo, quantidade, destino, política), responda usando esse dado e cite o documento.
- Responda com números EXATAMENTE como aparecem no contexto; nunca invente nem arredonde valores.
- Só diga "não encontrei nos dados internos" se o contexto estiver vazio ou nenhum documento tiver informação útil para a pergunta.`;

  const messages = [
    { role: 'system', content: system },
    // só aceita user/assistant do cliente: impede injetar mensagens "system" pelo histórico
    ...(Array.isArray(history) ? history : [])
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
    { role: 'user', content: message },
  ];

  const t0 = Date.now();
  const result = await ollama.chat(messages, { temperature: 0.4 });
  const latencyMs = Date.now() - t0;

  await audit('Consulta RAG', `"${message.slice(0, 80)}" (${hits.length} docs, ${result.source}, ${latencyMs}ms)`, req.user);

  const sources = hits.map((h) => ({ collection: h.collection, score: Number(h.score.toFixed(3)), label: h.payload?.nome || h.payload?.titulo || h.payload?.motivo || h.id }));
  const meta = { source: result.source, model: result.model, latency_ms: latencyMs, sources };

  // persiste a conversa no histórico, sempre vinculada ao perfil autenticado
  let chat = chatId ? await db.collection('conversas').findOne({ _id: chatId }) : null;
  if (chatId && !chat) return res.status(404).json({ error: 'conversa não encontrada' });
  if (chat && !canAccessChat(chat, req.user)) {
    return res.status(403).json({ error: 'esta conversa pertence a outro perfil' });
  }

  const userMsg = { role: 'user', content: message };
  const botMsg = { role: 'assistant', content: result.text, meta };
  if (!chat) {
    chat = await db.collection('conversas').insertOne({
      titulo: chatTitle(message),
      mensagens: [userMsg, botMsg],
      usuario_email: req.user.email,
      usuario_nome: req.user.name,
      usuario_role: req.user.role,
    });
  } else {
    const precisaTitulo = !chat.titulo || chat.titulo === 'Nova conversa';
    await db.collection('conversas').updateOne({ _id: chat._id }, {
      $set: {
        mensagens: [...(chat.mensagens || []), userMsg, botMsg],
        ...(precisaTitulo ? { titulo: chatTitle(message) } : {}),
      },
    });
  }

  res.json({
    reply: result.text,
    source: result.source,
    model: result.model,
    latency_ms: latencyMs,
    chatId: chat._id,
    sources,
  });
}));

// ---------- RF01: análise de estoque com agente IA ----------
app.post('/api/estoque/analise', loginRequired, allow('analise:run'), rateLimit(Number(process.env.RATE_LIMIT_ANALISE || 10)), wrap(async (req, res) => {
  const materiais = await db.collection('materiais').all();
  const residuos = await db.collection('residuos').all();
  const ind = await db.config('indicadores');

  const criticos = materiais.filter((m) => m.risco === 'Alto');
  const baixoEstoque = materiais.filter((m) => m.saldo < 100);
  const perigosos = residuos.filter((r) => r.classe.includes('Perigoso'));

  const dados = `MATERIAIS (${materiais.length}): ${materiais.map((m) => `${m.nome} [${m.categoria}] saldo=${m.saldo}${m.unidade} risco=${m.risco}`).join('; ')}
RESÍDUOS (${residuos.length}): ${residuos.map((r) => `${r.nome} ${r.quantidade_kg}kg ${r.classe} destino=${r.destino_atual}`).join('; ')}
INDICADORES: taxa reciclagem=${ind.taxa_reciclagem_atual_pct}%, meta zero waste=${ind.meta_zero_waste_pct}%, CO2 evitado=${ind.co2_evitado_kg_mes}kg/mês, economia=R$${ind.economia_mensal_brl}/mês
ALERTAS: ${criticos.length} materiais de risco alto (${criticos.map((m) => m.nome).join(', ')}), ${baixoEstoque.length} materiais com saldo baixo, ${perigosos.length} resíduos perigosos no período.`;

  const messages = [
    {
      role: 'system',
      content: `Você é o agente de análise de estoque da ReSource. Analise os dados operacionais abaixo e produza um relatório executivo em português do Brasil com EXATAMENTE estas seções, em markdown:
## Situação atual
## Riscos e alertas (3-5 itens)
## Recomendações (ações priorizadas)
## Impacto ambiental
Seja específico, use os números fornecidos, não invente dados. Máximo 300 palavras.`,
    },
    { role: 'user', content: dados },
  ];

  const t0 = Date.now();
  const result = await ollama.chat(messages, { temperature: 0.3, timeoutMs: 60000 });
  const latencyMs = Date.now() - t0;

  await audit('Análise de estoque', `Agente analisou ${materiais.length} materiais (${result.source}, ${latencyMs}ms)`, req.user);

  res.json({
    report: result.text,
    source: result.source,
    model: result.model,
    latency_ms: latencyMs,
    resumo: {
      materiais: materiais.length,
      risco_alto: criticos.length,
      saldo_baixo: baixoEstoque.length,
      residuos_perigosos: perigosos.length,
    },
  });
}));

// ---------- reset demo (protegido por token quando ADMIN_TOKEN está definido) ----------
function tokenValido(informado) {
  if (!ADMIN_TOKEN) return true; // sem token configurado, o reset fica livre (dev local)
  const a = Buffer.from(String(informado || ''));
  const b = Buffer.from(ADMIN_TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

app.post('/api/reset', loginRequired, allow('demo:reset'), wrap(async (req, res) => {
  const informado = req.get('x-admin-token') || (req.body && req.body.token) || '';
  // Em produção (ADMIN_TOKEN definido) o token continua obrigatório mesmo
  // para o perfil admin; sem ele a demo não pode ser apagada por visitantes.
  if (ADMIN_TOKEN && !tokenValido(informado)) {
    return res.status(403).json({ error: 'token de administrador inválido - informe o header x-admin-token' });
  }
  await db.reset();
  const info = await vectorstore.rebuild();
  await audit('Restauração de dados', 'Dados de demonstração restaurados', req.user);
  res.json({ ok: true, vector: info });
}));

// ---------- fallback JSON para rotas de API inexistentes ----------
app.use('/api', (req, res) => {
  res.status(404).json({ error: `rota de API não encontrada: ${req.method} ${req.originalUrl}` });
});

// ---------- tratamento de erro (não deixa a request pendurada no Vercel) ----------
app.use((err, req, res, next) => {
  console.error('[erro]', req.method, req.originalUrl, '-', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || 'erro interno' });
});

module.exports = { app, ready, PORT };
