/**
 * Gera public/js/infrastructure/mock-dados.js a partir de data/seed.json e
 * dos perfis do back (backend/entities/perfis.js).
 *
 * O mock do front precisa dos mesmos dados do back, mas o navegador não lê
 * data/. Em vez de copiar à mão, este script gera o arquivo; o teste
 * test/front/mock.test.js falha se ele ficar desatualizado.
 *
 * Uso: npm run mock:dados
 */

const fs = require('fs');
const path = require('path');

const DESTINO = path.join(__dirname, '..', 'public', 'js', 'infrastructure', 'mock-dados.js');

function gerarConteudo() {
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seed.json'), 'utf8'));
  const { demoUsers, DEMO_PASSWORD } = require('../backend/entities/perfis');
  return `/** Gerado por scripts/gerar-mock.js. Não edite à mão: rode \`npm run mock:dados\`. */

export const SEED = ${JSON.stringify(seed, null, 2)};

export const USUARIOS = ${JSON.stringify(demoUsers(), null, 2)};

export const SENHA_DEMO = ${JSON.stringify(DEMO_PASSWORD)};
`;
}

if (require.main === module) {
  fs.writeFileSync(DESTINO, gerarConteudo());
  console.log(`[mock] gerado ${path.relative(process.cwd(), DESTINO)}`);
}

module.exports = { gerarConteudo, DESTINO };
