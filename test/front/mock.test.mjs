/** Back falso do front: mesmas rotas, sessão e permissões do back real. */

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { transporteMock, resetarMock } from '../../public/js/infrastructure/mock.js';

const require = createRequire(import.meta.url);
const enviar = (metodo, endpoint, json, token) => transporteMock.enviar({ metodo, endpoint, json, token });

async function entrar(email) {
  return (await enviar('POST', '/auth/login', { email, password: 'demo123' })).token;
}

test.beforeEach(() => resetarMock({ semLatencia: true }));

test('mock-dados.js está igual ao que o gerador produz', () => {
  const { gerarConteudo, DESTINO } = require('../../scripts/gerar-mock.js');
  assert.strictEqual(fs.readFileSync(DESTINO, 'utf8'), gerarConteudo(), 'rode: npm run mock:dados');
});

test('sem sessão: 401; senha errada: 401', async () => {
  await assert.rejects(enviar('GET', '/materiais'), (e) => e.status === 401 && e.semLogin);
  await assert.rejects(enviar('POST', '/auth/login', { email: 'gestor@econova.com', password: 'x' }), (e) => e.status === 401);
});

test('auditor não escreve material (403)', async () => {
  const t = await entrar('auditor@econova.com');
  await assert.rejects(enviar('POST', '/materiais', { nome: 'X', categoria: 'Papel' }, t), (e) => e.status === 403);
});

test('CRUD de material e filtro', async () => {
  const t = await entrar('estoque@econova.com');
  const antes = (await enviar('GET', '/materiais', undefined, t)).length;
  const m = await enviar('POST', '/materiais', { nome: 'Teste', categoria: 'Papel', saldo: '5' }, t);
  assert.strictEqual(m.saldo, 5);
  await enviar('PUT', `/materiais/${m._id}`, { saldo: 9 }, t);
  const achados = await enviar('GET', '/materiais?q=INS-013', undefined, t);
  assert.deepStrictEqual(achados.map((x) => [x._id, x.saldo]), [[m._id, 9]]);
  await enviar('DELETE', `/materiais/${m._id}`, undefined, t);
  assert.strictEqual((await enviar('GET', '/materiais', undefined, t)).length, antes);
  await assert.rejects(enviar('DELETE', `/materiais/${m._id}`, undefined, t), (e) => e.status === 404);
});

test('chat cria conversa que só o dono e o admin enxergam', async () => {
  const gestor = await entrar('gestor@econova.com');
  const auditor = await entrar('auditor@econova.com');
  const admin = await entrar('admin@econova.com');
  const r = await enviar('POST', '/chat', { message: 'destino do solvente perigoso' }, gestor);
  assert.strictEqual(r.source, 'mock');
  assert.ok(r.sources.length > 0);
  await assert.rejects(enviar('GET', `/chats/${r.chatId}`, undefined, auditor), (e) => e.status === 403);
  assert.strictEqual((await enviar('GET', '/chats', undefined, admin)).length, 1);
  assert.strictEqual((await enviar('GET', '/chats', undefined, auditor)).length, 0);
});

test('dashboard e análise usam os dados do seed', async () => {
  const t = await entrar('gestor@econova.com');
  const d = await enviar('GET', '/dashboard', undefined, t);
  assert.strictEqual(d.totais.materiais, 12);
  const a = await enviar('POST', '/estoque/analise', undefined, t);
  assert.match(a.report, /## Situação atual/);
});

test('reset volta ao seed', async () => {
  const t = await entrar('admin@econova.com');
  await enviar('POST', '/residuos', { nome: 'Extra' }, t);
  await enviar('POST', '/reset', undefined, t);
  assert.strictEqual((await enviar('GET', '/residuos', undefined, t)).length, 8);
});

test('rota inexistente: 404', async () => {
  await assert.rejects(enviar('GET', '/nada'), (e) => e.status === 404);
});
