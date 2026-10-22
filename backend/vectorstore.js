/**
 * Banco vetorial simulado (mimic do Qdrant).
 * Gera embeddings TF-IDF locais dos documentos do MongoDB e indexa
 * em memória com busca por similaridade de cosseno (RAG).
 */

const db = require('./db');

let index = []; // { id, collection, text, vector, payload }
let vocab = new Map(); // term -> index
let idf = new Map();

const STOP = new Set(['de', 'da', 'do', 'e', 'a', 'o', 'em', 'para', 'com', 'por', 'que', 'um', 'uma', 'os', 'as', 'no', 'na', 'ao', 'à', 'dos', 'das', 'num', 'numa', 'qual', 'quais', 'quanto', 'quanta', 'sobre', 'esta', 'estao', 'está', 'the', 'of', 'and']);

/**
 * Stem simples (mascara plural/gênero) para query e docs convergirem:
 * plasticos->plastico, materiais->material, residuos->residuo,
 * movimentacoes->movimentacao, solventes->solvente.
 */
function stem(w) {
  if (w.length <= 4) return w;
  if (w.endsWith('oes') && w.length > 6) return w.slice(0, -3) + 'ao';
  if (w.endsWith('aes') && w.length > 5) return w.slice(0, -3) + 'ao';
  if (w.endsWith('ais') && w.length > 4) return w.slice(0, -3) + 'al';
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem);
}

function docToBOW(tokens) {
  const bow = new Map();
  for (const t of tokens) bow.set(t, (bow.get(t) || 0) + 1);
  return bow;
}

async function buildCorpus() {
  const docs = [];

  for (const m of await db.collection('materiais').all()) {
    docs.push({
      id: `material:${m._id}`,
      collection: 'materiais',
      text: [m.nome, m.codigo, m.categoria, m.descricao, m.fornecedor, m.localizacao, `risco ${m.risco}`, `saldo ${m.saldo} ${m.unidade}`].join(' | '),
      payload: m,
    });
  }
  for (const r of await db.collection('residuos').all()) {
    docs.push({
      id: `residuo:${r._id}`,
      collection: 'residuos',
      text: [r.nome, r.categoria, r.classe, `destino ${r.destino_atual}`, r.fornecedor_destino, `${r.quantidade_kg} kg`].join(' | '),
      payload: r,
    });
  }
  for (const p of await db.collection('politicas').all()) {
    docs.push({
      id: `politica:${p.id}`,
      collection: 'politicas',
      text: [p.titulo, p.texto].join(' | '),
      payload: p,
    });
  }
  for (const mv of await db.collection('movimentacoes').all()) {
    const mat = await db.collection('materiais').findOne({ _id: mv.material_id });
    docs.push({
      id: `mov:${mv._id}`,
      collection: 'movimentacoes',
      text: [mat?.nome || '', mv.motivo, mv.tipo, `${mv.quantidade} ${mv.unidade}`, mv.data].join(' | '),
      payload: mv,
    });
  }

  return docs;
}

async function rebuild() {
  const docs = await buildCorpus();
  vocab = new Map();
  const df = new Map();

  const bows = docs.map((d) => {
    const bow = docToBOW(tokenize(d.text));
    for (const t of bow.keys()) df.set(t, (df.get(t) || 0) + 1);
    return bow;
  });

  const N = docs.length || 1;
  idf = new Map();
  let i = 0;
  for (const t of df.keys()) {
    vocab.set(t, i++);
    idf.set(t, Math.log(1 + N / (1 + df.get(t))));
  }

  index = docs.map((d, idx) => {
    const bow = bows[idx];
    const vec = new Float32Array(vocab.size);
    let norm = 0;
    for (const [t, tf] of bow) {
      const vi = vocab.get(t);
      const w = (1 + Math.log(tf)) * (idf.get(t) || 0);
      vec[vi] = w;
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (let k = 0; k < vec.length; k++) vec[k] /= norm;
    return { id: d.id, collection: d.collection, text: d.text, payload: d.payload, vector: vec };
  });

  return { documents: index.length, vocabulary: vocab.size };
}

function embedQuery(text) {
  const bow = docToBOW(tokenize(text));
  const vec = new Float32Array(vocab.size);
  let norm = 0;
  for (const [t, tf] of bow) {
    const vi = vocab.get(t);
    if (vi === undefined) continue;
    const w = (1 + Math.log(tf)) * (idf.get(t) || 0);
    vec[vi] = w;
    norm += w * w;
  }
  norm = Math.sqrt(norm) || 1;
  for (let k = 0; k < vec.length; k++) vec[k] /= norm;
  return vec;
}

function cosine(a, b) {
  let s = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) s += a[i] * b[i];
  return s;
}

async function search(query, topK = 4, collectionFilter = null) {
  if (!index.length) await rebuild();
  const qv = embedQuery(query);
  const scored = index
    .filter((d) => !collectionFilter || d.collection === collectionFilter)
    .map((d) => ({ ...d, score: cosine(qv, d.vector) }))
    .filter((d) => d.score > 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return scored;
}

function stats() {
  const byCol = {};
  for (const d of index) byCol[d.collection] = (byCol[d.collection] || 0) + 1;
  return { documents: index.length, vocabulary: vocab.size, collections: byCol };
}

module.exports = { rebuild, search, stats };
