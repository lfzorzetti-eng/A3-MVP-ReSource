/** Funções puras do front: formatação, markdown, permissões e regras dos controllers. */

import test from 'node:test';
import assert from 'node:assert';
import { esc, renderMd, initials, riskTag } from '../../public/js/components/ui/index.js';
import { pode } from '../../public/js/entities/permissoes.js';
import { resumirSaude } from '../../public/js/controllers/status.js';
import { barras, nomeFonte } from '../../public/js/controllers/dashboard.js';
import { numeros } from '../../public/js/controllers/estoque.js';
import { qs } from '../../public/js/infrastructure/client.js';
import { mensagemErro, erroApi } from '../../public/js/infrastructure/erros.js';

test('esc escapa HTML', () => {
  assert.strictEqual(esc('<b a="1">&</b>'), '&lt;b a=&quot;1&quot;&gt;&amp;&lt;/b&gt;');
  assert.strictEqual(esc(null), '');
});

test('renderMd: títulos, negrito e listas, sem deixar HTML passar', () => {
  assert.strictEqual(renderMd('## Título\n**forte**\n- item'), '<h3>Título</h3>\n<strong>forte</strong>\n• item');
  assert.ok(!renderMd('<script>').includes('<script>'));
});

test('initials e riskTag', () => {
  assert.strictEqual(initials('Marina Alves'), 'MA');
  assert.strictEqual(initials(''), '??');
  assert.match(riskTag('Alto'), /class="tag high"/);
});

test('pode: * concede tudo', () => {
  assert.ok(pode({ permissions: ['*'] }, 'x'));
  assert.ok(!pode({ permissions: ['a'] }, 'b'));
  assert.ok(!pode(null, 'a'));
});

test('resumirSaude: Groq offline e modo mock', () => {
  const base = { mongo: { simulated: false, database: 'db', degraded: false, materiais: 3 }, vector: { documents: 4, vocabulary: 9 }, llm: { available: false, model: 'm' } };
  const s = resumirSaude(base);
  assert.strictEqual(s.llm.on, false);
  assert.match(s.banco.titulo, /MongoDB \(db\): materiais:3/);
  assert.match(resumirSaude({ ...base, mock: true }).llm.texto, /mock/);
});

test('barras relativas ao maior valor; nome da fonte', () => {
  assert.deepStrictEqual(barras({ A: 5, B: 10 }).map((b) => b.pct), [50, 100]);
  assert.deepStrictEqual(barras({}), []);
  assert.strictEqual(nomeFonte('groq', 'x'), 'Groq (x)');
  assert.strictEqual(nomeFonte('fallback'), 'fallback local');
});

test('numeros converte campos do formulário', () => {
  assert.deepStrictEqual(numeros({ saldo: '3.5', custo_unitario: '' , nome: 'a' }, ['saldo', 'custo_unitario']), { saldo: 3.5, custo_unitario: 0, nome: 'a' });
});

test('qs ignora vazios', () => {
  assert.strictEqual(qs({ q: 'pead', categoria: '' }), '?q=pead');
  assert.strictEqual(qs({}), '');
});

test('mensagemErro traduz falta de conexão', () => {
  assert.match(mensagemErro(erroApi('x', { offline: true })), /Sem conexão/);
  assert.strictEqual(mensagemErro(erroApi('falhou')), 'falhou');
  assert.strictEqual(mensagemErro(null, 'padrão'), 'padrão');
});
