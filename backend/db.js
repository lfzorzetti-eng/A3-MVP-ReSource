/**
 * Simulação de MongoDB para o MVP ReSource
 * Representa o banco de dados legado de uma empresa de gestão de resíduos.
 * Persistência em arquivo JSON (mimic de coleções Mongo).
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const seed = require('../data/seed.json');

let db = null;

function load() {
  if (db) return db;
  try {
    if (fs.existsSync(DB_FILE)) {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      return db;
    }
  } catch (e) {
    console.warn('[db] Falha ao ler db.json, usando seed:', e.message);
  }
  db = JSON.parse(JSON.stringify(seed));
  persist();
  return db;
}

function persist() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.warn('[db] Falha ao persistir:', e.message);
  }
}

function collection(name) {
  const d = load();
  if (!d[name]) d[name] = [];
  return {
    find: (filter = {}) => d[name].filter((doc) => matches(doc, filter)),
    findOne: (filter = {}) => d[name].find((doc) => matches(doc, filter)) || null,
    insertOne: (doc) => {
      const now = new Date().toISOString();
      const newDoc = { _id: randomUUID(), created_at: now, updated_at: now, ...doc };
      d[name].push(newDoc);
      persist();
      return newDoc;
    },
    updateOne: (filter, update) => {
      const doc = d[name].find((x) => matches(x, filter));
      if (!doc) return null;
      Object.assign(doc, update.$set || update, { updated_at: new Date().toISOString() });
      persist();
      return doc;
    },
    deleteOne: (filter) => {
      const idx = d[name].findIndex((x) => matches(x, filter));
      if (idx === -1) return false;
      d[name].splice(idx, 1);
      persist();
      return true;
    },
    count: (filter = {}) => d[name].filter((doc) => matches(doc, filter)).length,
    all: () => [...d[name]],
  };
}

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

function reset() {
  db = JSON.parse(JSON.stringify(seed));
  persist();
  return db;
}

function stats() {
  const d = load();
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v]));
}

module.exports = { collection, load, persist, reset, stats };
