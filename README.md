# ReSource — MVP (A3)

MVP web da plataforma **ReSource: Gestão Inteligente e Zero Waste com IA**, baseado nos checkpoints 1 e 2 da A3.

- **MongoDB**: o banco legado da empresa (EcoNova Indústria) — materiais, resíduos, movimentações, políticas e auditorias — com API estilo coleções (`find/insertOne/updateOne/deleteOne`). Em produção usa **MongoDB Atlas** (driver oficial); sem `MONGODB_URI` cai no simulador local em `data/db.json`.
- **Ollama como agente de IA**: consultor RAG e análise de estoque via `llama3.2` local ou **Ollama Cloud**, com fallback determinístico caso o Ollama esteja offline.
- **Banco vetorial simulado (mimic do Qdrant)**: embeddings TF-IDF locais + similaridade de cosseno para o RAG.

## Requisitos atendidos

| ID | Requisito | Onde |
|----|-----------|------|
| RF01 | Análise de estoque com agente IA | Dashboard → "Analisar com IA" (`POST /api/estoque/analise`) |
| RF02 | Vetorização: leitura do MongoDB e indexação | `POST /api/rag/reindex`, busca em `GET /api/rag/search` |
| RF03 | Consultor RAG (chat) | Aba "Agente IA" (`POST /api/chat`) |
| RF04 | Gestão de materiais (CRUD) | Aba "Estoque" |
| RF05 | Dashboard de indicadores | Aba "Dashboard" (`GET /api/dashboard`) |
| RF06 | Auditoria / rastreabilidade | Aba "Auditoria" (`GET /api/auditorias`) |
| RNF01 | Integração não invasiva | API apenas lê/simula o banco legado, não altera o modelo original |
| RNF02 | Resposta em até 3s | Busca vetorial é local (<50ms); latência do LLM exibida na UI |
| RNF03 | API Node.js desacoplada da IA | `app.js` não depende de `ollama.js` para dados; chat/análise degradam com fallback |
| RNF04 | Interface responsiva | CSS mobile-first |

## Como rodar (local)

```bash
npm install
npm start
```

Abra **http://localhost:3000**

Sem nenhuma variável de ambiente o app sobe com o **banco simulado em arquivo** (`data/db.json`) e o **Ollama local**. Para usar o MongoDB de verdade, exporte `MONGODB_URI` antes de `npm start` (copie `.env.example` para `.env` como referência).

```bash
npm run smoke   # sobe um MongoDB em memória e testa a API ponta a ponta
```

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `MONGODB_URI` | *(vazio)* | Conexão MongoDB (Atlas ou local). Vazio = banco simulado em `data/db.json` |
| `MONGODB_DB` | `resource_mvp` | Nome do banco |
| `OLLAMA_URL` | `http://localhost:11434` | `https://ollama.com` para usar o Ollama Cloud |
| `OLLAMA_MODEL` | `llama3.2` | Modelo (cloud usa sufixo `:cloud`, ex.: `gpt-oss:120b-cloud`) |
| `OLLAMA_API_KEY` | *(vazio)* | Obrigatório no Ollama Cloud (header `Authorization: Bearer`) |
| `ADMIN_TOKEN` | *(vazio)* | Se definido, `POST /api/reset` exige o header `x-admin-token` |
| `RATE_LIMIT` | `on` | `off` desliga o limite de requisições por IP |
| `RATE_LIMIT_CHAT` | `20` | Requisições de chat por IP/minuto |
| `RATE_LIMIT_ANALISE` | `10` | Requisições de análise por IP/minuto |
| `PORT` | `3000` | Porta do servidor local |

### Ollama (agente de IA)

```bash
ollama serve            # se não estiver rodando
ollama pull llama3.2    # modelo padrão
```

**No deploy público o Ollama local não é acessível** (a Vercel não roda Ollama), então o app aponta para o **Ollama Cloud**, que usa a mesma API:

```bash
export OLLAMA_URL=https://ollama.com
export OLLAMA_API_KEY=<sua chave em ollama.com>
export OLLAMA_MODEL=gpt-oss:120b-cloud   # veja os modelos disponíveis com:
curl https://ollama.com/api/tags -H "Authorization: Bearer $OLLAMA_API_KEY"
```

Sem Ollama (nem cloud) o site continua funcionando: o agente responde por um fallback local e a UI indica "Ollama offline".

## Estrutura

