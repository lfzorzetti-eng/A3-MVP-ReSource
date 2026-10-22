/**
 * Camada de dados do ReSource MVP.
 *
 * Dois modos, mesma interface assíncrona (find/findOne/insertOne/updateOne/
 * deleteOne/count/all):
 *
 *  - MONGO (padrão em produção): usa o driver oficial `mongodb` apontando para
 *    o MongoDB Atlas (ou qualquer MongoDB via MONGODB_URI). O seed.json é
 *    aplicado apenas nas coleções vazias, de forma idempotente.
 *  - ARQUIVO (fallback local): mantém o simulador original em data/db.json,
 *    usado quando MONGODB_URI não está definido (dev local sem banco).
 *
 * O _id continua sendo string (m001, r001, UUID) para preservar as
 * referências entre coleções (movimentacoes.material_id) e as URLs do
 * frontend (/api/chats/:id).
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const seed = require('../data/seed.json');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const MONGO_URI = (process.env.MONGODB_URI || '').trim();
const MONGO_DB = (process.env.MONGODB_DB || 'resource_mvp').trim();

const COLLECTIONS = ['materiais', 'residuos', 'movimentacoes', 'politicas', 'auditorias', 'conversas'];
const CONFIG_KEYS = ['empresa', 'indicadores'];

let client = null;
let mongo = null;      // handle nativo do banco
let mem = null;        // cache do modo arquivo
let mode = 'arquivo';  // 'mongo' | 'arquivo'
let ready = false;
let degraded = false;  // MONGODB_URI definida mas o cluster não respondeu

// ---------------------------------------------------------------- utilidades

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Converte o filtro do simulador (strings case-insensitive, $in, $gte...) em filtro Mongo. */
function toMongoFilter(filter = {}) {
  const out = {};
  for (const [k, v] of Object.entries(filter || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const ops = {};
      if ('$in' in v) ops.$in = v.$in;
      if ('$gte' in v) ops.$gte = v.$gte;
      if ('$lte' in v) ops.$lte = v.$lte;
      if ('$regex' in v) ops.$regex = v.$regex;
      if ('$options' in v) ops.$options = v.$options;
      out[k] = Object.keys(ops).length ? ops : v;
    } else if (typeof v === 'string') {
      out[k] = { $regex: `^${escapeRegex(v)}$`, $options: 'i' };
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Equivalente do matches() original, usado apenas no modo arquivo. */
function matches(doc, filter) {
  return Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if ('$in' in v) return v.$in.includes(doc[k]);
      if ('$gte' in v) return doc[k] >= v.$gte;
      if ('$lte' in v) return doc[k] <= v.$lte;
      if ('$regex' in v) return new RegExp(v.$regex, v.$options || 'i').test(String(doc[k] || ''));
    }
    if (typeof v === 'string' && typeof doc[k] === 'string') {
      return doc[k].toLowerCase() === v.toLowerCase();
    }
    return doc[k] === v;
  });
}

// ------------------------------------------------------------- modo arquivo

function memLoad() {
  if (mem) return mem;
  try {
    if (fs.existsSync(DB_FILE)) {
      mem = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      return mem;
    }
  } catch (e) {
    console.warn('[db] Falha ao ler db.json, usando seed:', e.message);
  }
  mem = JSON.parse(JSON.stringify(seed));
  memPersist();
  return mem;
}

function memPersist() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(mem, null, 2));
  } catch (e) {
    console.warn('[db] Falha ao persistir:', e.message);
  }
}

function memCollection(name) {
  const d = memLoad();
  if (!d[name]) d[name] = [];
  return {
    find: async (filter = {}) => d[name].filter((doc) => matches(doc, filter)),
    findOne: async (filter = {}) => d[name].find((doc) => matches(doc, filter)) || null,
    insertOne: async (doc) => {
      const now = new Date().toISOString();
      const newDoc = { _id: randomUUID(), created_at: now, updated_at: now, ...doc };
      d[name].push(newDoc);
      memPersist();
      return newDoc;
    },
    updateOne: async (filter, update) => {
      const doc = d[name].find((x) => matches(x, filter));
      if (!doc) return null;
      Object.assign(doc, update.$set || update, { updated_at: new Date().toISOString() });
      memPersist();
      return doc;
    },
    deleteOne: async (filter) => {
      const idx = d[name].findIndex((x) => matches(x, filter));
      if (idx === -1) return false;
      d[name].splice(idx, 1);
      memPersist();
      return true;
    },
    count: async (filter = {}) => d[name].filter((doc) => matches(doc, filter)).length,
    all: async () => [...d[name]],
  };
}

// ---------------------------------------------------------------- modo mongo

