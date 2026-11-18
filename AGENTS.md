# Instruções para agentes de IA

## Stack

- Node.js 22 (`engines`), Express 4, driver `mongodb` 6, `dotenv`, `cors`. CommonJS no back.
- Front: HTML, CSS e JavaScript puro com ES modules nativos (`<script type="module">`), sem build e sem framework.
- Deploy: Vercel (`vercel.json`): estáticos de `public/` pela CDN, `/api/*` na função `api/index.js`.

Não confie na memória para APIs de biblioteca: confira a versão no `package.json` e a documentação dessa versão.

## Comandos

```bash
npm install
npm run dev          # http://localhost:3000 (reinicia ao salvar)
npm test             # testes unitários + regra das camadas
npm run smoke        # API ponta a ponta (precisa de: npm i -D mongodb-memory-server --no-save)
npm run mock:dados   # regenera o mock do front depois de mudar data/seed.json ou os perfis
```

Front sem back: abra `/?api=mock`. Volte com `/?api=http`.

## Regras

- Siga as camadas de `ARCHITECTURE.md`. Tela nunca importa `infrastructure`; rota nunca tem regra.
- Rotas de dados nunca dependem de `infrastructure/groq.js`; chat e análise sempre têm fallback.
- Só `backend/infrastructure/config.js` lê `process.env`.
- Rota nova no back → recurso em `public/js/infrastructure/recursos/`, rota no `mock.js` e teste.
- Mudou `data/seed.json` ou `backend/entities/perfis.js` → `npm run mock:dados`.
- Código, nomes e textos em português; comentário explica o porquê.
- Nada de cor ou medida literal no JS/HTML: use classes e os tokens de `public/css/tema.css` (ver `docs/VISUAL.md`).
- Não mexer sem perguntar: `.env*`, `public/apresentacao.html`, deploy de produção e variáveis da Vercel.
- Antes de dizer que terminou: `npm test` verde. Se mexeu na API, rode também o `npm run smoke`.
