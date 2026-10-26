/**
 * Smoke test da API do ReSource.
 *
 * Sobe um MongoDB em memória (mongodb-memory-server), conecta a API nele e
 * exercita os endpoints principais: health, CRUD de materiais, RAG, chat,
 * dashboard e reset (com e sem token de administrador).
 *
 * Uso: npm run smoke
 */

const assert = require('assert');

let MongoMemoryServer;
try {
  ({ MongoMemoryServer } = require('mongodb-memory-server'));
} catch {
  console.error('\n[smoke] Falta a dependência de teste. Instale sem salvar no package.json:\n');
  console.error('    npm i -D mongodb-memory-server --no-save\n');
  console.error('(ela fica fora do package.json de propósito: o postinstall baixa um binário');
  console.error(' do MongoDB e quebraria o build da Vercel)\n');
  process.exit(1);
}

const ADMIN_TOKEN = 'token-de-teste';

let base = '';
let reqs = 0;
let authToken = '';

async function call(method, path, body, headers = {}) {
  reqs++;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function main() {
  console.log('[smoke] iniciando MongoDB em memória...');
  const mongod = await MongoMemoryServer.create({ instance: { dbName: 'resource_mvp' } });
  process.env.MONGODB_URI = mongod.getUri();
  process.env.MONGODB_DB = 'resource_mvp';
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  console.log('[smoke] MONGODB_URI =', mongod.getUri());

  const { app, ready } = require('../backend/app');
  await ready;

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
  console.log('[smoke] API em', base);

  // ---- autenticação demo ----
  let r = await call('GET', '/api/materiais');
  assert.strictEqual(r.status, 401, 'API deve exigir sessão');
  r = await call('GET', '/api/auth/demo-users');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.users.length, 5, 'deveria ter 5 perfis demo');
  assert.ok(r.body.users.every((u) => u.email && u.password), 'perfis sem credenciais de demo');
  r = await call('POST', '/api/auth/login', { email: 'admin@econova.com', password: 'errada' });
  assert.strictEqual(r.status, 401, 'senha errada deveria falhar');
  r = await call('POST', '/api/auth/login', { email: 'admin@econova.com', password: 'demo123' });
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.token, 'login sem token');
  assert.strictEqual(r.body.user.role, 'admin');
  authToken = r.body.token;
  r = await call('GET', '/api/auth/me');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.user.email, 'admin@econova.com');
  console.log('  ok  login demo + sessão assinada');

  // ---- permissões por setor ----
  r = await call('POST', '/api/auth/login', { email: 'auditor@econova.com', password: 'demo123' });
  const auditorToken = r.body.token;
  r = await call('POST', '/api/materiais', { nome: 'Proibido', categoria: 'Plástico' }, { Authorization: `Bearer ${auditorToken}` });
  assert.strictEqual(r.status, 403, 'auditor não deveria escrever material');
  r = await call('POST', '/api/materiais', { nome: 'Proibido', categoria: 'Plástico' }, { Authorization: 'Bearer token-invalido' });
  assert.strictEqual(r.status, 401, 'token inválido deveria dar 401');
  console.log('  ok  permissões por perfil (auditor somente leitura)');

  // ---- isolamento de conversas ----
  r = await call('POST', '/api/auth/login', { email: 'gestor@econova.com', password: 'demo123' });
  const gestorToken = r.body.token;
  r = await call('POST', '/api/chats', { titulo: 'Teste de isolamento' }, { Authorization: `Bearer ${gestorToken}` });
  assert.strictEqual(r.status, 201);
  const chatId = r.body._id;
  assert.strictEqual(r.body.usuario_email, 'gestor@econova.com');
  r = await call('GET', `/api/chats/${chatId}`, null, { Authorization: `Bearer ${auditorToken}` });
  assert.strictEqual(r.status, 403, 'outro perfil não deveria abrir a conversa');
  r = await call('DELETE', `/api/chats/${chatId}`, null, { Authorization: `Bearer ${auditorToken}` });
  assert.strictEqual(r.status, 403, 'outro perfil não deveria excluir a conversa');
  r = await call('GET', '/api/chats');
  assert.ok(r.body.some((c) => c._id === chatId), 'admin deveria enxergar todas as conversas');
  assert.strictEqual(r.body.find((c) => c._id === chatId).usuario_email, 'gestor@econova.com');
  r = await call('DELETE', `/api/chats/${chatId}`, null, { Authorization: `Bearer ${gestorToken}` });
  assert.strictEqual(r.status, 200);
  r = await call('POST', '/api/auth/login', { email: 'admin@econova.com', password: 'demo123' });
  authToken = r.body.token;
  console.log('  ok  conversas isoladas por perfil (admin audita todas)');

  // ---- health ----
  r = await call('GET', '/api/health');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.mongo.simulated, false, 'deveria usar MongoDB real');
  assert.strictEqual(r.body.admin.reset, true);
  assert.ok(r.body.mongo.materiais > 0, 'seed de materiais aplicado');
  assert.ok(r.body.vector.documents > 0, 'índice vetorial populado');
  console.log('  ok  health - mongo real, seed aplicado, vetor populado');

  // ---- empresa / dashboard ----
  r = await call('GET', '/api/empresa');
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.nome, 'empresa sem nome');
  r = await call('GET', '/api/dashboard');
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.totais.materiais > 0);
  console.log('  ok  empresa + dashboard');

  // ---- CRUD de materiais (RF04) ----
  const antes = (await call('GET', '/api/materiais')).body.length;
  r = await call('POST', '/api/materiais', { nome: 'Material de teste', categoria: 'Plástico', saldo: 10, unidade: 'kg' });
  assert.strictEqual(r.status, 201);
  const id = r.body._id;
  assert.ok(id, 'material criado sem _id');
  r = await call('PUT', `/api/materiais/${id}`, { saldo: 42 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.saldo, 42);
  r = await call('GET', '/api/materiais');
  assert.strictEqual(r.body.length, antes + 1);
  console.log('  ok  CRUD de materiais (create/read/update)');

  // ---- a gravação realmente chega no MongoDB (não fica só em memória) ----
  {
    const { MongoClient } = require('mongodb');
    const cliente = new MongoClient(process.env.MONGODB_URI);
    await cliente.connect();
    const bruto = await cliente.db(process.env.MONGODB_DB).collection('materiais').findOne({ _id: id });
    await cliente.close();
    assert.ok(bruto, 'documento não encontrado diretamente no MongoDB');
    assert.strictEqual(bruto.saldo, 42, 'saldo não persistido no MongoDB');
    console.log('  ok  escrita confirmada no MongoDB');
  }

  // ---- busca vetorial (RF02) ----
  r = await call('GET', '/api/rag/search?q=solvente');
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.length > 0, 'busca vetorial sem resultados');
  console.log('  ok  busca vetorial');

  // ---- chat RAG (RF03) ----
  r = await call('POST', '/api/chat', { message: 'Qual o destino atual dos resíduos perigosos?' });
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.reply, 'chat sem resposta');
  assert.ok(r.body.chatId, 'chat sem id');
  console.log(`  ok  chat RAG (fonte: ${r.body.source}, ${r.body.latency_ms}ms)`);

  // ---- histórico de conversas ----
  r = await call('GET', '/api/chats');
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.length > 0, 'conversa não foi persistida');
  console.log('  ok  histórico de conversas persistido');

  // ---- auditoria (RF06) ----
  r = await call('GET', '/api/auditorias');
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.length > 0);
  console.log('  ok  auditoria');

  // ---- delete ----
  r = await call('DELETE', `/api/materiais/${id}`);
  assert.strictEqual(r.status, 200);
  r = await call('DELETE', `/api/materiais/${id}`);
  assert.strictEqual(r.status, 404, 'material inexistente deveria dar 404');
  console.log('  ok  delete de material');

  // ---- reset protegido ----
  r = await call('POST', '/api/reset', {});
  assert.strictEqual(r.status, 403, 'reset sem token deveria ser bloqueado');
  r = await call('POST', '/api/reset', {}, { 'x-admin-token': ADMIN_TOKEN });
  assert.strictEqual(r.status, 200, 'reset com token deveria passar');
  r = await call('GET', '/api/materiais');
  assert.strictEqual(r.body.length, antes, 'reset não restaurou o seed');
  console.log('  ok  reset protegido por token');

  server.close();
  await mongod.stop();
  await require('../backend/db').close();
  console.log(`\n[smoke] PASSOU - ${reqs} requisições verificadas`);
  process.exit(0);
}

main().catch(async (e) => {
  console.error('\n[smoke] FALHOU:', e.message);
  console.error(e.stack);
  process.exit(1);
});
