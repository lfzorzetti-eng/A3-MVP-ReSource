/**
 * Regra de dependência entre camadas (ARCHITECTURE.md). Lê os imports de cada
 * arquivo e falha se uma camada importar quem não pode.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

function arquivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return arquivos(p);
    return p.endsWith('.js') ? [p] : [];
  });
}

/** Caminhos importados/requeridos, resolvidos relativos à raiz do repositório. */
function importsDe(arquivo) {
  const src = fs.readFileSync(arquivo, 'utf8');
  const achados = [...src.matchAll(/(?:require\(|from\s+)['"](\.[^'"]+)['"]/g)].map((m) => m[1]);
  return achados.map((rel) => path.relative(RAIZ, path.resolve(path.dirname(arquivo), rel)));
}

/** Para cada pasta, as pastas que ela NÃO pode importar. */
function conferir(base, proibidos) {
  const erros = [];
  for (const [camada, nao] of Object.entries(proibidos)) {
    const dir = path.join(RAIZ, base, camada);
    if (!fs.existsSync(dir)) continue;
    for (const arq of arquivos(dir)) {
      for (const imp of importsDe(arq)) {
        if (nao.some((p) => imp.startsWith(path.join(base, p)))) {
          erros.push(`${path.relative(RAIZ, arq)} importa ${imp}`);
        }
      }
    }
  }
  return erros;
}

test('back: routes → controllers → infrastructure, sem voltar', () => {
  const erros = conferir('backend', {
    'routes': ['infrastructure/db', 'infrastructure/groq', 'infrastructure/vetores'],
    'controllers': ['routes'],
    'infrastructure': ['routes', 'controllers'],
    'entities': ['routes', 'controllers', 'infrastructure'],
  });
  assert.deepStrictEqual(erros, []);
});

test('front: telas não falam com a infrastructure; ui não conhece regra', () => {
  const erros = conferir('public/js', {
    'screens': ['infrastructure'],
    'controllers': ['screens', 'components'],
    'infrastructure': ['screens', 'controllers', 'components'],
    'components': ['controllers', 'infrastructure', 'screens'],
    'entities': ['screens', 'controllers', 'infrastructure', 'components'],
    'models': ['screens', 'controllers', 'infrastructure', 'components', 'entities'],
  });
  assert.deepStrictEqual(erros, []);
});
