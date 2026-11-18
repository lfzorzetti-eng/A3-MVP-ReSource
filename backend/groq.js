/**
 * Cliente Groq - agente de IA do MVP.
 * Usa a API do Groq (compatível com OpenAI) com fallback para respostas
 * determinísticas caso o Groq não esteja disponível.
 *
 *   GROQ_API_KEY=...  (obrigatória; Authorization: Bearer)
 *   GROQ_MODEL=...    (opcional)
 */

const GROQ_URL = (process.env.GROQ_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim();
const HEALTH_TTL_MS = Number(process.env.GROQ_HEALTH_TTL_MS || 15000);

let available = null; // null = desconhecido, true/false cacheado
let lastCheck = 0;

function authHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (GROQ_API_KEY) headers.Authorization = `Bearer ${GROQ_API_KEY}`;
  return headers;
}

async function checkHealth(timeoutMs = 8000) {
  const agora = Date.now();
  if (available !== null && agora - lastCheck < HEALTH_TTL_MS) return available;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${GROQ_URL}/models`, { signal: ctrl.signal, headers: authHeaders() });
    clearTimeout(t);
    available = res.ok;
  } catch {
    available = false;
  }
  lastCheck = Date.now();
  return available;
}

function invalidateCache() {
  available = null;
  lastCheck = 0;
}

/**
 * Gera uma resposta do agente de IA.
 * Não faz pre-flight de health: a própria chamada ao LLM é a fonte da verdade
 * (um probe lento no cold start não deve derrubar a resposta para o fallback).
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} opts - { temperature, timeoutMs, model, format:'json' }
 */
async function chat(messages, opts = {}) {
  try {
    const body = {
      model: opts.model || GROQ_MODEL,
      messages,
      stream: false,
      temperature: opts.temperature ?? 0.4,
    };
    if (opts.format === 'json') body.response_format = { type: 'json_object' };

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || 45000);
    const res = await fetch(`${GROQ_URL}/chat/completions`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);

    if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
    const data = await res.json();
    available = true;
    lastCheck = Date.now();
    return { text: data.choices?.[0]?.message?.content?.trim() || '', source: 'groq', model: body.model };
  } catch (e) {
    console.warn('[groq] Erro:', e.message, '- usando fallback');
    available = false;
    lastCheck = Date.now();
    return { text: fallback(messages), source: 'fallback', model: 'rule-based', error: e.message };
  }
}

async function listModels() {
  try {
    const res = await fetch(`${GROQ_URL}/models`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map((m) => m.id);
  } catch {
    return [];
  }
}

/**
 * Fallback determinístico: responde com base no contexto RAG injetado
 * pelo servidor, mantendo a demo funcional sem o Groq.
 */
function fallback(messages) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const system = messages.find((m) => m.role === 'system');
  const q = (lastUser?.content || '').toLowerCase();

  const hasCtx = system && system.content.includes('CONTEXTO DA EMPRESA');
  const ctxBlock = hasCtx ? system.content.split('CONTEXTO DA EMPRESA')[1] : '';

  if (q.includes('perigoso') || q.includes('classe i') || q.includes('solvente') || q.includes('tóxico')) {
    return `Com base nas políticas internas: resíduos perigosos (classe I) devem ser armazenados em área coberta com dreno de contenção, identificados com rótulo laranja e coletados exclusivamente por transportadora licenciada. Proibido descarte em aterro comum.\n\n${hasCtx ? 'Documentos recuperados do banco da empresa:\n' + ctxBlock.slice(0, 600) : ''}\n\n(Resposta gerada pelo fallback local. Configure o Groq para respostas do LLM.)`;
  }

  if (q.includes('recicl') || q.includes('descarte') || q.includes('destina')) {
    return `Sugestão de destinação sustentável:\n\n1. Priorize reuso interno quando o material permitir.\n2. Para plásticos (PEAD/PET), papel e metal: reciclagem via parceiros homologados.\n3. Orgânicos (serragem, casca): compostagem ou briquetes.\n4. Químicos perigosos: somente empresa licenciada.\n\n${hasCtx ? 'Contexto recuperado:\n' + ctxBlock.slice(0, 600) : ''}\n\n(Resposta gerada pelo fallback local. Configure o Groq para respostas do LLM.)`;
  }

  if (q.includes('estoque') || q.includes('saldo') || q.includes('material')) {
    return `Resumo do estoque recuperado do MongoDB simulado:\n\n${hasCtx ? ctxBlock.slice(0, 700) : 'Consulte a aba Estoque para os saldos atuais.'}\n\n(Resposta gerada pelo fallback local. Configure o Groq para respostas do LLM.)`;
  }

  return `Sou o agente ReSource. Respondo com base nos dados internos da empresa (MongoDB) recuperados via busca semântica.\n\n${hasCtx ? 'Contexto encontrado:\n' + ctxBlock.slice(0, 700) : 'Não encontrei contexto relevante no banco para essa pergunta.'}\n\n(Resposta gerada pelo fallback local. Defina GROQ_API_KEY no .env para respostas reais do LLM.)`;
}

module.exports = {
  chat, checkHealth, listModels, invalidateCache,
  GROQ_URL, GROQ_MODEL, GROQ_API_KEY: !!GROQ_API_KEY,
};
