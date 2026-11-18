# ReSource (A3)

Trabalho A3 da faculdade: plataforma de gestão Zero Waste com IA para a indústria fictícia EcoNova. Lê o banco legado (MongoDB Atlas), indexa os dados (TF-IDF) e responde perguntas com um agente de IA (Groq), com auditoria de tudo.

Nota no vault: `10_Projetos/ReSource-A3/README.md` · índice: `projetos["resource-a3"]`

## Comandos
- `npm install`
- `npm run dev` — servidor local em `http://localhost:3000` (reinicia ao salvar)
- `npm start` — servidor sem watch
- `npm run smoke` — teste ponta a ponta da API (precisa do servidor rodando)
- Deploy: Vercel, projeto `a3-mvp-resource-backend` (`vercel` / `vercel --prod`)

## Stack e estrutura
- Front: HTML, CSS e JS puros em `public/` (SPA; `apresentacao.html` são os slides)
- Back: Node 22 + Express em `backend/app.js`; na Vercel roda via `api/index.js`
- `backend/db.js` (MongoDB ou simulado em `data/db.json`), `backend/vectorstore.js` (TF-IDF), `backend/groq.js` (IA + fallback), `backend/auth.js` (perfis demo, sessão HMAC)
- Dados de exemplo: `data/seed.json`

## Variáveis de ambiente (só nomes)
Ficam em `.env` (local) e nas variáveis do projeto na Vercel. Modelo em `.env.example`.
- `MONGODB_URI`, `MONGODB_DB` — banco; sem URI usa o modo simulado
- `GROQ_API_KEY`, `GROQ_MODEL` — agente de IA; sem chave responde pelo fallback local
- `SESSION_SECRET`, `SESSION_TTL_HOURS` — sessão dos perfis demo
- `ADMIN_TOKEN` — protege `POST /api/reset`
- `RATE_LIMIT*`, `PORT`

## Não mexer sem perguntar
- `.env`, `.env.local` e qualquer chave
- `public/apresentacao.html` (slides da apresentação)
- Deploy em produção e variáveis da Vercel

## Regras do projeto
- O app é desacoplado da IA: rotas de dados nunca dependem de `groq.js`; chat e análise sempre têm fallback.
- Ollama foi removido em 2026-11-18; não reintroduzir.
- Perfis demo e permissões ficam em `backend/auth.js`; o front esconde ações conforme `permissions`.
