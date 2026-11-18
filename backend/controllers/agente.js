/** Agente IA: busca vetorial (RF02), consultor RAG (RF03) e histórico de conversas. */

const db = require('../infrastructure/db');
const vetores = require('../infrastructure/vetores');
const groq = require('../infrastructure/groq');
const auditoria = require('../infrastructure/auditoria');
const { promptChat } = require('../entities/prompts');

const DOCS_CONTEXTO = 6;
const HISTORICO_MAX = 8;
const TAMANHO_MSG_MAX = 4000;
const TITULO_MAX = 48;

// ------------------------------------------------------------ regras puras

/** "  Qual   o saldo?" → "Qual o saldo?"; corta em 48 caracteres. */
function chatTitle(message) {
  const t = String(message || '').trim().replace(/\s+/g, ' ');
  if (!t) return 'Nova conversa';
  return t.length > TITULO_MAX ? t.slice(0, TITULO_MAX) + '…' : t;
}

/** Dono da conversa: cada perfil só vê as próprias; admin pode auditar todas. */
function canAccessChat(chat, user) {
  if (!chat) return false;
  if (user?.role === 'admin') return true;
  return !!chat.usuario_email && chat.usuario_email === user?.email;
}

/** Uma linha de contexto por documento recuperado: "[1] (materiais) nome | categoria … ". */
function linhaContexto(hit, i) {
  const p = hit.payload || {};
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
  return `[${i + 1}] (${hit.collection}) ${bits.join(' | ')}`;
}

/** Só aceita user/assistant do cliente: impede injetar mensagens "system" pelo histórico. */
function historicoSeguro(history) {
  return (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-HISTORICO_MAX)
    .map((m) => ({ role: m.role, content: m.content.slice(0, TAMANHO_MSG_MAX) }));
}

const conversas = () => db.collection('conversas');

// ------------------------------------------------------------ busca vetorial

async function reindexar(req, res) {
  const info = await vetores.rebuild();
  await auditoria.registrar('Reindexação vetorial', `${info.documents} documentos, ${info.vocabulary} termos`, req.user);
  res.json({ ok: true, ...info });
}

async function buscar(req, res) {
  const { q, k } = req.query;
  if (!q) return res.status(400).json({ error: 'q é obrigatório' });
  const hits = await vetores.search(q, Math.min(Number(k) || 4, 10));
  res.json(hits.map((h) => ({ id: h.id, collection: h.collection, score: Number(h.score.toFixed(4)), text: h.text, payload: h.payload })));
}

// ------------------------------------------------------------ conversas

async function listarConversas(req, res) {
  const isAdmin = req.user.role === 'admin';
  const rows = (await conversas().all())
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
}

async function criarConversa(req, res) {
  const { titulo } = req.body || {};
  const doc = await conversas().insertOne({
    titulo: String(titulo || 'Nova conversa').slice(0, 60),
    mensagens: [],
    usuario_email: req.user.email,
    usuario_nome: req.user.name,
    usuario_role: req.user.role,
  });
  res.status(201).json(doc);
}

/** Busca a conversa e já responde 404/403 quando não pode; devolve null nesses casos. */
async function conversaDoUsuario(req, res) {
  const doc = await conversas().findOne({ _id: req.params.id });
  if (!doc) {
    res.status(404).json({ error: 'conversa não encontrada' });
    return null;
  }
  if (!canAccessChat(doc, req.user)) {
    res.status(403).json({ error: 'esta conversa pertence a outro perfil' });
    return null;
  }
  return doc;
}

async function abrirConversa(req, res) {
  const doc = await conversaDoUsuario(req, res);
  if (doc) res.json(doc);
}

async function excluirConversa(req, res) {
  const doc = await conversaDoUsuario(req, res);
  if (!doc) return;
  await conversas().deleteOne({ _id: req.params.id });
  await auditoria.registrar('Exclusão de conversa', `"${doc.titulo || doc._id}"`, req.user);
  res.json({ ok: true });
}

// ------------------------------------------------------------ chat RAG

async function perguntar(req, res) {
  const { message, history = [], chatId = null } = req.body || {};
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message é obrigatório' });

  const hits = await vetores.search(message, DOCS_CONTEXTO);
  const contexto = hits.map(linhaContexto).join('\n');

  const messages = [
    { role: 'system', content: promptChat(contexto) },
    ...historicoSeguro(history),
    { role: 'user', content: message },
  ];

  const t0 = Date.now();
  const result = await groq.chat(messages, { temperature: 0.4 });
  const latencyMs = Date.now() - t0;

  await auditoria.registrar('Consulta RAG', `"${message.slice(0, 80)}" (${hits.length} docs, ${result.source}, ${latencyMs}ms)`, req.user);

  const sources = hits.map((h) => ({ collection: h.collection, score: Number(h.score.toFixed(3)), label: h.payload?.nome || h.payload?.titulo || h.payload?.motivo || h.id }));
  const meta = { source: result.source, model: result.model, latency_ms: latencyMs, sources };

  // persiste a conversa no histórico, sempre vinculada ao perfil autenticado
  let chat = chatId ? await conversas().findOne({ _id: chatId }) : null;
  if (chatId && !chat) return res.status(404).json({ error: 'conversa não encontrada' });
  if (chat && !canAccessChat(chat, req.user)) {
    return res.status(403).json({ error: 'esta conversa pertence a outro perfil' });
  }

  const userMsg = { role: 'user', content: message };
  const botMsg = { role: 'assistant', content: result.text, meta };
  if (!chat) {
    chat = await conversas().insertOne({
      titulo: chatTitle(message),
      mensagens: [userMsg, botMsg],
      usuario_email: req.user.email,
      usuario_nome: req.user.name,
      usuario_role: req.user.role,
    });
  } else {
    const precisaTitulo = !chat.titulo || chat.titulo === 'Nova conversa';
    await conversas().updateOne({ _id: chat._id }, {
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
}

module.exports = {
  chatTitle, canAccessChat, linhaContexto, historicoSeguro,
  reindexar, buscar,
  listarConversas, criarConversa, abrirConversa, excluirConversa,
  perguntar,
};
