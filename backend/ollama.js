/**
 * Cliente Ollama - agente de IA do MVP.
 * Usa a API local do Ollama (http://localhost:11434) com fallback
 * para respostas determinísticas caso o Ollama não esteja disponível.
 */

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

let available = null; // null = desconhecido, true/false cacheado

async function checkHealth(timeoutMs = 2500) {
  if (available !== null) return available;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    available = res.ok;
  } catch {
    available = false;
  }
  return available;
}

function invalidateCache() {
  available = null;
}

/**
 * Gera uma resposta do agente de IA.
 * @param {Array<{role:string, content:string}>} messages
 * @param {object} opts - { temperature, stream:false, format:'json' }
 */
async function chat(messages, opts = {}) {
  const ok = await checkHealth();
  if (!ok) {
    return { text: fallback(messages), source: 'fallback', model: 'rule-based' };
  }

  try {
    const body = {
      model: opts.model || OLLAMA_MODEL,
      messages,
      stream: false,
      options: { temperature: opts.temperature ?? 0.4 },
    };
    if (opts.format === 'json') body.format = 'json';

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || 45000);
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);

    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json();
    return { text: data.message?.content?.trim() || '', source: 'ollama', model: body.model };
  } catch (e) {
    console.warn('[ollama] Erro:', e.message, '- usando fallback');
    available = false;
    return { text: fallback(messages), source: 'fallback', model: 'rule-based', error: e.message };
  }
}

async function listModels() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

/**
 * Fallback determinístico: responde com base no contexto RAG injetado
 * pelo servidor, mantendo a demo funcional sem Ollama.
 */
function fallback(messages) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const system = messages.find((m) => m.role === 'system');
  const q = (lastUser?.content || '').toLowerCase();

  const hasCtx = system && system.content.includes('CONTEXTO DA EMPRESA');
  const ctxBlock = hasCtx ? system.content.split('CONTEXTO DA EMPRESA')[1] : '';

  if (q.includes('perigoso') || q.includes('classe i') || q.includes('solvente') || q.includes('tóxico')) {
    return `Com base nas políticas internas: resíduos perigosos (classe I) devem ser armazenados em área coberta com dreno de contenção, identificados com rótulo laranja e coletados exclusivamente por transportadora licenciada. Proibido descarte em aterro comum.\n\n${hasCtx ? 'Documentos recuperados do banco da empresa:\n' + ctxBlock.slice(0, 600) : ''}\n\n(Resposta gerada pelo fallback local. Inicie o Ollama para respostas do LLM.)`;
  }

  if (q.includes('recicl') || q.includes('descarte') || q.includes('destina')) {
    return `Sugestão de destinação sustentável:\n\n1. Priorize reuso interno quando o material permitir.\n2. Para plásticos (PEAD/PET), papel e metal: reciclagem via parceiros homologados.\n3. Orgânicos (serragem, casca): compostagem ou briquetes.\n4. Químicos perigosos: somente empresa licenciada.\n\n${hasCtx ? 'Contexto recuperado:\n' + ctxBlock.slice(0, 600) : ''}\n\n(Resposta gerada pelo fallback local. Inicie o Ollama para respostas do LLM.)`;
  }

  if (q.includes('estoque') || q.includes('saldo') || q.includes('material')) {
    return `Resumo do estoque recuperado do MongoDB simulado:\n\n${hasCtx ? ctxBlock.slice(0, 700) : 'Consulte a aba Estoque para os saldos atuais.'}\n\n(Resposta gerada pelo fallback local. Inicie o Ollama para respostas do LLM.)`;
  }

  return `Sou o agente ReSource. Respondo com base nos dados internos da empresa (MongoDB) recuperados via busca semântica.\n\n${hasCtx ? 'Contexto encontrado:\n' + ctxBlock.slice(0, 700) : 'Não encontrei contexto relevante no banco para essa pergunta.'}\n\n(Resposta gerada pelo fallback local. Inicie o Ollama em http://localhost:11434 e use o modelo llama3.2 para respostas reais do LLM.)`;
}

module.exports = { chat, checkHealth, listModels, invalidateCache, OLLAMA_URL, OLLAMA_MODEL };
