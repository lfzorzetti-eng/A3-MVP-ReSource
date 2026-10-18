/**
 * ReSource MVP - API Node.js (RNF03: desacoplada da IA)
 * Simula integração não invasiva (RNF01) sobre banco legado simulado.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./db');
const vectorstore = require('./vectorstore');
const ollama = require('./ollama');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const FRONTEND = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND));

// ---------- auditoria (RF06) ----------
function audit(evento, detalhe, usuario = 'sistema') {
  try {
    db.collection('auditorias').insertOne({ evento, detalhe, usuario });
  } catch (e) {
    console.warn('[audit]', e.message);
  }
}

// ---------- health / status ----------
app.get('/api/health', async (req, res) => {
  const ollamaUp = await ollama.checkHealth();
  const models = ollamaUp ? await ollama.listModels() : [];
  res.json({
    ok: true,
    mongo: { simulated: true, ...db.stats() },
    vector: vectorstore.stats(),
    ollama: { url: ollama.OLLAMA_URL, model: ollama.OLLAMA_MODEL, available: ollamaUp, models },
  });
});

app.post('/api/ollama/reconnect', (req, res) => {
  ollama.invalidateCache();
  res.json({ ok: true });
});

// ---------- dados da empresa ----------
app.get('/api/empresa', (req, res) => res.json(db.load().empresa));
app.get('/api/indicadores', (req, res) => res.json(db.load().indicadores));
app.get('/api/politicas', (req, res) => res.json(db.collection('politicas').all()));

// ---------- materiais (RF04) ----------
app.get('/api/materiais', (req, res) => {
  const { categoria, q } = req.query;
  let rows = db.collection('materiais').all();
  if (categoria) rows = rows.filter((r) => r.categoria.toLowerCase() === categoria.toLowerCase());
  if (q) rows = rows.filter((r) => `${r.nome} ${r.codigo} ${r.descricao}`.toLowerCase().includes(q.toLowerCase()));
  res.json(rows);
});

app.post('/api/materiais', (req, res) => {
  const { nome, categoria, unidade, saldo, custo_unitario, fornecedor, localizacao, risco, descricao } = req.body || {};
  if (!nome || !categoria) return res.status(400).json({ error: 'nome e categoria são obrigatórios' });
  const doc = db.collection('materiais').insertOne({
    codigo: `INS-${String(db.collection('materiais').count() + 1).padStart(3, '0')}`,
    nome, categoria, unidade: unidade || 'un', saldo: Number(saldo) || 0,
    custo_unitario: Number(custo_unitario) || 0, fornecedor: fornecedor || '',
    localizacao: localizacao || '', risco: risco || 'Baixo', descricao: descricao || '',
  });
  vectorstore.rebuild();
  audit('Cadastro de material', `Novo material ${doc.codigo} - ${nome}`);
  res.status(201).json(doc);
});

app.put('/api/materiais/:id', (req, res) => {
  const allowed = ['nome', 'categoria', 'unidade', 'saldo', 'custo_unitario', 'fornecedor', 'localizacao', 'risco', 'descricao'];
  const $set = {};
  for (const k of allowed) if (req.body[k] !== undefined) $set[k] = req.body[k];
  const doc = db.collection('materiais').updateOne({ _id: req.params.id }, $set);
  if (!doc) return res.status(404).json({ error: 'material não encontrado' });
  vectorstore.rebuild();
  audit('Atualização de material', `${doc.codigo} atualizado`);
  res.json(doc);
});

app.delete('/api/materiais/:id', (req, res) => {
  const ok = db.collection('materiais').deleteOne({ _id: req.params.id });
  if (!ok) return res.status(404).json({ error: 'material não encontrado' });
  vectorstore.rebuild();
  audit('Exclusão de material', `id ${req.params.id}`);
  res.json({ ok: true });
});

// ---------- resíduos ----------
app.get('/api/residuos', (req, res) => res.json(db.collection('residuos').all()));

app.post('/api/residuos', (req, res) => {
  const { nome, categoria, quantidade_kg, classe, destino_atual, fornecedor_destino } = req.body || {};
  if (!nome) return res.status(400).json({ error: 'nome é obrigatório' });
  const doc = db.collection('residuos').insertOne({
    nome, categoria: categoria || 'Geral', quantidade_kg: Number(quantidade_kg) || 0,
    classe: classe || 'Não perigoso', destino_atual: destino_atual || 'Triagem pendente',
    gerado_em: new Date().toISOString().slice(0, 10), fornecedor_destino: fornecedor_destino || '',
  });
  vectorstore.rebuild();
  audit('Registro de resíduo', `${nome} (${doc.quantidade_kg} kg)`);
  res.status(201).json(doc);
});

// ---------- movimentações ----------
app.get('/api/movimentacoes', (req, res) => {
  const rows = db.collection('movimentacoes').all().map((mv) => {
    const mat = db.collection('materiais').findOne({ _id: mv.material_id });
    return { ...mv, material_nome: mat?.nome || '—', material_codigo: mat?.codigo || '—' };
  });
  res.json(rows.sort((a, b) => b.data.localeCompare(a.data)));
});

// ---------- dashboard (RF05) ----------
app.get('/api/dashboard', (req, res) => {
  const materiais = db.collection('materiais').all();
  const residuos = db.collection('residuos').all();
  const ind = db.load().indicadores;

  const porCategoria = {};
  for (const r of residuos) porCategoria[r.categoria] = (porCategoria[r.categoria] || 0) + Number(r.quantidade_kg);

  const valorEstoque = materiais.reduce((s, m) => s + m.saldo * m.custo_unitario, 0);
  const criticos = materiais.filter((m) => m.risco === 'Alto');
  const perigosos = residuos.filter((r) => r.classe.includes('Perigoso'));

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
    ultimas_movimentacoes: db.collection('movimentacoes').all().slice(-5).reverse(),
  });
});

// ---------- auditoria (RF06) ----------
app.get('/api/auditorias', (req, res) => {
  const rows = db.collection('auditorias').all().slice().reverse().slice(0, 50);
  res.json(rows);
});

// ---------- RF02: vetorização ----------
app.post('/api/rag/reindex', (req, res) => {
  const info = vectorstore.rebuild();
  audit('Reindexação vetorial', `${info.documents} documentos, ${info.vocabulary} termos`);
  res.json({ ok: true, ...info });
});

app.get('/api/rag/search', (req, res) => {
  const { q, k } = req.query;
  if (!q) return res.status(400).json({ error: 'q é obrigatório' });
  const hits = vectorstore.search(q, Math.min(Number(k) || 4, 10));
  res.json(hits.map((h) => ({ id: h.id, collection: h.collection, score: Number(h.score.toFixed(4)), text: h.text, payload: h.payload })));
});

// ---------- histórico de conversas do Agente IA ----------
function chatTitle(message) {
  const t = String(message || '').trim().replace(/\s+/g, ' ');
  if (!t) return 'Nova conversa';
  return t.length > 48 ? t.slice(0, 48) + '…' : t;
}

app.get('/api/chats', (req, res) => {
  const rows = db.collection('conversas').all().map((c) => ({
    _id: c._id,
    titulo: c.titulo || 'Nova conversa',
    mensagens: (c.mensagens || []).length,
    created_at: c.created_at,
    updated_at: c.updated_at || c.created_at,
  }));
  res.json(rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))));
});

app.post('/api/chats', (req, res) => {
  const { titulo } = req.body || {};
  const doc = db.collection('conversas').insertOne({ titulo: String(titulo || 'Nova conversa').slice(0, 60), mensagens: [] });
  res.status(201).json(doc);
});

app.get('/api/chats/:id', (req, res) => {
  const doc = db.collection('conversas').findOne({ _id: req.params.id });
  if (!doc) return res.status(404).json({ error: 'conversa não encontrada' });
  res.json(doc);
});

app.delete('/api/chats/:id', (req, res) => {
  const ok = db.collection('conversas').deleteOne({ _id: req.params.id });
  if (!ok) return res.status(404).json({ error: 'conversa não encontrada' });
  audit('Exclusão de conversa', `id ${req.params.id}`, 'usuario-web');
  res.json({ ok: true });
});

// ---------- RF03: chat RAG com Ollama ----------
function buildContext(question) {
  const hits = vectorstore.search(question, 6);
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

app.post('/api/chat', async (req, res) => {
  const { message, history = [], chatId = null } = req.body || {};
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message é obrigatório' });

  const { context, hits } = buildContext(message);

  const system = `Você é o agente de IA da plataforma ReSource, especialista em gestão de resíduos e Zero Waste da empresa EcoNova Indústria.
Responda SEMPRE em português do Brasil, de forma objetiva e prática, citando os dados quando usados.
Você é um consultor: sugira destinações sustentáveis, aponte riscos de resíduos perigosos e relacione com o estoque.

CONTEXTO DA EMPRESA (recuperado via busca semântica no banco vetorial):
${context || '(nenhum documento relevante encontrado)'}

Regras para usar o contexto:
- Os documentos podem ser parcialmente relacionados à pergunta; ainda assim, se algum deles contém o dado pedido (saldo, quantidade, destino, política), responda usando esse dado e cite o documento.
- Responda com números EXATAMENTE como aparecem no contexto; nunca invente nem arredonte valores.
- Só diga "não encontrei nos dados internos" se o contexto estiver vazio ou nenhum documento tiver informação útil para a pergunta.`;

  const messages = [
    { role: 'system', content: system },
    ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  const t0 = Date.now();
  const result = await ollama.chat(messages, { temperature: 0.4 });
  const latencyMs = Date.now() - t0;

  audit('Consulta RAG', `"${message.slice(0, 80)}" (${hits.length} docs, ${result.source}, ${latencyMs}ms)`, 'usuario-web');

  const sources = hits.map((h) => ({ collection: h.collection, score: Number(h.score.toFixed(3)), label: h.payload?.nome || h.payload?.titulo || h.payload?.motivo || h.id }));
  const meta = { source: result.source, model: result.model, latency_ms: latencyMs, sources };

  // persiste a conversa no histórico
  let chat = chatId ? db.collection('conversas').findOne({ _id: chatId }) : null;
  const userMsg = { role: 'user', content: message };
  const botMsg = { role: 'assistant', content: result.text, meta };
  if (!chat) {
    chat = db.collection('conversas').insertOne({ titulo: chatTitle(message), mensagens: [userMsg, botMsg] });
  } else {
    const precisaTitulo = !chat.titulo || chat.titulo === 'Nova conversa';
    db.collection('conversas').updateOne({ _id: chat._id }, {
      mensagens: [...(chat.mensagens || []), userMsg, botMsg],
      ...(precisaTitulo ? { titulo: chatTitle(message) } : {}),
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
});

// ---------- RF01: análise de estoque com agente IA ----------
app.post('/api/estoque/analise', async (req, res) => {
  const materiais = db.collection('materiais').all();
  const residuos = db.collection('residuos').all();
  const ind = db.load().indicadores;

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

  audit('Análise de estoque', `Agente analisou ${materiais.length} materiais (${result.source}, ${latencyMs}ms)`, 'usuario-web');

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
});

// ---------- reset demo ----------
app.post('/api/reset', (req, res) => {
  db.reset();
  const info = vectorstore.rebuild();
  res.json({ ok: true, vector: info });
});

app.listen(PORT, () => {
  vectorstore.rebuild();
  console.log(`[ReSource] API em http://localhost:${PORT}`);
  console.log(`[ReSource] Ollama: ${ollama.OLLAMA_URL} | modelo: ${ollama.OLLAMA_MODEL}`);
});
