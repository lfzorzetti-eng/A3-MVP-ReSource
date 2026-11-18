/**
 * Back-end falso. Implementa a mesma interface de transporte do HTTP e as
 * mesmas rotas da API, com o banco no localStorage. Liga com `?api=mock`:
 * o front inteiro funciona sem servidor (demo offline, testes determinísticos).
 *
 * O chat e a análise respondem por regras simples (fonte "mock"); não há LLM.
 */

import { SEED, USUARIOS, SENHA_DEMO } from './mock-dados.js';
import { local } from './armazenamento.js';
import { erroApi } from './erros.js';
import { CAMPOS_MATERIAL } from '../entities/catalogo.js';

const CHAVE = 'resource_mock_db';
const LATENCIA_MS = 120;
const PREFIXO_TOKEN = 'mock:';
const LIMITE_AUDITORIA = 50;

let banco = null;
let latencia = LATENCIA_MS;

const copia = (x) => JSON.parse(JSON.stringify(x));
const agora = () => new Date().toISOString();
const novoId = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function carregar() {
  if (banco) return banco;
  try {
    const raw = local.getItem(CHAVE);
    banco = raw ? JSON.parse(raw) : null;
  } catch {
    banco = null;
  }
  if (!banco) {
    banco = { ...copia(SEED), conversas: [] };
    persistir();
  }
  return banco;
}

function persistir() {
  local.setItem(CHAVE, JSON.stringify(banco));
}

/** Volta ao seed. Exportado para testes. */
export function resetarMock({ semLatencia = false } = {}) {
  banco = null;
  local.removeItem(CHAVE);
  if (semLatencia) latencia = 0;
}

// ------------------------------------------------------------ apoio

const publico = ({ password, ...resto }) => resto;
const pode = (u, p) => u.permissions.includes('*') || u.permissions.includes(p);
const usuarioDoToken = (token) => {
  const email = String(token || '').startsWith(PREFIXO_TOKEN) ? token.slice(PREFIXO_TOKEN.length) : '';
  return USUARIOS.find((u) => u.email === email) || null;
};
const ehPerigoso = (r) => r.classe.includes('Perigoso');

function auditar(evento, detalhe, u) {
  carregar().auditorias.push({
    _id: novoId(), evento, detalhe, data: agora(),
    usuario: u?.name || 'sistema', usuario_email: u?.email, usuario_setor: u?.sector, usuario_role: u?.role,
  });
}

function inserir(colecao, doc) {
  const novo = { _id: novoId(), created_at: agora(), updated_at: agora(), ...doc };
  carregar()[colecao].push(novo);
  return novo;
}

const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const termos = (t) => normalizar(t).split(/[^a-z0-9]+/).filter((w) => w.length > 2);