function mongoCollection(name) {
  const coll = mongo.collection(name);
  return {
    find: async (filter = {}) => coll.find(toMongoFilter(filter)).toArray(),
    findOne: async (filter = {}) => coll.findOne(toMongoFilter(filter)),
    insertOne: async (doc) => {
      const now = new Date().toISOString();
      const newDoc = { _id: randomUUID(), created_at: now, updated_at: now, ...doc };
      await coll.insertOne(newDoc);
      return newDoc;
    },
    updateOne: async (filter, update) => {
      const set = { ...(update.$set || update), updated_at: new Date().toISOString() };
      const res = await coll.findOneAndUpdate(toMongoFilter(filter), { $set: set }, { returnDocument: 'after' });
      return res || null;
    },
    deleteOne: async (filter) => {
      const res = await coll.deleteOne(toMongoFilter(filter));
      return res.deletedCount > 0;
    },
    count: async (filter = {}) => coll.countDocuments(toMongoFilter(filter)),
    all: async () => coll.find({}).toArray(),
  };
}

/** Aplica o seed apenas nas coleções/configs ainda vazias (idempotente). */
async function mongoSeed() {
  for (const name of COLLECTIONS) {
    const docs = Array.isArray(seed[name]) ? seed[name] : [];
    if (!docs.length) continue;
    const coll = mongo.collection(name);
    const total = await coll.countDocuments({});
    if (total > 0) continue;
    await coll.insertMany(docs.map((d) => ({ ...d })));
    console.log(`[db] seed aplicado em ${name} (${docs.length} docs)`);
  }
  for (const key of CONFIG_KEYS) {
    if (!seed[key]) continue;
    await mongo.collection('config').updateOne(
      { _id: key },
      { $set: { value: seed[key] } },
      { upsert: true }
    );
  }
}

// -------------------------------------------------------------------- API

/**
 * Conecta (Mongo) ou carrega o arquivo. Idempotente.
 * Se o MONGODB_URI estiver definido mas o cluster não responder, tenta de novo
 * e, em último caso, cai no banco simulado para o site não sair do ar.
 */
async function init() {
  if (ready) return mode;
  if (MONGO_URI) {
    const { MongoClient } = require('mongodb');
    const tentativas = Number(process.env.MONGODB_RETRIES || 3);
    let ultimoErro = null;
    for (let i = 1; i <= tentativas; i++) {
      try {
        client = new MongoClient(MONGO_URI, {
          serverSelectionTimeoutMS: 8000,
          connectTimeoutMS: 8000,
          maxPoolSize: 5,
        });
        await client.connect();
        mongo = client.db(MONGO_DB);
        await mongoSeed();
        mode = 'mongo';
        degraded = false;
        ready = true;
        console.log(`[db] MongoDB conectado: ${MONGO_DB} (${MONGO_URI.replace(/\/\/([^@]+)@/, '//***@')})`);
        return mode;
      } catch (e) {
        ultimoErro = e;
        console.error(`[db] MongoDB indisponível (tentativa ${i}/${tentativas}): ${e.message}`);
        if (client) {
          await client.close().catch(() => {});
          client = null;
        }
        mongo = null;
        if (i < tentativas) await new Promise((r) => setTimeout(r, 2000));
      }
    }
    degraded = true;
    console.error(`[db] MONGODB_URI definida mas o MongoDB não respondeu (${ultimoErro && ultimoErro.message}) - usando o banco simulado`);
  }
  mode = 'arquivo';
  memLoad();
  ready = true;
  return mode;
}

function isMongo() {
  return mode === 'mongo';
}

/** true quando o MongoDB estava configurado mas não respondeu (modo degradado). */
function isDegraded() {
  return degraded;
}

function collection(name) {
  if (isMongo()) return mongoCollection(name);
  return memCollection(name);
}

/** Documento único de configuração (empresa, indicadores). */
async function config(key) {
  if (isMongo()) {
    const doc = await mongo.collection('config').findOne({ _id: key });
    return doc ? doc.value : null;
  }
  return memLoad()[key] || null;
}

async function stats() {
  if (isMongo()) {
    const out = {};
    for (const name of [...COLLECTIONS, 'config']) {
      out[name] = await mongo.collection(name).countDocuments({});
    }
    return out;
  }
  const d = memLoad();
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v]));
}

/** Restaura o estado inicial da demonstração. */
async function reset() {
  if (isMongo()) {
    for (const name of [...COLLECTIONS, 'config']) {
      await mongo.collection(name).deleteMany({});
    }
    await mongoSeed();
    return stats();
  }
  mem = JSON.parse(JSON.stringify(seed));
  memPersist();
  return stats();
}

async function close() {
  if (client) await client.close();
}

module.exports = { init, isMongo, isDegraded, collection, config, stats, reset, close, MONGO_URI, MONGO_DB };