```
A3-MVP/
├── api/index.js        # entrypoint da serverless function do Vercel
├── backend/
│   ├── app.js           # API Express (RF01–RF06) - exporta o app
│   ├── server.js        # servidor local (sobe o app na porta PORT)
│   ├── db.js            # camada de dados: MongoDB (Atlas) ou simulado em arquivo
│   ├── vectorstore.js   # banco vetorial TF-IDF + cosseno (mimic Qdrant)
│   └── ollama.js        # cliente do agente IA (local ou cloud) + fallback
├── public/             # SPA estática (Dashboard, Estoque, Resíduos, Agente IA, Auditoria)
├── data/
│   ├── seed.json        # dados da empresa (12 materiais, 8 resíduos, políticas…)
│   └── db.json          # banco simulado local (gerado na 1ª execução, fora do git)
├── scripts/smoke-test.js
├── vercel.json
└── package.json
```

## Endpoints principais

- `GET /api/health` — status do banco (real ou simulado), índice vetorial e Ollama
- `GET|POST|PUT|DELETE /api/materiais` — CRUD de insumos (RF04)
- `GET|POST /api/residuos` — resíduos e destinos
- `GET /api/dashboard` — indicadores ambientais (RF05)
- `POST /api/chat` — consultor RAG (RF03): recupera contexto por similaridade → envia ao Ollama e persiste a conversa
- `GET|POST /api/chats` / `GET|DELETE /api/chats/:id` — histórico de conversas do Agente IA
- `POST /api/estoque/analise` — relatório executivo do agente (RF01)
- `POST /api/rag/reindex` / `GET /api/rag/search?q=` — vetorização (RF02)
- `GET /api/auditorias` — histórico do agente (RF06)
- `POST /api/reset` — restaura os dados de demonstração (exige `x-admin-token` se `ADMIN_TOKEN` estiver definido)

---

# Publicar no Vercel

## 1. MongoDB Atlas (grátis)

1. Crie uma conta em [cloud.mongodb.com](https://cloud.mongodb.com) e um cluster **M0 (free)**.
2. **Database Access** → crie um usuário (ex.: `resource`) com senha.
3. **Network Access** → allowlist `0.0.0.0/0` (o IP do Vercel é dinâmico).
4. Copie a **SRV string**: `mongodb+srv://resource:<senha>@<cluster>.mongodb.net`
5. O seed (`data/seed.json`) é aplicado automaticamente nas coleções vazias — é idempotente, então pode redeployar à vontade.

## 2. Variáveis de ambiente no projeto Vercel

Em **Project Settings → Environment Variables** (marque *Production*):

| Nome | Valor |
|---|---|
| `MONGODB_URI` | `mongodb+srv://resource:<senha>@<cluster>.mongodb.net` |
| `MONGODB_DB` | `resource_mvp` |
| `OLLAMA_URL` | `https://ollama.com` |
| `OLLAMA_API_KEY` | sua chave do Ollama Cloud |
| `OLLAMA_MODEL` | ex.: `gpt-oss:120b-cloud` |
| `ADMIN_TOKEN` | senha forte para proteger `POST /api/reset` |

## 3. Deploy

**Pela CLI:**

```bash
npm i -g vercel
vercel login
vercel link                       # cria/associa o projeto
vercel env add MONGODB_URI production
vercel env add OLLAMA_URL production
vercel env add OLLAMA_API_KEY production
vercel env add OLLAMA_MODEL production
vercel env add ADMIN_TOKEN production
vercel --prod
```

**Pelo GitHub (deploy automático a cada push):** importe o repositório no
[vercel.com/new](https://vercel.com/new) e cadastre as mesmas variáveis de ambiente.

## 4. Como fica a arquitetura

```
navegador ──► CDN da Vercel ──► /  (public/ estáticos)
                    │
                    └──► /api/* ──► serverless function (api/index.js → backend/app.js)
                                          │
                                          ├──► MongoDB Atlas (dados + conversas + auditoria)
                                          └──► Ollama Cloud (/api/chat, /api/tags)
```

O `vercel.json` faz o rewrite de `/api/*` para a função e serve `public/` pela CDN
(no Vercel o `express.static()` é ignorado). O MongoDB Atlas é obrigatório para
persistir: o filesystem da função é somente leitura.

## 5. Checklist pós-deploy

```bash
curl https://<seu-projeto>.vercel.app/api/health
```

- `mongo.simulated: false` → está usando o Atlas de verdade
- `ollama.available: true` → o agente de IA está respondendo com LLM
- cadastre um material, espere ~1 min (cold start) e recarregue → **os dados precisam continuar lá**
- `curl -X POST https://<seu-projeto>.vercel.app/api/reset` → deve responder **403** (token protegido)
- `curl -X POST https://<seu-projeto>.vercel.app/api/reset -H "x-admin-token: <ADMIN_TOKEN>"` → **200**