/** Busca por palavras em comum (substitui o TF-IDF do back). */
function buscar(pergunta, k = 4) {
  const b = carregar();
  const docs = [
    ...b.materiais.map((m) => ({ collection: 'materiais', label: m.nome, texto: `${m.nome} ${m.categoria} ${m.descricao} risco ${m.risco} saldo ${m.saldo} ${m.unidade}`, payload: m })),
    ...b.residuos.map((r) => ({ collection: 'residuos', label: r.nome, texto: `${r.nome} ${r.categoria} ${r.classe} destino ${r.destino_atual}`, payload: r })),
    ...b.politicas.map((p) => ({ collection: 'politicas', label: p.titulo, texto: `${p.titulo} ${p.texto}`, payload: p })),
  ];
  const q = termos(pergunta).map((w) => w.slice(0, 5));
  return docs
    .map((d) => {
      const t = termos(d.texto).map((w) => w.slice(0, 5));
      const comuns = q.filter((w) => t.includes(w)).length;
      return { ...d, score: q.length ? comuns / q.length : 0 };
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

const tituloConversa = (m) => {
  const t = String(m || '').trim().replace(/\s+/g, ' ');
  return !t ? 'Nova conversa' : t.length > 48 ? t.slice(0, 48) + '…' : t;
};

const donoDa = (c, u) => u.role === 'admin' || c.usuario_email === u.email;

function conversaDe(id, u) {
  const c = carregar().conversas.find((x) => x._id === id);
  if (!c) throw erroApi('conversa não encontrada', { status: 404 });
  if (!donoDa(c, u)) throw erroApi('esta conversa pertence a outro perfil', { status: 403 });
  return c;
}

// ------------------------------------------------------------ rotas

const rotas = [];
/** `padrao` aceita `:param`. `opts.publica` dispensa sessão; `opts.permissao` exige permissão. */
function rota(metodo, padrao, fn, opts = {}) {
  const re = new RegExp('^' + padrao.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
  rotas.push({ metodo, re, fn, ...opts });
}

rota('GET', '/auth/demo-users', () => ({ demo: true, password: SENHA_DEMO, session_ttl_hours: 12, users: USUARIOS }), { publica: true });

rota('POST', '/auth/login', ({ json }) => {
  const email = String(json?.email || '').trim().toLowerCase();
  const u = USUARIOS.find((x) => x.email === email);
  if (!u || json?.password !== u.password) {
    auditar('Tentativa de login malsucedida', `e-mail: ${email || '(vazio)'}`);
    throw erroApi('e-mail ou senha inválidos', { status: 401, semLogin: true });
  }
  auditar('Login', `${u.name} entrou como ${u.roleLabel}`, u);
  return { token: PREFIXO_TOKEN + u.email, user: publico(u) };
}, { publica: true });

rota('GET', '/auth/me', ({ u }) => ({ user: publico(u) }));
rota('POST', '/auth/logout', ({ u }) => { auditar('Logout', `${u.name} saiu da plataforma`, u); return { ok: true }; });

rota('GET', '/health', () => {
  const b = carregar();
  return {
    ok: true,
    mock: true,
    mongo: { simulated: true, degraded: false, database: 'mock (navegador)', materiais: b.materiais.length, residuos: b.residuos.length },
    vector: { documents: b.materiais.length + b.residuos.length + b.politicas.length, vocabulary: 0 },
    llm: { provider: 'mock', model: 'mock', available: false, models: [] },
    admin: { reset: false },
  };
}, { publica: true });

rota('GET', '/empresa', () => carregar().empresa);
rota('GET', '/indicadores', () => carregar().indicadores);
rota('GET', '/politicas', () => carregar().politicas);

rota('GET', '/dashboard', () => {
  const { materiais, residuos, movimentacoes, indicadores } = carregar();
  const porCategoria = {};
  for (const r of residuos) porCategoria[r.categoria] = (porCategoria[r.categoria] || 0) + Number(r.quantidade_kg);
  return {
    indicadores,
    totais: {
      materiais: materiais.length,
      residuos: residuos.length,
      kg_residuos: residuos.reduce((s, r) => s + Number(r.quantidade_kg), 0),
      valor_estoque_brl: Number(materiais.reduce((s, m) => s + m.saldo * m.custo_unitario, 0).toFixed(2)),
      materiais_risco_alto: materiais.filter((m) => m.risco === 'Alto').length,
      residuos_perigosos: residuos.filter(ehPerigoso).length,
    },
    residuos_por_categoria: porCategoria,
    ultimas_movimentacoes: movimentacoes.slice(-5).reverse(),
  };
});

rota('GET', '/materiais', ({ query }) => {
  let rows = carregar().materiais;
  const cat = query.get('categoria');
  const q = query.get('q');
  if (cat) rows = rows.filter((r) => r.categoria.toLowerCase() === cat.toLowerCase());
  if (q) rows = rows.filter((r) => `${r.nome} ${r.codigo} ${r.descricao}`.toLowerCase().includes(q.toLowerCase()));
  return [...rows];
});

rota('POST', '/materiais', ({ json, u }) => {
  if (!json?.nome || !json?.categoria) throw erroApi('nome e categoria são obrigatórios', { status: 400 });
  const doc = inserir('materiais', {
    codigo: `INS-${String(carregar().materiais.length + 1).padStart(3, '0')}`,
    nome: json.nome, categoria: json.categoria, unidade: json.unidade || 'un', saldo: Number(json.saldo) || 0,
    custo_unitario: Number(json.custo_unitario) || 0, fornecedor: json.fornecedor || '',
    localizacao: json.localizacao || '', risco: json.risco || 'Baixo', descricao: json.descricao || '',
  });
  auditar('Cadastro de material', `Novo material ${doc.codigo} - ${doc.nome}`, u);
  return doc;
}, { permissao: 'materiais:write' });

rota('PUT', '/materiais/:id', ({ params, json, u }) => {
  const doc = carregar().materiais.find((m) => m._id === params.id);
  if (!doc) throw erroApi('material não encontrado', { status: 404 });
  for (const k of CAMPOS_MATERIAL) if (json?.[k] !== undefined) doc[k] = json[k];
  doc.updated_at = agora();
  auditar('Atualização de material', `${doc.codigo} atualizado`, u);
  return doc;
}, { permissao: 'materiais:write' });

rota('DELETE', '/materiais/:id', ({ params, u }) => {
  const lista = carregar().materiais;
  const i = lista.findIndex((m) => m._id === params.id);
  if (i === -1) throw erroApi('material não encontrado', { status: 404 });
  lista.splice(i, 1);
  auditar('Exclusão de material', `id ${params.id}`, u);
  return { ok: true };
}, { permissao: 'materiais:write' });

rota('GET', '/residuos', () => [...carregar().residuos]);

rota('POST', '/residuos', ({ json, u }) => {
  if (!json?.nome) throw erroApi('nome é obrigatório', { status: 400 });
  const doc = inserir('residuos', {
    nome: json.nome, categoria: json.categoria || 'Geral', quantidade_kg: Number(json.quantidade_kg) || 0,
    classe: json.classe || 'Não perigoso', destino_atual: json.destino_atual || 'Triagem pendente',
    gerado_em: agora().slice(0, 10), fornecedor_destino: json.fornecedor_destino || '',
  });
  auditar('Registro de resíduo', `${doc.nome} (${doc.quantidade_kg} kg)`, u);
  return doc;
}, { permissao: 'residuos:write' });

rota('GET', '/auditorias', () => carregar().auditorias.slice().reverse().slice(0, LIMITE_AUDITORIA));

rota('POST', '/rag/reindex', ({ u }) => {
  const b = carregar();
  const documents = b.materiais.length + b.residuos.length + b.politicas.length;
  auditar('Reindexação vetorial', `${documents} documentos (mock)`, u);
  return { ok: true, documents, vocabulary: 0 };
}, { permissao: 'rag:reindex' });

rota('GET', '/rag/search', ({ query }) => {
  const q = query.get('q');
  if (!q) throw erroApi('q é obrigatório', { status: 400 });
  return buscar(q, Math.min(Number(query.get('k')) || 4, 10)).map((d) => ({ collection: d.collection, score: d.score, text: d.texto, payload: d.payload }));
});

rota('GET', '/chats', ({ u }) => carregar().conversas
  .filter((c) => donoDa(c, u))
  .map((c) => ({ _id: c._id, titulo: c.titulo, mensagens: c.mensagens.length, created_at: c.created_at, updated_at: c.updated_at, usuario_nome: c.usuario_nome, usuario_email: c.usuario_email }))
  .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))));

rota('POST', '/chats', ({ json, u }) => inserir('conversas', {
  titulo: String(json?.titulo || 'Nova conversa').slice(0, 60), mensagens: [],
  usuario_email: u.email, usuario_nome: u.name, usuario_role: u.role,
}));

rota('GET', '/chats/:id', ({ params, u }) => conversaDe(params.id, u));

rota('DELETE', '/chats/:id', ({ params, u }) => {
  const c = conversaDe(params.id, u);
  const lista = carregar().conversas;
  lista.splice(lista.indexOf(c), 1);
  auditar('Exclusão de conversa', `"${c.titulo}"`, u);
  return { ok: true };
});

rota('POST', '/chat', ({ json, u }) => {
  const message = json?.message;
  if (!message || typeof message !== 'string') throw erroApi('message é obrigatório', { status: 400 });
  const hits = buscar(message, 4);
  const reply = hits.length
    ? `Modo demonstração (sem servidor). Documentos mais próximos da pergunta:\n\n${hits.map((h, i) => `${i + 1}. ${h.label} (${h.collection})`).join('\n')}`
    : 'Modo demonstração (sem servidor). Não encontrei documentos relacionados a essa pergunta.';
  const sources = hits.map((h) => ({ collection: h.collection, score: Number(h.score.toFixed(3)), label: h.label }));
  const meta = { source: 'mock', model: 'mock', latency_ms: latencia, sources };

  let c = json.chatId ? conversaDe(json.chatId, u) : null;
  const msgs = [{ role: 'user', content: message }, { role: 'assistant', content: reply, meta }];
  if (!c) {
    c = inserir('conversas', { titulo: tituloConversa(message), mensagens: msgs, usuario_email: u.email, usuario_nome: u.name, usuario_role: u.role });
  } else {
    c.mensagens.push(...msgs);
    if (c.titulo === 'Nova conversa') c.titulo = tituloConversa(message);
    c.updated_at = agora();
  }
  auditar('Consulta RAG', `"${message.slice(0, 80)}" (${hits.length} docs, mock)`, u);
  return { reply, source: 'mock', model: 'mock', latency_ms: latencia, chatId: c._id, sources };
}, { permissao: 'chat:use' });

rota('POST', '/estoque/analise', ({ u }) => {
  const { materiais, residuos, indicadores: ind } = carregar();
  const criticos = materiais.filter((m) => m.risco === 'Alto');
  const baixo = materiais.filter((m) => m.saldo < 100);
  const perigosos = residuos.filter(ehPerigoso);
  const report = `## Situação atual
${materiais.length} materiais em estoque e ${residuos.length} resíduos registrados. Taxa de reciclagem de ${ind.taxa_reciclagem_atual_pct}% para uma meta de ${ind.meta_zero_waste_pct}%.
## Riscos e alertas
- ${criticos.length} materiais de risco alto${criticos.length ? `: ${criticos.map((m) => m.nome).join(', ')}` : ''}
- ${baixo.length} materiais com saldo baixo
- ${perigosos.length} resíduos perigosos no período
## Recomendações
- Revisar a destinação dos resíduos perigosos com transportadora licenciada
- Repor os materiais com saldo baixo
## Impacto ambiental
${ind.co2_evitado_kg_mes} kg de CO₂ evitados por mês.

(Relatório gerado pelo modo mock, sem IA.)`;
  auditar('Análise de estoque', `Agente analisou ${materiais.length} materiais (mock)`, u);
  return {
    report, source: 'mock', model: 'mock', latency_ms: latencia,
    resumo: { materiais: materiais.length, risco_alto: criticos.length, saldo_baixo: baixo.length, residuos_perigosos: perigosos.length },
  };
}, { permissao: 'analise:run' });

rota('POST', '/reset', ({ u }) => {
  resetarMock();
  auditar('Restauração de dados', 'Dados de demonstração restaurados (mock)', u);
  persistir();
  return { ok: true };
}, { permissao: 'demo:reset' });

// ------------------------------------------------------------ transporte

/** @type {import('./transporte.js').Transporte} */
export const transporteMock = {
  async enviar({ metodo = 'GET', endpoint, json, token }) {
    if (latencia) await new Promise((r) => setTimeout(r, latencia));
    const [caminho, busca = ''] = endpoint.split('?');
    const query = new URLSearchParams(busca);

    for (const r of rotas) {
      if (r.metodo !== metodo) continue;
      const m = caminho.match(r.re);
      if (!m) continue;

      const u = usuarioDoToken(token);
      if (!r.publica && !u) throw erroApi('sessão inválida ou expirada - entre novamente', { status: 401, semLogin: true });
      if (r.permissao && !pode(u, r.permissao)) {
        throw erroApi(`seu perfil (${u.roleLabel}) não tem permissão para esta ação`, { status: 403 });
      }
      const resposta = r.fn({ params: m.groups || {}, query, json, u });
      persistir();
      return copia(resposta);
    }
    throw erroApi(`rota de API não encontrada: ${metodo} ${endpoint}`, { status: 404 });
  },
};
